import Script from '#lostcity/engine/script/Script.js';

export enum NpcQueueType {
    NORMAL
}

export enum PlayerQueueType {
    NORMAL,
    ENGINE,
    WEAK, // sept 2004
    STRONG, // late-2004
    SOFT // OSRS
}

export type QueueType = NpcQueueType | PlayerQueueType;
export type ScriptArgument = number | string;

export class EntityQueueRequest {
    /**
     * The type of queue request.
     */
    type: QueueType;

    /**
     * The script to execute.
     */
    script: Script;

    /**
     * The arguments to execute the script with.
     */
    args: ScriptArgument[] | null;

    /**
     * The number of ticks remaining until the queue executes.
     */
    delay: number;

    constructor(type: QueueType, script: Script, args: ScriptArgument[] | null, delay: number) {
        this.type = type;
        this.script = script;
        this.args = args;
        this.delay = delay;
    }
}
