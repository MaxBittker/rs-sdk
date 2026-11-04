import { expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';

class TestWorker extends EventEmitter {
    postMessage() {}
}
mock.module('worker_threads', () => ({ Worker: TestWorker }));

const { default: World } = await import('../../src/engine/World.js');
const { default: Environment } = await import('../../src/util/Environment.js');
const { default: ObjType } = await import('../../src/cache/config/ObjType.js');
const { default: InvType } = await import('../../src/cache/config/InvType.js');
const { default: Component } = await import('../../src/cache/config/Component.js');
const { default: ScriptProvider } = await import('../../src/engine/script/ScriptProvider.js');
const { default: ScriptRunner } = await import('../../src/engine/script/ScriptRunner.js');
const { default: ServerTriggerType } = await import('../../src/engine/script/ServerTriggerType.js');
const { NetworkPlayer } = await import('../../src/engine/entity/NetworkPlayer.js');
const { default: NullClientSocket } = await import('../../src/server/NullClientSocket.js');

World.reload(false);
Component.load('data/pack');
Environment.node.members = true;
expect(ScriptProvider.load('data/pack')).toBeGreaterThan(0);

const inv = InvType.getId('inv');
const invCom = Component.getId('inventory:inv');
const coins = ObjType.getId('coins');

let nextSlot = 1;
function alch(spell: 'highlvl_alchemy' | 'lowlvl_alchemy', item: string): number {
    const slot = nextSlot++;
    const p = new NetworkPlayer(`alchtest${slot}`, BigInt(slot), BigInt(slot), new NullClientSocket());
    p.slot = slot;
    (World as any).players[slot] = p;
    p.x = 3222;
    p.z = 3222;
    p.levels[6] = 99;
    p.baseLevels[6] = 99;
    p.invListenOnCom(inv, invCom, p.uid);
    const obj = ObjType.getId(item);
    p.invSet(inv, obj, 1, 0);
    p.invSet(inv, ObjType.getId('naturerune'), 10, 1);
    p.invSet(inv, ObjType.getId('firerune'), 10, 2);
    p.lastItem = obj;
    p.lastSlot = 0;
    const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELDT, Component.getId(`magic:${spell}`), -1)!;
    expect(script).toBeDefined();
    p.executeScript(ScriptRunner.init(script, p), true);
    expect(p.invTotal(inv, obj)).toBe(0);
    return p.invTotal(inv, coins);
}

test('quest items an NPC re-gives alch for 1gp; normal items unaffected', () => {
    // quest items an NPC re-gives for free have cost=1
    expect(alch('highlvl_alchemy', 'mm_monkey_talisman')).toBe(1); // cost 1000, was 600
    expect(alch('highlvl_alchemy', 'dagger_wolfbane')).toBe(1); // was 180
    expect(alch('highlvl_alchemy', 'guthixbook_complete')).toBe(1); // was 120
    expect(alch('lowlvl_alchemy', 'felinemedal')).toBe(1); // was 140
    // other items keep their cost-based payouts
    expect(alch('highlvl_alchemy', 'rune_platebody')).toBe(Math.floor((ObjType.get(ObjType.getId('rune_platebody')).cost * 6) / 10));
    expect(alch('highlvl_alchemy', 'mm_monkey_dentures')).toBe(300); // free crate source, deliberately not recosted
    console.log('alch cost checks passed');
});
