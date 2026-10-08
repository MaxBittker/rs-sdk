import { expect, test } from 'bun:test';
import { summarizeBankItems, renderBankItemCensus } from '../src/web/pages/BankItemCensus.js';
import { parseBankSnapshots } from '../src/web/pages/BankHiscores.js';

test('sums stack quantities and counts each bank once per item name, combining noted variants', () => {
    const census = summarizeBankItems([
        {
            username: 'alice',
            items: [
                { id: 1, name: 'Shrimps', count: 100, value: 500 },
                { id: 1, name: 'Shrimps', count: 50, value: 250 },
                { id: 2, name: 'Rare item', count: 1, value: 0 }
            ]
        },
        {
            username: 'bob',
            items: [
                { id: 1, name: 'Shrimps', count: 20, value: 100 },
                { id: 3, name: 'Rare item', count: 3, value: 0 }
            ]
        },
        { username: 'empty', items: [] }
    ]);
    expect(census.banks).toBe(3);
    expect(census.quantity).toBe(174);
    expect(census.items).toEqual([
        { id: 1, name: 'Shrimps', quantity: 170, holders: 2, rarityEligible: false },
        { id: 2, name: 'Rare item', quantity: 4, holders: 2, rarityEligible: false }
    ]);
    const legacy = summarizeBankItems(
        parseBankSnapshots([
            { username: 'one', value: 5, items: '[{"name":"Shrimps","value":5,"count":1}]' },
            { username: 'two', value: 5, items: '[{"name":"SHRIMPS","value":5,"count":1}]' },
            { username: 'broken', value: 5, items: '{' }
        ])
    );
    expect(legacy.items).toEqual([{ id: undefined, name: 'Shrimps', quantity: 2, holders: 2, rarityEligible: false }]);
});

test('rarity can mean total units or number of holders, with encoded links to the live filtered board', async () => {
    const census = {
        banks: 10,
        quantity: 110,
        items: [
            { id: 1, name: 'Rune & sword', quantity: 100, holders: 1, rarityEligible: true },
            { id: 2, name: 'Shrimps', quantity: 10, holders: 10, rarityEligible: true }
        ]
    };
    const options = { profile: 'main', capturedAt: '2026-10-08T16:58:23.631Z', holdersBaseUrl: 'https://rs-sdk-demo.fly.dev/hiscores/bank', refresh: true };
    const quantity = await renderBankItemCensus(census, new URL('http://localhost/hiscores/bank/items'), options).text();
    const rare = quantity.split('<h2>Rarest items</h2>')[1].split('<h2>Most common items</h2>')[0];
    expect(rare.indexOf('Shrimps')).toBeLessThan(rare.indexOf('Rune &amp; sword'));
    expect(quantity).toContain('https://rs-sdk-demo.fly.dev/hiscores/bank?profile=main&amp;q=Rune+%26+sword');
    expect(quantity).toContain('action="/refresh"');
    const holders = await renderBankItemCensus(census, new URL('http://localhost/hiscores/bank/items?by=holders'), options).text();
    const rareHolders = holders.split('<h2>Rarest items</h2>')[1].split('<h2>Most common items</h2>')[0];
    expect(rareHolders.indexOf('Rune &amp; sword')).toBeLessThan(rareHolders.indexOf('Shrimps'));
    const filtered = await renderBankItemCensus(census, new URL('http://localhost/hiscores/bank/items?q=SHRIMP'), options).text();
    expect(filtered).toContain('Shrimps');
    expect(filtered).not.toContain('Rune &amp; sword');
    const empty = await renderBankItemCensus(census, new URL('http://localhost/hiscores/bank/items?q=%3Cscript%3E'), options).text();
    expect(empty).toContain('value="&lt;script&gt;"');
    expect(empty).toContain('No matching bank items');
});

test('combines numeric suffixes and excludes quest, untradeable and unknown items only from rarity', async () => {
    const census = summarizeBankItems(
        [
            {
                username: 'alice',
                items: [
                    { id: 1, name: 'Prayer potion(4)', count: 2, value: 10 },
                    { id: 2, name: 'Prayer potion (1)', count: 3, value: 5 },
                    { id: 3, name: 'Amulet of glory(1)', count: 1, value: 5 },
                    { id: 4, name: 'Quest key', count: 1, value: 0 },
                    { id: 5, name: 'Untradeable item', count: 1, value: 0 },
                    { name: 'Unknown item', count: 1, value: 0 },
                    { id: 7, name: 'Dagger(p)', count: 1, value: 5 }
                ]
            },
            { username: 'bob', items: [{ id: 6, name: 'Amulet of glory(4)', count: 2, value: 10 }] }
        ],
        [
            { id: 1, tradeable: true, quest: false },
            { id: 2, tradeable: true, quest: false },
            { id: 3, tradeable: true, quest: false },
            { id: 4, tradeable: true, quest: true },
            { id: 5, tradeable: false, quest: false },
            { id: 6, tradeable: true, quest: false },
            { id: 7, tradeable: true, quest: false }
        ]
    );
    expect(census.items.find(item => item.name === 'Prayer potion')).toMatchObject({ quantity: 5, holders: 1, rarityEligible: true });
    expect(census.items.find(item => item.name === 'Amulet of glory')).toMatchObject({ quantity: 3, holders: 2 });
    expect(census.items.find(item => item.name === 'Dagger(p)')).toBeDefined();
    for (const by of ['quantity', 'holders']) {
        const html = await renderBankItemCensus(census, new URL(`http://localhost/hiscores/bank/items?by=${by}`), { profile: 'main', capturedAt: '2026-10-08T17:03:37Z' }).text();
        const [rare, common] = html.split('<h2>Rarest items</h2>')[1].split('<h2>Most common items</h2>');
        for (const name of ['Quest key', 'Untradeable item', 'Unknown item']) {
            expect(rare).not.toContain(name);
            expect(common).toContain(name);
        }
        expect(rare).toContain('q=Prayer+potion');
        expect(rare).not.toContain('Prayer potion(4)');
    }
});
