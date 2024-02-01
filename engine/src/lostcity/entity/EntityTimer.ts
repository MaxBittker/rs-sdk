import { ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Script from '#lostcity/engine/script/Script.js';

export enum NpcTimerType {
    NPC
}

export enum PlayerTimerType {
    NORMAL,
    SOFT
}

export type TimerType = NpcTimerType | PlayerTimerType;

export interface EntityTimer {
    /**
     * The type of the timer.
     */
    type: TimerType;

    /**
     * The script to execute.
     */
    script: Script;

    /**
     * The arguments to execute the script with.
     */
    args: ScriptArgument[] | null;

    /**
     * The time interval between executions.
     */
    interval: number;

    /**
     * Tracks the time until execution.
     */
    clock: number;
}
