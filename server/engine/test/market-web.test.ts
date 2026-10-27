import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ObjType from '../src/cache/config/ObjType.js';
import { marketStore } from '../src/engine/market/MarketStore.js';
import { handleMarket } from '../src/web/pages/market.js';
import { handleFleetMarket } from '../src/web/pages/fleet-market.js';
import Environment from '../src/util/Environment.js';

const dir = mkdtempSync(join(tmpdir(), 'market-web-'));
const previousDatabase = process.env.GE_DATABASE;
const previousFleetToken = Environment.FLEET_MARKET_TOKEN;
const previousFleetOwners = Environment.FLEET_MARKET_OWNERS;
process.env.GE_DATABASE = join(dir, 'market.sqlite');
Environment.FLEET_MARKET_TOKEN = 'fleet-test-secret';
Environment.FLEET_MARKET_OWNERS = ['Fleet_Owner', 'Fleet_Empty'];
ObjType.load(join(import.meta.dir, '../data/pack'));
afterAll(() => {
    marketStore().db.close();
    rmSync(dir, { recursive: true, force: true });
    if (previousDatabase === undefined) delete process.env.GE_DATABASE;
    else process.env.GE_DATABASE = previousDatabase;
    Environment.FLEET_MARKET_TOKEN = previousFleetToken;
    Environment.FLEET_MARKET_OWNERS = previousFleetOwners;
});
const request = (path: string) => {
    const url = new URL('http://localhost' + path);
    return handleMarket(new Request(url), url)!;
};

