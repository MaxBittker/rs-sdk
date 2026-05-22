import Entity from '#/engine/entity/Entity.js';
import Loc from '#/engine/entity/Loc.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import Player from '#/engine/entity/Player.js';
import { ScriptArgument } from '#/engine/entity/PlayerQueueRequest.js';
import CoreOps from '#/engine/script/handlers/CoreOps.js';
import DbOps from '#/engine/script/handlers/DbOps.js';
import DebugOps from '#/engine/script/handlers/DebugOps.js';
import EnumOps from '#/engine/script/handlers/EnumOps.js';
import InvOps from '#/engine/script/handlers/InvOps.js';
import LocConfigOps from '#/engine/script/handlers/LocConfigOps.js';
import LocOps from '#/engine/script/handlers/LocOps.js';
import NpcConfigOps from '#/engine/script/handlers/NpcConfigOps.js';
import NpcOps from '#/engine/script/handlers/NpcOps.js';
import NumberOps from '#/engine/script/handlers/NumberOps.js';
import ObjConfigOps from '#/engine/script/handlers/ObjConfigOps.js';
import ObjOps from '#/engine/script/handlers/ObjOps.js';
import PlayerOps from '#/engine/script/handlers/PlayerOps.js';
import ServerOps from '#/engine/script/handlers/ServerOps.js';
import StringOps from '#/engine/script/handlers/StringOps.js';
import StructOps from '#/engine/script/handlers/StructOps.js';
import ScriptFile from '#/engine/script/ScriptFile.js';
import { ScriptOpcode, ScriptOpcodeNameMap } from '#/engine/script/ScriptOpcode.js';
import ScriptPointer from '#/engine/script/ScriptPointer.js';
import ScriptState from '#/engine/script/ScriptState.js';
import World from '#/engine/World.js';
import Environment from '#/util/Environment.js';
import { printError, printWarning } from '#/util/Logger.js';

export type CommandHandler = (state: ScriptState) => void;
export type CommandHandlers = {
    [opcode: number]: CommandHandler;
};

// script executor
export default class ScriptRunner {
    static readonly HANDLERS: CommandHandlers = {
        // Language required opcodes
        ...CoreOps,
        ...ServerOps,
        ...PlayerOps,
        ...NpcOps,
        ...LocOps,
        ...ObjOps,
        ...NpcConfigOps,
        ...LocConfigOps,
        ...ObjConfigOps,
        ...InvOps,
        ...EnumOps,
        ...StringOps,
        ...NumberOps,
        ...StructOps,
        ...DbOps,
        ...DebugOps
    };

    /**
     *
     * @param script
     * @param self
     * @param target
     * @param on
     * @param args
     */
    static init(script: ScriptFile, self: Entity | null = null, target: Entity | null = null, args: ScriptArgument[] | null = []) {
        const state = new ScriptState(script, args);
        state.self = self;

        if (self instanceof Player) {
            state._activePlayer = self;
            state.pointerAdd(ScriptPointer.ActivePlayer);
        } else if (self instanceof Npc) {
            state._activeNpc = self;
            state.pointerAdd(ScriptPointer.ActiveNpc);
        } else if (self instanceof Loc) {
            state._activeLoc = self;
            state.pointerAdd(ScriptPointer.ActiveLoc);
        } else if (self instanceof Obj) {
            state._activeObj = self;
            state.pointerAdd(ScriptPointer.ActiveObj);
        }

        if (target instanceof Player) {
            if (self instanceof Player) {
                state._activePlayer2 = target;
                state.pointerAdd(ScriptPointer.ActivePlayer2);
            } else {
                state._activePlayer = target;
                state.pointerAdd(ScriptPointer.ActivePlayer);
            }
        } else if (target instanceof Npc) {
            if (self instanceof Npc) {
                state._activeNpc2 = target;
                state.pointerAdd(ScriptPointer.ActiveNpc2);
            } else {
                state._activeNpc = target;
                state.pointerAdd(ScriptPointer.ActiveNpc);
            }
        } else if (target instanceof Loc) {
            if (self instanceof Loc) {
                state._activeLoc2 = target;
                state.pointerAdd(ScriptPointer.ActiveLoc2);
            } else {
                state._activeLoc = target;
                state.pointerAdd(ScriptPointer.ActiveLoc);
            }
        } else if (target instanceof Obj) {
            if (self instanceof Obj) {
                state._activeObj2 = target;
                state.pointerAdd(ScriptPointer.ActiveObj2);
            } else {
                state._activeObj = target;
                state.pointerAdd(ScriptPointer.ActiveObj);
            }
        }

        return state;
    }

