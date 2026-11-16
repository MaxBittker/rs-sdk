import { expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Runs the real compiled server scripts (data/pack, built by `bun run build`).
const output = process.env.TRAIL_TEST_OUTPUT!;
const cache = resolve('data/pack');
mkdirSync(`${output}/data/config`, { recursive: true });
copyFileSync(resolve('data/config/private.pem'), `${output}/data/config/private.pem`);
process.chdir(output);
class TestWorker extends EventEmitter { postMessage() {} }
mock.module('worker_threads', () => ({ Worker: TestWorker }));
await import('../../src/engine/World.js');
const config = '../../src/cache/config/';
const loaded: Record<string, any> = {};
for (const name of ['VarPlayerType', 'VarBitType', 'ParamType', 'ObjType', 'LocType', 'NpcType', 'IdkType', 'SpotanimType', 'CategoryType', 'EnumType', 'StructType', 'InvType', 'MesanimType', 'DbTableType', 'DbRowType', 'HuntType', 'VarNpcType', 'VarSharedType', 'FontType']) {
    loaded[name] = (await import(`${config}${name}.js`)).default;
    loaded[name].load(cache);
}
const { default: DbTableIndex } = await import('../../src/cache/config/DbTableIndex.js');
DbTableIndex.init();
const { default: Component } = await import('../../src/cache/config/Component.js');
Component.load(cache);
const { ObjType, InvType, NpcType, VarPlayerType, ParamType } = loaded;
const { default: ScriptProvider } = await import('../../src/engine/script/ScriptProvider.js');
const { default: ScriptRunner } = await import('../../src/engine/script/ScriptRunner.js');
const { default: ScriptState } = await import('../../src/engine/script/ScriptState.js');
const { default: ScriptPointer } = await import('../../src/engine/script/ScriptPointer.js');
const { NetworkPlayer } = await import('../../src/engine/entity/NetworkPlayer.js');
const { default: Npc } = await import('../../src/engine/entity/Npc.js');
const { EntityLifeCycle } = await import('../../src/engine/entity/EntityLifeCycle.js');
const { BlockWalk } = await import('../../src/engine/entity/BlockWalk.js');
const { default: NullClientSocket } = await import('../../src/server/NullClientSocket.js');
expect(ScriptProvider.load(cache)).toBeGreaterThan(0);

const inv = InvType.getId('inv');
const clue = ObjType.getId('trail_clue_medium_anagram006');
const challenge = ObjType.getId('trail_clue_medium_anagram006_challenge');
const answer = ObjType.get(challenge).params.get(ParamType.getId('trail_challenge_answer')) as number;
const trailStatus = VarPlayerType.getId('trail_status');

function player() {
    const p = new NetworkPlayer('trailtest', 1n, 1n, new NullClientSocket());
    p.members = true;
    p.invAdd(inv, clue, 1);
    p.invAdd(inv, challenge, 1);
    return p;
}

function run(p: InstanceType<typeof NetworkPlayer>, atDialog?: () => void) {
    const npc = new Npc(0, 3273, 3180, 1, 1, EntityLifeCycle.FOREVER, 1, NpcType.getId('kebab_seller'), BlockWalk.NPC);
    const script = ScriptProvider.getByName('[opnpc1,kebab_seller]')!;
    expect(script).toBeDefined();
    const state = ScriptRunner.init(script, p, npc);
    state.pointerAdd(ScriptPointer.ProtectedActivePlayer);
    let asked = false;
    for (let step = 0; step < 50; step++) {
        const execution = ScriptRunner.execute(state);
        expect(execution).not.toBe(ScriptState.ABORTED);
        if (execution === ScriptState.FINISHED) return asked;
        if (execution === ScriptState.COUNTDIALOG) {
            asked = true;
            atDialog?.();
            state.lastInt = answer;
        }
    }
    throw new Error('challenge script did not finish');
}

const held = (p: InstanceType<typeof NetworkPlayer>) => {
    const items: number[] = [];
    for (let slot = 0; slot < p.invSize(inv); slot++) {
        const item = p.invGetSlot(inv, slot);
        if (item) items.push(item.id);
    }
    return items;
};

test('challenge answer pays only while both scrolls are still held', () => {
    // control: honest answer consumes clue + challenge and advances the trail
    const honest = player();
    expect(run(honest)).toBe(true);
    // the replacement clue is random and can be this same anagram again, so only count items
    expect(honest.invTotal(inv, challenge)).toBe(0);
    expect(held(honest).length).toBe(1);
    expect(honest.vars[trailStatus]).toBe(1);

    // exploit: drop the clue (or the challenge) while the count dialog is open
    for (const dropped of [clue, challenge]) {
        const p = player();
        expect(run(p, () => p.invDel(inv, dropped, 1))).toBe(true);
        expect(held(p)).toEqual([dropped === clue ? challenge : clue]);
        expect(p.vars[trailStatus]).toBe(0);
    }
    console.log('Trail challenge checks passed');
});
