import { expect, test } from 'bun:test';
import '../lite/dom-shim.js';
import IfType, { ButtonType } from '#/config/IfType.js';
import { collectInterfaceSnapshot } from './interface-snapshot.js';

function component(id: number, fields: Partial<IfType>): IfType {
    return Object.assign(new IfType(), { id }, fields);
}

function puzzleTable(): IfType[] {
    const table: IfType[] = [];
    table[1] = component(1, { type: 0, width: 512, height: 334, children: [2, 3, 4], childX: [10, 10, 10], childY: [10, 110, 140] });
    table[2] = component(2, { type: 6, width: 100, height: 100, model1Type: 4, model1Id: 3075, modelZoom: 900, modelXAn: 128, modelYAn: 256 });
    table[3] = component(3, { type: 4, width: 200, height: 15, text: 'Which shape is Red?' });
    table[4] = component(4, { type: 5, width: 80, height: 20, buttonType: 1, buttonText: 'Ok' });
    return table;
}

const circle = () => ({ model: 3676, recol_s: Uint16Array.of(115), recol_d: Uint16Array.of(1703), countobj: null, countco: null });

test('collects bounded UI text, tooltip and object visual metadata without loading meshes', () => {
    const snapshot = collectInterfaceSnapshot(1, puzzleTable(), circle);
    expect(snapshot).toMatchObject({ version: 1, rootId: 1, truncated: false });
    expect(snapshot.components.map(c => c.id)).toEqual([1, 2, 3, 4]);
    expect(snapshot.components[1]).toMatchObject({
        id: 2,
        parentId: 1,
        type: 6,
        contentResolved: true,
        bounds: { x: 10, y: 10, width: 100, height: 100 },
        model: { kind: 'object', sourceId: 3075, objectId: 3075, meshId: 3676, recolours: [{ source: 115, destination: 1703 }], zoom: 900, rotationX: 128, rotationY: 256 }
    });
    expect(snapshot.components[2].text).toBe('Which shape is Red?');
    expect(snapshot.components[3]).toMatchObject({ text: null, tooltip: 'Ok' });
});

test('omits closed interfaces, hidden layers and nominally clipped descendants', () => {
    expect(collectInterfaceSnapshot(-1, [])).toEqual({ version: 1, rootId: -1, components: [], truncated: false });
    const table = puzzleTable();
    table[5] = component(5, { type: 0, width: 100, height: 100, hide: true, children: [6], childX: [0], childY: [0] });
    table[6] = component(6, { type: 4, width: 100, height: 20, text: 'Not visible' });
    table[1].children!.push(5, 6);
    table[1].childX!.push(0, 600);
    table[1].childY!.push(0, 0);
    expect(collectInterfaceSnapshot(1, table, circle).components.map(c => c.id)).toEqual([1, 2, 3, 4]);
});

test('accounts for child offsets and nested layer scrolling without mutating cache data', () => {
    const table: IfType[] = [];
    table[1] = component(1, { type: 0, width: 300, height: 200, children: [2], childX: [20], childY: [30] });
    table[2] = component(2, { type: 0, width: 100, height: 80, scrollHeight: 200, scrollPos: 40, children: [3], childX: [5], childY: [60], x: 2, y: 3 });
    table[3] = component(3, { type: 4, width: 50, height: 20, text: 'Scrolled', x: 1, y: 2 });
    const old = table[2].scrollPos;
    expect(collectInterfaceSnapshot(1, table).components[2].bounds).toEqual({ x: 28, y: 55, width: 50, height: 20 });
    expect(table[2].scrollPos).toBe(old);
});

test('marks conditional, client-generated and substituted content unresolved instead of exposing alternatives', () => {
    const table = puzzleTable();
    table[2].scriptComparator = Uint8Array.of(1);
    table[2].model2Id = 9999;
    table[3].text = 'Level: %1';
    table[4].clientCode = 1;
    const snapshot = collectInterfaceSnapshot(1, table, () => {
        throw new Error('Must not resolve hidden model variants');
    });
    expect(snapshot.components[1]).toMatchObject({ contentResolved: false, model: null, unresolvedReason: 'conditional' });
    expect(snapshot.components[2]).toMatchObject({ contentResolved: false, text: null, unresolvedReason: 'dynamic_text' });
    expect(snapshot.components[3]).toMatchObject({ contentResolved: false, unresolvedReason: 'client_generated' });
    expect(JSON.stringify(snapshot)).not.toContain('9999');
    expect(JSON.stringify(snapshot)).not.toContain('scriptComparator');
});

