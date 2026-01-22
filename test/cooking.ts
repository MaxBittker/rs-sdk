#!/usr/bin/env bun
/**
 * Cooking Test (SDK)
 * Cook raw shrimp on a fire/range to gain Cooking XP.
 *
 * Uses a pre-configured save file that spawns the bot at Lumbridge
 * with raw shrimp and tinderbox ready.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `cook${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 200;

// Al-Kharid range (no quest required, unlike Lumbridge)
const ALKHARID_RANGE = { x: 3273, z: 3180 };

async function runTest(): Promise<boolean> {
    console.log('=== Cooking Test (SDK) ===');
    console.log('Goal: Cook raw shrimp to gain Cooking XP');

    // Generate save file with raw shrimp at Al-Kharid
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: ALKHARID_RANGE,
        skills: { Cooking: 1 },
        inventory: [
            { id: Items.RAW_SHRIMPS, count: 1 },
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

        const initialLevel = sdk.getSkill('Cooking')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Cooking')?.experience ?? 0;
        console.log(`Initial Cooking: level ${initialLevel}, xp ${initialXp}`);

        // Check inventory
        const rawShrimp = sdk.findInventoryItem(/raw shrimp/i);
        console.log(`Inventory: raw shrimp=${rawShrimp?.name ?? 'none'}`);

        if (!rawShrimp) {
            console.log('ERROR: No raw shrimp in inventory');
            return false;
        }

        let shrimpCooked = 0;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();

            // Check for success - XP gain
            const currentXp = sdk.getSkill('Cooking')?.experience ?? 0;
            if (currentXp > initialXp) {
                console.log(`Turn ${turn}: SUCCESS - Cooking XP gained (${initialXp} -> ${currentXp})`);
                return true;
            }

            // Check for cooked shrimp in inventory
            const cookedShrimp = sdk.getInventory().filter(i => /^shrimps$/i.test(i.name) || /cooked shrimp/i.test(i.name));
            if (cookedShrimp.length > shrimpCooked) {
                shrimpCooked = cookedShrimp.length;
                console.log(`Turn ${turn}: Cooked shrimp!`);
            }

            // Handle dialogs (cooking interface)
            if (currentState?.dialog.isOpen) {
                const options = currentState.dialog.options;
                const dialogText = currentState.dialog.text || '';
                if (turn === 1 || turn % 10 === 0) {
                    console.log(`Turn ${turn}: Dialog text: "${dialogText}"`);
                    console.log(`Turn ${turn}: Dialog options: ${options.map(o => `${o.index}:${o.text}`).join(', ') || '(none)'}`);
                }

                // Look for cook option
                const cookOpt = options.find(o => /cook/i.test(o.text));
                if (cookOpt) {
                    console.log(`Turn ${turn}: Selecting cook option (index ${cookOpt.index})`);
                    await sdk.sendClickDialog(cookOpt.index);
                } else if (options.length > 0) {
                    // Click the first available option (use its actual index)
                    console.log(`Turn ${turn}: Clicking option ${options[0].index}: ${options[0].text}`);
                    await sdk.sendClickDialog(options[0].index);
                } else {
                    // No options - just click to continue
                    await sdk.sendClickDialog(0);
                }
                await sleep(500);
                continue;
            }

            // Handle interface (make-x)
            if (currentState?.interface.isOpen) {
                console.log(`Turn ${turn}: Interface open (id=${currentState.interface.interfaceId})`);
                if (currentState.interface.options.length > 0) {
                    await sdk.sendClickInterface(currentState.interface.options[0].index);
                }
                await sleep(500);
                continue;
            }

            // Progress logging
            if (turn % 30 === 0) {
                console.log(`Turn ${turn}: Cooking xp ${currentXp}`);
            }

            // Find range or fire
            const allLocs = sdk.getNearbyLocs();
            if (turn === 1 || turn % 30 === 0) {
                console.log(`Turn ${turn} nearby locs:`);
                for (const loc of allLocs.slice(0, 10)) {
                    const opts = loc.optionsWithIndex.map(o => o.text).join(', ');
                    console.log(`  - ${loc.name} (${loc.x}, ${loc.z}): [${opts}]`);
                }
            }

            // Find a cooking location (range or fire)
            const range = allLocs.find(loc => /range|stove/i.test(loc.name));
            const fire = allLocs.find(loc => /fire/i.test(loc.name));
            const cookingLoc = range || fire;

            const rawFish = sdk.findInventoryItem(/raw shrimp/i);

            if (rawFish && cookingLoc) {
                if (turn % 15 === 1) {
                    console.log(`Turn ${turn}: Using ${rawFish.name} on ${cookingLoc.name} at (${cookingLoc.x}, ${cookingLoc.z})`);
                }
                await sdk.sendUseItemOnLoc(rawFish.slot, cookingLoc.x, cookingLoc.z, cookingLoc.id);

                // Wait for cooking dialog or XP gain
                try {
                    await sdk.waitForCondition(state => {
                        if (state.dialog.isOpen) return true;
                        if (state.interface.isOpen) return true;
                        const xp = state.skills.find(s => s.name === 'Cooking')?.experience ?? 0;
                        if (xp > initialXp) return true;
                        return false;
                    }, 10000);
                } catch { /* timeout */ }
            } else if (!cookingLoc) {
                console.log(`Turn ${turn}: No range or fire found nearby`);
            } else if (!rawFish) {
                console.log(`Turn ${turn}: No raw fish left`);
                break;
            }

            await sleep(400);
        }

        // Final results
        const finalXp = sdk.getSkill('Cooking')?.experience ?? 0;
        const finalLevel = sdk.getSkill('Cooking')?.baseLevel ?? 1;

        console.log(`\n=== Results ===`);
        console.log(`Cooking: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);

        if (finalXp > initialXp) {
            console.log('SUCCESS: Gained Cooking XP!');
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
