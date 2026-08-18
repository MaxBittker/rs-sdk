// The client-side action + accessor surface the bot bridge calls.
//
// Ported from the rs-sdk bot methods inside Client.ts. Two rules govern every
// interaction packet here, and both come from PATCHES.md:
//
//  1. WALK BEFORE OP. 274 runs clientRoutefinder=true, so the server does not
//     pathfind to interaction targets. Every OPLOC/OPNPC/OPPLAYER/OPOBJ must be
//     preceded by a MOVE_OPCLICK route or the server answers "I can't reach that!".
//  2. Inventory item ids on the wire are `ObjType.list(raw - 1).id`, not the raw
//     linkObjType slot value.
//
// Failure `reason` strings match Client.ts's ClientActionFailureReason exactly,
// because BotActions in the SDK branches on them.

import IfType, { ButtonType, ComponentType } from '#/config/IfType.js';
import LocType from '#/config/LocType.js';
import ObjType from '#/config/ObjType.js';
import VarBitType from '#/config/VarBitType.js';
import { ClientCode } from '#/client/ClientCode.js';
import Skill from '#/client/Skill.js';

import JString from '#/datastruct/JString.js';
import { ClientProt } from '#/io/ClientProt.js';
import WordFilter from '#/wordfilter/WordFilter.js';
import WordPack from '#/wordfilter/WordPack.js';

import type { ClientActionResult, LiteClient } from './LiteClient.js';
import { tryMoveTo } from './movement.js';

const INVENTORY_INTERFACE_ID = 3214;
const EQUIPMENT_INTERFACE_ID = 1688;
const BANK_MAIN_ID = 5292;
const BANK_INV_ID = 5382;
const BANK_SIDE_INV_ID = 2006; // bank_side:inv on this 274 build
const SHOP_MAIN_ID = 3824;

const READBIT = (() => {
    const bits = new Int32Array(32);
    let n = 2;
    for (let i = 0; i < 32; i++) {
        bits[i] = n - 1;
        n += n;
    }
    return bits;
})();

export function normaliseComponentText(raw: string | null | undefined): string {
    if (!raw) return '';
    return raw
        .replace(/@\w{3}@/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================ interactions

export function interactLoc(c: LiteClient, worldX: number, worldZ: number, locId: number, optionIndex: number): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }
    if (locId < 0) {
        return { success: false, reason: 'invalid_target' };
    }
    if (optionIndex < 1 || optionIndex > 5) {
        return { success: false, reason: 'invalid_option' };
    }

    const dest = c.toSceneTile(worldX, worldZ);
    if (!dest) {
        return { success: false, reason: 'out_of_scene' };
    }
    if (!LocType.list(locId)) {
        return { success: false, reason: 'target_not_found' };
    }

    // Attempt a route, but always dispatch - mirrors the browser client.
    // Approach ops (aploc scripts like Mage Arena's slashable web) trigger at
    // tiles the routefinder can never reach, and the server owns the reach
    // check anyway - worst case it answers "I can't reach that!" instead of
    // us aborting silently.
    const routed = c.routeToLoc(dest.x, dest.z, locId);

    c.writeOpcode([ClientProt.OPLOC1, ClientProt.OPLOC2, ClientProt.OPLOC3, ClientProt.OPLOC4, ClientProt.OPLOC5][optionIndex - 1]);
    c.out.p2(worldX);
    c.out.p2(worldZ);
    c.out.p2(locId);
    return { success: true, routed };
}

export function talkToNpc(c: LiteClient, npcIndex: number): ClientActionResult {
    return opNpc(c, npcIndex, 1);
}

export function interactNpc(c: LiteClient, npcIndex: number, optionIndex: number): ClientActionResult {
    if (optionIndex < 1 || optionIndex > 5) {
        return { success: false, reason: 'invalid_option' };
    }
    return opNpc(c, npcIndex, optionIndex);
}

function opNpc(c: LiteClient, npcIndex: number, optionIndex: number): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }
    if (npcIndex < 0) {
        return { success: false, reason: 'invalid_target' };
    }

    const n = c.npc[npcIndex];
    if (!n) {
        return { success: false, reason: 'target_not_found' };
    }

    // Footprint from NpcType, not a hardcoded 1x1: routeX/routeZ is the SW tile,
    // so a 2x2 NPC routed as 1x1 is only approachable from that one corner and
    // reports cant_reach when the other three sides are open. StateCollector's
    // reach probe uses the same size - the two have to agree or `reachable`
    // starts lying.
    // Attempt the route, but always dispatch - mirrors interactLoc. Approach
    // ops (apnpc scripts like Wormbrain's talk-through-the-bars, p_aprange +
    // lineofsight) trigger at tiles the routefinder can never reach, and the
    // server owns the reach check anyway.
    const size = n.type?.size ?? 1;
    const routed = tryMoveTo(c, n.routeX[0], n.routeZ[0], size, size, 0, 0, 0);

    c.writeOpcode([ClientProt.OPNPC1, ClientProt.OPNPC2, ClientProt.OPNPC3, ClientProt.OPNPC4, ClientProt.OPNPC5][optionIndex - 1]);
    c.out.p2(npcIndex);
    return { success: true, routed };
}

