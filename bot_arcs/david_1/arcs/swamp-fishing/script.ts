/**
 * Swamp Fishing Arc (v2)
 *
 * Goal: Walk from cow field to Lumbridge Swamp and fish shrimp.
 * Fixed: Properly exit cow field through gate, avoid combat interruptions.
 */

import { runArc, type ScriptContext } from '../../../arc-runner';

const LOCATIONS = {
    LUMBRIDGE_SWAMP_FISHING: { x: 3239, z: 3147 },
    COW_FIELD_GATE: { x: 3253, z: 3270 },
    OUTSIDE_COW_FIELD: { x: 3253, z: 3265 },
};

// Helper: Get player position
function getPos(ctx: ScriptContext): { x: number; z: number } | null {
    const state = ctx.state();
    if (!state?.player) return null;
    return { x: state.player.worldX, z: state.player.worldZ };
}

// Helper: Distance to target
function distTo(ctx: ScriptContext, target: { x: number; z: number }): number {
    const pos = getPos(ctx);
    if (!pos) return 999;
    return Math.sqrt(Math.pow(pos.x - target.x, 2) + Math.pow(pos.z - target.z, 2));
}

// Helper: Find fishing spot with Net option
function findNetSpot(ctx: ScriptContext) {
    const state = ctx.state();
    if (!state) return null;

    return state.nearbyNpcs
        .filter(npc => /fishing\s*spot/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /^net$/i.test(opt)))
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
}

// Helper: Count raw fish
function countRawFish(ctx: ScriptContext): number {
    const state = ctx.state();
    if (!state) return 0;
    return state.inventory
        .filter(item => /^raw\s/i.test(item.name))
        .reduce((sum, item) => sum + item.count, 0);
}

// Helper: Get fishing level
function getFishingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
}

// Helper: Get free inventory slots
function getFreeSlots(ctx: ScriptContext): number {
    return 28 - (ctx.state()?.inventory.length ?? 0);
}

// Helper: Wait for movement to complete
async function waitForArrival(ctx: ScriptContext, target: { x: number; z: number }, tolerance: number = 5, maxWait: number = 15000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        const dist = distTo(ctx, target);
        if (dist <= tolerance) return true;

        // Dismiss any blocking UI
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
        }

        await new Promise(r => setTimeout(r, 500));
        ctx.progress();
    }
    return false;
}

// Helper: Reliable walk with retries using direct sendWalk
async function reliableWalkTo(ctx: ScriptContext, x: number, z: number, name: string): Promise<boolean> {
    ctx.log(`Walking to ${name} (${x}, ${z})...`);

    for (let attempt = 0; attempt < 5; attempt++) {
        // Try direct walk
        try {
            await ctx.sdk.sendWalk(x, z, true);
        } catch (e) {
            ctx.warn(`Walk send failed: ${e}`);
        }

        // Wait for movement
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            ctx.progress();

            // Dismiss blocking UI
            if (ctx.state()?.dialog.isOpen) {
                try {
                    await ctx.sdk.sendClickDialog(0);
                } catch {}
            }

            const dist = distTo(ctx, { x, z });
            if (dist <= 5) {
                ctx.log(`Arrived at ${name}`);
                return true;
            }
        }

        const pos = getPos(ctx);
        const dist = distTo(ctx, { x, z });
        ctx.log(`After attempt ${attempt + 1}: at (${pos?.x}, ${pos?.z}), dist: ${dist.toFixed(0)}`);

        // Try opening doors if stuck
        if (attempt >= 2) {
            ctx.log('Trying to open nearby doors...');
            try {
                await ctx.bot.openDoor(/door|gate/i);
                await new Promise(r => setTimeout(r, 500));
            } catch {}
        }
    }

    return distTo(ctx, { x, z }) <= 10;
}

