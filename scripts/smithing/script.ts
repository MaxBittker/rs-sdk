/**
 * Smithing Training Script v4
 *
 * Goal: Train Smithing to level 10+ from a fresh Lumbridge spawn
 *
 * Strategy (v4):
 * 1. Sell shortbow for coins (toll money)
 * 2. Walk to SE Varrock mine copper/tin area (around 3289, 3363)
 * 3. Mine copper/tin ore (balanced)
 * 4. Walk to Al-Kharid and pay toll
 * 5. Smelt bronze bars at Al-Kharid furnace
 * 6. Repeat until level 10
 *
 * v4 Changes:
 * - Back to SE Varrock mine (has copper/tin, Al-Kharid has iron/gold/scorpions)
 * - Better copper/tin detection by checking specific rock locations
 */

import { runScript, TestPresets, type ScriptContext } from '../script-runner';

// Locations
const LUMBRIDGE_SHOP = { x: 3211, z: 3247 };
const AL_KHARID_GATE = { x: 3268, z: 3228 };
const AL_KHARID_FURNACE = { x: 3274, z: 3186 };
const AL_KHARID_INSIDE = { x: 3277, z: 3227 };

// SE Varrock mine - copper/tin area is in the central-east section
// Copper rocks around (3287-3290, 3361-3366)
// Tin rocks around (3282-3286, 3364-3368)
const SE_VARROCK_MINE_COPPERTIN = { x: 3286, z: 3365 };

// Waypoints from Lumbridge to SE Varrock mine copper/tin area
// Note: We use all waypoints to ensure we reach the correct spot
const WAYPOINTS_TO_MINE = [
    { x: 3222, z: 3250 },  // North of Lumbridge
    { x: 3235, z: 3290 },  // Continue north
    { x: 3255, z: 3320 },  // Approaching mine
    { x: 3275, z: 3350 },  // Near mine entrance
    SE_VARROCK_MINE_COPPERTIN,  // Final destination: 3286, 3365
];

// Get smithing stats
function getSmithingStats(ctx: ScriptContext): { level: number; xp: number } {
    const state = ctx.state();
    const smithing = state?.skills.find(s => s.name === 'Smithing');
    return {
        level: smithing?.baseLevel ?? 1,
        xp: smithing?.experience ?? 0
    };
}

// Get current coin count
function getCoins(ctx: ScriptContext): number {
    const coins = ctx.sdk.findInventoryItem(/^coins$/i);
    return coins?.count ?? 0;
}

// Check if inside Al Kharid
function isInsideAlKharid(ctx: ScriptContext): boolean {
    const state = ctx.state();
    return (state?.player?.worldX ?? 0) >= 3270;
}

// Count ore in inventory
function countOre(ctx: ScriptContext): { copper: number; tin: number; bronzeBars: number } {
    const inv = ctx.state()?.inventory ?? [];
    return {
        copper: inv.filter(i => /copper ore/i.test(i.name)).reduce((sum, i) => sum + i.count, 0),
        tin: inv.filter(i => /tin ore/i.test(i.name)).reduce((sum, i) => sum + i.count, 0),
        bronzeBars: inv.filter(i => /bronze bar/i.test(i.name)).reduce((sum, i) => sum + i.count, 0),
    };
}

// Get coins by selling items at Lumbridge shop
async function getCoinsFromShop(ctx: ScriptContext): Promise<boolean> {
    ctx.log('Selling items for toll money...');

    await ctx.bot.walkTo(LUMBRIDGE_SHOP.x, LUMBRIDGE_SHOP.z);
    ctx.progress();

    const openResult = await ctx.bot.openShop(/shop keeper/i);
    if (!openResult.success) {
        ctx.log(`Failed to open shop: ${openResult.message}`);
        return false;
    }
    ctx.progress();

    // Sell shortbow (worth ~20gp)
    const sellResult = await ctx.bot.sellToShop(/shortbow/i, 1);
    if (sellResult.success) {
        ctx.log(sellResult.message);
    }

    await ctx.bot.closeShop();

    const coins = getCoins(ctx);
    ctx.log(`Have ${coins}gp after selling`);
    return coins >= 10;
}

