#!/usr/bin/env bun
/**
 * Navigation Test - City to City Routes
 * Tests long-distance walkTo with the 2048x2048 pathfinder
 */

import { runTest } from './utils/test-runner';
import { Locations } from './utils/save-generator';

const CITIES = {
    LUMBRIDGE: { x: 3222, z: 3218, name: 'Lumbridge' },
    VARROCK: { x: 3212, z: 3428, name: 'Varrock' },
    FALADOR: { x: 2964, z: 3378, name: 'Falador' },
    DRAYNOR: { x: 3093, z: 3244, name: 'Draynor' },
    GNOME_AGILITY: { x: 2474, z: 3438, name: 'Gnome Agility Course' },
};

runTest({
    name: 'City-to-City Navigation Test',
    saveConfig: {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Agility: 99 },
        varps: { 281: 1000 }, // Skip tutorial
    },
    launchOptions: { skipTutorial: true },
}, async ({ sdk, bot }) => {
    // Wait for valid player position
    await sdk.waitForCondition(s => (s?.player?.worldX ?? 0) > 0, 10000);
    console.log('=== City-to-City Navigation Tests ===\n');

    // // Test 1: Lumbridge → Varrock (known working)
    // console.log('--- Test 1: Lumbridge → Varrock ---');
    // let result = await bot.walkTo(CITIES.VARROCK.x, CITIES.VARROCK.z, 20);
    // let pos = sdk.getState()?.player;
    // console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    // console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // // Test 2: Varrock → Falador (skip Edgeville, longer but clearer route)
    // console.log('--- Test 2: Varrock → Falador ---');
    // result = await bot.walkTo(CITIES.FALADOR.x, CITIES.FALADOR.z, 20);
    // pos = sdk.getState()?.player;
    // console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    // console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // // Test 3: Falador → Draynor
    // console.log('--- Test 3: Falador → Draynor ---');
    // result = await bot.walkTo(CITIES.DRAYNOR.x, CITIES.DRAYNOR.z, 20);
    // pos = sdk.getState()?.player;
    // console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    // console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // // Test 4: Draynor → Lumbridge
    // console.log('--- Test 4: Draynor → Lumbridge ---');
    // result = await bot.walkTo(CITIES.LUMBRIDGE.x, CITIES.LUMBRIDGE.z, 20);
    // pos = sdk.getState()?.player;
    // console.log(`Result: ${result.success ? '✓' : '✗'} - ${result.message}`);
    // console.log(`Position: (${pos?.worldX}, ${pos?.worldZ})\n`);

    // Test 5: THE HARD ONE - Lumbridge → Gnome Agility (with gate handling)
    console.log('========================================');
    console.log('--- Lumbridge → Gnome Agility Course ---');
    console.log('(Walk → Gate → Walk pattern)');
    console.log('========================================\n');

    const startPos = sdk.getState()?.player;
    const startX = startPos?.worldX ?? 0;
    const startZ = startPos?.worldZ ?? 0;

    const targetX = CITIES.GNOME_AGILITY.x;
    const targetZ = CITIES.GNOME_AGILITY.z;

    // Walk with gate handling - retry loop
    const MAX_ATTEMPTS = 10;
    let result;
    let pos;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        pos = sdk.getState()?.player;
        const distToGoal = Math.sqrt(
            Math.pow(targetX - (pos?.worldX ?? 0), 2) +
            Math.pow(targetZ - (pos?.worldZ ?? 0), 2)
        );

        if (distToGoal <= 30) {
            console.log(`✓ Arrived at Gnome Agility Course!`);
            break;
        }

        console.log(`\n[Attempt ${attempt + 1}] Walking from (${pos?.worldX}, ${pos?.worldZ})...`);
        result = await bot.walkTo(targetX, targetZ, 30);

        if (result.success) {
            console.log(`✓ ${result.message}`);
            break;
        }

        console.log(`✗ ${result.message}`);

        // Check if there's a gate nearby that we can open
        let gate = sdk.findNearbyLoc(/gate/i);
        if (gate) {
            console.log(`Found gate: ${gate.name} at (${gate.x}, ${gate.z}), distance: ${gate.distance}`);
            console.log(`Gate options: ${gate.options.join(', ')}`);

            const openResult = await bot.openDoor(gate);
            console.log(`Open gate result: ${openResult.success ? '✓' : '✗'} - ${openResult.message}`);

            if (openResult.success) {
                // Small delay after opening gate
                await new Promise(r => setTimeout(r, 500));
                continue; // Try walking again
            }
        } else {
            console.log('No gate found nearby - walking toward Taverley gate in steps...');
            // Taverley gate is around (2878, 3393)
            // Walk in smaller steps to get closer
            const currentPos = sdk.getState()?.player;
            const TAVERLEY_GATE = { x: 2878, z: 3393 };

            // Calculate direction to gate and walk 30 tiles toward it
            const dx = TAVERLEY_GATE.x - (currentPos?.worldX ?? 0);
            const dz = TAVERLEY_GATE.z - (currentPos?.worldZ ?? 0);
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 5) {
                const stepDist = Math.min(30, dist);
                const stepX = Math.round((currentPos?.worldX ?? 0) + (dx / dist) * stepDist);
                const stepZ = Math.round((currentPos?.worldZ ?? 0) + (dz / dist) * stepDist);

                console.log(`Walking 30 tiles toward gate: (${stepX}, ${stepZ})`);
                const walkStep = await bot.walkTo(stepX, stepZ, 5);
                console.log(`Step result: ${walkStep.success ? '✓' : '✗'} - ${walkStep.message}`);
            }

            // Now check for gate again
            gate = sdk.findNearbyLoc(/gate/i);
            if (gate) {
                console.log(`Found gate after walking: ${gate.name} at (${gate.x}, ${gate.z})`);
                console.log(`Gate options: ${gate.options.join(', ')}`);
                const openResult = await bot.openDoor(gate);
                console.log(`Open gate result: ${openResult.success ? '✓' : '✗'} - ${openResult.message}`);
                if (openResult.success) {
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                console.log(`Still no gate visible from (${sdk.getState()?.player?.worldX}, ${sdk.getState()?.player?.worldZ})`);
            }
        }
    }

    pos = sdk.getState()?.player;
    const endX = pos?.worldX ?? 0;
    const endZ = pos?.worldZ ?? 0;
    const distanceTraveled = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endZ - startZ, 2));
    const distanceRemaining = Math.sqrt(
        Math.pow(targetX - endX, 2) + Math.pow(targetZ - endZ, 2)
    );

    console.log(`\n--- Final Result ---`);
    console.log(`Start: (${startX}, ${startZ})`);
    console.log(`End: (${endX}, ${endZ})`);
    console.log(`Distance traveled: ${distanceTraveled.toFixed(0)} tiles`);
    console.log(`Distance remaining: ${distanceRemaining.toFixed(0)} tiles`);
    console.log(`Success: ${distanceRemaining <= 30 ? '✓' : '✗'}`);

    return true;
});
