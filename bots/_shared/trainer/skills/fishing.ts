import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { TRAINING_AREAS } from '../knowledge/wiki';
import { walkToPoint } from '../travel';
import { countMatching, hasItem, sleep } from '../util';

export const fishingSkill: SkillPlugin = {
    id: 'fishing',
    skills: ['Fishing'],
    kit: kitForTask('fishing'),
    shouldRun: (ctx) => hasItem(ctx.sdk, /small fishing net|\bnet\b/i),
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log } = ctx;
        if (!hasItem(sdk, /small fishing net|\bnet\b/i)) return false;

        let spots = (sdk.getState()?.nearbyNpcs ?? []).filter((n) => /fishing\s*spot/i.test(n.name));
        let spot = spots.find((n) => n.optionsWithIndex?.some((o) => /^net$/i.test(o.text))) ?? spots[0];
        if (!spot) {
            await walkToPoint(bot, sdk, TRAINING_AREAS.lumbridgeSwampFish);
            spots = (sdk.getState()?.nearbyNpcs ?? []).filter((n) => /fishing\s*spot/i.test(n.name));
            spot = spots.find((n) => n.optionsWithIndex?.some((o) => /^net$/i.test(o.text))) ?? spots[0];
        }
        if (!spot) {
            log('fishing: no spot');
            return false;
        }
        const netOpt = spot.optionsWithIndex?.find((o) => /^net$/i.test(o.text));
        if (!netOpt) return false;

        const before = countMatching(sdk, /raw\s+/i);
        log(`fishing: net @ (${spot.x},${spot.z})`);
        await sdk.sendInteractNpc(spot.index, netOpt.opIndex);
        try {
            await sdk.waitForCondition(() => countMatching(sdk, /raw\s+/i) > before, 10000);
        } catch {
            await sleep(500);
        }
        return true;
    },
};

export const cookingSkill: SkillPlugin = {
    id: 'cooking',
    skills: ['Cooking'],
    kit: kitForTask('cooking'),
    shouldRun: (ctx) => countMatching(ctx.sdk, /raw\s+/i) > 0,
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log } = ctx;
        const raw = sdk.findInventoryItem(/raw\s+(shrimps?|anchovies|trout|salmon|beef|chicken|meat)/i);
        if (!raw) return false;

        let range =
            sdk.findNearbyLoc(/range|stove|fire/i) ??
            sdk.getNearbyLocs?.()?.find((l) => /range|cook/i.test(l.name));
        if (!range) {
            await walkToPoint(bot, sdk, TRAINING_AREAS.lumbridgeRange);
            range = sdk.findNearbyLoc(/range|stove/i);
        }
        if (!range) {
            log('cooking: no range');
            return false;
        }

        log(`cooking: ${raw.name} on ${range.name}`);
        const result = await bot.useItemOnLoc(raw, range);
        if (!result?.success) {
            log(`cooking: ${result?.message ?? 'failed'}`);
            return false;
        }
        await sleep(600);
        return true;
    },
};
