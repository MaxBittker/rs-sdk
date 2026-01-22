#!/usr/bin/env bun
/**
 * Alchemy Test (SDK)
 * Cast Low Alchemy on items to gain Magic XP and coins.
 *
 * Low Alchemy requires:
 * - Level 21 Magic
 * - 3 Fire runes + 1 Nature rune per cast
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Spells } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `alch${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 100;

async function runTest(): Promise<boolean> {
    console.log('=== Alchemy Test (SDK) ===');
    console.log('Goal: Cast Low Alchemy on items to gain Magic XP');

    // Generate save file with runes and items to alch
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: { x: 3222, z: 3218 },  // Lumbridge
        skills: { Magic: 21 },  // Need 21 for Low Alchemy
        inventory: [
            { id: Items.FIRE_RUNE, count: 30 },
            { id: Items.NATURE_RUNE, count: 10 },
            { id: Items.BRONZE_DAGGER, count: 5 },  // Items to alch
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

        const initialLevel = sdk.getSkill('Magic')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Magic')?.experience ?? 0;
        console.log(`Initial Magic: level ${initialLevel}, xp ${initialXp}`);

        // Check inventory
        const fireRunes = sdk.findInventoryItem(/fire rune/i);
        const natureRunes = sdk.findInventoryItem(/nature rune/i);
        const daggers = sdk.getInventory().filter(i => /bronze dagger/i.test(i.name));
        console.log(`Runes: fire=${fireRunes?.count ?? 0}, nature=${natureRunes?.count ?? 0}`);
        console.log(`Items to alch: ${daggers.length} bronze daggers`);

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

            // Handle dialogs
            if (currentState?.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
                continue;
            }

            // Progress logging
            if (turn % 20 === 0) {
                console.log(`Turn ${turn}: Magic xp ${currentXp}, casts ${casts}`);
            }

            // Check if we have runes
            const currentFire = sdk.findInventoryItem(/fire rune/i);
            const currentNature = sdk.findInventoryItem(/nature rune/i);
            if (!currentFire || currentFire.count < 3 || !currentNature || currentNature.count < 1) {
                console.log(`Turn ${turn}: Out of runes!`);
                break;
            }

            // Don't spam casts - wait between attempts (alchemy has a delay)
            if (turn - lastCastTurn < 5) {
                await sleep(300);
                continue;
            }

            // Find an item to alch (bronze daggers)
            const inventory = sdk.getInventory();
            const itemToAlch = inventory.find(i => /bronze dagger/i.test(i.name));

            if (itemToAlch) {
                console.log(`Turn ${turn}: Casting Low Alchemy on ${itemToAlch.name} in slot ${itemToAlch.slot}`);

                // Cast Low Alchemy on the item
                await sdk.sendSpellOnItem(itemToAlch.slot, Spells.LOW_ALCHEMY);
                casts++;
                lastCastTurn = turn;

                // Wait for spell animation
                await sleep(3000);
                continue;
            } else {
                console.log(`Turn ${turn}: No items left to alch!`);
                break;
            }
        }

        // Final results
        const finalXp = sdk.getSkill('Magic')?.experience ?? 0;
        const finalLevel = sdk.getSkill('Magic')?.baseLevel ?? 1;
        const coins = sdk.findInventoryItem(/coins/i);

        console.log(`\n=== Results ===`);
        console.log(`Magic: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);
        console.log(`Casts: ${casts}`);
        console.log(`Coins: ${coins?.count ?? 0}`);

        if (finalXp > initialXp) {
            console.log('SUCCESS: Gained Magic XP from alchemy!');
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
