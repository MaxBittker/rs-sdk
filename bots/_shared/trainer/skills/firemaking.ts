import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { hasItem, countMatching, sleep } from '../util';

/** Burn logs when firemaking is the ladder focus (phase 2 / extended). */
export const firemakingSkill: SkillPlugin = {
    id: 'firemaking',
    skills: ['Firemaking'],
    kit: kitForTask('firemaking'),
    shouldRun: (ctx) => hasItem(ctx.sdk, /tinderbox/i) && countMatching(ctx.sdk, /logs?/i) > 0,
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log } = ctx;
        if (!hasItem(sdk, /tinderbox/i) || countMatching(sdk, /logs?/i) === 0) {
            log('firemaking: need tinderbox + logs');
            return false;
        }
        const before = countMatching(sdk, /logs?/i);
        log('firemaking: burn logs');
        const result = await bot.burnLogs();
        if (!result?.success) {
            log(`firemaking: ${result?.message ?? 'failed'}`);
            await sleep(400);
            return false;
        }
        try {
            await sdk.waitForCondition(() => countMatching(sdk, /logs?/i) < before, 10000);
        } catch {
            // ignore
        }
        return true;
    },
};
