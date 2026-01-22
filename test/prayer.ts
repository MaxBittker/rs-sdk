#!/usr/bin/env bun
/**
 * Prayer Test (SDK)
 * Bury bones to gain Prayer XP.
 *
 * Uses a pre-configured save file with bones ready.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `pray${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 100;

async function runTest(): Promise<boolean> {
    console.log('=== Prayer Test (SDK) ===');
    console.log('Goal: Bury bones to gain Prayer XP');

    // Generate save file with bones
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Prayer: 1 },
        inventory: [
            { id: Items.BONES, count: 1 },
        ],
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false, skipTutorial: false });
        const { sdk } = session;

        // Wait for state to fully load
        await sdk.waitForCondition(s => s.player?.worldX > 0 && s.inventory.length > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        const state = sdk.getState();
        console.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);

        const initialLevel = sdk.getSkill('Prayer')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Prayer')?.experience ?? 0;
        console.log(`Initial Prayer: level ${initialLevel}, xp ${initialXp}`);

        // Check inventory
        const bones = sdk.findInventoryItem(/bones/i);
        console.log(`Inventory: bones=${bones?.name ?? 'none'}`);

        if (!bones) {
            console.log('ERROR: No bones in inventory');
            return false;
        }

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();

            // Check for success - XP gain
            const currentXp = sdk.getSkill('Prayer')?.experience ?? 0;
            if (currentXp > initialXp) {
                console.log(`Turn ${turn}: SUCCESS - Prayer XP gained (${initialXp} -> ${currentXp})`);
                return true;
            }

            // Handle dialogs
            if (currentState?.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
                continue;
            }

            // Find bones and bury them
            const currentBones = sdk.findInventoryItem(/bones/i);
            if (currentBones) {
                // Find "Bury" option
                const buryOpt = currentBones.optionsWithIndex.find(o => /bury/i.test(o.text));
                if (buryOpt) {
                    if (turn === 1) {
                        console.log(`Turn ${turn}: Burying ${currentBones.name} (slot ${currentBones.slot})`);
                        console.log(`  Options: ${currentBones.optionsWithIndex.map(o => `${o.opIndex}:${o.text}`).join(', ')}`);
                    }
                    await sdk.sendUseItem(currentBones.slot, buryOpt.opIndex);

                    // Wait for XP gain or bones to disappear
                    try {
                        await sdk.waitForCondition(state => {
                            const xp = state.skills.find(s => s.name === 'Prayer')?.experience ?? 0;
                            if (xp > initialXp) return true;
                            // Bones gone from inventory
                            if (!state.inventory.find(i => i.slot === currentBones.slot)) return true;
                            return false;
                        }, 5000);
                    } catch { /* timeout */ }
                } else {
                    console.log(`Turn ${turn}: No bury option on bones`);
                    console.log(`  Options: ${currentBones.optionsWithIndex.map(o => `${o.opIndex}:${o.text}`).join(', ')}`);
                }
            } else {
                console.log(`Turn ${turn}: No bones left`);
                break;
            }

            await sleep(400);
        }

        // Final results
        const finalXp = sdk.getSkill('Prayer')?.experience ?? 0;
        const finalLevel = sdk.getSkill('Prayer')?.baseLevel ?? 1;

        console.log(`\n=== Results ===`);
        console.log(`Prayer: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);

        if (finalXp > initialXp) {
            console.log('SUCCESS: Gained Prayer XP!');
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
