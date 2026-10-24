// Phase 0 probe: what does a brand-new account look like after the tutorial?
//   bun economy/tests/probe-start.ts <botname>
import { runScript } from '../../sdk/runner';

await runScript(
    async ({ bot, sdk }) => {
        const before = sdk.getState();
        console.log(`start pos (${before?.player?.worldX}, ${before?.player?.worldZ})`);

        const res = await bot.skipTutorial();
        console.log('skipTutorial:', res.success, res.message);

        // Tutorial can take several passes through dialogs.
        for (let i = 0; i < 12; i++) {
            const s = sdk.getState();
            const x = s?.player?.worldX ?? 0;
            const z = s?.player?.worldZ ?? 0;
            // Tutorial island is around z=3090-3130, x=3050-3110; mainland starts well east/north.
            if (z > 3150 || x > 3110) break;
            await bot.skipTutorial();
            await sdk.waitForTicks(3);
        }

        const s = sdk.getState()!;
        console.log(`pos (${s.player?.worldX}, ${s.player?.worldZ}) level ${s.player?.level}`);
        console.log('inventory:', s.inventory.map((i) => `${i.name} x${i.count}`).join(', ') || '(empty)');
        console.log('equipment:', JSON.stringify(s.equipment?.map?.((e: any) => e.name) ?? s.equipment));
        console.log(
            'skills>1:',
            s.skills.filter((k) => k.level > 1).map((k) => `${k.name} ${k.level}`).join(', ') || '(none)',
        );
    },
    { timeout: 120_000 },
);
