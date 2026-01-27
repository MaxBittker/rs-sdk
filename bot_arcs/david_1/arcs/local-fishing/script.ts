/**
 * Local Fishing Arc
 *
 * Fish at nearby spots. No walking far - just use what's close.
 */

import { runArc } from '../../../arc-runner';

runArc({
    characterName: 'david_1',
    arcName: 'local-fishing',
    goal: 'Fish at nearby spots',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Local Fishing ===');

    // Wait for state to load
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
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);

    // Check fishing level and equipment
    const fishingLevel = state?.skills.find(s => s.name === 'Fishing')?.baseLevel ?? 1;
    ctx.log(`Fishing level: ${fishingLevel}`);

    const hasNet = state?.inventory.some(i => /fishing net/i.test(i.name));
    ctx.log(`Has fishing net: ${hasNet}`);

    if (!hasNet) {
        ctx.error('No fishing net in inventory!');
        return;
    }

    // Find fishing spot
    const spots = state?.nearbyNpcs.filter(n => /fishing spot/i.test(n.name)) ?? [];
    ctx.log(`Found ${spots.length} fishing spots nearby`);

    if (spots.length === 0) {
        ctx.error('No fishing spots found nearby');
        return;
    }

    let catches = 0;

    while (true) {
        ctx.progress();

        // Dismiss dialogs
        if (ctx.state()?.dialog.isOpen) {
            await ctx.sdk.sendClickDialog(0);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Find a fishing spot
        const currentState = ctx.state();
        const spot = currentState?.nearbyNpcs
            .filter(n => /fishing spot/i.test(n.name))
            .sort((a, b) => a.distance - b.distance)[0];

        if (spot) {
            // Look for "Net" option
            const netOpt = spot.optionsWithIndex.find(o => /net/i.test(o.text));
            if (netOpt) {
                try {
                    await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
                    catches++;
                    if (catches % 5 === 0) {
                        const fishing = currentState?.skills.find(s => s.name === 'Fishing');
                        ctx.log(`Catches: ${catches} | Fishing: ${fishing?.baseLevel} (${fishing?.experience} XP)`);
                    }
                } catch (e) {
                    ctx.progress();
                }
            } else {
                ctx.log(`Spot options: ${spot.optionsWithIndex.map(o => o.text).join(', ')}`);
            }
        } else {
            ctx.log('No fishing spot found this tick');
        }

        await new Promise(r => setTimeout(r, 3000));  // Fishing is slow
        ctx.progress();
    }
});
