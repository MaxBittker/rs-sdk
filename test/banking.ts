#!/usr/bin/env bun
/**
 * Banking Test (SDK)
 * Test bank deposit and withdraw functionality.
 *
 * Success criteria:
 * 1. Open bank interface
 * 2. Deposit an item (verify it leaves inventory)
 * 3. Withdraw the item (verify it returns to inventory)
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `bank${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 150;

// Varrock West Bank location
const VARROCK_BANK = { x: 3185, z: 3436 };

async function runTest(): Promise<boolean> {
    console.log('=== Banking Test (SDK) ===');
    console.log('Goal: Deposit and withdraw items from bank');

    // Generate save file at Varrock bank with items
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: VARROCK_BANK,
        inventory: [
            { id: Items.BRONZE_SWORD, count: 1 },
            { id: Items.COINS, count: 100 },
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

        // Check initial inventory
        const initialInv = sdk.getInventory();
        console.log(`Initial inventory: ${initialInv.map(i => `${i.name}(${i.count})`).join(', ')}`);

        // Find the sword and remember its slot
        const initialSword = sdk.findInventoryItem(/bronze sword/i);
        if (!initialSword) {
            console.log('FAILED: No bronze sword in initial inventory');
            return false;
        }
        const swordSlot = initialSword.slot;
        console.log(`Bronze sword at slot ${swordSlot}`);

        console.log(`\n--- Step 1: Find and open bank ---`);

        // Look for bank booth or banker
        const allLocs = sdk.getNearbyLocs();
        const allNpcs = sdk.getNearbyNpcs();

        console.log(`Nearby locs: ${allLocs.slice(0, 8).map(l => l.name).join(', ')}`);
        console.log(`Nearby NPCs: ${allNpcs.slice(0, 8).map(n => n.name).join(', ')}`);

        // Find bank booth and show its options
        const bankBooth = allLocs.find(loc => /bank booth|bank chest/i.test(loc.name));
        if (bankBooth) {
            console.log(`Bank booth options: ${bankBooth.optionsWithIndex.map(o => `${o.opIndex}:${o.text}`).join(', ')}`);
        }

        // Or find banker NPC
        const banker = allNpcs.find(npc =>
            /banker/i.test(npc.name) &&
            npc.optionsWithIndex.some(o => /bank/i.test(o.text))
        );

        let bankOpened = false;

        if (bankBooth && bankBooth.optionsWithIndex.length > 0) {
            // Try "Bank" option first, then "Use"
            const bankOpt = bankBooth.optionsWithIndex.find(o => /^bank$/i.test(o.text)) ||
                           bankBooth.optionsWithIndex.find(o => /use/i.test(o.text)) ||
                           bankBooth.optionsWithIndex[0];
            if (bankOpt) {
                console.log(`Using bank booth at (${bankBooth.x}, ${bankBooth.z}) option ${bankOpt.opIndex}: ${bankOpt.text}`);
                await sdk.sendInteractLoc(bankBooth.x, bankBooth.z, bankBooth.id, bankOpt.opIndex);

                // Wait for interface OR dialog to open
                try {
                    await sdk.waitForCondition(s =>
                        s.interface?.isOpen === true || s.dialog?.isOpen === true,
                        10000
                    );

                    // Click through any dialogs until interface opens
                    for (let i = 0; i < 10; i++) {
                        const state = sdk.getState();
                        if (state?.interface?.isOpen) {
                            bankOpened = true;
                            console.log(`Bank interface opened! ID: ${state.interface.interfaceId}`);
                            break;
                        }
                        if (state?.dialog?.isOpen) {
                            console.log(`Dialog: ${state.dialog.text || '(no text)'}`);
                            // Click first option or continue
                            const opt = state.dialog.options?.[0];
                            await sdk.sendClickDialog(opt?.index ?? 0);
                            await sleep(500);
                        } else {
                            break;
                        }
                    }
                } catch {
                    console.log('No interface or dialog opened');
                }
            }
        } else if (banker) {
            const bankOpt = banker.optionsWithIndex.find(o => /bank/i.test(o.text));
            if (bankOpt) {
                console.log(`Talking to ${banker.name} option: ${bankOpt.text}`);
                await sdk.sendInteractNpc(banker.index, bankOpt.opIndex);

                // Wait for interface to open
                try {
                    await sdk.waitForCondition(s => s.interface?.isOpen === true, 10000);
                    bankOpened = true;
                    const iface = sdk.getState()?.interface;
                    console.log(`Interface opened! ID: ${iface?.interfaceId}`);
                } catch {
                    console.log('Interface did not open');
                }
            }
        } else {
            console.log('No bank booth or banker found nearby');
        }

        if (!bankOpened) {
            console.log('FAILED: Could not open bank interface');
            return false;
        }

        // Small delay to let interface fully load
        await sleep(500);

        console.log(`\n--- Step 2: Deposit bronze sword ---`);

        // Use the new SDK method to deposit the sword
        console.log(`Depositing sword from slot ${swordSlot}...`);
        await sdk.sendBankDeposit(swordSlot, 1);

        // Wait for sword to leave inventory
        let depositWorked = false;
        try {
            await sdk.waitForCondition(s =>
                !s.inventory.some(i => /bronze sword/i.test(i.name)),
                5000
            );
            depositWorked = true;
            console.log('Sword deposited successfully! (no longer in inventory)');
        } catch {
            console.log('Deposit verification timed out');
        }

        // Check current inventory
        await sleep(300);
        const afterDepositInv = sdk.getInventory();
        console.log(`After deposit inventory: ${afterDepositInv.map(i => `${i.name}(${i.count})`).join(', ') || '(empty)'}`);

        const swordStillInInv = afterDepositInv.some(i => /bronze sword/i.test(i.name));
        if (swordStillInInv) {
            console.log('FAILED: Sword still in inventory after deposit');
            return false;
        }

        console.log(`\n--- Step 3: Withdraw bronze sword ---`);

        // The sword should now be in bank slot 0 (first item deposited)
        // Try withdrawing from slot 0
        console.log('Withdrawing sword from bank slot 0...');
        await sdk.sendBankWithdraw(0, 1);

        // Wait for sword to return to inventory
        let withdrawWorked = false;
        try {
            await sdk.waitForCondition(s =>
                s.inventory.some(i => /bronze sword/i.test(i.name)),
                5000
            );
            withdrawWorked = true;
            console.log('Sword withdrawn successfully! (back in inventory)');
        } catch {
            console.log('Withdraw verification timed out');
        }

        // Final inventory check
        await sleep(300);
        const finalInv = sdk.getInventory();
        console.log(`Final inventory: ${finalInv.map(i => `${i.name}(${i.count})`).join(', ')}`);

        const swordReturned = finalInv.some(i => /bronze sword/i.test(i.name));

        console.log('\n=== Results ===');
        console.log(`Bank opened: YES`);
        console.log(`Deposit worked: ${depositWorked ? 'YES' : 'NO'}`);
        console.log(`Withdraw worked: ${withdrawWorked ? 'YES' : 'NO'}`);
        console.log(`Sword returned to inventory: ${swordReturned ? 'YES' : 'NO'}`);

        if (depositWorked && withdrawWorked && swordReturned) {
            console.log('SUCCESS: Full deposit/withdraw cycle completed!');
            return true;
        } else {
            console.log('FAILED: Deposit/withdraw cycle incomplete');
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
