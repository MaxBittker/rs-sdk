/**
 * Ranged Trainer Script
 *
 * Goal: Train Ranged to level 10+ using the shortbow and bronze arrows from LUMBRIDGE_SPAWN.
 *
 * Strategy:
 * - Equip shortbow and bronze arrows
 * - Kill chickens at Lumbridge chicken coop (level 1, easy targets)
 * - Open gate to enter coop
 * - Pick up bronze arrows from loot to conserve ammo (with retry limits)
 * - Continue until Ranged level 10
 *
 * LUMBRIDGE_SPAWN preset includes:
 * - Shortbow (1)
 * - Bronze arrows (25)
 */

import { runScript, TestPresets, StallError } from '../script-runner';
import type { ScriptContext } from '../script-runner';
import type { NearbyNpc } from '../../agent/types';

// Training location - Lumbridge chicken coop (inside)
const CHICKEN_COOP = { x: 3235, z: 3295 };
// Gate location to enter coop
const COOP_GATE = { x: 3237, z: 3295 };

// Ranged attack style index (for shortbow, all styles train ranged)
const RANGED_STYLE = 0; // Accurate

// Track combat statistics
interface RangedStats {
    kills: number;
    arrowsUsed: number;
    arrowsRecovered: number;
    startXp: number;
    startTime: number;
    lastProgressTime: number;
}

// Track failed pickup locations to avoid retrying (position -> retry count)
const failedPickups = new Map<string, number>();
const MAX_PICKUP_RETRIES = 2;

/**
 * Find the best chicken to attack.
 * Prioritize chickens that aren't in combat and are close.
 */
function findBestTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const targets = state.nearbyNpcs
        .filter(npc => /^chicken$/i.test(npc.name))
        .filter(npc => npc.options.some(o => /attack/i.test(o)))
        // Prefer NPCs not in combat
        .filter(npc => {
            if (npc.targetIndex === -1) return true;
            return !npc.inCombat;
        })
        .sort((a, b) => {
            // Prefer NPCs not in combat
            if (a.inCombat !== b.inCombat) {
                return a.inCombat ? 1 : -1;
            }
            // Then by distance (but ranged can attack from further)
            return a.distance - b.distance;
        });

    return targets[0] ?? null;
}

/**
 * Count bronze arrows in inventory + equipped
 */
function countArrows(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;

    // Check inventory
    const invArrows = state.inventory
        .filter(i => /bronze arrow/i.test(i.name))
        .reduce((sum, i) => sum + i.count, 0);

    // Check equipment (ammo slot is index 10)
    const equippedArrows = state.equipment
        .filter(e => /bronze arrow/i.test(e.name))
        .reduce((sum, e) => sum + e.count, 0);

    return invArrows + equippedArrows;
}

/**
 * Get current ranged level
 */
function getRangedLevel(ctx: ScriptContext): number {
    const state = ctx.state();
    return state?.skills.find(s => s.name === 'Ranged')?.baseLevel ?? 1;
}

/**
 * Get current ranged XP
 */
function getRangedXp(ctx: ScriptContext): number {
    const state = ctx.state();
    return state?.skills.find(s => s.name === 'Ranged')?.experience ?? 0;
}

/**
 * Wait for combat to end (NPC dies or we need to heal)
 */
async function waitForCombatEnd(
    ctx: ScriptContext,
    targetNpc: NearbyNpc,
    stats: RangedStats
): Promise<'kill' | 'fled' | 'lost_target' | 'need_heal'> {
    let combatStarted = false;
    let ticksSinceCombatEnded = 0;
    let loopCount = 0;

    const startXp = getRangedXp(ctx);
    const maxWaitMs = 30000;
    const startTime = Date.now();

    // Initial delay to let combat start
    await new Promise(r => setTimeout(r, 800));

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(r => setTimeout(r, 400));
        loopCount++;
        const state = ctx.state();
        if (!state) return 'lost_target';

        // Check for dialog (level up, etc)
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog during combat...');
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            continue;
        }

        // Check XP gains as combat indicator
        const currentXp = getRangedXp(ctx);
        const xpGained = currentXp - startXp;
        if (xpGained > 0) {
            combatStarted = true;
        }

        // Find our target NPC
        const target = state.nearbyNpcs.find(n => n.index === targetNpc.index);

        if (!target) {
            // NPC disappeared - count as kill if we gained XP
            if (combatStarted || xpGained > 0 || loopCount >= 2) {
                stats.kills++;
                return 'kill';
            }
            return 'lost_target';
        }

        // Check NPC health - if 0, it died
        if (target.maxHp > 0 && target.hp === 0) {
            stats.kills++;
            return 'kill';
        }

        // Track combat via combatCycle
        const currentTick = state.tick;
        const npcInCombat = target.combatCycle > currentTick;
        const playerInCombat = state.player?.combat?.inCombat ?? false;
        const inActiveCombat = playerInCombat || npcInCombat || xpGained > 0;

        if (inActiveCombat) {
            combatStarted = true;
            ticksSinceCombatEnded = 0;
        } else if (combatStarted) {
            ticksSinceCombatEnded++;
            if (ticksSinceCombatEnded >= 4) {
                return 'fled';
            }
        } else if (loopCount >= 8) {
            // Combat never started after ~4 seconds
            return 'lost_target';
        }

        ctx.progress();
    }

    return 'lost_target';
}