test('marks type-4 BUTTON_CONTINUE text as client-generated instead of exposing configured content', () => {
    const table = puzzleTable();
    table[3].buttonType = ButtonType.BUTTON_CONTINUE;
    table[3].text = 'Click here to continue';
    const snapshot = collectInterfaceSnapshot(1, table, circle);
    expect(snapshot.components[2]).toMatchObject({
        id: 3,
        type: 4,
        buttonType: ButtonType.BUTTON_CONTINUE,
        text: null,
        contentResolved: false,
        unresolvedReason: 'client_generated'
    });
    expect(snapshot.truncated).toBe(false);
});

test('distinguishes raw mesh/head namespaces and handles unknown model kinds or missing cache definitions', () => {
    const table = puzzleTable();
    for (const [type, kind] of [
        [1, 'raw'],
        [2, 'npc_head'],
        [3, 'player_head']
    ] as const) {
        table[2].model1Type = type;
        const node = collectInterfaceSnapshot(1, table, () => {
            throw new Error('Must not fetch object or mesh');
        }).components[1];
        expect(node.model).toMatchObject({ kind, sourceId: 3075, objectId: null, meshId: type === 1 ? 3075 : null });
    }
    table[2].model1Type = 5;
    expect(collectInterfaceSnapshot(1, table).components[1]).toMatchObject({ contentResolved: false, unresolvedReason: 'unsupported_model_type', model: null });
    table[2].model1Type = 4;
    expect(
        collectInterfaceSnapshot(1, table, () => {
            throw new Error('Cache unavailable');
        }).components[1]
    ).toMatchObject({ contentResolved: false, unresolvedReason: 'missing_object_definition', model: { objectId: 3075, meshId: null, recolours: null } });
});

test('uses the same count-50 object variant as the interface renderer and copies recolours', () => {
    const variant = circle();
    const original = { ...circle(), countobj: Uint16Array.of(100, 200), countco: Uint16Array.of(10, 60) };
    const snapshot = collectInterfaceSnapshot(1, puzzleTable(), id => (id === 3075 ? original : variant));
    expect(snapshot.components[1].model).toMatchObject({ sourceId: 3075, objectId: 3075, definitionObjectId: 100, meshId: 3676 });
    variant.recol_d[0] = 42;
    expect(snapshot.components[1].model?.recolours).toEqual([{ source: 115, destination: 1703 }]);
});

test('bounds text, component count, depth, cycles and missing component work', () => {
    const table = puzzleTable();
    table[3].text = 'x'.repeat(2000);
    let snapshot = collectInterfaceSnapshot(1, table, circle);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.components.find(c => c.id === 3)?.text?.length).toBe(1024);
    table[3].text = 'short';
    table[1].children!.push(1);
    table[1].childX!.push(0);
    table[1].childY!.push(0);
    expect(collectInterfaceSnapshot(1, table, circle).truncated).toBe(true);
    table[1].children = [];
    table[1].childX = [];
    table[1].childY = [];
    for (let id = 10; id < 400; id++) {
        table[id] = component(id, { type: 4, width: 10, height: 10, text: 'node' });
        table[1].children.push(id);
        table[1].childX.push(0);
        table[1].childY.push(0);
    }
    snapshot = collectInterfaceSnapshot(1, table);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.components.length).toBe(256);
    expect(collectInterfaceSnapshot(9999, table).truncated).toBe(true);
});

test('bounds work even when a malformed root contains thousands of missing children', () => {
    const table = puzzleTable();
    table[1].children = Array(2000).fill(9999);
    table[1].childX = Array(2000).fill(0);
    table[1].childY = Array(2000).fill(0);
    let missingReads = 0;
    const tracked = new Proxy(table, {
        get(target, key, receiver) {
            if (key === '9999') missingReads++;
            return Reflect.get(target, key, receiver);
        }
    });
    expect(collectInterfaceSnapshot(1, tracked).truncated).toBe(true);
    expect(missingReads).toBeLessThanOrEqual(512);
});

test('bounds deeply nested visible layers', () => {
    const table: IfType[] = [];
    for (let id = 1; id <= 30; id++) table[id] = component(id, { type: 0, width: 100, height: 100, children: [id + 1], childX: [0], childY: [0] });
    const snapshot = collectInterfaceSnapshot(1, table);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.components.length).toBeLessThanOrEqual(16 + 1);
});
