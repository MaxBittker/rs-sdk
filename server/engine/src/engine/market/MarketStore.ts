import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import Environment from '#/util/Environment.js';
import { dirname } from 'node:path';

export const MAX_GP = 2_147_483_647;
export const OFFER_SLOTS = 12;
export type Side = 'buy' | 'sell';
export type MarketOverview = {
    item: number;
    bid: number | null;
    ask: number | null;
    buyQuantity: number;
    buyValue: number;
    sellQuantity: number;
    sellValue: number;
    lastSellAt: number | null;
    volume: number;
    gross: number;
    tax: number;
    trades: number;
    lastPrice: number | null;
    lastTradeAt: number | null;
    referencePrice: number | null;
    vwap: number | null;
    change: number | null;
    changePercent: number | null;
    marketCap: number | null;
};
export type Offer = {
    id: number;
    owner: string;
    slot: number;
    item: number;
    side: Side;
    quantity: number;
    price: number;
    remaining: number;
    filled: number;
    state: 'open' | 'completed' | 'cancelled';
    items: number;
    coins: number;
    gross: number;
    tax: number;
    created: number;
};
export interface MarketAccount {
    owner: string;
    /** Inventory only. Must remove all requested units or throw. */
    take(item: number, quantity: number): void;
    /** Return the number actually added (space/stack limits may prevent all). */
    give(item: number, quantity: number): number;
    save(): Uint8Array;
    /** Restore in-memory inventory if SQLite or serialization fails. */
    rollback(): void;
}
export function positive(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 1 || value > MAX_GP) throw new Error(`${label} must be a whole number from 1 to ${MAX_GP}.`);
    return value;
}