// Walk to SE Varrock mine
// The pathfinder should handle routing automatically
async function walkToMine(ctx: ScriptContext): Promise<void> {
    ctx.log('Walking to SE Varrock mine...');

    const currentPos = ctx.state()?.player;
    ctx.log(`From (${currentPos?.worldX}, ${currentPos?.worldZ}) to (${SE_VARROCK_MINE_COPPERTIN.x}, ${SE_VARROCK_MINE_COPPERTIN.z})`);

    // Try direct walk to mine
    let result = await ctx.bot.walkTo(SE_VARROCK_MINE_COPPERTIN.x, SE_VARROCK_MINE_COPPERTIN.z);

    if (!result.success) {
        ctx.log(`Direct walk failed: ${result.message}`);

        // Try via an intermediate point (around Varrock east)
        ctx.log('Trying via Varrock east gate area...');
        const intermediate = { x: 3275, z: 3340 };
        result = await ctx.bot.walkTo(intermediate.x, intermediate.z);
        if (result.success) {
            result = await ctx.bot.walkTo(SE_VARROCK_MINE_COPPERTIN.x, SE_VARROCK_MINE_COPPERTIN.z);
        }
    }

    ctx.progress();

    // Dismiss any dialogs
    const state = ctx.state();
    if (state?.dialog.isOpen) {
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 300));
    }

    const pos = ctx.state()?.player;
    ctx.log(`At mine: (${pos?.worldX}, ${pos?.worldZ})`);
}

// Prospect a rock to find what ore it contains
async function prospectRock(ctx: ScriptContext, rock: { x: number; z: number; id: number; optionsWithIndex: Array<{ text: string; opIndex: number }> }): Promise<string | null> {
    const prospectOpt = rock.optionsWithIndex.find(o => /prospect/i.test(o.text));
    if (!prospectOpt) return null;

    const startTick = ctx.state()?.tick ?? 0;

    await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, prospectOpt.opIndex);
    await new Promise(r => setTimeout(r, 800));  // Brief wait for action

    try {
        const state = await ctx.sdk.waitForCondition(s => {
            for (const msg of s.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes('rock contains') || text.includes('ore') || text.includes('no ore') || text.includes('nothing')) {
                        return true;
                    }
                }
            }
            return false;
        }, 3000);  // Reduced from 5000

        // Extract ore type from message
        for (const msg of state.gameMessages) {
            if (msg.tick > startTick) {
                const text = msg.text.toLowerCase();
                if (text.includes('copper')) return 'copper';
                if (text.includes('tin')) return 'tin';
                if (text.includes('iron')) return 'iron';
                if (text.includes('gold')) return 'gold';
                if (text.includes('coal')) return 'coal';
                if (text.includes('no ore') || text.includes('nothing')) return 'empty';
            }
        }
    } catch {
        return null;
    }
    return null;
}

// Find and mine a rock (copper or tin)
// Use prospecting to filter out iron/gold, but don't try to balance
async function mineRock(ctx: ScriptContext): Promise<boolean> {
    const state = ctx.state();
    if (!state) return false;

    // Dismiss dialogs first
    if (state.dialog.isOpen) {
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 300));
        ctx.progress();
    }

    // Find rocks with Mine option - sort by distance
    const rocks = state.nearbyLocs.filter(loc =>
        /rocks?/i.test(loc.name) && !/rockslide/i.test(loc.name) &&
        loc.optionsWithIndex.some(o => /mine/i.test(o.text))
    ).sort((a, b) => a.distance - b.distance);

    if (rocks.length === 0) {
        ctx.log('No rocks nearby');
        return false;
    }

    // Try prospecting and mining rocks
    for (const rock of rocks.slice(0, 5)) {
        // Prospect to check ore type
        const oreType = await prospectRock(ctx, rock);
        ctx.progress();

        // Skip non-copper/tin or empty rocks
        if (!oreType || oreType === 'empty') continue;
        if (oreType !== 'copper' && oreType !== 'tin') {
            ctx.log(`Skip ${oreType} rock`);
            continue;
        }

        // Mine the rock immediately after prospecting
        const mineOpt = rock.optionsWithIndex.find(o => /mine/i.test(o.text));
        if (!mineOpt) continue;

        const xpBefore = ctx.state()?.skills.find(s => s.name === 'Mining')?.experience ?? 0;
        const invCountBefore = ctx.state()?.inventory.length ?? 0;

        ctx.log(`Mining ${oreType} at (${rock.x}, ${rock.z})...`);
        await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);

        // Wait for mining to complete
        try {
            await ctx.sdk.waitForCondition(state => {
                // Dismiss any dialogs
                if (state.dialog.isOpen) {
                    ctx.sdk.sendClickDialog(0).catch(() => {});
                }

                // Check for XP gain or inventory change
                const miningXp = state.skills.find(s => s.name === 'Mining')?.experience ?? 0;
                return miningXp > xpBefore || state.inventory.length > invCountBefore;
            }, 8000);

            const currentOre = countOre(ctx);
            ctx.log(`Mined! (${currentOre.copper} copper, ${currentOre.tin} tin)`);
            ctx.progress();
            return true;
        } catch {
            ctx.log('Mining timeout');
        }
    }

    return false;
}

