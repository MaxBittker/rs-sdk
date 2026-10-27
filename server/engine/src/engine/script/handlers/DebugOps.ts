import { CoordGrid } from '#/engine/CoordGrid.js';
import { openExchange } from '#/engine/market/GrandExchange.js';
import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import World from '#/engine/World.js';
import Environment from '#/util/Environment.js';

// rs-sdk: the runite leaderboard only counts the two Lava Maze rocks (m47_60)
const LEADERBOARD_RUNITE_ROCKS: Set<number> = new Set([CoordGrid.packCoord(0, 3059, 3885), CoordGrid.packCoord(0, 3060, 3884)]);

const DebugOps: CommandHandlers = {
    [ScriptOpcode.GE_OPEN]: state => {
        const { level, x, z } = CoordGrid.unpackCoord(state.popInt());
        if (level === 0) openExchange(state.activePlayer, x, z);
    },
    [ScriptOpcode.RUNITE_MINED]: state => {
        if (LEADERBOARD_RUNITE_ROCKS.has(state.popInt())) World.notifyRuniteMined(state.activePlayer);
    },
    [ScriptOpcode.ERROR]: state => {
        throw new Error(state.popString());
    },

    [ScriptOpcode.CONSOLE]: state => {
        console.log(state.popString());
    },

    [ScriptOpcode.MAP_RANDOM_EVENTS]: state => {
        state.pushInt(Environment.NODE_RANDOM_EVENTS ? 1 : 0);
    },

    [ScriptOpcode.MAP_LEVELUP_INTERFACE]: state => {
        state.pushInt(Environment.NODE_LEVELUP_INTERFACE ? 1 : 0);
    },

    [ScriptOpcode.TIMESPENT]: state => {
        state.timespent = performance.now();
    },

    [ScriptOpcode.GETTIMESPENT]: state => {
        const elapsed = performance.now() - state.timespent;

        if (state.popInt() === 1) {
            // microseconds
            state.pushInt(elapsed * 1000);
        } else {
            // milliseconds
            state.pushInt(elapsed);
        }
    }
};

export default DebugOps;