export function interactPlayer(c: LiteClient, playerIndex: number, optionIndex: number): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }
    if (playerIndex < 0) {
        return { success: false, reason: 'invalid_target' };
    }
    if (optionIndex < 1 || optionIndex > 5) {
        return { success: false, reason: 'invalid_option' };
    }

    const p = c.players[playerIndex];
    if (!p) {
        return { success: false, reason: 'target_not_found' };
    }

    // Attempt the route, but always dispatch (see opNpc): applayer ops trigger
    // at range and the server owns the reach check.
    const routed = tryMoveTo(c, p.routeX[0], p.routeZ[0], 1, 1, 0, 0, 0);

    c.writeOpcode([ClientProt.OPPLAYER1, ClientProt.OPPLAYER2, ClientProt.OPPLAYER3, ClientProt.OPPLAYER4, ClientProt.OPPLAYER5][optionIndex - 1]);
    c.out.p2(playerIndex);
    return { success: true, routed };
}

export function pickupGroundItem(c: LiteClient, worldX: number, worldZ: number, itemId: number): ClientActionResult {
    return groundItemOp(c, worldX, worldZ, itemId, 3); // "Take" is option 3
}

export function interactGroundItem(c: LiteClient, worldX: number, worldZ: number, itemId: number, optionIndex: number): ClientActionResult {
    if (optionIndex < 1 || optionIndex > 5) {
        return { success: false, reason: 'invalid_option' };
    }
    return groundItemOp(c, worldX, worldZ, itemId, optionIndex);
}

function groundItemOp(c: LiteClient, worldX: number, worldZ: number, itemId: number, optionIndex: number): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }

    const dest = c.toSceneTile(worldX, worldZ);
    if (!dest) {
        return { success: false, reason: 'out_of_scene' };
    }

    // Some quest ground items deliberately sit on blocked scenery (for
    // example the Fremennik longhall keg on a table) and are operated from an
    // adjacent square. Attempt the client route - retrying an unroutable tile
    // with a 1x1 footprint so the player still walks adjacent, exactly like
    // the authentic client's OP_OBJ menu handler - but always dispatch so the
    // authoritative server reach check/custom OPOBJ handler can decide.
    const routed = tryMoveTo(c, dest.x, dest.z, 0, 0, 0, 0, 0)
        || tryMoveTo(c, dest.x, dest.z, 1, 1, 0, 0, 0);

    c.writeOpcode([ClientProt.OPOBJ1, ClientProt.OPOBJ2, ClientProt.OPOBJ3, ClientProt.OPOBJ4, ClientProt.OPOBJ5][optionIndex - 1]);
    c.out.p2(worldX);
    c.out.p2(worldZ);
    c.out.p2(itemId);
    return { success: true, routed };
}

// ============================================================== inventory

/** Wire item id for an inventory slot, or 0. See rule 2 in the header. */
function slotItemId(interfaceId: number, slot: number): number {
    const com = IfType.list[interfaceId];
    if (!com?.linkObjType) {
        return 0;
    }
    const raw = com.linkObjType[slot];
    if (!raw || raw <= 0) {
        return 0;
    }
    return ObjType.list(raw - 1).id;
}

export function useInventoryItem(c: LiteClient, slot: number, optionIndex: number, interfaceId: number = INVENTORY_INTERFACE_ID): boolean {
    if (!c.isInGame() || optionIndex < 1 || optionIndex > 5) {
        return false;
    }

    // The engine only wires OPHELD1-5 to the main inventory; every other
    // component's item options are inv_button triggers (e.g. [inv_button4,
    // tradeside:inv]). OPHELD with a foreign com id passes the wire and is
    // silently dropped by the handler, so route those to INV_BUTTON instead.
    if (interfaceId !== INVENTORY_INTERFACE_ID) {
        return clickInterfaceIop(c, interfaceId, optionIndex, slot);
    }

    const itemId = slotItemId(interfaceId, slot);
    if (!itemId) {
        return false;
    }

    c.writeOpcode([ClientProt.OPHELD1, ClientProt.OPHELD2, ClientProt.OPHELD3, ClientProt.OPHELD4, ClientProt.OPHELD5][optionIndex - 1]);
    c.out.p2(itemId);
    c.out.p2(slot);
    c.out.p2(interfaceId);
    return true;
}

