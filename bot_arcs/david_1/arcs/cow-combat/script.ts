/**
 * Cow Field Combat Arc
 *
 * Reliable combat training at cow field. Cycles attack styles to balance
 * melee stats. Simple and stable.
 */

import { runArc, type ScriptContext } from '../../../arc-runner';

// Combat style cycling for swords:
// 0 = Stab (Attack), 1 = Lunge (Strength), 2 = Slash (Controlled), 3 = Block (Defence)
const STYLES = [
    { id: 0, name: 'accurate', stat: 'Attack' },
    { id: 1, name: 'aggressive', stat: 'Strength' },
    { id: 3, name: 'defensive', stat: 'Defence' },  // Style 3 for pure Defence!
];

function getLowestCombatStat(ctx: ScriptContext): string {
    const state = ctx.state();
    if (!state) return 'Attack';

    const attack = state.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
    const strength = state.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
    const defence = state.skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;

    if (attack <= strength && attack <= defence) return 'Attack';
    if (strength <= attack && strength <= defence) return 'Strength';
    return 'Defence';
}

function getStyleForStat(stat: string): typeof STYLES[0] {
    return STYLES.find(s => s.stat === stat) ?? STYLES[0];
}

function getCurrentHp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Hitpoints')?.level ?? 0;
}

function getMaxHp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Hitpoints')?.baseLevel ?? 10;
}

function getCombatLevel(ctx: ScriptContext): number {
    return ctx.state()?.player?.combatLevel ?? 3;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 0;
}

function findTarget(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    // Attack cows or goblins (both common around Lumbridge)
    return state.nearbyNpcs
        .filter(n => /cow|goblin/i.test(n.name) && n.combatLevel > 0)
        .filter(n => !n.inCombat || n.hp === 0)  // Not fighting or dying
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
}

const COW_FIELD = { x: 3253, z: 3290 };

function getPos(ctx: ScriptContext): { x: number; z: number } | null {
    const player = ctx.state()?.player;
    if (!player) return null;
    return { x: player.worldX, z: player.worldZ };
}

function distTo(ctx: ScriptContext, target: { x: number; z: number }): number {
    const pos = getPos(ctx);
    if (!pos) return 999;
    return Math.sqrt(Math.pow(pos.x - target.x, 2) + Math.pow(pos.z - target.z, 2));
}

