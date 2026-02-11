#!/usr/bin/env bun
/**
 * Walk Test: Lumbridge to Yanille
 * Tests very long-distance pathfinding across the map.
 * Route: Lumbridge -> Draynor -> Rimmington -> Ardougne -> Yanille
 */

import { runTest } from './utils/test-runner';
import { Locations } from './utils/save-generator';

const YANILLE = { x: 2606, z: 3093 };

runTest({
    name: 'Lumbridge to Yanille',
    saveConfig: {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Agility: 99 },
        varps: { 281: 1000 },
    },
    launchOptions: { skipTutorial: false },
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
    console.log(`Start: (${start.x}, ${start.z}) - Lumbridge`);
    console.log(`Target: (${YANILLE.x}, ${YANILLE.z}) - Yanille`);
    console.log(`Distance: ${distTo(YANILLE.x, YANILLE.z).toFixed(0)} tiles\n`);

    const t0 = Date.now();

    // Walk to Yanille - this is a very long route
    const result = await bot.walkTo(YANILLE.x, YANILLE.z, 15);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const final = pos();
    const dist = distTo(YANILLE.x, YANILLE.z);

    console.log(`\n=== RESULT ===`);
    console.log(`walkTo success: ${result.success}`);
    console.log(`Message: ${result.message}`);
    console.log(`Final position: (${final.x}, ${final.z})`);
    console.log(`Distance from target: ${dist.toFixed(1)} tiles`);
    console.log(`Time: ${elapsed}s`);

    const passed = result.success && dist <= 15;
    console.log(`Verdict: ${passed ? 'PASS' : 'FAIL'}`);

    return passed;
});
