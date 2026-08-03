import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { TRAINING_AREAS } from '../knowledge/wiki';
import { walkToPoint } from '../travel';
import { countMatching, hasItem, playerPos, sleep } from '../util';

export const fletchingSkill: SkillPlugin = {
    id: 'fletching',
    skills: ['Fletching'],
    kit: kitForTask('fletching'),
    shouldRun: (ctx) => hasItem(ctx.sdk, /^knife$/i) && countMatching(ctx.sdk, /logs?/i) > 0,
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log, levels } = ctx;
        if (!hasItem(sdk, /^knife$/i) || countMatching(sdk, /logs?/i) === 0) {
            log('fletching: need knife + logs');
            return false;
        }
        const before = countMatching(sdk, /logs?/i);
        // Below 10 fletching: arrow shafts; otherwise shortbows sell better.
        const product = (levels.Fletching ?? 1) < 10 ? 'arrow shafts' : undefined;
        let processed = 0;
        // Session: clear most logs in one go.
        while (countMatching(sdk, /logs?/i) > 0 && processed < 20) {
            const logsBefore = countMatching(sdk, /logs?/i);
            log(`fletching: fletch logs${product ? ` → ${product}` : ''} (${logsBefore} left)`);
            const result = await bot.fletchLogs(product);
            if (!result?.success) {
                log(`fletching: ${result?.message ?? 'failed'}`);
                await sleep(400);
                break;
            }
            try {
                await sdk.waitForCondition(() => countMatching(sdk, /logs?/i) < logsBefore, 10000);
            } catch {
                break;
            }
            if (countMatching(sdk, /logs?/i) >= logsBefore) break;
            processed += 1;
        }
        return processed > 0 || countMatching(sdk, /bow|shaft/i) > 0;
    },
};

export const sellingSkill: SkillPlugin = {
    id: 'selling',
    skills: [],
    kit: kitForTask('selling'),
    shouldRun: (ctx) => countMatching(ctx.sdk, /bow/i) > 0,
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log } = ctx;
        const bow = sdk.findInventoryItem(/^(?:short|long)?\s*bow$/i) ?? sdk.findInventoryItem(/bow/i);
        if (!bow) return false;

        const pos = playerPos(sdk);
        const shopOpen = sdk.getState()?.shop?.isOpen;
        if (!shopOpen) {
            const nearby = sdk.findNearbyNpc(/shop\s*keeper|shopkeeper/i);
            if (!nearby) {
                await walkToPoint(bot, sdk, TRAINING_AREAS.generalStore, 'general store');
            }
            const opened = await bot.openShop(/shop\s*keeper|shopkeeper/i);
            if (!opened?.success) {
                log(`selling: ${opened?.message ?? 'no shop'}`);
                return false;
            }
        }

        // Prefer selling unstrung/strung bows — skip shafts (often 0gp overstocked).
        let soldAny = false;
        for (const item of sdk.getInventory() ?? []) {
            if (!/bow/i.test(item.name) || /shaft/i.test(item.name)) continue;
            const sold = await bot.sellToShop(item, 'all');
            log(`selling: ${item.name} → ${sold?.message ?? (sold?.success ? 'ok' : 'fail')}`);
            if (sold?.success) soldAny = true;
            await sleep(200);
        }
        // Shafts last if nothing else
        if (!soldAny) {
            const shafts = sdk.findInventoryItem(/shaft/i);
            if (shafts) {
                const sold = await bot.sellToShop(shafts, 'all');
                log(`selling: shafts → ${sold?.message ?? 'done'}`);
                soldAny = !!sold?.success;
            }
        }

        await bot.closeShop();
        await sleep(200);
        return soldAny || countMatching(sdk, /bow/i) === 0;
    },
};