/**
 * Log current statistics
 */
function logStats(ctx: ScriptContext, stats: RangedStats): void {
    const state = ctx.state();
    if (!state) return;

    const ranged = state.skills.find(s => s.name === 'Ranged');
    const currentXp = ranged?.experience ?? 0;
    const xpGained = currentXp - stats.startXp;
    const arrows = countArrows(ctx);

    const elapsedMs = Date.now() - stats.startTime;
    const elapsedMinutes = Math.round(elapsedMs / 60_000);
    const xpPerHour = elapsedMs > 60_000 ? Math.round(xpGained / (elapsedMs / 3_600_000)) : 0;

    ctx.log(`--- Stats after ${elapsedMinutes}m / ${stats.kills} kills ---`);
    ctx.log(`Ranged: Level ${ranged?.baseLevel} (${currentXp} XP, +${xpGained})`);
    ctx.log(`Arrows: ${arrows} remaining`);
    ctx.log(`XP/hour: ~${xpPerHour.toLocaleString()}`);
}

/**
 * Main ranged training loop
 */
async function rangedTrainingLoop(ctx: ScriptContext): Promise<void> {
    const state = ctx.state();
    if (!state) throw new Error('No initial state');

    const now = Date.now();
    const stats: RangedStats = {
        kills: 0,
        arrowsUsed: 0,
        arrowsRecovered: 0,
        startXp: getRangedXp(ctx),
        startTime: now,
        lastProgressTime: now,
    };

    ctx.log('=== Ranged Trainer - Chicken Coop Strategy ===');
    ctx.log(`Goal: Reach Ranged level 10`);
    ctx.log(`Starting Ranged Level: ${getRangedLevel(ctx)}`);
    ctx.log(`Starting XP: ${stats.startXp}`);
    ctx.log(`Starting Arrows: ${countArrows(ctx)}`);

    // Equip shortbow if not already equipped
    const shortbow = ctx.sdk.findInventoryItem(/shortbow/i);
    if (shortbow) {
        ctx.log('Equipping shortbow...');
        await ctx.bot.equipItem(shortbow);
        ctx.progress();
    }

    // Equip bronze arrows if not already equipped
    const arrows = ctx.sdk.findInventoryItem(/bronze arrow/i);
    if (arrows) {
        ctx.log('Equipping bronze arrows...');
        await ctx.bot.equipItem(arrows);
        ctx.progress();
    }

    // Set ranged attack style
    ctx.log('Setting ranged attack style...');
    await ctx.sdk.sendSetCombatStyle(RANGED_STYLE);
    ctx.progress();

    // Dismiss any blocking UI
    await ctx.bot.dismissBlockingUI();

    // Walk to chicken coop and open gate if needed
    ctx.log('Walking to chicken coop...');
    await ctx.bot.walkTo(COOP_GATE.x, COOP_GATE.z);
    ctx.progress();

    // Try to open the gate to enter
    const gateResult = await ctx.bot.openDoor(/gate/i);
    if (gateResult.success) {
        ctx.log('Opened gate to chicken coop');
    }

    // Walk inside the coop
    await ctx.bot.walkTo(CHICKEN_COOP.x, CHICKEN_COOP.z);
    ctx.progress();

    let lastStatsLog = 0;

    // Main training loop
    while (true) {
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Check if we've reached level 10
        const rangedLevel = getRangedLevel(ctx);
        if (rangedLevel >= 10) {
            ctx.log(`*** GOAL REACHED: Ranged Level ${rangedLevel}! ***`);
            break;
        }

        // Check arrows remaining
        const arrowCount = countArrows(ctx);
        if (arrowCount <= 0) {
            throw new StallError('Out of arrows!');
        }

        // Dismiss any blocking dialogs (level-up, etc) - critical to check frequently!
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 300));
            ctx.progress();
            continue;
        }

        // Log stats periodically (every 5 kills or 2 minutes)
        const timeSinceLastLog = Date.now() - lastStatsLog;
        const shouldLogByKills = stats.kills > 0 && stats.kills % 5 === 0 && stats.kills !== lastStatsLog;
        const shouldLogByTime = timeSinceLastLog >= 2 * 60_000;

        if (shouldLogByKills || shouldLogByTime || lastStatsLog === 0) {
            lastStatsLog = stats.kills > 0 ? stats.kills : Date.now();
            logStats(ctx, stats);
        }

        // Pick up arrows from the ground (conserve ammo!) - but only ones we can reach
        // Skip arrows that we've already failed to pick up too many times
        const groundArrows = ctx.sdk.getGroundItems()
            .filter(i => /bronze arrow/i.test(i.name))
            .filter(i => i.distance <= 4)  // Only close ones to avoid fence issues
            .filter(i => {
                const key = `${i.x},${i.z}`;
                const retries = failedPickups.get(key) ?? 0;
                return retries < MAX_PICKUP_RETRIES;
            })
            .sort((a, b) => a.distance - b.distance);

        if (groundArrows.length > 0) {
            const arrowPile = groundArrows[0]!;
            const key = `${arrowPile.x},${arrowPile.z}`;
            ctx.log(`Picking up ${arrowPile.count ?? 1} bronze arrows at (${arrowPile.x}, ${arrowPile.z})...`);
            const result = await ctx.bot.pickupItem(arrowPile);
            if (result.success) {
                stats.arrowsRecovered += arrowPile.count ?? 1;
                // Clear retry count on success
                failedPickups.delete(key);
                // Re-equip arrows if they went to inventory
                const invArrows = ctx.sdk.findInventoryItem(/bronze arrow/i);
                if (invArrows) {
                    await ctx.bot.equipItem(invArrows);
                }
            } else if (result.reason === 'cant_reach' || result.reason === 'timeout') {
                // Increment retry count for this position
                const retries = failedPickups.get(key) ?? 0;
                failedPickups.set(key, retries + 1);
                ctx.log(`Arrow pickup failed (retry ${retries + 1}/${MAX_PICKUP_RETRIES}): ${result.reason}`);
            }
            ctx.progress();
            continue;
        }

        // Find a chicken to attack
        const target = findBestTarget(ctx);
        if (!target) {
            ctx.log('No chickens nearby - walking to chicken coop...');
            // Try to open gate if needed
            await ctx.bot.openDoor(/gate/i);
            await ctx.bot.walkTo(CHICKEN_COOP.x, CHICKEN_COOP.z);
            ctx.progress();
            continue;
        }

        // For ranged, we can attack from further away
        // Walk closer if target is too far (ranged has ~7 tile range)
        if (target.distance > 7) {
            ctx.log(`Chicken too far (${target.distance} tiles), walking to coop...`);
            // Try to open gate first if needed
            await ctx.bot.openDoor(/gate/i);
            // Walk to coop
            await ctx.bot.walkTo(CHICKEN_COOP.x, CHICKEN_COOP.z);
            ctx.progress();
            continue;
        }

        // Check if already fighting
        const playerCombat = currentState.player?.combat;
        if (playerCombat?.inCombat && playerCombat.targetIndex === target.index) {
            await waitForCombatEnd(ctx, target, stats);
            ctx.progress();
            continue;
        }

        // Dismiss any blocking UI (level-up dialogs, etc.) before attacking
        await ctx.bot.dismissBlockingUI();

        // Attack the cow
        const arrowsBefore = countArrows(ctx);
        const attackResult = await ctx.bot.attackNpc(target);
        if (!attackResult.success) {
            ctx.warn(`Attack failed: ${attackResult.message}`);
            // If timeout, check for dialog that may have appeared during attack attempt
            if (attackResult.reason === 'timeout') {
                const s = ctx.state();
                if (s?.dialog.isOpen) {
                    ctx.log('Dismissing dialog that appeared during attack...');
                    await ctx.sdk.sendClickDialog(0);
                    await new Promise(r => setTimeout(r, 300));
                }
            }
            // Try opening gate if blocked
            if (attackResult.reason === 'out_of_reach') {
                const gateRes = await ctx.bot.openDoor(/gate/i);
                if (gateRes.success) {
                    ctx.log('Opened gate');
                }
            }
            ctx.progress();
            continue;
        }

        // Wait for combat to complete
        const combatResult = await waitForCombatEnd(ctx, target, stats);

        // Track arrows used
        const arrowsAfter = countArrows(ctx);
        if (arrowsAfter < arrowsBefore) {
            stats.arrowsUsed += arrowsBefore - arrowsAfter;
        }

        if (combatResult === 'kill') {
            ctx.log(`Kill #${stats.kills}! (Ranged: Lv${getRangedLevel(ctx)}, Arrows: ${arrowsAfter})`);
        }
        ctx.progress();
    }
}

// Run the script
runScript({
    name: 'ranged',
    goal: 'Train Ranged to level 10 using shortbow and bronze arrows on chickens',
    preset: TestPresets.LUMBRIDGE_SPAWN,
    timeLimit: 30 * 60 * 1000,  // 30 minutes
    stallTimeout: 60_000,       // 60 seconds (ranged combat can be slower)
}, async (ctx) => {
    try {
        await rangedTrainingLoop(ctx);
    } finally {
        // Log final stats
        const state = ctx.state();
        if (state) {
            const ranged = state.skills.find(s => s.name === 'Ranged');
            ctx.log('=== Final Results ===');
            ctx.log(`Ranged: Level ${ranged?.baseLevel} (${ranged?.experience} XP)`);
            ctx.log(`Arrows remaining: ${countArrows(ctx)}`);
            ctx.log(`Position: (${state.player?.worldX}, ${state.player?.worldZ})`);
        }
    }
});
