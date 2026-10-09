import ScriptState from '#/engine/script/ScriptState.js';
import Linkable from '#/datastruct/Linkable.js';

export class WorldQueue extends Linkable {
    script: ScriptState;
    executionTick: number;

    constructor(script: ScriptState, executionTick: number) {
        super();
        this.script = script;
        this.executionTick = executionTick;
    }
}
