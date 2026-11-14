import { expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';

class TestWorker extends EventEmitter {
    postMessage() {}
}
mock.module('worker_threads', () => ({ Worker: TestWorker }));

const { default: World } = await import('../../src/engine/World.js');
const { default: Environment } = await import('../../src/util/Environment.js');
const { default: rsmod } = await import('../../src/engine/routefinder/index.js');
const { default: ObjType } = await import('../../src/cache/config/ObjType.js');
const { default: InvType } = await import('../../src/cache/config/InvType.js');
const { default: LocType } = await import('../../src/cache/config/LocType.js');
const { default: NpcType } = await import('../../src/cache/config/NpcType.js');
const { default: VarPlayerType } = await import('../../src/cache/config/VarPlayerType.js');
const { default: Component } = await import('../../src/cache/config/Component.js');
const { default: FontType } = await import('../../src/cache/config/FontType.js');
const { default: ScriptProvider } = await import('../../src/engine/script/ScriptProvider.js');
const { default: ScriptRunner } = await import('../../src/engine/script/ScriptRunner.js');
const { default: ServerTriggerType } = await import('../../src/engine/script/ServerTriggerType.js');
const { EntityLifeCycle } = await import('../../src/engine/entity/EntityLifeCycle.js');
const { default: Npc } = await import('../../src/engine/entity/Npc.js');
const { NetworkPlayer } = await import('../../src/engine/entity/NetworkPlayer.js');
const { default: NullClientSocket } = await import('../../src/server/NullClientSocket.js');

World.reload(false);
Component.load('data/pack');
FontType.load('data/pack');
Environment.node.members = true;
expect(ScriptProvider.load('data/pack')).toBeGreaterThan(0);

const X = 3200;
const Z = 3200;
for (let dx = -8; dx <= 8; dx += 8) {
    for (let dz = -8; dz <= 8; dz += 8) {
        rsmod.allocateIfAbsent(X + dx, Z + dz, 0);
    }
}

const inv = InvType.getId('inv');
const invCom = Component.getId('inventory:inv');
const parts = ['twpart1', 'twpart2', 'twpart3', 'twpart4'].map(name => ObjType.getId(name));
const [base, stand, barrels, furnace] = parts;
const stages = ['multicannon_base', 'multicannon_stand', 'multicannon_barrels', 'dwarf_multicannon1'].map(name => LocType.getId(name));
const varp = (name: string) => VarPlayerType.getId(name);
const nulodion = new Npc(0, X, Z + 3, 1, 1, EntityLifeCycle.DESPAWN, 1, NpcType.getId('nulodion'), 0 as never);

type P = InstanceType<typeof NetworkPlayer>;
let nextSlot = 1;
function makePlayer(name: string, give: number[]): P {
    const slot = nextSlot++;
    const p = new NetworkPlayer(name, BigInt(slot), BigInt(slot), new NullClientSocket());
    p.slot = slot;
    p.uid = ((Number(p.username37 & 0x1fffffn) << 11) | p.slot) >>> 0;
    (World as any).players[slot] = p;
    p.level = 0;
    p.x = X;
    p.z = Z;
    p.invListenOnCom(inv, invCom, p.uid);
    p.setVar(varp('mcannon'), 11); // ^mcannon_complete
    for (const obj of give) p.invAdd(inv, obj, 1);
    return p;
}

function resume(p: P) {
    // dialogs and p_delay: keep resuming the suspended script until it ends
    for (let i = 0; i < 40 && p.activeScript; i++) {
        p.delayed = false;
        p.executeScript(p.activeScript, true, true);
    }
    expect(p.activeScript).toBeNull();
}

function cannonAt(): InstanceType<typeof import('../../src/engine/entity/Loc.js').default> | null {
    for (const type of stages) {
        const loc = World.getLoc(X - 1, Z - 1, 0, type);
        if (loc) return loc;
    }
    return null;
}

function setUp(p: P) {
    const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELD1, base, ObjType.get(base).category)!;
    expect(script).toBeDefined();
    p.executeScript(ScriptRunner.init(script, p), true);
    resume(p);
}

function opLoc(p: P, trigger: number, useItem: number = -1) {
    const loc = cannonAt()!;
    expect(loc).not.toBeNull();
    if (useItem !== -1) {
        p.lastUseItem = useItem;
        p.lastUseSlot = Array.from({ length: 28 }, (_, slot) => p.invGetSlot(inv, slot)?.id).indexOf(useItem);
    }
    const script = ScriptProvider.getByTrigger(trigger, loc.type, LocType.get(loc.type).category)!;
    expect(script).toBeDefined();
    p.executeScript(ScriptRunner.init(script, p, loc), true);
    resume(p);
}

