import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';
import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import Script from '#lostcity/engine/script/Script.js';

function gosub(state: ScriptState, id: number) {
    if (state.fp >= 50) {
        throw new Error('stack overflow');
    }

    // set up the gosub frame
    state.frames[state.fp++] = {
        script: state.script,
        pc: state.pc,
        intLocals: state.intLocals,
        stringLocals: state.stringLocals,
    };

    // lookup script and set it up
    const script = ScriptProvider.get(id);
    if (!script) {
        throw new Error(`unable to find proc ${script}`);
    }
    setupNewScript(state, script);
}

function jump(state: ScriptState, id: number) {
    const label = ScriptProvider.get(id);
    if (!label) {
        throw new Error(`unable to find label ${id}`);
    }

    setupNewScript(state, label);
    state.fp = 0;
    state.frames = [];
}

function setupNewScript(state: ScriptState, script: Script) {
    state.script = script;
    state.pc = -1;
    state.intLocals = state.popInts(script.intArgCount);
    state.stringLocals = state.popStrings(script.stringArgCount);
}

const CoreOps: CommandHandlers = {
    [ScriptOpcode.PUSH_CONSTANT_INT]: (state) => {
        state.pushInt(state.intOperand);
    },

    [ScriptOpcode.PUSH_CONSTANT_STRING]: (state) => {
        state.pushString(state.stringOperand);
    },

    [ScriptOpcode.PUSH_VARP]: (state) => {
        if (state._activePlayer === null) {
            throw new Error('No active_player.');
        }
        const varp = state.intOperand;
        state.pushInt(state._activePlayer.getVarp(varp));
    },

    [ScriptOpcode.POP_VARP]: (state) => {
        if (state._activePlayer === null) {
            throw new Error('No active_player.');
        }
        const varp = state.intOperand;
        const value = state.popInt();
        state._activePlayer.setVarp(varp, value);
    },

    [ScriptOpcode.PUSH_VARN]: (state) => {
        if (state._activeNpc === null) {
            throw new Error('No active_npc.');
        }
        const varp = state.intOperand;
        state.pushInt(state._activeNpc.getVar(varp));
    },

    [ScriptOpcode.POP_VARN]: (state) => {
        if (state._activeNpc === null) {
            throw new Error('No active_npc.');
        }
        const varp = state.intOperand;
        const value = state.popInt();
        state._activeNpc.setVar(varp, value);
    },

    [ScriptOpcode.PUSH_INT_LOCAL]: (state) => {
        state.pushInt(state.intLocals[state.intOperand]);
    },

    [ScriptOpcode.POP_INT_LOCAL]: (state) => {
        state.intLocals[state.intOperand] = state.popInt();
    },

    [ScriptOpcode.PUSH_STRING_LOCAL]: (state) => {
        state.pushString(state.stringLocals[state.intOperand]);
    },

    [ScriptOpcode.POP_STRING_LOCAL]: (state) => {
        state.stringLocals[state.intOperand] = state.popString();
    },

    [ScriptOpcode.BRANCH]: (state) => {
        state.pc += state.intOperand;
    },

    [ScriptOpcode.BRANCH_NOT]: (state) => {
        const b = state.popInt();
        const a = state.popInt();

        if (a !== b) {
            state.pc += state.intOperand;
        }
    },

    [ScriptOpcode.BRANCH_EQUALS]: (state) => {
        const b = state.popInt();
        const a = state.popInt();

        if (a === b) {
            state.pc += state.intOperand;
        }
    },

    [ScriptOpcode.BRANCH_LESS_THAN]: (state) => {
        const b = state.popInt();
        const a = state.popInt();

        if (a < b) {
            state.pc += state.intOperand;
        }
    },

    [ScriptOpcode.BRANCH_GREATER_THAN]: (state) => {
        const b = state.popInt();
        const a = state.popInt();

        if (a > b) {
            state.pc += state.intOperand;
        }
    },

    [ScriptOpcode.BRANCH_LESS_THAN_OR_EQUALS]: (state) => {
        const b = state.popInt();
        const a = state.popInt();

        if (a <= b) {
            state.pc += state.intOperand;
        }
    },

    [ScriptOpcode.BRANCH_GREATER_THAN_OR_EQUALS]: (state) => {
        const b = state.popInt();
        const a = state.popInt();

        if (a >= b) {
            state.pc += state.intOperand;
        }
    },

    [ScriptOpcode.POP_INT_DISCARD]: (state) => {
        state.isp--;
    },

    [ScriptOpcode.POP_STRING_DISCARD]: (state) => {
        state.ssp--;
    },

    [ScriptOpcode.RETURN]: (state) => {
        if (state.fp === 0) {
            state.execution = ScriptState.FINISHED;
            return;
        }

        const frame = state.frames[--state.fp];
        state.pc = frame.pc;
        state.script = frame.script;
        state.intLocals = frame.intLocals;
        state.stringLocals = frame.stringLocals;
    },

    [ScriptOpcode.JOIN_STRING]: (state) => {
        const count = state.intOperand;

        const strings = [];
        for (let i = 0; i < count; i++) {
            strings.push(state.popString());
        }

        state.pushString(strings.reverse().join(''));
    },

    [ScriptOpcode.GOSUB]: (state) => {
        gosub(state, state.popInt());
    },

    [ScriptOpcode.GOSUB_WITH_PARAMS]: (state) => {
        gosub(state, state.intOperand);
    },

    [ScriptOpcode.JUMP]: (state) => {
        jump(state, state.popInt());
    },

    [ScriptOpcode.JUMP_WITH_PARAMS]: (state) => {
        jump(state, state.intOperand);
    },

    [ScriptOpcode.DEFINE_ARRAY]: (state) => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.PUSH_ARRAY_INT]: (state) => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.POP_ARRAY_INT]: (state) => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.SWITCH]: (state) => {
        const key = state.popInt();
        const table = state.script.switchTables[state.intOperand];
        if (table === undefined) {
            return;
        }

        const result = table[key];
        if (result) {
            state.pc += result;
        }
    },
};

export default CoreOps;
