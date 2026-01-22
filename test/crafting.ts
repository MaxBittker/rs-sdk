#!/usr/bin/env bun
/**
 * Crafting Test (SDK)
 * Test crafting with needle + thread + leather to make leather gloves.
 *
 * Tests the crafting interface flow:
 * 1. Use needle on leather
 * 2. Handle the crafting interface that appears
 * 3. Verify crafted item appears in inventory + XP gained
 *
 * Success criteria: Leather item crafted + Crafting XP gained
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `craft${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 150;

async function runTest(): Promise<boolean> {
    console.log('=== Crafting Test (SDK) ===');
    console.log('Goal: Craft leather item with needle and thread');

    // Spawn at Lumbridge with leather crafting materials
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Crafting: 1 },
        inventory: [
            { id: Items.NEEDLE, count: 1 },
            { id: Items.THREAD, count: 1 },
            { id: Items.LEATHER, count: 1 },
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

        const initialXp = sdk.getSkill('Crafting')?.experience ?? 0;
        console.log(`Initial Crafting XP: ${initialXp}`);

        // Check inventory
        const needle = sdk.findInventoryItem(/needle/i);
        const thread = sdk.findInventoryItem(/thread/i);
        const leather = sdk.findInventoryItem(/leather/i);
        console.log(`Inventory: needle=${needle?.name ?? 'none'}, thread=${thread?.name ?? 'none'}, leather=${leather?.name ?? 'none'}`);

        if (!needle || !leather) {
            console.log('FAILED: Missing needle or leather in inventory');
            return false;
        }

        let craftingAttempted = false;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();

            // Check for success - XP gain (leather item crafted)
            const currentXp = sdk.getSkill('Crafting')?.experience ?? 0;
            if (currentXp > initialXp) {
                console.log(`Turn ${turn}: SUCCESS - Crafting XP gained! (${initialXp} -> ${currentXp})`);
                return true;
            }

            // Handle interface (crafting selection - this is where leather crafting menu appears)
            if (currentState?.interface.isOpen) {
                console.log(`Turn ${turn}: Interface open (id=${currentState.interface.interfaceId})`);
                console.log(`  Options: ${currentState.interface.options.map(o => `${o.index}:${o.text}`).join(', ') || 'none'}`);

                // Leather crafting interface (id=2311) has buttons ordered by component ID:
                // com_88=body(14), com_89=gloves(1), com_90=boots(7), com_91=vambs(11), etc.
                // Option index 2 = gloves (level 1)
                if (currentState.interface.interfaceId === 2311) {
                    console.log(`  Clicking gloves option (index 2)`);
                    await sdk.sendClickInterface(2);
                } else if (currentState.interface.options.length > 0) {
                    console.log(`  Clicking first option: ${currentState.interface.options[0].text}`);
                    await sdk.sendClickInterface(currentState.interface.options[0].index);
                }
                await sleep(500);
                continue;
            }

            // Handle dialogs
            if (currentState?.dialog.isOpen) {
                console.log(`Turn ${turn}: Dialog: ${currentState.dialog.options.map(o => `${o.index}:${o.text}`).join(', ') || 'click to continue'}`);

                const craftOption = currentState.dialog.options.find(o =>
                    /glove|make|craft|leather/i.test(o.text)
                );
                if (craftOption) {
                    console.log(`  Clicking: ${craftOption.text}`);
                    await sdk.sendClickDialog(craftOption.index);
                } else if (currentState.dialog.options.length > 0) {
                    await sdk.sendClickDialog(currentState.dialog.options[0].index);
                } else {
                    await sdk.sendClickDialog(0);
                }
                await sleep(500);
                continue;
            }

            // Use needle on leather to start crafting
            const currentNeedle = sdk.findInventoryItem(/needle/i);
            const currentLeather = sdk.findInventoryItem(/^leather$/i);

            if (currentNeedle && currentLeather && !craftingAttempted) {
                console.log(`Turn ${turn}: Using ${currentNeedle.name} on ${currentLeather.name}`);
                await sdk.sendUseItemOnItem(currentNeedle.slot, currentLeather.slot);
                craftingAttempted = true;

                // Wait for interface or dialog to appear
                try {
                    await sdk.waitForCondition(s =>
                        s.interface.isOpen || s.dialog.isOpen,
                        10000
                    );
                    console.log('Crafting interface/dialog opened');
                    craftingAttempted = false;  // Reset so we can interact with the interface
                } catch {
                    console.log('No crafting interface opened, retrying...');
                    craftingAttempted = false;
                }
                continue;
            }

            if (!currentLeather) {
                // Check if we crafted something (XP gain)
                const finalXp = sdk.getSkill('Crafting')?.experience ?? 0;
                if (finalXp > initialXp) {
                    console.log(`Turn ${turn}: SUCCESS - Leather used, XP gained!`);
                    return true;
                }
                console.log(`Turn ${turn}: No leather left in inventory`);
                break;
            }

            await sleep(400);
        }

        // Final check
        const finalXp = sdk.getSkill('Crafting')?.experience ?? 0;

        console.log('\n=== Results ===');
        console.log(`Crafting XP: ${initialXp} -> ${finalXp} (+${finalXp - initialXp})`);

        if (finalXp > initialXp) {
            console.log('SUCCESS: Crafted leather item!');
            return true;
        } else {
            console.log('FAILED: Did not craft anything');
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
