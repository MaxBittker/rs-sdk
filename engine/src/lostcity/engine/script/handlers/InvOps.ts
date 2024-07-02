import InvType from '#lostcity/cache/config/InvType.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import CategoryType from '#lostcity/cache/config/CategoryType.js';

import World from '#lostcity/engine/World.js';
import {Inventory} from '#lostcity/engine/Inventory.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import {CommandHandlers} from '#lostcity/engine/script/ScriptRunner.js';
import {ActiveObj, ActivePlayer, checkedHandler, ProtectedActivePlayer} from '#lostcity/engine/script/ScriptPointer.js';

import Obj from '#lostcity/entity/Obj.js';
import {Position} from '#lostcity/entity/Position.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';
import Player from '#lostcity/entity/Player.js';

import {
    CategoryTypeValid,
    check,
    CoordValid,
    DurationValid,
    InvTypeValid,
    NumberNotNull,
    ObjStackValid,
    ObjTypeValid
} from '#lostcity/engine/script/ScriptValidators.js';

const InvOps: CommandHandlers = {
    // inv config
    [ScriptOpcode.INV_ALLSTOCK]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        state.pushInt(invType.allstock ? 1 : 0);
    },

    // inv config
    [ScriptOpcode.INV_SIZE]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        state.pushInt(invType.size);
    },

    // inv config
    [ScriptOpcode.INV_STOCKBASE]: state => {
        const [inv, obj] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);

        if (!invType.stockobj || !invType.stockcount) {
            state.pushInt(-1);
            return;
        }

        const index = invType.stockobj.indexOf(objType.id);
        state.pushInt(index >= 0 ? invType.stockcount[index] : -1);
    },

    // inv write
    [ScriptOpcode.INV_ADD]: checkedHandler(ActivePlayer, state => {
        const [inv, objId, count] = state.popInts(3);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(objId, ObjTypeValid);
        check(count, ObjStackValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        if (!invType.dummyinv && objType.dummyitem !== 0) {
            throw new Error(`dummyitem in non-dummyinv: ${objType.debugname} -> ${invType.debugname}`);
        }

        const player = state.activePlayer;
        const overflow = count - player.invAdd(invType.id, objType.id, count);
        if (overflow > 0) {
            World.addObj(new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, objType.id, overflow), player.pid, 200);
        }
    }),

    // inv write
    [ScriptOpcode.INV_CHANGESLOT]: checkedHandler(ActivePlayer, state => {
        const [inv, find, replace, replaceCount] = state.popInts(4);
        throw new Error('unimplemented');
    }),

    // inv write
    [ScriptOpcode.INV_CLEAR]: checkedHandler(ActivePlayer, state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        state.activePlayer.invClear(invType.id);
    }),

    // inv write
    [ScriptOpcode.INV_DEL]: checkedHandler(ActivePlayer, state => {
        const [inv, obj, count] = state.popInts(3);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        state.activePlayer.invDel(invType.id, objType.id, count);
    }),

    // inv write
    [ScriptOpcode.INV_DELSLOT]: checkedHandler(ActivePlayer, state => {
        const [inv, slot] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const obj = state.activePlayer.invGetSlot(invType.id, slot);
        if (!obj) {
            return;
        }

        state.activePlayer.invDelSlot(invType.id, slot);
    }),

    // inv write
    [ScriptOpcode.INV_DROPITEM]: checkedHandler(ActivePlayer, state => {
        const [inv, coord, obj, count, duration] = state.popInts(5);

        const invType: InvType = check(inv, InvTypeValid);
        const position: Position = check(coord, CoordValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);
        check(duration, DurationValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const player = state.activePlayer;
        const completed = player.invDel(invType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        player.playerLog('Dropped item from', invType.debugname as string, objType.debugname as string);

        const floorObj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objType.id, completed);
        World.addObj(floorObj, player.pid, duration);
        state.activeObj = floorObj;
        state.pointerAdd(ActiveObj[state.intOperand]);
    }),

    // inv write
    [ScriptOpcode.INV_DROPSLOT]: checkedHandler(ActivePlayer, state => {
        const [inv, coord, slot, duration] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        check(duration, DurationValid);
        const position: Position = check(coord, CoordValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const obj = state.activePlayer.invGetSlot(invType.id, slot);
        if (!obj) {
            throw new Error('$slot is empty');
        }

        const player = state.activePlayer;
        const completed = player.invDel(invType.id, obj.id, obj.count, slot);
        if (completed === 0) {
            return;
        }

        const objType = ObjType.get(obj.id);
        player.playerLog('Dropped item from', invType.debugname as string, objType.debugname as string);

        const floorObj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, obj.id, completed);
        World.addObj(floorObj, player.pid, duration);
        state.activeObj = floorObj;
        state.pointerAdd(ActiveObj[state.intOperand]);
    }),

    // inv read
    [ScriptOpcode.INV_FREESPACE]: checkedHandler(ActivePlayer, state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        state.pushInt(state.activePlayer.invFreeSpace(invType.id));
    }),

    // inv read
    [ScriptOpcode.INV_GETNUM]: checkedHandler(ActivePlayer, state => {
        const [inv, slot] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        state.pushInt(state.activePlayer.invGetSlot(invType.id, slot)?.count ?? 0);
    }),

    // inv read
    [ScriptOpcode.INV_GETOBJ]: checkedHandler(ActivePlayer, state => {
        const [inv, slot] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        state.pushInt(state.activePlayer.invGetSlot(invType.id, slot)?.id ?? -1);
    }),

    // inv read
    [ScriptOpcode.INV_ITEMSPACE]: checkedHandler(ActivePlayer, state => {
        const [inv, obj, count, size] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        if (size < 0 || size > invType.size) {
            throw new Error(`$count is out of range: ${count}`);
        }

        state.pushInt(state.activePlayer.invItemSpace(invType.id, objType.id, count, size) === 0 ? 1 : 0);
    }),

    // inv read
    [ScriptOpcode.INV_ITEMSPACE2]: checkedHandler(ActivePlayer, state => {
        const [inv, obj, count, size] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        state.pushInt(state.activePlayer.invItemSpace(invType.id, objType.id, count, size));
    }),

    // inv write
    [ScriptOpcode.INV_MOVEFROMSLOT]: checkedHandler(ActivePlayer, state => {
        const [fromInv, toInv, fromSlot] = state.popInts(3);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${fromInvType.debugname}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && toInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${toInvType.debugname}`);
        }

        const player = state.activePlayer;
        const { overflow, fromObj } = player.invMoveFromSlot(fromInvType.id, toInvType.id, fromSlot);
        if (overflow > 0) {
            World.addObj(new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, fromObj, overflow), player.pid, 200);
        }
    }),

    // inv write
    [ScriptOpcode.INV_MOVETOSLOT]: checkedHandler(ActivePlayer, state => {
        const [fromInv, toInv, fromSlot, toSlot] = state.popInts(4);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${fromInvType.debugname}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && toInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${toInvType.debugname}`);
        }

        state.activePlayer.invMoveToSlot(fromInvType.id, toInvType.id, fromSlot, toSlot);
    }),

    // inv write
    [ScriptOpcode.BOTH_MOVEINV]: checkedHandler(ActivePlayer, state => {
        const [from, to] = state.popInts(2);

        const fromInvType: InvType = check(from, InvTypeValid);
        const toInvType: InvType = check(to, InvTypeValid);

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

        if (!state.pointerGet(ProtectedActivePlayer[secondary ? 1 : 0]) && fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$from_inv requires protected access: ${fromInvType.debugname}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[secondary ? 0 : 1]) && toInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$to_inv requires protected access: ${toInvType.debugname}`);
        }

        const fromInv = fromPlayer.getInventory(from);
        const toInv = toPlayer.getInventory(to);

        if (!fromInv || !toInv) {
            throw new Error('inv is null');
        }

        // we're going to assume the content has made sure this will go as expected
        for (let slot = 0; slot < fromInv.capacity; slot++) {
            const obj = fromInv.get(slot);
            if (!obj) {
                continue;
            }

            fromInv.delete(slot);
            toInv.add(obj.id, obj.count);

            fromPlayer.playerLog('Gave ' + ObjType.get(obj.id).name + ' x' + obj.count + ' during trade with ' + toPlayer.username);
            toPlayer.playerLog('Received ' + ObjType.get(obj.id).name + ' x' + obj.count + ' during trade with ' + fromPlayer.username);
        }
    }),

    // inv write
    [ScriptOpcode.INV_MOVEITEM]: checkedHandler(ActivePlayer, state => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${fromInvType.debugname}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && toInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${toInvType.debugname}`);
        }

        const player: Player = state.activePlayer;
        const completed = player.invDel(fromInvType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        const overflow = count - player.invAdd(toInvType.id, objType.id, completed);
        if (overflow > 0) {
            World.addObj(new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, objType.id, overflow), player.pid, 200);
        }
    }),

    // inv write
    [ScriptOpcode.INV_MOVEITEM_CERT]: checkedHandler(ActivePlayer, state => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        const fromInvType = check(fromInv, InvTypeValid);
        const toInvType = check(toInv, InvTypeValid);
        const objType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${fromInvType.debugname}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && toInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${toInvType.debugname}`);
        }

        const player: Player = state.activePlayer;
        const completed = player.invDel(fromInvType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        let finalObj = objType.id;
        if (objType.certtemplate === -1 && objType.certlink >= 0) {
            finalObj = objType.certlink;
        }
        const overflow = count - player.invAdd(toInvType.id, finalObj, completed);
        if (overflow > 0) {
            World.addObj(new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, finalObj, overflow), player.pid, 200);
        }
    
    }),

    // inv write
    [ScriptOpcode.INV_MOVEITEM_UNCERT]: checkedHandler(ActivePlayer, state => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${fromInvType.debugname}`);
        }

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && toInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${toInvType.debugname}`);
        }

        const player: Player = state.activePlayer;
        const completed = player.invDel(fromInvType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        if (objType.certtemplate >= 0 && objType.certlink >= 0) {
            player.invAdd(toInvType.id, objType.certlink, completed);
        } else {
            player.invAdd(toInvType.id, objType.id, completed);
        }
    }),

    // inv write
    [ScriptOpcode.INV_SETSLOT]: checkedHandler(ActivePlayer, state => {
        const [inv, slot, objId, count] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(objId, ObjTypeValid);
        check(count, ObjStackValid);

        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        if (!invType.dummyinv && objType.dummyitem !== 0) {
            throw new Error(`dummyitem in non-dummyinv: ${objType.debugname} -> ${invType.debugname}`);
        }

        state.activePlayer.invSet(invType.id, objType.id, count, slot);
    }),

    // inv read
    [ScriptOpcode.INV_TOTAL]: checkedHandler(ActivePlayer, state => {
        const [inv, obj] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);

        // todo: error instead?
        if (obj === -1) {
            state.pushInt(0);
            return;
        }

        state.pushInt(state.activePlayer.invTotal(invType.id, obj));
    }),

    // inv read
    [ScriptOpcode.INV_TOTALCAT]: checkedHandler(ActivePlayer, state => {
        const [inv, category] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        const catType: CategoryType = check(category, CategoryTypeValid);

        state.pushInt(state.activePlayer.invTotalCat(invType.id, catType.id));
    }),

    // inv protocol
    [ScriptOpcode.INV_TRANSMIT]: checkedHandler(ActivePlayer, state => {
        const [inv, com] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        check(com, NumberNotNull);

        state.activePlayer.invListenOnCom(invType.id, com, state.activePlayer.uid);
    }),

    // inv protocol
    [ScriptOpcode.INVOTHER_TRANSMIT]: checkedHandler(ActivePlayer, state => {
        const [uid, inv, com] = state.popInts(3);

        check(uid, NumberNotNull);
        const invType: InvType = check(inv, InvTypeValid);
        check(com, NumberNotNull);

        state.activePlayer.invListenOnCom(invType.id, com, uid);
    }),

    // inv protocol
    [ScriptOpcode.INV_STOPTRANSMIT]: checkedHandler(ActivePlayer, state => {
        const com = check(state.popInt(), NumberNotNull);

        state.activePlayer.invStopListenOnCom(com);
    }),

    // inv write
    [ScriptOpcode.BOTH_DROPSLOT]: checkedHandler(ActivePlayer, state => {
        const [inv, coord, slot, duration] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        check(duration, DurationValid);
        const position: Position = check(coord, CoordValid);

        const secondary = state.intOperand == 1;

        // from = active_player
        // to = .active_player
        // if both_dropslot is called as .both_dropslot, then from/to pointers are swapped

        const fromPlayer: Player | null = secondary ? state._activePlayer2 : state._activePlayer;
        const toPlayer: Player | null = secondary ? state._activePlayer : state._activePlayer2;

        if (!fromPlayer || !toPlayer) {
            throw new Error('player is null');
        }

        if (!state.pointerGet(ProtectedActivePlayer[secondary ? 1 : 0]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`inv requires protected access: ${invType.debugname}`);
        }

        const obj = fromPlayer.invGetSlot(invType.id, slot);
        if (!obj) {
            throw new Error('$slot is empty');
        }

        const completed: number = fromPlayer.invDel(invType.id, obj.id, obj.count, slot);
        if (completed === 0) {
            return;
        }

        const objType: ObjType = ObjType.get(obj.id);
        fromPlayer.playerLog('Dropped item from', invType.debugname as string, objType.debugname as string);

        if (!objType.tradeable) {
            return; // stop untradables after delete.
        }

        World.addObj(new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, obj.id, completed), toPlayer.pid, duration);
    }),

    // inv write
    [ScriptOpcode.INV_DROPALL]: checkedHandler(ActivePlayer, state => {
        const [inv, coord, duration] = state.popInts(3);

        const invType: InvType = check(inv, InvTypeValid);
        check(duration, DurationValid);
        const position: Position = check(coord, CoordValid);


        if (!state.pointerGet(ProtectedActivePlayer[state.intOperand]) && invType.protect && invType.scope !== InvType.SCOPE_SHARED) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const inventory: Inventory | null = state.activePlayer.getInventory(invType.id);
        if (!inventory) {
            return;
        }

        for (let slot: number = 0; slot < inventory.capacity; slot++) {
            const obj = inventory.get(slot);
            if (!obj) {
                continue;
            }

            inventory.delete(slot);

            const objType: ObjType = ObjType.get(obj.id);
            if (!objType.tradeable) {
                continue; // stop untradables after delete.
            }

            World.addObj(new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, obj.id, obj.count), -1, duration);
        }
    }),

    [ScriptOpcode.INV_TOTALPARAM]: checkedHandler(ActivePlayer, state => {
        const [inv, param] = state.popInts(2);

        state.pushInt(state.activePlayer.invTotalParam(inv, param));
    }),

    [ScriptOpcode.INV_TOTALPARAM_STACK]: checkedHandler(ActivePlayer, state => {
        const [inv, param] = state.popInts(2);

        state.pushInt(state.activePlayer.invTotalParamStack(inv, param));
    })
};

export default InvOps;
