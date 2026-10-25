import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketStore, MAX_GP, OFFER_SLOTS, type MarketAccount } from '../src/engine/market/MarketStore.js';
const COINS = 995,
    ITEM = 1511;
let stores: MarketStore[] = [];
afterEach(() => {
    for (const s of stores) s.db.close();
    stores = [];
});
function store(path = ':memory:') {
    const s = new MarketStore(path);
    stores.push(s);
    return s;
}
class Wallet {
    inv: Record<number, number>;
    capacity = MAX_GP;
    failSave = false;
    constructor(readonly owner: string, coins = 0, items = 0) {
        this.inv = { [COINS]: coins, [ITEM]: items };
    }
    account(): MarketAccount {
        const before = { ...this.inv };
        return {
            owner: this.owner,
            take: (id, n) => {
                if ((this.inv[id] ?? 0) < n) throw Error('Insufficient inventory');
                this.inv[id] -= n;
            },
            give: (id, n) => {
                const added = Math.min(n, Math.max(0, this.capacity - (this.inv[id] ?? 0)));
                this.inv[id] = (this.inv[id] ?? 0) + added;
                return added;
            },
            save: () => {
                if (this.failSave) throw Error('Disk failure');
                return new TextEncoder().encode(JSON.stringify(this.inv));
            },
            rollback: () => {
                this.inv = before;
            }
        };
    }
}
describe('Grand Exchange conservation and matching', () => {
    test('identical checkpoints skip writes without losing enrollment or rollback safety', () => {
        const s = store();
        const first = Uint8Array.of(0, 128, 255);
        const next = Uint8Array.of(0, 129, 255);
        const changes = () => (s.db.query('SELECT total_changes() AS n').get() as { n: number }).n;
        s.checkpoint('new', first);
        expect(s.saved('new')).toBeUndefined();
        s.checkpoint('new', first, true);
        const enrolled = changes();
        s.checkpoint('new', first.slice(), true);
        s.checkpoint('new', first.slice());
        expect(changes()).toBe(enrolled);
        expect(() => s.db.transaction(() => {
            s.checkpoint('new', next, true);
            throw new Error('rollback');
        }).immediate()).toThrow('rollback');
        expect(s.saved('new')).toEqual(first);
        s.checkpoint('new', next, true);
        expect(s.saved('new')).toEqual(next);
        s.checkpoint('new', first);
        expect(s.saved('new')).toEqual(first);
        s.checkpoint('new', new Uint8Array());
        expect(s.saved('new')).toEqual(new Uint8Array());
    });
    test('unmatched offers escrow real assets and never invent a counterparty', () => {
        const s = store(),
            a = new Wallet('buyer', 200);
        const o = s.place(a.account(), ITEM, 'buy', 10, 20, COINS);
        expect(a.inv[COINS]).toBe(0);
        expect(o.remaining).toBe(10);
        expect(o.items).toBe(0);
        expect(s.quote(ITEM).volume).toBe(0);
    });
    test('resting sell price, buyer refund, tax and partial collection', () => {
        const s = store(),
            a = new Wallet('seller', 0, 10),
            b = new Wallet('buyer', 200);
        const sell = s.place(a.account(), ITEM, 'sell', 10, 10, COINS);
        const buy = s.place(b.account(), ITEM, 'buy', 10, 20, COINS);
        expect(buy.items).toBe(10);
        expect(buy.coins).toBe(100);
        expect(s.offers(a.owner)[0]?.coins).toBe(95);
        expect(s.quote(ITEM).tax).toBe(5);
        s.collect(a.account(), sell.id, COINS);
        s.collect(b.account(), buy.id, COINS);
        expect(a.inv[ITEM] + b.inv[ITEM]).toBe(10);
        expect(a.inv[COINS] + b.inv[COINS] + 5).toBe(200);
        expect(s.offers(a.owner)).toEqual([]);
        expect(s.offers(b.owner)).toEqual([]);
        expect(() => s.collect(b.account(), buy.id, COINS)).toThrow();
        expect(b.inv[ITEM]).toBe(10);
    });
    test('incoming sell receives higher resting bid', () => {
        const s = store(),
            a = new Wallet('buyer', 200),
            b = new Wallet('seller', 0, 10);
        s.place(a.account(), ITEM, 'buy', 10, 20, COINS);
        const sell = s.place(b.account(), ITEM, 'sell', 10, 10, COINS);
        expect(sell.coins).toBe(190);
        expect(sell.tax).toBe(10);
        expect(s.quote(ITEM).lastPrice).toBe(20);
    });
    test('best price then FIFO, across multiple offers; self-match excluded', () => {
        const s = store(),
            a = new Wallet('a', 1000, 5),
            b = new Wallet('b', 0, 5),
            c = new Wallet('c', 0, 5),
            d = new Wallet('d', 0, 5);
        const self = s.place(a.account(), ITEM, 'sell', 5, 1, COINS);
        const high = s.place(b.account(), ITEM, 'sell', 5, 20, COINS);
        const older = s.place(c.account(), ITEM, 'sell', 5, 10, COINS);
        const newer = s.place(d.account(), ITEM, 'sell', 5, 10, COINS);
        s.place(a.account(), ITEM, 'buy', 7, 20, COINS);
        const remaining = (id: number) => s.db.query<{ remaining: number }, [number]>('SELECT remaining FROM offers WHERE id=?').get(id)?.remaining;
        expect(remaining(self.id)).toBe(5);
        expect(remaining(high.id)).toBe(5);
        expect(remaining(older.id)).toBe(0);
        expect(remaining(newer.id)).toBe(3);
    });
    test('partial cancel refunds only unfilled escrow and preserves completed assets', () => {
        const s = store(),
            b = new Wallet('b', 200),
            a = new Wallet('a', 0, 4);
        const buy = s.place(b.account(), ITEM, 'buy', 10, 20, COINS);
        s.place(a.account(), ITEM, 'sell', 4, 10, COINS);
        s.cancel(b.owner, buy.id);
        s.cancel(b.owner, buy.id);
        const o = s.offers(b.owner)[0]!;
        expect(o.items).toBe(4);
        expect(o.coins).toBe(120);
        expect(o.state).toBe('cancelled');
        s.collect(b.account(), buy.id, COINS);
        expect(b.inv[COINS]).toBe(120);
    });
    test('cancel sell returns unsold items; full backpack retains collection', () => {
        const s = store(),
            a = new Wallet('a', 0, 10);
        const o = s.place(a.account(), ITEM, 'sell', 10, 10, COINS);
        s.cancel(a.owner, o.id);
        a.capacity = 3;
        s.collect(a.account(), o.id, COINS);
        expect(a.inv[ITEM]).toBe(3);
        expect(s.offers(a.owner)[0]?.items).toBe(7);
        a.capacity = 100;
        s.collect(a.account(), o.id, COINS);
        expect(a.inv[ITEM]).toBe(10);
        expect(s.offers(a.owner)).toEqual([]);
    });
    test('all occupied slots include uncollected completed and cancelled offers', () => {
        const s = store(),
            a = new Wallet('a', 1000);
        for (let i = 0; i < OFFER_SLOTS; i++) s.place(a.account(), ITEM, 'buy', 1, 1, COINS);
        expect(() => s.place(a.account(), ITEM, 'buy', 1, 1, COINS)).toThrow('occupied');
        const first = s.offers(a.owner)[0]!;
        s.cancel(a.owner, first.id);
        expect(() => s.place(a.account(), ITEM, 'buy', 1, 1, COINS)).toThrow('occupied');
        s.collect(a.account(), first.id, COINS);
        expect(s.place(a.account(), ITEM, 'buy', 1, 1, COINS).slot).toBe(0);
    });
    test('foreign owners cannot cancel or collect', () => {
        const s = store(),
            a = new Wallet('a', 100),
            b = new Wallet('b');
        const o = s.place(a.account(), ITEM, 'buy', 1, 10, COINS);
        expect(() => s.cancel('b', o.id)).toThrow();
        expect(() => s.collect(b.account(), o.id, COINS)).toThrow();
    });
    test('empty and capacity-blocked collections never serialize the world', () => {
        const s = store(), a = new Wallet('a', 100);
        const o = s.place(a.account(), ITEM, 'buy', 1, 10, COINS);
        a.failSave = true;
        expect(s.collect(a.account(), o.id, COINS)).toEqual({ items: 0, coins: 0 });
        s.cancel(a.owner, o.id);
        a.capacity = 90;
        expect(s.collect(a.account(), o.id, COINS)).toEqual({ items: 0, coins: 0 });
        expect(s.offers(a.owner)[0]?.coins).toBe(10);
    });
    test('batch collection validates every owner and rolls all offers back on save failure', () => {
        const s = store(), a = new Wallet('a', 100), b = new Wallet('b', 100);
        const first = s.place(a.account(), ITEM, 'buy', 1, 10, COINS);
        const second = s.place(a.account(), ITEM, 'buy', 1, 20, COINS);
        const foreign = s.place(b.account(), ITEM, 'buy', 1, 30, COINS);
        for (const o of [first, second, foreign]) s.cancel(o.owner, o.id);
        expect(() => s.collectMany(a.account(), [{ id: first.id }, { id: foreign.id }], COINS)).toThrow('Offer not found');
        expect(() => s.collectMany(a.account(), [{ id: first.id }, { id: first.id }], COINS)).toThrow('Duplicate');
        a.failSave = true;
        const requests = [{ id: first.id }, { id: second.id }];
        expect(() => s.collectMany(a.account(), requests, COINS)).toThrow('Disk failure');
        expect(a.inv[COINS]).toBe(70);
        expect(s.offers(a.owner).map(o => o.coins)).toEqual([10, 20]);
        a.failSave = false;
        expect(s.collectMany(a.account(), requests, COINS)).toEqual({ items: 0, coins: 30 });
        expect(a.inv[COINS]).toBe(100);
        expect(s.offers(a.owner)).toEqual([]);
    });
    test('invalid totals and insufficient assets do not change ledger or inventory', () => {
        const s = store(),
            a = new Wallet('a', 100);
        for (const n of [0, -1, 1.5, NaN, Infinity, MAX_GP + 1]) expect(() => s.place(a.account(), ITEM, 'buy', n, 10, COINS)).toThrow();
        expect(() => s.place(a.account(), ITEM, 'buy', MAX_GP, 2, COINS)).toThrow();
        expect(() => s.place(a.account(), ITEM, 'buy', 11, 10, COINS)).toThrow();
        expect(s.offers(a.owner)).toEqual([]);
        expect(a.inv[COINS]).toBe(100);
    });
    test('partial fills round tax cumulatively: twenty 1 gp trades burn 1 gp', () => {
        const s = store(),
            a = new Wallet('a', 0, 20);
        s.place(a.account(), ITEM, 'sell', 20, 1, COINS);
        for (let i = 0; i < 20; i++) s.place(new Wallet('buyer' + i, 1).account(), ITEM, 'buy', 1, 1, COINS);
        expect(s.offers(a.owner)[0]?.coins).toBe(19);
        expect(s.quote(ITEM).tax).toBe(1);
    });
    test('serialization failure rolls back matching, tax, escrow and snapshots', () => {
        const s = store(),
            a = new Wallet('a', 0, 10),
            b = new Wallet('b', 100);
        s.place(a.account(), ITEM, 'sell', 10, 10, COINS);
        b.failSave = true;
        expect(() => s.place(b.account(), ITEM, 'buy', 10, 10, COINS)).toThrow('Disk');
        expect(b.inv[COINS]).toBe(100);
        expect(s.offers(a.owner)[0]?.remaining).toBe(10);
        expect(s.quote(ITEM).volume).toBe(0);
        expect(s.saved(b.owner)).toBeUndefined();
    });
    test('failed collection serialization restores claims and inventory', () => {
        const s = store(),
            a = new Wallet('a', 100);
        const o = s.place(a.account(), ITEM, 'buy', 10, 10, COINS);
        s.cancel(a.owner, o.id);
        a.failSave = true;
        expect(() => s.collect(a.account(), o.id, COINS)).toThrow();
        expect(a.inv[COINS]).toBe(0);
        expect(s.offers(a.owner)[0]?.coins).toBe(100);
    });
    test('restart restores market and matching player checkpoint, then latest normal save', () => {
        const dir = mkdtempSync(join(tmpdir(), 'rs-ge-')),
            path = join(dir, 'market.sqlite');
        let s = new MarketStore(path);
        try {
            const a = new Wallet('a', 100);
            const o = s.place(a.account(), ITEM, 'buy', 10, 10, COINS);
            s.db.close();
            s = new MarketStore(path);
            expect(JSON.parse(new TextDecoder().decode(s.saved('a')))[COINS]).toBe(0);
            expect(s.offers('a')[0]?.id).toBe(o.id);
            s.cancel('a', o.id);
            s.collect(a.account(), o.id, COINS);
            a.inv[COINS] = 80;
            s.checkpoint('a', a.account().save());
            s.db.close();
            s = new MarketStore(path);
            expect(JSON.parse(new TextDecoder().decode(s.saved('a')))[COINS]).toBe(80);
            expect(s.offers('a')).toEqual([]);
        } finally {
            s.db.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });
    test('history aggregates only real fills with quantity-weighted prices', () => {
        const s = store(),
            a = new Wallet('a', 0, 4),
            b = new Wallet('b', 100);
        s.place(a.account(), ITEM, 'sell', 1, 10, COINS);
        s.place(a.account(), ITEM, 'sell', 3, 20, COINS);
        s.place(b.account(), ITEM, 'buy', 4, 25, COINS);
        const h = s.history(ITEM, 0, Date.now() + 1, 86400000);
        expect(h).toHaveLength(1);
        expect(h[0]?.volume).toBe(4);
        expect(h[0]?.vwap).toBe(17.5);
        expect(h[0]?.low).toBe(10);
        expect(h[0]?.high).toBe(20);
    });
    test('SQLite write failure rolls back real escrow and all matching effects', () => {
        const s = store(),
            a = new Wallet('a', 0, 10),
            b = new Wallet('b', 100);
        s.place(a.account(), ITEM, 'sell', 10, 10, COINS);
        s.db.exec("CREATE TRIGGER fail_trade BEFORE INSERT ON trades BEGIN SELECT RAISE(ABORT, 'simulated I/O failure'); END");
        expect(() => s.place(b.account(), ITEM, 'buy', 10, 10, COINS)).toThrow('simulated');
        expect(b.inv[COINS]).toBe(100);
        expect(s.offers(a.owner)[0]?.remaining).toBe(10);
        expect(s.quote(ITEM).tax).toBe(0);
        expect(s.offers(b.owner)).toEqual([]);
    });
    test('mixed matching and cancellation conserves all assets over many offers', () => {
        const s = store(),
            wallets = Array.from({ length: 8 }, (_, i) => new Wallet('p' + i, 10000, 100));
        let seed = 321;
        const random = (max: number) => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed % max;
        };
        for (let i = 0; i < 160; i++) {
            const w = wallets[random(wallets.length)]!;
            for (const o of s.offers(w.owner)) {
                if (o.state !== 'open' || random(3) === 0) {
                    s.cancel(w.owner, o.id);
                    s.collect(w.account(), o.id, COINS);
                }
            }
            if (s.offers(w.owner).length < OFFER_SLOTS) s.place(w.account(), ITEM, random(2) ? 'buy' : 'sell', 1 + random(4), 10 + random(15), COINS);
        }
        for (const w of wallets)
            for (const o of s.offers(w.owner)) {
                s.cancel(w.owner, o.id);
                s.collect(w.account(), o.id, COINS);
            }
        expect(s.quote(ITEM).volume).toBeGreaterThan(0);
        expect(wallets.reduce((n, w) => n + w.inv[ITEM], 0)).toBe(800);
        expect(wallets.reduce((n, w) => n + w.inv[COINS], 0) + s.quote(ITEM).tax).toBe(80000);
    });
});

