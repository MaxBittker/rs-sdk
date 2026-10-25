// Real packed content, Player inventories/saves, compiled booth script, native handlers
// and public HTTP routes. No production account or persistent game DB is touched.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
const dir = mkdtempSync(join(tmpdir(), 'ge-integration-'));
process.env.GE_DATABASE = join(dir, 'market.sqlite');
const { default: World } = await import('../src/engine/World.js');
const { default: Component } = await import('../src/cache/config/Component.js');
const { default: NpcType } = await import('../src/cache/config/NpcType.js');
const { findPathToLoc, findPathToEntity, isMapBlocked } = await import('../src/engine/GameMap.js');
const { default: ObjType } = await import('../src/cache/config/ObjType.js');
const { default: InvType } = await import('../src/cache/config/InvType.js');
const { default: LocType } = await import('../src/cache/config/LocType.js');
const { default: Packet } = await import('../src/io/Packet.js');
const { PlayerLoading } = await import('../src/engine/entity/PlayerLoading.js');
const { default: IfButtonHandler } = await import('../src/network/game/client/handler/IfButtonHandler.js');
const { default: InvButtonHandler } = await import('../src/network/game/client/handler/InvButtonHandler.js');
const { default: InvButton } = await import('../src/network/game/client/model/InvButton.js');
const { default: IfButton } = await import('../src/network/game/client/model/IfButton.js');
const { default: SearchHandler } = await import('../src/network/game/client/handler/MarketSearchHandler.js');
const { default: SearchDecoder } = await import('../src/network/game/client/codec/MarketSearchDecoder.js');
const { default: CountHandler } = await import('../src/network/game/client/handler/ResumePCountDialogHandler.js');
const { default: Count } = await import('../src/network/game/client/model/ResumePCountDialog.js');
const { default: ScriptProvider } = await import('../src/engine/script/ScriptProvider.js');
const { default: ScriptRunner } = await import('../src/engine/script/ScriptRunner.js');
const { default: ServerTriggerType } = await import('../src/engine/script/ServerTriggerType.js');
const { default: Loc } = await import('../src/engine/entity/Loc.js');
const { marketStore, OFFER_SLOTS } = await import('../src/engine/market/MarketStore.js');
const { noteFor, canonicalItem } = await import('../src/engine/market/MarketCatalog.js');
const { openExchange, atExchange, tickExchange } = await import('../src/engine/market/GrandExchange.js');
const { handleMarket } = await import('../src/web/pages/market.js');
try {
    World.reload();
    World.gameMap.init();
    const booth = World.getLoc(3180, 3443, 0, LocType.getId('grand_exchange_booth'));
    assert(booth, 'The existing west-wall bank table hosts the exchange');
    assert.equal(booth.width, 2);
    assert.equal(booth.length, 1);
    assert.equal(booth.angle, 1, 'The bank table keeps its original rotation');
    assert.deepEqual(LocType.get(booth.type).models, LocType.get(LocType.getId('banktable')).models, 'The original table model is reused');
    assert.equal(World.getLoc(3180, 3439, 0, booth.type), null, 'No added stall');
    const teller = [...World.npcs].find(n => n.type === NpcType.getId('grand_exchange_teller'));
    assert(teller && teller.x === 3181 && teller.z === 3445, 'Exchange teller is beside the bank table');
    assert(!LocType.get(LocType.getId('bankbooth')).op.includes('Grand-Exchange'), 'Normal bank booths keep only banking');
    assert(isMapBlocked(3180, 3443, 0));
    assert(isMapBlocked(3180, 3444, 0));
    for (const x of [3180, 3181]) for (const z of [3439, 3440]) assert(!isMapBlocked(x, z, 0), 'The removed stall leaves clear floor');
    assert(!isMapBlocked(3181, 3443, 0), 'The table approach remains open');
    assert(!isMapBlocked(teller.x, teller.z, 0), 'The teller stands on clear floor');
    const sdkCollision = JSON.parse(readFileSync('../../sdk/collision-data.json', 'utf8'));
    const boothTiles = sdkCollision.tiles.filter((t: number[]) => t[0] === 0 && t[1] === 3180 && [3443, 3444].includes(t[2]));
    assert.equal(boothTiles.length, 2);
    assert(
        boothTiles.every((t: number[]) => (t[3] & 256) !== 0),
        'SDK routes respect the original table footprint'
    );
    const oldTiles = sdkCollision.tiles.filter((t: number[]) => t[0] === 0 && [3180, 3181].includes(t[1]) && [3439, 3440].includes(t[2]));
    assert(
        oldTiles.every((t: number[]) => (t[3] & 256) === 0),
        'SDK routes no longer avoid the removed stall'
    );
    assert(findPathToLoc(0, 3183, 3437, 3180, 3443, 1, 2, 1, booth.angle, 10, 0).length > 0, 'Table is reachable from the entrance aisle');
    assert(findPathToEntity(0, 3183, 3437, teller.x, teller.z, 1, 1, 1).length > 0, 'Teller is reachable');
    const seller = PlayerLoading.load('geseller', new Packet(new Uint8Array()), null);
    const buyer = PlayerLoading.load('gebuyer', new Packet(new Uint8Array()), null);
    const inv = InvType.getId('inv'),
        coins = ObjType.getId('coins'),
        logs = ObjType.getId('logs'),
        note = noteFor(logs);
    assert(note !== logs);
    assert.equal(canonicalItem(note), logs);
    for (const p of [seller, buyer]) {
        p.x = 3181;
        p.z = 3443;
        p.level = 0;
    }
    World.playerLoop.add(1n, seller);
    World.playerLoop.add(2n, buyer);
    for (const [i, p] of [seller, buyer].entries()) {
        p.slot = i + 1;
        p.uid = ((Number(p.username37 & 0x1fffffn) << 11) | p.slot) >>> 0;
        World.players[p.slot] = p;
    }
    seller.invAdd(inv, note, 8);
    seller.invAdd(inv, logs, 2);
    buyer.invAdd(inv, coins, 200);
    const originalSeller = seller.save();
    // Reproduce a running server whose cache predates optional SDK metadata.
    const componentNames = (Component as any).componentNames as Map<string, number>;
    const metadataId = Component.getId('grand_exchange:agent_state');
    assert(metadataId >= 0, 'SDK metadata is included in the rebuilt interface');
    const originalWrite = buyer.write;
    const openingPackets: any[] = [];
    try {
        componentNames.delete('grand_exchange:agent_state');
        buyer.write = message => {
            openingPackets.push(message);
        };
        openExchange(buyer, 3180, 3443);
        assert.equal(buyer.modalMain, Component.getId('grand_exchange'));
        assert(openingPackets.length > 0);
        assert(
            openingPackets.every(m => m.component === undefined || m.component >= 0),
            'Opening with an older cache never emits component -1 (65535 on the wire)'
        );
    } finally {
        componentNames.set('grand_exchange:agent_state', metadataId);
        buyer.write = originalWrite;
        buyer.closeModal();
    }
    const click = (p: typeof seller, name: string) => assert(new IfButtonHandler().handle(new IfButton(Component.getId('grand_exchange:' + name)), p));
    const search = (p: typeof seller, query: string, item = 0) => {
        const packet = new Packet(new Uint8Array(256));
        packet.pjstr(query);
        packet.p2(item);
        packet.pos = 0;
        return new SearchHandler().handle(new SearchDecoder().decode(packet), p);
    };
    const count = (p: typeof seller, n: number) => assert(new CountHandler().handle(new Count(n), p));
    const sellerUpdates: any[] = [];
    seller.write = message => sellerUpdates.push(message);
    const sellerState = () => JSON.parse(sellerUpdates.findLast(m => m.component === metadataId && m.text)?.text);
    const side = Component.getId('grand_exchange_side:inv');
    const inventoryClick = (p: typeof seller, item: number) =>
        new InvButtonHandler().handle(
            new InvButton(
                1,
                item,
                p.getInventory(inv)!.items.findIndex(i => i?.id === item),
                side
            ),
            p
        );
    const script = ScriptProvider.getByTrigger(ServerTriggerType.OPLOC1, booth.type, -1);
    assert(script, 'Compiled booth trigger exists');
    seller.executeScript(ScriptRunner.init(script, seller, booth), true);
    assert.equal(seller.modalMain, Component.getId('grand_exchange'), 'Booth opens native interface');
    assert.equal(seller.modalSide, Component.getId('grand_exchange_side'));
    assert(
        seller.invListeners.some(l => l.com === side),
        'Backpack is transmitted to the sell sidebar'
    );
    assert(inventoryClick(seller, note), 'An inventory click opens a sell draft directly from home');
    assert.deepEqual([sellerState().draft.item, sellerState().draft.side, sellerState().draft.quantity, sellerState().draft.slot], [logs, 'sell', 10, 0]);
    assert.equal(marketStore().offers(seller.username).length, 0, 'Clicking does not submit an offer');
    assert.equal(seller.getInventory(inv)!.getItemCount(note), 8, 'Draft creation does not escrow items');
    click(seller, 'offer_price');
    assert(inventoryClick(seller, logs), 'Loose items also open drafts and replace pending count input');
    assert.equal(sellerState().input, null);
    assert(
        sellerUpdates.some(m => m.constructor.name === 'IfOpenMainSide'),
        'Dismissing count input preserves the sidebar'
    );
    assert(!new CountHandler().handle(new Count(999), seller), 'A stale numeric reply cannot edit the replacement draft');
    assert(!new InvButtonHandler().handle(new InvButton(1, logs, 0, side), seller), 'Stale inventory slots are rejected');
    click(seller, 'home');
    click(seller, 'slot4_buy');
    search(seller, 'rune');
    assert(inventoryClick(seller, note), 'Inventory clicks also work while browsing buy offers');
    assert.equal(sellerState().draft.slot, 4, 'Inventory selling preserves the selected empty slot');
    assert.equal(sellerState().draft.side, 'sell');
    click(seller, 'home');
    click(seller, 'slot4_sell');
    assert.equal(sellerState().search.query, '', 'New sell selection starts with the full backpack');
    assert(sellerState().search.results.some((i: any) => i.item === logs));
    assert(search(seller, 'log'));
    assert(search(seller, 'log', coins)); // A non-result cannot be selected.
    assert(search(seller, 'old query', logs)); // A stale query cannot select an item.
    assert(!search(seller, 'x'.repeat(49)));
    assert(!search(seller, '<script>'));
    assert(search(seller, 'log', logs));
    assert(!search(seller, 'logs'), 'Search is closed once the draft opens');
    click(seller, 'offer_qty_all');
    click(seller, 'offer_quantity_plus');
    assert.equal(sellerState().draft.quantity, 10, 'Plus cannot exceed the combined owned quantity');
    click(seller, 'offer_quantity');
    count(seller, 11);
    assert.match(sellerState().error, /only have 10/);
    assert.equal(sellerState().draft.quantity, 10);
    click(seller, 'offer_quantity_minus');
    assert.equal(sellerState().draft.quantity, 9);
    click(seller, 'offer_qty_all');
    click(seller, 'offer_price');
    count(seller, 10);
    click(seller, 'offer_confirm');
    assert.equal(seller.getInventory(inv)!.getItemCount(note), 0, 'notes escrowed');
    assert.equal(seller.getInventory(inv)!.getItemCount(logs), 0, 'loose items escrowed with notes');
    assert.equal(marketStore().offers(seller.username)[0]?.remaining, 10);
    assert.equal(marketStore().offers(seller.username)[0]?.slot, 4, 'Offer uses the selected grid slot');
    assert(marketStore().saved(buyer.username), 'Other online players share the atomic save boundary');
    click(seller, 'home');
    click(seller, 'slot0_sell');
    assert.equal(sellerState().search.total, 0);
    assert.match(sellerUpdates.findLast(m => m.component === Component.getId('grand_exchange:subtitle'))?.text, /No sellable items/);
    seller.closeModal();
    assert(!seller.invListeners.some(l => l.com === side), 'Closing GE stops the sidebar inventory listener');
    assert(!inventoryClick(seller, note), 'Closed GE rejects inventory clicks');
    openExchange(seller, 3180, 3443);
    click(seller, 'slot4_view');
    buyer.x = 3182;
    buyer.z = 3445;
    for (const trigger of [ServerTriggerType.OPNPC1, ServerTriggerType.OPNPC2]) {
        buyer.closeModal();
        const script = ScriptProvider.getByTrigger(trigger, teller.type, -1);
        assert(script, 'Both teller options are compiled');
        buyer.executeScript(ScriptRunner.init(script, buyer, teller), true);
        assert.equal(buyer.modalMain, Component.getId('grand_exchange'));
    }
    const updates: any[] = [];
    seller.write = message => {
        updates.push(message);
    };
    click(buyer, 'slot2_buy');
    assert(search(buyer, 'logss'), 'Fuzzy search accepts a small typo');
    assert(search(buyer, 'logss', logs));
    const buyerUpdates: any[] = [];
    buyer.write = message => buyerUpdates.push(message);
    click(buyer, 'offer_quantity');
    count(buyer, 2);
    click(buyer, 'offer_qty_all');
    assert.equal(buyerUpdates.findLast(m => m.component === Component.getId('grand_exchange:offer_quantity'))?.text, '2', 'Buy All is ignored even if dispatched directly');
    assert.equal(buyerUpdates.findLast(m => m.component === Component.getId('grand_exchange:offer_sell_quantity'))?.hidden, true);
    click(buyer, 'offer_quantity');
    count(buyer, 10);
    click(buyer, 'offer_price');
    count(buyer, 20);
    click(buyer, 'offer_price_higher');
    click(buyer, 'offer_price_lower');
    click(buyer, 'offer_confirm');
    assert.equal(buyer.getInventory(inv)!.getItemCount(coins), 0);
    assert.equal(marketStore().quote(logs).tax, 5);
    tickExchange(seller);
    assert(
        updates.some(m => m.component === Component.getId('grand_exchange:view_progress') && m.text === 'Offer completed - 10 of 10 traded'),
        'Counterparty fill pushes into the open UI without refresh'
    );
    const sentCount = updates.length;
    tickExchange(seller);
    assert.equal(updates.length, sentCount, 'An unchanged ledger does not redraw the UI');
    click(buyer, 'view_notes');
    assert.equal(buyer.getInventory(inv)!.getItemCount(note), 10);
    assert.equal(buyer.getInventory(inv)!.getItemCount(coins), 100);
    click(seller, 'view_collect');
    assert.equal(seller.getInventory(inv)!.getItemCount(coins), 95);
    const before = buyer.getInventory(inv)!.getItemCount(note);
    click(buyer, 'view_notes');
    assert.equal(buyer.getInventory(inv)!.getItemCount(note), before);
    click(buyer, 'home');
    click(buyer, 'slot2_buy');
    assert(search(buyer, 'log'));
    assert(search(buyer, 'log', logs));
    click(buyer, 'offer_price');
    count(buyer, 20);
    click(buyer, 'offer_confirm');
    assert.equal(buyer.getInventory(inv)!.getItemCount(coins), 80);
    assert.equal(buyerUpdates.findLast(m => m.component === Component.getId('grand_exchange:view_claim_controls'))?.hidden, true);
    click(buyer, 'view_cancel');
    assert.equal(buyerUpdates.findLast(m => m.component === Component.getId('grand_exchange:view_cancel_controls'))?.hidden, true);
    click(buyer, 'view_collect');
    assert.equal(buyer.getInventory(inv)!.getItemCount(coins), 100, 'Cancelled buy escrow is refunded through the visual collection control');
    buyer.x = 3200;
    assert(!atExchange(buyer, 3181, 3445));
    assert(!search(buyer, 'logs'), 'No searching remotely');
    assert.equal(new IfButtonHandler().handle(new IfButton(Component.getId('grand_exchange:buy')), buyer), false);
    assert.equal(buyer.modalMain, -1);
    assert.equal(new IfButtonHandler().handle(new IfButton(Component.getId('grand_exchange:row5')), buyer), false);
    assert(!atExchange({ x: 3185, z: 3436, level: 0 }, 3186, 3436), 'The old bank counter cannot authorize GE actions');
    assert(!atExchange({ x: 3181, z: 3443, level: 1 }, 3180, 3443), 'No upstairs use');
    assert(!atExchange({ x: 3182, z: 3439, level: 0 }, 3180, 3439), 'Removed stall cannot authorize GE actions');
    assert(atExchange({ x: 3181, z: 3444, level: 0 }, 3180, 3443), 'Both tiles of the rotated table accept adjacent players');
    const restored = PlayerLoading.load(seller.username, new Packet(originalSeller), null);
    assert.equal(restored.getInventory(inv)!.getItemCount(note), 0);
    assert.equal(restored.getInventory(inv)!.getItemCount(coins), 95);
    assert(PlayerLoading.verify(new Packet(restored.save())));
    const request = (path: string, method = 'GET') => {
        const url = new URL('http://localhost' + path);
        return handleMarket(new Request(url, { method }), url)!;
    };
    const quote = await request('/api/market/items/' + logs).json();
    assert.equal(quote.volume, 10);
    assert.equal(quote.lastPrice, 10);
    assert.equal(quote.tax, 5);
    assert.equal((await request('/api/market/items/' + logs + '/history').json()).history.length, 1);
    assert.equal(request('/api/market/items/' + logs, 'POST').status, 405);
    assert.equal(request('/api/market/items?limit=10000').status, 400);
    assert.equal(request('/api/market/items/' + logs + '/history?interval=1').status, 400);
    assert.equal(request('/api/market/items/999999').status, 404);
    const results = await request('/api/market/items?q=logs').json();
    assert(results.items.some((i: any) => i.id === logs));
    const alias = await request('/api/market/items?q=rscim').json();
    assert.equal(alias.items[0]?.name, 'Rune scimitar');
    assert.equal(alias.sort, 'relevance');
    const sorted = await request('/api/market/items?q=rune&sort=name-desc').json();
    assert.deepEqual(
        sorted.items.map((i: any) => i.name),
        sorted.items.map((i: any) => i.name).sort((a: string, b: string) => b.localeCompare(a, 'en'))
    );
    assert.equal(request('/api/market/items?sort=unknown').status, 400);
    assert(!JSON.stringify(results).includes('geseller'));
    assert((await request('/market').text()).includes('Grand Exchange'));
    // Agent porcelain -> actual native button/count/search handlers -> encoded server observations.
    // Dynamic paths keep this cross-project integration outside the engine compiler's rootDir.
    const sdkModule = '../../../sdk/index.ts',
        actionsModule = '../../../sdk/actions.ts';
    const stateModule = '../../webclient/src/bot/ge-state.ts';
    const { BotSDK } = await import(sdkModule);
    const { BotActions } = await import(actionsModule);
    const { collectGEState } = await import(stateModule);
    const { default: TextEncoder } = await import('../src/network/game/server/codec/IfSetTextEncoder.js');
    let largestStatePacket = 0;
    let agentIndex = 100n;
    const agent = (name: string) => {
        const p = PlayerLoading.load(name, new Packet(new Uint8Array()), null);
        p.x = 3181;
        p.z = 3443;
        p.level = 0;
        p.invAdd(inv, coins, 1000);
        p.invAdd(inv, note, 20);
        p.slot = Number(agentIndex);
        p.uid = ((Number(p.username37 & 0x1fffffn) << 11) | p.slot) >>> 0;
        World.players[p.slot] = p;
        World.playerLoop.add(agentIndex++, p);
        let ge: any = null;
        const sdk = new BotSDK({ botUsername: name, autoLaunchBrowser: false });
        sdk.isConnected = () => true;
        sdk.getStateAge = () => 0;
        const sync = () => {
            sdk.state = { modalOpen: p.modalMain === Component.getId('grand_exchange'), ge: p.modalMain === Component.getId('grand_exchange') ? ge : null };
        };
        p.write = message => {
            if ((message as any).component !== Component.getId('grand_exchange:agent_state')) return;
            const packet = Packet.alloc(1); // Same capacity as the real socket output buffer.
            new TextEncoder().encode(packet, message as any);
            largestStatePacket = Math.max(largestStatePacket, packet.pos);
            packet.pos = 0;
            assert.equal(packet.g2(), Component.getId('grand_exchange:agent_state'));
            const text = packet.gjstr();
            ge = collectGEState([{ clientCode: 30403, text, children: null }], 0);
            assert(!text.includes('"owner"'), 'Private observations need no account-name field');
            sync();
            packet.release();
        };
        const sent: string[] = [];
        sdk.sendAction = async (action: any) => {
            sent.push(action.type);
            let ok = false;
            if (action.type === 'clickComponent') ok = new IfButtonHandler().handle(new IfButton(action.componentId), p);
            if (action.type === 'submitCountDialog') ok = new CountHandler().handle(new Count(action.value), p);
            if (action.type === 'searchGE') ok = search(p, action.query);
            sync();
            return { success: ok, message: ok ? 'Dispatched' : 'Rejected by handler', phase: 'dispatch' };
        };
        const bot = new BotActions(sdk);
        openExchange(p, 3180, 3443);
        sync();
        return { p, sdk, bot, sent, sync };
    };
    const a = agent('sdkbuyer'),
        b = agent('sdkseller');
    const found = await a.bot.searchGE('logss');
    assert(found.success, found.message);
    assert(found.state.search.results.some((i: any) => i.item === logs));
    const sold = await b.bot.placeGEOffer({ item: logs, side: 'sell', quantity: 5, price: 10, slot: 4 });
    assert(sold.success, sold.message);
    assert.equal(sold.offer.slot, 4);
    assert.equal(b.p.getInventory(inv)!.getItemCount(note), 15);
    const bought = await a.bot.placeGEOffer({ item: logs, side: 'buy', quantity: 5, price: 20 });
    assert(bought.success, bought.message);
    assert.equal(bought.offer.filled, 5);
    assert.equal(bought.offer.coins, 50, 'Improved price is an observable collection claim');
    const collected = await a.bot.collectGEOffer(bought.offer.id);
    assert(collected.success, collected.message);
    assert.equal(collected.items, 5);
    assert.equal(collected.coins, 50);
    const proceeds = await b.bot.collectGE();
    assert(proceeds.success, proceeds.message);
    assert.equal(proceeds.coins, 48);
    const pending = await a.bot.placeGEOffer({ item: logs, side: 'buy', quantity: 3, price: 1 });
    assert(pending.success, pending.message);
    const cancelled = await a.bot.cancelGEOffer(pending.offer.id);
    assert(cancelled.success, cancelled.message);
    assert.equal(cancelled.offer.state, 'cancelled');
    assert.equal(cancelled.offer.coins, 3);
    assert.equal((await a.bot.collectGE()).coins, 3);
    const rejected = await a.bot.placeGEOffer({ item: logs, side: 'buy', quantity: 100, price: 100 });
    assert.equal(rejected.success, false);
    assert.equal(rejected.reason, 'server_rejected');
    assert.equal(a.sdk.getGEState().offers.length, 0, 'Unfunded request creates no offer');
    const beforeInvalid = a.sent.length;
    assert.equal((await a.bot.placeGEOffer({ item: logs, side: 'buy', quantity: 0, price: 1 })).success, false);
    assert.equal(a.sent.length, beforeInvalid, 'Invalid values do not dispatch');
    for (let slot = 0; slot < OFFER_SLOTS; slot++) {
        const result = await a.bot.placeGEOffer({ item: logs, side: 'buy', quantity: 1, price: 1, slot });
        assert(result.success, result.message);
    }
    assert.equal((await a.bot.placeGEOffer({ item: logs, side: 'buy', quantity: 1, price: 1 })).reason, 'no_slot');
    const beforeFull = JSON.stringify(marketStore().offers(a.p.username));
    assert(inventoryClick(a.p, note));
    assert.match(a.sdk.getState().ge.error, /slots are full/);
    assert.equal(JSON.stringify(marketStore().offers(a.p.username)), beforeFull, 'Inventory clicks cannot overwrite occupied offers');
    const invalid = agent('invalidsell');
    assert(inventoryClick(invalid.p, coins));
    assert.match(invalid.sdk.getState().ge.error, /cannot be traded/);
    assert.equal(invalid.sdk.getState().ge.screen, 'home');
    invalid.p.x = 3200;
    assert(inventoryClick(invalid.p, note));
    assert.equal(invalid.p.modalMain, -1, 'Inventory clicks recheck exchange distance');
    assert(largestStatePacket < 4997, 'Full-grid snapshots fit the native socket packet buffer including framing');
    // Raw forged/stale UI packets still cannot mutate remotely, regardless of SDK preflight.
    for (const operation of ['confirm', 'cancel', 'collect', 'count', 'search']) {
        const c = agent('remote' + operation);
        let component = Component.getId('grand_exchange:collect');
        if (operation === 'confirm' || operation === 'count') {
            click(c.p, 'slot0_buy');
            click(c.p, 'find');
            count(c.p, logs);
            component = Component.getId('grand_exchange:offer_confirm');
            if (operation === 'count') click(c.p, 'offer_quantity');
        } else if (operation === 'cancel') {
            const offer = await c.bot.placeGEOffer({ item: logs, side: 'buy', quantity: 1, price: 1 });
            assert(offer.success, offer.message);
            component = Component.getId('grand_exchange:row5');
        } else if (operation === 'search') click(c.p, 'slot0_buy');
        const ledger = JSON.stringify(marketStore().offers(c.p.username));
        const inventory = c.p.getInventory(inv)!.getItemCount(coins);
        c.p.x = 3200;
        if (operation === 'count') new CountHandler().handle(new Count(200), c.p);
        else if (operation === 'search') assert.equal(search(c.p, 'logs'), false);
        else new IfButtonHandler().handle(new IfButton(component), c.p);
        assert.equal(JSON.stringify(marketStore().offers(c.p.username)), ledger, operation + ' cannot mutate remotely');
        assert.equal(c.p.getInventory(inv)!.getItemCount(coins), inventory);
        assert.equal(c.p.modalMain, -1, 'Remote session is closed');
    }
    const upstairs = agent('sdkupstairs');
    upstairs.p.level = 1;
    const upstairsCoins = upstairs.p.getInventory(inv)!.getItemCount(coins);
    click(upstairs.p, 'collect');
    assert.equal(upstairs.p.modalMain, -1);
    assert.equal(upstairs.p.getInventory(inv)!.getItemCount(coins), upstairsCoins);
    console.log('PASS: SDK search/place/cancel/collect receipts, rejection, full slots, native state encoding and remote/floor guards.');
    console.log('PASS: compiled booth → native fuzzy search/selection/click/count handlers → noted escrow → matching → 5% burn → local collection → save recovery → HTTP market data.');
} finally {
    marketStore().db.close();
    rmSync(dir, { recursive: true, force: true });
    await Promise.all([World.loginThread.terminate(), World.friendThread.terminate(), World.loggerThread.terminate()]);
}
