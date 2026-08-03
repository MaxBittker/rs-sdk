import type { SkillPlugin, SkillRunContext } from '../types';
import { kitForTask } from '../bank/kits';
import { TOOL_CATALOG, toolByPattern, toolForTask } from '../bank/tools';
import { nearestShop } from '../knowledge/world';
import { walkToPoint } from '../travel';
import { coinCount, hasItem, playerPos, sleep } from '../util';

function resolveNeed(ctx: SkillRunContext) {
    const want = ctx.memory.notes.find((n) => n.startsWith('need:'))?.slice(5);
    if (want) {
        const byId = TOOL_CATALOG.find((t) => t.id === want || t.buyName.toLowerCase() === want.toLowerCase());
        if (byId) return byId;
        try {
            const re = new RegExp(want, 'i');
            return toolByPattern(re) ?? TOOL_CATALOG.find((t) => re.test(t.buyName) || re.test(t.id));
        } catch {
            // ignore bad regex
        }
    }
    for (const tool of TOOL_CATALOG) {
        if (!hasItem(ctx.sdk, tool.pattern)) return tool;
    }
    return TOOL_CATALOG[0]!;
}

/**
 * Buy missing tools from known shops (Bob / general store), wiki nearest as fallback.
 */
export const supplySkill: SkillPlugin = {
    id: 'supply',
    skills: [],
    kit: kitForTask('supply'),
    async run(ctx: SkillRunContext): Promise<boolean> {
        const { sdk, bot, log, memory } = ctx;
        const tool = resolveNeed(ctx);

        if (hasItem(sdk, tool.pattern)) {
            log(`supply: already have ${tool.id}`);
            memory.notes = memory.notes.filter((n) => !n.startsWith('need:'));
            return true;
        }

        const coins = coinCount(sdk);
        if (coins < tool.minCoins) {
            log(`supply: need ${tool.minCoins}gp for ${tool.buyName}, have ${coins} — thieving first`);
            memory.notes = [
                ...memory.notes.filter((n) => !n.startsWith('need:')),
                `need:${tool.id}`,
            ];
            return false;
        }

        const pos = playerPos(sdk) ?? { x: 3222, z: 3218 };
        const wikiShop = nearestShop(new RegExp(tool.buyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), pos, {
            westOfGateOnly: true,
        });
        const dest = wikiShop?.point ?? tool.dest;
        log(`supply: buy ${tool.buyName} @ ${wikiShop?.shop.title ?? dest.label}`);
        await walkToPoint(bot, sdk, dest, wikiShop?.shop.title ?? dest.label);

        let opened = await bot.openShop(tool.shopNpc);
        if (!opened?.success && wikiShop?.shop.owner) {
            opened = await bot.openShop(new RegExp(wikiShop.shop.owner, 'i'));
        }
        if (!opened?.success) {
            opened = await bot.openShop(/bob|shop\s*keeper/i);
        }
        if (!opened?.success) {
            log(`supply: could not open shop for ${tool.buyName}`);
            return false;
        }

        const buyRe = new RegExp(tool.buyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const bought = await bot.buyFromShop(buyRe, 1);
        log(`supply: ${bought?.message ?? (bought?.success ? 'bought' : 'failed')}`);
        await bot.closeShop();
        await sleep(300);

        if (bought?.success || hasItem(sdk, tool.pattern)) {
            memory.notes = memory.notes.filter((n) => !n.startsWith('need:'));
            return true;
        }
        return false;
    },
};

/** Map planner supply label → tool id note. */
export function noteSupplyNeed(memory: SkillRunContext['memory'], label: string, item: RegExp): void {
    const tool =
        toolByPattern(item) ??
        toolForTask(label as any) ??
        TOOL_CATALOG.find((t) => label.includes(t.id) || t.tasks.includes(label as any));
    const id = tool?.id ?? item.source;
    memory.notes = [...memory.notes.filter((n) => !n.startsWith('need:')), `need:${id}`];
}