export function dropInventoryItem(c: LiteClient, slot: number): boolean {
    return useInventoryItem(c, slot, 5);
}

export function clickEquipmentSlot(c: LiteClient, slot: number, optionIndex = 1): boolean {
    if (!c.isInGame() || optionIndex < 1 || optionIndex > 5) {
        return false;
    }
    const itemId = slotItemId(EQUIPMENT_INTERFACE_ID, slot);
    if (!itemId) {
        return false;
    }

    c.writeOpcode([ClientProt.INV_BUTTON1, ClientProt.INV_BUTTON2, ClientProt.INV_BUTTON3, ClientProt.INV_BUTTON4, ClientProt.INV_BUTTON5][optionIndex - 1]);
    c.out.p2(itemId);
    c.out.p2(slot);
    c.out.p2(EQUIPMENT_INTERFACE_ID);
    return true;
}

export function useItemOnItem(c: LiteClient, sourceSlot: number, targetSlot: number, interfaceId: number = INVENTORY_INTERFACE_ID): boolean {
    if (!c.isInGame()) {
        return false;
    }
    const sourceId = slotItemId(interfaceId, sourceSlot);
    const targetId = slotItemId(interfaceId, targetSlot);
    if (!sourceId || !targetId) {
        return false;
    }

    // OpHeldUDecoder reads: obj, slot, com, useObj, useSlot, useCom.
    c.writeOpcode(ClientProt.OPHELDU);
    c.out.p2(targetId);
    c.out.p2(targetSlot);
    c.out.p2(interfaceId);
    c.out.p2(sourceId);
    c.out.p2(sourceSlot);
    c.out.p2(interfaceId);
    return true;
}

export function useItemOnNpc(c: LiteClient, itemSlot: number, npcIndex: number, interfaceId: number = INVENTORY_INTERFACE_ID): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }
    const itemId = slotItemId(interfaceId, itemSlot);
    if (!itemId) {
        return { success: false, reason: 'item_not_found' };
    }
    const n = c.npc[npcIndex];
    if (!n) {
        return { success: false, reason: 'target_not_found' };
    }
    // Attempt the route, but always dispatch (see opNpc): apnpcu ops trigger
    // at range and the server owns the reach check.
    const routed = tryMoveTo(c, n.routeX[0], n.routeZ[0], 1, 1, 0, 0, 0);

    c.writeOpcode(ClientProt.OPNPCU);
    c.out.p2(npcIndex);
    c.out.p2(itemId);
    c.out.p2(itemSlot);
    c.out.p2(interfaceId);
    return { success: true, routed };
}

export function useItemOnLoc(c: LiteClient, itemSlot: number, worldX: number, worldZ: number, locId: number, interfaceId: number = INVENTORY_INTERFACE_ID): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }
    const itemId = slotItemId(interfaceId, itemSlot);
    if (!itemId) {
        return { success: false, reason: 'item_not_found' };
    }
    const dest = c.toSceneTile(worldX, worldZ);
    if (!dest) {
        return { success: false, reason: 'out_of_scene' };
    }
    if (!LocType.list(locId)) {
        return { success: false, reason: 'target_not_found' };
    }
    // Attempt the route, but always dispatch (see interactLoc): aplocu ops
    // trigger at range and the server owns the reach check.
    const routed = c.routeToLoc(dest.x, dest.z, locId);

    c.writeOpcode(ClientProt.OPLOCU);
    c.out.p2(worldX);
    c.out.p2(worldZ);
    c.out.p2(locId);
    c.out.p2(itemId);
    c.out.p2(itemSlot);
    c.out.p2(interfaceId);
    return { success: true, routed };
}

export function spellOnNpc(c: LiteClient, npcIndex: number, spellComponent: number): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }
    const n = c.npc[npcIndex];
    if (!n) {
        return { success: false, reason: 'target_not_found' };
    }
    // Spells have range, so tryNearest routing is fine - but we still need to be
    // in the same build area, which tryMoveTo guarantees.
    tryMoveTo(c, n.routeX[0], n.routeZ[0], 1, 1, 0, 0, 0);

    c.writeOpcode(ClientProt.OPNPCT);
    c.out.p2(npcIndex);
    c.out.p2(spellComponent);
    return { success: true };
}

export function spellOnPlayer(c: LiteClient, playerIndex: number, spellComponent: number): ClientActionResult {
    if (!c.isInGame() || !c.localPlayer) {
        return { success: false, reason: 'not_in_game' };
    }
    const p = c.players[playerIndex];
    if (!p) {
        return { success: false, reason: 'target_not_found' };
    }
    tryMoveTo(c, p.routeX[0], p.routeZ[0], 1, 1, 0, 0, 0);

    c.writeOpcode(ClientProt.OPPLAYERT);
    c.out.p2(playerIndex);
    c.out.p2(spellComponent);
    return { success: true };
}

