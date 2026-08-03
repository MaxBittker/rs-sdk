import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { bestResourceForLevel, TRAINING_AREAS } from '../knowledge/wiki';
import { avoidKey, isAvoided, noteAvoid, noteConfirm } from '../memory';
import { confirmByItemGain, confirmByXpDelta } from '../observe/confirm';
import { walkToPoint } from '../travel';
import { hasItem, inventoryCount, sleep } from '../util';
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
            const beforeInventory = (sdk.getInventory() ?? []).map((item) => item.name);
            log(`mining: ${pick.reason}`);
            const result = await bot.interactLoc(pick.loc as any, 'mine');
            if (!result?.success) {
                log(`mining: ${result?.message ?? 'failed'}`);
                noteAvoid(memory, avoidKey('loc', pick.loc.name, pick.loc.x, pick.loc.z), 45_000);
                noteConfirm(memory, 'mining', false, result?.message ?? 'failed');
                await sleep(400);
                return gained > 0;
            }
            await waitUntilIdle(sdk, 14000);
            const afterXp = sdk.getSkill('Mining')?.experience ?? 0;
            const afterInventory = (sdk.getInventory() ?? []).map((item) => item.name);
            if (confirmByXpDelta(beforeXp, afterXp) || confirmByItemGain(beforeInventory, afterInventory, /ore|clay|coal/i)) {
                noteConfirm(memory, 'mining', true, 'xp_or_item');
                gained += 1;
            } else {
                noteAvoid(memory, avoidKey('loc', pick.loc.name, pick.loc.x, pick.loc.z), 45_000);
                noteConfirm(memory, 'mining', false, ctx.observation?.errors[0] ?? 'no_progress');
                return gained > 0;
            }
        }
        return gained > 0;
    },
};
