/**
 * Arc: lumbridge-fishing
 * Character: david_1
 *
 * Goal: Fish shrimp somewhere with a small fishing net
 * Strategy:
 * 1. Look for fishing spots nearby first (maybe I'm already close)
 * 2. If no spots, walk to Lumbridge swamp fishing area
 * 3. Fish with small fishing net
 * 4. Keep fishing until inventory is full or timeout
 *
 * Duration: 5 minutes
 */

import { runArc } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// Multiple fishing locations to try
const FISHING_SPOTS = [
    { name: 'Lumbridge Swamp', x: 3243, z: 3152 },  // Adjusted coordinates
    { name: 'Al Kharid', x: 3267, z: 3148 },
];

function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getInventoryCount(ctx: ScriptContext): number {
    return ctx.state()?.inventory.length ?? 0;
}

function getFishCount(ctx: ScriptContext): number {
    const fish = ctx.state()?.inventory.filter(i =>
        /shrimp|anchovies|sardine|herring|raw/i.test(i.name)
    ) || [];
    return fish.reduce((sum, f) => sum + f.count, 0);
}

function findFishingSpot(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    return state.nearbyNpcs.find(npc =>
        /fishing\s*spot/i.test(npc.name) &&
        npc.options.some(opt => /^net$/i.test(opt))
    );
}

runArc({
    characterName: 'david_1',
    arcName: 'lumbridge-fishing',
    goal: 'Fish shrimp with small fishing net',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 45_000,  // Longer stall timeout for walking
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Fishing Adventure ===');
    ctx.log('Goal: Catch some fish with my small fishing net');
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

    // Check if we have a fishing net
    const hasNet = ctx.state()?.inventory.some(i => /fishing\s*net/i.test(i.name));
    if (!hasNet) {
        ctx.error('No fishing net in inventory!');
        return;
    }
    ctx.log('Have fishing net - good!');

    const startFishing = getSkillLevel(ctx, 'Fishing');
    const startPos = ctx.state()?.player;
    ctx.log(`Starting at (${startPos?.worldX}, ${startPos?.worldZ}), Fishing level: ${startFishing}`);

    // Check if there's already a fishing spot nearby
    let spot = findFishingSpot(ctx);
    if (spot) {
        ctx.log(`Found fishing spot nearby! (${spot.distance.toFixed(0)} tiles away)`);
    } else {
        // Try walking to known fishing spots
        for (const location of FISHING_SPOTS) {
            ctx.log(`Walking to ${location.name} fishing spot...`);

            // Walk in steps for long distances
            const player = ctx.state()?.player;
            if (player) {
                const dist = Math.sqrt(
                    Math.pow(player.worldX - location.x, 2) +
                    Math.pow(player.worldZ - location.z, 2)
                );

                if (dist > 50) {
                    // Walk in waypoints
                    const steps = Math.ceil(dist / 25);
                    for (let i = 1; i <= steps; i++) {
                        const ratio = i / steps;
                        const wx = Math.round(player.worldX + (location.x - player.worldX) * ratio);
                        const wz = Math.round(player.worldZ + (location.z - player.worldZ) * ratio);
                        ctx.log(`Walking step ${i}/${steps} to (${wx}, ${wz})...`);
                        await ctx.bot.walkTo(wx, wz);
                        await new Promise(r => setTimeout(r, 1500));
                        ctx.progress();
                    }
                } else {
                    await ctx.bot.walkTo(location.x, location.z);
                    await new Promise(r => setTimeout(r, 2000));
                    ctx.progress();
                }
            }

            // Check if we found a spot after walking
            await new Promise(r => setTimeout(r, 1000));
            spot = findFishingSpot(ctx);
            if (spot) {
                ctx.log(`Found fishing spot at ${location.name}!`);
                break;
            }
        }
    }

    if (!spot) {
        ctx.warn('Could not find any fishing spots! Let me look around...');
        // Log nearby NPCs to understand what's here
        const npcs = ctx.state()?.nearbyNpcs.slice(0, 10) || [];
        ctx.log('Nearby NPCs:');
        for (const npc of npcs) {
            ctx.log(`  - ${npc.name} at dist ${npc.distance.toFixed(0)}, options: [${npc.options.join(', ')}]`);
        }
    }

    let loopCount = 0;
    let noSpotCount = 0;

    // Main fishing loop
    while (true) {
        loopCount++;
        const state = ctx.state();
        if (!state) continue;

        // Status update
        if (loopCount % 15 === 0) {
            const fishingLvl = getSkillLevel(ctx, 'Fishing');
            const currentFish = getFishCount(ctx);
            const invCount = getInventoryCount(ctx);
            const player = state.player;
            ctx.log(`Loop ${loopCount}: Fishing ${fishingLvl} | Fish: ${currentFish} | Inventory: ${invCount}/28 | Pos: (${player?.worldX}, ${player?.worldZ})`);
        }

        // Dismiss dialogs (level-ups)
        if (state.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check inventory full
        if (getInventoryCount(ctx) >= 28) {
            ctx.log('Inventory full! Stopping.');
            break;
        }

        // Find fishing spot
        spot = findFishingSpot(ctx);

        if (!spot) {
            noSpotCount++;
            if (noSpotCount > 10) {
                // Try walking around to find spots
                const player = state.player;
                if (player) {
                    ctx.log('Searching for fishing spots...');
                    await ctx.bot.walkTo(player.worldX + 10, player.worldZ);
                    noSpotCount = 0;
                }
            }
            await new Promise(r => setTimeout(r, 1500));
            ctx.progress();
            continue;
        }

        noSpotCount = 0;

        // Check if already fishing (animating)
        const player = state.player;
        const isAnimating = player?.animId !== -1;
        if (isAnimating) {
            await new Promise(r => setTimeout(r, 1000));
            ctx.progress();
            continue;
        }

        // Fish!
        const netOpt = spot.optionsWithIndex.find(o => /^net$/i.test(o.text));
        if (netOpt) {
            await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
            ctx.progress();
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Final stats
    const endFishing = getSkillLevel(ctx, 'Fishing');
    const totalFish = getFishCount(ctx);
    ctx.log('');
    ctx.log('=== Fishing Results ===');
    ctx.log(`Fishing Level: ${startFishing} → ${endFishing} (+${endFishing - startFishing})`);
    ctx.log(`Fish caught: ${totalFish}`);
});