export function spellOnItem(c: LiteClient, slot: number, spellComponent: number, interfaceId: number = INVENTORY_INTERFACE_ID): boolean {
    if (!c.isInGame()) {
        return false;
    }
    const itemId = slotItemId(interfaceId, slot);
    if (!itemId) {
        return false;
    }

    // OpHeldTDecoder reads: obj, slot, com, spellCom.
    c.writeOpcode(ClientProt.OPHELDT);
    c.out.p2(itemId);
    c.out.p2(slot);
    c.out.p2(interfaceId);
    c.out.p2(spellComponent);
    return true;
}

// ============================================================= interfaces

export function clickComponent(c: LiteClient, componentId: number): boolean {
    if (!c.isInGame()) {
        return false;
    }
    c.writeOpcode(ClientProt.IF_BUTTON);
    c.out.p2(componentId);
    return true;
}

export function clickInterfaceIop(c: LiteClient, componentId: number, optionIndex = 1, slot = 0): boolean {
    if (!c.isInGame() || optionIndex < 1 || optionIndex > 5) {
        return false;
    }
    // The engine's InvButtonHandler validates inv.hasAt(slot, obj) exactly, so
    // the real item id must go on the wire (0 only for genuinely empty slots,
    // matching the browser's clickInterfaceIop).
    const itemId = slotItemId(componentId, slot);

    c.writeOpcode([ClientProt.INV_BUTTON1, ClientProt.INV_BUTTON2, ClientProt.INV_BUTTON3, ClientProt.INV_BUTTON4, ClientProt.INV_BUTTON5][optionIndex - 1]);
    c.out.p2(itemId);
    c.out.p2(slot);
    c.out.p2(componentId);
    return true;
}

export function setTab(c: LiteClient, tabIndex: number): boolean {
    if (!c.isInGame() || tabIndex < 0 || tabIndex > 13) {
        return false;
    }
    c.activeIcon = tabIndex;
    return true;
}

export function closeBotModal(c: LiteClient): boolean {
    if (!c.isInGame()) {
        return false;
    }
    // Always send CLOSE_MODAL: local modal ids can lag the server (mirrors
    // Client.closeBotModal).
    c.writeOpcode(ClientProt.CLOSE_MODAL);
    return true;
}

export function submitCountDialog(c: LiteClient, value: number): boolean {
    if (!c.isInGame() || !c.dialogInputOpen) {
        return false;
    }
    c.writeOpcode(ClientProt.RESUME_P_COUNTDIALOG);
    c.out.p4(value);
    c.dialogInputOpen = false;
    return true;
}

export function clickDialogOption(c: LiteClient, optionIndex = 0): boolean {
    if (!c.isInGame()) {
        return false;
    }

    // A pending choice (OK-typed options, registered server-side via
    // if_addresumebutton) must be answered with IF_BUTTON on one of the
    // options - the engine refuses a bare RESUME while a choice is pending.
    // Sending one anyway latched resumedPauseButton with no new interface
    // arriving to reset it, pinning the dialog against every later continue
    // click. Refuse locally instead of desyncing.
    const choicePending = (): boolean =>
        getDialogOptions(c).some(o => o.buttonType === ButtonType.BUTTON_OK);

    if (optionIndex === 0) {
        // Bare "continue". The resumedPauseButton guard mirrors the engine's
        // ResumePauseButtonHandler fix: sending a second RESUME while one is
        // pending re-picks the previous choice.
        if (!c.resumedPauseButton && c.chatModalId !== -1 && !choicePending()) {
            c.writeOpcode(ClientProt.RESUME_PAUSEBUTTON);
            c.out.p2(c.chatModalId);
            c.resumedPauseButton = true;
            return true;
        }
        return false;
    }

    if (c.chatModalId === -1) {
        return false;
    }

    const options = getDialogOptions(c);
    if (optionIndex <= 0 || optionIndex > options.length) {
        return false;
    }

    const option = options[optionIndex - 1];
    if (option.buttonType === ButtonType.BUTTON_CONTINUE) {
        if (c.resumedPauseButton || choicePending()) {
            return false;
        }
        c.writeOpcode(ClientProt.RESUME_PAUSEBUTTON);
        c.out.p2(option.componentId);
        c.resumedPauseButton = true;
        return true;
    }

    c.writeOpcode(ClientProt.IF_BUTTON);
    c.out.p2(option.componentId);
    return true;
}

