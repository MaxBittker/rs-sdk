import { CommandHandlers } from "#lostcity/engine/script/ScriptRunner.js";
import ScriptOpcode from "#lostcity/engine/script/ScriptOpcode.js";
import World from "#lostcity/engine/World.js";
import SeqType from "#lostcity/cache/SeqType.js";
import FontType from "#lostcity/cache/FontType.js";
import ParamType from "#lostcity/cache/ParamType.js";
import StructType from "#lostcity/cache/StructType.js";
import { ParamHelper } from "#lostcity/cache/ParamHelper.js";
import MesanimType from "#lostcity/cache/MesanimType.js";

const ServerOps: CommandHandlers = {
    [ScriptOpcode.MAP_CLOCK]: (state) => {
        state.pushInt(World.currentTick);
    },

    [ScriptOpcode.MAP_MEMBERS]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.MAP_PLAYERCOUNT]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.HUNTALL]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.HUNTNEXT]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.INAREA]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.INZONE]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.LINEOFWALK]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.OBJECTVERIFY]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.STAT_RANDOM]: (state) => {
        let [level, low, high] = state.popInts(3);

        let value = Math.floor(low * (99 - level) / 98) + Math.floor(high * (level - 1) / 98) + 1;
        let chance = Math.floor(Math.random() * 256);

        state.pushInt(value > chance ? 1 : 0);
    },

    [ScriptOpcode.SPOTANIM_MAP]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.DISTANCE]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.MOVECOORD]: (state) => {
        throw new Error("unimplemented");
    },

    [ScriptOpcode.SEQLENGTH]: (state) => {
        let seq = state.popInt();

        state.pushInt(SeqType.get(seq).duration);
    },

    [ScriptOpcode.SPLIT_INIT]: (state) => {
        const [maxWidth, linesPerPage, fontId, mesanimId] = state.popInts(4);
        const text = state.popString();
        const font = FontType.get(fontId);
        const lines = font.split(text, maxWidth);

        state.splitPages = [];
        state.splitMesanim = mesanimId;
        while (lines.length > 0) {
            state.splitPages.push(lines.splice(0, linesPerPage));
        }
    },

    [ScriptOpcode.SPLIT_GET]: (state) => {
        let [page, line] = state.popInts(2);

        state.pushString(state.splitPages[page][line]);
    },

    [ScriptOpcode.SPLIT_PAGECOUNT]: (state) => {
        state.pushInt(state.splitPages.length);
    },

    [ScriptOpcode.SPLIT_LINECOUNT]: (state) => {
        let page = state.popInt();

        state.pushInt(state.splitPages[page].length);
    },

    [ScriptOpcode.SPLIT_GETANIM]: (state) => {
        let page = state.popInt();
        if (state.splitMesanim === -1) {
            state.pushInt(-1);
            return;
        }

        let mesanimType = MesanimType.get(state.splitMesanim);
        state.pushInt(mesanimType.len[state.splitPages[page].length - 1]);
    },

    [ScriptOpcode.STRUCT_PARAM]: (state) => {
        let [structId, paramId] = state.popInts(2);
        let param = ParamType.get(paramId);
        let struct = StructType.get(structId);
        if (param.isString()) {
            state.pushString(ParamHelper.getStringParam(paramId, struct, param.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramId, struct, param.defaultInt));
        }
    },

    [ScriptOpcode.MAPSQUARE]: (state) => {
        let coord = state.popInt();

        let level = (coord >> 28) & 0x3;
        let x = (coord >> 14) & 0x3fff;
        let z = coord & 0x3fff;

        let mX = x >> 6;
        let mZ = z >> 6;

        state.pushInt((mZ << 6) | ((mX << 6) << 14) | (0 << 28));
    },
};

export default ServerOps;