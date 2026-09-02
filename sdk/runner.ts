// Script Runner - Zero boilerplate script execution
// Auto-finds bot.env sibling to script, or from command line arg, or --env-file

import { BotSDK, deriveGatewayUrl } from './index';
import { BotActions } from './actions';
import { initPathfinding } from './pathfinding';
import { formatWorldStateSummary } from './formatter';
import type { BotWorldState } from './types';
import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

// ============ Types ============

/** Error thrown when bot client disconnects during script execution */
export class BotDisconnectedError extends Error {
    constructor(message: string = 'Bot client disconnected') {
        super(message);
        this.name = 'BotDisconnectedError';
    }
}

export interface ScriptContext {
    bot: BotActions;
    sdk: BotSDK;
}

export type ScriptFunction = (ctx: ScriptContext) => Promise<any>;

export interface RunOptions {
    /** Overall timeout in ms (default: none) */
    timeout?: number;
    /** Existing connection - use instead of process.env */
    connection?: { bot: BotActions; sdk: BotSDK };
    /** Connect if not connected (default: true) */
    autoConnect?: boolean;
    /**
     * Disconnect the bot when the script finishes (default: true when the
     * runner opened the connection itself, false when one was passed via
     * `connection`). Pass `false` to keep the connection alive after the
     * script exits — e.g. when an MCP server or another process shares this
     * bot and a disconnect would leave it stale.
     */
    disconnectAfter?: boolean;
    /**
     * Print a short state summary after execution (default: true) -
     * position, XP gained, inventory, anything blocking, last few messages.
     * Run `bun sdk/cli.ts {username}` for the full world state.
     */
    printState?: boolean;
    /**
     * How to handle bot client disconnection during script execution:
     * - 'error': Throw BotDisconnectedError immediately when disconnected (default)
     * - 'wait': Pause and wait for reconnection (requires autoReconnect on SDK)
     * - 'ignore': Don't monitor, let actions fail naturally
     */
    onDisconnect?: 'error' | 'wait' | 'ignore';
    /** Timeout for waiting for reconnection when onDisconnect='wait' (default: 60000ms) */
    reconnectTimeout?: number;
}

export interface RunResult {
    success: boolean;
    result?: any;
    error?: Error;
    duration: number;
    finalState: BotWorldState | null;
}

// ============ Connection Management ============

interface BotConnection {
    sdk: BotSDK;
    bot: BotActions;
    username: string;
}

const connections = new Map<string, BotConnection>();

/**
 * Parse a bot.env file and load into process.env
 */
function loadEnvFile(envPath: string): void {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            process.env[key] = value;
        }
    }
}

/**
 * Load bot credentials automatically.
 * Priority:
 * 1. Already set in process.env (via --env-file)
 * 2. bot.env sibling to the script file
 * 3. Command line arg: bun script.ts <botname> -> bots/<botname>/bot.env
 */
function loadEnvFromArgs(): void {
    // Skip if already have credentials (e.g., from --env-file)
    if (process.env.BOT_USERNAME && process.env.PASSWORD) return;

    // Try bot.env sibling to the script file
    const scriptPath = process.argv[1];
    if (scriptPath) {
        const scriptDir = dirname(resolve(scriptPath));
        const siblingEnv = join(scriptDir, 'bot.env');
        if (existsSync(siblingEnv)) {
            loadEnvFile(siblingEnv);
            return;
        }
    }

    // Try bot name from command line args
    const args = process.argv.slice(2);
    const botName = args.find(arg => !arg.startsWith('-'));

    if (!botName) return;

    const envPath = join(process.cwd(), 'bots', botName, 'bot.env');
    if (!existsSync(envPath)) {
        throw new Error(`Bot "${botName}" not found at ${envPath}`);
    }

    loadEnvFile(envPath);
}

