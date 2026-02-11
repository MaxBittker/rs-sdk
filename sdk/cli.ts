#!/usr/bin/env bun
// SDK CLI - Dump world state for a connected bot
//
// Usage:
//   bun sdk/cli.ts <botname>                                # Loads from bots/<botname>/bot.env
//   bun sdk/cli.ts <username> <password>                    # Direct credentials
//   bun sdk/cli.ts <username> <password> --server <url>     # Custom server
//   bun --env-file=bots/<name>/bot.env sdk/cli.ts           # Via --env-file
//
// Examples:
//   bun sdk/cli.ts mybot
//   bun sdk/cli.ts mybot secret --server localhost

import { BotSDK, deriveGatewayUrl } from './index';
import { formatWorldState } from './formatter';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function printUsage() {
    console.log(`
SDK CLI - Dump world state for a connected bot

Usage:
  bun sdk/cli.ts <botname>                    # Loads from bots/<botname>/bot.env
  bun sdk/cli.ts <username> <password>        # Direct credentials
  bun --env-file=bots/<name>/bot.env sdk/cli.ts

Options:
  --server <host>   Server hostname (default: from bot.env or rs-sdk-demo.fly.dev)
  --timeout <ms>    Connection timeout in ms (default: 5000)
  --help            Show this help

Examples:
  bun sdk/cli.ts mybot
  bun sdk/cli.ts mybot secret --server localhost
`.trim());
}

/**
 * Try to load credentials from bots/<name>/bot.env
 */
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

async function main() {
    const args = process.argv.slice(2);

    // Parse args
    let username = process.env.BOT_USERNAME || process.env.USERNAME || '';
    let password = process.env.PASSWORD || '';
    let server = process.env.SERVER || '';
    let timeout = 5000;

    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else if (arg === '--server' || arg === '-s') {
            server = args[++i] ?? server;
        } else if (arg === '--timeout' || arg === '-t') {
            timeout = parseInt(args[++i] ?? '5000', 10);
        } else if (!arg.startsWith('-')) {
            positional.push(arg);
        }
    }

    // Try to load from bots/<name>/bot.env if single positional arg
    if (positional.length === 1 && !password) {
        const botEnv = tryLoadBotEnv(positional[0]!);
        if (botEnv) {
            username = botEnv.username;
            password = botEnv.password;
            if (botEnv.server && !server) server = botEnv.server;
        } else {
            // Fall back to treating it as username
            username = positional[0]!;
        }
    } else {
        // Positional args: <username> <password>
        if (positional[0]) username = positional[0];
        if (positional[1]) password = positional[1];
    }

    // Default server if not set
    if (!server) server = 'rs-sdk-demo.fly.dev';

    const isLocal = server === 'localhost' || server.startsWith('localhost:');

    if (!username) {
        console.error('Error: Username required');
        console.error('Usage: bun sdk/cli.ts <username> [password] [--server <host>]');
        process.exit(1);
    }

    if (!password && !isLocal) {
        console.error('Error: Password required for remote servers');
        console.error('Usage: bun sdk/cli.ts <username> <password> [--server <host>]');
        process.exit(1);
    }

    const gatewayUrl = deriveGatewayUrl(server);

    // Create SDK - never auto-launch browser in CLI mode
    const sdk = new BotSDK({
        botUsername: username,
        password,
        gatewayUrl,
        autoReconnect: false,
        autoLaunchBrowser: false
    });

    // Connect with timeout
    try {
        const connectTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout')), timeout);
        });

        await Promise.race([sdk.connect(), connectTimeout]);
    } catch (err: any) {
        console.error(`Error: Failed to connect to ${gatewayUrl}`);
        console.error(`  ${err.message}`);
        process.exit(1);
    }

    // Wait briefly for state
    try {
        await sdk.waitForCondition(s => s !== null, Math.min(timeout, 3000));
    } catch {
        // State may not arrive if bot isn't connected
    }

    const state = sdk.getState();
    const stateAge = sdk.getStateAge();

    if (!state) {
        console.error(`Error: No state received for '${username}'`);
        console.error(`  Bot may not be connected to the game server.`);
        console.error(`  Connect the bot first via the web client.`);
        sdk.disconnect();
        process.exit(1);
    }

    // Warn about stale data (> 5 seconds old)
    const STALE_THRESHOLD = 5000;
    if (stateAge > STALE_THRESHOLD) {
        console.log(`⚠ STALE DATA: State is ${Math.round(stateAge / 1000)}s old (bot may not be actively connected)\n`);
    }

    if (!state.inGame) {
        console.log(`Note: Bot '${username}' is not in-game (tick: ${state.tick})`);
        console.log(`Last known state:\n`);
    }

    // Output formatted state
    console.log(formatWorldState(state, stateAge));

    sdk.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
});
