#!/usr/bin/env bun
/**
 * Banking Withdraw Amount Test
 * Tests withdrawItem() with a specific numeric amount argument.
 *
 * Success criteria:
 * 1. Deposit 100 coins into bank
 * 2. Withdraw exactly 25 coins using withdrawItem(target, 25)
 * 3. Verify inventory has exactly 25 coins (not 1, not 100)
 * 4. Verify bank still has 75 coins remaining
 */

import { runTest, sleep } from './utils/test-runner';
import { Items } from './utils/save-generator';

const AL_KHARID_BANK = { x: 3269, z: 3167 };

runTest({
    name: 'Banking Withdraw Amount Test',
    saveConfig: {
        position: AL_KHARID_BANK,
        inventory: [
            { id: Items.COINS, count: 100 },
        ],
    },
    launchOptions: { skipTutorial: false },
}, async ({ sdk, bot }) => {
    console.log('Goal: Test withdrawItem() with amount=25 on stackable coins');

    // Wait for state to load
    await sdk.waitForCondition(s => (s.player?.worldX ?? 0) > 0 && s.inventory.length > 0, 10000);
    await sleep(500);

    const initialCoins = sdk.findInventoryItem(/coins/i);
    if (!initialCoins) {
        console.log('FAILED: No coins in initial inventory');
        return false;
    }
    console.log(`Initial coins: ${initialCoins.count}`);

    // Step 1: Open bank
    console.log('\n--- Step 1: Open bank ---');
    const openResult = await bot.openBank();
    console.log(`openBank(): ${openResult.success ? 'SUCCESS' : 'FAILED'} - ${openResult.message}`);
    if (!openResult.success) {
        console.log('FAILED: Could not open bank');
        return false;
    }

    // Step 2: Deposit all 100 coins
    console.log('\n--- Step 2: Deposit all 100 coins ---');
    const depositResult = await bot.depositItem(/coins/i, -1);
    console.log(`depositItem(coins, -1): ${depositResult.success ? 'SUCCESS' : 'FAILED'} - ${depositResult.message}`);
    if (!depositResult.success) {
        console.log('FAILED: Could not deposit coins');
        return false;
    }

    await sleep(300);
    const coinsAfterDeposit = sdk.findInventoryItem(/coins/i);
    if (coinsAfterDeposit) {
        console.log(`FAILED: Still have ${coinsAfterDeposit.count} coins in inventory after deposit`);
        return false;
    }
    console.log('All coins deposited (inventory empty of coins)');

    // Check bank contents
    const bankState = sdk.getState();
    const bankCoins = bankState?.bank.items.find(i => /coins/i.test(i.name));
    console.log(`Bank coins: ${bankCoins ? `${bankCoins.count} (slot ${bankCoins.slot})` : 'NOT FOUND'}`);

    // Step 3: Withdraw exactly 25 coins
    console.log('\n--- Step 3: Withdraw 25 coins with withdrawItem(coins, 25) ---');
    const t0 = Date.now();
    const withdrawResult = await bot.withdrawItem(/coins/i, 25);
    const elapsed = Date.now() - t0;
    console.log(`withdrawItem(coins, 25): ${withdrawResult.success ? 'SUCCESS' : 'FAILED'} - ${withdrawResult.message} (${elapsed}ms)`);

    if (!withdrawResult.success) {
        console.log('FAILED: Could not withdraw coins');
        return false;
    }

    if (withdrawResult.item) {
        console.log(`Withdrawn item: ${withdrawResult.item.name} x${withdrawResult.item.count}`);
    }

    // Step 4: Verify amounts
    console.log('\n--- Step 4: Verify amounts ---');
    await sleep(300);

    const invCoins = sdk.findInventoryItem(/coins/i);
    const invCount = invCoins?.count ?? 0;
    console.log(`Inventory coins: ${invCount} (expected: 25)`);

    const finalBankState = sdk.getState();
    const remainingBankCoins = finalBankState?.bank.items.find(i => /coins/i.test(i.name));
    const bankCount = remainingBankCoins?.count ?? 0;
    console.log(`Bank coins remaining: ${bankCount} (expected: 75)`);

    // Close bank
    await bot.closeBank();

    // Final verdict
    console.log('\n=== Results ===');
    const invCorrect = invCount === 25;
    const bankCorrect = bankCount === 75;
    console.log(`Inventory has 25 coins: ${invCorrect ? 'YES' : `NO (got ${invCount})`}`);
    console.log(`Bank has 75 coins: ${bankCorrect ? 'YES' : `NO (got ${bankCount})`}`);

    if (invCorrect && bankCorrect) {
        console.log('\nPASSED: withdrawItem(target, 25) correctly withdrew exactly 25 coins!');
        return true;
    } else {
        console.log('\nFAILED: Amount mismatch');
        return false;
    }
});
