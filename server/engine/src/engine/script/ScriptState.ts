import DbTableType from '#/cache/config/DbTableType.js';
import Entity from '#/engine/entity/Entity.js';
import Loc from '#/engine/entity/Loc.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import Player from '#/engine/entity/Player.js';
import { ScriptArgument } from '#/engine/entity/PlayerQueueRequest.js';
import ScriptFile from '#/engine/script/ScriptFile.js';
import ScriptPointer from '#/engine/script/ScriptPointer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import { toInt32 } from '#/util/Numbers.js';

export interface GosubStackFrame {
    script: ScriptFile;
    pc: number;
    intLocals: number[];
    stringLocals: string[];
}

export interface DebugStackFrame {
    script: ScriptFile;
    pc: number;
}

export default class ScriptState {
    static readonly ABORTED = -1;
    static readonly RUNNING = 0;
    static readonly FINISHED = 1;
    static readonly SUSPENDED = 2; // suspended to move to player
    static readonly PAUSEBUTTON = 3;
    static readonly COUNTDIALOG = 4;
    static readonly NPC_SUSPENDED = 5; // suspended to move to npc
    static readonly WORLD_SUSPENDED = 6; // suspended to move to world

    // interpreter
    script: ScriptFile;
    trigger: ServerTriggerType;
    execution = ScriptState.RUNNING;
    executionHistory: number[] = [];

    pc = -1; // program counter
    opcount = 0; // number of opcodes executed

    frames: GosubStackFrame[] = [];
    fp = 0; // frame pointer

    debugFrames: DebugStackFrame[] = [];
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

    /**
     * Used for debug commands
     */
    timespent: number = 0;

    playerIterator: IterableIterator<Player> | null = null;
    npcIterator: IterableIterator<Npc> | null = null;
    locIterator: IterableIterator<Loc> | null = null;
    objIterator: IterableIterator<Obj> | null = null;

    lastInt: number = 0;

    constructor(script: ScriptFile, args: ScriptArgument[] | null = []) {
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
     * Gets the active player. Automatically checks the operand to determine primary and secondary.
     */
    get activePlayer() {
        const player = this.intOperand === 0 ? this._activePlayer : this._activePlayer2;
        if (player === null) {
            throw new Error('Attempt to access null active_player');
        }
        return player;
    }

    // gets the secondary player from the perspective of the command (.command returns player1)
    get activePlayer2() {
        const player = this.intOperand === 0 ? this._activePlayer2 : this._activePlayer;
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

    pushString(value: string): void {
        this.stringStack[this.ssp++] = value;
    }

    popFrame(): void {
        this.debugFp--;

        const frame = this.frames[--this.fp];
        this.pc = frame.pc;
        this.script = frame.script;
        this.intLocals = frame.intLocals;
        this.stringLocals = frame.stringLocals;
    }

    gosubFrame(proc: ScriptFile): void {
        this.debugFrames[this.debugFp++] = {
            script: this.script,
            pc: this.pc
        };

        this.frames[this.fp++] = {
            script: this.script,
            pc: this.pc,
            intLocals: this.intLocals,
            stringLocals: this.stringLocals
        };
        this.setupNewScript(proc);
    }

    gotoFrame(label: ScriptFile): void {
        this.debugFrames[this.debugFp++] = {
            script: this.script,
            pc: this.pc
        };
        this.fp = 0;
        this.frames.length = 0;
        this.setupNewScript(label);
    }

    setupNewScript(script: ScriptFile): void {
        const intLocals: number[] = new Array(script.intLocalCount).fill(0);
        const intArgCount: number = script.intArgCount;
        for (let index: number = 0; index < intArgCount; index++) {
            intLocals[intArgCount - index - 1] = this.popInt();
        }

        const stringLocals: string[] = new Array(script.stringLocalCount);
        const stringArgCount: number = script.stringArgCount;
        for (let index: number = 0; index < stringArgCount; index++) {
            stringLocals[stringArgCount - index - 1] = this.popString();
        }

        this.pc = -1;
        this.script = script;
        this.intLocals = intLocals;
        this.stringLocals = stringLocals;
    }
}
