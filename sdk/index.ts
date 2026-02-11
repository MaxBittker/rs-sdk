// Bot SDK - Standalone client for remote bot control
// Low-level WebSocket API that maps 1:1 to the action protocol
// Actions resolve when game ACKNOWLEDGES them (not when effects complete)

import type {
    BotWorldState,
    BotAction,
    ActionResult,
    SkillState,
    InventoryItem,
    NearbyNpc,
    NearbyLoc,
    GroundItem,
    DialogState,
    BankItem,
    SDKConfig,
    ConnectionState,
    SDKConnectionMode,
    BotStatus,
    PrayerState,
    PrayerName
} from './types';
import { PRAYER_INDICES, PRAYER_NAMES } from './types';
import * as pathfinding from './pathfinding';

/**
 * Derive the gateway WebSocket URL from a SERVER env value.
 * - undefined/empty → ws://localhost:7780 (local default)
 * - Full URL (ws:// or wss://) → used as-is
 * - "localhost" or "localhost:PORT" → ws://localhost:PORT (plain WS)
 * - anything else → wss://HOST/gateway (TLS, remote gateway path)
 */
export function deriveGatewayUrl(server?: string): string {
    if (!server) return 'ws://localhost:7780';
    if (server.startsWith('ws://') || server.startsWith('wss://')) return server;
    const isLocal = server === 'localhost' || server.startsWith('localhost:');
    if (isLocal) {
        return `ws://${server.includes(':') ? server : server + ':7780'}`;
    }
    return `wss://${server}/gateway`;
}

interface SyncToSDKMessage {
    type: 'sdk_connected' | 'sdk_state' | 'sdk_action_result' | 'sdk_error' | 'sdk_screenshot_response';
    success?: boolean;
    state?: BotWorldState;
    stateReceivedAt?: number;  // Timestamp when gateway received state from bot
    actionId?: string;
    result?: ActionResult;
    error?: string;
    screenshotId?: string;
    dataUrl?: string;
}

interface PendingAction {
    resolve: (result: ActionResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

interface PendingScreenshot {
    resolve: (dataUrl: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export class BotSDK {
    readonly config: Required<SDKConfig>;
    private ws: WebSocket | null = null;
    private state: BotWorldState | null = null;
    private stateReceivedAt: number = 0;
    private pendingActions = new Map<string, PendingAction>();
    private pendingScreenshots = new Map<string, PendingScreenshot>();
    private stateListeners = new Set<(state: BotWorldState) => void>();
    private connectionListeners = new Set<(state: ConnectionState, attempt?: number) => void>();
    private connectPromise: Promise<void> | null = null;
    private sdkClientId: string;

    // Reconnection state
    private connectionState: ConnectionState = 'disconnected';
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private intentionalDisconnect = false;

    constructor(config: SDKConfig) {
        this.config = {
            botUsername: config.botUsername,
            password: config.password || '',
            gatewayUrl: config.gatewayUrl || '',
            host: config.host || 'localhost',
            port: config.port || 7780,
            connectionMode: config.connectionMode || 'control',
            autoLaunchBrowser: config.autoLaunchBrowser ?? 'auto',
            freshDataThreshold: config.freshDataThreshold ?? 3000,
            browserLaunchUrl: config.browserLaunchUrl || '',
            browserLaunchTimeout: config.browserLaunchTimeout || 10000,
            actionTimeout: config.actionTimeout || 60000,
            autoReconnect: config.autoReconnect ?? true,
            reconnectMaxRetries: config.reconnectMaxRetries ?? Infinity,
            reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
            reconnectMaxDelay: config.reconnectMaxDelay ?? 30000,
            showChat: config.showChat ?? false
        };
        this.sdkClientId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // ============ Connection ============

    /** Connect to the gateway WebSocket. */
    async connect(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        if (this.connectPromise) {
            return this.connectPromise;
        }

        this.intentionalDisconnect = false;

        const isReconnect = this.connectionState === 'reconnecting';
        if (!isReconnect) {
            this.setConnectionState('connecting');
        }

        // Auto-launch browser based on config
        if (this.config.autoLaunchBrowser && !isReconnect) {
            try {
                const status = await this.checkBotStatus();
                const shouldLaunch = this.shouldLaunchBrowser(status);

                if (shouldLaunch) {
                    console.log(`[BotSDK] Launching browser...`);
                    await this.launchBrowser();
                    await this.waitForBotConnection();
                }
            } catch (error) {
                console.error(`[BotSDK] Auto-launch failed:`, error);
                // Continue anyway - maybe gateway is local and status endpoint doesn't work yet
            }
        }

        this.connectPromise = new Promise((resolve, reject) => {
            const url = this.config.gatewayUrl || `ws://${this.config.host}:${this.config.port}`;
            this.ws = new WebSocket(url);

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
                this.ws?.close();
            }, 10000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.send({
                    type: 'sdk_connect',
                    username: this.config.botUsername,
                    password: this.config.password,
                    clientId: this.sdkClientId,
                    mode: this.config.connectionMode
                });
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = () => {
                console.warn(`[LOGOUT DEBUG] SDK WebSocket closed - autoReconnect=${this.config.autoReconnect}, intentionalDisconnect=${this.intentionalDisconnect}`);
                this.connectPromise = null;
                this.ws = null;

                for (const [actionId, pending] of this.pendingActions) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error('Connection closed'));
                }
                this.pendingActions.clear();

                if (this.config.autoReconnect && !this.intentionalDisconnect) {
                    console.warn('[LOGOUT DEBUG] SDK scheduling auto-reconnect');
                    this.scheduleReconnect();
                } else {
                    this.setConnectionState('disconnected');
                }
            };

            this.ws.onerror = (error) => {
                console.warn('[LOGOUT DEBUG] SDK WebSocket error event');
                clearTimeout(timeout);
                reject(new Error('WebSocket error'));
            };

            const checkConnected = (event: MessageEvent) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'sdk_connected') {
                        this.ws?.removeEventListener('message', checkConnected);
                        this.reconnectAttempt = 0;
                        this.setConnectionState('connected');

                        // Automatically wait for game state to be ready
                        this.waitForReady(15000)
                            .then(() => {
                                console.log('[BotSDK] Connected and game state ready');
                                resolve();
                            })
                            .catch((error) => {
                                console.warn('[BotSDK] Connected but game state not ready:', error.message);
                                console.warn('[BotSDK] Continuing anyway - state may load later');
                                resolve(); // Still resolve - allow usage even if state isn't fully ready
                            });
                    } else if (msg.type === 'sdk_error') {
                        // Handle authentication errors during connection
                        clearTimeout(timeout);
                        this.ws?.removeEventListener('message', checkConnected);
                        const errorMessage = msg.error || 'Authentication failed';
                        console.error(`[BotSDK] Connection error: ${errorMessage}`);
                        // Disable auto-reconnect for auth failures - they won't succeed on retry
                        this.intentionalDisconnect = true;
                        reject(new Error(errorMessage));
                        this.ws?.close();
                    }
                } catch {}
            };
            this.ws.addEventListener('message', checkConnected);
        });