// Mine ore until we have enough copper and tin
async function mineOre(ctx: ScriptContext, targetPairs: number): Promise<void> {
    ctx.log(`Mining ${targetPairs} pairs of ore...`);

    let consecutiveFails = 0;

    while (consecutiveFails < 5) {
        const ore = countOre(ctx);
        const pairs = Math.min(ore.copper, ore.tin);

        if (pairs >= targetPairs) {
            ctx.log(`Have ${pairs} ore pairs, done mining`);
            break;
        }

        // Check inventory space
        const invCount = ctx.state()?.inventory.length ?? 0;
        if (invCount >= 26) {  // Leave some space
            ctx.log('Inventory nearly full');
            break;
        }

        // Log current ore counts
        ctx.log(`Mining... (copper: ${ore.copper}, tin: ${ore.tin})`);

        // Just mine any copper or tin we find - don't try to balance
        // The preference logic was causing issues where rocks respawn as different ore
        const result = await mineRock(ctx);

        if (!result) {
            consecutiveFails++;
            ctx.log(`Mining failed (${consecutiveFails}/5)`);

            // Walk around to find rocks
            const currentPos = ctx.state()?.player;
            if (currentPos) {
                const offsetX = (Math.random() - 0.5) * 15;
                const offsetZ = (Math.random() - 0.5) * 15;
                await ctx.bot.walkTo(
                    Math.round(SE_VARROCK_MINE_COPPERTIN.x + offsetX),
                    Math.round(SE_VARROCK_MINE_COPPERTIN.z + offsetZ)
                );
            }
            await new Promise(r => setTimeout(r, 1000));
        } else {
            consecutiveFails = 0;
        }

        ctx.progress();
    }
}

// Pay toll and enter Al Kharid
async function enterAlKharid(ctx: ScriptContext): Promise<boolean> {
    if (isInsideAlKharid(ctx)) {
        ctx.log('Already in Al Kharid');
        return true;
    }

    ctx.log('Walking to toll gate...');
    await ctx.bot.walkTo(AL_KHARID_GATE.x, AL_KHARID_GATE.z);
    ctx.progress();

    // Find and interact with gate
    const state = ctx.state();
    const gate = state?.nearbyLocs.find(l => /gate/i.test(l.name) && l.distance < 10);

    if (!gate) {
        ctx.log('Gate not found!');
        return false;
    }

    const openOpt = gate.optionsWithIndex.find(o => /pay|open/i.test(o.text));
    if (!openOpt) {
        ctx.log('No open option on gate');
        return false;
    }

    ctx.log('Interacting with gate...');
    await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, openOpt.opIndex);
    await new Promise(r => setTimeout(r, 800));

    // Handle dialog - pay toll
    for (let i = 0; i < 20; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) {
            await new Promise(r => setTimeout(r, 150));
            continue;
        }

        const yesOpt = s.dialog.options.find(o => /yes/i.test(o.text));
        if (yesOpt) {
            ctx.log('Paying toll...');
            await ctx.sdk.sendClickDialog(yesOpt.index);
            break;
        }

        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 200));
        ctx.progress();
    }

    await new Promise(r => setTimeout(r, 500));

    // Dismiss remaining dialogs
    for (let i = 0; i < 5; i++) {
        const s = ctx.state();
        if (!s?.dialog.isOpen) break;
        await ctx.sdk.sendClickDialog(0);
        await new Promise(r => setTimeout(r, 200));
    }

    await new Promise(r => setTimeout(r, 500));

    // Walk through gate
    for (let attempt = 0; attempt < 3; attempt++) {
        await ctx.bot.walkTo(AL_KHARID_INSIDE.x, AL_KHARID_INSIDE.z);
        await new Promise(r => setTimeout(r, 500));

        if (isInsideAlKharid(ctx)) {
            ctx.log('Entered Al Kharid!');
            return true;
        }
    }

    return isInsideAlKharid(ctx);
}

