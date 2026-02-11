#!/usr/bin/env bun
/**
 * Walk Test: Spawn at (3244, 3395) and walk to Varrock center.
 * Tests pathfinding through Varrock's SE gate area with a fresh character.
 */

import { runTest } from './utils/test-runner';

const SPAWN = { x: 3244, z: 3395 };
const VARROCK_CENTER = { x: 3213, z: 3428 };

runTest({
    name: 'Walk to Varrock Center',
    saveConfig: {
        position: SPAWN,
        varps: { 281: 1000 },
    },
    launchOptions: { skipTutorial: true },
}, async ({ sdk, bot }) => {
    await sdk.waitForCondition(s => (s?.player?.worldX ?? 0) > 0, 10000);

    const pos = () => {
        const s = sdk.getState()?.player;
        return { x: s?.worldX ?? 0, z: s?.worldZ ?? 0 };
    };

    const distTo = (x: number, z: number) => {
        const p = pos();
        return Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
    };

    const start = pos();
    console.log(`Spawned at (${start.x}, ${start.z})`);
    console.log(`Target: Varrock center (${VARROCK_CENTER.x}, ${VARROCK_CENTER.z})`);
    console.log(`Distance: ${distTo(VARROCK_CENTER.x, VARROCK_CENTER.z).toFixed(0)} tiles\n`);

    const t0 = Date.now();
    const result = await bot.walkTo(VARROCK_CENTER.x, VARROCK_CENTER.z, 5);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const final = pos();
    const dist = distTo(VARROCK_CENTER.x, VARROCK_CENTER.z);

    console.log(`\n=== RESULT ===`);
    console.log(`walkTo success: ${result.success}`);
    console.log(`Message: ${result.message}`);
    console.log(`Final position: (${final.x}, ${final.z})`);
    console.log(`Distance from target: ${dist.toFixed(1)} tiles`);
    console.log(`Time: ${elapsed}s`);

    const passed = result.success && dist <= 5;
    console.log(`Verdict: ${passed ? 'PASS' : 'FAIL'}`);

    return passed;
});