async function getOrCreateConnection(): Promise<BotConnection> {
    // Try to load from command line args first
    loadEnvFromArgs();

    // Read credentials from process.env
    const username = process.env.BOT_USERNAME;
    const password = process.env.PASSWORD;
    const server = process.env.SERVER;
    // Default: true. Opt out with SHOW_CHAT=false in bot.env.
    const showChat = process.env.SHOW_CHAT?.toLowerCase() !== 'false';

    if (!username) {
        throw new Error('BOT_USERNAME not set. Run with: bun --env-file=bots/{name}/bot.env script.ts\nOr: bun script.ts {botname}');
    }

    if (!password) {
        throw new Error('PASSWORD not set. Run with: bun --env-file=bots/{name}/bot.env script.ts\nOr: bun script.ts {botname}');
    }

    const existing = connections.get(username);
    if (existing && existing.sdk.isConnected()) {
        return existing;
    }

    const gatewayUrl = deriveGatewayUrl(server);

    // Warm the pathfinder BEFORE the live socket exists. Init is fully
    // synchronous (tens of seconds on slow hosts), and paying it lazily
    // inside the first walkTo blocks the event loop long enough for the
    // gateway to kill the connection on missed pings - which presented as
    // "interactLoc froze the whole process". Idempotent, so repeat
    // connections skip it.
    initPathfinding();

    console.error(`[Runner] Connecting to bot "${username}"...`);

    const sdk = new BotSDK({
        botUsername: username,
        password,
        gatewayUrl,
        connectionMode: 'control',
        autoReconnect: true,
        // Standalone bot scripts must attach to an already-running client. In
        // particular, Lite fleets should never fall back to opening a browser
        // when a headless session is temporarily unavailable.
        autoLaunchBrowser: false,
        showChat
    });

    const bot = new BotActions(sdk);

    // Cover the browser-launch wait (up to browserLaunchTimeout) plus the
    // handshake and ready waits that follow it, not just the handshake.
    const CONNECT_TIMEOUT_MS = 90_000;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS);
    });

    try {
        await Promise.race([sdk.connect(), timeoutPromise]);
    } catch (error) {
        // The BotSDK was never registered in `connections`, so nothing else will
        // ever tear it down - and with autoReconnect on, its reconnect timers
        // would keep the process alive as a zombie holding the bot's control
        // connection while runScript has already given up.
        await sdk.disconnect().catch(() => {});
        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }

    console.error(`[Runner] Connected to bot "${username}"`);

    const connection: BotConnection = { sdk, bot, username };
    connections.set(username, connection);

    return connection;
}

// ============ Core Runner ============

/**
 * Run a script with zero boilerplate.
 *
 * Credentials are loaded automatically:
 * 1. From process.env (via bun --env-file)
 * 2. From bot.env sibling to the script (bun bots/mybot/script.ts)
 * 3. From command line arg (bun script.ts mybot)
 *
 * @example
 * // Just run from the bot directory - auto-finds bot.env:
 * // bun bots/mybot/script.ts
 *
 * import { runScript } from '../../sdk/runner';
 *
 * await runScript(async (ctx) => {
 *   await ctx.bot.chopTree();
 * });
 *
 * @example
 * // With existing connection
 * await runScript(async (ctx) => {
 *   await ctx.bot.chopTree();
 * }, { connection: { bot, sdk } });
 */