test('HTTP rankings, search, pagination and item details use the same period metrics', async () => {
    const now = Date.now(),
        logs = ObjType.getId('logs'),
        iron = ObjType.getId('iron_ore'),
        coal = ObjType.getId('coal');
    expect(logs).toBeGreaterThan(0);
    const insert = marketStore().db.query('INSERT INTO trades(item,buy_offer,sell_offer,quantity,price,gross,tax,time) VALUES(?,1,2,?,?,?,0,?)');
    for (const [id, oldPrice, price, quantity, age] of [
        [logs, 100, 120, 1, 3000],
        [iron, 200, 150, 50, 1000],
        [coal, 300, 450, 2, 2000]
    ]) {
        insert.run(id, 1, oldPrice, oldPrice, now - 8 * 86400000);
        insert.run(id, quantity, price, quantity * price, now - age);
    }
    marketStore().db.query("INSERT INTO offers(owner,slot,item,side,quantity,price,remaining,created) VALUES('private-owner',-1,?,'sell',3,500,3,?)").run(coal, now);
    const feather = ObjType.getId('feather');
    const buyOffer = marketStore().db.query("INSERT INTO offers(owner,slot,item,side,quantity,price,remaining,created) VALUES('private-buyer',-1,?,'buy',?,?,?,?)");
    buyOffer.run(feather, 50, 100, 50, now);
    buyOffer.run(logs, 10, 70, 10, now);
    buyOffer.run(iron, 20, 5, 20, now);
    const sellOffer = marketStore().db.query("INSERT INTO offers(owner,slot,item,side,quantity,price,remaining,created,state) VALUES('private-seller',-1,?,'sell',3,?,3,?,?)");
    sellOffer.run(logs, 1000, now - 2000, 'open');
    sellOffer.run(feather, 200, now - 1000, 'open');
    sellOffer.run(logs, 1200, now - 5000, 'open');
    sellOffer.run(iron, 100, now + 1000, 'cancelled');
    sellOffer.run(logs, 900, now + 2000, 'cancelled');
    sellOffer.run(logs, 800, now + 3000, 'completed');
    const ranked = async (sort: string, extra = '') => await request('/api/market/items?days=7&sort=' + sort + extra).json();
    expect((await ranked('recent')).items[0].id).toBe(iron);
    const buys = await ranked('buyValue');
    expect(buys.items.map((i: { id: number }) => i.id)).toEqual([feather, logs, iron]);
    expect(buys.items.map((i: { buyValue: number }) => i.buyValue)).toEqual([5000, 700, 100]);
    expect(buys.items[0].lastPrice).toBeNull();
    expect((await ranked('buyValue', '&limit=1&offset=1')).items[0].id).toBe(logs);
    expect((await ranked('buyValue', '&q=iron')).items[0].id).toBe(iron);
    expect((await request('/api/market/items?sort=buyValue&days=1').json()).items[0].buyValue).toBe(5000);
    expect((await request('/api/market/items/' + feather + '?days=7').json()).buyValue).toBe(5000);
    expect(JSON.stringify(buys)).not.toContain('private-buyer');

    const sells = await ranked('sellRecent');
    expect(sells.items.map((i: { id: number }) => i.id)).toEqual([coal, feather, logs]);
    expect(sells.items.map((i: { lastSellAt: number }) => i.lastSellAt)).toEqual([now, now - 1000, now - 2000]);
    expect(sells.items.map((i: { ask: number }) => i.ask)).toEqual([500, 200, 1000]);
    expect(sells.items[1].lastTradeAt).toBeNull();
    expect(sells.items[2].sellQuantity).toBe(6);
    expect(sells.items[2].sellValue).toBe(6600);
    expect((await ranked('sellRecent', '&limit=1&offset=1')).items[0].id).toBe(feather);
    expect((await ranked('sellRecent', '&q=logs')).items.map((i: { id: number }) => i.id)).toEqual([logs]);
    expect((await ranked('sellRecent', '&q=iron')).total).toBe(0);
    expect((await request('/api/market/items?sort=sellRecent&days=1').json()).items.map((i: { id: number }) => i.id)).toEqual([coal, feather, logs]);
    expect(JSON.stringify(sells)).not.toContain('private-seller');

    expect((await ranked('rises')).items[0].id).toBe(coal);
    const falls = await ranked('falls');
    expect(falls.items.map((i: { id: number }) => i.id)).toEqual([iron]);
    expect(falls.items[0].changePercent).toBe(-25);
    expect((await ranked('volume')).items[0].id).toBe(iron);
    expect((await ranked('price', '&limit=1&offset=1')).items[0].id).toBe(iron);
    const caps = await ranked('marketCap');
    expect(caps.items[0].id).toBe(coal);
    expect(caps.items[0].marketCap).toBe(1350);
    expect(caps.summary.volume).toBe(53);
    expect(caps.featured.id).toBe(iron);
    expect(JSON.stringify(caps)).not.toContain('private-owner');
    expect((await ranked('price', '&q=logs')).items.map((i: { id: number }) => i.id)).toEqual([logs]);
    expect((await ranked('price', '&q=nonexistent-item')).total).toBe(0);
    expect((await request('/api/market/items/' + coal + '?days=7').json()).changePercent).toBe(50);
    expect((await request('/api/market/items/' + coal + '/history?from=' + (now - 7 * 86400000) + '&to=' + now).json()).history[0].volume).toBe(2);
    expect((await ranked('rises', '&q=coal')).total).toBe(1);
    // A long period without an earlier price must not claim a percentage gain.
    expect((await request('/api/market/items?sort=rises&days=90').json()).total).toBe(0);
    expect(request('/api/market/items?sort=invalid').status).toBe(400);
    expect(request('/api/market/items?days=2').status).toBe(400);
    expect(request('/api/market/items?limit=101').status).toBe(400);
    expect(request('/api/market/items/999999').status).toBe(404);
    expect((await request('/api/market/items?q=logs').json()).items.length).toBeGreaterThan(1);
});

const fleetPath = '/api/market/fleet/offers';
async function fleetRequest(init: RequestInit = {}) {
    const url = new URL('http://localhost' + fleetPath);
    return (await handleFleetMarket(new Request(url, init), url))!;
}
const fleetPost = (owners: unknown = ['Fleet_Owner'], token = 'fleet-test-secret') =>
    fleetRequest({ method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ owners }) });

