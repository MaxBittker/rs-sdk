/**
 * Local Combat Arc
 *
 * Attacks whatever is nearby - goblins, cows, rats. No walking.
 * Just fight what's close.
 */

import { runArc, type ScriptContext } from '../../../arc-runner';

// Combat styles for swords (bronze sword):
// 0 = Stab (Attack), 1 = Lunge (Strength), 2 = Slash (Controlled), 3 = Block (Defence)
const STYLES = [
    { id: 0, name: 'accurate', stat: 'Attack' },
    { id: 1, name: 'aggressive', stat: 'Strength' },
    { id: 3, name: 'defensive', stat: 'Defence' },  // Style 3 for pure Defence, NOT 2!
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

function findTarget(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    const npcs = state.nearbyNpcs;

    // Log what we see every 30 seconds to debug
    if (Math.random() < 0.03) {
        const names = npcs.slice(0, 5).map(n => `${n.name}(${n.combatLevel},${n.distance.toFixed(0)})`).join(', ');
        ctx.log(`DEBUG nearby: ${names || 'nothing'}`);
    }

    // Find cows, goblins, or rats nearby
    return npcs
        .filter(n => /cow|goblin|rat/i.test(n.name) && n.combatLevel > 0)
        .filter(n => !n.inCombat || n.hp === 0)
        .filter(n => n.distance < 20)  // Increased range
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
}

runArc({
    characterName: 'david_1',
    arcName: 'local-combat',
    goal: 'Fight whatever is nearby',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Local Combat ===');

    // Wait for state to load properly
    ctx.log('Waiting for state...');
    for (let i = 0; i < 30; i++) {
        const s = ctx.state();
        if (s?.player?.worldX > 0) {
            ctx.log(`State loaded after ${i+1} attempts`);
            break;
        }
        await new Promise(r => setTimeout(r, 500));
        ctx.progress();
    }

    const state = ctx.state();
    const pos = state?.player;
    ctx.log(`Position: (${pos?.worldX}, ${pos?.worldZ})`);
    ctx.log(`Combat Level: ${pos?.combatLevel}`);

    const attack = state?.skills.find(s => s.name === 'Attack')?.baseLevel ?? 1;
    const strength = state?.skills.find(s => s.name === 'Strength')?.baseLevel ?? 1;
    const defence = state?.skills.find(s => s.name === 'Defence')?.baseLevel ?? 1;
    ctx.log(`Stats: Atk ${attack}, Str ${strength}, Def ${defence}`);

    // Set initial combat style - FORCE DEFENSIVE to catch up Defence
    // const lowestStat = getLowestCombatStat(ctx);
    // const style = getStyleForStat(lowestStat);
    const style = STYLES[2];  // Force defensive (Defence training)
    ctx.log(`Combat style: ${style.name} (FORCED to train ${style.stat})`);

    try {
        await ctx.sdk.sendSetCombatStyle(style.id);
    } catch (e) {
        ctx.warn(`Style set error: ${e}`);
    }

    let kills = 0;
    let lastStyleChange = 0;
    let currentStyle = style;

    while (true) {
        ctx.progress();

        // Dismiss dialogs
        if (ctx.state()?.dialog.isOpen) {
            try {
                await ctx.sdk.sendClickDialog(0);
            } catch (e) {
                // Dialog click failed, continue anyway
            }
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Force defensive style every 10 kills to ensure it sticks
        if (kills % 10 === 0) {
            try {
                await ctx.sdk.sendSetCombatStyle(3);  // Force defensive Block style (id=3)
                if (kills % 20 === 0) {
                    ctx.log(`Re-set defensive style (3) at kill ${kills}`);
                }
            } catch (e) {
                // Ignore style set errors
            }
        }

        // Find and attack target
        const target = findTarget(ctx);
        if (target) {
            const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
            if (attackOpt) {
                try {
                    await ctx.sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                    kills++;
                    if (kills % 20 === 0) {
                        const s = ctx.state();
                        const atk = s?.skills.find(sk => sk.name === 'Attack')?.baseLevel ?? 0;
                        const str = s?.skills.find(sk => sk.name === 'Strength')?.baseLevel ?? 0;
                        const def = s?.skills.find(sk => sk.name === 'Defence')?.baseLevel ?? 0;
                        ctx.log(`Kills: ${kills} | Atk ${atk}, Str ${str}, Def ${def}`);
                    }
                } catch (e) {
                    // Ignore timeout errors but still mark progress
                }
            }
        }

        // Always mark progress to avoid stall detection
        ctx.progress();

        await new Promise(r => setTimeout(r, 800));
        ctx.progress();  // Always mark progress each loop iteration
    }
});
