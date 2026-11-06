// The numeric fields of each BotAction, checked before an action reaches the
// game client. The client trusts them: a field JSON dropped arrives as
// undefined, and e.g. LocType.list(undefined) used to decode from position NaN
// forever, hanging the page. server/webclient/src/bot/actionFields.ts is the client's
// copy; keep them equal (sdk/test/action-fields.test.ts checks).

import type { BotAction } from './types';

interface ActionFields {
    /** Must be integers. */
    required: readonly string[];
    /** Must be integers when present. */
    optional: readonly string[];
}

const NO_FIELDS: ActionFields = { required: [], optional: [] };

export const ACTION_NUMERIC_FIELDS: Record<BotAction['type'], ActionFields> = {
    none: NO_FIELDS,
    acceptCharacterDesign: NO_FIELDS,
    randomizeCharacterDesign: NO_FIELDS,
    closeShop: NO_FIELDS,
    closeModal: NO_FIELDS,
    say: NO_FIELDS,
    privateMessage: NO_FIELDS,
    searchGE: NO_FIELDS,
    wait: { required: [], optional: ['ticks'] },
    talkToNpc: { required: ['npcIndex'], optional: [] },
    interactNpc: { required: ['npcIndex', 'optionIndex'], optional: [] },
    interactPlayer: { required: ['playerIndex', 'optionIndex'], optional: [] },
    clickDialogOption: { required: ['optionIndex'], optional: [] },
    clickComponent: { required: ['componentId'], optional: [] },
    clickComponentWithOption: { required: ['componentId', 'optionIndex'], optional: ['slot'] },
    walkTo: { required: ['x', 'z'], optional: [] },
    useInventoryItem: { required: ['slot', 'optionIndex'], optional: ['interfaceId'] },
    dropItem: { required: ['slot'], optional: [] },
    pickupItem: { required: ['x', 'z', 'itemId'], optional: [] },
    interactGroundItem: { required: ['x', 'z', 'itemId', 'optionIndex'], optional: [] },
    interactLoc: { required: ['x', 'z', 'locId', 'optionIndex'], optional: [] },
    useItemOnItem: { required: ['sourceSlot', 'targetSlot'], optional: [] },
    useItemOnLoc: { required: ['itemSlot', 'x', 'z', 'locId'], optional: [] },
    useItemOnNpc: { required: ['itemSlot', 'npcIndex'], optional: [] },
    useEquipmentItem: { required: ['slot', 'optionIndex'], optional: [] },
    shopBuy: { required: ['slot', 'amount'], optional: [] },
    shopSell: { required: ['slot', 'amount'], optional: [] },
    setCombatStyle: { required: ['style'], optional: [] },
    spellOnNpc: { required: ['npcIndex', 'spellComponent'], optional: [] },
    spellOnPlayer: { required: ['playerIndex', 'spellComponent'], optional: [] },
    spellOnItem: { required: ['slot', 'spellComponent'], optional: [] },
    spellOnGroundItem: { required: ['x', 'z', 'itemId', 'spellComponent'], optional: [] },
    setTab: { required: ['tabIndex'], optional: [] },
    bankDeposit: { required: ['slot', 'amount'], optional: [] },
    bankWithdraw: { required: ['slot', 'amount'], optional: [] },
    submitCountDialog: { required: ['value'], optional: [] },
    scanNearbyLocs: { required: [], optional: ['radius'] },
    scanGroundItems: { required: [], optional: ['radius'] },
    togglePrayer: { required: ['prayerIndex'], optional: [] },
};

/**
 * Why `action` must not be dispatched, or null if its numeric fields are
 * sound. Ranges (slots, option indexes, scene bounds) are the client's job.
 */
export function invalidActionFields(action: unknown): string | null {
    if (!action || typeof action !== 'object') return 'action is not an object';
    const a = action as Record<string, unknown>;
    if (typeof a.type !== 'string') return 'action has no type';
    const fields = (ACTION_NUMERIC_FIELDS as Record<string, ActionFields | undefined>)[a.type];
    if (!fields) return `unknown action type: ${a.type}`;
    const bad: string[] = [];
    for (const f of fields.required) {
        if (!Number.isInteger(a[f])) bad.push(`${f}=${a[f] === undefined ? 'missing' : JSON.stringify(a[f])}`);
    }
    for (const f of fields.optional) {
        if (a[f] !== undefined && !Number.isInteger(a[f])) bad.push(`${f}=${JSON.stringify(a[f])}`);
    }
    return bad.length ? `${a.type}: ${bad.join(', ')} (expected integers)` : null;
}
