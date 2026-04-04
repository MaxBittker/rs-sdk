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
        const timeout = setTimeout(() => {
            pendingAuthRequests.delete(replyTo);
            resolve({ success: false, error: 'Authentication timeout' });
        }, 10000);

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
}

// Session status for diagnostics
type SessionStatus = 'active' | 'stale' | 'dead';

const STALE_THRESHOLD_MS = 8000;  // 30 seconds without state = stale

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
 */
interface SDKSession {
    ws: any;
    sdkClientId: string;
    targetUsername: string;
    mode: SDKConnectionMode;
}

// ============ State ============
//
// Session Maps:
// - botSessions: Keyed by username (only one bot per username allowed)
// - sdkSessions: Keyed by sdkClientId (multiple SDKs per bot allowed)
// - wsToType: Reverse lookup from WebSocket to session type/id
// - pendingTakeovers: Tracks new connections waiting for old session to close

const botSessions = new Map<string, BotSession>();      // username -> BotSession
const sdkSessions = new Map<string, SDKSession>();      // sdkClientId -> SDKSession
const wsToType = new Map<any, { type: 'bot' | 'sdk'; id: string }>();

// Pending takeovers: new bot waiting for old session to close
interface PendingTakeover {
    ws: any;
    clientId: string;
    username: string;
    timeout: ReturnType<typeof setTimeout>;
}
const pendingTakeovers = new Map<string, PendingTakeover>();  // username -> pending new connection

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
    completeBotConnection(ws: any, clientId: string, username: string, preservedState?: BotSession | null) {
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
            lastHeartbeat: now
        };

        botSessions.set(username, session);
        wsToType.set(ws, { type: 'bot', id: username });

        console.log(`[Gateway] Bot connected: ${clientId} (${username})`);

        this.sendToBot(session, { type: 'status', status: 'Connected to gateway' });

        for (const sdkSession of this.getSDKSessionsForBot(username)) {
            this.sendToSDK(sdkSession, { type: 'sdk_connected', success: true });
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

                pendingTakeovers.set(username, { ws, clientId, username, timeout });

                // Don't complete the connection yet - wait for old session to close
                return;
            }

            // No existing session or same ws reconnecting - complete immediately
            this.completeBotConnection(ws, clientId, username, existingSession);
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
            const sdkClientId = message.clientId || `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const targetUsername = message.username;
            const mode: SDKConnectionMode = message.mode || 'control';

            // Authenticate via login server (if enabled)
            const authResult = await authenticateSDK(targetUsername, message.password || '');
            if (!authResult.success) {
                console.log(`[Gateway] SDK auth failed: ${sdkClientId} -> ${targetUsername} (${authResult.error})`);
                ws.send(JSON.stringify({
                    type: 'sdk_error',
                    error: `Authentication failed: ${authResult.error}`
                }));
                ws.close();
                return;
            }

            const session: SDKSession = { ws, sdkClientId, targetUsername, mode };
            sdkSessions.set(sdkClientId, session);
            wsToType.set(ws, { type: 'sdk', id: sdkClientId });

            // Last controller wins: disconnect existing controllers for this bot
            if (mode === 'control') {
                const oldControllers = this.getControllersForBot(targetUsername)
                    .filter(s => s.sdkClientId !== sdkClientId);

                for (const old of oldControllers) {
                    console.log(`[Gateway] Pre-empting old controller ${old.sdkClientId} for ${targetUsername} (replaced by ${sdkClientId})`);
                    this.sendToSDK(old, {
                        type: 'sdk_error',
                        error: 'Disconnected: another controller connected'
                    });
                    sdkSessions.delete(old.sdkClientId);
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
                otherControllers: 0  // Always 0 now since we pre-empt old controllers
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
            const wsInfo = wsToType.get(ws);
            if (!wsInfo || wsInfo.type !== 'sdk') return;

            const sdkSession = sdkSessions.get(wsInfo.id);
            if (!sdkSession) return;

            // Gate actions based on mode - observe mode cannot send actions
            if (sdkSession.mode === 'observe') {
                this.sendToSDK(sdkSession, {
                    type: 'sdk_error',
                    actionId: message.actionId,
                    error: 'Cannot send actions in observe mode'
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
                actionId: message.actionId
            });

            console.log(`[Gateway] [${botSession.username}] SDK action: ${message.action?.type} (${message.actionId})`);
        }

        if (message.type === 'sdk_screenshot_request') {
            const wsInfo = wsToType.get(ws);
            if (!wsInfo || wsInfo.type !== 'sdk') return;

            const sdkSession = sdkSessions.get(wsInfo.id);
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
                            this.completeBotConnection(pending.ws, pending.clientId, pending.username, session);
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
            if (session) {
                console.log(`[Gateway] SDK disconnected: ${session.sdkClientId}`);
                sdkSessions.delete(wsInfo.id);
            }
        }

        wsToType.delete(ws);
    }
};

// ============ Message Router ============

async function handleMessage(ws: any, data: string) {
    let parsed: any;
    try {
        parsed = JSON.parse(data);
    } catch {
        console.error('[Gateway] Invalid JSON');
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
    if (parsed.type?.startsWith('sdk_')) {
        await SyncModule.handleSDKMessage(ws, parsed);
    } else if (parsed.type === 'connected' || parsed.type === 'state' || parsed.type === 'actionResult') {
        await SyncModule.handleBotMessage(ws, parsed);
    }
}

function handleClose(ws: any) {
    SyncModule.handleClose(ws);
}

// ============ Server Setup ============

console.log(`[Gateway] Starting Gateway Service on port ${GATEWAY_PORT}...`);

const server = Bun.serve({
    port: GATEWAY_PORT,

    fetch(req, server) {
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
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Per-bot status endpoint: /status/:username
        const botStatusMatch = url.pathname.match(/^\/status\/(.+)$/);
        if (botStatusMatch && botStatusMatch[1]) {
            const username = decodeURIComponent(botStatusMatch[1]);
            const botSession = botSessions.get(username);

            const controllers = SyncModule.getControllersForBot(username).map(s => s.sdkClientId);
            const observers = SyncModule.getObserversForBot(username).map(s => s.sdkClientId);

            const isConnected = !!botSession?.ws;
            const stateAge = botSession?.lastStateReceivedAt
                ? Date.now() - botSession.lastStateReceivedAt
                : null;

            const response = {
                status: botSession ? getSessionStatus(botSession) : 'dead',
                inGame: isConnected ? (botSession?.lastState?.inGame || false) : false,
                stateAge,
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
            handleMessage(ws, message.toString());
        },

        close(ws: any) {
            handleClose(ws);
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
