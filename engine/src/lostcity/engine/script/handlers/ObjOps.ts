import InvType from '#lostcity/cache/InvType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import { ParamHelper } from '#lostcity/cache/ParamHelper.js';
import ParamType from '#lostcity/cache/ParamType.js';

import { Inventory } from '#lostcity/engine/Inventory.js';
import World from '#lostcity/engine/World.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';

import Obj from '#lostcity/entity/Obj.js';
import { Position } from '#lostcity/entity/Position.js';

import Environment from '#lostcity/util/Environment.js';

const ActiveObj = [ScriptPointer.ActiveObj, ScriptPointer.ActiveObj2];

const ObjOps: CommandHandlers = {
    [ScriptOpcode.OBJ_ADD]: (state) => {
        const [coord, objId, count, duration] = state.popInts(4);

        if (objId == -1) {
            throw new Error('attempted to use obj was null.');
        }

        if (count < 1 || count > Inventory.STACK_LIMIT) {
            throw new Error(`attempted to use count that was out of range: ${count}. Range should be: 1 to ${Inventory.STACK_LIMIT}`);
        }

        if (duration < 1) {
            throw new Error(`attempted to use duration that was out of range: ${duration}. duration should be greater than zero.`);
        }

        if (coord < 0 || coord > Position.max) {
            throw new Error(`attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const type = ObjType.get(objId);
        if (type.dummyitem !== 0) {
            throw new Error(`attempted to add dummy item: ${type.debugname}`);
        }

        const pos = Position.unpackCoord(coord);

        const obj = new Obj(
            pos.level,
            pos.x,
            pos.z,
            objId,
            count
        );

        World.addObj(obj, state.activePlayer, duration);
        state.activeObj = obj;
        state.pointerAdd(ActiveObj[state.intOperand]);

        if (Environment.CLIRUNNER) {
            state.activePlayer.invAdd(InvType.getByName('bank')!.id, type, count);
        }
    },

    [ScriptOpcode.OBJ_ADDALL]: (state) => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.OBJ_PARAM]: (state) => {
        const paramId = state.popInt();
        const param = ParamType.get(paramId);

        const obj = ObjType.get(state.activeObj.type);
        if (param.isString()) {
            state.pushString(ParamHelper.getStringParam(paramId, obj, param.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramId, obj, param.defaultInt));
        }
    },

    [ScriptOpcode.OBJ_NAME]: (state) => {
        const obj = ObjType.get(state.activeObj.type);

        state.pushString(obj.name ?? obj.debugname ?? 'null');
    },

    [ScriptOpcode.OBJ_DEL]: (state) => {
        World.removeObj(state.activeObj, state.activePlayer);
    },

    [ScriptOpcode.OBJ_COUNT]: (state) => {
        state.pushInt(state.activeObj.count);
    },

    [ScriptOpcode.OBJ_TYPE]: (state) => {
        state.pushInt(state.activeObj.type);
    },

    [ScriptOpcode.OBJ_TAKEITEM]: (state) => {
        const inv = state.popInt();
        const obj = state.activeObj;

        if (World.getObj(obj.x, obj.z, obj.level, obj.id)){
            const objType = ObjType.get(obj.type);
            state.activePlayer.playerLog('Picked up item', objType.debugname as string);

            state.activePlayer.invAdd(inv, obj.id, obj.count);
            World.removeObj(obj, state.activePlayer);
        }
    },

    [ScriptOpcode.OBJ_COORD]: (state) => {
        const obj = state.activeObj;
        state.pushInt(Position.packCoord(obj.level, obj.x, obj.z));
    },
};

export default ObjOps;
