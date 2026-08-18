// Bot SDK - Trade helpers
// Pure functions for player-to-player trade logic, kept side-effect free so
// they can be unit tested without a connected client.

import type { TradeItem, TradeItemSpec } from './types';

/** Total count of items in an offer whose name matches the spec pattern. */
export function countMatching(offer: TradeItem[], pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(escapeRegExp(pattern), 'i') : pattern;
    let total = 0;
    for (const item of offer) {
        if (regex.test(item.name)) total += item.count;
    }
    return total;
}

/**
 * True when the offer contains every wanted item at (at least) the wanted
 * amount. An empty/undefined want list is satisfied by any offer, including
 * an empty one — the pure-gift case.
 */
export function offerSatisfies(want: TradeItemSpec[] | undefined, offer: TradeItem[]): boolean {
    if (!want || want.length === 0) return true;
    return want.every(spec => countMatching(offer, spec.item) >= (spec.amount ?? 1));
}

/**
 * The wanted specs the offer does not (yet) meet, for failure messages.
 */
export function missingFromOffer(want: TradeItemSpec[] | undefined, offer: TradeItem[]): TradeItemSpec[] {
    if (!want) return [];
    return want.filter(spec => countMatching(offer, spec.item) < (spec.amount ?? 1));
}

/**
 * Diff two inventory snapshots into net gains and losses by item id.
 * Snapshots are (id -> {name, count}) maps built with countInventoryById.
 */
export function diffInventories(
    before: Map<number, { name: string; count: number }>,
    after: Map<number, { name: string; count: number }>
): { gained: TradeItem[]; lost: TradeItem[] } {
    const gained: TradeItem[] = [];
    const lost: TradeItem[] = [];
    const ids = new Set([...before.keys(), ...after.keys()]);
    for (const id of ids) {
        const b = before.get(id);
        const a = after.get(id);
        const delta = (a?.count ?? 0) - (b?.count ?? 0);
        const name = a?.name ?? b?.name ?? 'Unknown';
        if (delta > 0) gained.push({ slot: -1, id, name, count: delta, amount: delta });
        else if (delta < 0) lost.push({ slot: -1, id, name, count: -delta, amount: -delta });
    }
    return { gained, lost };
}

/** Items (by id) in `expected` that `received` falls short of. */
export function shortfall(expected: TradeItem[], received: TradeItem[]): TradeItem[] {
    const got = new Map<number, number>();
    for (const item of received) got.set(item.id, (got.get(item.id) ?? 0) + item.count);
    const out: TradeItem[] = [];
    const seen = new Map<number, TradeItem>();
    for (const item of expected) {
        const existing = seen.get(item.id);
        if (existing) existing.count += item.count;
        else seen.set(item.id, { slot: -1, id: item.id, name: item.name, count: item.count });
    }
    for (const item of seen.values()) {
        const missing = item.count - (got.get(item.id) ?? 0);
        if (missing > 0) out.push({ ...item, count: missing, amount: missing });
    }
    return out;
}

/** Aggregate an inventory-like item list into an (id -> {name, count}) map. */
export function countInventoryById(items: Array<{ id: number; name: string; count: number }>): Map<number, { name: string; count: number }> {
    const map = new Map<number, { name: string; count: number }>();
    for (const item of items) {
        const existing = map.get(item.id);
        if (existing) existing.count += item.count;
        else map.set(item.id, { name: item.name, count: item.count });
    }
    return map;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