        return this.connectPromise;
    }

    private setConnectionState(state: ConnectionState, attempt?: number) {
        this.connectionState = state;
        for (const listener of this.connectionListeners) {
            try {
                listener(state, attempt);
            } catch (e) {
                console.error('Connection listener error:', e);
            }
        }
    }

    private scheduleReconnect() {
        if (this.reconnectAttempt >= this.config.reconnectMaxRetries) {
            console.log(`[BotSDK] Max reconnection attempts (${this.config.reconnectMaxRetries}) reached, giving up`);
            this.setConnectionState('disconnected');
            return;
        }

        this.reconnectAttempt++;
        this.setConnectionState('reconnecting', this.reconnectAttempt);

        const delay = Math.min(
            this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempt - 1),
            this.config.reconnectMaxDelay
        );

        console.log(`[BotSDK] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.connect();
                console.log(`[BotSDK] Reconnected successfully after ${this.reconnectAttempt} attempt(s)`);
            } catch (e) {
                console.log(`[BotSDK] Reconnection attempt ${this.reconnectAttempt} failed`);
            }
        }, delay);
    }

    /** Disconnect from the gateway. */
    async disconnect(): Promise<void> {
        this.intentionalDisconnect = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            // Wait for websocket to actually close
            await new Promise<void>((resolve) => {
                if (this.ws!.readyState === WebSocket.CLOSED) {
                    resolve();
                    return;
                }
                this.ws!.addEventListener('close', () => resolve(), { once: true });
                this.ws!.close();
            });
            this.ws = null;
        }
        this.connectPromise = null;
        this.reconnectAttempt = 0;
        this.setConnectionState('disconnected');
    }

    /** Check if WebSocket is connected. */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /** Get current connection state (connecting, connected, reconnecting, disconnected). */
    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    /** Get current reconnection attempt number. */
    getReconnectAttempt(): number {
        return this.reconnectAttempt;
    }

    onConnectionStateChange(listener: (state: ConnectionState, attempt?: number) => void): () => void {
        this.connectionListeners.add(listener);
        return () => this.connectionListeners.delete(listener);
    }

    /** Get connection mode (control or observe). */
    getConnectionMode(): SDKConnectionMode {
        return this.config.connectionMode;
    }

    // ============ Bot Status & Auto-Launch ============

    /**
     * Check bot status via gateway HTTP endpoint.
     * Returns info about whether bot is connected and who else is controlling/observing.
     */
    async checkBotStatus(): Promise<BotStatus> {
        const statusUrl = this.getStatusUrl();
        try {
            console.log(`[BotSDK] Checking bot status via URL: ${statusUrl}`);
            const response = await fetch(statusUrl);
            if (!response.ok) {
                console.log(`[BotSDK] Status check HTTP error: ${response.status} ${response.statusText} (URL: ${statusUrl})`);
                throw new Error(`Status check failed: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            // If endpoint doesn't exist or bot not found, return disconnected status
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`[BotSDK] Status check failed: ${errorMsg} (URL: ${statusUrl})`);
            return {
                status: 'dead',
                inGame: false,
                stateAge: null,
                controllers: [],
                observers: [],
                player: null,
            };
        }
    }

    /**
     * Check if bot is currently connected to gateway.
     */
    async isBotConnected(): Promise<boolean> {
        const status = await this.checkBotStatus();
        return status.status !== 'dead';
    }

    /**
     * Determine if browser should be launched based on config and current status.
     * - 'auto': Launch only if session is dead or stale
     * - true: Launch if bot not connected (dead)
     * - false: Never launch
     */
    private shouldLaunchBrowser(status: BotStatus): boolean {
        if (this.config.autoLaunchBrowser === false) {
            return false;
        }

        if (this.config.autoLaunchBrowser === true) {
            // Legacy behavior: launch if not connected
            if (status.status === 'dead') {
                console.log(`[BotSDK] Bot not connected`);
                return true;
            }
            console.log(`[BotSDK] Bot already connected (${status.controllers.length} controllers, ${status.observers.length} observers)`);
            return false;
        }

        // 'auto' mode: use session status to decide
        if (status.status === 'dead') {
            console.log(`[BotSDK] Bot session is dead`);
            return true;
        }

        if (status.status === 'stale') {
            console.log(`[BotSDK] Bot session is stale (no recent state updates)`);
            // Note: this will trigger graceful takeover via save_and_disconnect
            return true;
        }

        console.log(`[BotSDK] Active client detected, skipping browser launch`);
        return false;
    }

    /**
     * Launch native browser to client URL.
     * Uses platform-specific open command (open on macOS, start on Windows, xdg-open on Linux).
     */
    async launchBrowser(): Promise<void> {
        const url = this.buildClientUrl();
        console.log(`[BotSDK] Opening browser: ${url}`);

        const { exec } = await import('child_process');

        const command = process.platform === 'darwin'
            ? `open "${url}"`
            : process.platform === 'win32'
                ? `start "" "${url}"`
                : `xdg-open "${url}"`;

        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    reject(new Error(`Failed to open browser: ${error.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Wait for bot to connect to gateway after browser launch.
     */
    async waitForBotConnection(timeout?: number): Promise<void> {
        const timeoutMs = timeout || this.config.browserLaunchTimeout;
        const startTime = Date.now();
        const pollInterval = 500;
        let attemptCount = 0;

        console.log(`[BotSDK] Waiting for bot to connect and load game (timeout: ${timeoutMs}ms)...`);

        while (Date.now() - startTime < timeoutMs) {
            attemptCount++;
            const elapsed = Date.now() - startTime;
            const status = await this.checkBotStatus();

            console.log(`[BotSDK] Poll attempt ${attemptCount} (${elapsed}ms): status="${status.status}", inGame=${status.inGame}, controllers=${status.controllers.length}, observers=${status.observers.length}`);

            if (status.status !== 'dead' && status.inGame) {
                console.log(`[BotSDK] Bot connected and in-game!`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Bot did not fully load within ${timeoutMs}ms`);
    }

    private getStatusUrl(): string {
        const gatewayUrl = this.config.gatewayUrl || `http://${this.config.host}:${this.config.port}`;
        // Convert ws:// to http:// and wss:// to https://
        const httpUrl = gatewayUrl
            .replace(/^ws:/, 'http:')
            .replace(/^wss:/, 'https:')
            .replace(/\/gateway$/, '');  // Remove /gateway suffix if present

        return `${httpUrl}/status/${encodeURIComponent(this.config.botUsername)}`;
    }

    private buildClientUrl(): string {
        if (this.config.browserLaunchUrl) {
            const url = new URL(this.config.browserLaunchUrl);
            url.searchParams.set('bot', this.config.botUsername);
            url.searchParams.set('password', this.config.password);
            return url.toString();
        }

        // Derive from gateway URL
        const gatewayUrl = this.config.gatewayUrl || `ws://${this.config.host}:${this.config.port}`;

        if (gatewayUrl.includes('localhost') || gatewayUrl.includes('127.0.0.1')) {
            // Local development: assume client on port 8888
            return `http://localhost:8888/bot?bot=${encodeURIComponent(this.config.botUsername)}&password=${encodeURIComponent(this.config.password)}`;
        }

        // Remote: assume same host with /bot path
        const httpUrl = gatewayUrl
            .replace(/^ws:/, 'http:')
            .replace(/^wss:/, 'https:')
            .replace(/\/gateway$/, '');

        return `${httpUrl}/bot?bot=${encodeURIComponent(this.config.botUsername)}&password=${encodeURIComponent(this.config.password)}`;
    }

    /** Wait for WebSocket connection to be established. */
    async waitForConnection(timeout: number = 60000): Promise<void> {
        if (this.isConnected()) {
            return;
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error('waitForConnection timed out'));
            }, timeout);

            const unsubscribe = this.onConnectionStateChange((state) => {
                if (state === 'connected') {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve();
                } else if (state === 'disconnected') {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    reject(new Error('Connection failed'));
                }
            });
        });
    }

    // ============ State Access (Synchronous) ============

    /** Get current game state snapshot. */
    getState(): BotWorldState | null {
        return this.state;
    }

    /** Get timestamp when state was last received (ms since epoch) */
    getStateReceivedAt(): number {
        return this.stateReceivedAt;
    }

    /** Get age of current state in milliseconds */
    getStateAge(): number {
        if (this.stateReceivedAt === 0) return 0;
        return Date.now() - this.stateReceivedAt;
    }

    /** Get a skill by name (case-insensitive). */
    getSkill(name: string): SkillState | null {
        if (!this.state) return null;
        return this.state.skills.find(s =>
            s.name.toLowerCase() === name.toLowerCase()
        ) || null;
    }

    /** Get XP for a skill by name. */
    getSkillXp(name: string): number | null {
        const skill = this.getSkill(name);
        return skill?.experience ?? null;
    }

    /** Get all skills. */
    getSkills(): SkillState[] {
        return this.state?.skills || [];
    }

    /** Get inventory item by slot number. */
    getInventoryItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.inventory.find(i => i.slot === slot) || null;
    }

    /** Find inventory item by name pattern. */
    findInventoryItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.inventory.find(i => regex.test(i.name)) || null;
    }

    /** Get all inventory items. */
    getInventory(): InventoryItem[] {
        return this.state?.inventory || [];
    }

    /** Get equipment item by slot number. */
    getEquipmentItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.equipment.find(i => i.slot === slot) || null;
    }

    /** Find equipment item by name pattern. */
    findEquipmentItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.equipment.find(i => regex.test(i.name)) || null;
    }

    /** Get all equipped items. */
    getEquipment(): InventoryItem[] {
        return this.state?.equipment || [];
    }

    /** Get bank item by slot number (bank must be open). */
    getBankItem(slot: number): BankItem | null {
        if (!this.state?.bank.isOpen) return null;
        return this.state.bank.items.find(i => i.slot === slot) || null;
    }

    /** Find bank item by name pattern (bank must be open). */
    findBankItem(pattern: string | RegExp): BankItem | null {
        if (!this.state?.bank.isOpen) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.bank.items.find(i => regex.test(i.name)) || null;
    }

    /** Get all bank items (bank must be open). */
    getBankItems(): BankItem[] {
        return this.state?.bank.items || [];
    }

    /** Check if bank interface is open. */
    isBankOpen(): boolean {
        return this.state?.bank.isOpen || false;
    }

    /** Get NPC by index. */
    getNearbyNpc(index: number): NearbyNpc | null {
        if (!this.state) return null;
        return this.state.nearbyNpcs.find(n => n.index === index) || null;
    }

    /** Find NPC by name pattern. */
    findNearbyNpc(pattern: string | RegExp): NearbyNpc | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.nearbyNpcs.find(n => regex.test(n.name)) || null;
    }

    /** Get all nearby NPCs. */
    getNearbyNpcs(): NearbyNpc[] {
        return this.state?.nearbyNpcs || [];
    }

    /** Get location (object) by coordinates and ID. */
    getNearbyLoc(x: number, z: number, id: number): NearbyLoc | null {
        if (!this.state) return null;
        return this.state.nearbyLocs.find(l =>
            l.x === x && l.z === z && l.id === id
        ) || null;
    }

    /** Find location by name pattern. */
    findNearbyLoc(pattern: string | RegExp): NearbyLoc | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.nearbyLocs.find(l => regex.test(l.name)) || null;
    }

    /** Get all nearby locations (trees, rocks, etc). */
    getNearbyLocs(): NearbyLoc[] {
        return this.state?.nearbyLocs || [];
    }

    /** Find ground item by name pattern. */
    findGroundItem(pattern: string | RegExp): GroundItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.groundItems.find(i => regex.test(i.name)) || null;
    }

    /** Get all ground items. */
    getGroundItems(): GroundItem[] {
        return this.state?.groundItems || [];
    }

    /** Get current dialog state. */
    getDialog(): DialogState | null {
        return this.state?.dialog || null;
    }

    // ============ On-Demand Scanning ============
    // These methods scan the environment on-demand rather than relying on pushed state
    // Use these for expensive scans of nearby locations and ground items

    /**
     * Scan for nearby locations with custom radius.
     * @param radius - Scan radius in tiles (default 15)
     * @returns Array of nearby locations sorted by distance
     */
    async scanNearbyLocs(radius?: number): Promise<NearbyLoc[]> {
        const result = await this.sendAction({ type: 'scanNearbyLocs', radius, reason: 'SDK' });
        if (result.success && result.data) {
            return result.data as NearbyLoc[];
        }
        return [];
    }

    /**
     * Scan for ground items on-demand.
     * This is more efficient than constantly pushing this data in state updates.
     * @param radius - Scan radius in tiles (default 15)
     * @returns Array of ground items sorted by distance
     */
    async scanGroundItems(radius?: number): Promise<GroundItem[]> {
        const result = await this.sendAction({ type: 'scanGroundItems', radius, reason: 'SDK' });
        if (result.success && result.data) {
            return result.data as GroundItem[];
        }
        return [];
    }

    /**
     * Find a nearby location by name pattern (on-demand scan).
     * @param pattern - String or RegExp to match location name
     * @param radius - Scan radius in tiles (default 15)
     * @returns First matching location or null
     */
    async scanFindNearbyLoc(pattern: string | RegExp, radius?: number): Promise<NearbyLoc | null> {
        const locs = await this.scanNearbyLocs(radius);
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return locs.find(l => regex.test(l.name)) || null;
    }

    /**
     * Find a ground item by name pattern (on-demand scan).
     * @param pattern - String or RegExp to match item name
     * @param radius - Scan radius in tiles (default 15)
     * @returns First matching item or null
     */
    async scanFindGroundItem(pattern: string | RegExp, radius?: number): Promise<GroundItem | null> {
        const items = await this.scanGroundItems(radius);
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return items.find(i => regex.test(i.name)) || null;
    }

    // ============ State Subscriptions ============

    onStateUpdate(listener: (state: BotWorldState) => void): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    // ============ Plumbing: Raw Actions ============

    private async sendAction(action: BotAction): Promise<ActionResult> {
        if (this.connectionState === 'reconnecting') {
            console.log(`[BotSDK] Waiting for reconnection before sending action: ${action.type}`);
            await this.waitForConnection();
        }

        if (!this.isConnected()) {
            throw new Error(`Not connected (state: ${this.connectionState})`);
        }

        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingActions.delete(actionId);
                reject(new Error(`Action timed out: ${action.type}`));
            }, this.config.actionTimeout);

            this.pendingActions.set(actionId, { resolve, reject, timeout });

            this.send({
                type: 'sdk_action',
                username: this.config.botUsername,
                actionId,
                action
            });
        });
    }

    /** Send walk command to coordinates. */
    async sendWalk(x: number, z: number, running: boolean = true): Promise<ActionResult> {
        return this.sendAction({ type: 'walkTo', x, z, running, reason: 'SDK' });
    }

    /** Interact with a location (tree, rock, door, etc). */
    async sendInteractLoc(x: number, z: number, locId: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'interactLoc', x, z, locId, optionIndex: option, reason: 'SDK' });
    }

    /** Interact with an NPC by index and option. */
    async sendInteractNpc(npcIndex: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'interactNpc', npcIndex, optionIndex: option, reason: 'SDK' });
    }

    /** Talk to an NPC by index. */
    async sendTalkToNpc(npcIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'talkToNpc', npcIndex, reason: 'SDK' });
    }

    /** Pick up a ground item. */
    async sendPickup(x: number, z: number, itemId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'pickupItem', x, z, itemId, reason: 'SDK' });
    }

    /** Use an inventory item (eat, equip, etc). */
    async sendUseItem(slot: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'useInventoryItem', slot, optionIndex: option, reason: 'SDK' });
    }

    /** Use an equipped item (remove, operate, etc). */
    async sendUseEquipmentItem(slot: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'useEquipmentItem', slot, optionIndex: option, reason: 'SDK' });
    }

    /** Drop an inventory item. */
    async sendDropItem(slot: number): Promise<ActionResult> {
        return this.sendAction({ type: 'dropItem', slot, reason: 'SDK' });
    }

    /** Use one inventory item on another. */
    async sendUseItemOnItem(sourceSlot: number, targetSlot: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnItem', sourceSlot, targetSlot, reason: 'SDK' });
    }

    /** Use an inventory item on a location. */
    async sendUseItemOnLoc(itemSlot: number, x: number, z: number, locId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnLoc', itemSlot, x, z, locId, reason: 'SDK' });
    }

    /** Use an inventory item on an NPC. */
    async sendUseItemOnNpc(itemSlot: number, npcIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnNpc', itemSlot, npcIndex, reason: 'SDK' });
    }

    /** Click a dialog option by index. */
    async sendClickDialog(option: number = 0): Promise<ActionResult> {
        return this.sendAction({ type: 'clickDialogOption', optionIndex: option, reason: 'SDK' });
    }

    /** Click a component using IF_BUTTON packet - for simple buttons, spellcasting, etc. */
    async sendClickComponent(componentId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponent', componentId, reason: 'SDK' });
    }

    /** Click a component using INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.) */
    async sendClickComponentWithOption(componentId: number, optionIndex: number = 1, slot: number = 0): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponentWithOption', componentId, optionIndex, slot, reason: 'SDK' });
    }

    /** Click an interface option by index. Convenience wrapper that looks up componentId from state. */
    async sendClickInterfaceOption(optionIndex: number): Promise<ActionResult> {
        const state = this.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'No interface open' };
        }

        const options = state.interface.options;
        if (optionIndex < 0 || optionIndex >= options.length) {
            return { success: false, message: `Invalid option index ${optionIndex}, interface has ${options.length} options` };
        }

        const option = options[optionIndex];
        if (!option) {
            return { success: false, message: `Option ${optionIndex} not found` };
        }

        return this.sendClickComponent(option.componentId);
    }

    /** Accept character design in tutorial. */
    async sendAcceptCharacterDesign(): Promise<ActionResult> {
        return this.sendAction({ type: 'acceptCharacterDesign', reason: 'SDK' });
    }

    /** Randomize character appearance in tutorial. */
    async sendRandomizeCharacterDesign(): Promise<ActionResult> {
        return this.sendAction({ type: 'randomizeCharacterDesign', reason: 'SDK' });
    }

    /** Buy from shop by slot and amount. */
    async sendShopBuy(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'shopBuy', slot, amount, reason: 'SDK' });
    }

    /** Sell to shop by slot and amount. */
    async sendShopSell(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'shopSell', slot, amount, reason: 'SDK' });
    }

    /** Close shop interface. */
    async sendCloseShop(): Promise<ActionResult> {
        return this.sendAction({ type: 'closeShop', reason: 'SDK' });
    }

    /** Close any modal interface. */
    async sendCloseModal(): Promise<ActionResult> {
        return this.sendAction({ type: 'closeModal', reason: 'SDK' });
    }

    /** Set combat style (0-3). */
    async sendSetCombatStyle(style: number): Promise<ActionResult> {
        return this.sendAction({ type: 'setCombatStyle', style, reason: 'SDK' });
    }

    // ============ Prayer ============

    /** Toggle a prayer on or off by name or index (0-14). */
    async sendTogglePrayer(prayer: PrayerName | number): Promise<ActionResult> {
        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index > 14) {
            return { success: false, message: `Invalid prayer: ${prayer}` };
        }
        return this.sendAction({ type: 'togglePrayer', prayerIndex: index, reason: 'SDK' });
    }

    /** Get current prayer state from world state. */
    getPrayerState(): PrayerState | null {
        return this.state?.prayers || null;
    }

    /** Check if a specific prayer is currently active. */
    isPrayerActive(prayer: PrayerName | number): boolean {
        const prayerState = this.state?.prayers;
        if (!prayerState) return false;
        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index >= prayerState.activePrayers.length) return false;
        return !!prayerState.activePrayers[index];
    }

    /** Get list of all currently active prayer names. */
    getActivePrayers(): PrayerName[] {
        const prayerState = this.state?.prayers;
        if (!prayerState) return [];
        return prayerState.activePrayers
            .map((active, i) => active ? PRAYER_NAMES[i] : null)
            .filter((name): name is PrayerName => name !== null);
    }

    /** Cast spell on NPC using spell component ID. */
    async sendSpellOnNpc(npcIndex: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnNpc', npcIndex, spellComponent, reason: 'SDK' });
    }

    /** Cast spell on inventory item. */
    async sendSpellOnItem(slot: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnItem', slot, spellComponent, reason: 'SDK' });
    }

    /** Switch to a UI tab by index. */
    async sendSetTab(tabIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'setTab', tabIndex, reason: 'SDK' });
    }

    /** Send a chat message. */
    async sendSay(message: string): Promise<ActionResult> {
        return this.sendAction({ type: 'say', message, reason: 'SDK' });
    }

    /** Wait for specified number of game ticks. */
    async sendWait(ticks: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'wait', ticks, reason: 'SDK' });
    }

    /** Deposit item to bank by slot. */
    async sendBankDeposit(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'bankDeposit', slot, amount, reason: 'SDK' });
    }

    /** Withdraw item from bank by slot. */
    async sendBankWithdraw(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'bankWithdraw', slot, amount, reason: 'SDK' });
    }

    // ============ Screenshot ============

    /**
     * Request a screenshot from the bot client.
     * Returns the screenshot as a data URL (data:image/png;base64,...).
     * @param timeout - Timeout in milliseconds (default 10000)
     */
    async sendScreenshot(timeout: number = 10000): Promise<string> {
        if (this.connectionState === 'reconnecting') {
            console.log(`[BotSDK] Waiting for reconnection before requesting screenshot`);
            await this.waitForConnection();
        }

        if (!this.isConnected()) {
            throw new Error(`Not connected (state: ${this.connectionState})`);
        }

        const screenshotId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.pendingScreenshots.delete(screenshotId);
                reject(new Error('Screenshot request timed out'));
            }, timeout);

            this.pendingScreenshots.set(screenshotId, { resolve, reject, timeout: timeoutHandle });

            this.send({
                type: 'sdk_screenshot_request',
                username: this.config.botUsername,
                screenshotId
            });
        });
    }

    // ============ Local Pathfinding ============

    /** Find path to destination using local collision data. */
    findPath(
        destX: number,
        destZ: number,
        maxWaypoints: number = 500
    ): { success: boolean; waypoints: Array<{ x: number; z: number; level: number }>; reachedDestination?: boolean; error?: string } {
        const state = this.getState();
        if (!state?.player) {
            return { success: false, waypoints: [], error: 'No player state available' };
        }

        const { worldX: srcX, worldZ: srcZ, level } = state.player;

        // Only require source zone to be allocated - we need to know where we ARE
        // Destination zone may be unallocated (e.g., past a gate we haven't opened yet)
        // The pathfinder will find a partial path to the edge of known areas
        if (!pathfinding.isZoneAllocated(level, srcX, srcZ)) {
            return { success: false, waypoints: [], error: 'Source zone not allocated (no collision data for current position)' };
        }

        const destZoneAllocated = pathfinding.isZoneAllocated(level, destX, destZ);

        // 2048x2048 BFS grid handles any in-game distance in a single call.
        const waypoints = pathfinding.findLongPath(level, srcX, srcZ, destX, destZ, maxWaypoints);

        // If no waypoints and destination zone isn't allocated, that's expected -
        // we just can't path there yet (might need to open a door first)
        if (waypoints.length === 0 && !destZoneAllocated) {
            // Return success with empty waypoints - caller should try raw walking toward destination
            return { success: true, waypoints: [], reachedDestination: false, error: 'Destination zone not allocated - try walking toward it' };
        }
        const lastWaypoint = waypoints[waypoints.length - 1];
        const reachedDestination = lastWaypoint !== undefined &&
            lastWaypoint.x === destX &&
            lastWaypoint.z === destZ;

        return { success: true, waypoints, reachedDestination };
    }

    /** Find path to destination (async alias for findPath). */
    async sendFindPath(
        destX: number,
        destZ: number,
        maxWaypoints: number = 500
    ): Promise<{ success: boolean; waypoints: Array<{ x: number; z: number; level: number }>; reachedDestination?: boolean; error?: string }> {
        return this.findPath(destX, destZ, maxWaypoints);
    }

    // ============ Plumbing: State Waiting ============

    /**
     * Wait for game state to be fully loaded and ready.
     * Ensures player position is valid (not 0,0), bot is in-game, and state is recent.
     *
     * @param timeout - Maximum time to wait in milliseconds (default: 15000)
     * @returns Promise that resolves when state is ready
     * @throws Error if timeout is reached
     *
     * @example
     * ```ts
     * await sdk.waitForReady();
     * // Now safe to access player position, NPCs, etc.
     * ```
     */
    async waitForReady(timeout: number = 15000): Promise<BotWorldState> {
        console.log('[BotSDK] Waiting for game state to be ready...');

        try {
            const state = await this.waitForCondition(s => {
                const validPosition = !!(s.player && s.player.worldX !== 0 && s.player.worldZ !== 0);
                const inGame = s.inGame;
                const hasEntities = s.nearbyNpcs.length > 0 || s.nearbyLocs.length > 0 || s.groundItems.length > 0;

                // Log progress for debugging
                if (!validPosition) {
                    console.log(`[BotSDK] Waiting - invalid position: (${s.player?.worldX}, ${s.player?.worldZ})`);
                } else if (!inGame) {
                    console.log('[BotSDK] Waiting - not in game');
                } else if (!hasEntities) {
                    console.log('[BotSDK] Waiting - no entities loaded yet');
                }

                return inGame && validPosition && hasEntities;
            }, timeout);

            console.log('[BotSDK] Game state ready!');
            return state;
        } catch (error) {
            console.error('[BotSDK] Timeout waiting for game state to be ready');
            throw new Error('Game state not ready within timeout');
        }
    }

    async waitForCondition(
        predicate: (state: BotWorldState) => boolean,
        timeout: number = 30000
    ): Promise<BotWorldState> {
        if (this.state && predicate(this.state)) {
            return this.state;
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error('waitForCondition timed out'));
            }, timeout);

            const unsubscribe = this.onStateUpdate((state) => {
                if (predicate(state)) {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve(state);
                }
            });
        });
    }

    /** Wait for next state update from server. */
    async waitForStateChange(timeout: number = 30000): Promise<BotWorldState> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error('waitForStateChange timed out'));
            }, timeout);

            const unsubscribe = this.onStateUpdate((state) => {
                clearTimeout(timeoutId);
                unsubscribe();
                resolve(state);
            });
        });
    }

    /**
     * Wait for a specific number of server ticks (~300ms each).
     *
     * @param ticks - Number of server ticks to wait
     * @returns The state after waiting
     */
    async waitForTicks(ticks: number = 1): Promise<BotWorldState> {
        if (!this.state) {
            throw new Error('waitForTicks: no state available');
        }

        if (ticks <= 0) {
            return this.state;
        }

        const startTick = this.state.tick;
        const targetTick = startTick + ticks;

        return new Promise((resolve, reject) => {
            // Safety timeout: ticks * 1s + 5s buffer (server tick is ~300ms, so 1s is generous)
            const safetyTimeout = setTimeout(() => {
                unsubscribe();
                reject(new Error(`waitForTicks(${ticks}) safety timeout - no state updates received`));
            }, ticks * 1000 + 5000);

            const unsubscribe = this.onStateUpdate((state) => {
                if (state.tick >= targetTick) {
                    clearTimeout(safetyTimeout);
                    unsubscribe();
                    resolve(state);
                }
            });
        });
    }

    /**
     * Wait for the next state update from the server.
     * This is the most common waiting pattern - ensures fresh data after an action.
     *
     * State updates arrive once per server tick (~300ms) when PLAYER_INFO is received.
     *
     * @example
     * ```ts
     * await sdk.sendClickDialog(0);
     * await sdk.waitForStateUpdate();  // Wait for server to confirm
     * ```
     *
     * @returns The new state after the update
     */
    async waitForStateUpdate(): Promise<BotWorldState> {
        return this.waitForStateChange(5000);
    }



    // ============ Internal ============

    private send(message: object) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    private handleMessage(data: string) {
        let message: SyncToSDKMessage;
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }

        if (message.type === 'sdk_state' && message.state) {
            // Filter out player chat messages unless showChat is enabled
            // Type 2 = public chat, Type 3 = private message received
            if (!this.config.showChat && message.state.gameMessages) {
                message.state.gameMessages = message.state.gameMessages.filter(
                    msg => msg.type !== 2 && msg.type !== 3
                );
            }

            this.state = message.state;
            // Use server timestamp if available, otherwise use local time
            this.stateReceivedAt = message.stateReceivedAt || Date.now();
            for (const listener of this.stateListeners) {
                try {
                    listener(message.state);
                } catch (e) {
                    console.error('State listener error:', e);
                }
            }
        }

        if (message.type === 'sdk_action_result' && message.actionId) {
            const pending = this.pendingActions.get(message.actionId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingActions.delete(message.actionId);
                if (message.result) {
                    pending.resolve(message.result);
                } else {
                    pending.reject(new Error('No result in action response'));
                }
            }
        }

        if (message.type === 'sdk_error') {
            if (message.actionId) {
                const pending = this.pendingActions.get(message.actionId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingActions.delete(message.actionId);
                    pending.reject(new Error(message.error || 'Unknown error'));
                }
            }
            if (message.screenshotId) {
                const pending = this.pendingScreenshots.get(message.screenshotId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingScreenshots.delete(message.screenshotId);
                    pending.reject(new Error(message.error || 'Screenshot error'));
                }
            }
        }

        if (message.type === 'sdk_screenshot_response' && message.dataUrl) {
            // Try to find by screenshotId first, then fall back to any pending
            let pending: PendingScreenshot | undefined;
            if (message.screenshotId) {
                pending = this.pendingScreenshots.get(message.screenshotId);
                if (pending) {
                    this.pendingScreenshots.delete(message.screenshotId);
                }
            }
            // If no screenshotId or not found, resolve the first pending screenshot
            if (!pending && this.pendingScreenshots.size > 0) {
                const entry = this.pendingScreenshots.entries().next().value;
                if (entry) {
                    const [firstId, firstPending] = entry;
                    pending = firstPending;
                    this.pendingScreenshots.delete(firstId);
                }
            }

            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(message.dataUrl);
            }
        }
    }
}

// Re-export types for convenience
export * from './types';
