#!/usr/bin/env bun
/**
 * Pathfinding Test - Validates walkTo routing through walls, doors, water, and long distances.
 * Uses a real bot spawned at Lumbridge to test actual in-game navigation.
 */

import { runTest } from './utils/test-runner';
import { Locations } from './utils/save-generator';

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, message: string) {
    results.push({ name, passed, message });
    console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${name} — ${message}`);
}

// Spawn outside Lumbridge castle courtyard to avoid getting trapped by the door
const LUMBRIDGE_OUTSIDE = { x: 3222, z: 3240 };

runTest({
    name: 'Pathfinding Test',
    saveConfig: {
        position: LUMBRIDGE_OUTSIDE,
        skills: { Agility: 99 },
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

    // ── Short-range navigation ──────────────────────────────────────────

    console.log('\n--- Short-Range Navigation ---');

    // Lumbridge courtyard to general store (~10 tiles)
    {
        const dest = { x: 3212, z: 3246 };
        const result = await bot.walkTo(dest.x, dest.z, 5);
        const dist = distTo(dest.x, dest.z);
        record('Lumbridge to general store',
            result.success && dist <= 10,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // ── Door passthrough ────────────────────────────────────────────────

    console.log('\n--- Door Passthrough ---');

    // Walk into Lumbridge castle (requires going through doors)
    {
        const dest = { x: 3205, z: 3210 };
        const result = await bot.walkTo(dest.x, dest.z, 5);
        const dist = distTo(dest.x, dest.z);
        record('Through Lumbridge castle doors',
            result.success && dist <= 10,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // Walk back out of the castle
    {
        const dest = LUMBRIDGE_OUTSIDE;
        const result = await bot.walkTo(dest.x, dest.z, 5);
        const dist = distTo(dest.x, dest.z);
        record('Back out of Lumbridge castle',
            result.success && dist <= 10,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // ── Medium-range: Lumbridge to Draynor (~130 tiles) ─────────────────

    console.log('\n--- Medium-Range Navigation ---');

    {
        const dest = { x: 3092, z: 3243 };
        const result = await bot.walkTo(dest.x, dest.z, 15);
        const dist = distTo(dest.x, dest.z);
        record('Lumbridge to Draynor',
            result.success && dist <= 20,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // ── Long-range: Draynor to Falador (~170 tiles) ─────────────────────

    console.log('\n--- Long-Range Navigation ---');

    {
        const dest = { x: 2964, z: 3378 };
        const result = await bot.walkTo(dest.x, dest.z, 20);
        const dist = distTo(dest.x, dest.z);
        record('Draynor to Falador',
            dist <= 30,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // ── Wall avoidance: move around inside Falador ──────────────────────

    console.log('\n--- Wall Avoidance (Falador) ---');

    // Falador is walled — walking east from center should stay inside or exit via gate
    {
        const dest = { x: 2946, z: 3368 };
        const result = await bot.walkTo(dest.x, dest.z, 10);
        const dist = distTo(dest.x, dest.z);
        record('Falador center to east wall area',
            dist <= 15,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // ── Cross-city: Falador to Varrock (~250 tiles) ─────────────────────

    console.log('\n--- Cross-City Navigation ---');

    {
        const dest = { x: 3213, z: 3428 };
        const result = await bot.walkTo(dest.x, dest.z, 20);
        const dist = distTo(dest.x, dest.z);
        record('Falador to Varrock center',
            dist <= 30,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // ── Gate handling: Varrock has gated entries ─────────────────────────

    console.log('\n--- Gate Handling (Varrock) ---');

    // Walk to Varrock SE gate area and back to center
    {
        const gate = { x: 3270, z: 3400 };
        const result1 = await bot.walkTo(gate.x, gate.z, 10);
        const dist1 = distTo(gate.x, gate.z);

        const center = { x: 3213, z: 3428 };
        const result2 = await bot.walkTo(center.x, center.z, 10);
        const dist2 = distTo(center.x, center.z);

        record('Varrock gate area round-trip',
            dist1 <= 15 && dist2 <= 15,
            `to gate: dist=${dist1.toFixed(0)} (${result1.message}), back: dist=${dist2.toFixed(0)} (${result2.message})`);
    }

    // ── Water avoidance: should not walk into ocean south of Lumbridge ───

    console.log('\n--- Water Avoidance ---');

    // Walk from Varrock back toward Lumbridge — should not path through water
    {
        const dest = { x: 3222, z: 3218 };
        const result = await bot.walkTo(dest.x, dest.z, 15);
        const dist = distTo(dest.x, dest.z);
        record('Varrock to Lumbridge (avoid water)',
            dist <= 25,
            `dist=${dist.toFixed(0)}, ${result.message}`);
    }

    // ── Summary ─────────────────────────────────────────────────────────

    console.log('\n========== RESULTS ==========');
    let passed = 0;
    let failed = 0;
    for (const r of results) {
        if (r.passed) passed++; else failed++;
    }
    console.log(`Passed: ${passed}/${results.length}`);
    console.log(`Failed: ${failed}/${results.length}`);

    if (failed > 0) {
        console.log('\nFailed tests:');
        for (const r of results.filter(r => !r.passed)) {
            console.log(`  - ${r.name}: ${r.message}`);
        }
    }

    return failed === 0;
});
