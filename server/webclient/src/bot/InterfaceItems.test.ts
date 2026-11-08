import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ComponentType } from '#/config/IfType.js';

import { collectInterfaceInventories, resolveInterfaceItem } from './InterfaceItems.js';

const objOf = (id: number) => ({ id, name: `obj${id}`, iop: id === 7 ? [null, null, null, null, 'Move'] : null });

function inv(raw: number[], extra: Record<string, unknown> = {}): any {
    return { type: ComponentType.TYPE_INV, linkObjType: Int32Array.from(raw), linkObjNumber: Int32Array.from(raw.map(r => (r > 0 ? 2 : 0))), layerId: 1, objOps: true, children: null, ...extra };
}

describe('collectInterfaceInventories', () => {
    test('finds the grids in the tree, listing only non-empty slots with the real obj id', () => {
        const list: any[] = [];
        list[1] = { type: ComponentType.TYPE_LAYER, children: [2, 3] };
        list[2] = inv([0, 8, 0]);
        list[3] = { type: ComponentType.TYPE_LAYER, children: [4] };
        list[4] = inv([1]);
        expect(collectInterfaceInventories(list, 1, objOf)).toEqual([
            { componentId: 2, size: 3, items: [{ slot: 1, id: 7, name: 'obj7', count: 2 }] },
            { componentId: 4, size: 1, items: [{ slot: 0, id: 0, name: 'obj0', count: 2 }] }
        ]);
    });

    test('leaves big grids out and returns nothing without a modal', () => {
        const list: any[] = [];
        list[1] = { type: ComponentType.TYPE_LAYER, children: [2] };
        list[2] = inv(new Array(576).fill(0));
        expect(collectInterfaceInventories(list, 1, objOf)).toEqual([]);
        expect(collectInterfaceInventories(list, -1, objOf)).toEqual([]);
    });
});

describe('resolveInterfaceItem', () => {
    test('resolves an item option and accepts the always-offered Drop', () => {
        expect(resolveInterfaceItem(inv([8]), 0, 5, [1], objOf)).toEqual({ itemId: 7 });
        expect(resolveInterfaceItem(inv([1]), 0, 5, [1], objOf)).toEqual({ itemId: 0 });
    });

    test('names the failure', () => {
        expect(resolveInterfaceItem(inv([8]), 0, 5, [99], objOf)).toEqual({ reason: 'interface_not_open' });
        expect(resolveInterfaceItem(inv([8]), 0, 1, [1], objOf)).toEqual({ reason: 'invalid_option' });
        expect(resolveInterfaceItem(inv([0]), 0, 5, [1], objOf)).toEqual({ reason: 'item_not_found' });
        expect(resolveInterfaceItem(inv([8], { objOps: false }), 0, 5, [1], objOf)).toEqual({ reason: 'invalid_target' });
        expect(resolveInterfaceItem(undefined, 0, 5, [1], objOf)).toEqual({ reason: 'invalid_target' });
    });

    test("the sliding puzzle is what this is for: an obj iop on a non-main grid", () => {
        const content = join(import.meta.dir, '../../../content/scripts');
        const script = readFileSync(join(content, 'quests/quest_mm/scripts/mm_puzzle.rs2'), 'utf8');
        const obj = readFileSync(join(content, 'quests/quest_mm/configs/quest_mm.obj'), 'utf8');
        expect(script).toContain('[opheld5,_mm_reinit]');
        expect(obj).toMatch(/\[reinitialisation_01\][^[]*iop5=Move[^[]*category=mm_reinit/);
    });
});
