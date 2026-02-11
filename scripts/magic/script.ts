/**
 * Magic Trainer Script
 *
 * Goal: Train Magic to level 10+ starting from a fresh Lumbridge spawn.
 *
 * Strategy:
 * - LUMBRIDGE_SPAWN preset provides: Air x25, Mind x15, Water x6, Earth x4, Body x2
 * - Wind Strike = 1 Air + 1 Mind = 5.5 XP per cast
 * - 15 Mind runes = 15 casts = 82.5 XP (gets to ~level 2-3)
 * - Level 10 requires 1,154 XP = ~210 Wind Strikes
 * - Need to find more runes or supplement with melee
 *
 * Plan:
 * 1. Walk to chicken coop near Lumbridge (3235, 3295)
 * 2. Cast Wind Strike on chickens until runes run out
 * 3. Log progress and track XP gains
 */

import { runScript, type ScriptContext } from '../../sdk/runner';
import { generateSave, TestPresets } from '../../sdk/test/utils/save-generator';
import { launchBotWithSDK } from '../../sdk/test/utils/browser';
import type { NearbyNpc } from '../../sdk/types';
import { Spells } from '../../sdk/spells';

// Locations
const CHICKEN_COOP = { x: 3235, z: 3295 };  // Near Lumbridge

// XP required for each level
const MAGIC_XP_TABLE = [
    0, 0, 83, 174, 276, 388, 512, 650, 801, 969, 1154,  // 0-10
    1358, 1584, 1833, 2107, 2411, 2746, 3115, 3523, 3973, 4470,  // 11-20
];

/**
 * Find the best target for magic training
 */
function findTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.sdk.getState();
    if (!state) return null;

    // Prefer chickens (weakest), then rats, then goblins
    const targets = state.nearbyNpcs
        .filter(npc =>
            /chicken/i.test(npc.name) ||
            /rat/i.test(npc.name) ||
            /goblin/i.test(npc.name)
        )
        .filter(npc => !npc.inCombat)  // Don't target NPCs already fighting
        .filter(npc => npc.distance <= 10)  // Within reasonable range
        .sort((a, b) => {
            // Priority: chicken > rat > goblin
            const priority = (name: string) => {
                if (/chicken/i.test(name)) return 0;
                if (/rat/i.test(name)) return 1;
                return 2;
            };
            const pDiff = priority(a.name) - priority(b.name);
            if (pDiff !== 0) return pDiff;
            return a.distance - b.distance;
        });

    return targets[0] ?? null;
}

/**
 * Get rune counts
 */
function getRuneCounts(ctx: ScriptContext): { air: number; mind: number; water: number; earth: number } {
    const airRunes = ctx.sdk.findInventoryItem(/^air rune$/i);
    const mindRunes = ctx.sdk.findInventoryItem(/^mind rune$/i);
    const waterRunes = ctx.sdk.findInventoryItem(/^water rune$/i);
    const earthRunes = ctx.sdk.findInventoryItem(/^earth rune$/i);

    return {
        air: airRunes?.count ?? 0,
        mind: mindRunes?.count ?? 0,
        water: waterRunes?.count ?? 0,
        earth: earthRunes?.count ?? 0,
    };
}

/**
 * Determine which spell to cast based on available runes and magic level
 */
function getBestSpell(ctx: ScriptContext): { spell: number; name: string; xp: number } | null {
    const runes = getRuneCounts(ctx);
    const magicLevel = ctx.sdk.getSkill('Magic')?.baseLevel ?? 1;

    // Wind Strike: 1 Air + 1 Mind, level 1, 5.5 XP
    if (runes.air >= 1 && runes.mind >= 1) {
        return { spell: Spells.WIND_STRIKE, name: 'Wind Strike', xp: 5.5 };
    }

    // Water Strike: 1 Water + 1 Air + 1 Mind, level 5, 7.5 XP
    if (magicLevel >= 5 && runes.water >= 1 && runes.air >= 1 && runes.mind >= 1) {
        return { spell: Spells.WATER_STRIKE, name: 'Water Strike', xp: 7.5 };
    }

    // Earth Strike: 2 Earth + 1 Air + 1 Mind, level 9, 9.5 XP
    if (magicLevel >= 9 && runes.earth >= 2 && runes.air >= 1 && runes.mind >= 1) {
        return { spell: Spells.EARTH_STRIKE, name: 'Earth Strike', xp: 9.5 };
    }

    return null;
}

