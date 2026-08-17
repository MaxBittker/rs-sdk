#!/usr/bin/env bun
// Gateway Service - WebSocket router for Bot ↔ SDK communication
// SyncModule: handles bot and sdk client routing

import type {
    BotWorldState,
    BotClientMessage,
    SyncToBotMessage,
    SDKMessage,
    SyncToSDKMessage,
    SDKConnectionMode
} from './types';
import { PLAYER_CHAT_TYPES } from './types';
import { ChatHistory } from '../../sdk/chat-history';
import { chunkMessage } from '../../sdk/chunking';

const GATEWAY_PORT = parseInt(process.env.AGENT_PORT || '7780');

// Login server configuration - when enabled, SDK connections require per-bot authentication
const LOGIN_SERVER_ENABLED = process.env.LOGIN_SERVER === 'true';
const LOGIN_HOST = process.env.LOGIN_HOST || 'localhost';
const LOGIN_PORT = parseInt(process.env.LOGIN_PORT || '43500');

// ============ Login Server Client ============

let loginServerWs: WebSocket | null = null;
let loginServerConnected = false;
const pendingAuthRequests = new Map<string, {
    resolve: (result: { success: boolean; error?: string }) => void;
    timeout: ReturnType<typeof setTimeout>;
}>();

function connectToLoginServer() {
    if (!LOGIN_SERVER_ENABLED) return;

    const url = `ws://${LOGIN_HOST}:${LOGIN_PORT}`;
    console.log(`[Gateway] Connecting to login server at ${url}...`);

    loginServerWs = new WebSocket(url);

    loginServerWs.onopen = () => {
        loginServerConnected = true;
        console.log(`[Gateway] Connected to login server`);
    };

    loginServerWs.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data.toString());
            if (msg.replyTo && pendingAuthRequests.has(msg.replyTo)) {
                const pending = pendingAuthRequests.get(msg.replyTo)!;
                clearTimeout(pending.timeout);
                pendingAuthRequests.delete(msg.replyTo);
                pending.resolve({ success: msg.success, error: msg.error });
            }
        } catch (e) {
            console.error('[Gateway] Error parsing login server message:', e);
        }
    };

    loginServerWs.onclose = () => {
        loginServerConnected = false;
        console.log(`[Gateway] Disconnected from login server, reconnecting in 5s...`);
        setTimeout(connectToLoginServer, 5000);
    };

    loginServerWs.onerror = (error) => {
        console.error(`[Gateway] Login server connection error`);
    };
}

async function authenticateSDK(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    if (!LOGIN_SERVER_ENABLED) {
        // No login server - allow all connections (development mode)
        return { success: true };
    }

    if (!loginServerConnected || !loginServerWs) {
        return { success: false, error: 'Login server not available' };
    }

    const replyTo = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve) => {
        // must outlast the sqlite busy_timeout (10s in engine db/query.ts): under write
        // contention the login server's auth query waits up to that long before answering
        const timeout = setTimeout(() => {
            pendingAuthRequests.delete(replyTo);
            resolve({ success: false, error: 'Authentication timeout' });
        }, 15000);

        pendingAuthRequests.set(replyTo, { resolve, timeout });

        loginServerWs!.send(JSON.stringify({
            type: 'sdk_auth',
            replyTo,
            username,
            password
        }));
    });
}

// ============ Types ============

/**
 * Bot Session - represents a bot client (browser) connected to the gateway.
 *
 * Only ONE bot session per username is allowed. When a new bot connects with
 * the same username, the old session is gracefully disconnected via
 * 'save_and_disconnect' message (allowing it to save state before closing).
 *
 * Session lifecycle:
 * 1. Bot connects, sends 'connected' message with username
 * 2. Gateway creates/updates BotSession, notifies SDK clients
 * 3. Bot sends 'state' updates periodically (tracked for staleness)
 * 4. On disconnect: session.ws = null, SDKs notified, state preserved
 * 5. On reconnect: same username gets fresh session, state preserved
 */
interface BotSession {
    ws: any;
    clientId: string;
    username: string;
    lastState: BotWorldState | null;
    lastStateReceivedAt: number;
    currentActionId: string | null;
    pendingScreenshotId: string | null;
    // Session metadata for diagnostics
    connectedAt: number;              // When bot first connected (timestamp)
    lastHeartbeat: number;            // Last message received (any type)
    maxMessageLength?: number;        // Server-configured chat cap, relayed from the bot page to SDKs
}