/** Single-world synchronous ledger: no network or await inside a transaction. */
export class MarketStore {
    readonly db: Database;
    constructor(path: string) {
        if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
        this.db = new Database(path, { create: true, strict: true });
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
            CREATE TABLE IF NOT EXISTS accounts(owner TEXT PRIMARY KEY, save BLOB NOT NULL);
            CREATE TABLE IF NOT EXISTS offers(
                id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, slot INTEGER NOT NULL,
                item INTEGER NOT NULL, side TEXT NOT NULL CHECK(side IN ('buy','sell')),
                quantity INTEGER NOT NULL, price INTEGER NOT NULL, remaining INTEGER NOT NULL,
                filled INTEGER NOT NULL DEFAULT 0,
                state TEXT NOT NULL DEFAULT 'open', items INTEGER NOT NULL DEFAULT 0,
                coins INTEGER NOT NULL DEFAULT 0, gross INTEGER NOT NULL DEFAULT 0,
                tax INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
                CHECK(remaining>=0 AND items>=0 AND coins>=0));
            CREATE UNIQUE INDEX IF NOT EXISTS occupied_slot ON offers(owner,slot) WHERE slot>=0;
            CREATE INDEX IF NOT EXISTS book ON offers(item,side,state,price,id);
            CREATE TABLE IF NOT EXISTS trades(
                id INTEGER PRIMARY KEY AUTOINCREMENT, item INTEGER NOT NULL, buy_offer INTEGER NOT NULL,
                sell_offer INTEGER NOT NULL, quantity INTEGER NOT NULL, price INTEGER NOT NULL,
                gross INTEGER NOT NULL, tax INTEGER NOT NULL, time INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS trade_history ON trades(item,time,id);`);
    }
    offers(owner: string): Offer[] {
        return this.db.query<Offer, [string]>('SELECT * FROM offers WHERE owner=? AND slot>=0 ORDER BY slot').all(owner);
    }
    private owned(owner: string, id: number): Offer {
        const row = this.db.query<Offer, [string, number]>('SELECT * FROM offers WHERE owner=? AND id=? AND slot>=0').get(owner, id);
        if (!row) throw new Error('Offer not found.');
        return row;
    }
    private update(o: Offer) {
        this.db.query('UPDATE offers SET remaining=?,state=?,items=?,coins=?,gross=?,tax=?,slot=?,filled=? WHERE id=?').run(o.remaining, o.state, o.items, o.coins, o.gross, o.tax, o.slot, o.filled, o.id);
    }
    checkpoint(owner: string, save: Uint8Array, enroll = false) {
        // Repeated checkpoints in one tick often contain identical bytes. Compare in
        // SQLite (not a JS cache) so rollback and nested GE transactions remain safe.
        if (enroll) this.db.query('INSERT INTO accounts VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET save=excluded.save WHERE accounts.save != excluded.save').run(owner, save);
        else this.db.query('UPDATE accounts SET save=? WHERE owner=? AND save != ?').run(save, owner, save);
    }
    saved(owner: string): Uint8Array | undefined {
        return this.db.query<{ save: Uint8Array }, [string]>('SELECT save FROM accounts WHERE owner=?').get(owner)?.save;
    }
    private transfer<T>(account: MarketAccount, action: () => T, needsCheckpoint = () => true): T {
        try {
            let value!: T;
            this.db
                .transaction(() => {
                    const result = action();
                    if (needsCheckpoint()) this.checkpoint(account.owner, account.save(), true);
                    value = result;
                })
                .immediate();
            return value;
        } catch (error) {
            account.rollback();
            throw error;
        }
    }
    place(account: MarketAccount, item: number, side: Side, quantity: number, price: number, coinsId: number, preferredSlot?: number): Offer {
        positive(item, 'Item');
        positive(quantity, 'Quantity');
        positive(price, 'Price');
        if (side !== 'buy' && side !== 'sell') throw new Error('Invalid offer side.');
        // Also cap sells so price improvement never overflows a player's collection stack.
        if (quantity * price > MAX_GP) throw new Error('Offer total exceeds the coin stack limit.');
        return this.transfer(account, () => {
            const slots = new Set(this.offers(account.owner).map(o => o.slot));
            if (preferredSlot !== undefined && (!Number.isInteger(preferredSlot) || preferredSlot < 0 || preferredSlot >= OFFER_SLOTS || slots.has(preferredSlot))) {
                throw new Error('That offer slot is no longer empty.');
            }
            const slot = preferredSlot ?? Array.from({ length: OFFER_SLOTS }, (_, i) => i).find(i => !slots.has(i));
            if (slot === undefined) throw new Error('All offer slots are occupied. Collect a finished offer first.');
            account.take(side === 'buy' ? coinsId : item, side === 'buy' ? quantity * price : quantity);
            const inserted = this.db.query('INSERT INTO offers(owner,slot,item,side,quantity,price,remaining,created) VALUES(?,?,?,?,?,?,?,?)').run(account.owner, slot, item, side, quantity, price, quantity, Date.now());
            const incoming = this.owned(account.owner, Number(inserted.lastInsertRowid));
            const matches = this.db
                .query<Offer, [number, string, string, number]>(
                    `SELECT * FROM offers
                WHERE item=? AND side!=? AND owner!=? AND state='open' AND price ${side === 'buy' ? '<=' : '>='} ?
                ORDER BY price ${side === 'buy' ? 'ASC' : 'DESC'},id ASC`
                )
                .all(item, side, account.owner, price);
            for (const resting of matches) {
                if (!incoming.remaining) break;
                const buy = side === 'buy' ? incoming : resting;
                const sell = side === 'sell' ? incoming : resting;
                const executionPrice = resting.price;
                // Bound gross proceeds across the entire sell offer, even after collections.
                const count = Math.min(buy.remaining, sell.remaining, Math.floor((MAX_GP - sell.gross) / executionPrice));
                if (!count) continue;
                const gross = count * executionPrice;
                // Cumulative rounding per sell offer prevents partial-fill fragmentation avoiding tax.
                const tax = Math.floor((sell.gross + gross) / 20) - sell.tax;
                buy.remaining -= count;
                sell.remaining -= count;
                buy.filled += count;
                sell.filled += count;
                buy.items += count;
                buy.coins += count * (buy.price - executionPrice);
                sell.coins += gross - tax;
                sell.gross += gross;
                sell.tax += tax;
                buy.gross += gross;
                if (!buy.remaining) buy.state = 'completed';
                if (!sell.remaining) sell.state = 'completed';
                this.update(resting);
                this.db.query('INSERT INTO trades(item,buy_offer,sell_offer,quantity,price,gross,tax,time) VALUES(?,?,?,?,?,?,?,?)').run(item, buy.id, sell.id, count, executionPrice, gross, tax, Date.now());
            }
            this.update(incoming);
            return incoming;
        });
    }
    cancel(owner: string, id: number): void {
        this.db
            .transaction(() => {
                const o = this.owned(owner, id);
                if (o.state !== 'open') return;
                if (o.side === 'buy') o.coins += o.remaining * o.price;
                else o.items += o.remaining;
                o.remaining = 0;
                o.state = 'cancelled';
                this.update(o);
            })
            .immediate();
    }
    collect(account: MarketAccount, id: number, coinsId: number, itemId?: number): { items: number; coins: number } {
        return this.collectMany(account, [{ id, itemId }], coinsId);
    }
    /** One inventory snapshot and durable transaction for all requested claims. */
    collectMany(account: MarketAccount, requests: readonly { id: number; itemId?: number }[], coinsId: number): { items: number; coins: number } {
        if (new Set(requests.map(r => r.id)).size !== requests.length) throw new Error('Duplicate collection offer.');
        // Synchronous single-world access: no action can interleave with this preflight.
        const offers = requests.map(request => ({ ...request, offer: this.owned(account.owner, request.id) }));
        const result = { items: 0, coins: 0 };
        if (offers.every(({ offer }) => !offer.items && !offer.coins && offer.state === 'open')) return result;
        return this.transfer(account, () => {
            for (const { offer: o, itemId } of offers) {
                const items = o.items ? account.give(itemId ?? o.item, o.items) : 0;
                const coins = o.coins ? account.give(coinsId, o.coins) : 0;
                if (!Number.isInteger(items) || items < 0 || items > o.items || !Number.isInteger(coins) || coins < 0 || coins > o.coins) throw new Error('Invalid inventory transfer.');
                o.items -= items;
                o.coins -= coins;
                if (o.state !== 'open' && !o.items && !o.coins) o.slot = -1;
                if (items || coins || o.slot === -1) this.update(o);
                result.items += items;
                result.coins += coins;
            }
            return result;
        }, () => result.items > 0 || result.coins > 0);
    }
    quote(item: number, since = Date.now() - 86_400_000) {
        const book = this.db
            .query<{ bid: number | null; ask: number | null; buyQuantity: number; buyValue: number; sellQuantity: number; sellValue: number; lastSellAt: number | null }, [number]>(
                `SELECT
            MAX(CASE WHEN side='buy' THEN price END) bid, MIN(CASE WHEN side='sell' THEN price END) ask,
            COALESCE(SUM(CASE WHEN side='buy' THEN remaining ELSE 0 END),0) buyQuantity,
            COALESCE(SUM(CASE WHEN side='buy' THEN remaining * price ELSE 0 END),0) buyValue,
            COALESCE(SUM(CASE WHEN side='sell' THEN remaining ELSE 0 END),0) sellQuantity,
            COALESCE(SUM(CASE WHEN side='sell' THEN remaining * price ELSE 0 END),0) sellValue,
            MAX(CASE WHEN side='sell' AND remaining>0 THEN created END) lastSellAt
            FROM offers WHERE item=? AND state='open'`
            )
            .get(item)!;
        const stats = this.db
            .query<{ volume: number; gross: number; tax: number; trades: number }, [number, number]>(
                `SELECT COALESCE(SUM(quantity),0) volume,
            COALESCE(SUM(gross),0) gross, COALESCE(SUM(tax),0) tax, COUNT(*) trades FROM trades WHERE item=? AND time>=?`
            )
            .get(item, since)!;
        const last = this.db.query<{ price: number; time: number }, [number]>('SELECT price,time FROM trades WHERE item=? ORDER BY time DESC,id DESC LIMIT 1').get(item);
        return { item, ...book, ...stats, lastPrice: last?.price ?? null, lastTradeAt: last?.time ?? null, vwap: stats.volume ? stats.gross / stats.volume : null };
    }
    history(item: number, from: number, to: number, interval: number) {
        return this.db
            .query<{ time: number; volume: number; gross: number; tax: number; low: number; high: number; vwap: number; trades: number }, [number, number, number, number, number]>(
                `SELECT CAST(time / ? AS INTEGER) * ? time,
            SUM(quantity) volume,SUM(gross) gross,SUM(tax) tax,MIN(price) low,MAX(price) high,
            CAST(SUM(gross) AS REAL)/SUM(quantity) vwap,COUNT(*) trades
            FROM trades WHERE item=? AND time>=? AND time<? GROUP BY 1 ORDER BY 1`
            )
            .all(interval, interval, item, from, to);
    }
    /** Read the whole market in one query, before ranking/pagination. No player identities leave the ledger. */
    overview(since = Date.now() - 86_400_000, now = Date.now()): MarketOverview[] {
        const rows = this.db
            .query<Omit<MarketOverview, 'change' | 'changePercent' | 'marketCap' | 'vwap'>, [number, number, number, number, number]>(
                `
            WITH activity AS (SELECT DISTINCT item FROM trades UNION SELECT DISTINCT item FROM offers WHERE state='open'),
            book AS (SELECT item,
                MAX(CASE WHEN side='buy' THEN price END) bid, MIN(CASE WHEN side='sell' THEN price END) ask,
                SUM(CASE WHEN side='buy' THEN remaining ELSE 0 END) buyQuantity,
                SUM(CASE WHEN side='buy' THEN remaining * price ELSE 0 END) buyValue,
                SUM(CASE WHEN side='sell' THEN remaining ELSE 0 END) sellQuantity,
                SUM(CASE WHEN side='sell' THEN remaining * price ELSE 0 END) sellValue,
                MAX(CASE WHEN side='sell' AND remaining>0 THEN created END) lastSellAt
                FROM offers WHERE state='open' GROUP BY item),
            period AS (SELECT item,SUM(quantity) volume,SUM(gross) gross,SUM(tax) tax,COUNT(*) trades
                FROM trades WHERE time>=? AND time<? GROUP BY item)
            SELECT a.item,b.bid,b.ask,COALESCE(b.buyQuantity,0) buyQuantity,COALESCE(b.sellQuantity,0) sellQuantity,
                COALESCE(b.buyValue,0) buyValue,
                COALESCE(b.sellValue,0) sellValue,b.lastSellAt,
                COALESCE(p.volume,0) volume,COALESCE(p.gross,0) gross,COALESCE(p.tax,0) tax,COALESCE(p.trades,0) trades,
                (SELECT price FROM trades WHERE item=a.item AND time<? ORDER BY time DESC,id DESC LIMIT 1) lastPrice,
                (SELECT time FROM trades WHERE item=a.item AND time<? ORDER BY time DESC,id DESC LIMIT 1) lastTradeAt,
                (SELECT price FROM trades WHERE item=a.item AND time<? ORDER BY time DESC,id DESC LIMIT 1) referencePrice
            FROM activity a LEFT JOIN book b ON b.item=a.item LEFT JOIN period p ON p.item=a.item
        `
            )
            .all(since, now, now, now, since);
        return rows.map(row => {
            const change = row.lastPrice !== null && row.referencePrice !== null ? row.lastPrice - row.referencePrice : null;
            return {
                ...row,
                vwap: row.volume ? row.gross / row.volume : null,
                change,
                changePercent: change !== null && row.referencePrice ? (change / row.referencePrice) * 100 : null,
                // Only listed sell supply is known; this is deliberately not total circulating supply.
                marketCap: row.lastPrice !== null ? row.lastPrice * row.sellQuantity : null
            };
        });
    }
}
let store: MarketStore | undefined;
export function marketStore(): MarketStore {
    if (!Environment.GE_ENABLED) throw new Error('Grand Exchange is not available on this server.');
    return (store ??= new MarketStore(process.env.GE_DATABASE ?? 'data/market.sqlite'));
}
/** Preserve crash recovery and later re-enabling for existing exchange participants.
 * A world that has never used GE does not create or require a market database.
 */
export function playerSaveStore(): MarketStore | undefined {
    const path = process.env.GE_DATABASE ?? 'data/market.sqlite';
    if (!Environment.GE_ENABLED && !store && !existsSync(path)) return undefined;
    return (store ??= new MarketStore(path));
}
