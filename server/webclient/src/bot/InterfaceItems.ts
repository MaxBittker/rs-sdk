// Items held in inventory components other than the main inventory: reading
// them for the published state, and resolving an item's own option on them.
// Shared by the browser Client and the LiteClient.

import type IfType from '#/config/IfType.js';
import { ComponentType } from '#/config/IfType.js';
import { ClientProt } from '#/io/ClientProt.js';

/** A grid inside the open modal, e.g. a puzzle's pieces. */
export interface InterfaceInventory {
    /** Pass to `sendUseInterfaceItem`. */
    componentId: number;
    /** Slots in the grid; `items` lists only the non-empty ones. */
    size: number;
    items: Array<{ slot: number; id: number; name: string; count: number }>;
}

/** Bigger grids (the bank) are published separately and would bloat every tick. */
const MAX_PUBLISHED_SLOTS = 64;

export type ObjLookup = (rawId: number) => { id: number; name: string | null; iop?: (string | null)[] | null };

export const OPHELD_OPCODES = [ClientProt.OPHELD1, ClientProt.OPHELD2, ClientProt.OPHELD3, ClientProt.OPHELD4, ClientProt.OPHELD5];

/** Inventory components in the modal's tree, with what the server has put in them. */
export function collectInterfaceInventories(list: IfType[], rootId: number, objOf: ObjLookup): InterfaceInventory[] {
    const found: InterfaceInventory[] = [];
    const visit = (comId: number, depth: number): void => {
        const com = list[comId];
        if (!com || depth > 8) {
            return;
        }
        if (com.type === ComponentType.TYPE_INV && com.linkObjType && com.linkObjType.length <= MAX_PUBLISHED_SLOTS) {
            const items: InterfaceInventory['items'] = [];
            for (let slot = 0; slot < com.linkObjType.length; slot++) {
                const raw = com.linkObjType[slot];
                if (raw > 0) {
                    const obj = objOf(raw - 1);
                    items.push({ slot, id: obj.id, name: obj.name ?? `Unknown(${obj.id})`, count: com.linkObjNumber?.[slot] ?? 1 });
                }
            }
            found.push({ componentId: comId, size: com.linkObjType.length, items });
        }
        for (const childId of com.children ?? []) {
            visit(childId, depth + 1);
        }
    };
    if (rootId !== -1) {
        visit(rootId, 0);
    }
    return found;
}

export type InterfaceItemFailure = 'invalid_target' | 'interface_not_open' | 'item_not_found' | 'invalid_option';

/**
 * What the client's own menu would send for this item option: OPHELDn needs
 * the obj id, and the component has to be open or the server ignores it.
 * `openRoots` are the interfaces on screen (main modal, chat, side, tabs).
 */
export function resolveInterfaceItem(
    com: IfType | undefined,
    slot: number,
    optionIndex: number,
    openRoots: number[],
    objOf: ObjLookup
): { itemId: number } | { reason: InterfaceItemFailure } {
    if (!Number.isInteger(optionIndex) || optionIndex < 1 || optionIndex > 5) {
        return { reason: 'invalid_option' };
    }
    if (!com?.linkObjType || !com.objOps || !Number.isInteger(slot) || slot < 0 || slot >= com.linkObjType.length) {
        return { reason: 'invalid_target' };
    }
    if (!openRoots.includes(com.layerId)) {
        return { reason: 'interface_not_open' };
    }
    const raw = com.linkObjType[slot];
    if (raw <= 0) {
        return { reason: 'item_not_found' };
    }
    const obj = objOf(raw - 1);
    // Option 5 is always offered: the menu falls back to "Drop".
    if (optionIndex !== 5 && !obj.iop?.[optionIndex - 1]) {
        return { reason: 'invalid_option' };
    }
    return { itemId: obj.id };
}
