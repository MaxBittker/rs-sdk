/**
 * Headless Runner Example
 *
 * Demonstrates runHeadless - a fully self-contained script that needs
 * no external browser, no bot.env file, and no manual setup.
 * Just run: bun scripts/headless-example/script.ts
 *
 * It creates a fresh bot, launches a headless browser, runs the script,
 * and cleans up. The only requirement is the game server running.
 */

import { runHeadless, TestPresets } from '../../sdk/headless';

const result = await runHeadless(async (ctx) => {
    const { bot, sdk, log } = ctx;

    log('=== Headless Woodcutting Demo ===');

    const state = sdk.getState();
    if (!state?.player) {
        ctx.error('No player state');
        return;
    }

    log(`Spawned at (${state.player.worldX}, ${state.player.worldZ})`);
    log(`Woodcutting level: ${sdk.getSkill('Woodcutting')?.baseLevel ?? 1}`);

    // Dismiss any startup dialogs
    await bot.dismissBlockingUI();

    // Chop a few trees
    let treesChopped = 0;
    const TARGET = 3;

    while (treesChopped < TARGET) {
        const tree = sdk.findNearbyLoc(/^tree$/i);
        if (!tree) {
            log('No trees nearby, walking to find some...');
            await bot.walkTo(3200, 3230);
            continue;
        }

        log(`Chopping tree at (${tree.x}, ${tree.z})...`);
        const result = await bot.chopTree(tree);
        if (result.success) {
            treesChopped++;
            log(`Chopped ${treesChopped}/${TARGET} trees`);
        }
    }

    log(`Done! Chopped ${treesChopped} trees.`);
    return { treesChopped };
}, {
    save: TestPresets.LUMBRIDGE_SPAWN,
    timeout: 2 * 60 * 1000,  // 2 minutes
});

if (result.success) {
    console.log(`Script completed in ${(result.duration / 1000).toFixed(1)}s`);
} else {
    console.error(`Script failed: ${result.error?.message}`);
}

process.exit(result.success ? 0 : 1);