// Session status for diagnostics
type SessionStatus = 'active' | 'stale' | 'dead';

const STALE_THRESHOLD_MS = 8000;  // 8 seconds without state = stale (bots publish ~every tick)

function getSessionStatus(session: BotSession): SessionStatus {
    if (!session.ws) return 'dead';
    const stateAge = Date.now() - session.lastStateReceivedAt;
    if (stateAge > STALE_THRESHOLD_MS) return 'stale';
    return 'active';
}

/**
 * SDK Session - represents an SDK client connected to control/observe a bot.
 *
 * Controller pre-emption (last controller wins):
 * - When a new 'control' mode client connects, any existing controllers are disconnected
 * - This prevents conflicts from stale daemon connections or background scripts
 * - Multiple 'observe' mode clients can coexist freely
 * - Mixed: One controller and multiple observers can coexist
 * - Observers may send the 'say' action (and nothing else), so chat tools can
 *   talk through the bot without stealing control from its controller
 *
 * Identity: `sessionId` is server-generated and is the ONLY key used to look a
 * session up. `sdkClientId` is a client-supplied label kept for logs/status
 * output only — it is never trusted as identity, since a client could otherwise
 * claim another client's id and rebind its session (cross-account action injection).
 */
interface SDKSession {
    ws: any;
    sessionId: string;
    sdkClientId: string;
    targetUsername: string;
    mode: SDKConnectionMode;
}

// ============ State ============
//
// Session Maps:
// - botSessions: Keyed by username (only one bot per username allowed)
// - sdkSessions: Keyed by server-generated sessionId (multiple SDKs per bot allowed)
// - wsToType: Reverse lookup from WebSocket to session type/id
// - pendingTakeovers: Tracks new connections waiting for old session to close

const botSessions = new Map<string, BotSession>();      // username -> BotSession
const sdkSessions = new Map<string, SDKSession>();      // sessionId -> SDKSession
const wsToType = new Map<any, { type: 'bot' | 'sdk'; id: string }>();

// Per-bot accumulated chat, fed from state snapshots (same merge logic the SDK
// uses). Keyed by username so history survives bot reconnects/takeovers.
// Backs the HTTP GET /chat/:username endpoint, which lets chat tools read
// recent messages with a single bounded request instead of opening an observer
// WebSocket and waiting for a state frame.
const chatHistories = new Map<string, ChatHistory>();
function chatHistoryFor(username: string): ChatHistory {
    let history = chatHistories.get(username);
    if (!history) {
        history = new ChatHistory();
        chatHistories.set(username, history);
    }
    return history;
}

// Actions dispatched from HTTP requests (POST /say/:username) awaiting their
// actionResult from the bot client. Keyed by actionId; entries self-expire.
const pendingHttpActions = new Map<string, { resolve: (result: any) => void; timeout: ReturnType<typeof setTimeout> }>();
let httpActionSeq = 0;

