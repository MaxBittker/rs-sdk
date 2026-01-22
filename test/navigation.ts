#!/usr/bin/env bun
/**
 * Navigation Test (SDK)
 * Walk from Lumbridge to Varrock to test long-distance navigation.
 *
 * This tests the walkTo porcelain method's ability to handle:
 * - Long distances (multi-step walking)
 * - Obstacles and pathfinding
 * - Route planning
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `walk${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 300;

// Varrock center (near fountain)
const VARROCK_CENTER = { x: 3212, z: 3428 };

async function runTest(): Promise<boolean> {
    console.log('=== Navigation Test (SDK) ===');
    console.log('Goal: Walk from Lumbridge to Varrock');

    // Start at Lumbridge
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: Locations.LUMBRIDGE_CASTLE,
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false, skipTutorial: false });
        const { sdk, bot } = session;

        // Wait for state to fully load
        await sdk.waitForCondition(s => s.player?.worldX > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        const startState = sdk.getState();
        const startX = startState?.player?.worldX ?? 0;
        const startZ = startState?.player?.worldZ ?? 0;
        console.log(`Start position: (${startX}, ${startZ})`);
        console.log(`Target: Varrock (${VARROCK_CENTER.x}, ${VARROCK_CENTER.z})`);

        const initialDist = Math.sqrt(
            Math.pow(VARROCK_CENTER.x - startX, 2) +
            Math.pow(VARROCK_CENTER.z - startZ, 2)
        );
        console.log(`Initial distance: ${initialDist.toFixed(0)} tiles`);

        // Walk to Varrock using the porcelain walkTo method
        console.log('\n--- Walking to Varrock ---');
        const startTime = Date.now();

        const result = await bot.walkTo(VARROCK_CENTER.x, VARROCK_CENTER.z, 10);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const endState = sdk.getState();
        const endX = endState?.player?.worldX ?? 0;
        const endZ = endState?.player?.worldZ ?? 0;

        const finalDist = Math.sqrt(
            Math.pow(VARROCK_CENTER.x - endX, 2) +
            Math.pow(VARROCK_CENTER.z - endZ, 2)
        );

        console.log(`\n=== Results ===`);
        console.log(`End position: (${endX}, ${endZ})`);
        console.log(`Distance to target: ${finalDist.toFixed(0)} tiles`);
        console.log(`Time elapsed: ${elapsed}s`);
        console.log(`Walk result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);

        // Success if we made significant progress (at least 50% of the way)
        const progress = ((initialDist - finalDist) / initialDist) * 100;
        console.log(`Progress: ${progress.toFixed(1)}% of distance covered`);

        if (finalDist <= 20) {
            console.log('SUCCESS: Reached Varrock area!');
            return true;
        } else if (progress >= 50) {
            console.log('SUCCESS: Made significant progress toward Varrock');
            return true;
        } else {
            console.log('FAILED: Did not make enough progress');
            return false;
        }

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
}

runTest()
    .then(ok => {
        console.log(ok ? '\nPASSED' : '\nFAILED');
        process.exit(ok ? 0 : 1);
    })
    .catch(e => {
        console.error('Fatal:', e);
        process.exit(1);
    });
