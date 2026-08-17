// Bot SDK - Standalone client for remote bot control
// Low-level WebSocket API that maps 1:1 to the action protocol
// Raw actions resolve when the browser validates/routes and dispatches them.
// Use BotActions when the caller needs observation of the resulting game effect.

import type {
    BotWorldState,
    BotAction,
    ActionResult,
    SkillState,
    InventoryItem,
    NearbyNpc,
    NearbyPlayer,
    NearbyLoc,
    GroundItem,
    DialogState,
    BankItem,
    SDKConfig,
    ConnectionState,
    SDKConnectionMode,
    BotStatus,
    PrayerState,
    PrayerName,
    GameMessage,
    FindOptions
} from './types';
import type { TradeState } from './types';
import { PRAYER_INDICES, PRAYER_NAMES, PLAYER_CHAT_TYPES, isPlayerChat, TRADE_REQUEST_CHAT_TYPE } from './types';
import { ChatHistory } from './chat-history';
import * as pathfinding from './pathfinding';
import { resolveInterfaceOption, shortestNameMatch, type InterfaceOptionSelector } from './action-quantity';

/**
 * Apply {@link FindOptions} to a find* winner. `shortestNameMatch` already
 * prefers a reachable match; `{reachable: true}` turns an unreachable-only
 * result into null instead, so callers get "nothing usable" rather than a
 * target whose interaction would fail with a silent `cant_reach`.
 */
// Player trade interface components (see server/webclient/src/bot/types.ts
// for the full trademain/tradeconfirm component map).
const TRADE_SIDE_INV_ID = 3322;     // tradeside:inv - INV_BUTTON = Offer 1/5/10/All/X
const TRADE_MAIN_INV_ID = 3415;     // trademain:inv - INV_BUTTON = Remove 1/5/10/All/X
const TRADE_MAIN_ACCEPT_ID = 3420;  // trademain:accept
const TRADE_CONFIRM_ACCEPT_ID = 3546; // tradeconfirm:accept

function applyFindOptions<T extends { reachable?: boolean }>(match: T | null, options?: FindOptions): T | null {
    if (options?.reachable === true && match?.reachable === false) return null;
    return match;
}

function selectorLabel(selector: InterfaceOptionSelector): string {
    if (typeof selector === 'string') return `"${selector}"`;
    if (selector instanceof RegExp) return String(selector);
    return `option "${selector.text}"`;
}

/**
 * Derive the gateway WebSocket URL from a SERVER env value.
 * - undefined/empty → ws://localhost:7780 (local default)
 * - Full URL (ws:// or wss://) → used as-is
 * - "localhost" or "localhost:PORT" → ws://localhost:PORT (plain WS)
 * - anything else → wss://HOST/gateway (TLS, remote gateway path)
 */
export function deriveGatewayUrl(server?: string): string {
    // GATEWAY_URL overrides derivation for hosts where SERVER doubles as the
    // web origin but not the gateway (e.g. SERVER=localhost:8888 is the engine
    // web port; the gateway is ws://localhost:7780). The lite runner honors
    // the same variable.
    if (typeof process !== 'undefined' && process.env?.GATEWAY_URL) return process.env.GATEWAY_URL;
    if (!server) return 'ws://localhost:7780';
    if (server.startsWith('ws://') || server.startsWith('wss://')) return server;
    const isLocal = server === 'localhost' || server.startsWith('localhost:');
    if (isLocal) {
        return `ws://${server.includes(':') ? server : server + ':7780'}`;
    }
    return `wss://${server}/gateway`;
}

interface SyncToSDKMessage {
    type: 'sdk_connected' | 'sdk_state' | 'sdk_action_result' | 'sdk_error' | 'sdk_screenshot_response' | 'sdk_info';
    success?: boolean;
    state?: BotWorldState;
    stateReceivedAt?: number;  // Timestamp when gateway received state from bot
    actionId?: string;
    result?: ActionResult;
    error?: string;
    screenshotId?: string;
    dataUrl?: string;
    maxMessageLength?: number;  // Server-configured chat cap (in sdk_connected / sdk_info)
}