export function getDialogOptions(c: LiteClient): Array<{ index: number; text: string; componentId: number; buttonType: number }> {
    const options: Array<{ index: number; text: string; componentId: number; buttonType: number }> = [];
    if (c.chatModalId === -1) {
        return options;
    }

    const scan = (comId: number, depth = 0): void => {
        if (depth > 10) return;
        const com = IfType.list[comId];
        if (!com) return;

        if ((com.buttonType === ButtonType.BUTTON_OK || com.buttonType === ButtonType.BUTTON_CONTINUE) && com.buttonText) {
            // com.text is the product label on skill dialogs but layout padding
            // on the Make X/10/5 siblings - fall back to buttonText.
            options.push({
                index: options.length + 1,
                text: normaliseComponentText(com.text) || normaliseComponentText(com.buttonText),
                componentId: comId,
                buttonType: com.buttonType
            });
        }

        if (com.children) {
            for (const childId of com.children) {
                scan(childId, depth + 1);
            }
        }
    };

    scan(c.chatModalId);
    return options;
}

export function getDialogText(c: LiteClient): string[] {
    const texts: string[] = [];
    if (c.chatModalId === -1) {
        return texts;
    }

    const scan = (comId: number, depth = 0): void => {
        if (depth > 10) return;
        const com = IfType.list[comId];
        if (!com) return;

        if (com.type === ComponentType.TYPE_TEXT && com.text) {
            let text = com.text;
            if (text.indexOf('%') !== -1) {
                for (let i = 0; i < 5; i++) {
                    const placeholder = `%${i + 1}`;
                    while (text.indexOf(placeholder) !== -1) {
                        const index = text.indexOf(placeholder);
                        const value = getIfVar(c, com, i);
                        text = text.substring(0, index) + (value < 999999999 ? String(value) : '*') + text.substring(index + 2);
                    }
                }
            }

            const trimmed = text.trim();
            if (trimmed && trimmed !== 'Please wait...' && trimmed !== 'Click here to continue' && !trimmed.startsWith('Select an Option')) {
                const cleaned = trimmed.replace(/@\w{3}@/g, '');
                if (cleaned) {
                    texts.push(cleaned);
                }
            }
        }

        if (com.children) {
            for (const childId of com.children) {
                scan(childId, depth + 1);
            }
        }
    };

    scan(c.chatModalId);
    return texts;
}

export function getInterfaceOptions(c: LiteClient): Array<{ index: number; text: string; componentId: number }> {
    const options: Array<{ index: number; text: string; componentId: number }> = [];
    if (c.mainModalId === -1) {
        return options;
    }

    const scan = (comId: number, depth = 0): void => {
        if (depth > 10) return;
        const com = IfType.list[comId];
        if (!com) return;

        const clickable = com.buttonType === ButtonType.BUTTON_OK || com.buttonType === ButtonType.BUTTON_TARGET || com.buttonType === ButtonType.BUTTON_SELECT;
        if (clickable && (com.buttonText || com.text)) {
            const text = normaliseComponentText(com.text) || normaliseComponentText(com.buttonText);
            if (text) {
                options.push({ index: options.length + 1, text, componentId: comId });
            }
        }

        if (com.children) {
            for (const childId of com.children) {
                scan(childId, depth + 1);
            }
        }
    };

    scan(c.mainModalId);
    return options;
}

export function debugDialogComponents(c: LiteClient): Array<{ id: number; type: number; buttonType: number; option: string; text: string }> {
    const out: Array<{ id: number; type: number; buttonType: number; option: string; text: string }> = [];
    if (c.chatModalId === -1) {
        return out;
    }

    const scan = (comId: number, depth = 0): void => {
        if (depth > 10) return;
        const com = IfType.list[comId];
        if (!com) return;
        out.push({
            id: comId,
            type: com.type,
            buttonType: com.buttonType,
            option: com.buttonText ?? '',
            text: com.text ?? ''
        });
        if (com.children) {
            for (const childId of com.children) {
                scan(childId, depth + 1);
            }
        }
    };

    scan(c.chatModalId);
    return out;
}

export function getInterfaceDebugInfo(c: LiteClient, interfaceId: number): string[] {
    const lines: string[] = [];
    const scan = (comId: number, depth = 0): void => {
        if (depth > 6) return;
        const com = IfType.list[comId];
        if (!com) return;
        lines.push(`${'  '.repeat(depth)}#${comId} type=${com.type} btn=${com.buttonType} text=${JSON.stringify(normaliseComponentText(com.text))}`);
        if (com.children) {
            for (const childId of com.children) {
                scan(childId, depth + 1);
            }
        }
    };
    scan(interfaceId);
    return lines;
}

// =================================================================== shop

export function isShopOpen(c: LiteClient): boolean {
    return c.mainModalId === SHOP_MAIN_ID;
}

export function shopBuy(c: LiteClient, slot: number, amount = 1): boolean {
    return shopTrade(c, slot, amount, 3900);
}

export function shopSell(c: LiteClient, slot: number, amount = 1): boolean {
    return shopTrade(c, slot, amount, 3823);
}

