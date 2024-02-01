import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';
import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';

const StringOps: CommandHandlers = {
    [ScriptOpcode.APPEND_NUM]: state => {
        const text = state.popString();
        const num = state.popInt();
        state.pushString(text + num);
    },

    [ScriptOpcode.APPEND]: state => {
        const [t1, t2] = state.popStrings(2);
        state.pushString(t1 + t2);
    },

    [ScriptOpcode.APPEND_SIGNNUM]: state => {
        const text = state.popString();
        const num = state.popInt();

        if (num >= 0) {
            state.pushString(`${text}+${num}`);
        } else {
            state.pushString(text + num);
        }
    },

    [ScriptOpcode.LOWERCASE]: state => {
        state.pushString(state.popString().toLowerCase());
    },

    [ScriptOpcode.TOSTRING]: state => {
        state.pushString(state.popInt().toString());
    },

    [ScriptOpcode.COMPARE]: state => {
        const [s1, s2] = state.popStrings(2);
        state.pushInt(javaStringCompare(s1, s2));
    },

    [ScriptOpcode.TEXT_SWITCH]: state => {
        const value = state.popInt();
        const [s1, s2] = state.popStrings(2);
        state.pushString(value === 1 ? s1 : s2);
    },

    [ScriptOpcode.APPEND_CHAR]: state => {
        const text = state.popString();
        const char = state.popInt();
        state.pushString(text + String.fromCharCode(char));
    },

    [ScriptOpcode.STRING_LENGTH]: state => {
        state.pushInt(state.popString().length);
    },

    [ScriptOpcode.SUBSTRING]: state => {
        const text = state.popString();
        const [start, end] = state.popInts(2);
        state.pushString(text.substring(start, end));
    },

    [ScriptOpcode.STRING_INDEXOF_CHAR]: state => {
        const text = state.popString();
        const find = String.fromCharCode(state.popInt());
        state.pushInt(text.indexOf(find));
    },

    [ScriptOpcode.STRING_INDEXOF_STRING]: state => {
        const text = state.popString();
        const find = state.popString();
        state.pushInt(text.indexOf(find));
    }
};

function javaStringCompare(a: string, b: string): number {
    const len1 = a.length;
    const len2 = b.length;
    const lim = Math.min(len1, len2);

    let k = 0;
    while (k < lim) {
        const c1 = a.charCodeAt(k);
        const c2 = b.charCodeAt(k);
        if (c1 != c2) {
            return c1 - c2;
        }
        k++;
    }
    return len1 - len2;
}

export default StringOps;
