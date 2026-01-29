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
    SDKConfig,
    ConnectionState
} from './types';
import * as pathfinding from './pathfinding';

interface SyncToSDKMessage {
    type: 'sdk_connected' | 'sdk_state' | 'sdk_action_result' | 'sdk_error' | 'sdk_screenshot_response';
    success?: boolean;
    state?: BotWorldState;
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
            gatewayUrl: config.gatewayUrl || '',
            host: config.host || 'localhost',
            port: config.port || 7780,
            actionTimeout: config.actionTimeout || 30000,
            autoReconnect: config.autoReconnect ?? true,
            reconnectMaxRetries: config.reconnectMaxRetries ?? Infinity,
            reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
            reconnectMaxDelay: config.reconnectMaxDelay ?? 30000
        };
        this.sdkClientId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Initialize pathfinding on first SDK creation
        pathfinding.initPathfinding();
    }

    // ============ Connection ============

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
                    clientId: this.sdkClientId
                });
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = () => {
                this.connectPromise = null;
                this.ws = null;

                for (const [actionId, pending] of this.pendingActions) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error('Connection closed'));
                }
                this.pendingActions.clear();

                if (this.config.autoReconnect && !this.intentionalDisconnect) {
                    this.scheduleReconnect();
                } else {
                    this.setConnectionState('disconnected');
                }
            };

            this.ws.onerror = (error) => {
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
                        resolve();
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

    async disconnect(): Promise<void> {
        this.intentionalDisconnect = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectPromise = null;
        this.reconnectAttempt = 0;
        this.setConnectionState('disconnected');
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    getReconnectAttempt(): number {
        return this.reconnectAttempt;
    }

    onConnectionStateChange(listener: (state: ConnectionState, attempt?: number) => void): () => void {
        this.connectionListeners.add(listener);
        return () => this.connectionListeners.delete(listener);
    }

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

    getState(): BotWorldState | null {
        return this.state;
    }

    getSkill(name: string): SkillState | null {
        if (!this.state) return null;
        return this.state.skills.find(s =>
            s.name.toLowerCase() === name.toLowerCase()
        ) || null;
    }

    getSkillXp(name: string): number | null {
        const skill = this.getSkill(name);
        return skill?.experience ?? null;
    }

    getSkills(): SkillState[] {
        return this.state?.skills || [];
    }

    getInventoryItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.inventory.find(i => i.slot === slot) || null;
    }

    findInventoryItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.inventory.find(i => regex.test(i.name)) || null;
    }

    getInventory(): InventoryItem[] {
        return this.state?.inventory || [];
    }

    getEquipmentItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.equipment.find(i => i.slot === slot) || null;
    }

    findEquipmentItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.equipment.find(i => regex.test(i.name)) || null;
    }

    getEquipment(): InventoryItem[] {
        return this.state?.equipment || [];
    }

    getNearbyNpc(index: number): NearbyNpc | null {
        if (!this.state) return null;
        return this.state.nearbyNpcs.find(n => n.index === index) || null;
    }

    findNearbyNpc(pattern: string | RegExp): NearbyNpc | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.nearbyNpcs.find(n => regex.test(n.name)) || null;
    }

    getNearbyNpcs(): NearbyNpc[] {
        return this.state?.nearbyNpcs || [];
    }

    getNearbyLoc(x: number, z: number, id: number): NearbyLoc | null {
        if (!this.state) return null;
        return this.state.nearbyLocs.find(l =>
            l.x === x && l.z === z && l.id === id
        ) || null;
    }

    findNearbyLoc(pattern: string | RegExp): NearbyLoc | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.nearbyLocs.find(l => regex.test(l.name)) || null;
    }

    getNearbyLocs(): NearbyLoc[] {
        return this.state?.nearbyLocs || [];
    }

    findGroundItem(pattern: string | RegExp): GroundItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.groundItems.find(i => regex.test(i.name)) || null;
    }

    getGroundItems(): GroundItem[] {
        return this.state?.groundItems || [];
    }

    getDialog(): DialogState | null {
        return this.state?.dialog || null;
    }

    // ============ On-Demand Scanning ============
    // These methods scan the environment on-demand rather than relying on pushed state
    // Use these for expensive scans of nearby locations and ground items

    /**
     * Scan for nearby locations (trees, rocks, doors, etc.) on-demand.
     * This is more efficient than constantly pushing this data in state updates.
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

    async sendWalk(x: number, z: number, running: boolean = true): Promise<ActionResult> {
        return this.sendAction({ type: 'walkTo', x, z, running, reason: 'SDK' });
    }

    async sendInteractLoc(x: number, z: number, locId: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'interactLoc', x, z, locId, optionIndex: option, reason: 'SDK' });
    }

    async sendInteractNpc(npcIndex: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'interactNpc', npcIndex, optionIndex: option, reason: 'SDK' });
    }

    async sendTalkToNpc(npcIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'talkToNpc', npcIndex, reason: 'SDK' });
    }

    async sendPickup(x: number, z: number, itemId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'pickupItem', x, z, itemId, reason: 'SDK' });
    }

    async sendUseItem(slot: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'useInventoryItem', slot, optionIndex: option, reason: 'SDK' });
    }

    async sendUseEquipmentItem(slot: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'useEquipmentItem', slot, optionIndex: option, reason: 'SDK' });
    }

    async sendDropItem(slot: number): Promise<ActionResult> {
        return this.sendAction({ type: 'dropItem', slot, reason: 'SDK' });
    }

    async sendUseItemOnItem(sourceSlot: number, targetSlot: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnItem', sourceSlot, targetSlot, reason: 'SDK' });
    }

    async sendUseItemOnLoc(itemSlot: number, x: number, z: number, locId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnLoc', itemSlot, x, z, locId, reason: 'SDK' });
    }

    async sendClickDialog(option: number = 0): Promise<ActionResult> {
        return this.sendAction({ type: 'clickDialogOption', optionIndex: option, reason: 'SDK' });
    }

    /** Click a component using IF_BUTTON packet - for simple buttons, spellcasting, etc. */
    async sendClickComponent(componentId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponent', componentId, reason: 'SDK' });
    }

    /** Click a component using INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.) */
    async sendClickComponentWithOption(componentId: number, optionIndex: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponentWithOption', componentId, optionIndex, reason: 'SDK' });
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

    async sendAcceptCharacterDesign(): Promise<ActionResult> {
        return this.sendAction({ type: 'acceptCharacterDesign', reason: 'SDK' });
    }

    async sendShopBuy(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'shopBuy', slot, amount, reason: 'SDK' });
    }

    async sendShopSell(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'shopSell', slot, amount, reason: 'SDK' });
    }

    async sendCloseShop(): Promise<ActionResult> {
        return this.sendAction({ type: 'closeShop', reason: 'SDK' });
    }

    async sendCloseModal(): Promise<ActionResult> {
        return this.sendAction({ type: 'closeModal', reason: 'SDK' });
    }

    async sendSetCombatStyle(style: number): Promise<ActionResult> {
        return this.sendAction({ type: 'setCombatStyle', style, reason: 'SDK' });
    }

    async sendSpellOnNpc(npcIndex: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnNpc', npcIndex, spellComponent, reason: 'SDK' });
    }

    async sendSpellOnItem(slot: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnItem', slot, spellComponent, reason: 'SDK' });
    }

    async sendSetTab(tabIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'setTab', tabIndex, reason: 'SDK' });
    }

    async sendSay(message: string): Promise<ActionResult> {
        return this.sendAction({ type: 'say', message, reason: 'SDK' });
    }

    async sendWait(ticks: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'wait', ticks, reason: 'SDK' });
    }

    async sendBankDeposit(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'bankDeposit', slot, amount, reason: 'SDK' });
    }

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

        // Check if zones are allocated
        if (!pathfinding.isZoneAllocated(level, srcX, srcZ) || !pathfinding.isZoneAllocated(level, destX, destZ)) {
            return { success: false, waypoints: [], error: 'Zone not allocated (no collision data)' };
        }

        const waypoints = pathfinding.findLongPath(level, srcX, srcZ, destX, destZ, maxWaypoints);
        const lastWaypoint = waypoints[waypoints.length - 1];
        const reachedDestination = lastWaypoint !== undefined &&
            lastWaypoint.x === destX &&
            lastWaypoint.z === destZ;

        return { success: true, waypoints, reachedDestination };
    }

    // Alias for backwards compatibility
    async sendFindPath(
        destX: number,
        destZ: number,
        maxWaypoints: number = 500
    ): Promise<{ success: boolean; waypoints: Array<{ x: number; z: number; level: number }>; reachedDestination?: boolean; error?: string }> {
        return this.findPath(destX, destZ, maxWaypoints);
    }

    // ============ Plumbing: State Waiting ============

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
            this.state = message.state;
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