function shopTrade(c: LiteClient, slot: number, amount: number, componentId: number): boolean {
    if (!c.isInGame() || !isShopOpen(c)) {
        return false;
    }
    const itemId = slotItemId(componentId, slot);
    if (!itemId) {
        return false;
    }

    // Option index encodes quantity: 1 / 5 / 10.
    let optionIndex = 2;
    if (amount === 5) optionIndex = 3;
    else if (amount >= 10) optionIndex = 4;

    c.writeOpcode([ClientProt.INV_BUTTON1, ClientProt.INV_BUTTON2, ClientProt.INV_BUTTON3, ClientProt.INV_BUTTON4, ClientProt.INV_BUTTON5][optionIndex - 1]);
    c.out.p2(itemId);
    c.out.p2(slot);
    c.out.p2(componentId);
    return true;
}

export function closeShop(c: LiteClient): boolean {
    if (!c.isInGame() || !isShopOpen(c)) {
        return false;
    }
    c.writeOpcode(ClientProt.CLOSE_MODAL);
    return true;
}

// =================================================================== bank

export function isBankOpen(c: LiteClient): boolean {
    if (c.mainModalId === BANK_MAIN_ID) {
        return true;
    }
    const com = IfType.list[BANK_INV_ID];
    if (com?.linkObjType) {
        for (let i = 0; i < com.linkObjType.length; i++) {
            if (com.linkObjType[i] > 0) {
                return c.mainModalId !== -1;
            }
        }
    }
    return false;
}

export function bankDeposit(c: LiteClient, slot: number, amount = 1): boolean {
    return bankMove(c, slot, amount, BANK_SIDE_INV_ID);
}

export function bankWithdraw(c: LiteClient, slot: number, amount = 1): boolean {
    return bankMove(c, slot, amount, BANK_INV_ID);
}

function bankMove(c: LiteClient, slot: number, amount: number, componentId: number): boolean {
    if (!c.isInGame()) {
        return false;
    }
    const itemId = slotItemId(componentId, slot);
    if (!itemId) {
        return false;
    }

    // Per interface_bank/scripts/bank.rs2 and the browser client: options 1/2/3
    // are 1/5/10, option 4 is All, option 5 is X (opens the count dialog).
    let optionIndex = 1;
    if (amount === 5) optionIndex = 2;
    else if (amount === 10) optionIndex = 3;
    else if (amount === -1 || amount >= 2147483647) optionIndex = 4; // "All"
    else if (amount !== 1) optionIndex = 5; // "X"

    c.writeOpcode([ClientProt.INV_BUTTON1, ClientProt.INV_BUTTON2, ClientProt.INV_BUTTON3, ClientProt.INV_BUTTON4, ClientProt.INV_BUTTON5][optionIndex - 1]);
    c.out.p2(itemId);
    c.out.p2(slot);
    c.out.p2(componentId);
    return true;
}

export function getBankItems(c: LiteClient): Array<{ slot: number; id: number; name: string; count: number }> {
    const items: Array<{ slot: number; id: number; name: string; count: number }> = [];
    const com = IfType.list[BANK_INV_ID];
    if (!com?.linkObjType || !com.linkObjNumber) {
        return items;
    }

    for (let slot = 0; slot < com.linkObjType.length; slot++) {
        const raw = com.linkObjType[slot];
        if (raw > 0) {
            const type = ObjType.list(raw - 1);
            items.push({ slot, id: type.id, name: type.name ?? '', count: com.linkObjNumber[slot] });
        }
    }
    return items;
}

// =================================================================== chat

export interface SayOutcome {
    ok: boolean;
    truncated: boolean;
    filtered: boolean;
    finalText: string;
}

export function say(c: LiteClient, message: string): SayOutcome {
    if (!c.isInGame() || !c.localPlayer) {
        return { ok: false, truncated: false, filtered: false, finalText: '' };
    }

    const cap = c.getMaxMessageLength();
    const truncated = message.length > cap;
    const text = truncated ? message.substring(0, cap) : message;

    // MessagePublicDecoder reads: colour byte, effect byte, then packed text -
    // the size byte covers all three.
    c.writeOpcode(ClientProt.MESSAGE_PUBLIC);
    const lengthPos = c.out.pos;
    c.out.p1(0);
    const start = c.out.pos;
    c.out.p1(0); // colour
    c.out.p1(0); // effect
    WordPack.pack(c.out, text);
    c.out.data[lengthPos] = c.out.pos - start;

    // Local self-echo, mirroring Client.say: the server does not echo your own
    // public chat back, so put it in the ring buffer StateCollector reads (the
    // same addChat(2, ...) path incoming public chat uses) and overhead it on
    // the local player.
    const cased = JString.toSentenceCase(text);
    const echoed = WordFilter.filter(cased);
    const filtered = echoed !== cased;

    c.localPlayer.chatMessage = echoed;
    c.localPlayer.chatColour = 0;
    c.localPlayer.chatEffect = 0;
    c.localPlayer.chatTimer = 150;
    c.addChat(2, echoed, c.localPlayer.name ?? '');

    return { ok: true, truncated, filtered, finalText: echoed };
}

