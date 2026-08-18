#!/usr/bin/env bun
// SDK Chat CLI - send and read chat without taking control of the bot
//
// Talks to the gateway's HTTP chat endpoints (POST /say/:bot, GET /chat/:bot),
// so every invocation is one bounded request/response - there is no
// per-invocation WebSocket handshake to stall on a flaky link, and a dead
// game-client relay fails fast with a clear message instead of hanging.
// Gateways that predate the HTTP endpoints get the legacy observer-WebSocket
// path automatically; --watch always uses it (it needs the live feed).
//
// Usage:
//   bun sdk/chat.ts <botname>                    # Show recent chat
//   bun sdk/chat.ts <botname> <message...>       # Send a message
//   bun sdk/chat.ts <botname> --watch            # Tail chat live (Ctrl+C to stop)

import { BotSDK, deriveGatewayUrl } from './index';
import type { GameMessage } from './types';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// No invocation (except --watch) may outlive this, whatever goes wrong - a
// chat check that silently eats a shell tool's whole timeout is worse than a
// failed one.
const HARD_DEADLINE_MS = 90_000;

function printUsage() {
    console.log(`
SDK Chat CLI - send and read chat without stealing bot control

Usage:
  bun sdk/chat.ts <botname>                 # Show recent chat
  bun sdk/chat.ts <botname> <message...>    # Send a message
  bun sdk/chat.ts <botname> --to <player> <message...>  # Send a private message
  bun sdk/chat.ts <botname> --watch         # Tail chat live (Ctrl+C to stop)

Options:
  --to <player>     Send as a private message to this player instead of public chat
  --limit <n>       Messages of history to show (default: 20)
  --system          Include system/game messages, not just player chat
  --server <host>   Server hostname (default: from bot.env or rs-sdk-demo.fly.dev)
  --timeout <ms>    Budget per network request (default: 5000)
  --help            Show this help

Examples:
  bun sdk/chat.ts mybot "meet me at the bank"
  bun sdk/chat.ts mybot --to otherbot "got the ruby, banking now"
  bun sdk/chat.ts mybot --watch
  bun sdk/chat.ts mybot --limit 50 --system

Private messages reach the target anywhere in the world (no friends-list setup
needed) and show up in chat reads as "[PM from ...]" / "[PM to ...]".

Sending requires a game client (browser or lite) to be logged in as the bot;
this tool only relays chat through it. Reading works off the same state feed
observers get.
`.trim());
}

/** Same bot.env resolution as sdk/cli.ts. */
function tryLoadBotEnv(botName: string): { username: string; password: string; server?: string } | null {
    const envPath = join(process.cwd(), 'bots', botName, 'bot.env');
    if (!existsSync(envPath)) return null;

    const content = readFileSync(envPath, 'utf-8');
    const env: Record<string, string> = {};

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
        }
    }

    if (!env.BOT_USERNAME || !env.PASSWORD) return null;

    return {
        username: env.BOT_USERNAME,
        password: env.PASSWORD,
        server: env.SERVER
    };
}

function formatMessage(m: GameMessage): string {
    if (m.type === 0) return `* ${m.text}`;
    if (m.type === 3 || m.type === 7) return `[PM from ${m.sender}] ${m.text}`;
    if (m.type === 6) return `[PM to ${m.sender}] ${m.text}`;
    return `${m.sender}: ${m.text}`;
}

const PLAYER_AND_SYSTEM_TYPES = [0, 1, 2, 3, 6, 7] as const;

/** ws://host -> http://host, wss://host/path -> https://host/path (the gateway serves both on one port). */
function gatewayHttpBase(gatewayUrl: string): string {
    return gatewayUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');
}

/**
 * fetch with a hard per-attempt timeout and one retry on network-level
 * failure (refused/reset/stalled connect - the flaky-tunnel cases). HTTP
 * error statuses are answers, not failures, and are returned as-is.
 */
async function boundedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        } catch (err) {
            lastErr = err;
            if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    throw lastErr;
}

/** True if this response came from a gateway that has the HTTP chat endpoints. */
function isChatEndpointResponse(res: Response): boolean {
    // Old gateways answer unknown paths with a 200 text/plain banner; the chat
    // endpoints always answer JSON (including their error statuses).
    return (res.headers.get('content-type') ?? '').includes('json');
}

interface CliContext {
    username: string;
    password: string;
    gatewayUrl: string;
    timeout: number;
    limit: number;
    system: boolean;
}

// ============ HTTP paths (primary) ============

/**
 * Returns exit code, or null if the gateway lacks the HTTP endpoints.
 * With `to` set, posts to /dm (a distinct path, so a pre-DM gateway answers
 * with its non-JSON banner and we fall back to WebSocket - a DM must never
 * silently degrade into public chat).
 */
