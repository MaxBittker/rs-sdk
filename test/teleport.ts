#!/usr/bin/env bun
/**
 * Teleport Test (SDK)
 * Cast Varrock Teleport to gain Magic XP and teleport.
 *
 * Varrock Teleport requires:
 * - Level 25 Magic
 * - 1 Fire rune + 3 Air runes + 1 Law rune per cast
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Spells } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `tele${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 100;

// Varrock teleport destination (approximately)
const VARROCK_CENTER = { x: 3212, z: 3424 };

async function runTest(): Promise<boolean> {
    console.log('=== Teleport Test (SDK) ===');
    console.log('Goal: Cast Varrock Teleport to gain Magic XP');

    // Generate save file with runes at Lumbridge
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: { x: 3222, z: 3218 },  // Lumbridge Castle
        skills: { Magic: 25 },  // Need 25 for Varrock Teleport
        inventory: [
            { id: Items.FIRE_RUNE, count: 10 },
            { id: Items.AIR_RUNE, count: 30 },
            { id: Items.LAW_RUNE, count: 10 },
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
        const startX = state?.player?.worldX ?? 0;
        const startZ = state?.player?.worldZ ?? 0;
        console.log(`Starting position: (${startX}, ${startZ})`);

        const initialLevel = sdk.getSkill('Magic')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Magic')?.experience ?? 0;
        console.log(`Initial Magic: level ${initialLevel}, xp ${initialXp}`);

        // Check inventory
        const fireRunes = sdk.findInventoryItem(/fire rune/i);
        const airRunes = sdk.findInventoryItem(/air rune/i);
        const lawRunes = sdk.findInventoryItem(/law rune/i);
        console.log(`Runes: fire=${fireRunes?.count ?? 0}, air=${airRunes?.count ?? 0}, law=${lawRunes?.count ?? 0}`);

        let casts = 0;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();
            const currentX = currentState?.player?.worldX ?? 0;
            const currentZ = currentState?.player?.worldZ ?? 0;

            // Check for success - position changed significantly (teleported to Varrock)
            const distFromStart = Math.abs(currentX - startX) + Math.abs(currentZ - startZ);
            const distFromVarrock = Math.abs(currentX - VARROCK_CENTER.x) + Math.abs(currentZ - VARROCK_CENTER.z);

            if (distFromStart > 50 && distFromVarrock < 50) {
                console.log(`Turn ${turn}: SUCCESS - Teleported to Varrock! Position: (${currentX}, ${currentZ})`);

                // Also check XP
                const currentXp = sdk.getSkill('Magic')?.experience ?? 0;
                console.log(`Magic XP: ${initialXp} -> ${currentXp} (+${currentXp - initialXp})`);

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
                const currentXp = sdk.getSkill('Magic')?.experience ?? 0;
                console.log(`Turn ${turn}: Position (${currentX}, ${currentZ}), Magic xp ${currentXp}, casts ${casts}`);
            }

            // Check if we have runes
            const currentFire = sdk.findInventoryItem(/fire rune/i);
            const currentAir = sdk.findInventoryItem(/air rune/i);
            const currentLaw = sdk.findInventoryItem(/law rune/i);
            if (!currentFire || currentFire.count < 1 || !currentAir || currentAir.count < 3 || !currentLaw || currentLaw.count < 1) {
                console.log(`Turn ${turn}: Out of runes!`);
                break;
            }

            // Only cast once - teleport should work on first try
            if (casts === 0) {
                console.log(`Turn ${turn}: Casting Varrock Teleport`);

                // Click the Varrock Teleport spell button
                // Teleport spells use IF_BUTTON (clicking the spell directly)
                await sdk.sendClickInterfaceComponent(Spells.VARROCK_TELEPORT, 1);
                casts++;

                // Wait for teleport animation
                await sleep(4000);
                continue;
            }

            await sleep(600);
        }

        // Final results
        const finalState = sdk.getState();
        const finalX = finalState?.player?.worldX ?? 0;
        const finalZ = finalState?.player?.worldZ ?? 0;
        const finalXp = sdk.getSkill('Magic')?.experience ?? 0;
        const finalLevel = sdk.getSkill('Magic')?.baseLevel ?? 1;

        console.log(`\n=== Results ===`);
        console.log(`Position: (${startX}, ${startZ}) -> (${finalX}, ${finalZ})`);
        console.log(`Magic: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);
        console.log(`Casts: ${casts}`);

        const distFromVarrock = Math.abs(finalX - VARROCK_CENTER.x) + Math.abs(finalZ - VARROCK_CENTER.z);
        if (distFromVarrock < 50) {
            console.log('SUCCESS: Teleported to Varrock!');
            return true;
        } else {
            console.log('FAILED: Did not teleport');
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
