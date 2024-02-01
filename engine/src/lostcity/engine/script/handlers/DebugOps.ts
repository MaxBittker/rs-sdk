import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';

import Environment from '#lostcity/util/Environment.js';

const DebugOps: CommandHandlers = {
    [ScriptOpcode.ERROR]: state => {
        throw new Error(state.popString());
    },

    [ScriptOpcode.MAP_LOCALDEV]: state => {
        state.pushInt(Environment.LOCAL_DEV ? 1 : 0);
    }
};

export default DebugOps;
