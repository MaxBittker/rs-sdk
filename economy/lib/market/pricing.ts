import type { MarketQuote } from '../../../sdk/market';
import type { Traits } from '../agent/types';

/** Best available estimate of what the item is worth right now. */
export function reference(q: MarketQuote): number {
    if (q.lastPrice) return q.lastPrice;
    if (q.bid && q.ask) return Math.round((q.bid + q.ask) / 2);
    return q.ask ?? q.bid ?? q.basePrice;
}

/**
 * Ask price for a seller. Joins just under the best ask (price/time priority makes
 * a 1gp undercut jump the queue), never crosses an existing bid unless the bid is
 * better, and never sits more than a trait-sized discount below the reference.
 */
export function sellPrice(q: MarketQuote, t: Traits): number {
    const ref = reference(q);
    let p = q.ask ? Math.min(q.ask - 1, Math.round(q.ask * (1 - t.undercut))) : Math.round(ref * (1 - t.undercut));
    if (q.bid && q.bid > p) p = q.bid;               // a better bid exists: take it
    return Math.max(1, Math.max(p, Math.floor(ref * 0.5))); // floor: no free-fall in thin books
}
