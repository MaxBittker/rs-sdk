// Script Runner - Zero boilerplate script execution
// Auto-finds bot.env sibling to script, or from command line arg, or --env-file

import { BotSDK, deriveGatewayUrl } from './index';
import { BotActions } from './actions';
import { formatWorldState } from './formatter';
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
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
}

export type ScriptFunction = (ctx: ScriptContext) => Promise<any>;

export interface RunOptions {
    /** Overall timeout in ms (default: none) */
    timeout?: number;
    /** Existing connection - use instead of process.env for MCP context */
    connection?: { bot: BotActions; sdk: BotSDK };
    /** Connect if not connected (default: true) */
    autoConnect?: boolean;
    /** Disconnect when done (default: false) */
    disconnectAfter?: boolean;
    /** Print world state after execution (default: true) */
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

export interface LogEntry {
    timestamp: Date;
    level: 'log' | 'warn' | 'error';
    message: string;
}

export interface RunResult {
    success: boolean;
    result?: any;
    error?: Error;
    duration: number;
    logs: LogEntry[];
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
    const showChat = process.env.SHOW_CHAT?.toLowerCase() === 'true';

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

    console.error(`[Runner] Connecting to bot "${username}"...`);

    const sdk = new BotSDK({
        botUsername: username,
        password,
        gatewayUrl,
        connectionMode: 'control',
        autoReconnect: true,
        showChat
    });

    const bot = new BotActions(sdk);

    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timed out after 30s')), 30000);
    });

    await Promise.race([sdk.connect(), timeoutPromise]);

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
 * // With existing connection (MCP context)
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
    // Default disconnectAfter to true for CLI (managed connections), false for MCP (external connections)
    const disconnectAfter = options.disconnectAfter ?? !connection;

    const startTime = Date.now();
    const logs: LogEntry[] = [];

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
            return {
                success: false,
                error,
                duration: Date.now() - startTime,
                logs,
                finalState: null
            };
        }
    }

    // Live logging with deduplication
    let pendingLog: { level: 'log' | 'warn' | 'error'; message: string; count: number } | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const FLUSH_DELAY = 2000;

    const flushPendingLog = () => {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        if (pendingLog) {
            const { level, message, count } = pendingLog;
            const prefix = level === 'warn' ? '[warn] ' : level === 'error' ? '[error] ' : '';
            const suffix = count > 1 ? ` (x${count})` : '';
            console.log(prefix + message + suffix);
            logs.push({ timestamp: new Date(), level, message: message + suffix });
            pendingLog = null;
        }
    };

    const emitLog = (level: 'log' | 'warn' | 'error', args: any[]) => {
        const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');

        // If same message, increment count and reset timer
        if (pendingLog && pendingLog.level === level && pendingLog.message === message) {
            pendingLog.count++;
            if (flushTimer) clearTimeout(flushTimer);
            flushTimer = setTimeout(flushPendingLog, FLUSH_DELAY);
            return;
        }

        // Different message - flush previous and start new
        flushPendingLog();
        pendingLog = { level, message, count: 1 };
        flushTimer = setTimeout(flushPendingLog, FLUSH_DELAY);
    };

    const capturedLog = (...args: any[]) => emitLog('log', args);
    const capturedWarn = (...args: any[]) => emitLog('warn', args);
    const capturedError = (...args: any[]) => emitLog('error', args);

    // Create script context
    const ctx: ScriptContext = {
        bot,
        sdk,
        log: capturedLog,
        warn: capturedWarn,
        error: capturedError
    };

    // Clean exit on signals - prevents orphaned processes when parent shell is killed
    let signalReceived = false;
    const signalCleanup = (signal: string) => {
        if (signalReceived) return; // Prevent double-cleanup
        signalReceived = true;
        console.error(`[Runner] Received ${signal} - disconnecting and exiting...`);
        sdk.disconnect().finally(() => process.exit(0));
    };
    const onSigterm = () => signalCleanup('SIGTERM');
    const onSigint = () => signalCleanup('SIGINT');
    const onSighup = () => signalCleanup('SIGHUP');
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

    // Flush any remaining pending log
    flushPendingLog();

    // Get final state
    const finalState = sdk.getState();
    const duration = Date.now() - startTime;

    // Print result if any
    if (result !== undefined && !error) {
        console.log('');
        console.log('── Result ──');
        console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    }

    // Print error if any
    if (error) {
        console.log('');
        console.log('── Error ──');
        console.log(error.message);
        if (error.stack) {
            console.log(error.stack);
        }
    }

    // Print state if requested
    if (printState && finalState) {
        console.log('');
        console.log('── World State ──');
        console.log(formatWorldState(finalState, sdk.getStateAge()));
    }

    // Disconnect if requested (only for managed connections)
    if (disconnectAfter && managedConnection) {
        const username = process.env.BOT_USERNAME;
        if (username) {
            console.error(`[Runner] Disconnecting bot "${username}"...`);
            await sdk.disconnect();
            connections.delete(username);
        }
    }

    return {
        success: !error,
        result: error ? undefined : result,
        error,
        duration,
        logs,
        finalState
    };
}

/**
 * Disconnect a bot by name
 */
export async function disconnectBot(botName: string): Promise<void> {
    const connection = connections.get(botName);
    if (connection) {
        await connection.sdk.disconnect();
        connections.delete(botName);
    }
}

/**
 * Get list of connected bots (managed by runner)
 */
export function listConnectedBots(): string[] {
    return Array.from(connections.keys()).filter(name => {
        const conn = connections.get(name);
        return conn && conn.sdk.isConnected();
    });
}