export function sendPrivateMessage(c: LiteClient, targetName: string, message: string): SayOutcome {
    if (!c.isInGame() || !c.localPlayer) {
        return { ok: false, truncated: false, filtered: false, finalText: '' };
    }

    const userhash = JString.toUserhash(targetName);
    if (userhash === 0n) {
        return { ok: false, truncated: false, filtered: false, finalText: '' };
    }

    const cap = c.getMaxMessageLength();
    const truncated = message.length > cap;
    const text = truncated ? message.substring(0, cap) : message;

    // MessagePrivateDecoder reads: 8-byte target userhash, then packed text -
    // the size byte covers both.
    c.writeOpcode(ClientProt.MESSAGE_PRIVATE);
    const lengthPos = c.out.pos;
    c.out.p1(0);
    const start = c.out.pos;
    c.out.p8(userhash);
    WordPack.pack(c.out, text);
    c.out.data[lengthPos] = c.out.pos - start;

    // Local echo as a sent-PM (type 6), mirroring Client's socialInput path:
    // the server never echoes your own PM back.
    const cased = JString.toSentenceCase(text);
    const echoed = WordFilter.filter(cased);
    const filtered = echoed !== cased;
    c.addChat(6, echoed, JString.toScreenName(JString.toRawUsername(userhash)));

    return { ok: true, truncated, filtered, finalText: echoed };
}

// ================================================================ combat

export function setCombatStyle(c: LiteClient, style: number): boolean {
    if (!c.isInGame()) {
        return false;
    }

    const tabId = c.sideIcon[0];
    if (tabId === -1) {
        return false;
    }
    const tab = IfType.list[tabId];
    if (!tab?.children) {
        return false;
    }

    const findButton = (comId: number, depth = 0): number => {
        if (depth > 4) return -1;
        const com = IfType.list[comId];
        if (!com) return -1;
        if (com.buttonType === 5 && com.scriptOperand && com.scriptOperand[0] === style) {
            return comId;
        }
        if (com.children) {
            for (const childId of com.children) {
                const found = findButton(childId, depth + 1);
                if (found !== -1) return found;
            }
        }
        return -1;
    };

    const button = findButton(tabId);
    if (button === -1) {
        return false;
    }

    c.writeOpcode(ClientProt.IF_BUTTON);
    c.out.p2(button);
    return true;
}

export function getCombatStyle(c: LiteClient): number {
    return c.var[43] ?? 0;
}

// ========================================================= character design

export function acceptCharacterDesign(c: LiteClient): boolean {
    if (!c.isInGame()) {
        return false;
    }

    // Must send BOTH the design and the accept button - see PATCHES.md.
    c.writeOpcode(ClientProt.IDK_SAVEDESIGN);
    c.out.p1(c.designGender ? 0 : 1);
    for (let i = 0; i < 7; i++) {
        c.out.p1(c.designKits[i]);
    }
    for (let i = 0; i < 5; i++) {
        c.out.p1(c.designColours[i]);
    }

    for (let i = 0; i < IfType.list.length; i++) {
        const com = IfType.list[i];
        if (com && com.clientCode === ClientCode.CC_ACCEPT_DESIGN) {
            c.writeOpcode(ClientProt.IF_BUTTON);
            c.out.p2(i);
            return true;
        }
    }
    return false;
}

export function randomizeCharacterDesign(c: LiteClient, gender?: boolean): boolean {
    c.designGender = gender ?? Math.random() < 0.5;
    for (let part = 0; part < 7; part++) {
        c.designKits[part] = 0;
    }
    for (let i = 0; i < 5; i++) {
        c.designColours[i] = (Math.random() * 10) | 0;
    }
    return true;
}

// ================================================================ if-vars

/**
 * Port of Client.getIfVar - the tiny stack VM behind interface conditionals and
 * `%1` text placeholders. Needed for dialog text and combat-tab reads.
 */
