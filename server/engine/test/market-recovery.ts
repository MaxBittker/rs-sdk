// Real saves and native handlers, with only disposable players and a temporary ledger.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
const dir = mkdtempSync(join(tmpdir(), 'ge-recovery-'));
process.env.GE_DATABASE = join(dir, 'market.sqlite');
process.env.GE_ENABLED = 'true';
const { default: World } = await import('../src/engine/World.js');
const { default: Player } = await import('../src/engine/entity/Player.js');
const { default: Component } = await import('../src/cache/config/Component.js');
const { default: ObjType } = await import('../src/cache/config/ObjType.js');
const { default: InvType } = await import('../src/cache/config/InvType.js');
const { default: Packet } = await import('../src/io/Packet.js');
const { PlayerLoading } = await import('../src/engine/entity/PlayerLoading.js');
const { default: IfButtonHandler } = await import('../src/network/game/client/handler/IfButtonHandler.js');
const { default: IfButton } = await import('../src/network/game/client/model/IfButton.js');
const { openExchange, exchangeSearch, exchangeCount } = await import('../src/engine/market/GrandExchange.js');
const { OFFER_SLOTS } = await import('../src/engine/market/MarketStore.js');
const { marketStore, MAX_GP } = await import('../src/engine/market/MarketStore.js');
const { noteFor } = await import('../src/engine/market/MarketCatalog.js');
try {
    World.reload();
    const inv = InvType.getId('inv'), bank = InvType.getId('bank'), trade = InvType.getId('tradeoffer');
    const coins = ObjType.getId('coins'), logs = ObjType.getId('logs'), note = noteFor(logs);
    let key = 100n;
    const make = (name: string, balance = 0) => {
        const p = PlayerLoading.load(name, new Packet(new Uint8Array()), null);
        p.x = 3181; p.z = 3443; p.level = 0;
        World.playerLoop.add(key++, p);
        if (balance) p.invAdd(inv, coins, balance);
        return p;
    };
    const reload = (p: InstanceType<typeof Player>, previous = new Uint8Array()) => PlayerLoading.load(p.username, new Packet(previous), null);
    const click = (p: InstanceType<typeof Player>, name: string) => assert(new IfButtonHandler().handle(new IfButton(Component.getId('grand_exchange:' + name)), p));
    const place = (p: InstanceType<typeof Player>, slot = 0) => {
        openExchange(p, 3180, 3443);
        click(p, 'slot' + slot + '_buy');
        assert(exchangeSearch(p, 'logs'));
        assert(exchangeSearch(p, 'logs', logs));
        click(p, 'offer_price');
        assert(exchangeCount(p, 1));
        click(p, 'offer_confirm');
    };
    const actor = make('recoveractor', 100);
    const victims = Player.RECOVERABLE_INVENTORIES.map((name, i) => {
        const p = make('recover' + i);
        p.invAdd(inv, note, 100);
        const previous = p.save(false);
        p.getInventory(inv)!.remove(note, 100);
        p.invAdd(InvType.getId(name), note, 100);
        p.openMainModal(Component.getId('trademain'));
        return { p, previous, name };
    });
    place(actor);
    for (const { p, previous, name } of victims) {
        assert.equal(p.modalMain, Component.getId('trademain'), 'Checkpoint leaves the live interface open');
        assert.equal(p.getInventory(InvType.getId(name))!.getItemCount(note), 100, 'Checkpoint leaves live escrow unchanged');
        const restored = reload(p, previous);
        assert.equal(restored.getInventory(inv)!.getItemCount(note), 100, name + ' survives recovery');
        assert.equal(restored.getInventory(InvType.getId(name))!.getItemCount(note), 0, 'Escrow is not restored twice');
        assert(PlayerLoading.verify(new Packet(restored.save(false))));
    }
    console.log('PASS: temporary owned inventories recover without changing live trades.');

    // Completing a checkpointed trade, then saving only its recipient, must not
    // leave the donor's earlier recovery escrow available for a second recovery.
    const donor = victims[0].p;
    donor.getInventory(trade)!.remove(note, 100);
    actor.invAdd(inv, note, 100);
    actor.save(); // reconnect/save path
    assert.equal(reload(donor).getInventory(inv)!.getItemCount(note), 0);
    assert.equal(reload(actor).getInventory(inv)!.getItemCount(note), 100);

    for (const legacy of [false, true]) {
        const giver = make(legacy ? 'pendingold' : 'pendingnew', 100);
        const receiver = make(legacy ? 'receiverold' : 'receivernew');
        const previous = giver.save(false);
        giver.getInventory(inv)!.remove(coins, 100);
        receiver.invAdd(inv, coins, 100);
        giver.unlink();
        if (legacy) World.logoutRequests.set(giver.username, { save: giver.save(false), lastAttempt: -1 });
        else {
            World.flushPlayer(giver);
            assert(marketStore().saved(giver.username), 'First logout is durable before the login-service ack');
        }
        place(receiver);
        const total = reload(giver, previous).getInventory(inv)!.getItemCount(coins)
            + reload(receiver).getInventory(inv)!.getItemCount(coins)
            + marketStore().offers(receiver.username).reduce((n, o) => n + o.remaining * o.price, 0);
        assert.equal(total, 100, 'Pending logout donor cannot recover transferred coins twice');
    }
    console.log('PASS: completed transfers and pending logout saves recover exactly once.');

    // Both coin stacks are full. Overflow must survive another save/load and retry.
    const full = make('recoverfull', MAX_GP);
    full.invAdd(bank, coins, MAX_GP);
    full.invAdd(trade, coins, 100);
    full.save();
    let overflow = reload(full);
    full.unlink();
    assert.deepEqual(overflow.recoveryItems, [{ id: coins, count: 100 }]);
    overflow.save();
    overflow = reload(overflow);
    assert.deepEqual(overflow.recoveryItems, [{ id: coins, count: 100 }]);
    overflow.getInventory(inv)!.remove(coins, 50);
    overflow.recoverItems();
    assert.equal(overflow.getInventory(inv)!.getItemCount(coins), MAX_GP);
    assert.deepEqual(overflow.recoveryItems, [{ id: coins, count: 50 }]);
    overflow.getInventory(bank)!.remove(coins, 50);
    overflow.recoverItems();
    assert.equal(overflow.getInventory(bank)!.getItemCount(coins), MAX_GP);
    assert.deepEqual(overflow.recoveryItems, []);
    overflow.save();
    assert.deepEqual(reload(overflow).recoveryItems, []);

    const noted = make('recovernotes');
    for (let slot = 0; slot < 28; slot++) noted.getInventory(inv)!.set(slot, { id: logs, count: 1 });
    noted.invAdd(trade, note, 100);
    noted.save();
    assert.equal(reload(noted).getInventory(bank)!.getItemCount(logs), 100, 'Recovered notes are unnoted when banked');
    assert.equal(reload(noted).getInventory(bank)!.getItemCount(note), 0);
    console.log('PASS: stack overflow remains durable and bank recovery handles notes.');

    for (let slot = 1; slot < OFFER_SLOTS; slot++) place(actor, slot);
    const observer = make('saveobserver');
    let saves = 0;
    const originalSave = observer.save.bind(observer);
    observer.save = checkpoint => { saves++; return originalSave(checkpoint); };
    for (let i = 0; i < 5; i++) click(actor, 'collect');
    assert.equal(saves, 0, 'Empty collections perform no world saves');
    for (const offer of marketStore().offers(actor.username)) marketStore().cancel(actor.username, offer.id);
    click(actor, 'collect');
    assert.equal(saves, 1, 'Six actual collections checkpoint each bystander only once');
    assert.equal(marketStore().offers(actor.username).length, 0);

    // A failure after one bystander was serialized cannot commit any checkpoint.
    const beforeActor = actor.getInventory(inv)!.getItemCount(coins);
    const beforeObserver = marketStore().saved(observer.username)!.slice();
    const broken = make('brokensave');
    broken.save = () => { throw new Error('Injected serialization failure'); };
    place(actor);
    assert.equal(actor.getInventory(inv)!.getItemCount(coins), beforeActor);
    assert.equal(marketStore().offers(actor.username).length, 0);
    assert.deepEqual(marketStore().saved(observer.username), beforeObserver);
    broken.unlink();
    console.log('PASS: empty collections, one-checkpoint batching and failed saves are safe.');

    // Version 7 remains readable; create a valid older-format save from an empty
    // version 8 save by removing its empty recovery section and updating its CRC.
    const older = make('oldversion', 42).save(false);
    const oldBytes = new Uint8Array(older.length - 2);
    oldBytes.set(older.subarray(0, older.length - 6));
    const oldPacket = new Packet(oldBytes);
    oldPacket.pos = 2; oldPacket.p2(7);
    oldPacket.pos = oldBytes.length - 4;
    oldPacket.p4(Packet.getcrc(oldBytes, 0, oldPacket.pos));
    assert.equal(PlayerLoading.load('oldversion2', new Packet(oldBytes), null).getInventory(inv)!.getItemCount(coins), 42);
    console.log('PASS: existing version 7 saves remain readable.');
} finally {
    marketStore().db.close();
    rmSync(dir, { recursive: true, force: true });
    await Promise.all([World.loginThread.terminate(), World.friendThread.terminate(), World.loggerThread.terminate()]);
}
