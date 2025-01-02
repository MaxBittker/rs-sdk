import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import {ParamHelper} from '#/cache/config/ParamHelper.js';
import ParamType from '#/cache/config/ParamType.js';

import World from '#/engine/World.js';
import Zone from '#/engine/zone/Zone.js';

import ScriptOpcode from '#/engine/script/ScriptOpcode.js';
import {ActiveObj, ActivePlayer} from '#/engine/script/ScriptPointer.js';
import {CommandHandlers} from '#/engine/script/ScriptRunner.js';

import Obj from '#/engine/entity/Obj.js';
import {CoordGrid} from '#/engine/CoordGrid.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';

import {
    check,
    CoordValid,
    DurationValid,
    InvTypeValid,
    ObjStackValid,
    ObjTypeValid,
    ParamTypeValid
} from '#/engine/script/ScriptValidators.js';
import Environment from '#/util/Environment.js';

const ObjOps: CommandHandlers = {
    // https://x.com/JagexAsh/status/1679942100249464833
    // https://x.com/NobodyImpo74600/status/1791469645939065036
    [ScriptOpcode.OBJ_ADD]: state => {
        const [coord, objId, count, duration] = state.popInts(4);

        if (objId === -1 || count === -1) {
            return;
        }

        const objType: ObjType = check(objId, ObjTypeValid);
        check(duration, DurationValid);
        const position: CoordGrid = check(coord, CoordValid);
        check(count, ObjStackValid);

        if (objType.dummyitem !== 0) {
            throw new Error(`attempted to add dummy item: ${objType.debugname}`);
        }

        if (objType.members && !Environment.NODE_MEMBERS) {
            return;
        }

        if (!objType.stackable || count === 1) {
            for (let i = 0; i < count; i++) {
                const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, 1);
                World.addObj(obj, state.activePlayer.pid, duration);

                state.activeObj = obj;
                state.pointerAdd(ActiveObj[state.intOperand]);
            }
        } else {
            const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, count);
            World.addObj(obj, state.activePlayer.pid, duration);

            state.activeObj = obj;
            state.pointerAdd(ActiveObj[state.intOperand]);
        }
    },

    // https://x.com/JagexAsh/status/1778879334167548366
    [ScriptOpcode.OBJ_ADDALL]: state => {
        const [coord, objId, count, duration] = state.popInts(4);

        if (objId === -1 || count === -1) {
            return;
        }

        const objType: ObjType = check(objId, ObjTypeValid);
        check(duration, DurationValid);
        const position: CoordGrid = check(coord, CoordValid);
        check(count, ObjStackValid);

        if (objType.dummyitem !== 0) {
            throw new Error(`attempted to add dummy item: ${objType.debugname}`);
        }

        if (objType.members && !Environment.NODE_MEMBERS) {
            return;
        }

        if (!objType.stackable || count === 1) {
            for (let i = 0; i < count; i++) {
                const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, 1);
                World.addObj(obj, -1, duration);
    
                state.activeObj = obj;
                state.pointerAdd(ActiveObj[state.intOperand]);
            }
        } else {
            const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, count);
            World.addObj(obj, -1, duration);

            state.activeObj = obj;
            state.pointerAdd(ActiveObj[state.intOperand]);
        }
    },

    [ScriptOpcode.OBJ_PARAM]: state => {
        const paramType: ParamType = check(state.popInt(), ParamTypeValid);

        const objType: ObjType = check(state.activeObj.type, ObjTypeValid);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramType.id, objType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramType.id, objType, paramType.defaultInt));
        }
    },

    [ScriptOpcode.OBJ_NAME]: state => {
        const objType: ObjType = check(state.activeObj.type, ObjTypeValid);

        state.pushString(objType.name ?? objType.debugname ?? 'null');
    },

    [ScriptOpcode.OBJ_DEL]: state => {
        const duration: number = ObjType.get(state.activeObj.type).respawnrate;
        if (state.pointerGet(ActivePlayer[state.intOperand])) {
            World.removeObj(state.activeObj, duration);
        } else {
            World.removeObj(state.activeObj, duration);
        }
    },

    [ScriptOpcode.OBJ_COUNT]: state => {
        state.pushInt(check(state.activeObj.count, ObjStackValid));
    },

    [ScriptOpcode.OBJ_TYPE]: state => {
        state.pushInt(check(state.activeObj.type, ObjTypeValid).id);
    },

    // https://x.com/JagexAsh/status/1679942100249464833
    [ScriptOpcode.OBJ_TAKEITEM]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        const obj: Obj = state.activeObj;
        const objType = ObjType.get(obj.type);
        const zone: Zone = World.gameMap.getZone(obj.x, obj.z, obj.level);
        for (const o of zone.getObjsSafe(CoordGrid.packZoneCoord(obj.x, obj.z))) {
            if (o.type !== obj.type || o.count !== obj.count) {
                continue;
            }

            if (o.receiverId !== -1 && o.receiverId !== state.activePlayer.pid) {
                continue;
            }

            state.activePlayer.invAdd(invType.id, obj.type, obj.count);

            if (obj.lifecycle === EntityLifeCycle.RESPAWN) {
                World.removeObj(obj, objType.respawnrate);
                break;
            } else if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
                World.removeObj(obj, 0);
                break;
            }
        }
    },

    [ScriptOpcode.OBJ_COORD]: state => {
        const coord: CoordGrid = state.activeObj;
        state.pushInt(CoordGrid.packCoord(coord.level, coord.x, coord.z));
    },

    [ScriptOpcode.OBJ_FIND]: state => {
        const [coord, objId] = state.popInts(2);

        const objType: ObjType = check(objId, ObjTypeValid);
        const position: CoordGrid = check(coord, CoordValid);

        const obj = World.getObj(position.x, position.z, position.level, objType.id, state.activePlayer.pid);
        if (!obj) {
            state.pushInt(0);
            return;
        }

        state.activeObj = obj;
        state.pointerAdd(ActiveObj[state.intOperand]);
        state.pushInt(1);
    }

    // obj_setvar // https://x.com/JagexAsh/status/1679942100249464833
    // obj_adddelayed // https://x.com/JagexAsh/status/1730321158858276938
};

export default ObjOps;
