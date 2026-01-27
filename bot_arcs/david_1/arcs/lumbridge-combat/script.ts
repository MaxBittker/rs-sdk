/**
 * Arc: lumbridge-combat
 * Character: david_1
 *
 * Goal: Train combat at Lumbridge by fighting rats and men
 * Strategy:
 * 1. Equip bronze sword and wooden shield
 * 2. Fight rats/goblins/men nearby
 * 3. Cycle combat styles for balanced training
 * 4. Eat food when HP is low
 *
 * Duration: 5 minutes (short first run to validate)
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// Combat style indices
const STYLES = {
    ATTACK: 0,
    STRENGTH: 1,
    DEFENCE: 3,
};

// Stats tracking
interface Stats {
    kills: number;
    damageDealt: number;
    foodEaten: number;
    startTime: number;
}

function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getHP(ctx: ScriptContext): { current: number; max: number } {
    const hp = ctx.state()?.skills.find(s => s.name === 'Hitpoints');
    return {
        current: hp?.level ?? 10,
        max: hp?.baseLevel ?? 10,
    };
}

function getLowestCombatStat(ctx: ScriptContext): { stat: string; style: number } {
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');

    if (def <= atk && def <= str) return { stat: 'Defence', style: STYLES.DEFENCE };
    if (str <= atk) return { stat: 'Strength', style: STYLES.STRENGTH };
    return { stat: 'Attack', style: STYLES.ATTACK };
}

function findTarget(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    // Target priority: rats, men, goblins
    const targets = state.nearbyNpcs
        .filter(npc => /^(rat|man|goblin)$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /attack/i.test(opt)))
        .filter(npc => !npc.inCombat)
        .sort((a, b) => {
            // Prefer rats (weakest)
            const aIsRat = /rat/i.test(a.name);
            const bIsRat = /rat/i.test(b.name);
            if (aIsRat && !bIsRat) return -1;
            if (!aIsRat && bIsRat) return 1;
            return a.distance - b.distance;
        });

    return targets[0] ?? null;
}

async function equipItems(ctx: ScriptContext): Promise<void> {
    const state = ctx.state();
    if (!state) return;

    // Check if already equipped
    const hasWeapon = state.equipment.some(e => e && /sword|dagger/i.test(e.name));
    const hasShield = state.equipment.some(e => e && /shield/i.test(e.name));

    if (!hasWeapon) {
        const sword = state.inventory.find(i => /bronze sword/i.test(i.name));
        if (sword) {
            ctx.log('Equipping Bronze sword');
            await ctx.bot.equipItem(sword);
            await new Promise(r => setTimeout(r, 600));
        }
    }

    if (!hasShield) {
        const shield = state.inventory.find(i => /wooden shield/i.test(i.name));
        if (shield) {
            ctx.log('Equipping Wooden shield');
            await ctx.bot.equipItem(shield);
            await new Promise(r => setTimeout(r, 600));
        }
    }
}

async function eatFood(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const food = ctx.state()?.inventory.find(i =>
        /shrimp|bread|cooked|meat/i.test(i.name)
    );

    if (!food) return false;

    const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
    if (!eatOpt) return false;

    const hp = getHP(ctx);
    ctx.log(`Eating ${food.name} (HP: ${hp.current}/${hp.max})`);
    await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
    stats.foodEaten++;
    await new Promise(r => setTimeout(r, 600));
    return true;
}

runArc({
    characterName: 'david_1',
    arcName: 'lumbridge-combat',
    goal: 'Train combat on rats and men at Lumbridge',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        damageDealt: 0,
        foodEaten: 0,
        startTime: Date.now(),
    };

    ctx.log('=== Lumbridge Combat Training ===');
    ctx.log('Goal: Train Attack, Strength, Defence on rats and men');
    ctx.log('');

    // Wait for state
    ctx.log('Waiting for game state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 30000);
    } catch (e) {
        ctx.warn('State did not fully populate');
    }

    await new Promise(r => setTimeout(r, 500));
    ctx.progress();

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();

    // Log starting stats
    const startAtk = getSkillLevel(ctx, 'Attack');
    const startStr = getSkillLevel(ctx, 'Strength');
    const startDef = getSkillLevel(ctx, 'Defence');
    const startHp = getSkillLevel(ctx, 'Hitpoints');
    ctx.log(`Starting: Atk ${startAtk}, Str ${startStr}, Def ${startDef}, HP ${startHp}`);

    // Equip weapon and shield
    await equipItems(ctx);
    ctx.progress();

    // Set initial combat style (train lowest stat)
    let currentStyle = getLowestCombatStat(ctx);
    ctx.log(`Training ${currentStyle.stat} (lowest)`);
    await ctx.sdk.sendSetCombatStyle(currentStyle.style);

    let loopCount = 0;
    let lastStyleCheck = Date.now();

    // Main combat loop
    while (true) {
        loopCount++;
        const state = ctx.state();
        if (!state) continue;

        // Status update every 20 loops
        if (loopCount % 20 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            const hp = getHP(ctx);
            ctx.log(`Loop ${loopCount}: Atk ${atk}, Str ${str}, Def ${def} | HP ${hp.current}/${hp.max} | Kills: ${stats.kills}`);
        }

        // Dismiss dialogs
        if (state.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check HP and eat if needed
        const hp = getHP(ctx);
        if (hp.current <= 5) {
            const ate = await eatFood(ctx, stats);
            if (!ate && hp.current <= 3) {
                ctx.warn('Low HP and no food! Waiting for regen...');
                await new Promise(r => setTimeout(r, 5000));
            }
            ctx.progress();
            continue;
        }

        // Rotate combat style every 30 seconds
        if (Date.now() - lastStyleCheck > 30_000) {
            currentStyle = getLowestCombatStat(ctx);
            ctx.log(`Switching to ${currentStyle.stat}`);
            await ctx.sdk.sendSetCombatStyle(currentStyle.style);
            lastStyleCheck = Date.now();
        }

        // Check if we're in combat or idle
        const player = state.player;
        const isIdle = player?.animId === -1;

        if (isIdle) {
            // Find a target to attack
            const target = findTarget(ctx);
            if (!target) {
                ctx.log('No targets nearby, waiting...');
                await new Promise(r => setTimeout(r, 1000));
                ctx.progress();
                continue;
            }

            try {
                ctx.log(`Attacking ${target.name} (dist ${target.distance.toFixed(1)})`);
                const result = await ctx.bot.attackNpc(target);
                if (result.success) {
                    stats.kills++;
                    ctx.progress();
                }
            } catch (err) {
                // Attack timed out or failed, try another target
                ctx.log('Attack failed, trying again...');
                ctx.progress();
            }

            await new Promise(r => setTimeout(r, 1500));
        } else {
            // In combat, just wait
            await new Promise(r => setTimeout(r, 500));
            ctx.progress();
        }
    }
});