test('fleet ledger returns occupied offers and claims without an interface or online player', async () => {
    const logs = ObjType.getId('logs');
    const insert = marketStore().db.query(`INSERT INTO offers
        (owner,slot,item,side,quantity,price,remaining,filled,state,items,coins,gross,tax,created)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run('fleet_owner', 0, logs, 'buy', 100, 10, 40, 60, 'open', 60, 25, 600, 0, 1000);
    insert.run('fleet_owner', 1, logs, 'sell', 10, 20, 0, 10, 'completed', 0, 190, 200, 10, 1001);
    insert.run('fleet_owner', 2, logs, 'sell', 5, 30, 0, 2, 'cancelled', 3, 57, 60, 3, 1002);
    insert.run('fleet_owner', -1, logs, 'sell', 1, 20, 0, 1, 'completed', 0, 0, 20, 1, 1003);
    insert.run('other_owner', 0, logs, 'sell', 9, 20, 9, 0, 'open', 0, 0, 0, 0, 1004);

    const response = await fleetPost(['Fleet_Owner', 'Fleet_Empty']);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    const data = await response.json();
    expect(data.accounts.map((account: { owner: string }) => account.owner)).toEqual(['Fleet_Owner', 'Fleet_Empty']);
    expect(data.accounts[1].offers).toEqual([]);
    expect(data.accounts[0].offers).toHaveLength(3);
    expect(data.accounts[0].offers[0]).toMatchObject({ slot: 0, name: 'Logs', state: 'open', remaining: 40, filled: 60, items: 60, coins: 25 });
    expect(data.accounts[0].offers[1]).toMatchObject({ state: 'completed', coins: 190 });
    expect(data.accounts[0].offers[2]).toMatchObject({ state: 'cancelled', items: 3, coins: 57 });
    expect(JSON.stringify(data)).not.toContain('other_owner');
    expect(JSON.stringify(data)).not.toContain('"created"');
    expect(Number.isFinite(Date.parse(data.at))).toBe(true);
});

test('fleet route fails closed and validates all work before ledger reads', async () => {
    expect((await fleetPost(['Fleet_Owner'], 'wrong')).status).toBe(401);
    expect((await fleetRequest({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"owners":["Fleet_Owner"]}' })).status).toBe(401);
    expect((await fleetRequest({ method: 'GET' })).status).toBe(405);
    expect((await fleetPost(['Other_Owner'])).status).toBe(403);
    expect((await fleetPost(['Fleet Owner', 'fleet_owner'])).status).toBe(400);
    expect((await fleetPost(['bad-name'])).status).toBe(400);
    expect((await fleetPost([])).status).toBe(400);
    expect((await fleetPost(Array.from({ length: 65 }, (_, i) => `Bot${i}`))).status).toBe(400);
    expect((await fleetRequest({ method: 'POST', headers: { Authorization: 'Bearer fleet-test-secret', 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect((await fleetRequest({ method: 'POST', headers: { Authorization: 'Bearer fleet-test-secret', 'Content-Type': 'application/json' }, body: '{bad' })).status).toBe(400);
    expect((await fleetRequest({ method: 'POST', headers: { Authorization: 'Bearer fleet-test-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ owners: ['Fleet_Owner'], padding: 'x'.repeat(16_384) }) })).status).toBe(413);
});

test('missing fleet service configuration is unavailable rather than an empty fleet', async () => {
    const token = Environment.FLEET_MARKET_TOKEN;
    const owners = Environment.FLEET_MARKET_OWNERS;
    try {
        Environment.FLEET_MARKET_TOKEN = '';
        expect((await fleetPost()).status).toBe(503);
        Environment.FLEET_MARKET_TOKEN = token;
        Environment.FLEET_MARKET_OWNERS = [];
        expect((await fleetPost()).status).toBe(503);
    } finally {
        Environment.FLEET_MARKET_TOKEN = token;
        Environment.FLEET_MARKET_OWNERS = owners;
    }
});