runArc({
    characterName: 'david_1',
    arcName: 'swamp-fishing',
    goal: 'Walk to Lumbridge Swamp and fish shrimp',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Swamp Fishing Arc (v2) ===');
    ctx.log(`Starting position: (${getPos(ctx)?.x}, ${getPos(ctx)?.z})`);
    ctx.log(`Fishing level: ${getFishingLevel(ctx)}`);
    ctx.log(`Free slots: ${getFreeSlots(ctx)}`);

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();
    ctx.progress();

    // Drop bones to make room for fish
    const state = ctx.state();
    const bones = state?.inventory.filter(i => /bones/i.test(i.name)) ?? [];
    if (bones.length > 0) {
        ctx.log(`Dropping ${bones.length} bone stacks to make room...`);
        for (const bone of bones) {
            await ctx.sdk.sendDropItem(bone.slot);
            await new Promise(r => setTimeout(r, 150));
        }
        ctx.progress();
    }

    // Check if we're in cow field (z > 3270)
    const pos = getPos(ctx);
    const inCowField = pos && pos.z > 3270;

    if (inCowField) {
        ctx.log('In cow field - need to exit through gate first');

        // Walk to gate
        await reliableWalkTo(ctx, LOCATIONS.COW_FIELD_GATE.x, LOCATIONS.COW_FIELD_GATE.z, 'cow field gate');

        // Open gate
        ctx.log('Opening cow field gate...');
        await ctx.bot.openDoor(/gate/i);
        await new Promise(r => setTimeout(r, 1000));
        ctx.progress();

        // Walk through gate
        await reliableWalkTo(ctx, LOCATIONS.OUTSIDE_COW_FIELD.x, LOCATIONS.OUTSIDE_COW_FIELD.z, 'outside cow field');
    }

    // Walk to Lumbridge Swamp fishing area in steps
    // Route: Go south from current location to swamp
    // Skip waypoints we're already past
    const currentPos = getPos(ctx);
    // Default to 3300 (north) if no position, unless we're at 0,0 which means sync issue
    const currentZ = (currentPos?.z && currentPos.z > 0) ? currentPos.z : 3300;

    // If we're near the church (3242, 3200), we need to exit first
    const nearChurch = currentPos && currentPos.x > 3230 && currentPos.x < 3250 && currentPos.z > 3190 && currentPos.z < 3210;
    if (nearChurch) {
        ctx.log('Near Lumbridge church - opening doors to exit...');
        try {
            await ctx.bot.openDoor(/door/i);
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            ctx.warn(`Door open failed: ${e}`);
        }
    }

    const waypoints = [
        { x: 3222, z: 3218, name: 'lumbridge spawn' },  // Outside castle
        { x: 3225, z: 3190, name: 'south of castle' },  // South path
        { x: 3230, z: 3160, name: 'near swamp' },
        { x: 3239, z: 3147, name: 'fishing spot' },
    ];

    for (const wp of waypoints) {
        // Skip waypoints we're already past (south of)
        if (currentZ < wp.z + 10) {
            ctx.log(`Skipping ${wp.name} (already past it)`);
            continue;
        }
        try {
            await reliableWalkTo(ctx, wp.x, wp.z, wp.name);
        } catch (e) {
            ctx.warn(`Walk to ${wp.name} failed: ${e}`);
        }
    }

    // Check if we arrived at fishing area
    const dist = distTo(ctx, LOCATIONS.LUMBRIDGE_SWAMP_FISHING);
    ctx.log(`Distance to fishing spot: ${dist.toFixed(0)}`);

    // Look for fishing spots
    let spot = findNetSpot(ctx);
    if (!spot) {
        ctx.log('No fishing spot found, looking around...');
        const nearbyNpcs = ctx.state()?.nearbyNpcs.slice(0, 10) ?? [];
        ctx.log(`Nearby NPCs: ${nearbyNpcs.map(n => `${n.name} (${n.distance.toFixed(0)})`).join(', ') || 'none'}`);

        const anyFishingSpot = ctx.state()?.nearbyNpcs.find(n => /fishing/i.test(n.name));
        if (anyFishingSpot) {
            ctx.log(`Found: ${anyFishingSpot.name} at dist ${anyFishingSpot.distance}, options: ${anyFishingSpot.options.join(', ')}`);
        }

        // Walk around a bit to find spots
        await ctx.sdk.sendWalk(3239, 3150, true);
        await new Promise(r => setTimeout(r, 3000));
        spot = findNetSpot(ctx);
    }

    if (!spot) {
        ctx.warn('Still no fishing spot found!');
        ctx.log(`Final position: (${getPos(ctx)?.x}, ${getPos(ctx)?.z})`);
        return;
    }

    ctx.log(`Found fishing spot! Starting to fish.`);

    // Fish loop
    let fishCaught = 0;
    let lastFishCount = countRawFish(ctx);
    let noProgressCount = 0;

    while (getFreeSlots(ctx) > 0) {
        ctx.progress();

        // Dismiss dialogs (level-ups)
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Check for new fish
        const currentFish = countRawFish(ctx);
        if (currentFish > lastFishCount) {
            fishCaught += currentFish - lastFishCount;
            ctx.log(`Caught fish! Total: ${fishCaught}, Fishing level: ${getFishingLevel(ctx)}`);
            lastFishCount = currentFish;
            noProgressCount = 0;
        } else {
            noProgressCount++;
        }

        // Find and click fishing spot
        const currentSpot = findNetSpot(ctx);
        if (currentSpot) {
            const netOpt = currentSpot.optionsWithIndex.find(o => /^net$/i.test(o.text));
            if (netOpt) {
                await ctx.sdk.sendInteractNpc(currentSpot.index, netOpt.opIndex);
            }
        } else if (noProgressCount > 30) {
            // No spot found for a while, walk back to fishing area
            ctx.log('Lost fishing spot, walking around...');
            await ctx.sdk.sendWalk(3239, 3147, true);
            await new Promise(r => setTimeout(r, 2000));
            noProgressCount = 0;
        }

        await new Promise(r => setTimeout(r, 1000));
    }

    // Final summary
    ctx.log('');
    ctx.log('=== Fishing Complete ===');
    ctx.log(`Fish caught: ${fishCaught}`);
    ctx.log(`Fishing level: ${getFishingLevel(ctx)}`);
    ctx.log(`Position: (${getPos(ctx)?.x}, ${getPos(ctx)?.z})`);
});