interface PendingAction {
    resolve: (result: ActionResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

/**
 * A dispatch that never produced a result: the browser client didn't answer in
 * time, the socket closed mid-flight, or the gateway reported an error.
 * sendAction converts these into failed ActionResults so a single dropped
 * action reports itself instead of killing the caller's script.
 */
class ActionDispatchError extends Error {
    constructor(message: string, readonly reason: 'timeout' | 'disconnected' | 'error') {
        super(message);
        this.name = 'ActionDispatchError';
    }
}

interface PendingScreenshot {
    resolve: (dataUrl: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

// Chat chunking lives in ./chunking so the gateway can share it without
// importing the full SDK; re-exported here for existing consumers and tests.
export { chunkMessage } from './chunking';
import { chunkMessage } from './chunking';

export class BotSDK {
    readonly config: Required<SDKConfig>;
    private ws: WebSocket | null = null;
    private state: BotWorldState | null = null;
    private stateReceivedAt: number = 0;
    /**
     * Server-configured max chat length, learned from the gateway handshake
     * (sdk_connected / sdk_info). Defaults to the RS wire limit until known.
     */
    private serverMaxMessageLength: number = 80;
    /**
     * Chat accumulated across state syncs. The client ring only holds 100
     * messages (and each sync only carries 50), so without this an agent could
     * never read further back than ~50 lines. See sdk/chat-history.ts.
     */
    private chatHistory = new ChatHistory();
    /** Cursor consumed by getNewChat(): value of chatHistory.seen at last read. */
    private chatReadCursor: number = 0;
    private pendingActions = new Map<string, PendingAction>();
    private pendingScreenshots = new Map<string, PendingScreenshot>();
    private stateListeners = new Set<(state: BotWorldState) => void>();
    private connectionListeners = new Set<(state: ConnectionState, attempt?: number) => void>();
    private connectPromise: Promise<void> | null = null;
    private sdkClientId: string;
    private temporaryDoorBlocks = new pathfinding.TemporaryDoorBlocklist();

    /** True once the gateway has accepted our credentials (sdk_connected received). */
    private authenticated = false;

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
            readyTimeout: config.readyTimeout ?? 15000,
            connectTimeout: config.connectTimeout ?? 30000,
            actionTimeout: config.actionTimeout || 60000,
            autoReconnect: config.autoReconnect ?? true,
            reconnectMaxRetries: config.reconnectMaxRetries ?? Infinity,
            reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
            reconnectMaxDelay: config.reconnectMaxDelay ?? 30000,
            showChat: config.showChat ?? true
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

            // One deadline for the whole handshake - socket open AND the
            // gateway's sdk_connected/sdk_error answer. The old timer was
            // cleared on socket open, so a gateway that accepted the socket
            // but never answered (dead session, half-open TCP during an
            // outage) parked connect() forever with every liveness signal
            // reading healthy (bug report mscll1sc). Sized above the
            // gateway's own 15s auth bound so a slow-but-alive login server
            // doesn't false-negative.
            let handshakeDone = false;
            const deadline = setTimeout(() => {
                reject(new Error(`Gateway handshake timed out after ${this.config.connectTimeout}ms`));
                this.ws?.close();
            }, this.config.connectTimeout);

            this.ws.onopen = () => {
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
                // A close before the handshake completed must settle the
                // pending connect() - otherwise its awaiters hang forever
                // while the auto-reconnect below builds a fresh promise.
                if (!handshakeDone) {
                    clearTimeout(deadline);
                    reject(new Error('Connection closed before the gateway handshake completed'));
                }
                this.connectPromise = null;
                this.ws = null;
                this.authenticated = false;

                for (const [actionId, pending] of this.pendingActions) {
                    clearTimeout(pending.timeout);
                    pending.reject(new ActionDispatchError('Connection closed', 'disconnected'));
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
                clearTimeout(deadline);
                reject(new Error('WebSocket error'));
            };

            const checkConnected = (event: MessageEvent) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'sdk_connected') {
                        handshakeDone = true;
                        clearTimeout(deadline);
                        this.ws?.removeEventListener('message', checkConnected);
                        this.reconnectAttempt = 0;
                        this.authenticated = true;
                        if (typeof msg.maxMessageLength === 'number' && msg.maxMessageLength > 0) {
                            this.serverMaxMessageLength = msg.maxMessageLength;
                        }
                        this.setConnectionState('connected');

                        // Gateway accepted us. Anything that goes wrong past this point is a
                        // game-state problem, not a connection problem.
                        const readyTimeout = this.config.readyTimeout;
                        if (readyTimeout <= 0) {
                            // Caller opted to wait for state itself.
                            resolve();
                            return;
                        }

                        // Automatically wait for game state to be ready
                        this.waitForReady(readyTimeout)
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
                        handshakeDone = true;
                        clearTimeout(deadline);
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

    /**
     * Check if the gateway has accepted our credentials.
     * True means the transport and auth are both fine - if state is still missing after
     * this, the problem is that no game client is logged in, not the connection.
     */
    isAuthenticated(): boolean {
        return this.authenticated && this.isConnected();
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
     * Uses the `open` package for cross-platform support (macOS, Windows, Linux, WSL).
     * Falls back to printing the URL if no browser can be opened.
     */
    async launchBrowser(): Promise<void> {
        const url = this.buildClientUrl();
        console.log(`[BotSDK] Opening browser: ${url}`);

        try {
            const open = (await import('open')).default;
            await open(url);
        } catch (e) {
            console.warn(`[BotSDK] Could not open browser automatically.`);
            console.warn(`[BotSDK] Open this URL manually: ${url}`);
        }
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

    /**
     * Read recent chat messages. Returns player chat (public + PMs) by default,
     * newest last. Reads from the SDK's accumulated history — up to 500
     * messages retained since connect — so old lines survive both system spam
     * (level-ups, combat) and the client's own 100-deep ring eviction.
     *
     * @param opts.limit Max messages to return (default 20; pass 0 for the full history).
     * @param opts.types Chat type codes to include (default player chat: 1/2/3/6/7). Pass e.g. `[0]` for system messages.
     * @param opts.includeSelf Include your own messages (default false).
     */
    getChat(opts: { limit?: number; types?: readonly number[]; includeSelf?: boolean } = {}): GameMessage[] {
        const { limit = 20, types = PLAYER_CHAT_TYPES, includeSelf = false } = opts;
        const typeSet = new Set(types);
        const filtered = this.chatHistory.all().filter(m =>
            typeSet.has(m.type) && (includeSelf || !m.fromSelf)
        );
        return limit > 0 ? filtered.slice(-limit) : filtered;
    }

    /**
     * Read only chat messages that have arrived since the last call (cursor-based,
     * newest last). Repeat polls never re-show the same message — no need to
     * hand-roll a baseline. The first call returns everything seen since
     * connect. Excludes your own messages by default.
     *
     * @param opts.types Chat type codes to include (default player chat: 1/2/3/6/7).
     * @param opts.includeSelf Include your own messages (default false).
     */
    getNewChat(opts: { types?: readonly number[]; includeSelf?: boolean } = {}): GameMessage[] {
        const { types = PLAYER_CHAT_TYPES, includeSelf = false } = opts;
        const typeSet = new Set(types);

        // Advance the cursor past everything recorded so far (including system
        // lines) so the next call only sees genuinely newer messages.
        const prev = this.chatReadCursor;
        this.chatReadCursor = this.chatHistory.seen;

        return this.chatHistory.since(prev).filter(m =>
            typeSet.has(m.type) && (includeSelf || !m.fromSelf)
        );
    }

    /**
     * Read recent chat from a specific sender (case-insensitive, substring match
     * on name), newest last, from the accumulated history. Handy for "what did
     * my partner say?" without regex-matching the sender field yourself.
     *
     * @param name Sender name (or substring) to match.
     * @param opts.limit Max messages to return (default 20; pass 0 for all).
     */
    getChatFrom(name: string, opts: { limit?: number } = {}): GameMessage[] {
        const { limit = 20 } = opts;
        const needle = name.toLowerCase();
        const filtered = this.chatHistory.all().filter(m =>
            m.sender !== '' && m.sender.toLowerCase().includes(needle)
        );
        return limit > 0 ? filtered.slice(-limit) : filtered;
    }

    /**
     * Wait for the next chat message matching the given filters (messages
     * arriving after this call; your own messages are excluded by default).
     * The easy way to coordinate two bots: `sdk.say('ready'); const reply =
     * await sdk.waitForChat({ from: 'partner', timeout: 60000 });`
     *
     * @param opts.from Only accept this sender (case-insensitive substring).
     * @param opts.matching Only accept messages whose text matches this pattern.
     * @param opts.types Chat type codes to accept (default player chat: 1/2/3/6/7).
     * @param opts.includeSelf Accept your own messages (default false).
     * @param opts.timeout Ms to wait before returning null (default 30000).
     * @returns The first matching message, or null on timeout.
     */
    async waitForChat(opts: {
        from?: string;
        matching?: RegExp | string;
        types?: readonly number[];
        includeSelf?: boolean;
        timeout?: number;
    } = {}): Promise<GameMessage | null> {
        const { from, matching, types = PLAYER_CHAT_TYPES, includeSelf = false, timeout = 30000 } = opts;
        const typeSet = new Set(types);
        const needle = from?.toLowerCase();
        const pattern = typeof matching === 'string' ? new RegExp(matching, 'i') : matching;
        const accepts = (m: GameMessage) =>
            typeSet.has(m.type) &&
            (includeSelf || !m.fromSelf) &&
            (!needle || m.sender.toLowerCase().includes(needle)) &&
            (!pattern || pattern.test(m.text));

        // Private cursor starting "now" — does not consume getNewChat's cursor.
        let cursor = this.chatHistory.seen;

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                resolve(null);
            }, timeout);

            const unsubscribe = this.onStateUpdate(() => {
                const fresh = this.chatHistory.since(cursor);
                cursor = this.chatHistory.seen;
                const match = fresh.find(accepts);
                if (match) {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve(match);
                }
            });
        });
    }

    /** Get a skill by name (case-insensitive; "hp"/"hitpoint" alias Hitpoints). */
    getSkill(name: string): SkillState | null {
        if (!this.state) return null;
        const requested = name.trim().toLowerCase();
        const normalized = /^(hp|hitpoint|hitpoints)$/.test(requested) ? 'hitpoints' : requested;
        return this.state.skills.find(s => s.name.toLowerCase() === normalized) || null;
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

    /** Find inventory item by name pattern (shortest matching name wins). */
    findInventoryItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        return shortestNameMatch(this.state.inventory, pattern);
    }

    /** Get all inventory items. */
    getInventory(): InventoryItem[] {
        return this.state?.inventory || [];
    }

    /**
     * Count total item quantity matching a name pattern.
     *
     * This sums stack sizes across every matching slot. Use
     * `getInventory().filter(...)` when the number of occupied slots is needed.
     */
    countInventoryItems(pattern: string | RegExp): number {
        if (!this.state) return 0;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
        return this.state.inventory.reduce(
            (total, item) => total + (regex.test(item.name) ? item.count : 0),
            0
        );
    }

    /** Get equipment item by slot number. */
    getEquipmentItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.equipment.find(i => i.slot === slot) || null;
    }

    /** Find equipment item by name pattern (shortest matching name wins). */
    findEquipmentItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        return shortestNameMatch(this.state.equipment, pattern);
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

    /** Find bank item by name pattern (bank must be open; shortest matching name wins). */
    findBankItem(pattern: string | RegExp): BankItem | null {
        if (!this.state?.bank.isOpen) return null;
        return shortestNameMatch(this.state.bank.items, pattern);
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

    /** Find NPC by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findNearbyNpc(pattern: string | RegExp, options?: FindOptions): NearbyNpc | null {
        if (!this.state) return null;
        return applyFindOptions(shortestNameMatch(this.state.nearbyNpcs, pattern), options);
    }

    /** Get all nearby NPCs. */
    getNearbyNpcs(): NearbyNpc[] {
        return this.state?.nearbyNpcs || [];
    }

    /** Find a nearby player by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findNearbyPlayer(pattern: string | RegExp, options?: FindOptions): NearbyPlayer | null {
        if (!this.state) return null;
        return applyFindOptions(shortestNameMatch(this.state.nearbyPlayers, pattern), options);
    }

    /** Get all nearby players, nearest first. */
    getNearbyPlayers(): NearbyPlayer[] {
        return this.state?.nearbyPlayers || [];
    }

    /** Get location (object) by coordinates and ID. */
    getNearbyLoc(x: number, z: number, id: number): NearbyLoc | null {
        if (!this.state) return null;
        return this.state.nearbyLocs.find(l =>
            l.x === x && l.z === z && l.id === id
        ) || null;
    }

    /** Find location by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findNearbyLoc(pattern: string | RegExp, options?: FindOptions): NearbyLoc | null {
        if (!this.state) return null;
        let candidates = this.state.nearbyLocs;
        if (options?.withOption !== undefined) {
            const optionPattern = options.withOption;
            const regex = typeof optionPattern === 'string' ? new RegExp(optionPattern, 'i') : optionPattern;
            candidates = candidates.filter(loc => loc.optionsWithIndex?.some(o => {
                regex.lastIndex = 0;
                return regex.test(o.text);
            }));
        }
        return applyFindOptions(shortestNameMatch(candidates, pattern), options);
    }

    /** Get all nearby locations (trees, rocks, etc). */
    getNearbyLocs(): NearbyLoc[] {
        return this.state?.nearbyLocs || [];
    }

    /** Find ground item by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findGroundItem(pattern: string | RegExp, options?: FindOptions): GroundItem | null {
        if (!this.state) return null;
        return applyFindOptions(shortestNameMatch(this.state.groundItems, pattern), options);
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
     * Scan for nearby locations with custom radius. Results are scoped to the
     * player's current plane (each carries `level`); re-scan after climbing or
     * descending rather than reusing old references.
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

        try {
            return await new Promise<ActionResult>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.pendingActions.delete(actionId);
                    reject(new ActionDispatchError(`Action timed out: ${action.type}`, 'timeout'));
                }, this.config.actionTimeout);

                this.pendingActions.set(actionId, { resolve, reject, timeout });

                this.send({
                    type: 'sdk_action',
                    username: this.config.botUsername,
                    actionId,
                    action,
                    actionTimeoutMs: this.config.actionTimeout
                });
            });
        } catch (err) {
            // A dropped dispatch is a reportable failure, not a fatal one: callers
            // check result.success and can retry, reposition, or give up. Losing
            // the connection outright still throws from the guard above.
            return {
                success: false,
                message: err instanceof Error ? err.message : String(err),
                reason: err instanceof ActionDispatchError ? err.reason : 'error',
                phase: 'dispatch'
            };
        }
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

    /** Interact with a player by index and option (1-5). Option 2 = Attack (wilderness), 3 = Follow, 4 = Trade. */
    async sendInteractPlayer(playerIndex: number, option: number = 2): Promise<ActionResult> {
        return this.sendAction({ type: 'interactPlayer', playerIndex, optionIndex: option, reason: 'SDK' });
    }

    /** Talk to an NPC by index. */
    async sendTalkToNpc(npcIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'talkToNpc', npcIndex, reason: 'SDK' });
    }

    /** Pick up a ground item. */
    async sendPickup(x: number, z: number, itemId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'pickupItem', x, z, itemId, reason: 'SDK' });
    }

    /**
     * Use an inventory item (eat, equip, etc).
     *
     * `interfaceId` selects which inventory component holds the item. The main
     * inventory (3214, the default) dispatches OPHELD1-5; any other component
     * (trade offer, bank side inventory, ...) dispatches INV_BUTTON1-5, which
     * is the packet family the engine actually handles for interface-defined
     * item options - OPHELD with a foreign component id is silently dropped.
     */
    async sendUseItem(slot: number, option: number = 1, interfaceId?: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useInventoryItem', slot, optionIndex: option, interfaceId, reason: 'SDK' });
    }

    /** Use an equipped item (remove, operate, etc). */
    async sendUseEquipmentItem(slot: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'useEquipmentItem', slot, optionIndex: option, reason: 'SDK' });
    }

    /** Drop an inventory item. */
    async sendDropItem(slot: number): Promise<ActionResult> {
        return this.sendAction({ type: 'dropItem', slot, reason: 'SDK' });
    }

    /**
     * Use one inventory item on another.
     *
     * Rejected up front while a shop or bank modal is open: those replace the
     * inventory tab, so the server drops the packet as "component not visible"
     * and sends no message at all. Close the modal first — `bot.closeShop()`,
     * `bot.closeInterface()`, or `sendCloseModal()`.
     */
    async sendUseItemOnItem(sourceSlot: number, targetSlot: number): Promise<ActionResult> {
        const blocker = this.describeInventoryBlocker();
        if (blocker) {
            return { success: false, message: blocker, reason: 'modal_open' };
        }
        return this.sendAction({ type: 'useItemOnItem', sourceSlot, targetSlot, reason: 'SDK' });
    }

    /**
     * Name the open modal that hides the inventory tab from the server, if any.
     * Returns null when inventory packets can be expected to land.
     */
    private describeInventoryBlocker(): string | null {
        const state = this.getState();
        if (!state) return null;
        if (state.shop.isOpen) {
            return 'Shop interface is open, which replaces the inventory tab - the server will silently drop this. Close it first (bot.closeShop() / sdk.sendCloseShop()).';
        }
        if (state.bank.isOpen) {
            return 'Bank interface is open, which replaces the inventory tab - the server will silently drop this. Close it first (bot.closeInterface() / sdk.sendCloseModal()).';
        }
        if (state.trade?.isOpen) {
            return 'Trade interface is open, which replaces the inventory tab - the server will silently drop this. Finish or decline the trade first (sdk.sendDeclineTrade()).';
        }
        return null;
    }

    /** Use an inventory item on a location. */
    async sendUseItemOnLoc(itemSlot: number, x: number, z: number, locId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnLoc', itemSlot, x, z, locId, reason: 'SDK' });
    }

    /** Use an inventory item on an NPC. */
    async sendUseItemOnNpc(itemSlot: number, npcIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnNpc', itemSlot, npcIndex, reason: 'SDK' });
    }

    /**
     * Click a dialog option by its server-assigned index.
     *
     * IMPORTANT: `option` is the **server-assigned index** stored on each
     * `DialogOption.index` field — NOT the array position in `dialog.options`.
     * Server-assigned indices are 1-based: `dialog.options[0].index === 1`.
     *
     * Pass `0` only as the implicit "continue" click for dialogs with no
     * selectable options (the common pattern: pass through narration pages).
     *
     * To click an option by its visible text, prefer `clickDialogByText()`,
     * which avoids the index-vs-position footgun entirely.
     *
     * @example
     * ```ts
     * const opt = sdk.getDialog()?.options.find(o => /yes/i.test(o.text));
     * await sdk.sendClickDialog(opt?.index ?? 0);  // ← .index, NOT array position
     * ```
     */
    async sendClickDialog(option: number = 0): Promise<ActionResult> {
        return this.sendAction({ type: 'clickDialogOption', optionIndex: option, reason: 'SDK' });
    }

    /**
     * Click a dialog option whose visible text matches `pattern`.
     *
     * Convenience wrapper that resolves the server-assigned index for you,
     * sidestepping the 1-based vs 0-based array-position confusion of
     * `sendClickDialog()`. Matches against `DialogOption.text` (case-insensitive
     * by default for string patterns).
     *
     * @returns ActionResult with `success: false` and `reason: 'no_dialog'` if
     *          no dialog is open, or `reason: 'no_match'` if no option matches.
     *
     * @example
     * ```ts
     * await sdk.clickDialogByText(/yes/i);             // pay the toll
     * await sdk.clickDialogByText('Is there anything down this alleyway?');
     * ```
     */
    async clickDialogByText(pattern: string | RegExp): Promise<ActionResult> {
        const dialog = this.state?.dialog;
        if (!dialog?.isOpen) {
            return { success: false, message: 'No dialog open', reason: 'no_dialog' };
        }
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
        const match = dialog.options.find(o => regex.test(o.text));
        if (!match) {
            const available = dialog.options.map(o => `"${o.text}"`).join(', ') || '(none)';
            return {
                success: false,
                message: `No dialog option matched ${pattern}. Available: ${available}`,
                reason: 'no_match'
            };
        }
        return this.sendClickDialog(match.index);
    }

    /** Click a component using IF_BUTTON packet - for simple buttons, spellcasting, etc. */
    async sendClickComponent(componentId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponent', componentId, reason: 'SDK' });
    }

    /** Click a component using INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.) */
    async sendClickComponentWithOption(componentId: number, optionIndex: number = 1, slot: number = 0): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponentWithOption', componentId, optionIndex, slot, reason: 'SDK' });
    }

    /**
     * Click an interface option by **0-based array position**.
     *
     * Note the mismatch: `InterfaceOption.index` is a 1-based display label, so
     * passing one straight through clicks the option after the one you matched.
     * Prefer `clickInterfaceOption()` when selecting from published state.
     */
    async sendClickInterfaceOption(arrayPosition: number): Promise<ActionResult> {
        const state = this.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'No interface open', reason: 'no_interface' };
        }

        const options = state.interface.options;
        const option = options[arrayPosition];
        if (arrayPosition < 0 || arrayPosition >= options.length || !option) {
            return {
                success: false,
                message: `Invalid array position ${arrayPosition}; interface has ${options.length} options (0..${options.length - 1})`,
                reason: 'no_match',
            };
        }

        return this.sendClickComponent(option.componentId);
    }

    /**
     * Click exactly one interface option, selected by its state object or by
     * visible text (substring for strings, match for regexes).
     *
     * This dispatches the option's `componentId` and never interprets
     * `InterfaceOption.index` as an array position.
     */
    async clickInterfaceOption(selector: InterfaceOptionSelector): Promise<ActionResult> {
        const state = this.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'No interface open', reason: 'no_interface' };
        }
        const option = resolveInterfaceOption(state.interface.options, selector);
        if (!option) {
            const available = state.interface.options.map(o => `"${o.text}"`).join(', ') || '(none)';
            return {
                success: false,
                message: `No interface option matched ${selectorLabel(selector)}. Available: ${available}`,
                reason: 'no_match',
            };
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

    /** Submit a numeric value to an open p_countdialog (Enter Amount) prompt. */
    async sendCountDialog(value: number): Promise<ActionResult> {
        return this.sendAction({ type: 'submitCountDialog', value, reason: 'SDK' });
    }

    // ============ Player Trading ============

    /**
     * Current player-to-player trade session state. Returns a closed-trade
     * default when no state has arrived or the connected client predates
     * trade support.
     */
    getTradeState(): TradeState {
        return this.state?.trade ?? {
            isOpen: false,
            screen: null,
            partner: null,
            myOffer: [],
            theirOffer: [],
            myAccepted: false,
            partnerAccepted: false
        };
    }

    /**
     * Send (or accept) a trade request to another player. There is no
     * separate "accept" packet: requesting a player who already requested
     * you is the acceptance, and opens the trade screen for both. Otherwise
     * the partner sees "<you> wishes to trade with you." and the trade opens
     * when they request back.
     */
    async sendTradeRequest(playerIndex: number): Promise<ActionResult> {
        return this.sendInteractPlayer(playerIndex, 4);
    }

    /**
     * Move items from your (trade-screen) side inventory into your offer.
     * `slot` is the inventory slot. Amounts 1/5/10 and -1 (All) map to the
     * game's offer buttons; any other amount uses Offer-X plus the count
     * dialog. Only valid while the offer screen is open.
     */
    async sendOfferItem(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendTradeInvButton(TRADE_SIDE_INV_ID, slot, amount);
    }

    /**
     * Remove items from your offer back to your inventory. Same amount
     * semantics as {@link sendOfferItem}. Note: removing (or adding) items
     * resets both players' accepts server-side.
     */
    async sendRetractItem(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendTradeInvButton(TRADE_MAIN_INV_ID, slot, amount);
    }

    private async sendTradeInvButton(componentId: number, slot: number, amount: number): Promise<ActionResult> {
        if (!Number.isInteger(amount) || amount === 0 || (amount < 0 && amount !== -1)) {
            return { success: false, message: `Invalid trade amount: ${amount}`, reason: 'invalid_amount' };
        }
        const option = amount === 1 ? 1
            : amount === 5 ? 2
            : amount === 10 ? 3
            : (amount === -1 || amount >= 0x7fffffff) ? 4
            : 5;
        const result = await this.sendClickComponentWithOption(componentId, option, slot);
        if (!result.success || option !== 5) return result;
        // Offer-X: the server opens a count dialog; this waits for it and submits.
        return this.sendCountDialog(amount);
    }

    /**
     * Accept the currently open trade screen (first or confirm). The trade
     * only advances when both players accept; an offer change resets accepts.
     */
    async sendAcceptTrade(): Promise<ActionResult> {
        const trade = this.getTradeState();
        if (!trade.isOpen) {
            return { success: false, message: 'No trade screen is open', reason: 'not_open' };
        }
        const componentId = trade.screen === 'confirm' ? TRADE_CONFIRM_ACCEPT_ID : TRADE_MAIN_ACCEPT_ID;
        return this.sendClickComponent(componentId);
    }

    /**
     * Decline the open trade (closes the screen; both sides get their items
     * back and the partner sees "Other player declined trade.").
     */
    async sendDeclineTrade(): Promise<ActionResult> {
        const trade = this.getTradeState();
        if (!trade.isOpen) {
            return { success: false, message: 'No trade screen is open', reason: 'not_open' };
        }
        return this.sendCloseModal();
    }

    /**
     * Wait for an incoming trade request ("X wishes to trade with you.").
     * Requests arrive as chat type {@link TRADE_REQUEST_CHAT_TYPE}, which the
     * default chat readers filter out. Returns the requester's name, or null
     * on timeout.
     *
     * @param opts.from Only accept requests from this sender (substring match).
     * @param opts.timeout Ms to wait (default 30000).
     */
    async waitForTradeRequest(opts: { from?: string; timeout?: number } = {}): Promise<string | null> {
        const message = await this.waitForChat({
            from: opts.from,
            types: [TRADE_REQUEST_CHAT_TYPE],
            matching: /wishes to trade/i,
            timeout: opts.timeout ?? 30000
        });
        return message?.sender ?? null;
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

    /** Cast spell on NPC using spell component ID (OPNPCT). */
    async sendSpellOnNpc(npcIndex: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnNpc', npcIndex, spellComponent, reason: 'SDK' });
    }

    /**
     * Cast spell on another player using spell component ID (OPPLAYERT).
     *
     * `playerIndex` is a world slot from `nearbyPlayers`, a different space from
     * npc indices - use {@link sendSpellOnTarget} to avoid mixing them up.
     */
    async sendSpellOnPlayer(playerIndex: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnPlayer', playerIndex, spellComponent, reason: 'SDK' });
    }

    /**
     * Cast a spell on whatever the target is - npc or player - picking the right
     * packet from `target.kind`. This is the one to reach for in code that fights
     * both, e.g. `sdk.sendSpellOnTarget(sdk.findNearbyPlayer('Zezima'), Spells.WIND_STRIKE)`.
     */
    async sendSpellOnTarget(target: NearbyNpc | NearbyPlayer, spellComponent: number): Promise<ActionResult> {
        return target.kind === 'player'
            ? this.sendSpellOnPlayer(target.index, spellComponent)
            : this.sendSpellOnNpc(target.index, spellComponent);
    }

    /** Cast spell on inventory item. */
    async sendSpellOnItem(slot: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnItem', slot, spellComponent, reason: 'SDK' });
    }

    /** Cast spell on ground item (e.g., Telekinetic Grab). */
    async sendSpellOnGroundItem(x: number, z: number, itemId: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnGroundItem', x, z, itemId, spellComponent, reason: 'SDK' });
    }

    /** Switch to a UI tab by index. */
    async sendSetTab(tabIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'setTab', tabIndex, reason: 'SDK' });
    }

    /**
     * Send a single chat message. The server caps public chat at {@link maxMessageLength}
     * chars (400 on rs-sdk servers) and runs a word filter; `result.data` reports
     * `{ sent, truncated, filtered, finalText }` so you know if your message was clipped
     * or censored. For longer text that shouldn't be silently truncated, use {@link say}.
     */
    async sendSay(message: string): Promise<ActionResult> {
        return this.sendAction({ type: 'say', message, reason: 'SDK' });
    }

    /**
     * Server-configured max chat length, learned from the gateway handshake. Defaults
     * to 80 (the RS wire limit) until the bot session reports the server's value, which
     * a server operator can raise via `node.maxMessageLength` in world.json.
     */
    get maxMessageLength(): number {
        return this.serverMaxMessageLength;
    }

    /**
     * Send a message of any length, auto-split into chunks on word boundaries and sent
     * in order (so a multi-sentence plan isn't lost to the chat-length cap). Waits a
     * tick between chunks so they don't collide. Returns one ActionResult per chunk.
     *
     * @param text The full message to send.
     * @param opts.maxLen Max chars per chunk. Defaults to (and is capped at) the
     *   server-configured {@link maxMessageLength}.
     * @param opts.delayTicks Ticks to wait between chunks (default 1).
     */
    async say(text: string, opts: { maxLen?: number; delayTicks?: number } = {}): Promise<ActionResult[]> {
        const maxLen = Math.min(opts.maxLen ?? this.serverMaxMessageLength, this.serverMaxMessageLength);
        const delayTicks = opts.delayTicks ?? 1;
        const chunks = chunkMessage(text, maxLen);
        const results: ActionResult[] = [];
        for (let i = 0; i < chunks.length; i++) {
            results.push(await this.sendSay(chunks[i]!));
            if (i < chunks.length - 1 && delayTicks > 0) {
                if (this.config.connectionMode === 'observe') {
                    // Observe mode may only dispatch 'say' - and a 'wait' would occupy
                    // the bot client's executor, interfering with whatever controller
                    // owns the bot. Pace with wall-clock time instead.
                    await new Promise(resolve => setTimeout(resolve, delayTicks * 600));
                } else {
                    await this.sendWait(delayTicks);
                }
            }
        }
        return results;
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
        const waypoints = pathfinding.findLongPath(
            level,
            srcX,
            srcZ,
            destX,
            destZ,
            maxWaypoints,
            this.temporaryDoorBlocks.active()
        );

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

        // Detect unreachable destinations: if the pathfinder couldn't reach the
        // destination and the remaining distance is still very large, the target
        // is likely on a different plane (underground areas share level 0 but use
        // Z offsets of +6400, making them allocated but disconnected from the surface).
        // The "just past a gate" case has a remaining distance of ~10-20 tiles, not hundreds.
        if (!reachedDestination && waypoints.length > 0) {
            const remainDist = Math.abs(lastWaypoint!.x - destX) + Math.abs(lastWaypoint!.z - destZ);
            if (remainDist > 100) {
                return { success: false, waypoints: [], error: `Destination (${destX}, ${destZ}) is unreachable — path ends ${remainDist} tiles away at (${lastWaypoint!.x}, ${lastWaypoint!.z}). The target may be underground or on a different plane that requires a ladder/stairs to access.` };
            }
        }

        return { success: true, waypoints, reachedDestination };
    }

    /**
     * Temporarily exclude a known door from this SDK instance's path queries.
     * The shared collision map is never mutated beyond the synchronous query.
     */
    blockDoorTemporarily(level: number, x: number, z: number, ttlMs: number = 30_000): boolean {
        const door = pathfinding.getDoorAt(level, x, z);
        if (!door) return false;
        this.temporaryDoorBlocks.block(door, ttlMs);
        return true;
    }

    /** Check this SDK session's non-expired temporary door evidence. */
    isDoorTemporarilyBlocked(level: number, x: number, z: number): boolean {
        return this.temporaryDoorBlocks.has(level, x, z);
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
                const hasEntities = (s.nearbyNpcs?.length ?? 0) > 0 || (s.nearbyLocs?.length ?? 0) > 0 || (s.groundItems?.length ?? 0) > 0;

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

        // The server-configured chat cap can arrive after the initial handshake: if the
        // SDK connects before the bot page registers, the gateway re-sends sdk_connected
        // (and may send sdk_info) once the bot is known. Capture it whenever it appears.
        if ((message.type === 'sdk_connected' || message.type === 'sdk_info') && typeof message.maxMessageLength === 'number' && message.maxMessageLength > 0) {
            this.serverMaxMessageLength = message.maxMessageLength;
        }

        if (message.type === 'sdk_state' && message.state) {
            // Filter out player chat messages unless showChat is enabled. Player
            // chat = public (types 1/2) and private (3/6/7); system/game messages
            // (level-ups, combat, examines) always pass through.
            if (this.config.showChat === false && message.state.gameMessages) {
                message.state.gameMessages = message.state.gameMessages.filter(
                    msg => !isPlayerChat(msg.type)
                );
            }

            // Accumulate chat into the deep history buffer (post-showChat
            // filter, so hidden player chat stays hidden). Must happen before
            // state listeners fire so waitForChat sees the new messages.
            if (message.state.gameMessages) {
                this.chatHistory.record(message.state.gameMessages);
            }

            // Wrap skills array with a Proxy so both state.skills[0] and state.skills.Woodcutting work
            if (message.state.skills) {
                const nameMap: Record<string, SkillState> = {};
                for (const skill of message.state.skills) {
                    if (/^Stat\d+$/i.test(skill.name)) continue;
                    nameMap[skill.name] = skill;
                }
                message.state.skills = new Proxy(message.state.skills, {
                    get(target, prop, receiver) {
                        if (typeof prop === 'string' && prop in nameMap) {
                            return nameMap[prop];
                        }
                        return Reflect.get(target, prop, receiver);
                    }
                }) as SkillState[];
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
                    pending.reject(new ActionDispatchError('No result in action response', 'error'));
                }
            }
        }

        if (message.type === 'sdk_error') {
            // Handle controller pre-emption: another controller connected, so we were kicked
            if (message.error?.includes('another controller connected')) {
                console.warn(`[BotSDK] Pre-empted by another controller - disabling auto-reconnect`);
                this.intentionalDisconnect = true;
            }

            if (message.actionId) {
                const pending = this.pendingActions.get(message.actionId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingActions.delete(message.actionId);
                    pending.reject(new ActionDispatchError(message.error || 'Unknown error', 'error'));
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
            // The gateway broadcasts frames to every SDK session on the bot, so a
            // frame carrying an id we did not issue belongs to another session (an
            // observer polling at 1-2fps, say). Resolving "the first pending" for
            // those handed controllers frames they never requested — drop them.
            // The id-less fallback stays for responses that carry no id at all.
            let pending: PendingScreenshot | undefined;
            if (message.screenshotId) {
                pending = this.pendingScreenshots.get(message.screenshotId);
                if (pending) {
                    this.pendingScreenshots.delete(message.screenshotId);
                }
            } else if (this.pendingScreenshots.size > 0) {
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
