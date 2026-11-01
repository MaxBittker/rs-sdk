import { expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CompileServerScript } from '@lostcityrs/runescript';

const output = process.env.FOUNTAIN_GLORY_TEST_OUTPUT!;
const cache = resolve('data/pack');
const compile = CompileServerScript;
mkdirSync(`${output}/source`);
copyFileSync(resolve('../content/scripts/engine.rs2'), `${output}/source/engine.rs2`);
copyFileSync(resolve('../content/scripts/player/scripts/inventory.rs2'), `${output}/source/inventory.rs2`);
copyFileSync(
    resolve('../content/scripts/areas/areas_heroes_guild/scripts/fountain_of_heroes.rs2'),
    `${output}/source/fountain_of_heroes.rs2`
);
writeFileSync(`${output}/source/stubs.constant`, '^dm_default = 0\n');
writeFileSync(
    `${output}/source/stubs.rs2`,
    [
        '[proc,objbox](namedobj $item, string $message, int $zoom, int $xoffset, int $yoffset)',
        'return;',
        '[proc,displaymessage](int $type)',
        'return;'
    ].join('\n')
);

mock.module('@lostcityrs/runescript', () => ({
    CompileServerScript: (config: Parameters<typeof CompileServerScript>[0]) =>
        compile({ ...config, sourcePaths: [`${output}/source`], writer: { jag: { output: `${output}/server` } } })
}));
const { runServerCompiler } = await import('../../tools/pack/Compiler.js');
runServerCompiler();

mkdirSync(`${output}/data/config`, { recursive: true });
copyFileSync(resolve('data/config/private.pem'), `${output}/data/config/private.pem`);
process.chdir(output);
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
const { default: Component } = await import('../../src/cache/config/Component.js');
const { default: ScriptProvider } = await import('../../src/engine/script/ScriptProvider.js');
const { default: ScriptRunner } = await import('../../src/engine/script/ScriptRunner.js');
const { default: ServerTriggerType } = await import('../../src/engine/script/ServerTriggerType.js');
const { Interaction } = await import('../../src/engine/entity/Interaction.js');
const { EntityLifeCycle } = await import('../../src/engine/entity/EntityLifeCycle.js');
const { default: Loc } = await import('../../src/engine/entity/Loc.js');
const { NetworkPlayer } = await import('../../src/engine/entity/NetworkPlayer.js');
const { default: NullClientSocket } = await import('../../src/server/NullClientSocket.js');
const { default: OpLocU } = await import('../../src/network/game/client/model/OpLocU.js');
const { default: InvButtonD } = await import('../../src/network/game/client/model/InvButtonD.js');
const { default: OpLocUHandler } = await import('../../src/network/game/client/handler/OpLocUHandler.js');
const { default: InvButtonDHandler } = await import('../../src/network/game/client/handler/InvButtonDHandler.js');
const { default: Packet } = await import('../../src/io/Packet.js');
const { default: ResumePCountDialogDecoder } = await import('../../src/network/game/client/codec/ResumePCountDialogDecoder.js');

ObjType.load(cache);
InvType.load(cache);
LocType.load(cache);
Component.load(cache);
Environment.node.members = true;
rsmod.allocateIfAbsent(3199, 3200, 0);
rsmod.allocateIfAbsent(3200, 3200, 0);
expect(ScriptProvider.load(output)).toBeGreaterThan(0);

const inv = InvType.getId('inv');
const invCom = Component.getId('inventory:inv');
const glory3 = ObjType.getId('amulet_of_glory_3');
const glory4 = ObjType.getId('amulet_of_glory_4');
const tinderbox = ObjType.getId('tinderbox');
const fountainType = LocType.getId('fountain_of_heroes');
const fountainLocType = LocType.get(fountainType);
const fountain = new Loc(0, 3200, 3200, fountainLocType.width, fountainLocType.length, EntityLifeCycle.DESPAWN, fountainType, 10, 0);
World.addLoc(fountain, 1000);