async function sendViaHttp(ctx: CliContext, text: string, to?: string): Promise<number | null> {
    const base = gatewayHttpBase(ctx.gatewayUrl);
    const url = to
        ? `${base}/dm/${encodeURIComponent(ctx.username)}`
        : `${base}/say/${encodeURIComponent(ctx.username)}`;
    let res: Response;
    try {
        // The gateway bounds each chunk at 10s and aborts on first failure;
        // this attempt timeout only has to outlast a legitimate slow send.
        res = await boundedFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, to, password: ctx.password, timeoutMs: 10_000 })
        }, 60_000);
    } catch (err: any) {
        console.error(`Error: Failed to reach gateway at ${url}`);
        console.error(`  ${err?.message ?? err}`);
        return 1;
    }
    if (!isChatEndpointResponse(res)) return null;

    const body: any = await res.json().catch(() => null);
    if (res.status === 409) {
        console.error(`Error: Failed to send: ${body?.error ?? 'Bot not connected'}`);
        console.error(`  No game client is logged in as '${ctx.username}' - chat is relayed through it.`);
        console.error(`  Log the bot in (browser or lite client), then retry.`);
        return 1;
    }
    if (!body || (!res.ok && !Array.isArray(body.results))) {
        console.error(`Error: Failed to send: ${body?.error ?? `gateway answered ${res.status}`}`);
        return 1;
    }

    let ok = true;
    for (const result of body.results ?? []) {
        if (result.success) {
            console.log(`Sent${to ? ` [PM to ${to}]` : ''}: ${result.data?.finalText ?? result.chunk}`);
            if (result.data?.truncated) console.log('  (truncated by server cap)');
            if (result.data?.filtered) console.log('  (altered by word filter)');
        } else {
            ok = false;
            console.error(`Error: Failed to send: ${result.message}`);
        }
    }
    return ok ? 0 : 1;
}

/** Returns exit code, or null if the gateway lacks the HTTP endpoints. */
async function readViaHttp(ctx: CliContext): Promise<number | null> {
    const params = new URLSearchParams({ limit: String(ctx.limit) });
    if (ctx.system) params.set('system', '1');
    if (ctx.password) params.set('password', ctx.password);
    const url = `${gatewayHttpBase(ctx.gatewayUrl)}/chat/${encodeURIComponent(ctx.username)}?${params}`;

    let res: Response;
    try {
        res = await boundedFetch(url, {}, ctx.timeout);
    } catch (err: any) {
        console.error(`Error: Failed to reach gateway at ${url}`);
        console.error(`  ${err?.message ?? err}`);
        return 1;
    }
    if (!isChatEndpointResponse(res)) return null;

    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body || !Array.isArray(body.messages)) {
        console.error(`Error: Failed to read chat: ${body?.error ?? `gateway answered ${res.status}`}`);
        return 1;
    }

    if (body.messages.length === 0) {
        console.log('(no chat in recent history)');
        if (body.botStatus && body.botStatus !== 'active') {
            console.log(`(bot client is ${body.botStatus} - history only accumulates while it is connected)`);
        }
    }
    for (const m of body.messages as GameMessage[]) {
        console.log(formatMessage(m));
    }
    return 0;
}

// ============ Observer-WebSocket path (fallback + --watch) ============

