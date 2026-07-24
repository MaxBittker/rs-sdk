#!/usr/bin/env bun
/**
 * Combat State Test
 * Tests the new combat state tracking features:
 * - NPC healthPercent, targetIndex, inCombat
 * - Player combat state (inCombat, targetIndex, lastDamageTick)
 * - Combat events (damage_taken, damage_dealt)
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import type { CombatEvent } from '../types';

async function runCombatStateTest(): Promise<boolean> {
    const BOT_NAME = process.env.BOT_NAME;
    const HEADLESS = process.env.HEADLESS === 'true';

    console.log('=== Combat State Test ===');
    console.log('Testing SDK combat state tracking features');

    let session: SDKSession | null = null;
    let allTestsPassed = true;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: HEADLESS });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!`);

        // Test 1: Verify NPC fields exist and have correct types
        console.log('\n--- Test 1: NPC Combat State Fields ---');
        const state = sdk.getState();
        if (!state) {
            console.log('FAIL: No state available');
            return false;
        }

        // Find any NPC to check field types
        const npcs = state.nearbyNpcs;
        console.log(`Found ${npcs.length} nearby NPCs`);

        const npc = npcs[0];
        if (npc) {
            // Check healthPercent
            const hasHealthPercent = 'healthPercent' in npc;
            console.log(`  healthPercent field exists: ${hasHealthPercent}`);
            if (hasHealthPercent) {
                const validHealthPercent = npc.healthPercent === null ||
                    (typeof npc.healthPercent === 'number' && npc.healthPercent >= 0 && npc.healthPercent <= 100);
                console.log(`  healthPercent valid: ${validHealthPercent} (value: ${npc.healthPercent})`);
                if (!validHealthPercent) allTestsPassed = false;
            } else {
                allTestsPassed = false;
            }

            // Check targetIndex
            const hasTargetIndex = 'targetIndex' in npc;
            console.log(`  targetIndex field exists: ${hasTargetIndex}`);
            if (hasTargetIndex) {
                const validTargetIndex = typeof npc.targetIndex === 'number';
                console.log(`  targetIndex valid: ${validTargetIndex} (value: ${npc.targetIndex})`);
                if (!validTargetIndex) allTestsPassed = false;
            } else {
                allTestsPassed = false;
            }

            // Check inCombat
            const hasInCombat = 'inCombat' in npc;
            console.log(`  inCombat field exists: ${hasInCombat}`);
            if (hasInCombat) {
                const validInCombat = typeof npc.inCombat === 'boolean';
                console.log(`  inCombat valid: ${validInCombat} (value: ${npc.inCombat})`);
                if (!validInCombat) allTestsPassed = false;
            } else {
                allTestsPassed = false;
            }

            // Verify consistency: if NPC has target, should be in combat
            if (npc.targetIndex !== -1 && !npc.inCombat) {
                console.log(`  WARNING: NPC has target but inCombat is false`);
            }
        } else {
            console.log('  (No NPCs to test - walking to find some)');
            // Walk around to find NPCs
            await bot.walkTo(3222, 3220);
            await sleep(2000);
        }

        // Test 2: Verify Player Combat State
        console.log('\n--- Test 2: Player Combat State ---');
        const player = state.player;
        if (!player) {
            console.log('FAIL: No player state available');
            return false;
        }

        // Check combat field exists
        const hasCombat = 'combat' in player;
        console.log(`  combat field exists: ${hasCombat}`);
        if (!hasCombat) {
            allTestsPassed = false;
        } else {
            const combat = player.combat;

            // Check inCombat
            const hasPlayerInCombat = 'inCombat' in combat;
            console.log(`  combat.inCombat exists: ${hasPlayerInCombat} (value: ${combat.inCombat})`);
            if (!hasPlayerInCombat || typeof combat.inCombat !== 'boolean') allTestsPassed = false;

            // Check targetIndex
            const hasPlayerTargetIndex = 'targetIndex' in combat;
            console.log(`  combat.targetIndex exists: ${hasPlayerTargetIndex} (value: ${combat.targetIndex})`);
            if (!hasPlayerTargetIndex || typeof combat.targetIndex !== 'number') allTestsPassed = false;

            // Check lastDamageTick
            const hasLastDamageTick = 'lastDamageTick' in combat;
            console.log(`  combat.lastDamageTick exists: ${hasLastDamageTick} (value: ${combat.lastDamageTick})`);
            if (!hasLastDamageTick || typeof combat.lastDamageTick !== 'number') allTestsPassed = false;
        }

        // Test 3: Verify Combat Events Array
        console.log('\n--- Test 3: Combat Events Array ---');
        const hasCombatEvents = 'combatEvents' in state;
        console.log(`  combatEvents field exists: ${hasCombatEvents}`);
        if (!hasCombatEvents) {
            allTestsPassed = false;
        } else {
            const isArray = Array.isArray(state.combatEvents);
            console.log(`  combatEvents is array: ${isArray} (length: ${state.combatEvents.length})`);
            if (!isArray) allTestsPassed = false;
        }

        // Test 4: Check public-clock combat marker exists
        console.log('\n--- Test 4: NPC lastCombatTick Field ---');
        if (npc) {
            const hasLastCombatTick = 'lastCombatTick' in npc;
            console.log(`  lastCombatTick field exists: ${hasLastCombatTick}`);
            if (hasLastCombatTick) {
                const validLastCombatTick = npc.lastCombatTick === null || typeof npc.lastCombatTick === 'number';
                console.log(`  lastCombatTick valid: ${validLastCombatTick} (value: ${npc.lastCombatTick})`);
                if (!validLastCombatTick) allTestsPassed = false;
            } else {
                allTestsPassed = false;
            }
        }

        // Test 5: Combat Interaction Test (attack an NPC and verify state changes)
        console.log('\n--- Test 5: Combat Interaction Test ---');

        // Find an attackable NPC
        const attackableNpc = sdk.getNearbyNpcs().find(n => {
            const hasAttack = n.optionsWithIndex.some(o => o.text.toLowerCase() === 'attack');
            return hasAttack && n.combatLevel > 0;
        });

        if (attackableNpc) {
            const currentTick = sdk.getState()?.tick ?? 0;
            console.log(`  Found attackable NPC: ${attackableNpc.name} (lvl ${attackableNpc.combatLevel})`);
            console.log(`  Initial NPC state:`);
            console.log(`    healthPercent=${attackableNpc.healthPercent} (null = not yet damaged)`);
            console.log(`    targetIndex=${attackableNpc.targetIndex}`);
            console.log(`    inCombat=${attackableNpc.inCombat}`);
            console.log(`    lastCombatTick=${attackableNpc.lastCombatTick} (current tick: ${currentTick})`);

            // Attack the NPC
            const attackOpt = attackableNpc.optionsWithIndex.find(o => o.text.toLowerCase() === 'attack');
            if (attackOpt) {
                console.log(`  Attacking ${attackableNpc.name}...`);
                await sdk.sendInteractNpc(attackableNpc.index, attackOpt.opIndex);
                await sleep(3000); // Wait for combat to start and some hits

                // Check player combat state
                const combatState = sdk.getState();
                const newTick = combatState?.tick ?? 0;
                if (combatState?.player?.combat) {
                    const pc = combatState.player.combat;
                    console.log(`  Player combat state after attack (tick ${newTick}):`);
                    console.log(`    inCombat: ${pc.inCombat}`);
                    console.log(`    targetIndex: ${pc.targetIndex}`);
                    console.log(`    lastDamageTick: ${pc.lastDamageTick}`);

                    // Player should be in combat now.
                    if (pc.inCombat) {
                        console.log(`  PASS: player.combat.inCombat is TRUE during combat`);
                    } else {
                        console.log(`  WARN: player.combat.inCombat is false (may have killed NPC already)`);
                    }
                }

                // Check for combat events after some hits
                if (combatState?.combatEvents && combatState.combatEvents.length > 0) {
                    console.log(`  Combat events detected: ${combatState.combatEvents.length}`);
                    for (const event of combatState.combatEvents.slice(-5)) {
                        console.log(`    - tick=${event.tick} ${event.type}: damage=${event.damage}, target=${event.targetType}:${event.targetIndex}`);
                    }
                    console.log(`  PASS: Combat events are being tracked`);
                } else {
                    console.log(`  NOTE: No combat events yet`);
                }

                // Check NPC state changes
                const updatedNpc = sdk.getNearbyNpcs().find(n => n.index === attackableNpc.index);
                if (updatedNpc) {
                    console.log(`  Updated NPC state (tick ${newTick}):`);
                    console.log(`    healthPercent=${updatedNpc.healthPercent}`);
                    console.log(`    hp=${updatedNpc.hp}/${updatedNpc.maxHp}`);
                    console.log(`    targetIndex=${updatedNpc.targetIndex}`);
                    console.log(`    inCombat=${updatedNpc.inCombat}`);
                    console.log(`    lastCombatTick=${updatedNpc.lastCombatTick}`);

                    // After taking damage, NPC should have health data and be in combat
                    if (updatedNpc.maxHp !== null && updatedNpc.maxHp > 0) {
                        console.log(`  PASS: NPC health now visible (hp=${updatedNpc.hp}/${updatedNpc.maxHp})`);
                    }
                    if (updatedNpc.inCombat) {
                        console.log(`  PASS: NPC inCombat is TRUE`);
                    }
                    if (updatedNpc.lastCombatTick !== null && updatedNpc.lastCombatTick <= newTick) {
                        console.log(`  PASS: NPC lastCombatTick (${updatedNpc.lastCombatTick}) uses public tick clock (${newTick})`);
                    }
                } else {
                    console.log(`  NOTE: NPC no longer visible (died)`);
                }
            }
        } else {
            console.log('  No attackable NPCs found nearby - skipping combat test');
            console.log('  (Walk to an area with NPCs to test combat features)');
        }

        // Summary
        console.log('\n--- Test Summary ---');
        if (allTestsPassed) {
            console.log('All field type tests PASSED');
        } else {
            console.log('Some field type tests FAILED');
        }

        return allTestsPassed;

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
}

// Run the test
runCombatStateTest()
    .then(ok => {
        console.log(ok ? '\nPASSED' : '\nFAILED');
        process.exit(ok ? 0 : 1);
    })
    .catch(e => {
        console.error('Fatal:', e);
        process.exit(1);
    });
