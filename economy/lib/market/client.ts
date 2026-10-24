import { MarketClient, type MarketQuote } from '../../../sdk/market';
export const GAME_URL = process.env.ECON_GAME_URL ?? 'http://localhost:8888';
export const market = new MarketClient(GAME_URL);

const idCache = new Map<string, MarketQuote>();
/** Resolve an exact item name to its canonical (unnoted) quote. Cached for ids only; prices are re-read. */
export async function quoteByName(name: string): Promise<MarketQuote> {
    const key = name.toLowerCase();
    const cached = idCache.get(key);
    if (cached) return market.item(cached.id);
    const res = await market.items(name, { limit: 10 });
    const hit = res.items.find(i => i.name.toLowerCase() === key) ?? res.items[0];
    if (!hit) throw new Error(`market: no tradeable item matches "${name}"`);
    idCache.set(key, hit);
    return hit;
}
