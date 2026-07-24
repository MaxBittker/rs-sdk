#!/usr/bin/env bun
/**
 * Combat Events Test
 *
 * Specifically tests that combatEvents array is populated during combat.
 * Attacks NPCs and monitors for damage_dealt / damage_taken events.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import type { CombatEvent } from '../types';

async function runCombatEventsTest(): Promise<boolean> {
    const BOT_NAME = process.env.BOT_NAME;
    const HEADLESS = process.env.HEADLESS === 'true';

    console.log('=== Combat Events Test ===');
    console.log('Testing that combatEvents array populates during combat\n');

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: HEADLESS });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!\n`);

        // Track all events we see
        const allEvents: CombatEvent[] = [];
        let damageDealtCount = 0;
        let damageTakenCount = 0;

        // Find something to fight - prefer goblins (more HP than rats)
        const findTarget = () => {
            const npcs = sdk.getNearbyNpcs();
            // Prefer goblins, then men, then rats
            const target = npcs.find(n => /goblin/i.test(n.name) && n.optionsWithIndex.some(o => o.text.toLowerCase() === 'attack'))
                || npcs.find(n => /^man$|^woman$/i.test(n.name) && n.optionsWithIndex.some(o => o.text.toLowerCase() === 'attack'))
                || npcs.find(n => /rat/i.test(n.name) && n.optionsWithIndex.some(o => o.text.toLowerCase() === 'attack'));
            return target;
        };

        let target = findTarget();

        if (!target) {
            console.log('No attackable NPCs nearby, walking to find some...');
            await bot.walkTo(3245, 3235); // Goblin area east of Lumbridge
            await sleep(3000);
            target = findTarget();
        }

        if (!target) {
            console.log('SKIP: Could not find any attackable NPCs');
            return true; // Don't fail, just skip
        }

        console.log(`Found target: ${target.name} (lvl ${target.combatLevel}, index ${target.index})`);
        console.log(`Initial state: hp=${target.hp}/${target.maxHp}, inCombat=${target.inCombat}, lastCombatTick=${target.lastCombatTick}\n`);

        // Attack the target
        console.log(`Attacking ${target.name}...`);
        const attackResult = await bot.attackNpc(target);
        if (!attackResult.success) {
            console.log(`FAIL: Attack failed - ${attackResult.message}`);
            return false;
        }

        // Monitor combat for up to 15 seconds, checking every 500ms
        const startTime = Date.now();
        const maxDuration = 15000;
        let lastEventCount = 0;
        let combatStarted = false;

        console.log('\n--- Monitoring Combat Events ---');

        while (Date.now() - startTime < maxDuration) {
            await sleep(500);

            const state = sdk.getState();
            if (!state) continue;

            const tick = state.tick;
            const playerCombat = state.player?.combat;
            const events = state.combatEvents;

            // Check if we're in combat
            if (playerCombat?.inCombat && !combatStarted) {
                combatStarted = true;
                console.log(`[tick ${tick}] Combat started! targetIndex=${playerCombat.targetIndex}`);
            }

            // Check for new events
            if (events.length > lastEventCount) {
                const newEvents = events.slice(lastEventCount);
                for (const event of newEvents) {
                    allEvents.push(event);

                    if (event.type === 'damage_dealt') {
                        damageDealtCount++;
                        console.log(`[tick ${tick}] EVENT: damage_dealt - ${event.damage} damage to ${event.targetType}:${event.targetIndex}`);
                    } else if (event.type === 'damage_taken') {
                        damageTakenCount++;
                        console.log(`[tick ${tick}] EVENT: damage_taken - ${event.damage} damage from ${event.sourceType}:${event.sourceIndex}`);
                    } else if (event.type === 'kill') {
                        console.log(`[tick ${tick}] EVENT: kill - killed ${event.targetType}:${event.targetIndex}`);
                    }
                }
                lastEventCount = events.length;
            }

            // Check NPC state
            const currentTarget = state.nearbyNpcs.find(n => n.index === target!.index);
            if (currentTarget && currentTarget.maxHp !== null && currentTarget.maxHp > 0) {
                // NPC has taken damage, we can see its health
                console.log(`[tick ${tick}] NPC health: ${currentTarget.hp}/${currentTarget.maxHp} (${currentTarget.healthPercent}%), lastCombatTick=${currentTarget.lastCombatTick}`);
            }

            // If target died, find a new one
            if (!currentTarget && combatStarted) {
                console.log(`[tick ${tick}] Target died or despawned`);

                // Look for another target
                const newTarget = findTarget();
                if (newTarget && allEvents.length < 5) {
                    console.log(`[tick ${tick}] Attacking new target: ${newTarget.name}`);
                    target = newTarget;
                    await bot.attackNpc(newTarget);
                }
            }

            // Stop if we have enough events
            if (allEvents.length >= 5) {
                console.log(`\nCollected ${allEvents.length} events, stopping early`);
                break;
            }
        }

        // Summary
        console.log('\n--- Results ---');
        console.log(`Total events collected: ${allEvents.length}`);
        console.log(`  damage_dealt: ${damageDealtCount}`);
        console.log(`  damage_taken: ${damageTakenCount}`);

        if (allEvents.length > 0) {
            console.log('\nAll events:');
            for (const event of allEvents) {
                console.log(`  tick=${event.tick} type=${event.type} damage=${event.damage} source=${event.sourceType}:${event.sourceIndex} target=${event.targetType}:${event.targetIndex}`);
            }
        }

        // Determine pass/fail
        const hasEvents = allEvents.length > 0;

        if (hasEvents) {
            console.log('\n✅ PASS: Combat events ARE being tracked');
            return true;
        } else {
            console.log('\n❌ FAIL: No combat events were detected');
            console.log('\nDebug info:');
            console.log(`  Combat started: ${combatStarted}`);
            const finalState = sdk.getState();
            console.log(`  Final player.combat.inCombat: ${finalState?.player?.combat?.inCombat}`);
            console.log(`  Final player.combat.lastDamageTick: ${finalState?.player?.combat?.lastDamageTick}`);
            return false;
        }

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
}

// Run the test
runCombatEventsTest()
    .then(ok => {
        console.log(ok ? '\nPASSED' : '\nFAILED');
        process.exit(ok ? 0 : 1);
    })
    .catch(e => {
        console.error('Fatal:', e);
        process.exit(1);
    });
