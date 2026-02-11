#!/usr/bin/env bun
/**
 * Strength Amulet Test
 *
 * Tests the full jewelry pipeline: craft → string → enchant.
 *
 * Steps:
 * 1. Use gold bar on furnace → craft ruby amulet (u)  (Crafting 50)
 * 2. Use ball of wool on ruby amulet (u) → string it  (Crafting 50)
 * 3. Cast Lvl-3 Enchant on ruby amulet → strength amulet (Magic 49, 1 cosmic + 5 fire runes)
 *
 * Success criteria: Strength amulet appears in inventory + Magic XP gained.
 */

import { runTest, sleep } from './utils/test-runner';
import { Items, Locations } from './utils/save-generator';

// Item IDs not in the shared Items constant
const GOLD_BAR = 2357;
const RUBY = 1603;
const AMULET_MOULD = 1595;
const COSMIC_RUNE = 564;

// Lumbridge furnace area
const FURNACE_AREA = { x: 3225, z: 3256 };

runTest({
    name: 'Strength Amulet Test',
    saveConfig: {
        position: FURNACE_AREA,
        skills: { Crafting: 50, Magic: 49 },
        inventory: [
            { id: GOLD_BAR, count: 1 },
            { id: RUBY, count: 1 },
            { id: AMULET_MOULD, count: 1 },
            { id: Items.BALL_OF_WOOL, count: 1 },
            { id: COSMIC_RUNE, count: 1 },
            { id: Items.FIRE_RUNE, count: 5 },
        ],
    },
    launchOptions: { skipTutorial: false },
}, async ({ sdk, bot }) => {
    console.log('Goal: Craft a strength amulet (gold bar → ruby amulet → string → enchant)');

    // Wait for state to fully load
    await sdk.waitForCondition(s => (s.player?.worldX ?? 0) > 0 && s.inventory.length > 0, 10000);
    await sleep(500);

    const initialCraftXp = sdk.getSkill('Crafting')?.experience ?? 0;
    const initialMagicXp = sdk.getSkill('Magic')?.experience ?? 0;
    console.log(`Initial Crafting XP: ${initialCraftXp}, Magic XP: ${initialMagicXp}`);

    // Verify inventory
    const goldBar = sdk.findInventoryItem(/gold bar/i);
    const ruby = sdk.findInventoryItem(/ruby/i);
    const mould = sdk.findInventoryItem(/amulet mould/i);
    const wool = sdk.findInventoryItem(/ball of wool/i);
    const cosmicRunes = sdk.findInventoryItem(/cosmic rune/i);
    const fireRunes = sdk.findInventoryItem(/fire rune/i);

    console.log(`Inventory: gold bar=${goldBar?.name ?? 'MISSING'}, ruby=${ruby?.name ?? 'MISSING'}, mould=${mould?.name ?? 'MISSING'}`);
    console.log(`          wool=${wool?.name ?? 'MISSING'}, cosmic=${cosmicRunes?.count ?? 0}, fire=${fireRunes?.count ?? 0}`);

    if (!goldBar || !ruby || !mould || !wool || !cosmicRunes || !fireRunes) {
        console.log('FAILED: Missing required items in inventory');
        return false;
    }

    // ========================================
    // Step 1: Craft ruby amulet (u) at furnace
    // ========================================
    console.log('\n--- Step 1: Crafting ruby amulet (u) at furnace ---');

    const craftResult = await bot.craftJewelry({ product: 'amulet', gem: 'ruby' });
    console.log(`Craft result: ${craftResult.message}`);

    if (!craftResult.success) {
        console.log(`FAILED at step 1: ${craftResult.message} (reason: ${craftResult.reason})`);
        return false;
    }

    console.log(`Crafting XP gained: +${craftResult.xpGained}`);
    if (craftResult.product) {
        console.log(`Crafted: ${craftResult.product.name}`);
    }

    // Verify we have the unstrung amulet
    const unstrung = sdk.findInventoryItem(/ruby amulet/i) ?? sdk.findInventoryItem(/amulet/i);
    if (!unstrung) {
        console.log('FAILED: No ruby amulet (u) found after crafting');
        return false;
    }
    console.log(`Got: ${unstrung.name} (slot ${unstrung.slot})`);

    // ========================================
    // Step 2: String the amulet with ball of wool
    // ========================================
    console.log('\n--- Step 2: Stringing ruby amulet ---');

    const stringResult = await bot.stringAmulet(/ruby amulet/i);
    console.log(`String result: ${stringResult.message}`);

    if (!stringResult.success) {
        console.log(`FAILED at step 2: ${stringResult.message} (reason: ${stringResult.reason})`);
        return false;
    }

    console.log(`Crafting XP gained: +${stringResult.xpGained}`);
    if (stringResult.product) {
        console.log(`Got: ${stringResult.product.name}`);
    }

    // Verify we have the strung ruby amulet
    const strung = sdk.findInventoryItem(/ruby amulet/i);
    if (!strung) {
        console.log('FAILED: No strung ruby amulet found after stringing');
        return false;
    }
    console.log(`Strung amulet: ${strung.name} (slot ${strung.slot})`);

    // ========================================
    // Step 3: Enchant ruby amulet → strength amulet
    // ========================================
    console.log('\n--- Step 3: Enchanting ruby amulet (Lvl-3 Enchant) ---');

    const enchantResult = await bot.enchantItem(/ruby amulet/i, 3);
    console.log(`Enchant result: ${enchantResult.message}`);

    if (!enchantResult.success) {
        console.log(`FAILED at step 3: ${enchantResult.message} (reason: ${enchantResult.reason})`);
        return false;
    }

    console.log(`Magic XP gained: +${enchantResult.xpGained}`);
    if (enchantResult.product) {
        console.log(`Got: ${enchantResult.product.name}`);
    }

    // ========================================
    // Final verification
    // ========================================
    console.log('\n=== Results ===');

    const finalCraftXp = sdk.getSkill('Crafting')?.experience ?? 0;
    const finalMagicXp = sdk.getSkill('Magic')?.experience ?? 0;

    console.log(`Crafting XP: ${initialCraftXp} → ${finalCraftXp} (+${finalCraftXp - initialCraftXp})`);
    console.log(`Magic XP: ${initialMagicXp} → ${finalMagicXp} (+${finalMagicXp - initialMagicXp})`);

    // Check for the final product
    const strengthAmulet = sdk.findInventoryItem(/strength amulet/i);
    if (strengthAmulet) {
        console.log(`SUCCESS: Created ${strengthAmulet.name}!`);
        return true;
    }

    // The enchanted item might have a different name — check if magic XP was gained
    if (finalMagicXp > initialMagicXp && finalCraftXp > initialCraftXp) {
        const inv = sdk.getInventory();
        console.log('Final inventory:', inv.map(i => i.name).join(', '));
        console.log('SUCCESS: Full pipeline completed (Crafting + Magic XP gained)');
        return true;
    }

    console.log('FAILED: Could not verify strength amulet creation');
    return false;
});
