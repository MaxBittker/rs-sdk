import InvType from '#lostcity/cache/InvType.js';
import ObjType from '#lostcity/cache/ObjType.js';

import { Inventory } from '#lostcity/engine/Inventory.js';
import World from '#lostcity/engine/World.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';
import ScriptPointer, { checkedHandler } from '#lostcity/engine/script/ScriptPointer.js';

import Obj from '#lostcity/entity/Obj.js';
import { Position } from '#lostcity/entity/Position.js';

const ActivePlayer = [ScriptPointer.ActivePlayer, ScriptPointer.ActivePlayer2];
const ProtectedActivePlayer = [ScriptPointer.ProtectedActivePlayer, ScriptPointer.ProtectedActivePlayer2];

const InvOps: CommandHandlers = {
    // inv config
    [ScriptOpcode.INV_ALLSTOCK]: (state) => {
        const inv = state.popInt();

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        const type = InvType.get(inv);
        state.pushInt(type.allstock ? 1 : 0);
    },

    // inv config
    [ScriptOpcode.INV_SIZE]: (state) => {
        const inv = state.popInt();

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        const type = InvType.get(inv);
        state.pushInt(type.size);
    },

    // inv config
    [ScriptOpcode.INV_STOCKBASE]: (state) => {
        const [inv, obj] = state.popInts(2);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        const type = InvType.get(inv);
        const index = type.stockobj.indexOf(obj);
        state.pushInt(index >= 0 ? type.stockcount[index] : -1);
    },

    // inv write
    [ScriptOpcode.INV_ADD]: checkedHandler(ActivePlayer, (state) => {
        const [inv, objId, count] = state.popInts(3);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (objId === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        const obj = ObjType.get(objId);
        if (obj.dummyitem === 1) {
            throw new Error(`attempted to add graphic_only dummy item: ${obj.debugname}`);
        }

        const type = InvType.get(inv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        if (!type.dummyinv && obj.dummyitem !== 0) {
            throw new Error(`dummyitem in non-dummyinv: ${obj.debugname} -> ${type.debugname}`);
        }

        const player = state.activePlayer;
        const overflow = count - player.invAdd(inv, objId, count);
        if (overflow > 0) {
            const floorObj = new Obj(
                player.level,
                player.x,
                player.z,
                objId,
                overflow
            );

            World.addObj(floorObj, player, 200);
        }
    }),

    // inv write
    [ScriptOpcode.INV_CHANGESLOT]: checkedHandler(ActivePlayer, (state) => {
        const [inv, find, replace, replaceCount] = state.popInts(4);
        throw new Error('unimplemented');
    }),

    // inv write
    [ScriptOpcode.INV_CLEAR]: checkedHandler(ActivePlayer, (state) => {
        const inv = state.popInt();

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        const type = InvType.get(inv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        state.activePlayer.invClear(inv);
    }),

    // inv write
    [ScriptOpcode.INV_DEL]: checkedHandler(ActivePlayer, (state) => {
        const [inv, obj, count] = state.popInts(3);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        const type = InvType.get(inv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        state.activePlayer.invDel(inv, obj, count);
    }),

    // inv write
    [ScriptOpcode.INV_DELSLOT]: checkedHandler(ActivePlayer, (state) => {
        const [inv, slot] = state.popInts(2);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        const type = InvType.get(inv);
        if (slot < 0 || slot >= type.size) {
            throw new Error(`$slot is out of range: ${slot}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        const obj = state.activePlayer.invGetSlot(inv, slot);
        if (!obj) {
            return;
        }

        state.activePlayer.invDelSlot(inv, slot);
    }),

    // inv write
    [ScriptOpcode.INV_DROPITEM]: checkedHandler(ActivePlayer, (state) => {
        const [inv, coord, obj, count, duration] = state.popInts(5);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (coord < 0 || coord > Position.max) {
            throw new Error('$coord is out of range');
        }

        if (obj === -1) {
            throw new Error('$slot is empty');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        if (duration < 1) {
            throw new Error('$duration should be greater than 0');
        }

        const type = InvType.get(inv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        const pos = Position.unpackCoord(coord);

        const player = state.activePlayer;
        const completed = player.invDel(inv, obj, count);
        if (completed == 0) {
            return;
        }

        const objType = ObjType.get(obj);
        player.playerLog('Dropped item from', type.debugname as string, objType.debugname as string);

        const floorObj = new Obj(pos.level, pos.x, pos.z, obj, completed);
        World.addObj(floorObj, player, duration);
    }),

    // inv write
    [ScriptOpcode.INV_DROPSLOT]: checkedHandler(ActivePlayer, (state) => {
        const [inv, coord, slot, duration] = state.popInts(4);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        const type = InvType.get(inv);
        if (slot < 0 || slot >= type.size) {
            throw new Error(`$slot is out of range: ${slot}`);
        }

        const obj = state.activePlayer.invGetSlot(inv, slot);
        if (!obj) {
            throw new Error('$slot is empty');
        }

        if (duration < 1) {
            throw new Error('$duration should be greater than 0');
        }

        if (coord < 0 || coord > Position.max) {
            throw new Error('$coord is out of range');
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        const pos = Position.unpackCoord(coord);

        const player = state.activePlayer;
        const completed = player.invDel(inv, obj.id, obj.count, slot);
        if (completed == 0) {
            return;
        }

        const objType = ObjType.get(obj.id);
        player.playerLog('Dropped item from', type.debugname as string, objType.debugname as string);

        const floorObj = new Obj(pos.level, pos.x, pos.z, obj.id, completed);
        World.addObj(floorObj, player, duration);
    }),

    // inv read
    [ScriptOpcode.INV_FREESPACE]: checkedHandler(ActivePlayer, (state) => {
        const inv = state.popInt();

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        state.pushInt(state.activePlayer.invFreeSpace(inv) as number);
    }),

    // inv read
    [ScriptOpcode.INV_GETNUM]: checkedHandler(ActivePlayer, (state) => {
        const [inv, slot] = state.popInts(2);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        const type = InvType.get(inv);
        if (slot < 0 || slot >= type.size) {
            throw new Error(`$slot is out of range: ${slot}`);
        }

        const obj = state.activePlayer.invGetSlot(inv, slot);
        state.pushInt(obj?.count ?? 0);
    }),

    // inv read
    [ScriptOpcode.INV_GETOBJ]: checkedHandler(ActivePlayer, (state) => {
        const [inv, slot] = state.popInts(2);

        const obj = state.activePlayer.invGetSlot(inv, slot);
        state.pushInt(obj?.id ?? -1);
    }),

    // inv read
    [ScriptOpcode.INV_ITEMSPACE]: checkedHandler(ActivePlayer, (state) => {
        const [inv, obj, count, size] = state.popInts(4);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        const type = InvType.get(inv);
        if (size < 0 || size > type.size) {
            throw new Error(`$count is out of range: ${count}`);
        }

        state.pushInt(state.activePlayer.invItemSpace(inv, obj, count, size) == 0 ? 1 : 0);
    }),

    // inv read
    [ScriptOpcode.INV_ITEMSPACE2]: checkedHandler(ActivePlayer, (state) => {
        const [inv, obj, count, size] = state.popInts(4);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        state.pushInt(state.activePlayer.invItemSpace(inv, obj, count, size));
    }),

    // inv write
    [ScriptOpcode.INV_MOVEFROMSLOT]: checkedHandler(ActivePlayer, (state) => {
        const [fromInv, toInv, fromSlot] = state.popInts(3);

        if (fromInv === -1) {
            throw new Error('$from_inv is null');
        }

        if (toInv === -1) {
            throw new Error('$to_inv is null');
        }

        const type = InvType.get(fromInv);
        if (fromSlot < 0 || fromSlot >= type.size) {
            throw new Error(`$from_slot is out of range: ${fromSlot}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        const type2 = InvType.get(toInv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type2.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type2.debugname}`);
        }

        const player = state.activePlayer;
        const {overflow, fromObj} = player.invMoveFromSlot(fromInv, toInv, fromSlot);
        if (overflow > 0) {
            const floorObj = new Obj(
                player.level,
                player.x,
                player.z,
                fromObj,
                overflow
            );

            World.addObj(floorObj, player, 200);
        }
    }),

    // inv write
    [ScriptOpcode.INV_MOVETOSLOT]: checkedHandler(ActivePlayer, (state) => {
        const [fromInv, toInv, fromSlot, toSlot] = state.popInts(4);

        if (fromInv === -1) {
            throw new Error('$from_inv is null');
        }

        if (toInv === -1) {
            throw new Error('$to_inv is null');
        }

        const type = InvType.get(fromInv);
        if (fromSlot < 0 || fromSlot >= type.size) {
            throw new Error(`$from_slot is out of range: ${fromSlot}`);
        }

        const type2 = InvType.get(toInv);
        if (toSlot < 0 || toSlot >= type2.size) {
            throw new Error(`$to_slot is out of range: ${toSlot}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type2.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type2.debugname}`);
        }

        state.activePlayer.invMoveToSlot(fromInv, toInv, fromSlot, toSlot);
    }),

    // inv write
    [ScriptOpcode.BOTH_MOVEINV]: checkedHandler(ActivePlayer, (state) => {
        const [from, to] = state.popInts(2);

        if (from === -1) {
            throw new Error('$from_inv is null');
        }

        if (to === -1) {
            throw new Error('$to_inv is null');
        }

        const secondary = state.intOperand == 1;

        // move the contents of the `from` inventory into the `to` inventory between both players
        // from = active_player
        // to = .active_player
        // if both_moveinv is called as .both_moveinv, then from/to pointers are swapped

        const fromPlayer = secondary ? state._activePlayer2 : state._activePlayer;
        const toPlayer = secondary ? state._activePlayer : state._activePlayer2;

        if (!fromPlayer || !toPlayer) {
            throw new Error('player is null');
        }

        const type = InvType.get(from);
        if (!state.pointerGet(ProtectedActivePlayer[secondary ? 1 : 0]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$from_inv requires protected access: ${type.debugname}`);
        }

        const type2 = InvType.get(to);
        if (!state.pointerGet(ProtectedActivePlayer[secondary ? 0 : 1]) && type2.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$to_inv requires protected access: ${type2.debugname}`);
        }

        const fromInv = fromPlayer.getInventory(from);
        const toInv = toPlayer.getInventory(to);

        if (!fromInv || !toInv) {
            throw new Error('inv is null');
        }

        // we're going to assume the content has made sure thiseration will go as expected
        for (let slot = 0; slot < fromInv.capacity; slot++) {
            const obj = fromInv.get(slot);
            if (!obj) {
                continue;
            }

            fromInv.delete(slot);
            toInv.add(obj.id, obj.count);
        }

        // todo: update run weights
    }),

    // inv write
    [ScriptOpcode.INV_MOVEITEM]: checkedHandler(ActivePlayer, (state) => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        if (fromInv === -1) {
            throw new Error('$from_inv is null');
        }

        if (toInv === -1) {
            throw new Error('$to_inv is null');
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        const type = InvType.get(fromInv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        const type2 = InvType.get(toInv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type2.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type2.debugname}`);
        }

        const completed = state.activePlayer.invDel(fromInv, obj, count);
        if (completed == 0) {
            return;
        }

        state.activePlayer.invAdd(toInv, obj, completed);
    }),

    // inv write
    [ScriptOpcode.INV_MOVEITEM_CERT]: checkedHandler(ActivePlayer, (state) => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        if (fromInv === -1) {
            throw new Error('$from_inv is null');
        }

        if (toInv === -1) {
            throw new Error('$to_inv is null');
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        const type = InvType.get(fromInv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        const type2 = InvType.get(toInv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type2.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type2.debugname}`);
        }

        const completed = state.activePlayer.invDel(fromInv, obj, count);
        if (completed == 0) {
            return;
        }

        const objType = ObjType.get(obj);
        if (objType.certtemplate === -1 && objType.certlink >= 0) {
            state.activePlayer.invAdd(toInv, objType.certlink, completed);
        } else {
            state.activePlayer.invAdd(toInv, obj, completed);
        }
    }),

    // inv write
    [ScriptOpcode.INV_MOVEITEM_UNCERT]: checkedHandler(ActivePlayer, (state) => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        if (fromInv === -1) {
            throw new Error('$from_inv is null');
        }

        if (toInv === -1) {
            throw new Error('$to_inv is null');
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        const type = InvType.get(fromInv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        const type2 = InvType.get(toInv);
        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type2.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type2.debugname}`);
        }

        const completed = state.activePlayer.invDel(fromInv, obj, count);
        if (completed == 0) {
            return;
        }

        const objType = ObjType.get(obj);
        if (objType.certtemplate >= 0 && objType.certlink >= 0) {
            state.activePlayer.invAdd(toInv, objType.certlink, completed);
        } else {
            state.activePlayer.invAdd(toInv, obj, completed);
        }
    }),

    // inv write
    [ScriptOpcode.INV_SETSLOT]: checkedHandler(ActivePlayer, (state) => {
        const [inv, slot, obj, count] = state.popInts(4);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        const type = InvType.get(inv);
        if (slot < 0 || slot >= type.size) {
            throw new Error(`$slot is out of range: ${slot}`);
        }

        if (obj === -1) {
            throw new Error('$obj is null');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`$count is out of range: ${count}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && type.protect && type.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${type.debugname}`);
        }

        state.activePlayer.invSet(inv, obj, count, slot);
    }),

    // inv read
    [ScriptOpcode.INV_TOTAL]: checkedHandler(ActivePlayer, (state) => {
        const [inv, obj] = state.popInts(2);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        // todo: error instead?
        if (obj === -1) {
            state.pushInt(0);
            return;
        }

        state.pushInt(state.activePlayer.invTotal(inv, obj) as number);
    }),

    // inv read
    [ScriptOpcode.INV_TOTALCAT]: checkedHandler(ActivePlayer, (state) => {
        const [inv, category] = state.popInts(2);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (category === -1) {
            throw new Error('$category is null');
        }

        state.pushInt(state.activePlayer.invTotalCat(inv, category));
    }),

    // inv protocol
    [ScriptOpcode.INV_TRANSMIT]: checkedHandler(ActivePlayer, (state) => {
        const [inv, com] = state.popInts(2);

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (com === -1) {
            throw new Error('$com is null');
        }

        state.activePlayer.invListenOnCom(inv, com, state.activePlayer.uid);
    }),

    // inv protocol
    [ScriptOpcode.INVOTHER_TRANSMIT]: checkedHandler(ActivePlayer, (state) => {
        const [uid, inv, com] = state.popInts(3);

        if (uid === -1) {
            throw new Error('$uid is null');
        }

        if (inv === -1) {
            throw new Error('$inv is null');
        }

        if (com === -1) {
            throw new Error('$com is null');
        }

        state.activePlayer.invListenOnCom(inv, com, uid);
    }),

    // inv protocol
    [ScriptOpcode.INV_STOPTRANSMIT]: checkedHandler(ActivePlayer, (state) => {
        const com = state.popInt();

        if (com === -1) {
            throw new Error('$com is null');
        }

        state.activePlayer.invStopListenOnCom(com);
    }),
};

export default InvOps;
