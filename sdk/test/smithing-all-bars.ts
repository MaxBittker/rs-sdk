#!/usr/bin/env bun
/**
 * Smithing Test - All Bar Types
 *
 * Tests smithAtAnvil for each bar type (bronze through rune) smithing:
 *   - Scimitar (column 1, slot 2) - 2 bars
 *   - Full helm (column 4, slot 1) - 2 bars
 *   - Arrowheads (column 5, slot 1) - 1 bar
 *
 * Spawns at Varrock West anvil with 99 Smithing.
 * Hammer in inventory, all bars in bank.
 * Uses bank booth (not NPC) for withdrawing bars between types.
 */

import { runTest } from './utils/test-runner';
import { Items } from './utils/save-generator';

const ANVIL_AREA = { x: 3188, z: 3426 };
const BANK_AREA = { x: 3185, z: 3436 };

const BAR_TYPES = [
    { name: 'Bronze', id: Items.BRONZE_BAR, pattern: /bronze bar/i },
    { name: 'Iron', id: Items.IRON_BAR, pattern: /iron bar/i },
    { name: 'Steel', id: Items.STEEL_BAR, pattern: /steel bar/i },
    { name: 'Mithril', id: Items.MITHRIL_BAR, pattern: /mithril bar/i },
    { name: 'Adamantite', id: Items.ADAMANTITE_BAR, pattern: /adamantite bar/i },
    { name: 'Runite', id: Items.RUNITE_BAR, pattern: /runite bar/i },
] as const;

const PRODUCTS = [
    { name: 'scimitar', bars: 2 },
    { name: 'full helm', bars: 2 },
    { name: 'arrowheads', bars: 1 },
] as const;

const BARS_PER_TYPE = PRODUCTS.reduce((sum, p) => sum + p.bars, 0); // 5

async function openBankBooth(sdk: any, bot: any): Promise<boolean> {
    // Walk to Varrock West Bank
    const walkResult = await bot.walkTo(BANK_AREA.x, BANK_AREA.z, 2);
    if (!walkResult.success) {
        console.log(`  Could not walk to bank: ${walkResult.message}`);
        return false;
    }
return bot.openBank();
}

async function depositAllExceptHammer(sdk: any): Promise<void> {
    const inv = sdk.getInventory();
    for (const item of inv) {
        if (!/hammer/i.test(item.name)) {
            await sdk.sendBankDeposit(item.slot, item.count);
            await sdk.waitForTicks(1);
        }
    }
    await sdk.waitForTicks(2);
}

async function withdrawBars(sdk: any, barPattern: RegExp, amount: number): Promise<boolean> {
    const bankState = sdk.getState();
    const bankItems = bankState?.bank?.items || [];
    const barInBank = bankItems.find((i: any) => barPattern.test(i.name));
    if (!barInBank || barInBank.count < amount) {
        console.log(`  Not enough bars in bank (found: ${barInBank?.count ?? 0}, need: ${amount})`);
        return false;
    }
    await sdk.sendBankWithdraw(barInBank.slot, amount);
    await sdk.waitForTicks(2);
    return true;
}

runTest({
    name: 'Smithing All Bars Test',
    saveConfig: {
        position: ANVIL_AREA,
        skills: { Smithing: 99 },
        inventory: [
            { id: Items.HAMMER, count: 1 },
        ],
        bank: [
            { id: Items.BRONZE_BAR, count: BARS_PER_TYPE },
            { id: Items.IRON_BAR, count: BARS_PER_TYPE },
            { id: Items.STEEL_BAR, count: BARS_PER_TYPE },
            { id: Items.MITHRIL_BAR, count: BARS_PER_TYPE },
            { id: Items.ADAMANTITE_BAR, count: BARS_PER_TYPE },
            { id: Items.RUNITE_BAR, count: BARS_PER_TYPE },
        ],
    },
    launchOptions: { skipTutorial: false },
}, async ({ sdk, bot }) => {
    console.log('=== Smithing All Bars Test ===');
    console.log('Testing: scimitar, full helm, arrowheads for each bar type\n');

    await sdk.waitForCondition(s => (s.player?.worldX ?? 0) > 0 && s.inventory.length > 0, 10000);

    const results: Array<{ bar: string; product: string; success: boolean; message: string; xp?: number }> = [];
    let allPassed = true;

    for (const barType of BAR_TYPES) {
        console.log(`\n--- ${barType.name} Bars ---`);

        // Bank products from previous run and withdraw new bars
        console.log('  Opening bank booth...');
        const bankOpened = await openBankBooth(sdk, bot);
        if (!bankOpened) {
            console.log(`  ERROR: Could not open bank for ${barType.name}`);
            allPassed = false;
            for (const product of PRODUCTS) {
                results.push({ bar: barType.name, product: product.name, success: false, message: 'Could not open bank' });
            }
            continue;
        }

        await depositAllExceptHammer(sdk);

        const withdrew = await withdrawBars(sdk, barType.pattern, BARS_PER_TYPE);
        if (!withdrew) {
            console.log(`  ERROR: Could not withdraw ${barType.name} bars`);
            await sdk.sendCloseModal();
            await sdk.waitForTicks(2);
            allPassed = false;
            for (const product of PRODUCTS) {
                results.push({ bar: barType.name, product: product.name, success: false, message: 'No bars in bank' });
            }
            continue;
        }

        // Close bank
        await sdk.sendCloseModal();
        await sdk.waitForTicks(3);

        // Walk back to anvil
        console.log('  Walking to anvil...');
        await bot.walkTo(ANVIL_AREA.x, ANVIL_AREA.z, 2);

        // Smith each product
        for (const product of PRODUCTS) {
            await bot.dismissBlockingUI();

            const barCount = sdk.getInventory()
                .filter((i: any) => barType.pattern.test(i.name))
                .reduce((sum: number, i: any) => sum + i.count, 0);

            if (barCount < product.bars) {
                const msg = `Not enough bars: have ${barCount}, need ${product.bars}`;
                console.log(`  ${product.name}: SKIP - ${msg}`);
                results.push({ bar: barType.name, product: product.name, success: false, message: msg });
                allPassed = false;
                continue;
            }

            console.log(`  Smithing ${barType.name} ${product.name}...`);
            const result = await bot.smithAtAnvil(product.name, {
                barPattern: barType.pattern,
                timeout: 15000,
            });

            results.push({
                bar: barType.name,
                product: product.name,
                success: result.success,
                message: result.message,
                xp: result.xpGained,
            });

            if (result.success) {
                console.log(`  ${product.name}: OK (xp: +${result.xpGained}, product: ${result.product?.name ?? '?'})`);
            } else {
                console.log(`  ${product.name}: FAIL - ${result.message} (reason: ${result.reason})`);
                allPassed = false;
            }

            await sdk.waitForTicks(2);
        }
    }

    // Summary
    console.log('\n\n========== RESULTS ==========');
    const maxBar = Math.max(...results.map(r => r.bar.length));
    const maxProd = Math.max(...results.map(r => r.product.length));
    for (const r of results) {
        const status = r.success ? 'PASS' : 'FAIL';
        const xpStr = r.xp ? ` (xp: +${r.xp})` : '';
        console.log(`  ${r.bar.padEnd(maxBar)} ${r.product.padEnd(maxProd)} ${status}${xpStr}${r.success ? '' : ' - ' + r.message}`);
    }

    const passed = results.filter(r => r.success).length;
    const total = results.length;
    console.log(`\n${passed}/${total} passed`);

    return allPassed;
});