export async function runScript(
    script: ScriptFunction,
    options: RunOptions = {}
): Promise<RunResult> {
    const {
        timeout,
        connection,
        autoConnect = true,
        printState = true,
        onDisconnect = 'error',
        reconnectTimeout = 60000
    } = options;
    // Default disconnectAfter to true for CLI (managed connections), false for external connections
    const disconnectAfter = options.disconnectAfter ?? !connection;

    const startTime = Date.now();

    // Get bot/sdk either from connection or by connecting
    let bot: BotActions;
    let sdk: BotSDK;
    let managedConnection = false;

    if (connection) {
        bot = connection.bot;
        sdk = connection.sdk;
    } else {
        // Use process.env for credentials (loaded by bun --env-file or command line arg)
        try {
            if (autoConnect) {
                const conn = await getOrCreateConnection();
                bot = conn.bot;
                sdk = conn.sdk;
                managedConnection = true;
            } else {
                // Try to load env from args first
                loadEnvFromArgs();
                const username = process.env.BOT_USERNAME;
                if (!username) {
                    throw new Error('BOT_USERNAME not set. Run with: bun --env-file=bots/{name}/bot.env script.ts\nOr: bun script.ts {botname}');
                }
                const existing = connections.get(username);
                if (!existing || !existing.sdk.isConnected()) {
                    throw new Error(`Bot "${username}" is not connected and autoConnect is false`);
                }
                bot = existing.bot;
                sdk = existing.sdk;
                managedConnection = true;
            }
        } catch (error: any) {
            console.error(`[Runner] Failed to connect: ${error?.message ?? error}`);
            return {
                success: false,
                error,
                duration: Date.now() - startTime,
                finalState: null
            };
        }
    }

    // Create script context
    const ctx: ScriptContext = {
        bot,
        sdk,
    };

    // Baseline XP so the summary can report what the script actually earned
    const xpBefore: Record<string, number> = {};
    for (const skill of sdk.getState()?.skills ?? []) {
        xpBefore[skill.name] = skill.experience;
    }

    // Clean exit on signals - prevents orphaned processes when parent shell is killed
    let signalReceived = false;
    const signalCleanup = (signal: string, exitCode: number) => {
        if (signalReceived) {
            // Second signal: the disconnect is wedged, exit immediately.
            process.exit(exitCode);
        }
        signalReceived = true;
        console.error(`[Runner] Received ${signal} - disconnecting and exiting...`);
        // Exit 128+signum, never 0: a supervisor must not read a killed run
        // as success. And a wedged disconnect must not hang the process.
        setTimeout(() => process.exit(exitCode), 5000);
        sdk.disconnect().finally(() => process.exit(exitCode));
    };
    const onSigterm = () => signalCleanup('SIGTERM', 143);
    const onSigint = () => signalCleanup('SIGINT', 130);
    const onSighup = () => signalCleanup('SIGHUP', 129);
    process.on('SIGTERM', onSigterm);
    process.on('SIGINT', onSigint);
    process.on('SIGHUP', onSighup);

    // Execute script with connection monitoring
    let result: any;
    let error: Error | undefined;
    let unsubscribeConnection: (() => void) | null = null;
    let disconnectReject: ((err: Error) => void) | null = null;

    try {
        // Set up connection monitoring
        const scriptPromise = new Promise<any>(async (resolve, reject) => {
            disconnectReject = reject;
            try {
                const scriptResult = await script(ctx);
                resolve(scriptResult);
            } catch (e) {
                reject(e);
            }
        });

        // Create race conditions based on options
        const promises: Promise<any>[] = [scriptPromise];

        // Add timeout if specified
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        if (timeout) {
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout);
            });
            promises.push(timeoutPromise);
        }

        // Add connection monitoring if not ignored
        if (onDisconnect !== 'ignore') {
            unsubscribeConnection = sdk.onConnectionStateChange(async (state, attempt) => {
                if (state === 'disconnected' || state === 'reconnecting') {
                    if (onDisconnect === 'error') {
                        // Fail immediately
                        console.error(`[Runner] Bot client disconnected - aborting script`);
                        if (disconnectReject) {
                            disconnectReject(new BotDisconnectedError('Bot client disconnected during script execution'));
                        }
                    } else if (onDisconnect === 'wait') {
                        // Log and wait for reconnection
                        console.error(`[Runner] Bot client disconnected - waiting for reconnection (timeout: ${reconnectTimeout}ms)...`);
                        try {
                            await sdk.waitForConnection(reconnectTimeout);
                            console.error(`[Runner] Bot client reconnected - resuming script`);
                        } catch (e) {
                            console.error(`[Runner] Reconnection failed - aborting script`);
                            if (disconnectReject) {
                                disconnectReject(new BotDisconnectedError('Bot client failed to reconnect within timeout'));
                            }
                        }
                    }
                }
            });
        }

        result = await Promise.race(promises);

        // Clear timeout if it was set
        if (timeoutId) clearTimeout(timeoutId);
    } catch (e: any) {
        error = e;
    } finally {
        // Clean up connection listener
        if (unsubscribeConnection) {
            unsubscribeConnection();
        }
        // Remove signal handlers
        process.off('SIGTERM', onSigterm);
        process.off('SIGINT', onSigint);
        process.off('SIGHUP', onSighup);
    }

    // Get final state
    const finalState = sdk.getState();
    const duration = Date.now() - startTime;

    // Print result if any
    if (result !== undefined && !error) {
        console.log('');
        console.log('── Result ──');
        console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    }

    // Print error if any. Also fail the process so `bun script.ts` exits non-zero.
    if (error) {
        console.log('');
        console.log(`── Error ── ${error.name}: ${error.message}`);
        // First few frames are enough to locate it
        for (const frame of (error.stack ?? '').split('\n').slice(1, 5)) {
            console.log(frame);
        }
        if (managedConnection) process.exitCode = 1;
    }

    // Print state if requested
    if (printState && finalState) {
        console.log('');
        console.log('── State ──');
        console.log(formatWorldStateSummary(finalState, sdk.getStateAge(), { xpBefore }));
    }

    // Disconnect if requested (only for managed connections)
    if (disconnectAfter && managedConnection) {
        const username = process.env.BOT_USERNAME;
        if (username) {
            console.error(`[Runner] Disconnecting bot "${username}"...`);
            // Bound the disconnect - a wedged socket must not hang the exit.
            await Promise.race([
                sdk.disconnect(),
                new Promise(resolve => setTimeout(resolve, 10000)),
            ]);
            connections.delete(username);
            // A leaked handle (reconnect timer, half-closed socket) used to
            // keep the bun process alive for minutes after the script was
            // done. Unref'd, so it never delays a clean exit; it only fires
            // when something else is wedging the event loop.
            const forceExit = setTimeout(() => {
                console.error('[Runner] Event loop still alive after disconnect - forcing exit');
                process.exit(process.exitCode ?? 0);
            }, 5000);
            forceExit.unref?.();
        }
    }

    return {
        success: !error,
        result: error ? undefined : result,
        error,
        duration,
        finalState
    };
}
