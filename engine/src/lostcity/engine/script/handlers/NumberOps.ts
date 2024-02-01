import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';

import { bitcount, clearBitRange, MASK, setBitRange } from '#lostcity/util/Numbers.js';

const NumberOps: CommandHandlers = {
    [ScriptOpcode.ADD]: state => {
        const b = state.popInt();
        const a = state.popInt();
        state.pushInt(a + b);
    },

    [ScriptOpcode.SUB]: state => {
        const b = state.popInt();
        const a = state.popInt();
        state.pushInt(a - b);
    },

    [ScriptOpcode.MULTIPLY]: state => {
        const b = state.popInt();
        const a = state.popInt();
        state.pushInt(a * b);
    },

    [ScriptOpcode.DIVIDE]: state => {
        const b = state.popInt();
        const a = state.popInt();
        state.pushInt(a / b);
    },

    [ScriptOpcode.RANDOM]: state => {
        const a = state.popInt();
        state.pushInt(Math.random() * a);
    },

    [ScriptOpcode.RANDOMINC]: state => {
        const a = state.popInt();
        state.pushInt(Math.random() * (a + 1));
    },

    [ScriptOpcode.INTERPOLATE]: state => {
        const [y0, y1, x0, x1, x] = state.popInts(5);
        const lerp = Math.floor((y1 - y0) / (x1 - x0)) * (x - x0) + y0;

        state.pushInt(lerp);
    },

    [ScriptOpcode.ADDPERCENT]: state => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.SETBIT]: state => {
        const [value, bit] = state.popInts(2);
        state.pushInt(value | (1 << bit));
    },

    [ScriptOpcode.CLEARBIT]: state => {
        const [value, bit] = state.popInts(2);
        state.pushInt(value & ~(1 << bit));
    },

    [ScriptOpcode.TESTBIT]: state => {
        const [value, bit] = state.popInts(2);
        state.pushInt(value & (1 << bit) ? 1 : 0);
    },

    [ScriptOpcode.MODULO]: state => {
        const [n1, n2] = state.popInts(2);
        state.pushInt(n1 % n2);
    },

    [ScriptOpcode.POW]: state => {
        const [base, exponent] = state.popInts(2);
        state.pushInt(Math.pow(base, exponent));
    },

    [ScriptOpcode.INVPOW]: state => {
        const [n1, n2] = state.popInts(2);
        if (n1 === 0 || n2 === 0) {
            state.pushInt(0);
        } else {
            switch (n2) {
                case 1:
                    state.pushInt(n1);
                    return;
                case 2:
                    state.pushInt(Math.sqrt(n1));
                    return;
                case 3:
                    state.pushInt(Math.cbrt(n1));
                    return;
                case 4:
                    state.pushInt(Math.sqrt(Math.sqrt(n1)));
                    return;
                default:
                    state.pushInt(Math.pow(n1, 1.0 / n2));
                    return;
            }
        }
    },

    [ScriptOpcode.AND]: state => {
        const [n1, n2] = state.popInts(2);
        state.pushInt(n1 & n2);
    },

    [ScriptOpcode.OR]: state => {
        const [n1, n2] = state.popInts(2);
        state.pushInt(n1 | n2);
    },

    [ScriptOpcode.MIN]: state => {
        const [a, b] = state.popInts(2);
        state.pushInt(Math.min(a, b));
    },

    [ScriptOpcode.MAX]: state => {
        const [a, b] = state.popInts(2);
        state.pushInt(Math.max(a, b));
    },

    [ScriptOpcode.SCALE]: state => {
        const [a, b, c] = state.popInts(3);
        state.pushInt((a * c) / b);
    },

    [ScriptOpcode.BITCOUNT]: state => {
        state.pushInt(bitcount(state.popInt()));
    },

    [ScriptOpcode.TOGGLEBIT]: state => {
        const [value, bit] = state.popInts(2);
        state.pushInt(value ^ (1 << bit));
    },

    [ScriptOpcode.SETBIT_RANGE]: state => {
        const [num, startBit, endBit] = state.popInts(3);
        state.pushInt(setBitRange(num, startBit, endBit));
    },

    [ScriptOpcode.CLEARBIT_RANGE]: state => {
        const [num, startBit, endBit] = state.popInts(3);
        state.pushInt(clearBitRange(num, startBit, endBit));
    },

    [ScriptOpcode.GETBIT_RANGE]: state => {
        const [num, startBit, endBit] = state.popInts(3);
        const a = 31 - endBit;
        state.pushInt((num << a) >>> (startBit + a));
    },

    [ScriptOpcode.SETBIT_RANGE_TOINT]: state => {
        const [num, value, startBit, endBit] = state.popInts(4);
        const clearedBitRange = clearBitRange(num, startBit, endBit);
        const maxValue = MASK[endBit - startBit + 1];
        let assignValue = value;
        if (value > maxValue) {
            assignValue = maxValue;
        }
        state.pushInt(clearedBitRange | (assignValue << startBit));
    },

    [ScriptOpcode.SIN_DEG]: state => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.COS_DEG]: state => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.ATAN2_DEG]: state => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.ABS]: state => {
        state.pushInt(Math.abs(state.popInt()));
    }
};

export default NumberOps;