// Smelt bronze bars at furnace
async function smeltBars(ctx: ScriptContext): Promise<number> {
    ctx.log('Walking to furnace...');
    await ctx.bot.walkTo(AL_KHARID_FURNACE.x, AL_KHARID_FURNACE.z);
    ctx.progress();

    let barsSmelted = 0;

    while (true) {
        const ore = countOre(ctx);
        const pairs = Math.min(ore.copper, ore.tin);

        if (pairs === 0) {
            ctx.log('No more ore pairs');
            break;
        }

        // Dismiss any dialogs
        const state = ctx.state();
        if (state?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Find furnace
        const furnace = state?.nearbyLocs.find(l => /furnace/i.test(l.name));
        if (!furnace) {
            ctx.log('Furnace not found');
            break;
        }

        // Find copper ore in inventory
        const copper = ctx.sdk.findInventoryItem(/copper ore/i);
        if (!copper) {
            ctx.log('No copper ore');
            break;
        }

        const smithingXpBefore = getSmithingStats(ctx).xp;

        // Use copper ore on furnace
        ctx.log('Using ore on furnace...');
        await ctx.sdk.sendUseItemOnLoc(copper.slot, furnace.x, furnace.z, furnace.id);
        await new Promise(r => setTimeout(r, 1000));

        // Handle the smelting interface/dialog
        // The smelting interface should appear - click to make bronze bar
        for (let i = 0; i < 10; i++) {
            const s = ctx.state();

            // Check if dialog opened (smelting menu)
            if (s?.dialog.isOpen) {
                // Look for bronze bar option
                const bronzeOpt = s.dialog.options.find(o => /bronze/i.test(o.text));
                if (bronzeOpt) {
                    ctx.log('Selecting bronze bar...');
                    await ctx.sdk.sendClickDialog(bronzeOpt.index);
                    break;
                }

                // Look for "Make" or "Ok" button
                const makeOpt = s.dialog.options.find(o => /make|ok/i.test(o.text));
                if (makeOpt) {
                    await ctx.sdk.sendClickDialog(makeOpt.index);
                    break;
                }

                await ctx.sdk.sendClickDialog(0);
            }

            await new Promise(r => setTimeout(r, 300));
        }

        // Wait for smelting to complete (XP gain)
        try {
            await ctx.sdk.waitForCondition(state => {
                if (state.dialog.isOpen) {
                    ctx.sdk.sendClickDialog(0).catch(() => {});
                }
                const smithingXp = state.skills.find(s => s.name === 'Smithing')?.experience ?? 0;
                return smithingXp > smithingXpBefore;
            }, 10000);

            barsSmelted++;
            ctx.log(`Smelted bar #${barsSmelted}`);
            ctx.progress();
        } catch {
            ctx.log('Smelting timeout');
            await new Promise(r => setTimeout(r, 500));
        }
    }

    return barsSmelted;
}

// Find and use anvil to smith items
async function smithItems(ctx: ScriptContext): Promise<number> {
    // Check for anvil near furnace first
    let anvil = ctx.state()?.nearbyLocs.find(l => /anvil/i.test(l.name));

    if (!anvil) {
        // Try walking around Al Kharid to find anvil
        ctx.log('Looking for anvil in Al Kharid...');

        // Known Al Kharid anvil location (near general store)
        const alKharidAnvil = { x: 3290, z: 3179 };
        await ctx.bot.walkTo(alKharidAnvil.x, alKharidAnvil.z);
        ctx.progress();

        anvil = ctx.state()?.nearbyLocs.find(l => /anvil/i.test(l.name));
    }

    if (!anvil) {
        ctx.log('No anvil found, trying Varrock...');
        // Walk to Varrock west anvil
        await ctx.bot.walkTo(3188, 3427);
        ctx.progress();

        anvil = ctx.state()?.nearbyLocs.find(l => /anvil/i.test(l.name));
    }

    if (!anvil) {
        ctx.log('Cannot find anvil!');
        return 0;
    }

    ctx.log(`Found anvil at (${anvil.x}, ${anvil.z})`);

    // Check for hammer
    const hammer = ctx.sdk.findInventoryItem(/hammer/i);
    if (!hammer) {
        ctx.log('No hammer in inventory!');
        return 0;
    }

    let itemsSmithed = 0;

    while (true) {
        const ore = countOre(ctx);
        if (ore.bronzeBars === 0) {
            ctx.log('No bronze bars left');
            break;
        }

        // Dismiss any dialogs
        const state = ctx.state();
        if (state?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Find bronze bar
        const bar = ctx.sdk.findInventoryItem(/bronze bar/i);
        if (!bar) {
            ctx.log('No bronze bar');
            break;
        }

        const smithingXpBefore = getSmithingStats(ctx).xp;

        // Use bar on anvil
        ctx.log('Using bar on anvil...');
        await ctx.sdk.sendUseItemOnLoc(bar.slot, anvil.x, anvil.z, anvil.id);
        await new Promise(r => setTimeout(r, 1000));

        // Handle smithing interface
        // Smithing interface (id 994) uses iop not buttonType
        // We need to click a specific component to make items
        for (let i = 0; i < 15; i++) {
            const s = ctx.state();

            // Check dialog
            if (s?.dialog.isOpen) {
                // Look for bronze dagger (1 bar, level 1)
                const daggerOpt = s.dialog.options.find(o => /dagger/i.test(o.text));
                if (daggerOpt) {
                    ctx.log('Selecting dagger...');
                    await ctx.sdk.sendClickDialog(daggerOpt.index);
                    break;
                }

                // Try clicking first "Make" or "Ok" option
                const makeOpt = s.dialog.options.find(o => /make|ok/i.test(o.text));
                if (makeOpt) {
                    await ctx.sdk.sendClickDialog(makeOpt.index);
                    break;
                }

                // Try first option
                if (s.dialog.options.length > 0) {
                    await ctx.sdk.sendClickDialog(s.dialog.options[0]?.index ?? 0);
                }
            }

            // Check interface state
            if (s?.interface?.isOpen) {
                ctx.log(`Interface open: ${s.interface.interfaceId}, options: ${s.interface.options.map(o => o.text).join(', ')}`);

                // Try clicking first option
                if (s.interface.options.length > 0) {
                    await ctx.sdk.sendClickInterface(s.interface.options[0]?.index ?? 0);
                    break;
                }
            }

            await new Promise(r => setTimeout(r, 300));
        }

        // Wait for smithing (XP gain)
        try {
            await ctx.sdk.waitForCondition(state => {
                if (state.dialog.isOpen) {
                    ctx.sdk.sendClickDialog(0).catch(() => {});
                }
                const smithingXp = state.skills.find(s => s.name === 'Smithing')?.experience ?? 0;
                return smithingXp > smithingXpBefore;
            }, 10000);

            itemsSmithed++;
            ctx.log(`Smithed item #${itemsSmithed}`);
            ctx.progress();
        } catch {
            ctx.log('Smithing timeout');
            await new Promise(r => setTimeout(r, 500));
        }
    }

    return itemsSmithed;
}

// Drop items to make space
async function dropItems(ctx: ScriptContext, pattern: RegExp): Promise<void> {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    for (const item of items) {
        await ctx.sdk.sendDropItem(item.slot);
        await new Promise(r => setTimeout(r, 100));
    }
    ctx.progress();
}

// Equip pickaxe if not already equipped
async function equipPickaxe(ctx: ScriptContext): Promise<boolean> {
    const equipped = ctx.sdk.findEquipmentItem(/pickaxe/i);
    if (equipped) {
        ctx.log('Pickaxe already equipped');
        return true;
    }

    const pickaxe = ctx.sdk.findInventoryItem(/pickaxe/i);
    if (!pickaxe) {
        ctx.log('No pickaxe in inventory!');
        return false;
    }

    ctx.log(`Equipping ${pickaxe.name}...`);
    const result = await ctx.bot.equipItem(pickaxe);
    return result.success;
}

// Main script
runScript({
    name: 'smithing',
    goal: 'Train Smithing to level 10',
    preset: TestPresets.LUMBRIDGE_SPAWN,
    timeLimit: 15 * 60 * 1000,  // 15 minutes
    stallTimeout: 60_000,       // 60 seconds (smithing can be slow)
}, async (ctx) => {
    const { log, progress } = ctx;

    log('=== Smithing Training Script v2 ===');

    const startStats = getSmithingStats(ctx);
    log(`Starting Smithing: Level ${startStats.level} (${startStats.xp} XP)`);

    // Equip pickaxe first
    await equipPickaxe(ctx);
    progress();

    // Check for hammer (needed for smithing at anvil)
    let hammer = ctx.sdk.findInventoryItem(/hammer/i);
    if (!hammer) {
        log('No hammer - will only be able to smelt bars');
        // Smelting still gives XP, so we can train without a hammer
    }

    // Main loop
    let iterations = 0;
    while (iterations < 20) {  // Safety limit
        iterations++;
        const stats = getSmithingStats(ctx);

        if (stats.level >= 10) {
            log(`Goal achieved! Smithing level ${stats.level}`);
            break;
        }

        log(`\n=== Iteration ${iterations}: Smithing Level ${stats.level} (${stats.xp} XP) ===`);

        // Step 1: Get coins if we don't have enough (for toll)
        if (getCoins(ctx) < 10 && !isInsideAlKharid(ctx)) {
            await getCoinsFromShop(ctx);
        }

        // Step 2: Mine ore if we don't have enough
        const ore = countOre(ctx);
        log(`Inventory: ${ore.copper} copper, ${ore.tin} tin, ${ore.bronzeBars} bars`);

        const pairs = Math.min(ore.copper, ore.tin);
        if (pairs < 5) {
            await walkToMine(ctx);
            await mineOre(ctx, 8);  // Mine 8 pairs
        }

        // Step 3: Travel to Al-Kharid for smelting
        if (!isInsideAlKharid(ctx)) {
            const entered = await enterAlKharid(ctx);
            if (!entered) {
                log('Failed to enter Al Kharid, retrying...');
                continue;
            }
        }

        // Step 4: Smelt bars
        const oreAfterMining = countOre(ctx);
        const pairsToSmelt = Math.min(oreAfterMining.copper, oreAfterMining.tin);
        if (pairsToSmelt > 0) {
            log(`Smelting ${pairsToSmelt} bronze bars...`);
            const smelted = await smeltBars(ctx);
            log(`Smelted ${smelted} bars`);
        }

        // Step 5: Smith items (if we have a hammer)
        hammer = ctx.sdk.findInventoryItem(/hammer/i);
        const barsCount = countOre(ctx);
        if (hammer && barsCount.bronzeBars > 0) {
            log(`Smithing with ${barsCount.bronzeBars} bars...`);
            const smithed = await smithItems(ctx);
            log(`Smithed ${smithed} items`);
        }

        // Drop smithed items to make inventory space
        await dropItems(ctx, /bronze (dagger|sword|axe|mace|med helm|bolts)/i);

        progress();
    }

    const endStats = getSmithingStats(ctx);
    log(`\n=== Complete: Level ${endStats.level} (${endStats.xp} XP) ===`);
});
