#!/usr/bin/env bun
/**
 * Combat Style Test (SDK)
 * Tests the name-based combat style API (issue #20).
 *
 * Verifies:
 * 1. sdk.sendSetCombatStyle('Strength') resolves skill name to correct index
 * 2. bot.setCombatStyle('Attack') porcelain waits for effect
 * 3. Invalid skill names return clear errors with available styles
 * 4. Styles update correctly after weapon change
 * 5. getCombatStyle() convenience method works
 */

import { runTest, sleep } from './utils/test-runner';
import { Locations, Items } from './utils/save-generator';

runTest({
    name: 'Combat Style Test (SDK)',
    saveConfig: {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Attack: 10, Strength: 10, Defence: 10 },
        inventory: [
            { id: Items.BRONZE_SWORD, count: 1 },
            { id: Items.SHORTBOW, count: 1 },
        ],
    },
    launchOptions: { skipTutorial: false },
}, async ({ sdk, bot }) => {
    console.log('Goal: Verify name-based combat style API');

    // Wait for state
    await sdk.waitForCondition(s => (s.player?.worldX ?? 0) > 0, 10000);
    await sleep(500);

    // --- Test 1: getCombatStyle() returns state ---
    console.log('\n--- Test 1: getCombatStyle() convenience method ---');
    const combatState = sdk.getCombatStyle();
    if (!combatState) {
        console.log('FAIL: getCombatStyle() returned null');
        return false;
    }
    console.log(`  Weapon: ${combatState.weaponName}`);
    console.log(`  Current style: ${combatState.currentStyle}`);
    console.log(`  Styles: ${combatState.styles.map(s => `${s.index}:${s.name}(${s.trainedSkill})`).join(', ')}`);
    console.log('  PASS: getCombatStyle() returns valid state');

    // --- Test 2: sendSetCombatStyle with skill name (plumbing) ---
    console.log('\n--- Test 2: sendSetCombatStyle with skill name ---');
    const result2 = await sdk.sendSetCombatStyle('Strength');
    console.log(`  sendSetCombatStyle('Strength'): success=${result2.success}, message=${result2.message}`);
    if (!result2.success) {
        console.log('  FAIL: Could not set combat style by skill name');
        return false;
    }
    console.log('  PASS: sendSetCombatStyle accepts skill name');

    // --- Test 3: sendSetCombatStyle with case-insensitive name ---
    console.log('\n--- Test 3: Case-insensitive skill name ---');
    const result3 = await sdk.sendSetCombatStyle('defence' as any);
    console.log(`  sendSetCombatStyle('defence'): success=${result3.success}, message=${result3.message}`);
    if (!result3.success) {
        console.log('  FAIL: Case-insensitive matching did not work');
        return false;
    }
    console.log('  PASS: Case-insensitive matching works');

    // --- Test 4: sendSetCombatStyle with invalid skill name ---
    console.log('\n--- Test 4: Invalid skill name returns error ---');
    const result4 = await sdk.sendSetCombatStyle('Ranged' as any);
    // Should fail because we're using a melee weapon (unarmed or sword), not a bow
    if (combatState.weaponName.toLowerCase().includes('bow')) {
        console.log('  SKIP: Weapon is a bow, Ranged is valid');
    } else {
        console.log(`  sendSetCombatStyle('Ranged'): success=${result4.success}, message=${result4.message}`);
        if (result4.success) {
            console.log('  FAIL: Should have returned error for Ranged on melee weapon');
            return false;
        }
        if (!result4.message.includes('Available:')) {
            console.log('  FAIL: Error message should list available styles');
            return false;
        }
        console.log('  PASS: Invalid skill name returns descriptive error');
    }

    // --- Test 5: Porcelain setCombatStyle ---
    console.log('\n--- Test 5: Porcelain bot.setCombatStyle() ---');
    const result5 = await bot.setCombatStyle('Attack');
    console.log(`  bot.setCombatStyle('Attack'): success=${result5.success}, message=${result5.message}`);
    if (!result5.success) {
        console.log('  FAIL: Porcelain setCombatStyle failed');
        return false;
    }
    if (result5.style) {
        console.log(`  Style set: ${result5.style.name} (${result5.style.type}) -> trains ${result5.style.trainedSkill}`);
    }
    console.log('  PASS: Porcelain setCombatStyle works');

    // --- Test 6: setCombatStyle already_set ---
    console.log('\n--- Test 6: setCombatStyle when already set ---');
    const result6 = await bot.setCombatStyle('Attack');
    console.log(`  bot.setCombatStyle('Attack') again: success=${result6.success}, reason=${result6.reason}`);
    if (result6.reason !== 'already_set') {
        console.log('  FAIL: Should return already_set reason');
        return false;
    }
    console.log('  PASS: Returns already_set when style unchanged');

    // --- Test 7: setCombatStyle with no_matching_style ---
    console.log('\n--- Test 7: Porcelain no_matching_style ---');
    if (!combatState.weaponName.toLowerCase().includes('bow')) {
        const result7 = await bot.setCombatStyle('Ranged');
        console.log(`  bot.setCombatStyle('Ranged'): success=${result7.success}, reason=${result7.reason}`);
        if (result7.reason !== 'no_matching_style') {
            console.log('  FAIL: Should return no_matching_style reason');
            return false;
        }
        console.log('  PASS: Returns no_matching_style with descriptive error');
    } else {
        console.log('  SKIP: Current weapon supports Ranged');
    }

    // --- Test 8: Equip bow and verify styles change ---
    console.log('\n--- Test 8: Style resolution after weapon change ---');
    const bow = sdk.getInventory().find(i => /bow/i.test(i.name));
    if (bow) {
        console.log(`  Equipping ${bow.name}...`);
        await bot.equipItem(bow);
        await sleep(500);

        const bowState = sdk.getCombatStyle();
        if (bowState) {
            console.log(`  New weapon: ${bowState.weaponName}`);
            console.log(`  Styles: ${bowState.styles.map(s => `${s.name}(${s.trainedSkill})`).join(', ')}`);

            // Now Ranged should work
            const result8 = await sdk.sendSetCombatStyle('Ranged');
            console.log(`  sendSetCombatStyle('Ranged'): success=${result8.success}`);
            if (!result8.success) {
                console.log('  FAIL: Ranged should work with bow equipped');
                return false;
            }
            console.log('  PASS: Style resolution updates with weapon change');
        }
    } else {
        console.log('  SKIP: No bow in inventory');
    }

    // --- Test 9: Raw index still works (backwards compat) ---
    console.log('\n--- Test 9: Raw index backwards compatibility ---');
    const result9 = await sdk.sendSetCombatStyle(0);
    console.log(`  sendSetCombatStyle(0): success=${result9.success}`);
    if (!result9.success) {
        console.log('  FAIL: Raw index should still work');
        return false;
    }
    console.log('  PASS: Raw index remains backwards compatible');

    console.log('\n=== All combat style tests passed ===');
    return true;
});
