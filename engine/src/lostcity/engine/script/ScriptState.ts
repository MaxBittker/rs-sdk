import DbTableType from '#lostcity/cache/DbTableType.js';

import Script from '#lostcity/engine/script/Script.js';
import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

import Entity from '#lostcity/entity/Entity.js';
import { ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Loc from '#lostcity/entity/Loc.js';
import Obj from '#lostcity/entity/Obj.js';
import Npc from '#lostcity/entity/Npc.js';
import Player from '#lostcity/entity/Player.js';

import { toInt32 } from '#lostcity/util/Numbers.js';

export interface GosubStackFrame {
    script: Script;
    pc: number;
    intLocals: number[];
    stringLocals: string[];
}

// for debugging stack traces
export interface JumpStackFrame {
    script: Script;
    pc: number;
}

export default class ScriptState {
    static ABORTED = -1;
    static RUNNING = 0;
    static FINISHED = 1;
    static SUSPENDED = 2; // suspended to move to player
    static PAUSEBUTTON = 3;
    static COUNTDIALOG = 4;
    static NPC_SUSPENDED = 5; // suspended to move to npc
    static WORLD_SUSPENDED = 6; // suspended to move to world

    // interpreter
    script: Script;
    trigger: ServerTriggerType;
    execution = ScriptState.RUNNING;
    executionHistory: number[] = [];

    pc = -1; // program counter
    opcount = 0; // number of opcodes executed

    frames: GosubStackFrame[] = [];
    fp = 0; // frame pointer

    debugFrames: JumpStackFrame[] = [];
    debugFp = 0;

    intStack: (number | null)[] = [];
    isp = 0; // int stack pointer

    stringStack: (string | null)[] = [];
    ssp = 0; // string stack pointer

    intLocals: number[] = [];
    stringLocals: string[] = [];

    /**
     * Contains flags representing `ScriptPointer`s.
     */
    private pointers: number = 0;

    // server
    /**
     * The primary entity.
     */
    self: Entity | null = null;

    // active entities
    /**
     * The primary active player.
     */
    _activePlayer: Player | null = null;

    /**
     * The secondary active player.
     * @type {Player|null}
     */
    _activePlayer2: Player | null = null;

    /**
     * The primary active npc.
     */
    _activeNpc: Npc | null = null;

    /**
     * The secondary active npc.
     */
    _activeNpc2: Npc | null = null;

    /**
     * The primary active loc.
     */
    _activeLoc: Loc | null = null;

    /**
     * The secondary active loc.
     */
    _activeLoc2: Loc | null = null;

    _activeObj: Obj | null = null;
    _activeObj2: Obj | null = null;

    /**
     * Used for string splitting operations with split_init and related commands.
     */
    splitPages: string[][] = [];
    splitMesanim: number = -1;

    /**
     * Used for db operations with db_find and related commands
     */
    dbTable: DbTableType | null = null;
    dbColumn: number = -1;
    dbRow: number = -1;
    dbRowQuery: number[] = [];

    constructor(script: Script, args: ScriptArgument[] | null = []) {
        this.script = script;
        this.trigger = script.info.lookupKey & 0xff;

        if (args) {
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];

                if (typeof arg === 'number') {
                    this.intLocals.push(arg);
                } else {
                    this.stringLocals.push(arg);
                }
            }
        }
    }

    /**
     * Sets pointers to only the ones supplied.
     *
     * @param pointers The pointers to set.
     */
    pointerSet(...pointers: ScriptPointer[]) {
        this.pointers = 0;
        for (let i = 0; i < pointers.length; i++) {
            this.pointers |= 1 << pointers[i];
        }
    }

    /**
     * Adds `pointer` to the state.
     *
     * @param pointer The pointer to add.
     */
    pointerAdd(pointer: ScriptPointer) {
        this.pointers |= 1 << pointer;
    }

    /**
     * Removes `pointer` from the state.
     *
     * @param pointer The point to remove.
     */
    pointerRemove(pointer: ScriptPointer) {
        this.pointers &= ~(1 << pointer);
    }

    pointerGet(pointer: ScriptPointer): boolean {
        return (this.pointers & (1 << pointer)) != 0;
    }

    /**
     * Verifies all `pointers` are enabled.
     *
     * @param pointers The pointers to check for.
     */
    pointerCheck(...pointers: ScriptPointer[]) {
        for (let i = 0; i < pointers.length; i++) {
            const flag = 1 << pointers[i];
            if ((this.pointers & flag) != flag) {
                throw new Error(`Required pointer: ${ScriptState.pointerPrint(flag)}, current: ${ScriptState.pointerPrint(this.pointers)}`);
            }
        }
    }

    /**
     * Pretty prints all enables flags using the names from `ScriptPointer`.
     *
     * @param flags The flags to print.
     */
    private static pointerPrint(flags: number): string {
        let text = '';
        for (let i = 0; i < ScriptPointer._LAST; i++) {
            if ((flags & (1 << i)) != 0) {
                text += `${ScriptPointer[i]}, `;
            }
        }
        return text.substring(0, text.lastIndexOf(','));
    }

    /**
     * Gets the active player. Automatically checks the operand to determine primary and secondary.
     */
    get activePlayer() {
        const player = this.intOperand === 0 ? this._activePlayer : this._activePlayer2;
        if (player === null) {
            throw new Error('Attempt to access null active_player');
        }
        return player;
    }

    /**
     * Sets the active player. Automatically checks the operand to determine primary and secondary.
     * @param player The player to set.
     */
    set activePlayer(player: Player) {
        if (this.intOperand === 0) {
            this._activePlayer = player;
        } else {
            this._activePlayer2 = player;
        }
    }

    /**
     * Gets the active npc. Automatically checks the operand to determine primary and secondary.
     */
    get activeNpc() {
        const npc = this.intOperand === 0 ? this._activeNpc : this._activeNpc2;
        if (npc === null) {
            throw new Error('Attempt to access null active_npc');
        }
        return npc;
    }

    /**
     * Sets the active npc. Automatically checks the operand to determine primary and secondary.
     * @param npc The npc to set.
     */
    set activeNpc(npc: Npc) {
        if (this.intOperand === 0) {
            this._activeNpc = npc;
        } else {
            this._activeNpc2 = npc;
        }
    }

    /**
     * Gets the active location. Automatically checks the operand to determine primary and secondary.
     */
    get activeLoc() {
        const loc = this.intOperand === 0 ? this._activeLoc : this._activeLoc2;
        if (loc === null) {
            throw new Error('Attempt to access null active_loc');
        }
        return loc;
    }

    /**
     * Sets the active loc. Automatically checks the operand to determine primary and secondary.
     * @param loc The loc to set.
     */
    set activeLoc(loc: Loc) {
        if (this.intOperand === 0) {
            this._activeLoc = loc;
        } else {
            this._activeLoc2 = loc;
        }
    }

    get activeObj() {
        const obj = this.intOperand === 0 ? this._activeObj : this._activeObj2;
        if (obj === null) {
            throw new Error('Attempt to access null active_obj');
        }
        return obj;
    }

    /**
     * Sets the active obj. Automatically checks the operand to determine primary and secondary.
     * @param obj The obj to set.
     */
    set activeObj(obj: Obj) {
        if (this.intOperand === 0) {
            this._activeObj = obj;
        } else {
            this._activeObj2 = obj;
        }
    }

    get intOperand(): number {
        return this.script.intOperands[this.pc];
    }

    get stringOperand(): string {
        return this.script.stringOperands[this.pc];
    }

    popInt(): number {
        const value = this.intStack[--this.isp];
        if (!value) {
            return 0;
        }
        return toInt32(value);
    }

    popInts(amount: number): number[] {
        const ints = Array<number>(amount);
        for (let i = amount - 1; i >= 0; i--) {
            ints[i] = this.popInt();
        }
        return ints;
    }

    pushInt(value: number) {
        this.intStack[this.isp++] = toInt32(value);
    }

    popString(): string {
        return this.stringStack[--this.ssp] ?? '';
    }

    popStrings(amount: number): string[] {
        const strings = Array<string>(amount);
        for (let i = amount - 1; i >= 0; i--) {
            strings[i] = this.popString();
        }
        return strings;
    }

    pushString(value: string) {
        this.stringStack[this.ssp++] = value;
    }

    reset() {
        this.pc = -1;
        this.frames = [];
        this.fp = 0;
        this.intStack = [];
        this.isp = 0;
        this.stringStack = [];
        this.ssp = 0;
        this.intLocals = [];
        this.stringLocals = [];
        this.pointers = 0;
    }
}
