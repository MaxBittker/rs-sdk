import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { bestResourceForLevel, TRAINING_AREAS } from '../knowledge/wiki';
import { avoidKey, isAvoided, noteAvoid, noteConfirm } from '../memory';
import { confirmByItemGain, confirmByXpDelta } from '../observe/confirm';
import { walkToPoint } from '../travel';
import { hasItem, inventoryCount, sleep } from '../util';
import { pickBestTree, waitUntilIdle } from './smart-select';

function preferredArea(preferredName: string | null) {
    if (/willow/i.test(preferredName ?? '')) return TRAINING_AREAS.draynorWillows;
    return TRAINING_AREAS.lumbridgeTrees;
}

/**
 * Chop session: keep cutting best unlocked trees until invent nearly full.
 * Avoids planner thrash and wrong-tier trees (e.g. oak at WC 1).
 */
export const woodcuttingSkill: SkillPlugin = {
    id: 'woodcutting',
    skills: ['Woodcutting'],
    kit: kitForTask('woodcutting'),
    shouldRun: (ctx) => hasItem(ctx.sdk, /axe/i),
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, levels, memory, log } = ctx;
        if (!hasItem(sdk, /axe/i)) {
            log('woodcutting: missing axe');
            return false;
        }

        const level = levels.Woodcutting ?? 1;
        const best = bestResourceForLevel('woodcutting', level, /trees/i);
        const preferredName = best?.name ?? null;
        const isTargetAvoided = (loc: { name: string; x: number; z: number }) =>
            isAvoided(memory, avoidKey('loc', loc.name, loc.x, loc.z));
        let seekFallback = ctx.observation?.noChopTarget ?? false;
        let gained = 0;
        const maxActions = 12;

        for (let i = 0; i < maxActions; i++) {
            if (inventoryCount(sdk) >= 26) {
                log('woodcutting: invent nearly full — end session');
                break;
            }

            if (isBusy(sdk)) {
                await waitUntilIdle(sdk, 14000);
            }

            let pick = seekFallback ? null : pickBestTree(sdk, level, preferredName, isTargetAvoided);
            if (!pick) {
                await walkToPoint(bot, sdk, preferredArea(preferredName));
                await sleep(350);
                seekFallback = false;
                pick = pickBestTree(sdk, level, preferredName, isTargetAvoided);
            }
            if (!pick) {
                log('woodcutting: no unlocked tree nearby');
                return gained > 0;
            }

            const beforeXp = sdk.getSkillXp('Woodcutting') ?? sdk.getSkill('Woodcutting')?.experience ?? 0;
            const beforeInv = (sdk.getInventory() ?? []).map((item) => item.name);
            log(`woodcutting: ${pick.reason}`);
            const result = await bot.chopTree(pick.loc as any);
            if (!result?.success) {
                log(`woodcutting: ${result?.message ?? 'failed'}`);
                noteAvoid(memory, avoidKey('loc', pick.loc.name, pick.loc.x, pick.loc.z), 45_000);
                noteConfirm(memory, 'woodcutting', false, result?.message ?? 'failed');
                await sleep(400);
                return false;
            }
            await waitUntilIdle(sdk, 16000);
            const afterXp = sdk.getSkillXp('Woodcutting') ?? sdk.getSkill('Woodcutting')?.experience ?? 0;
            const afterInv = (sdk.getInventory() ?? []).map((item) => item.name);
            const confirmed =
                confirmByXpDelta(beforeXp, afterXp) || confirmByItemGain(beforeInv, afterInv, /logs?/i);
            if (!confirmed) {
                noteAvoid(memory, avoidKey('loc', pick.loc.name, pick.loc.x, pick.loc.z), 45_000);
                noteConfirm(memory, 'woodcutting', false, ctx.observation?.errors[0] ?? 'no_progress');
                return false;
            }
            noteConfirm(memory, 'woodcutting', true, 'xp_or_item');
            gained += 1;
        }
        return gained > 0;
    },
};

function isBusy(sdk: SkillRunContext['sdk']): boolean {
    const anim = sdk.getState()?.player?.animId ?? -1;
    return anim !== -1 && anim !== 0;
}