// Monotonic counter so server-generated session ids can never collide, even
// within the same millisecond.
let sdkSessionSeq = 0;
function newSDKSessionId(): string {
    return `sdks-${++sdkSessionSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

// Pending takeovers: new bot waiting for old session to close
interface PendingTakeover {
    ws: any;
    clientId: string;
    username: string;
    timeout: ReturnType<typeof setTimeout>;
    maxMessageLength?: number;
}
const pendingTakeovers = new Map<string, PendingTakeover>();  // username -> pending new connection

// SDK sockets with an sdk_connect in flight (awaiting auth), so a second
// concurrent connect on the same socket can't slip through registration.
const sdkConnecting = new Set<any>();

// ============ Sync Module ============

const SyncModule = {
    sendToBot(session: BotSession, message: SyncToBotMessage) {
        if (session.ws) {
            try {
                session.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`[Gateway] [${session.username}] Failed to send to bot:`, error);
            }
        }
    },

    sendToSDK(session: SDKSession, message: SyncToSDKMessage) {
        if (session.ws) {
            try {
                session.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`[Gateway] [${session.sdkClientId}] Failed to send to SDK:`, error);
            }
        }
    },

    /**
     * Resolve the SDK session a socket owns. Returns null unless the session still
     * belongs to this exact socket — a session whose `ws` is someone else's must
     * never accept messages from this one.
     */
    getSessionForSocket(ws: any): SDKSession | null {
        const wsInfo = wsToType.get(ws);
        if (!wsInfo || wsInfo.type !== 'sdk') return null;
        const session = sdkSessions.get(wsInfo.id);
        if (!session || session.ws !== ws) return null;
        return session;
    },

    getSDKSessionsForBot(username: string): SDKSession[] {
        const sessions: SDKSession[] = [];
        for (const session of sdkSessions.values()) {
            if (session.targetUsername === username) {
                sessions.push(session);
            }
        }
        return sessions;
    },

    getControllersForBot(username: string): SDKSession[] {
        return this.getSDKSessionsForBot(username).filter(s => s.mode === 'control');
    },

    getObserversForBot(username: string): SDKSession[] {
        return this.getSDKSessionsForBot(username).filter(s => s.mode === 'observe');
    },

    extractUsernameFromClientId(clientId: string | undefined): string | null {
        if (!clientId) return null;
        if (clientId.startsWith('bot-')) return null;
        const parts = clientId.split('-');
        if (parts.length >= 1 && parts[0] && !parts[0].match(/^\d+$/)) {
            return parts[0];
        }
        return null;
    },

    // Helper to complete a bot connection (called immediately or after takeover completes)
    completeBotConnection(ws: any, clientId: string, username: string, preservedState?: BotSession | null, maxMessageLength?: number) {
        const now = Date.now();
        const session: BotSession = {
            ws,
            clientId,
            username,
            lastState: preservedState?.lastState || null,
            lastStateReceivedAt: preservedState?.lastStateReceivedAt || 0,
            currentActionId: null,
            pendingScreenshotId: null,
            connectedAt: now,
            lastHeartbeat: now,
            maxMessageLength: maxMessageLength ?? preservedState?.maxMessageLength
        };

        botSessions.set(username, session);
        wsToType.set(ws, { type: 'bot', id: username });

        console.log(`[Gateway] Bot connected: ${clientId} (${username})`);

        this.sendToBot(session, { type: 'status', status: 'Connected to gateway' });

        for (const sdkSession of this.getSDKSessionsForBot(username)) {
            this.sendToSDK(sdkSession, { type: 'sdk_connected', success: true, maxMessageLength: session.maxMessageLength });
        }
    },

    async handleBotMessage(ws: any, message: BotClientMessage) {
        if (message.type === 'connected') {
            const username = message.username || this.extractUsernameFromClientId(message.clientId) || 'default';
            const clientId = message.clientId || `bot-${Date.now()}`;

            // Authenticate bot using per-bot password (same as SDK auth)
            const authResult = await authenticateSDK(username, message.password || '');
            if (!authResult.success) {
                console.log(`[Gateway] Bot auth failed: ${clientId} -> ${username} (${authResult.error})`);
                try {
                    ws.send(JSON.stringify({ type: 'error', error: `Authentication failed: ${authResult.error}` }));
                    ws.close();
                } catch {}
                return;
            }

            const existingSession = botSessions.get(username);
            if (existingSession && existingSession.ws !== ws && existingSession.ws) {
                // Graceful takeover: ask old bot to save and disconnect, WAIT before allowing new session
                console.log(`[Gateway] Requesting graceful disconnect for existing session: ${existingSession.clientId}`);
                console.log(`[Gateway] New session ${clientId} will wait for old session to close`);

                console.warn(`[LOGOUT DEBUG] Gateway sending save_and_disconnect to ${username} (session takeover by ${clientId})`);
                this.sendToBot(existingSession, {
                    type: 'save_and_disconnect',
                    reason: 'New session connecting'
                });

                // Store pending takeover - will be processed when old session closes
                const oldWs = existingSession.ws;
                const timeout = setTimeout(() => {
                    // Timeout: force close old session and complete the pending takeover
                    console.warn(`[LOGOUT DEBUG] Gateway takeover timeout (5s) for ${username} - force closing old session`);
                    console.log(`[Gateway] Takeover timeout for ${username}, force closing old session`);
                    if (oldWs && oldWs.readyState !== 3 /* CLOSED */) {
                        try { oldWs.close(); } catch {}
                    }
                    // handleClose will process the pending takeover
                }, 5000);  // 5 second grace period

                pendingTakeovers.set(username, { ws, clientId, username, timeout, maxMessageLength: message.maxMessageLength });

                // Don't complete the connection yet - wait for old session to close
                return;
            }

            // No existing session or same ws reconnecting - complete immediately
            this.completeBotConnection(ws, clientId, username, existingSession, message.maxMessageLength);
            return;
        }

        const wsInfo = wsToType.get(ws);
        if (!wsInfo || wsInfo.type !== 'bot') return;

        const session = botSessions.get(wsInfo.id);
        if (!session) return;

        // Update heartbeat on any message
        session.lastHeartbeat = Date.now();

        if (message.type === 'actionResult' && message.result) {
            const actionId = message.actionId || session.currentActionId || undefined;
            console.log(`[Gateway] [${session.username}] Action result: ${message.result.success ? 'success' : 'failed'} - ${message.result.message}`);

            // Actions dispatched over HTTP resolve their waiting request here.
            if (actionId) {
                const pendingHttp = pendingHttpActions.get(actionId);
                if (pendingHttp) {
                    pendingHttpActions.delete(actionId);
                    clearTimeout(pendingHttp.timeout);
                    pendingHttp.resolve(message.result);
                    session.currentActionId = null;
                    return;
                }
            }

            for (const sdkSession of this.getSDKSessionsForBot(session.username)) {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_action_result',
                    actionId,
                    result: message.result
                });
            }
            session.currentActionId = null;
            return;
        }

        if (message.type === 'state' && message.state) {
            session.lastState = message.state;
            session.lastStateReceivedAt = Date.now();
            if (message.state.gameMessages?.length) {
                chatHistoryFor(session.username).record(message.state.gameMessages);
            }
            for (const sdkSession of this.getSDKSessionsForBot(session.username)) {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_state',
                    state: message.state,
                    stateReceivedAt: session.lastStateReceivedAt
                });
            }
        }

        if (message.type === 'screenshot_response' && message.dataUrl) {
            const screenshotId = message.screenshotId || session.pendingScreenshotId || undefined;
            console.log(`[Gateway] [${session.username}] Screenshot received (${(message.dataUrl.length / 1024).toFixed(1)}KB)`);

            for (const sdkSession of this.getSDKSessionsForBot(session.username)) {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_screenshot_response',
                    screenshotId,
                    dataUrl: message.dataUrl
                });
            }
            session.pendingScreenshotId = null;
        }
    },

    async handleSDKMessage(ws: any, message: SDKMessage) {
        if (message.type === 'sdk_connect') {
            // Label only — never used as a lookup key. Client-supplied, so keep it
            // bounded to stop log spam/forgery via absurdly long ids.
            const sdkClientId = (message.clientId || 'sdk').slice(0, 64);
            const targetUsername = message.username;
            const mode: SDKConnectionMode = message.mode || 'control';

            // One session per socket: a second sdk_connect on an already-registered
            // socket would orphan the first session in the maps. sdkConnecting covers
            // the await below, where two connects could otherwise both pass this check.
            if (wsToType.has(ws) || sdkConnecting.has(ws)) {
                console.log(`[Gateway] Rejected duplicate sdk_connect on existing socket (${sdkClientId} -> ${targetUsername})`);
                ws.send(JSON.stringify({
                    type: 'sdk_error',
                    error: 'Already connected on this socket'
                }));
                return;
            }

            // Authenticate via login server (if enabled)
            sdkConnecting.add(ws);
            let authResult: { success: boolean; error?: string };
            try {
                authResult = await authenticateSDK(targetUsername, message.password || '');
            } finally {
                sdkConnecting.delete(ws);
            }
            if (!authResult.success) {
                console.log(`[Gateway] SDK auth failed: ${sdkClientId} -> ${targetUsername} (${authResult.error})`);
                ws.send(JSON.stringify({
                    type: 'sdk_error',
                    error: `Authentication failed: ${authResult.error}`
                }));
                ws.close();
                return;
            }

            const sessionId = newSDKSessionId();
            const session: SDKSession = { ws, sessionId, sdkClientId, targetUsername, mode };
            sdkSessions.set(sessionId, session);
            wsToType.set(ws, { type: 'sdk', id: sessionId });

            // Last controller wins: disconnect existing controllers for this bot
            if (mode === 'control') {
                const oldControllers = this.getControllersForBot(targetUsername)
                    .filter(s => s.sessionId !== sessionId);

                for (const old of oldControllers) {
                    console.log(`[Gateway] Pre-empting old controller ${old.sdkClientId} for ${targetUsername} (replaced by ${sdkClientId})`);
                    this.sendToSDK(old, {
                        type: 'sdk_error',
                        error: 'Disconnected: another controller connected'
                    });
                    sdkSessions.delete(old.sessionId);
                    wsToType.delete(old.ws);
                    try { old.ws.close(); } catch {}
                }
            }

            const authStatus = LOGIN_SERVER_ENABLED ? ' (authenticated)' : '';
            console.log(`[Gateway] SDK connected: ${sdkClientId} -> ${targetUsername} (mode: ${mode})${authStatus}`);

            this.sendToSDK(session, {
                type: 'sdk_connected',
                success: true,
                mode,
                otherControllers: 0,  // Always 0 now since we pre-empt old controllers
                maxMessageLength: botSessions.get(targetUsername)?.maxMessageLength
            });

            const botSession = botSessions.get(targetUsername);
            if (botSession?.lastState) {
                this.sendToSDK(session, {
                    type: 'sdk_state',
                    state: botSession.lastState,
                    stateReceivedAt: botSession.lastStateReceivedAt
                });
            }
            return;
        }

        if (message.type === 'sdk_action') {
            const sdkSession = this.getSessionForSocket(ws);
            if (!sdkSession) return;

            // Gate actions based on mode: observers may only send 'say', so chat
            // tools can talk without being able to drive the bot.
            if (sdkSession.mode === 'observe' && message.action?.type !== 'say') {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_error',
                    actionId: message.actionId,
                    error: `Observe mode can only send 'say' actions (got '${message.action?.type}')`
                });
                console.log(`[Gateway] [${sdkSession.targetUsername}] Rejected action from observe-mode SDK: ${message.action?.type}`);
                return;
            }

            // Always use the authenticated session target — ignore message.username to prevent IDOR
            if (message.username && message.username !== sdkSession.targetUsername) {
                console.log(`[Gateway] IDOR blocked: SDK ${sdkSession.sdkClientId} authenticated for "${sdkSession.targetUsername}" tried to target "${message.username}"`);
            }

            const botSession = botSessions.get(sdkSession.targetUsername);
            if (!botSession || !botSession.ws) {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_error',
                    actionId: message.actionId,
                    error: 'Bot not connected'
                });
                return;
            }

            botSession.currentActionId = message.actionId || null;
            this.sendToBot(botSession, {
                type: 'action',
                action: message.action,
                actionId: message.actionId,
                actionTimeoutMs: message.actionTimeoutMs
            });

            console.log(`[Gateway] [${botSession.username}] SDK action: ${message.action?.type} (${message.actionId})`);
        }

        if (message.type === 'sdk_screenshot_request') {
            const sdkSession = this.getSessionForSocket(ws);
            if (!sdkSession) return;

            // Always use the authenticated session target — ignore message.username to prevent IDOR
            if (message.username && message.username !== sdkSession.targetUsername) {
                console.log(`[Gateway] IDOR blocked: SDK ${sdkSession.sdkClientId} authenticated for "${sdkSession.targetUsername}" tried to screenshot "${message.username}"`);
            }

            const botSession = botSessions.get(sdkSession.targetUsername);
            if (!botSession || !botSession.ws) {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_error',
                    screenshotId: message.screenshotId,
                    error: 'Bot not connected'
                });
                return;
            }

            botSession.pendingScreenshotId = message.screenshotId || null;
            this.sendToBot(botSession, {
                type: 'screenshot_request',
                screenshotId: message.screenshotId
            });

            console.log(`[Gateway] [${botSession.username}] SDK screenshot request (${message.screenshotId})`);
        }
    },

    handleClose(ws: any) {
        const wsInfo = wsToType.get(ws);
        if (!wsInfo) return;

        if (wsInfo.type === 'bot') {
            const session = botSessions.get(wsInfo.id);
            // Same ownership rule as SDK sessions: a stale socket closing must not
            // null out the ws of the session that replaced it.
            if (session && session.ws !== ws) {
                console.log(`[Gateway] Ignoring close from superseded bot socket (${session.username})`);
                wsToType.delete(ws);
                return;
            }
            if (session) {
                console.log(`[Gateway] Bot disconnected: ${session.clientId} (${session.username})`);
                const username = session.username;
                session.ws = null;

                // Check if there's a pending takeover waiting for this session to close
                const pending = pendingTakeovers.get(username);
                if (pending) {
                    console.log(`[Gateway] Processing pending takeover for ${username}: ${pending.clientId}`);
                    clearTimeout(pending.timeout);
                    pendingTakeovers.delete(username);

                    // Small delay to let game server finish processing the logout
                    setTimeout(() => {
                        // Verify pending ws is still open
                        if (pending.ws && pending.ws.readyState === 1 /* OPEN */) {
                            this.completeBotConnection(pending.ws, pending.clientId, pending.username, session, pending.maxMessageLength);
                        } else {
                            console.log(`[Gateway] Pending connection for ${username} already closed, skipping`);
                        }
                    }, 700);  // 700ms delay to let game server settle

                    // Don't notify SDK of disconnect since new session is taking over
                    wsToType.delete(ws);
                    return;
                }

                // No pending takeover - notify SDK clients of disconnect
                for (const sdkSession of this.getSDKSessionsForBot(session.username)) {
                    this.sendToSDK(sdkSession, { type: 'sdk_error', error: 'Bot disconnected' });
                }
            }
        } else if (wsInfo.type === 'sdk') {
            const session = sdkSessions.get(wsInfo.id);
            // Only tear down a session this socket still owns; never delete an entry
            // that now belongs to another socket.
            if (session && session.ws === ws) {
                console.log(`[Gateway] SDK disconnected: ${session.sessionId} (${session.sdkClientId})`);
                sdkSessions.delete(wsInfo.id);
            }
        }

        sdkConnecting.delete(ws);
        wsToType.delete(ws);
    }
};

// ============ HTTP Chat Helpers ============

/**
 * Auth for the HTTP chat endpoints - same per-bot credential check as
 * sdk_connect. Password comes from the JSON body, an Authorization: Bearer
 * header, or a ?password= query param (a no-op unless LOGIN_SERVER is on,
 * matching the WebSocket paths).
 */
async function authenticateHttpRequest(req: Request, url: URL, username: string, bodyPassword?: unknown): Promise<{ success: boolean; error?: string }> {
    const header = req.headers.get('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const password = typeof bodyPassword === 'string' && bodyPassword !== ''
        ? bodyPassword
        : (bearer ?? url.searchParams.get('password') ?? '');
    return authenticateSDK(username, password);
}

/**
 * Dispatch one say chunk to the bot client and wait (bounded) for its
 * actionResult. Never rejects: a client that doesn't answer inside the budget
 * yields a failed result, so the HTTP handler always responds.
 */
function dispatchHttpSay(botSession: BotSession, text: string, timeoutMs: number): Promise<{ success: boolean; message: string; data?: any; reason?: string }> {
    const actionId = `http-${++httpActionSeq}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            pendingHttpActions.delete(actionId);
            resolve({ success: false, message: `Say timed out after ${timeoutMs}ms (game client did not answer)`, reason: 'timeout' });
        }, timeoutMs);
        pendingHttpActions.set(actionId, { resolve, timeout });
        // Also track on the session so clients that don't echo actionId still route back.
        botSession.currentActionId = actionId;
        SyncModule.sendToBot(botSession, {
            type: 'action',
            action: { type: 'say', message: text, reason: 'HTTP chat' },
            actionId,
            actionTimeoutMs: timeoutMs
        });
    });
}