function askNulodion(p: P) {
    const script = ScriptProvider.getByName('[label,lost_my_cannon]')!;
    expect(script).toBeDefined();
    p.executeScript(ScriptRunner.init(script, p, nulodion), true);
    resume(p);
}

// one world tick: players have acted, now zones run (Loc.turn), then the clock advances
function endTick() {
    cannonAt()?.turn();
    World.currentTick++;
}

function letCannonDecay() {
    let ticks = 0;
    while (cannonAt()) {
        endTick();
        expect(++ticks).toBeLessThanOrEqual(2500);
    }
    return ticks;
}

const held = (p: P) => parts.reduce((sum, obj) => sum + p.invTotal(inv, obj), 0);

test('a stale cannon coord gives no claim on another player\'s cannon', () => {
    World.currentTick = 1000;
    const a = makePlayer('cannona', [base, stand, barrels, furnace]);
    const b = makePlayer('cannonb', [base, stand, barrels, furnace]);
    const total = () => held(a) + held(b) + (cannonAt() ? stages.indexOf(cannonAt()!.type) + 1 : 0);
    expect(total()).toBe(8);

    // the owner can build on and pick up their own cannon
    setUp(a);
    expect(cannonAt()?.type).toBe(stages[0]);
    opLoc(a, ServerTriggerType.OPLOCU, stand);
    expect(cannonAt()?.type).toBe(stages[1]);
    World.currentTick += 2000; // the stand restarted the decay, so this is still a's cannon
    cannonAt()!.setLifeCycle(500);
    opLoc(a, ServerTriggerType.OPLOC1);
    expect(cannonAt()).toBeNull();
    expect(held(a)).toBe(4);
    expect(a.getVar(varp('ownedmcannon'))).toBe(-1);

    // a sets up a base and lets it decay: a is now owed one part, and still points at the tile
    setUp(a);
    expect(letCannonDecay()).toBe(2500);
    expect(held(a)).toBe(3);
    expect(a.getVar(varp('ownedmcannon'))).not.toBe(-1);

    // b sets up on the same tile the moment it is free
    setUp(b);
    expect(cannonAt()?.type).toBe(stages[0]);
    expect(held(b)).toBe(3);

    // a can neither build on b's cannon nor pick it up
    opLoc(a, ServerTriggerType.OPLOCU, stand);
    expect(cannonAt()?.type).toBe(stages[0]);
    opLoc(a, ServerTriggerType.OPLOC1);
    expect(cannonAt()?.type).toBe(stages[0]);
    expect(held(a)).toBe(3);

    // b carries on; a still cannot finish or take it
    opLoc(b, ServerTriggerType.OPLOCU, stand);
    opLoc(b, ServerTriggerType.OPLOCU, barrels);
    expect(cannonAt()?.type).toBe(stages[2]);
    opLoc(a, ServerTriggerType.OPLOCU, furnace);
    expect(cannonAt()?.type).toBe(stages[2]);
    opLoc(a, ServerTriggerType.OPLOC1);
    expect(cannonAt()?.type).toBe(stages[2]);
    expect(held(a)).toBe(3);

    // Nulodion replaces exactly what a lost, once
    askNulodion(a);
    expect(held(a)).toBe(4);
    expect(a.getVar(varp('ownedmcannon'))).toBe(-1);
    askNulodion(a);
    expect(held(a)).toBe(4);

    // b's cannon is standing, so Nulodion gives b nothing; b picks up what b put down
    askNulodion(b);
    expect(held(b)).toBe(1);
    opLoc(b, ServerTriggerType.OPLOC1);
    expect(cannonAt()).toBeNull();
    expect(held(b)).toBe(4);
    askNulodion(b);
    expect(held(a) + held(b)).toBe(8);

    // a claim from another server boot is not a claim on what stands there now
    setUp(b);
    a.setVar(varp('ownedmcannon'), b.getVar(varp('ownedmcannon')));
    a.setVar(varp('dropcannon'), 4);
    a.setVar(varp('cannon_boot'), (b.getVar(varp('cannon_boot')) as number) - 60);
    a.setVar(varp('cannon_expiry'), World.currentTick + 100000);
    opLoc(a, ServerTriggerType.OPLOC1);
    expect(cannonAt()?.type).toBe(stages[0]);
    expect(held(a)).toBe(4);

    console.log('cannon ownership checks passed');
});