interface MagicStats {
    startXp: number;
    startLevel: number;
    casts: number;
    hits: number;
    misses: number;  // Splashes
    lastCastTime: number;
    startTime: number;
}

/**
 * Main magic training loop
 */
async function magicTrainingLoop(ctx: ScriptContext): Promise<void> {
    const state = ctx.sdk.getState();
    if (!state) throw new Error('No initial state');

    // Initialize stats
    const magicSkill = ctx.sdk.getSkill('Magic');
    const stats: MagicStats = {
        startXp: magicSkill?.experience ?? 0,
        startLevel: magicSkill?.baseLevel ?? 1,
        casts: 0,
        hits: 0,
        misses: 0,
        lastCastTime: 0,
        startTime: Date.now(),
    };

    ctx.log('=== Magic Trainer ===');
    ctx.log(`Goal: Train Magic from level ${stats.startLevel} (need 1,154 XP for level 10)`);

    // Log rune inventory
    const runes = getRuneCounts(ctx);
    ctx.log(`Runes: Air=${runes.air}, Mind=${runes.mind}, Water=${runes.water}, Earth=${runes.earth}`);
    ctx.log(`Potential casts: ~${Math.min(runes.air, runes.mind)} Wind Strikes (~${Math.min(runes.air, runes.mind) * 5.5} XP)`);

    // Walk to chicken coop
    ctx.log('Walking to chicken coop...');
    await ctx.bot.walkTo(CHICKEN_COOP.x, CHICKEN_COOP.z);

    // Open the gate to get inside the coop
    ctx.log('Opening gate...');
    const gateResult = await ctx.bot.openDoor(/gate/i);
    if (gateResult.success) {
        ctx.log(`Gate opened: ${gateResult.message}`);
        // Walk inside the coop
        await ctx.bot.walkTo(CHICKEN_COOP.x - 3, CHICKEN_COOP.z);
        } else {
        ctx.log(`Gate: ${gateResult.message}`);
    }

    let noTargetCount = 0;
    let failedCastCount = 0;
    const MAX_NO_TARGET_ATTEMPTS = 30;  // Exit if no targets for too long
    const MAX_FAILED_CASTS = 5;  // Exit if too many failed casts in a row

    // Main loop
    while (true) {
        const currentState = ctx.sdk.getState();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Dismiss any blocking dialogs (level-up, etc.)
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
                    continue;
        }

        // Check if we've reached level 10
        const currentMagic = ctx.sdk.getSkill('Magic');
        const currentLevel = currentMagic?.baseLevel ?? 1;
        if (currentLevel >= 10) {
            ctx.log('*** GOAL REACHED: Magic level 10! ***');
            break;
        }

        // Check if we have runes
        const spell = getBestSpell(ctx);
        if (!spell) {
            ctx.log('Out of runes! Cannot cast any more spells.');
            break;
        }

        // Find a target
        const target = findTarget(ctx);
        if (!target) {
            noTargetCount++;
            if (noTargetCount >= MAX_NO_TARGET_ATTEMPTS) {
                ctx.log(`No targets found after ${noTargetCount} attempts, exiting.`);
                break;
            }
            if (noTargetCount % 5 === 0) {
                ctx.log(`No targets nearby (attempt ${noTargetCount}/${MAX_NO_TARGET_ATTEMPTS}), walking around...`);
                // Walk to chicken coop center
                await ctx.bot.walkTo(
                    CHICKEN_COOP.x + Math.floor(Math.random() * 6) - 3,
                    CHICKEN_COOP.z + Math.floor(Math.random() * 6) - 3
                );
            }
            await new Promise(r => setTimeout(r, 500));
            continue;
        }
        noTargetCount = 0;

        // Don't spam casts - wait between attempts
        const now = Date.now();
        if (now - stats.lastCastTime < 2500) {
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Walk closer if target is far (magic range is ~10 but need clear LOS)
        if (target.distance > 5) {
            ctx.log(`Walking toward ${target.name} at (${target.x}, ${target.z}), dist: ${target.distance}`);
            // Walk to within ~3 tiles of the target
            await ctx.bot.walkTo(target.x, target.z);
                    await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Cast spell on target using high-level API
        if (stats.casts % 5 === 0 || stats.casts === 0) {
            const currentRunes = getRuneCounts(ctx);
            ctx.log(`Casting ${spell.name} on ${target.name} (cast #${stats.casts + 1}, dist=${target.distance}, runes: air=${currentRunes.air}, mind=${currentRunes.mind})`);
        }

        const castResult = await ctx.bot.castSpellOnNpc(target, spell.spell);
        stats.casts++;
        stats.lastCastTime = now;

        if (castResult.success) {
            failedCastCount = 0;  // Reset on success
            if (castResult.hit) {
                stats.hits++;
                ctx.log(`HIT! ${castResult.message}`);
            }
            // Splash is still success, just no XP
        } else if (castResult.reason === 'out_of_reach') {
            // Gate likely closed - try to open it
            ctx.log(`Can't reach target - trying to open gate`);
            const gateResult = await ctx.bot.openDoor(/gate/i);
            ctx.log(`Gate: ${gateResult.message}`);
            if (gateResult.success) {
                await ctx.bot.walkTo(CHICKEN_COOP.x - 3, CHICKEN_COOP.z);
            }
            failedCastCount++;
        } else if (castResult.reason === 'no_runes') {
            ctx.log('Out of runes!');
            break;
        } else {
            // Unknown failure reason
            failedCastCount++;
            ctx.log(`Cast failed: ${castResult.message} (reason: ${castResult.reason})`);
        }

        // Exit if too many consecutive failures
        if (failedCastCount >= MAX_FAILED_CASTS) {
            ctx.log(`Too many failed casts (${failedCastCount}), exiting.`);
            break;
        }

            await new Promise(r => setTimeout(r, 500));
    }

    // Final report
    logFinalStats(ctx, stats);
}

/**
 * Log final training statistics
 */
function logFinalStats(ctx: ScriptContext, stats: MagicStats): void {
    const currentMagic = ctx.sdk.getSkill('Magic');
    const finalXp = currentMagic?.experience ?? 0;
    const finalLevel = currentMagic?.baseLevel ?? 1;
    const xpGained = finalXp - stats.startXp;
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const xpPerHour = elapsed > 0 ? Math.round((xpGained / elapsed) * 3600) : 0;

    ctx.log('=== Final Results ===');
    ctx.log(`Magic: Level ${stats.startLevel} -> ${finalLevel}`);
    ctx.log(`XP: ${stats.startXp} -> ${finalXp} (+${xpGained})`);
    ctx.log(`Casts: ${stats.casts} (Hits: ${stats.hits}, Splashes: ${stats.casts - stats.hits})`);
    ctx.log(`Duration: ${elapsed.toFixed(1)}s`);
    ctx.log(`XP/hour: ~${xpPerHour.toLocaleString()}`);

    // Log remaining runes
    const runes = getRuneCounts(ctx);
    ctx.log(`Remaining runes: Air=${runes.air}, Mind=${runes.mind}, Water=${runes.water}, Earth=${runes.earth}`);
}

// Main script
async function main() {
    // Create fresh account
    const username = `mg${Math.random().toString(36).slice(2, 7)}`;
    await generateSave(username, TestPresets.LUMBRIDGE_SPAWN);

    // Launch browser
    const session = await launchBotWithSDK(username, { usePuppeteer: true });

    try {
        await runScript(async (ctx) => {
            try {
                await magicTrainingLoop(ctx);
            } finally {
                // Log final state
                const state = ctx.sdk.getState();
                if (state) {
                    const magic = state.skills.find(s => s.name === 'Magic');
                    ctx.log(`Final Magic: Level ${magic?.baseLevel ?? '?'}, XP ${magic?.experience ?? '?'}`);
                }
            }
        }, {
            connection: { bot: session.bot, sdk: session.sdk },
            timeout: 5 * 60 * 1000,  // 5 minutes
        });
    } finally {
        await session.cleanup();
    }
}

main().catch(console.error);