    static execute(state: ScriptState) {
        if (!state || !state.script || !state.script.info) {
            return ScriptState.ABORTED;
        }

        try {
            if (state.execution !== ScriptState.RUNNING) {
                state.executionHistory.push(state.execution);
            }
            state.execution = ScriptState.RUNNING;

            let start = 0;
            if (Environment.node.debugProfile) {
                start = performance.now() * 1000;
            }

            while (state.execution === ScriptState.RUNNING) {
                const opcodes = state.script.opcodes;

                if (state.pc >= opcodes.length || state.pc < -1) {
                    throw new Error('Invalid program counter: ' + state.pc + ', max expected: ' + opcodes.length);
                }

                if (state.opcount > 500_000) {
                    throw new Error('Too many instructions');
                }

                state.opcount++;

                const opcode = opcodes[++state.pc];
                const handler = ScriptRunner.HANDLERS[opcode];
                if (!handler) {
                    throw new Error(`Unhandled command ${ScriptOpcodeNameMap.get(opcode) ?? opcode}`);
                }

                handler(state);
            }

            if (Environment.node.debugProfile) {
                const time: number = (performance.now() * 1000 - start) | 0;
                if (time > 1000) {
                    const message: string = `Warning [cpu time]: Script: ${state.script.name}, time: ${time}us, opcount: ${state.opcount}`;
                    if (state.self instanceof Player) {
                        state.self.wrappedMessageGame(message);
                    } else {
                        printWarning(message);
                    }
                }
            }
        } catch (err: any) {
            // print the last opcode executed
            if (state.pc >= 0 && state.pc < state.script.opcodes.length) {
                const opcode = state.script.opcodes[state.pc];

                let secondary = state.intOperand;
                if (opcode === ScriptOpcode.POP_VARP || opcode === ScriptOpcode.POP_VARN || opcode === ScriptOpcode.PUSH_VARP || opcode === ScriptOpcode.PUSH_VARN) {
                    secondary = (state.intOperand >> 16) & 0x1;
                } else if (opcode <= ScriptOpcode.POP_ARRAY_INT) {
                    secondary = 0;
                }

                err.message = ScriptOpcodeNameMap.get(opcode)?.toLowerCase() + ' ' + err.message;
                if (secondary) {
                    err.message = '.' + err.message;
                }
            }

            if (state.self instanceof Player) {
                printError(`Player script error - username:${state.self.username}`);

                state.self.wrappedMessageGame(`script error: ${err.message}`);
                state.self.wrappedMessageGame(`file: ${state.script.fileName}`);

                state.self.wrappedMessageGame('stack backtrace:');
                state.self.wrappedMessageGame(`    1: ${state.script.name} - ${state.script.fileName}:${state.script.lineNumber(state.pc)}`);

                let trace = 1;
                for (let i = state.debugFp - 1; i >= 0; i--) {
                    const frame = state.debugFrames[i];
                    state.self.wrappedMessageGame(`    ${++trace}: ${frame.script.name} - ${frame.script.fileName}:${frame.script.lineNumber(frame.pc)}`);
                }

                if (Environment.node.production) {
                    console.warn(`[LOGOUT DEBUG] ScriptRunner: Script error caused logout for ${state.self.username} - script: ${state.script.name}`);
                    state.self.logout();
                    state.self.loggingOut = true;
                }
            } else if (state.self instanceof Npc) {
                printError(`NPC script error - nid:${state.self.nid} type:${state.self.type}`);

                if (Environment.node.production) {
                    World.removeNpc(state.self, 0);
                }
            }

            console.error(`script error: ${err.message}`);
            console.error(`file: ${state.script.fileName}`);
            console.error('');

            console.error('stack backtrace:');
            console.error(`    1: ${state.script.name} - ${state.script.fileName}:${state.script.lineNumber(state.pc)}`);

            let trace = 1;
            for (let i = state.debugFp - 1; i >= 0; i--) {
                const frame = state.debugFrames[i];
                console.error(`    ${++trace}: ${frame.script.name} - ${frame.script.fileName}:${frame.script.lineNumber(frame.pc)}`);
            }

            state.execution = ScriptState.ABORTED;
        }

        return state.execution;
    }
}
