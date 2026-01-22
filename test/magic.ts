#!/usr/bin/env bun
/**
 * Magic Combat Test (SDK)
 * Cast Wind Strike on NPCs to gain Magic XP.
 *
 * Uses a pre-configured save file with runes ready.
 * Wind Strike requires: 1 Air rune + 1 Mind rune per cast
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Spells } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `mage${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 200;

async function runTest(): Promise<boolean> {
    console.log('=== Magic Combat Test (SDK) ===');
    console.log('Goal: Cast Wind Strike on NPCs to gain Magic XP');

    // Generate save file with runes at Lumbridge (chickens nearby)
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: { x: 3235, z: 3295 },  // Near Lumbridge chicken coop
        skills: { Magic: 1 },
        inventory: [
            { id: Items.AIR_RUNE, count: 50 },
            { id: Items.MIND_RUNE, count: 50 },
        ],
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false, skipTutorial: false });
        const { sdk, bot } = session;

        // Wait for state to fully load
        await sdk.waitForCondition(s => s.player?.worldX > 0 && s.inventory.length > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        const state = sdk.getState();
        console.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);

        const initialLevel = sdk.getSkill('Magic')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Magic')?.experience ?? 0;
        console.log(`Initial Magic: level ${initialLevel}, xp ${initialXp}`);

        // Check inventory
        const airRunes = sdk.findInventoryItem(/air rune/i);
        const mindRunes = sdk.findInventoryItem(/mind rune/i);
        console.log(`Runes: air=${airRunes?.count ?? 0}, mind=${mindRunes?.count ?? 0}`);

        let casts = 0;
        let lastCastTurn = 0;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();

            // Check for success - XP gain
            const currentXp = sdk.getSkill('Magic')?.experience ?? 0;
            if (currentXp > initialXp) {
                console.log(`Turn ${turn}: SUCCESS - Magic XP gained (${initialXp} -> ${currentXp})`);
                return true;
            }

            // Handle dialogs (level-up, etc.)
            if (currentState?.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
                continue;
            }

            // Progress logging
            if (turn % 30 === 0) {
                console.log(`Turn ${turn}: Magic xp ${currentXp}, casts ${casts}`);
            }

            // Check if we have runes
            const currentAir = sdk.findInventoryItem(/air rune/i);
            const currentMind = sdk.findInventoryItem(/mind rune/i);
            if (!currentAir || currentAir.count < 1 || !currentMind || currentMind.count < 1) {
                console.log(`Turn ${turn}: Out of runes!`);
                break;
            }

            // Don't spam casts - wait a bit between attempts
            if (turn - lastCastTurn < 5) {
                await sleep(300);
                continue;
            }

            // Find attackable NPC (prefer chickens)
            const npcs = sdk.getNearbyNpcs();
            if (turn === 1 || turn % 50 === 0) {
                console.log(`Turn ${turn}: Nearby NPCs: ${npcs.slice(0, 10).map(n => `${n.name}(${n.index})`).join(', ')}`);
            }

            const target = npcs.find(npc => /chicken/i.test(npc.name)) ||
                          npcs.find(npc => /rat/i.test(npc.name)) ||
                          npcs.find(npc => /goblin/i.test(npc.name));

            if (target) {
                if (turn % 10 === 1 || casts === 0) {
                    console.log(`Turn ${turn}: Casting Wind Strike on ${target.name} (index ${target.index})`);
                }

                // Cast Wind Strike on the NPC
                await sdk.sendSpellOnNpc(target.index, Spells.WIND_STRIKE);
                casts++;
                lastCastTurn = turn;

                // Wait for spell animation and potential hit
                await sleep(2000);
                continue;
            } else {
                // No target, walk around to find one
                if (turn % 10 === 0) {
                    const px = currentState?.player?.worldX ?? 3235;
                    const pz = currentState?.player?.worldZ ?? 3295;
                    const dx = Math.floor(Math.random() * 10) - 5;
                    const dz = Math.floor(Math.random() * 10) - 5;
                    console.log(`Turn ${turn}: No targets, wandering...`);
                    await bot.walkTo(px + dx, pz + dz, 2);
                }
            }

            await sleep(600);
        }

        // Final results
        const finalXp = sdk.getSkill('Magic')?.experience ?? 0;
        const finalLevel = sdk.getSkill('Magic')?.baseLevel ?? 1;

        console.log(`\n=== Results ===`);
        console.log(`Magic: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);
        console.log(`Casts: ${casts}`);

        if (finalXp > initialXp) {
            console.log('SUCCESS: Gained Magic XP!');
            return true;
        } else {
            console.log('FAILED: No XP gained');
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
