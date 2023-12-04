import InvType from '#lostcity/cache/InvType.js';
import ObjType from '#lostcity/cache/ObjType.js';

import { Inventory } from '#lostcity/engine/Inventory.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';

import Obj from '#lostcity/entity/Obj.js';
import { Position } from '#lostcity/entity/Position.js';
import World from '#lostcity/engine/World.js';

const InvOps: CommandHandlers = {
    [ScriptOpcode.INV_ADD]: (state) => {
        const [inv, obj, count] = state.popInts(3);

        if (obj == -1) {
            throw new Error(`INV_ADD attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_ADD attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        const player = state.activePlayer;
        const overflow = count - player.invAdd(inv, obj, count);

        if (overflow > 0) {
            const floorObj = new Obj(
                player.level,
                player.x,
                player.z,
                obj,
                overflow
            );
            World.addObj(floorObj, player, 200);
        }
    },

    [ScriptOpcode.INV_CHANGESLOT]: (state) => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.INV_DEL]: (state) => {
        const [inv, obj, count] = state.popInts(3);

        if (obj == -1) {
            throw new Error(`INV_DEL attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_DEL attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        state.activePlayer.invDel(inv, obj, count);
    },

    [ScriptOpcode.INV_GETOBJ]: (state) => {
        const [inv, slot] = state.popInts(2);

        const obj = state.activePlayer.invGetSlot(inv, slot);
        state.pushInt(obj?.id ?? -1);
    },

    [ScriptOpcode.INV_ITEMSPACE2]: (state) => {
        const [inv, obj, count, size] = state.popInts(4);

        if (obj == -1) {
            throw new Error(`INV_ITEMSPACE2 attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_ITEMSPACE2 attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        state.pushInt(state.activePlayer.invItemSpace(inv, obj, count, size));
    },

    [ScriptOpcode.INV_MOVEITEM]: (state) => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        if (obj == -1) {
            throw new Error(`INV_MOVEITEM attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_MOVEITEM attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        const completed = state.activePlayer.invDel(fromInv, obj, count);
        if (completed == 0) {
            return;
        }

        state.activePlayer.invAdd(toInv, obj, completed);
    },

    [ScriptOpcode.INV_RESENDSLOT]: (state) => {
        const [inv, slot] = state.popInts(2);

        state.activePlayer.invResendSlot(inv, slot);
    },

    [ScriptOpcode.INV_SETSLOT]: (state) => {
        const [inv, slot, obj, count] = state.popInts(4);

        if (obj == -1) {
            throw new Error(`INV_SETSLOT attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_SETSLOT attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        state.activePlayer.invSet(inv, obj, count, slot);
    },

    [ScriptOpcode.INV_SIZE]: (state) => {
        const inv = state.popInt();

        state.pushInt(state.activePlayer.invSize(inv) as number);
    },

    [ScriptOpcode.INV_TOTAL]: (state) => {
        const [inv, obj] = state.popInts(2);

        if (obj == -1) {
            state.pushInt(0);
            return;
        }

        state.pushInt(state.activePlayer.invTotal(inv, obj) as number);
    },

    [ScriptOpcode.INV_TRANSMIT]: (state) => {
        const [inv, com] = state.popInts(2);

        state.activePlayer.invListenOnCom(inv, com);
    },

    [ScriptOpcode.INV_STOPTRANSMIT]: (state) => {
        const [inv, com] = state.popInts(2);

        state.activePlayer.invStopListenOnCom(inv, com);
    },

    [ScriptOpcode.INV_ITEMSPACE]: (state) => {
        const [inv, obj, count, size] = state.popInts(4);

        if (obj == -1) {
            throw new Error(`INV_ITEMSPACE attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_ITEMSPACE attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }
        state.pushInt(state.activePlayer.invItemSpace(inv, obj, count, size) == 0 ? 1 : 0);
    },

    [ScriptOpcode.INV_FREESPACE]: (state) => {
        const inv = state.popInt();

        state.pushInt(state.activePlayer.invFreeSpace(inv) as number);
    },

    [ScriptOpcode.INV_CLEAR]: (state) => {
        const inv = state.popInt();

        state.activePlayer.invClear(inv);
    },

    [ScriptOpcode.INV_ALLSTOCK]: (state) => {
        const inv = state.popInt();

        const invType = InvType.get(inv);
        state.pushInt(invType.allstock ? 1 : 0);
    },

    [ScriptOpcode.INV_STOCKBASE]: (state) => {
        const [inv, obj] = state.popInts(2);

        if (obj == -1) {
            throw new Error(`INV_STOCKBASE attempted to use obj with id: ${obj}`);
        }

        state.pushInt(state.activePlayer.stockBase(inv, obj));
    },

    [ScriptOpcode.INV_GETNUM]: (state) => {
        const [inv, slot] = state.popInts(2);

        const obj = state.activePlayer.invGetSlot(inv, slot);
        state.pushInt(obj?.count ?? 0);
    },

    [ScriptOpcode.INV_MOVEITEM_CERT]: (state) => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        if (obj == -1) {
            throw new Error(`INV_MOVEITEM_CERT attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_MOVEITEM_CERT attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        const completed = state.activePlayer.invDel(fromInv, obj, count);
        if (completed == 0) {
            return;
        }

        const objType = ObjType.get(obj);
        if (objType.certtemplate == -1 && objType.certlink >= 0) {
            state.activePlayer.invAdd(toInv, objType.certlink, completed);
        } else {
            state.activePlayer.invAdd(toInv, obj, completed);
        }
    },

    [ScriptOpcode.INV_MOVEITEM_UNCERT]: (state) => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        if (obj == -1) {
            throw new Error(`INV_MOVEITEM_UNCERT attempted to use obj with id: ${obj}`);
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_MOVEITEM_UNCERT attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
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
    },

    [ScriptOpcode.INV_MOVETOSLOT]: (state) => {
        const [fromInv, toInv, fromSlot, toSlot] = state.popInts(4);

        state.activePlayer.invMoveToSlot(fromInv, toInv, fromSlot, toSlot);
    },

    [ScriptOpcode.INV_MOVEFROMSLOT]: (state) => {
        const [fromInv, toInv, fromSlot] = state.popInts(3);

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
    },

    [ScriptOpcode.INV_DELSLOT]: (state) => {
        const [inv, slot] = state.popInts(2);

        const obj = state.activePlayer.invGetSlot(inv, slot);
        if (!obj) {
            return;
        }

        state.activePlayer.invDelSlot(inv, slot);
    },

    [ScriptOpcode.INV_DROPSLOT]: (state) => {
        const [inv, coord, slot, duration] = state.popInts(4);

        const obj = state.activePlayer.invGetSlot(inv, slot);
        if (!obj) {
            throw new Error(`INV_DROPSLOT attempted to use obj was null. This means the obj does not exist at this slot: ${slot}`);
        }

        if (duration < 1) {
            throw new Error(`INV_DROPSLOT attempted to use duration that was out of range: ${duration}. duration should be greater than zero.`);
        }

        if (coord < 0 || coord > Position.max) {
            throw new Error(`INV_DROPSLOT attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const pos = Position.unpackCoord(coord);

        const player = state.activePlayer;
        const completed = player.invDel(inv, obj.id, obj.count, slot);
        if (completed == 0) {
            return;
        }

        const floorObj = new Obj(pos.level, pos.x, pos.z, obj.id, completed);
        World.addObj(floorObj, player, duration);
    },

    [ScriptOpcode.INV_DROPITEM]: (state) => {
        const [inv, coord, obj, count, duration] = state.popInts(5);

        if (obj == -1) {
            throw new Error('INV_DROPITEM attempted to use obj was null.');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`INV_DROPITEM attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        if (duration < 1) {
            throw new Error(`INV_DROPITEM attempted to use duration that was out of range: ${duration}. duration should be greater than zero.`);
        }

        if (coord < 0 || coord > Position.max) {
            throw new Error(`INV_DROPITEM attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const pos = Position.unpackCoord(coord);

        const player = state.activePlayer;
        const completed = player.invDel(inv, obj, count);
        if (completed == 0) {
            return;
        }

        const floorObj = new Obj(pos.level, pos.x, pos.z, obj, completed);
        World.addObj(floorObj, player, duration);
    },

    [ScriptOpcode.BOTH_MOVEINV]: (state) => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.INV_TOTALCAT]: (state) => {
        const [inv, category] = state.popInts(2);
        state.pushInt(state.activePlayer.invTotalCat(inv, category));
    },

    [ScriptOpcode.INVOTHER_TRANSMIT]: (state) => {
        const [player, inv, com] = state.popInts(3);

        state.activePlayer.invListenOnCom(inv, com, player);
    },

    [ScriptOpcode.INVOTHER_STOPTRANSMIT]: (state) => {
        const [player, inv, com] = state.popInts(3);

        state.activePlayer.invStopListenOnCom(inv, com, player);
    },
};

export default InvOps;