// ============ Message Router ============

/**
 * Reject a frame we can't route. The socket is closed rather than ignored: every
 * legitimate client sends well-formed envelopes, so a malformed one is either a
 * broken client or a probe, and neither should keep an unauthenticated socket open.
 */
function rejectFrame(ws: any, reason: string) {
    console.error(`[Gateway] Rejecting frame: ${reason}`);
    try {
        ws.send(JSON.stringify({ type: 'error', error: `Invalid message: ${reason}` }));
    } catch {}
    try { ws.close(); } catch {}
}

async function handleMessage(ws: any, data: string) {
    let parsed: any;
    try {
        parsed = JSON.parse(data);
    } catch {
        rejectFrame(ws, 'malformed JSON');
        return;
    }

    // Shape-check before dispatch. `null` and `[]` are valid JSON, and a non-string
    // `type` survives JSON.parse — both used to reach the router and throw on
    // `parsed.type.startsWith(...)`, taking the whole gateway down with them.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        rejectFrame(ws, 'expected a JSON object');
        return;
    }
    if (typeof parsed.type !== 'string') {
        rejectFrame(ws, 'missing or non-string "type"');
        return;
    }

    // Check if this is already a known connection
    const wsInfo = wsToType.get(ws);
    if (wsInfo) {
        if (wsInfo.type === 'bot') {
            await SyncModule.handleBotMessage(ws, parsed);
        } else if (wsInfo.type === 'sdk') {
            await SyncModule.handleSDKMessage(ws, parsed);
        }
        return;
    }

    // Route based on message type for new connections
    if (parsed.type.startsWith('sdk_')) {
        await SyncModule.handleSDKMessage(ws, parsed);
    } else if (parsed.type === 'connected' || parsed.type === 'state' || parsed.type === 'actionResult') {
        await SyncModule.handleBotMessage(ws, parsed);
    }
}