export function getIfVar(c: LiteClient, com: IfType, scriptId: number): number {
    if (!com.scripts || scriptId >= com.scripts.length) {
        return -2;
    }

    try {
        const script = com.scripts[scriptId];
        if (!script) {
            return -1;
        }

        let acc = 0;
        let pc = 0;
        let arithmetic = 0;

        for (;;) {
            let register = 0;
            let nextArithmetic = 0;
            const opcode = script[pc++];

            if (opcode === 0) {
                return acc;
            } else if (opcode === 1) {
                register = c.statEffectiveLevel[script[pc++]];
            } else if (opcode === 2) {
                register = c.statBaseLevel[script[pc++]];
            } else if (opcode === 3) {
                register = c.statXP[script[pc++]];
            } else if (opcode === 4) {
                const inv = IfType.list[script[pc++]];
                const obj = script[pc++] + 1;
                if (inv?.linkObjType && inv.linkObjNumber && obj >= 0 && obj < ObjType.numDefinitions) {
                    for (let i = 0; i < inv.linkObjType.length; i++) {
                        if (inv.linkObjType[i] === obj) {
                            register += inv.linkObjNumber[i];
                        }
                    }
                }
            } else if (opcode === 5) {
                register = c.var[script[pc++]];
            } else if (opcode === 6) {
                register = LiteClientLevelExperience(c.statBaseLevel[script[pc++]] - 1);
            } else if (opcode === 7) {
                register = ((c.var[script[pc++]] * 100) / 46875) | 0;
            } else if (opcode === 8) {
                register = c.localPlayer?.combatLevel || 0;
            } else if (opcode === 9) {
                for (let i = 0; i < Skill.count; i++) {
                    if (Skill.used[i]) {
                        register += c.statBaseLevel[i];
                    }
                }
            } else if (opcode === 10) {
                const inv = IfType.list[script[pc++]];
                const obj = script[pc++] + 1;
                if (inv?.linkObjType && obj >= 0 && obj < ObjType.numDefinitions) {
                    for (let i = 0; i < inv.linkObjType.length; i++) {
                        if (inv.linkObjType[i] === obj) {
                            register = 999999999;
                            break;
                        }
                    }
                }
            } else if (opcode === 11) {
                register = c.runenergy;
            } else if (opcode === 12) {
                register = c.runweight;
            } else if (opcode === 13) {
                const varp = c.var[script[pc++]];
                const lsb = script[pc++];
                register = (varp & (0x1 << lsb)) === 0 ? 0 : 1;
            } else if (opcode === 14) {
                const varbit = VarBitType.list[script[pc++]];
                const { basevar, startbit, endbit } = varbit;
                register = (c.var[basevar] >> startbit) & READBIT[endbit - startbit];
            } else if (opcode === 15) {
                nextArithmetic = 1;
            } else if (opcode === 16) {
                nextArithmetic = 2;
            } else if (opcode === 17) {
                nextArithmetic = 3;
            } else if (opcode === 18) {
                register = c.localPlayer ? (c.localPlayer.x >> 7) + c.mapBuildBaseX : 0;
            } else if (opcode === 19) {
                register = c.localPlayer ? (c.localPlayer.z >> 7) + c.mapBuildBaseZ : 0;
            } else if (opcode === 20) {
                register = script[pc++];
            }

            if (nextArithmetic === 0) {
                if (arithmetic === 0) {
                    acc += register;
                } else if (arithmetic === 1) {
                    acc -= register;
                } else if (arithmetic === 2 && register !== 0) {
                    acc = (acc / register) | 0;
                } else if (arithmetic === 3) {
                    acc = (acc * register) | 0;
                }
                arithmetic = 0;
            } else {
                arithmetic = nextArithmetic;
            }
        }
    } catch {
        return -1;
    }
}

function LiteClientLevelExperience(index: number): number {
    // Imported lazily to avoid a cycle with LiteClient's static initialiser.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return levelExperienceTable[index] ?? 0;
}

const levelExperienceTable: number[] = (() => {
    const table: number[] = [];
    let acc = 0;
    for (let i = 0; i < 99; i++) {
        const level = i + 1;
        const delta = (level + Math.pow(2.0, level / 10.0) * 300.0) | 0;
        acc += delta;
        table[i] = (acc / 4) | 0;
    }
    return table;
})();

// ============================================================== dialog log

export function captureDialogToHistory(c: LiteClient): void {
    if (c.chatModalId === -1 || c.chatModalId === c.lastCapturedDialogId) {
        return;
    }
    const texts = getDialogText(c);
    if (texts.length === 0) {
        return;
    }

    c.dialogHistory.unshift({ text: texts, tick: c.cycle.value, interfaceId: c.chatModalId });
    if (c.dialogHistory.length > 20) {
        c.dialogHistory.pop();
    }
    c.lastCapturedDialogId = c.chatModalId;
}

export function findNpcByName(c: LiteClient, name: string): number {
    const needle = name.toLowerCase();
    for (let i = 0; i < c.npcCount; i++) {
        const index = c.npcIds[i];
        const n = c.npc[index];
        if (n?.type?.name && n.type.name.toLowerCase().includes(needle)) {
            return index;
        }
    }
    return -1;
}
