import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { bestResourceForLevel, TRAINING_AREAS } from '../knowledge/wiki';
import { avoidKey, isAvoided } from '../memory';
import { walkToPoint } from '../travel';
import { countMatching, hasItem, inventoryCount, sleep } from '../util';
import { pickBestRock, waitUntilIdle } from './smart-select';

export const miningSkill: SkillPlugin = {
    id: 'mining',
    skills: ['Mining'],
    kit: kitForTask('mining'),
    shouldRun: (ctx) => hasItem(ctx.sdk, /pickaxe/i),
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, levels, memory, log } = ctx;
        if (!hasItem(sdk, /pickaxe/i)) {
            log('mining: missing pickaxe');
            return false;
        }

        const invPick = sdk.findInventoryItem(/pickaxe/i);
        if (invPick && !sdk.findEquipmentItem(/pickaxe/i)) {
            await bot.equipItem(invPick);
            await sleep(200);
        }

        const level = levels.Mining ?? 1;
        const best = bestResourceForLevel('mining', level, /ores?/i);
        const preferredName = best?.name ?? null;
        const isTargetAvoided = (loc: { name: string; x: number; z: number }) =>
            isAvoided(memory, avoidKey('loc', loc.name, loc.x, loc.z));
        let seekFallback = ctx.observation?.noMineTarget ?? false;
        let gained = 0;

        for (let i = 0; i < 10; i++) {
            if (inventoryCount(sdk) >= 26) break;

            let pick = seekFallback ? null : pickBestRock(sdk, level, preferredName, isTargetAvoided);
            if (!pick) {
                await walkToPoint(bot, sdk, TRAINING_AREAS.seVarrockMine);
                await sleep(400);
                seekFallback = false;
                pick = pickBestRock(sdk, level, preferredName, isTargetAvoided);
            }
            if (!pick) {
                log('mining: no unlocked rock');
                return gained > 0;
            }

            const beforeXp = sdk.getSkill('Mining')?.experience ?? 0;
            const beforeOre = countMatching(sdk, /ore|clay|coal/i);
            log(`mining: ${pick.reason}`);
            const result = await bot.interactLoc(pick.loc as any, 'mine');
            if (!result?.success) {
                log(`mining: ${result?.message ?? 'failed'}`);
                await sleep(400);
                if (i === 0) return false;
                break;
            }
            await waitUntilIdle(sdk, 14000);
            if (
                (sdk.getSkill('Mining')?.experience ?? 0) > beforeXp ||
                countMatching(sdk, /ore|clay|coal/i) > beforeOre
            ) {
                gained += 1;
            } else break;
        }
        return gained > 0;
    },
};
