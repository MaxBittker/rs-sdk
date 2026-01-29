#!/usr/bin/env bun
import { BotSDK, BotActions } from '../../sdk/actions';

// Load config from environment (set by bot.env)
const BOT_USERNAME = process.env.BOT_USERNAME!;
const PASSWORD = process.env.PASSWORD!;
const SERVER = process.env.SERVER || 'rs-sdk-demo.fly.dev';

const GATEWAY_URL = SERVER === 'localhost'
    ? `ws://${SERVER}:7780`
    : `wss://${SERVER}/gateway`;

async function main() {
    const sdk = new BotSDK({
        botUsername: BOT_USERNAME,
        password: PASSWORD,
        gatewayUrl: GATEWAY_URL,
        autoLaunchBrowser: true,
    });

    sdk.onConnectionStateChange((state) => {
        console.log(`Connection: ${state}`);
    });

    await sdk.connect();
    await sdk.waitForCondition(s => s.inGame, 60000);

    const bot = new BotActions(sdk);
    const state = sdk.getState()!;
    console.log(`In-game as ${state.player?.name} at (${state.player?.worldX}, ${state.player?.worldZ})`);

    // === YOUR SCRIPT LOGIC BELOW ===

    // Example: chop a tree
    const tree = sdk.findNearbyLoc(/^tree$/i);
    if (tree) {
        console.log(`Found tree at (${tree.x}, ${tree.z})`);
        const result = await bot.chopTree(tree);
        console.log(result.message);
    }

    // === END SCRIPT LOGIC ===

    // Keep running for 60 seconds (adjust as needed)
    await new Promise(r => setTimeout(r, 60_000));
    await sdk.disconnect();
}

main().catch(console.error);
