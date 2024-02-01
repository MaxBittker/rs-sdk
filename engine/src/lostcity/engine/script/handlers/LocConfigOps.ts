import LocType from '#lostcity/cache/LocType.js';
import { ParamHelper } from '#lostcity/cache/ParamHelper.js';
import ParamType from '#lostcity/cache/ParamType.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';

const LocConfigOps: CommandHandlers = {
    [ScriptOpcode.LC_NAME]: state => {
        const locId = state.popInt();

        if (locId == -1) {
            throw new Error(`attempted to use obj with id: ${locId}`);
        }

        const locType = LocType.get(locId);

        state.pushString(locType.name ?? locType.debugname ?? 'null');
    },

    [ScriptOpcode.LC_PARAM]: state => {
        const [locId, paramId] = state.popInts(2);

        if (locId == -1) {
            throw new Error(`attempted to use obj with id: ${locId}`);
        }

        if (paramId == -1) {
            throw new Error(`attempted to use param with id: ${paramId}`);
        }

        const locType = LocType.get(locId);
        const paramType = ParamType.get(paramId);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramId, locType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramId, locType, paramType.defaultInt));
        }
    },

    [ScriptOpcode.LC_CATEGORY]: state => {
        const locId = state.popInt();

        if (locId == -1) {
            throw new Error(`attempted to use obj with id: ${locId}`);
        }

        const locType = LocType.get(locId);

        state.pushInt(locType.category);
    },

    [ScriptOpcode.LC_DESC]: state => {
        const locId = state.popInt();

        if (locId == -1) {
            throw new Error(`attempted to use obj with id: ${locId}`);
        }

        const locType = LocType.get(locId);

        state.pushString(locType.desc ?? 'null');
    },

    [ScriptOpcode.LC_DEBUGNAME]: state => {
        const locId = state.popInt();

        if (locId == -1) {
            throw new Error(`attempted to use obj with id: ${locId}`);
        }

        const locType = LocType.get(locId);

        state.pushString(locType.debugname ?? 'null');
    }
};

export default LocConfigOps;
