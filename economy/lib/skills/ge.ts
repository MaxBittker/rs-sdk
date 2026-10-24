import type { AgentCtx } from '../agent/types';
import { quoteByName } from '../market/client';
import { sellPrice } from '../market/pricing';

/**
 * Sell everything the bot carries of `itemName` (noted or not) in one GE visit,
 * then collect. One trip = one open + N offers + one collectGE, which keeps the
 * server's per-GE-operation checkpoint cost down.
 * Returns coins gained by this visit's collection (fills that already happened).
 */
export async function sellAll(ctx: AgentCtx, itemName: string) {
    const { bot, sdk } = ctx;
    const q = await quoteByName(itemName);
    const carried = sdk.getInventory()
        .filter(i => i.name.toLowerCase() === itemName.toLowerCase())
        .reduce((a, i) => a + i.count, 0);
    if (carried === 0) { ctx.emit('ge_skip', { item: itemName, why: 'none carried' }); return 0; }

    const opened = await bot.openGE();
    if (!opened.success) throw new Error(`openGE: ${opened.reason ?? ''} ${opened.message}`);

    const price = sellPrice(q, ctx.traits);
    const placed = await bot.placeGEOffer({ item: q.id, side: 'sell', quantity: carried, price });
    ctx.emit('ge_offer', {
        item: itemName, qty: carried, price, ok: placed.success,
        bid: q.bid, ask: q.ask, last: q.lastPrice, base: q.basePrice,
        reason: placed.reason, outcome: placed.outcome,
    });
    if (!placed.success && placed.outcome === 'unknown') throw new Error('offer outcome unknown; inspect GE state before retry');

    const coinsBefore = coins(ctx);
    const col = await bot.collectGE();
    const gained = coins(ctx) - coinsBefore;
    ctx.emit('ge_collect', { ok: col.success, coins: gained, items: col.items ?? 0 });
    await bot.closeInterface();
    return gained;
}

export const coins = (ctx: AgentCtx) =>
    ctx.sdk.getInventory().filter(i => /^coins$/i.test(i.name)).reduce((a, i) => a + i.count, 0);

/** Collect fills from earlier offers without placing anything new. */
export async function collectOnly(ctx: AgentCtx) {
    const opened = await ctx.bot.openGE();
    if (!opened.success) throw new Error(`openGE: ${opened.message}`);
    const before = coins(ctx);
    await ctx.bot.collectGE();
    const gained = coins(ctx) - before;
    ctx.emit('ge_collect', { coins: gained });
    await ctx.bot.closeInterface();
    return gained;
}
