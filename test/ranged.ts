#!/usr/bin/env bun
/**
 * Ranged Combat Test (SDK)
 * Attack an NPC with ranged to gain Ranged XP.
 *
 * Uses a pre-configured save file with bow and arrows ready.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `range${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 200;

async function runTest(): Promise<boolean> {
    console.log('=== Ranged Combat Test (SDK) ===');
    console.log('Goal: Attack NPCs with ranged to gain Ranged XP');

    // Generate save file with bow and arrows at Lumbridge (chickens nearby)
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: { x: 3235, z: 3295 },  // Near Lumbridge chicken coop
        skills: { Ranged: 1 },
        inventory: [
            { id: Items.SHORTBOW, count: 1 },
            { id: Items.BRONZE_ARROW, count: 50 },
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

        const initialLevel = sdk.getSkill('Ranged')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Ranged')?.experience ?? 0;
        console.log(`Initial Ranged: level ${initialLevel}, xp ${initialXp}`);

        // Equip bow
        const bow = sdk.findInventoryItem(/bow/i);
        if (bow) {
            const wieldOpt = bow.optionsWithIndex.find(o => /wield|equip/i.test(o.text));
            if (wieldOpt) {
                console.log(`Equipping ${bow.name}`);
                await sdk.sendUseItem(bow.slot, wieldOpt.opIndex);
                await sleep(500);
            }
        }

        // Equip arrows
        const arrows = sdk.findInventoryItem(/arrow/i);
        if (arrows) {
            const wieldOpt = arrows.optionsWithIndex.find(o => /wield|equip/i.test(o.text));
            if (wieldOpt) {
                console.log(`Equipping ${arrows.name}`);
                await sdk.sendUseItem(arrows.slot, wieldOpt.opIndex);
                await sleep(500);
            }
        }

        let attacks = 0;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();

            // Check for success - XP gain
            const currentXp = sdk.getSkill('Ranged')?.experience ?? 0;
            if (currentXp > initialXp) {
                console.log(`Turn ${turn}: SUCCESS - Ranged XP gained (${initialXp} -> ${currentXp})`);
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
                console.log(`Turn ${turn}: Ranged xp ${currentXp}, attacks ${attacks}`);
            }

            // Pick up arrows on the ground
            const groundArrows = sdk.findGroundItem(/arrow/i);
            if (groundArrows && groundArrows.distance <= 3) {
                if (turn % 10 === 1) {
                    console.log(`Turn ${turn}: Picking up ${groundArrows.name} at (${groundArrows.x}, ${groundArrows.z})`);
                }
                await sdk.sendPickup(groundArrows.x, groundArrows.z, groundArrows.id);
                await sleep(600);
                continue;
            }

            // Find attackable NPC (prefer chickens, then rats, then anything)
            const npcs = sdk.getNearbyNpcs();
            if (turn === 1 || turn % 50 === 0) {
                console.log(`Turn ${turn}: Nearby NPCs: ${npcs.slice(0, 10).map(n => n.name).join(', ')}`);
            }

            const target = npcs.find(npc => /chicken/i.test(npc.name)) ||
                          npcs.find(npc => /rat/i.test(npc.name)) ||
                          npcs.find(npc => npc.optionsWithIndex.some(o => /attack/i.test(o.text)));

            if (target) {
                const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                if (attackOpt) {
                    if (turn % 10 === 1) {
                        console.log(`Turn ${turn}: Attacking ${target.name}`);
                    }
                    await sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    attacks++;

                    // Wait a bit for combat
                    await sleep(2000);
                    continue;
                }
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
        const finalXp = sdk.getSkill('Ranged')?.experience ?? 0;
        const finalLevel = sdk.getSkill('Ranged')?.baseLevel ?? 1;

        console.log(`\n=== Results ===`);
        console.log(`Ranged: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);
        console.log(`Attacks: ${attacks}`);

        if (finalXp > initialXp) {
            console.log('SUCCESS: Gained Ranged XP!');
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
