import type { AgentCtx } from '../agent/types';
import { HUB } from './hub';

const ORE = /ore$/i;
const oreCounts = (ctx: AgentCtx) => {
    const m: Record<string, number> = {};
    for (const i of ctx.sdk.getInventory()) if (ORE.test(i.name)) m[i.name] = (m[i.name] ?? 0) + i.count;
    return m;
};
const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

/**
 * Mine any rock whose name matches `allowed` until `target` ore are carried or the
 * budget runs out. A rejected op means the rock is depleted or contested (it keeps its
 * name while depleted), so that rock goes on a short cooldown and the next nearest is tried.
 * Returns ore gained per ore name.
 */
export async function mineUntil(ctx: AgentCtx, allowed: RegExp, target: number, budgetMs = 5 * 60_000) {
    const { bot, sdk } = ctx;
    const t0 = Date.now();
    const start = oreCounts(ctx);
    const p = sdk.getState()?.player;
    if (!p || Math.hypot(p.worldX - HUB.seVarrockMine.x, p.worldZ - HUB.seVarrockMine.z) > 15) {
        const w = await bot.walkTo(HUB.seVarrockMine.x, HUB.seVarrockMine.z, 4);
        if (!w.success) throw new Error(`walk to mine: ${w.message}`);
    }
    const cooldown = new Map<string, number>(); // "x,z" -> ms timestamp until which we skip it
    let rejects = 0, timeouts = 0;
    while (total(oreCounts(ctx)) - total(start) < target && sdk.getInventory().length < 28 && Date.now() - t0 < budgetMs) {
        const now = Date.now();
        const rock = (sdk.getState()?.nearbyLocs ?? [])
            .filter(l => allowed.test(l.name) && l.reachable !== false && l.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
            .filter(l => (cooldown.get(`${l.x},${l.z}`) ?? 0) < now)
            .sort((a, b) => a.distance - b.distance)[0];
        if (!rock) { await sdk.waitForTicks(2); if (Date.now() - t0 > budgetMs) break; continue; }
        const r = await bot.mineRock(rock);
        if (r.success) { rejects = 0; continue; }
        if (r.reason === 'inventory_full') break;
        cooldown.set(`${rock.x},${rock.z}`, Date.now() + (r.reason === 'rejected' ? 8_000 : 15_000));
        if (r.reason === 'rejected') rejects++; else timeouts++;
    }
    const end = oreCounts(ctx);
    const gained: Record<string, number> = {};
    for (const [k, v] of Object.entries(end)) if (v - (start[k] ?? 0) > 0) gained[k] = v - (start[k] ?? 0);
    ctx.emit('mined', { allowed: String(allowed), gained, rejects, timeouts, ms: Date.now() - t0 });
    return gained;
}