describe('Market overview metrics', () => {
    test('sell recency and value track remaining open offers through fills and cancellation', () => {
        const s = store();
        const first = s.place(new Wallet('older', 0, 5).account(), ITEM, 'sell', 5, 100, COINS);
        const second = s.place(new Wallet('newer', 0, 3).account(), ITEM, 'sell', 3, 200, COINS);
        s.db.query('UPDATE offers SET created=? WHERE id=?').run(1000, first.id);
        s.db.query('UPDATE offers SET created=? WHERE id=?').run(2000, second.id);
        const row = () => s.overview(0, Date.now() + 1)[0]!;
        expect(row().lastSellAt).toBe(2000);
        expect(row().sellValue).toBe(1100);
        s.place(new Wallet('buyer', 200).account(), ITEM, 'buy', 2, 100, COINS);
        expect(row().sellQuantity).toBe(6);
        expect(row().sellValue).toBe(900);
        expect(row().lastSellAt).toBe(2000);
        s.cancel('newer', second.id);
        expect(row().lastSellAt).toBe(1000);
        expect(row().sellValue).toBe(300);
        s.place(new Wallet('buyer2', 300).account(), ITEM, 'buy', 3, 100, COINS);
        expect(row().sellQuantity).toBe(0);
        expect(row().sellValue).toBe(0);
        expect(row().lastSellAt).toBeNull();
    });
    test('buy value sums unfilled commitments at each bid price and drops after fills and cancellations', () => {
        const s = store();
        const a = new Wallet('a', 1000),
            b = new Wallet('b', 150);
        const first = s.place(a.account(), ITEM, 'buy', 10, 100, COINS);
        s.place(b.account(), ITEM, 'buy', 3, 50, COINS);
        s.place(new Wallet('expensive-sell', 0, 1).account(), ITEM, 'sell', 1, 1000000, COINS);
        const value = () => {
            const row = s.overview()[0]!;
            expect(row.buyValue).toBe(s.quote(ITEM).buyValue);
            return row.buyValue;
        };
        expect(s.quote(ITEM).lastPrice).toBeNull();
        expect(value()).toBe(1150);
        s.place(new Wallet('seller', 0, 4).account(), ITEM, 'sell', 4, 90, COINS);
        expect(value()).toBe(750);
        s.cancel(a.owner, first.id);
        expect(value()).toBe(150);
        s.place(new Wallet('seller2', 0, 3).account(), ITEM, 'sell', 3, 50, COINS);
        expect(value()).toBe(0);
    });
    test('period boundaries, weighted totals, price changes and listed supply use real ledger values', () => {
        const s = store();
        const insert = s.db.query('INSERT INTO trades(item,buy_offer,sell_offer,quantity,price,gross,tax,time) VALUES(?,1,2,?,?,?,?,?)');
        insert.run(ITEM, 10, 100, 1000, 50, 999);
        insert.run(ITEM, 2, 120, 240, 12, 1000);
        insert.run(ITEM, 3, 150, 450, 22, 1500);
        insert.run(ITEM, 1, 160, 160, 8, 1500); // Same-time trades use newest ID.
        insert.run(ITEM, 1, 999, 999, 49, 2000); // Excluded upper boundary.
        s.place(new Wallet('seller', 0, 7).account(), ITEM, 'sell', 7, 200, COINS);
        s.place(new Wallet('bidder', 200).account(), ITEM, 'buy', 2, 50, COINS);
        const row = s.overview(1000, 2000)[0]!;
        expect(row.volume).toBe(6);
        expect(row.gross).toBe(850);
        expect(row.vwap).toBeCloseTo(850 / 6);
        expect(row.trades).toBe(3);
        expect(row.referencePrice).toBe(100);
        expect(row.lastPrice).toBe(160);
        expect(row.lastTradeAt).toBe(1500);
        expect(row.change).toBe(60);
        expect(row.changePercent).toBe(60);
        expect(row.marketCap).toBe(1120); // Seven listed sells, excluding buy demand.
        expect(row.ask).toBe(200);
        expect(row.bid).toBe(50);
        expect(row.buyQuantity).toBe(2);
    });
    test('newly traded and untraded items do not fabricate comparison prices or market cap', () => {
        const s = store();
        s.place(new Wallet('seller', 0, 10).account(), ITEM, 'sell', 10, 100, COINS);
        let row = s.overview(0, Date.now() + 1)[0]!;
        expect(row.marketCap).toBeNull();
        expect(row.lastPrice).toBeNull();
        expect(row.changePercent).toBeNull();
        s.place(new Wallet('buyer', 500).account(), ITEM, 'buy', 5, 100, COINS);
        row = s.overview(0, Date.now() + 1)[0]!;
        expect(row.changePercent).toBeNull();
        expect(row.volume).toBe(5);
        expect(row.marketCap).toBe(500);
        expect(s.overview(Date.now() + 1, Date.now() + 100)[0]!.volume).toBe(0);
    });
});