function handleClose(ws: any) {
    SyncModule.handleClose(ws);
}

// ============ Server Setup ============

// Last-resort net. Bun exits(1) on an unhandled rejection by default, so a single
// missed `.catch()` anywhere would drop every bot and SDK session. Individual call
// sites still catch their own errors — this only keeps the router alive if one is
// ever added without one.
process.on('unhandledRejection', (reason) => {
    console.error('[Gateway] Unhandled rejection (ignored, gateway stays up):', reason);
});
process.on('uncaughtException', (error) => {
    console.error('[Gateway] Uncaught exception (ignored, gateway stays up):', error);
});

console.log(`[Gateway] Starting Gateway Service on port ${GATEWAY_PORT}...`);

const server = Bun.serve({
    port: GATEWAY_PORT,

    async fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (req.headers.get('upgrade') === 'websocket') {
            const upgraded = server.upgrade(req);
            if (upgraded) return undefined;
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        };

        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Per-bot status endpoint: /status/:username
        const botStatusMatch = url.pathname.match(/^\/status\/(.+)$/);
        if (botStatusMatch && botStatusMatch[1]) {
            const username = decodeURIComponent(botStatusMatch[1]);
            const botSession = botSessions.get(username);

            const controllers = SyncModule.getControllersForBot(username).map(s => s.sessionId);
            const observers = SyncModule.getObserversForBot(username).map(s => s.sessionId);

            const isConnected = !!botSession?.ws;
            const stateAge = botSession?.lastStateReceivedAt
                ? Date.now() - botSession.lastStateReceivedAt
                : null;

            const response = {
                status: botSession ? getSessionStatus(botSession) : 'dead',
                inGame: isConnected ? (botSession?.lastState?.inGame || false) : false,
                stateAge,
                maxMessageLength: botSession?.maxMessageLength ?? null,
                controllers,
                observers,
                player: isConnected && botSession?.lastState?.player ? {
                    name: botSession.lastState.player.name,
                    worldX: botSession.lastState.player.worldX,
                    worldZ: botSession.lastState.player.worldZ
                } : null,
            };

            return new Response(JSON.stringify(response, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), {
            status,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

        // Read recent chat: GET /chat/:username?limit=20&system=1
        //
        // Serves from the gateway's accumulated per-bot history, so one bounded
        // HTTP request replaces the observer-WebSocket dance (connect, wait for
        // a state frame, read, disconnect). Over TLS tunnels that dance is a
        // real handshake per invocation and the dominant source of chat-tool
        // flakiness.
        const chatMatch = url.pathname.match(/^\/chat\/(.+)$/);
        if (chatMatch && chatMatch[1] && req.method === 'GET') {
            const username = decodeURIComponent(chatMatch[1]);
            const auth = await authenticateHttpRequest(req, url, username);
            if (!auth.success) {
                return jsonResponse({ error: `Authentication failed: ${auth.error}` }, 401);
            }

            const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
            const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
            const systemParam = url.searchParams.get('system');
            const includeSystem = systemParam === '1' || systemParam === 'true';
            const types = new Set<number>(includeSystem ? [0, ...PLAYER_CHAT_TYPES] : PLAYER_CHAT_TYPES);

            const all = (chatHistories.get(username)?.all() ?? []).filter(m => types.has(m.type));
            const botSession = botSessions.get(username);
            return jsonResponse({
                messages: limit > 0 ? all.slice(-limit) : all,
                botStatus: botSession ? getSessionStatus(botSession) : 'dead'
            });
        }

        // Send chat: POST /say/:username  body: {"text": "...", "password"?: "...", "timeoutMs"?: n}
        //
        // Relays through the bot's game client like observer 'say' does, but as
        // a single request/response with a hard per-chunk deadline - a caller
        // can trust that this either answers or fails within its budget.
        const sayMatch = url.pathname.match(/^\/say\/(.+)$/);
        if (sayMatch && sayMatch[1] && req.method === 'POST') {
            const username = decodeURIComponent(sayMatch[1]);
            let body: any;
            try {
                body = await req.json();
            } catch {
                return jsonResponse({ error: 'Body must be JSON: {"text": "..."}' }, 400);
            }
            const text = typeof body?.text === 'string' ? body.text.trim() : '';
            if (!text) {
                return jsonResponse({ error: 'Missing "text"' }, 400);
            }
            const auth = await authenticateHttpRequest(req, url, username, body?.password);
            if (!auth.success) {
                return jsonResponse({ error: `Authentication failed: ${auth.error}` }, 401);
            }

            const botSession = botSessions.get(username);
            if (!botSession || !botSession.ws) {
                return jsonResponse({
                    error: `Bot not connected - no game client is logged in as '${username}', so there is nothing to relay chat through`
                }, 409);
            }

            const timeoutRaw = Number(body?.timeoutMs);
            const perChunkTimeout = Math.min(Math.max(Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10000, 2000), 30000);
            const chunks = chunkMessage(text, botSession.maxMessageLength ?? 80);

            const results: any[] = [];
            let ok = true;
            for (let i = 0; i < chunks.length; i++) {
                const result = await dispatchHttpSay(botSession, chunks[i]!, perChunkTimeout);
                results.push({ chunk: chunks[i], ...result });
                if (!result.success) {
                    // The relay is broken; burning the timeout again per
                    // remaining chunk helps nobody.
                    ok = false;
                    for (let j = i + 1; j < chunks.length; j++) {
                        results.push({ chunk: chunks[j], success: false, message: 'Skipped: previous chunk failed' });
                    }
                    break;
                }
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 600));  // ~1 tick so chunks don't collide
                }
            }
            return jsonResponse({ ok, results }, ok ? 200 : 502);
        }

        // Status endpoint (admin/debugging - more detailed)
        if (url.pathname === '/' || url.pathname === '/status') {
            const bots: Record<string, any> = {};
            for (const [username, session] of botSessions) {
                const isConnected = session.ws !== null;
                bots[username] = {
                    status: getSessionStatus(session),
                    inGame: isConnected ? (session.lastState?.inGame || false) : false,
                    clientId: session.clientId,
                    tick: session.lastState?.tick || 0,
                    player: isConnected ? (session.lastState?.player?.name || null) : null
                };
            }

            const sdks: Record<string, any> = {};
            for (const [id, session] of sdkSessions) {
                sdks[id] = {
                    clientId: session.sdkClientId,
                    targetUsername: session.targetUsername,
                    mode: session.mode
                };
            }

            return new Response(JSON.stringify({
                status: 'running',
                bots,
                sdks
            }, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        return new Response(`Gateway Service (port ${GATEWAY_PORT})

Endpoints:
- GET /status              All connections status
- GET /status/:username    Per-bot status (controllers, observers)
- GET /chat/:username      Recent chat (?limit=20&system=1)
- POST /say/:username      Send chat ({"text": "..."}); relayed through the bot's game client

WebSocket:
- ws://localhost:${GATEWAY_PORT}    Bot/SDK connections

Bots: ${botSessions.size} | SDKs: ${sdkSessions.size}
`, {
            headers: { 'Content-Type': 'text/plain', ...corsHeaders }
        });
    },

    websocket: {
        open(ws: any) {
            // Bot/SDK connections identify themselves via first message
        },

        message(ws: any, message: string | Buffer) {
            // handleMessage is async: without this catch a throw anywhere in a handler
            // becomes an unhandled rejection, which Bun treats as fatal (exit 1) and
            // takes down every other session with it. One bad frame must only ever
            // affect its own socket.
            handleMessage(ws, message.toString()).catch((error) => {
                console.error('[Gateway] Unhandled error while handling message:', error);
                try { ws.close(); } catch {}
            });
        },

        close(ws: any) {
            try {
                handleClose(ws);
            } catch (error) {
                console.error('[Gateway] Unhandled error while closing socket:', error);
            }
        }
    }
});

console.log(`[Gateway] Gateway running at http://localhost:${GATEWAY_PORT}`);
console.log(`[Gateway] Bot/SDK: ws://localhost:${GATEWAY_PORT}`);

// Connect to login server for authentication
if (LOGIN_SERVER_ENABLED) {
    console.log(`[Gateway] Authentication ENABLED (via login server)`);
    connectToLoginServer();
} else {
    console.log(`[Gateway] Authentication DISABLED (set LOGIN_SERVER=true to enable)`);
}
