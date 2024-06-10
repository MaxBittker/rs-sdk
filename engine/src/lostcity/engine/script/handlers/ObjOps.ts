import InvType from '#lostcity/cache/config/InvType.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import { ParamHelper } from '#lostcity/cache/config/ParamHelper.js';
import ParamType from '#lostcity/cache/config/ParamType.js';

import World from '#lostcity/engine/World.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import {ActiveObj, ActivePlayer} from '#lostcity/engine/script/ScriptPointer.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';

import Obj from '#lostcity/entity/Obj.js';
import { Position } from '#lostcity/entity/Position.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

import Environment from '#lostcity/util/Environment.js';

import {
    check,
    CoordValid,
    DurationValid,
    InvTypeValid,
    ObjStackValid,
    ObjTypeValid,
    ParamTypeValid
} from '#lostcity/engine/script/ScriptValidators.js';

const ObjOps: CommandHandlers = {
    [ScriptOpcode.OBJ_ADD]: state => {
        const [coord, objId, count, duration] = state.popInts(4);

        if (objId === -1 || count === -1) {
            return;
        }

        const objType: ObjType = check(objId, ObjTypeValid);
        check(duration, DurationValid);
        const position: Position = check(coord, CoordValid);
        check(count, ObjStackValid);

        if (objType.dummyitem !== 0) {
            throw new Error(`attempted to add dummy item: ${objType.debugname}`);
        }

        const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, count);
        World.addObj(obj, state.activePlayer, duration);
        state.activeObj = obj;
        state.pointerAdd(ActiveObj[state.intOperand]);

        if (Environment.CLIRUNNER) {
            state.activePlayer.invAdd(InvType.getByName('bank')!.id, objId, count);
        }
    },

    [ScriptOpcode.OBJ_ADDALL]: state => {
        throw new Error('unimplemented');
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
            World.removeObj(state.activeObj, state.activePlayer, duration);
        } else {
            World.removeObj(state.activeObj, null, duration);
        }
    },

    [ScriptOpcode.OBJ_COUNT]: state => {
        state.pushInt(check(state.activeObj.count, ObjStackValid));
    },

    [ScriptOpcode.OBJ_TYPE]: state => {
        state.pushInt(check(state.activeObj.type, ObjTypeValid).id);
    },

    [ScriptOpcode.OBJ_TAKEITEM]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        const obj = state.activeObj;
        if (World.getObj(obj.x, obj.z, obj.level, obj.type)) {
            const objType = ObjType.get(obj.type);
            state.activePlayer.playerLog('Picked up item', objType.debugname as string);

            state.activePlayer.invAdd(invType.id, obj.type, obj.count);

            if (World.getZone(obj.x, obj.z, obj.level).staticObjs.includes(obj)) {
                World.removeObj(obj, state.activePlayer, objType.respawnrate);
            } else {
                World.removeObj(obj, state.activePlayer, -1);
            }
        }
    },

    [ScriptOpcode.OBJ_COORD]: state => {
        const position: Position = state.activeObj;
        state.pushInt(Position.packCoord(position.level, position.x, position.z));
    }
};

export default ObjOps;