runArc({
    characterName: 'david_1',
    arcName: 'cow-combat',
    goal: 'Train melee stats at cow field',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,  // Fresh browser each time to avoid stale state
    },
}, async (ctx) => {
    ctx.log('=== Cow Field Combat ===');

    // Wait for state to load properly - be patient since state sync can be slow
    ctx.log('Waiting for game state...');
    let stateLoaded = false;
    for (let i = 0; i < 60; i++) {  // Wait up to 30 seconds
        const s = ctx.state();
        if (s?.player?.worldX > 0) {
            ctx.log(`State loaded after ${i+1} attempts`);
            stateLoaded = true;
            break;
        }
        await new Promise(r => setTimeout(r, 500));
        ctx.progress();
    }

    if (!stateLoaded) {
        ctx.warn('State never loaded - waiting 10 more seconds...');
        await new Promise(r => setTimeout(r, 10000));
        ctx.progress();

        // Try one more time
        const finalState = ctx.state();
        if (finalState?.player?.worldX > 0) {
            ctx.log('State loaded after extended wait');
        } else {
            ctx.error('State still not loaded - trying to fight anyway');
        }
    }

    ctx.log(`Combat level: ${getCombatLevel(ctx)}`);
    ctx.log(`Total level: ${getTotalLevel(ctx)}`);
    ctx.log(`Position: (${getPos(ctx)?.x}, ${getPos(ctx)?.z})`);

    const state = ctx.state();
    const attack = state?.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
    const strength = state?.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
    const defence = state?.skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;
    ctx.log(`Stats: Attack ${attack}, Strength ${strength}, Defence ${defence}`);

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();
    ctx.progress();

    // Check if we have cows or goblins nearby - if so, skip walking
    const nearbyTargets = state?.nearbyNpcs.filter(n => /cow|goblin/i.test(n.name) && n.combatLevel > 0) ?? [];
    const pos = getPos(ctx);

    if (nearbyTargets.length > 0) {
        ctx.log(`Found ${nearbyTargets.length} targets nearby, staying here to fight!`);
    } else if (!pos || pos.x === 0) {
        // Position unknown - don't try to walk, just fight whatever is nearby
        ctx.warn('Position unknown, skipping walk - will fight whatever is nearby');
    } else {
        // No targets nearby and we know our position - walk to cow field
        const cowDist = distTo(ctx, COW_FIELD);
        ctx.log(`No targets nearby, walking to cow field (dist: ${cowDist.toFixed(0)})...`);

        // Walk to cow field via waypoints
        const waypoints = [
            { x: 3240, z: 3260 },  // East of Lumbridge
            { x: 3253, z: 3275 },  // Near cow field gate
        ];

        for (const wp of waypoints) {
            ctx.log(`Walking to (${wp.x}, ${wp.z})...`);
            try {
                await ctx.bot.walkTo(wp.x, wp.z);
            } catch (e) {
                ctx.warn(`Walk failed: ${e}`);
            }
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
        }

        // Open cow field gate
        ctx.log('Opening cow field gate...');
        try {
            await ctx.bot.openDoor(/gate/i);
        } catch (e) {
            ctx.warn(`Gate open failed: ${e}`);
        }
        await new Promise(r => setTimeout(r, 500));

        // Walk into cow field
        try {
            await ctx.bot.walkTo(COW_FIELD.x, COW_FIELD.z);
        } catch (e) {
            ctx.warn(`Final walk failed: ${e}`);
        }
        await new Promise(r => setTimeout(r, 1000));
        ctx.log(`Now at: (${getPos(ctx)?.x}, ${getPos(ctx)?.z})`);
    }

    let kills = 0;
    let lastStyleChange = 0;
    // Force defensive style to catch up Defence (it's 2 levels behind!)
    let currentStyle = STYLES[2];  // defensive

    // Set initial combat style - force defensive
    ctx.log(`Setting combat style: ${currentStyle.name} (FORCED to train ${currentStyle.stat})`);
    try {
        await ctx.sdk.sendSetCombatStyle(currentStyle.id);
    } catch (e) {
        ctx.warn(`Style set error: ${e}`);
    }

    while (true) {
        ctx.progress();

        // Dismiss dialogs (level-ups)
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Check HP - eat food if low (shouldn't need it but safety)
        const hp = getCurrentHp(ctx);
        const maxHp = getMaxHp(ctx);
        if (hp < maxHp * 0.3) {
            ctx.warn(`Low HP: ${hp}/${maxHp}`);
            // Look for food
            const food = ctx.state()?.inventory.find(i => /shrimp|bread/i.test(i.name));
            if (food) {
                ctx.log(`Eating ${food.name}`);
                await ctx.sdk.sendClickItem(food.slot);
                await new Promise(r => setTimeout(r, 500));
            }
        }

        // Re-set defensive style every 10 kills to ensure it sticks
        // (Style changes can be unreliable, so do it often)
        if (kills % 10 === 0 || kills - lastStyleChange >= 10) {
            try {
                await ctx.sdk.sendSetCombatStyle(3);  // defensive (id=3 = Block)
                if (kills % 30 === 0) {
                    ctx.log(`Re-set defensive style (3) at kill ${kills}`);
                }
            } catch (e) {
                // Ignore, will try again
            }
            lastStyleChange = kills;
        }

        // Find and attack target (cow or goblin)
        const target = findTarget(ctx);
        if (target) {
            const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                try {
                    await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    kills++;
                    if (kills % 25 === 0) {
                        const s = ctx.state();
                        const atk = s?.skills.find(sk => sk.name === 'Attack')?.baseLevel ?? 0;
                        const str = s?.skills.find(sk => sk.name === 'Strength')?.baseLevel ?? 0;
                        const def = s?.skills.find(sk => sk.name === 'Defence')?.baseLevel ?? 0;
                        ctx.log(`Kills: ${kills} | Atk ${atk}, Str ${str}, Def ${def}`);
                    }
                } catch (e) {
                    // Action timeout - still making progress, just continue
                    ctx.progress();  // Critical: reset stall timer on errors too
                }
            }
        }

        await new Promise(r => setTimeout(r, 1000));
    }
});
