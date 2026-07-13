#!/usr/bin/env bun
/**
 * Zanaris (Lost City) Navigation Test
 *
 * Verifies that pathfinding and walking work in the Zanaris dungeon area.
 * Zanaris is at world coordinates ~(3200-3260, 9536-9600), which are
 * dungeon mapsquares (Z > 9000) that were previously missing from
 * the collision data export.
 *
 * The test spawns inside Zanaris and walks a loop between landmarks:
 *   Portal entrance → East market door → Exit ladder → South market → Portal
 *
 * Success criteria:
 * 1. Pathfinder zones are allocated for Zanaris
 * 2. findPath returns valid waypoints between all points
 * 3. Bot walks to each waypoint within tolerance
 */

import { runTest, sleep } from './utils/test-runner';
import { Locations } from './utils/save-generator';

const ZANARIS_LANDMARKS = [
    { x: 3215, z: 9577, label: 'West of spawn' },
    { x: 3238, z: 9558, label: 'East market door' },
    { x: 3254, z: 9590, label: 'Exit ladder' },
    { x: 3233, z: 9554, label: 'South market door' },
    { x: 3220, z: 9592, label: 'Portal entrance' },
];

const WALK_TOLERANCE = 5;

runTest({
    name: 'Zanaris Navigation Test',
    saveConfig: {
        position: Locations.ZANARIS,
    },
    launchOptions: { skipTutorial: false },
}, async ({ sdk, bot }) => {
    console.log('Goal: Navigate between landmarks inside Zanaris (Lost City dungeon)');

    await sdk.waitForCondition(s => (s.player?.worldX ?? 0) > 0, 10000);
    await sleep(500);

    const startState = sdk.getState();
    const player = startState?.player;
    console.log(`Starting position: (${player?.worldX}, ${player?.worldZ}), level: ${player?.level}`);

    if (!player || player.worldZ < 9000) {
        console.log('FAIL: Bot is not in dungeon area (Z should be > 9000)');
        return false;
    }

    // Step 1: Verify pathfinder has zones for Zanaris
    console.log('\n--- Step 1: Verify zone allocation ---');
    const probe = sdk.findPath(ZANARIS_LANDMARKS[0]!.x, ZANARIS_LANDMARKS[0]!.z);
    console.log(`findPath to ${ZANARIS_LANDMARKS[0]!.label}: success=${probe.success}, waypoints=${probe.waypoints.length}, error=${probe.error ?? 'none'}`);

    if (!probe.success) {
        console.log(`FAIL: ${probe.error}`);
        return false;
    }
    if (probe.waypoints.length === 0) {
        console.log('FAIL: 0 waypoints returned - no route found');
        return false;
    }
    console.log('PASS: Zanaris zones are allocated');

    // Step 2: Walk the loop
    console.log('\n--- Step 2: Walk between Zanaris landmarks ---');
    let passed = 0;
    let failed = 0;

    for (const target of ZANARIS_LANDMARKS) {
        console.log(`\nWalking to ${target.label} (${target.x}, ${target.z})...`);
        const result = await bot.walkTo(target.x, target.z, WALK_TOLERANCE);

        const state = sdk.getState();
        const px = state?.player?.worldX ?? 0;
        const pz = state?.player?.worldZ ?? 0;
        const dist = Math.sqrt((px - target.x) ** 2 + (pz - target.z) ** 2);

        if (result.success && dist <= WALK_TOLERANCE) {
            console.log(`  PASS: Arrived (${px}, ${pz}), ${dist.toFixed(1)} tiles away`);
            passed++;
        } else {
            console.log(`  FAIL: At (${px}, ${pz}), ${dist.toFixed(1)} tiles away`);
            if (!result.success) console.log(`  Error: ${result.message}`);
            failed++;
        }
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log(`${passed}/${ZANARIS_LANDMARKS.length} walks succeeded, ${failed} failed`);

    const final = sdk.getState();
    console.log(`Final position: (${final?.player?.worldX}, ${final?.player?.worldZ}), level: ${final?.player?.level}`);

    if (failed === 0) {
        console.log('SUCCESS: Dungeon pathfinding works in Zanaris');
        return true;
    } else {
        console.log('FAILED: Some walks did not complete');
        return false;
    }
});