async function runOverWebSocket(ctx: CliContext, messageToSend: string, watch: boolean, dmTarget?: string): Promise<number> {
    const sdk = new BotSDK({
        botUsername: ctx.username,
        password: ctx.password,
        gatewayUrl: ctx.gatewayUrl,
        connectionMode: 'observe',
        autoReconnect: watch,       // one-shots fail fast; watch survives blips
        autoLaunchBrowser: false,
        readyTimeout: 0,
        connectTimeout: ctx.timeout,   // SDK default (30s) is far past our budget
        actionTimeout: 15_000,         // a dead relay reports failure, not a 60s stall
        showChat: true
    });

    try {
        await sdk.connect();
    } catch (err: any) {
        console.error(`Error: Failed to connect to ${ctx.gatewayUrl}`);
        console.error(`  ${err.message}`);
        return 1;
    }

    if (messageToSend) {
        const results = dmTarget ? await sdk.dm(dmTarget, messageToSend) : await sdk.say(messageToSend);
        let ok = true;
        for (const result of results) {
            if (result.success) {
                const data = result.data as { finalText?: string; truncated?: boolean; filtered?: boolean } | undefined;
                console.log(`Sent${dmTarget ? ` [PM to ${dmTarget}]` : ''}: ${data?.finalText ?? messageToSend}`);
                if (data?.truncated) console.log('  (truncated by server cap)');
                if (data?.filtered) console.log('  (altered by word filter)');
            } else {
                ok = false;
                console.error(`Error: Failed to send: ${result.message}`);
                if (/bot not connected/i.test(result.message)) {
                    console.error(`  No game client is logged in as '${ctx.username}' - chat is relayed through it.`);
                    console.error(`  Log the bot in (browser or lite client), then retry.`);
                }
                if (dmTarget && /observe mode can only send 'say'/i.test(result.message)) {
                    console.error(`  This gateway predates private-message support - redeploy the gateway to enable DMs.`);
                }
            }
        }
        sdk.disconnect();
        return ok ? 0 : 1;
    }

    // Reading (history or watch) needs the state feed.
    const types = ctx.system ? PLAYER_AND_SYSTEM_TYPES : undefined;
    try {
        await sdk.waitForCondition(s => s !== null, ctx.timeout);
    } catch {
        if (sdk.isAuthenticated()) {
            console.error(`Error: No game state for '${ctx.username}' - nothing is logged in as this bot, so there's no chat feed.`);
        } else {
            console.error(`Error: No state received for '${ctx.username}'`);
        }
        sdk.disconnect();
        return 1;
    }

    const history = sdk.getChat({ limit: ctx.limit, types, includeSelf: true });
    if (history.length === 0) {
        console.log('(no chat in recent history)');
    }
    for (const m of history) {
        console.log(formatMessage(m));
    }
    // Drain the new-message cursor so watch mode only prints what arrives next.
    sdk.getNewChat({ types, includeSelf: true });

    if (!watch) {
        sdk.disconnect();
        return 0;
    }

    console.log(`--- watching chat for '${ctx.username}' (Ctrl+C to stop) ---`);
    setInterval(() => {
        for (const m of sdk.getNewChat({ types, includeSelf: true })) {
            const time = new Date().toTimeString().slice(0, 8);
            console.log(`[${time}] ${formatMessage(m)}`);
        }
    }, 500);
    return await new Promise<never>(() => {});  // runs until Ctrl+C
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(args.length === 0 ? 1 : 0);
    }

    let server = '';
    let timeout = 5000;
    let limit = 20;
    let watch = false;
    let system = false;
    let dmTarget = '';
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else if (arg === '--watch') {
            watch = true;
        } else if (arg === '--system') {
            system = true;
        } else if (arg === '--to') {
            dmTarget = args[++i] || '';
        } else if (arg === '--server') {
            server = args[++i] || '';
        } else if (arg === '--timeout') {
            timeout = parseInt(args[++i] || '', 10) || timeout;
        } else if (arg === '--limit') {
            limit = parseInt(args[++i] || '', 10) || limit;
        } else {
            positional.push(arg);
        }
    }

    const botName = positional[0];
    if (!botName) {
        console.error('Error: Bot name required');
        process.exit(1);
    }
    const messageToSend = positional.slice(1).join(' ');
    if (dmTarget && !messageToSend) {
        console.error('Error: --to requires a message to send');
        process.exit(1);
    }
    if (dmTarget.length > 12) {
        console.error(`Error: '--to ${dmTarget}' - player names are at most 12 characters`);
        process.exit(1);
    }

    let username = botName;
    let password = process.env.PASSWORD || '';
    const botEnv = tryLoadBotEnv(botName);
    if (botEnv) {
        username = botEnv.username;
        password = botEnv.password;
        if (botEnv.server && !server) server = botEnv.server;
    }
    if (!server) server = process.env.SERVER || 'rs-sdk-demo.fly.dev';

    const isLocal = server === 'localhost' || server.startsWith('localhost:');
    if (!password && !isLocal) {
        console.error('Error: Password required for remote servers');
        process.exit(1);
    }

    const ctx: CliContext = {
        username,
        password,
        gatewayUrl: deriveGatewayUrl(server),
        timeout,
        limit,
        system
    };

    if (!watch) {
        // Absolute backstop: no code path (including the WS fallback) may park
        // this process past the deadline.
        const deadline = setTimeout(() => {
            console.error(`Error: chat CLI exceeded its ${HARD_DEADLINE_MS / 1000}s deadline - giving up`);
            process.exit(1);
        }, HARD_DEADLINE_MS);
        if (typeof (deadline as any).unref === 'function') (deadline as any).unref();

        const httpExit = messageToSend ? await sendViaHttp(ctx, messageToSend, dmTarget || undefined) : await readViaHttp(ctx);
        if (httpExit !== null) process.exit(httpExit);
        // Gateway predates the HTTP chat endpoints - use the observer socket.
        process.exit(await runOverWebSocket(ctx, messageToSend, false, dmTarget || undefined));
    }

    await runOverWebSocket(ctx, '', true);
}

main();
