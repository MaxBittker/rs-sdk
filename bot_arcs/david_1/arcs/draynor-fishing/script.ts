/**
 * Arc: draynor-fishing
 * Character: david_1
 *
 * Goal: Try fishing at Draynor Village
 * Strategy:
 * 1. Walk to Draynor fishing area (3087, 3230)
 * 2. Use small fishing net on fishing spots
 * 3. Fish shrimp/anchovies continuously
 *
 * Duration: 5 minutes (short first run to validate)
 *
 * Note: Draynor has dark wizards nearby - stay south of them!
 */

import { runArc } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// Draynor fishing area
const FISHING_AREA = { x: 3087, z: 3230 };
const MAX_DRIFT = 20;

interface Stats {
    fishCaught: number;
    startTime: number;
}

function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

async function walkToDraynor(ctx: ScriptContext): Promise<void> {
    const player = ctx.state()?.player;
    if (!player) return;

    ctx.log(`Starting position: (${player.worldX}, ${player.worldZ})`);

    // Calculate distance to target
    const dist = Math.sqrt(
        Math.pow(player.worldX - FISHING_AREA.x, 2) +
        Math.pow(player.worldZ - FISHING_AREA.z, 2)
    );

    if (dist < 15) {
        ctx.log('Already near Draynor fishing area!');
        return;
    }

    ctx.log(`Walking to Draynor fishing area (${dist.toFixed(0)} tiles away)...`);

    // Use waypoints to avoid dark wizards (stay north of z=3240)
    // Route: From cow field (3253, 3290) to Draynor (3087, 3230)
    const waypoints = [
        { x: 3230, z: 3270 },  // Go west, stay north
        { x: 3180, z: 3260 },  // Continue west
        { x: 3130, z: 3250 },  // Keep going
        { x: 3087, z: 3230 },  // Draynor fishing
    ];

    for (const wp of waypoints) {
        ctx.log(`Walking to waypoint (${wp.x}, ${wp.z})...`);
        await ctx.bot.walkTo(wp.x, wp.z);
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();

        // Check if we arrived close enough
        const p = ctx.state()?.player;
        if (p) {
            const d = Math.sqrt(Math.pow(p.worldX - wp.x, 2) + Math.pow(p.worldZ - wp.z, 2));
            ctx.log(`Arrived at (${p.worldX}, ${p.worldZ}), ${d.toFixed(0)} tiles from waypoint`);
        }
    }

    ctx.log('Arrived at Draynor!');
}

async function findFishingSpot(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    // Fishing spots are NPCs
    const spots = state.nearbyNpcs
        .filter(npc => /fishing\s*spot/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /^net$/i.test(opt)))  // Has "Net" option
        .sort((a, b) => a.distance - b.distance);

    return spots[0] ?? null;
}

runArc({
    characterName: 'david_1',
    arcName: 'draynor-fishing',
    goal: 'Fish at Draynor Village',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const stats: Stats = {
        fishCaught: 0,
        startTime: Date.now(),
    };

    ctx.log('=== Draynor Fishing ===');
    ctx.log('Goal: Fish with small net, catch shrimp/anchovies');
    ctx.log('');

    // Wait for state - give it plenty of time
    ctx.log('Waiting for game state...');
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        ctx.progress();
        const state = ctx.state();
        if (state?.player?.worldX > 0) {
            ctx.log(`State loaded after ${(i+1)*2}s`);
            break;
        }
        ctx.log(`Waiting... (attempt ${i+1}/10)`);
    }

    await new Promise(r => setTimeout(r, 1000));
    ctx.progress();

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();

    // Check we have fishing net
    const hasNet = ctx.state()?.inventory.some(i => /fishing net/i.test(i.name));
    if (!hasNet) {
        ctx.error('No fishing net in inventory!');
        return;
    }
    ctx.log('Fishing net found in inventory');

    // Log starting fishing level
    const startLevel = getSkillLevel(ctx, 'Fishing');
    ctx.log(`Starting Fishing level: ${startLevel}`);

    // Walk to Draynor
    await walkToDraynor(ctx);

    let loopCount = 0;
    let lastFishingAction = 0;

    // Main fishing loop
    while (true) {
        loopCount++;
        const state = ctx.state();
        if (!state) continue;

        // Status update every 30 loops
        if (loopCount % 30 === 0) {
            const level = getSkillLevel(ctx, 'Fishing');
            ctx.log(`Loop ${loopCount}: Fishing ${level} | Fish caught: ${stats.fishCaught}`);
        }

        // Dismiss dialogs (level-ups)
        if (state.dialog.isOpen) {
            ctx.log('Dismissing dialog');
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check if we've drifted too far
        const player = state.player;
        const drift = Math.sqrt(
            Math.pow(player.worldX - FISHING_AREA.x, 2) +
            Math.pow(player.worldZ - FISHING_AREA.z, 2)
        );

        if (drift > MAX_DRIFT) {
            ctx.log(`Drifted ${drift.toFixed(0)} tiles, walking back...`);
            await ctx.bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
            continue;
        }

        // Check inventory space
        if (state.inventory.length >= 28) {
            ctx.log('Inventory full! Dropping some fish...');
            // Drop oldest fish to make space
            const fish = state.inventory.find(i => /shrimp|anchov/i.test(i.name));
            if (fish) {
                const dropOpt = fish.optionsWithIndex.find(o => /drop/i.test(o.text));
                if (dropOpt) {
                    await ctx.sdk.sendUseItem(fish.slot, dropOpt.opIndex);
                    await new Promise(r => setTimeout(r, 300));
                }
            }
            ctx.progress();
            continue;
        }

        // Find fishing spot and fish
        const spot = await findFishingSpot(ctx);

        if (!spot) {
            // No spots nearby, wait a bit
            if (loopCount % 10 === 0) {
                ctx.log('No fishing spots nearby, waiting...');
            }
            await new Promise(r => setTimeout(r, 1500));
            ctx.progress();
            continue;
        }

        // Check if we're already fishing (animating)
        const isIdle = player?.animId === -1;

        if (isIdle && Date.now() - lastFishingAction > 2000) {
            // Start fishing
            ctx.log(`Found fishing spot (dist ${spot.distance.toFixed(1)}), casting net...`);

            try {
                const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
                if (netOpt) {
                    await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
                    lastFishingAction = Date.now();
                    stats.fishCaught++;  // Approximate - actual fish takes time
                    ctx.progress();
                }
            } catch (err) {
                ctx.log('Fishing action failed, will retry...');
            }

            await new Promise(r => setTimeout(r, 1500));
        } else {
            // Currently fishing, wait
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
        }
    }
});
