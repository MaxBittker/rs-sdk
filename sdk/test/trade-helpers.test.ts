import { describe, expect, test } from 'bun:test';
import { countInventoryById, countMatching, diffInventories, missingFromOffer, offerSatisfies, shortfall } from '../trade-helpers';
import type { TradeItem } from '../types';

const offer = (...items: Array<[string, number]>): TradeItem[] =>
    items.map(([name, count], slot) => ({ slot, id: slot + 100, name, count }));

describe('countMatching', () => {
    test('sums counts across matching slots', () => {
        const items = offer(['Guam leaf', 2], ['Harralander', 1], ['Coins', 500]);
        expect(countMatching(items, /leaf|harralander/i)).toBe(3);
    });

    test('string patterns are case-insensitive substrings, not regex', () => {
        const items = offer(['Steel arrow (p)', 10]);
        expect(countMatching(items, 'arrow (p)')).toBe(10);
        expect(countMatching(items, 'bronze')).toBe(0);
    });
});

describe('offerSatisfies', () => {
    test('empty or missing want accepts anything, including nothing', () => {
        expect(offerSatisfies([], [])).toBe(true);
        expect(offerSatisfies(undefined, offer(['Coins', 1]))).toBe(true);
    });

    test('requires every wanted item at the wanted amount', () => {
        const theirs = offer(['Lobster', 5], ['Coins', 100]);
        expect(offerSatisfies([{ item: 'lobster', amount: 5 }], theirs)).toBe(true);
        expect(offerSatisfies([{ item: 'lobster', amount: 6 }], theirs)).toBe(false);
        expect(offerSatisfies([{ item: 'lobster' }, { item: 'coins', amount: 100 }], theirs)).toBe(true);
        expect(offerSatisfies([{ item: 'shark' }], theirs)).toBe(false);
    });

    test('amount defaults to 1', () => {
        expect(offerSatisfies([{ item: 'coins' }], offer(['Coins', 1]))).toBe(true);
        expect(offerSatisfies([{ item: 'coins' }], [])).toBe(false);
    });
});

describe('missingFromOffer', () => {
    test('reports only the unmet specs', () => {
        const theirs = offer(['Lobster', 2]);
        const missing = missingFromOffer([{ item: 'lobster', amount: 2 }, { item: 'coins', amount: 50 }], theirs);
        expect(missing).toEqual([{ item: 'coins', amount: 50 }]);
    });
});

describe('inventory diffing', () => {
    test('aggregates split stacks by id', () => {
        const map = countInventoryById([
            { id: 1, name: 'Logs', count: 1 },
            { id: 1, name: 'Logs', count: 1 },
            { id: 2, name: 'Coins', count: 30 },
        ]);
        expect(map.get(1)).toEqual({ name: 'Logs', count: 2 });
        expect(map.get(2)).toEqual({ name: 'Coins', count: 30 });
    });

    test('reports gains and losses between snapshots', () => {
        const before = countInventoryById([
            { id: 1, name: 'Logs', count: 3 },
            { id: 2, name: 'Coins', count: 100 },
        ]);
        const after = countInventoryById([
            { id: 2, name: 'Coins', count: 350 },
            { id: 3, name: 'Lobster', count: 2 },
        ]);
        const { gained, lost } = diffInventories(before, after);
        expect(gained).toEqual([
            { slot: -1, id: 2, name: 'Coins', count: 250, amount: 250 },
            { slot: -1, id: 3, name: 'Lobster', count: 2, amount: 2 },
        ]);
        expect(lost).toEqual([{ slot: -1, id: 1, name: 'Logs', count: 3, amount: 3 }]);
    });
});

describe('shortfall', () => {
    const it = (id: number, name: string, count: number): TradeItem => ({ slot: -1, id, name, count, amount: count });

    test('lists what the final offer promised but the inventory never gained', () => {
        expect(shortfall([it(995, 'Coins', 250), it(379, 'Lobster', 1)], [it(995, 'Coins', 250)]))
            .toEqual([it(379, 'Lobster', 1)]);
        expect(shortfall([it(995, 'Coins', 250)], [it(995, 'Coins', 100)])).toEqual([it(995, 'Coins', 150)]);
    });

    test('empty when everything (or more) arrived', () => {
        expect(shortfall([it(995, 'Coins', 250)], [it(995, 'Coins', 250)])).toEqual([]);
        expect(shortfall([], [it(995, 'Coins', 5)])).toEqual([]);
    });
});