let nextSlot = 1;
function makePlayer() {
    const slot = nextSlot++;
    const p = new NetworkPlayer(`glorytest${slot}`, BigInt(slot), BigInt(slot), new NullClientSocket());
    p.slot = slot;
    p.uid = ((Number(p.username37 & 0x1fffffn) << 11) | p.slot) >>> 0;
    (World as any).players[slot] = p;
    p.level = 0;
    p.x = 3199;
    p.z = 3200;
    p.originX = 3200;
    p.originZ = 3200;
    p.tabs[3] = Component.get(invCom).rootLayer;
    p.invListenOnCom(inv, invCom, p.uid);
    return p;
}

test('same-tick or mid-walk inventory drag cannot duplicate Amulet of Glory at Fountain of Heroes', () => {
    const opLocUHandler = new OpLocUHandler();
    const invButtonDHandler = new InvButtonDHandler();

    // 1. Normal recharge in place works.
    const normal = makePlayer();
    normal.invSet(inv, glory3, 1, 0);
    expect(opLocUHandler.handle(new OpLocU(fountain.x, fountain.z, fountain.type, glory3, 0, invCom), normal)).toBe(true);
    normal.processInteraction();
    expect(normal.invGetSlot(inv, 0)?.id).toBe(glory4);
    expect(normal.invTotal(inv, glory3)).toBe(0);
    expect(normal.invTotal(inv, glory4)).toBe(1);

    // 2. Exploiting OPLOCU + INV_BUTTOND to an empty slot in the same tick cancels the interaction and does not dupe.
    const draggedToEmpty = makePlayer();
    draggedToEmpty.invSet(inv, glory3, 1, 0);
    expect(opLocUHandler.handle(new OpLocU(fountain.x, fountain.z, fountain.type, glory3, 0, invCom), draggedToEmpty)).toBe(true);
    expect(invButtonDHandler.handle(new InvButtonD(invCom, 0, 1), draggedToEmpty)).toBe(true);
    draggedToEmpty.processInteraction();
    expect(draggedToEmpty.invGetSlot(inv, 0)).toBeNull();
    expect(draggedToEmpty.invGetSlot(inv, 1)?.id).toBe(glory3);
    expect(draggedToEmpty.invTotal(inv, glory3)).toBe(1);
    expect(draggedToEmpty.invTotal(inv, glory4)).toBe(0);

    // 3. Swapping another item into last_useslot before interaction runs does not overwrite that item or dupe.
    const swapped = makePlayer();
    swapped.invSet(inv, glory3, 1, 0);
    swapped.invSet(inv, tinderbox, 1, 1);
    expect(opLocUHandler.handle(new OpLocU(fountain.x, fountain.z, fountain.type, glory3, 0, invCom), swapped)).toBe(true);
    expect(invButtonDHandler.handle(new InvButtonD(invCom, 0, 1), swapped)).toBe(true);
    swapped.processInteraction();
    expect(swapped.invGetSlot(inv, 0)?.id).toBe(tinderbox);
    expect(swapped.invGetSlot(inv, 1)?.id).toBe(glory3);
    expect(swapped.invTotal(inv, glory3)).toBe(1);
    expect(swapped.invTotal(inv, glory4)).toBe(0);

    // 4. tryInteract clears the interaction if lastUseSlot no longer holds lastUseItem, and ResumePCountDialogDecoder clamps negative counts.
    const tryInteractPlayer = makePlayer();
    tryInteractPlayer.invSet(inv, glory3, 1, 1);
    tryInteractPlayer.lastUseItem = glory3;
    tryInteractPlayer.lastUseSlot = 0;
    tryInteractPlayer.setInteraction(Interaction.ENGINE, fountain, ServerTriggerType.APLOCU, glory3);
    expect(tryInteractPlayer.tryInteract(true)).toBe(false);
    expect(tryInteractPlayer.target).toBeNull();
    expect(tryInteractPlayer.invGetSlot(inv, 0)).toBeNull();
    expect(tryInteractPlayer.invGetSlot(inv, 1)?.id).toBe(glory3);
    expect(tryInteractPlayer.invTotal(inv, glory4)).toBe(0);

    const decoder = new ResumePCountDialogDecoder();
    const negBuf = new Packet(new Uint8Array(4));
    negBuf.p4(-100);
    negBuf.pos = 0;
    expect(decoder.decode(negBuf).input).toBe(0);

    console.log('Fountain of Heroes glory checks passed');
});
