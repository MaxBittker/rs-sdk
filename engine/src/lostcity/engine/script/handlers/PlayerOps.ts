import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';
import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import { ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import World from '#lostcity/engine/World.js';
import ScriptPointer, { checkedHandler } from '#lostcity/engine/script/ScriptPointer.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

const ActivePlayer = [ScriptPointer.ActivePlayer, ScriptPointer.ActivePlayer2];
const ProtectedActivePlayer = [ScriptPointer.ProtectedActivePlayer, ScriptPointer.ProtectedActivePlayer2];

const PlayerOps: CommandHandlers = {
    [ScriptOpcode.FINDUID]: (state) => {
        const player = World.getPlayer(state.popInt());
        if (player !== null) {
            state.activePlayer = player;
            state.pointerAdd(ActivePlayer[state.intOperand]);
            state.pushInt(1);
        } else {
            state.pointerRemove(ActivePlayer[state.intOperand]);
            state.pushInt(0);
        }
    },

    [ScriptOpcode.P_FINDUID]: (state) => {
        const player = World.getPlayer(state.popInt());
        if (player !== null && !player.containsModalInterface() && !player.delayed()) {
            state.activePlayer = player;
            state.pointerAdd(ProtectedActivePlayer[state.intOperand]);
            state.pushInt(1);
        } else {
            state.pointerRemove(ProtectedActivePlayer[state.intOperand]);
            state.pushInt(0);
        }
    },

    [ScriptOpcode.STRONGQUEUE]: checkedHandler(ActivePlayer, (state) => {
        const args = popScriptArgs(state);
        const delay = state.popInt();
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        state.activePlayer.enqueueScript(script, 'strong', delay, args);
    }),

    [ScriptOpcode.WEAKQUEUE]: checkedHandler(ActivePlayer, (state) => {
        const args = popScriptArgs(state);
        const delay = state.popInt();
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        state.activePlayer.enqueueScript(script, 'weak', delay, args);
    }),

    [ScriptOpcode.QUEUE]: checkedHandler(ActivePlayer, (state) => {
        const args = popScriptArgs(state);
        const delay = state.popInt();
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        state.activePlayer.enqueueScript(script, 'normal', delay, args);
    }),

    [ScriptOpcode.ANIM]: checkedHandler(ActivePlayer, (state) => {
        const delay = state.popInt();
        const seq = state.popInt();

        state.activePlayer.playAnimation(seq, delay);
    }),

    [ScriptOpcode.BUFFER_FULL]: checkedHandler(ActivePlayer, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.BUILDAPPEARANCE]: checkedHandler(ActivePlayer, (state) => {
        const inv = state.popInt();
        state.activePlayer.generateAppearance(inv);
    }),

    [ScriptOpcode.CAM_LOOKAT]: checkedHandler(ActivePlayer, (state) => {
        const [coord, speed, height, accel] = state.popInts(4);

        const level = (coord >> 28) & 0x3fff;
        const x = (coord >> 14) & 0x3fff;
        const z = coord & 0x3fff;

        // TODO: get local coords based on build area (p_telejump doesn't block so it doesn't happen until after this...)
        // so this relies on p_telejump first
        const localX = x - (state.activePlayer.x - 52);
        const localZ = z - (state.activePlayer.z - 52);

        state.activePlayer.camMoveTo(localX, localZ, speed, height, accel);
    }),

    [ScriptOpcode.CAM_MOVETO]: checkedHandler(ActivePlayer, (state) => {
        const [coord, speed, height, accel] = state.popInts(4);

        const level = (coord >> 28) & 0x3fff;
        const x = (coord >> 14) & 0x3fff;
        const z = coord & 0x3fff;

        // TODO: get local coords based on build area (p_telejump doesn't block so it doesn't happen until after this...)
        // so this relies on p_telejump first
        const localX = x - (state.activePlayer.x - 52);
        const localZ = z - (state.activePlayer.z - 52);

        state.activePlayer.camMoveTo(localX, localZ, speed, height, accel);
    }),

    [ScriptOpcode.CAM_RESET]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.camReset();
    }),

    [ScriptOpcode.COORD]: checkedHandler(ActivePlayer, (state) => {
        const packed = state.activePlayer.z | (state.activePlayer.x << 14) | (state.activePlayer.level << 28);
        state.pushInt(packed);
    }),

    [ScriptOpcode.DISPLAYNAME]: checkedHandler(ActivePlayer, (state) => {
        state.pushString(state.activePlayer.displayName);
    }),

    [ScriptOpcode.FACESQUARE]: checkedHandler(ActivePlayer, (state) => {
        const coord = state.popInt();
        const x = (coord >> 14) & 0x3fff;
        const z = coord & 0x3fff;
        state.activePlayer.faceSquare(x, z);
    }),

    [ScriptOpcode.IF_CLOSE]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.closeModal();
    }),

    [ScriptOpcode.IF_OPENSUBMODAL]: checkedHandler(ActivePlayer, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.IF_OPENSUBOVERLAY]: checkedHandler(ActivePlayer, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.LAST_COM]: (state) => {
        state.pushInt(state.activePlayer.lastCom ?? -1);
    },

    [ScriptOpcode.LAST_INT]: (state) => {
        state.pushInt(state.activePlayer.lastInt ?? -1);
    },

    [ScriptOpcode.LAST_ITEM]: (state) => {
        state.pushInt(state.activePlayer.lastItem ?? -1);
    },

    [ScriptOpcode.LAST_SLOT]: (state) => {
        state.pushInt(state.activePlayer.lastSlot ?? -1);
    },

    [ScriptOpcode.LAST_USEITEM]: (state) => {
        state.pushInt(state.activePlayer.lastUseItem ?? -1);
    },

    [ScriptOpcode.LAST_USESLOT]: (state) => {
        state.pushInt(state.activePlayer.lastUseSlot ?? -1);
    },

    [ScriptOpcode.LAST_VERIFYOBJ]: checkedHandler(ActivePlayer, (state) => {
        state.pushInt(state.activePlayer.lastVerifyObj ?? -1);
    }),

    [ScriptOpcode.MES]: checkedHandler(ActivePlayer, (state) => {
        const message = state.popString();

        if (process.env.CLIRUNNER) {
            console.log(message);
        }

        state.activePlayer.messageGame(message);
    }),

    [ScriptOpcode.NAME]: checkedHandler(ActivePlayer, (state) => {
        state.pushString(state.activePlayer.username);
    }),

    [ScriptOpcode.P_APRANGE]: checkedHandler(ProtectedActivePlayer, (state) => {
        if (!state.activePlayer.interaction) {
            return;
        }

        const apRange = state.popInt();

        state.activePlayer.interaction.apRange = apRange;
        state.activePlayer.interaction.apRangeCalled = true;

        if (apRange === -1) {
            state.activePlayer.setInteraction(state.activePlayer.interaction.mode, state.activePlayer.interaction.target);
            state.activePlayer.interaction.ap = false;
        }
    }),

    [ScriptOpcode.P_ARRIVEDELAY]: checkedHandler(ProtectedActivePlayer, (state) => {
        if (state.activePlayer.lastMovement < World.currentTick) {
            return;
        }

        state.activePlayer.delay = state.popInt() + 1;
        state.execution = ScriptState.SUSPENDED;
    }),

    [ScriptOpcode.P_COUNTDIALOG]: checkedHandler(ProtectedActivePlayer, (state) => {
        state.execution = ScriptState.COUNTDIALOG;
        // TODO last_int pointer
    }),

    [ScriptOpcode.P_DELAY]: checkedHandler(ProtectedActivePlayer, (state) => {
        state.activePlayer.delay = state.popInt() + 1;
        state.execution = ScriptState.SUSPENDED;
        // TODO should this wipe any pointers?
    }),

    [ScriptOpcode.P_OPHELD]: checkedHandler(ProtectedActivePlayer, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.P_OPLOC]: checkedHandler(ProtectedActivePlayer, (state) => {
        const type = state.popInt() - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid oploc: ${type + 1}`);
        }

        state.activePlayer.setInteraction(ServerTriggerType.APLOC1 + type, state.activeLoc);
    }),

    [ScriptOpcode.P_OPNPC]: checkedHandler(ProtectedActivePlayer, (state) => {
        const type = state.popInt() - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opnpc: ${type + 1}`);
        }

        state.activePlayer.setInteraction(ServerTriggerType.APNPC1 + type, state.activeLoc);
    }),

    [ScriptOpcode.P_PAUSEBUTTON]: checkedHandler(ProtectedActivePlayer, (state) => {
        state.execution = ScriptState.PAUSEBUTTON;
        // TODO last_com
    }),

    [ScriptOpcode.P_STOPACTION]: checkedHandler(ProtectedActivePlayer, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.P_TELEJUMP]: checkedHandler(ProtectedActivePlayer, (state) => {
        const coord = state.popInt();

        const level = (coord >> 28) & 0x3fff;
        const x = (coord >> 14) & 0x3fff;
        const z = coord & 0x3fff;

        state.activePlayer.teleport(x, z, level);
    }),

    [ScriptOpcode.P_WALK]: checkedHandler(ProtectedActivePlayer, (state) => {
        const coord = state.popInt();

        const x = (coord >> 14) & 0x3fff;
        const z = coord & 0x3fff;

        state.activePlayer.queueWalkWaypoint(x, z, true);
        state.activePlayer.processMovement();
    }),

    [ScriptOpcode.SAY]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.say(state.popString());
    }),

    [ScriptOpcode.SOUND_SYNTH]: checkedHandler(ActivePlayer, (state) => {
        const [synth, loops, delay] = state.popInts(3);

        state.activePlayer.synthSound(synth, loops, delay);
    }),

    [ScriptOpcode.STAFFMODLEVEL]: checkedHandler(ActivePlayer, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.STAT]: checkedHandler(ActivePlayer, (state) => {
        const stat = state.popInt();

        state.pushInt(state.activePlayer.levels[stat]);
    }),

    [ScriptOpcode.STAT_BASE]: checkedHandler(ActivePlayer, (state) => {
        const stat = state.popInt();

        state.pushInt(state.activePlayer.baseLevel[stat]);
    }),

    [ScriptOpcode.STAT_ADD]: checkedHandler(ProtectedActivePlayer, (state) => {
        const [stat, constant, percent] = state.popInts(3);

        const player = state.activePlayer;
        const current = player.levels[stat];
        const added = current + (constant + (current * percent) / 100);
        player.levels[stat] = Math.min(added, 255);
        player.updateStat(stat, player.stats[stat], player.levels[stat]);
    }),

    [ScriptOpcode.STAT_SUB]: checkedHandler(ProtectedActivePlayer, (state) => {
        const [stat, constant, percent] = state.popInts(3);

        const player = state.activePlayer;
        const current = player.levels[stat];
        const subbed = current - (constant + (current * percent) / 100);
        player.levels[stat] = Math.max(subbed, 1);
        player.updateStat(stat, player.stats[stat], player.levels[stat]);
    }),

    [ScriptOpcode.SPOTANIM_Pl]: checkedHandler(ActivePlayer, (state) => {
        const delay = state.popInt();
        const height = state.popInt();
        const spotanim = state.popInt();

        state.activePlayer.spotanim(spotanim, height, delay);
    }),

    [ScriptOpcode.STAT_HEAL]: checkedHandler(ProtectedActivePlayer, (state) => {
        const [stat, constant, percent] = state.popInts(3);

        const player = state.activePlayer;
        const base = player.baseLevel[stat];
        const current = player.levels[stat];
        const healed = current + (constant + (current * percent) / 100);
        player.levels[stat] = Math.min(healed, base);
        player.updateStat(stat, player.stats[stat], player.levels[stat]);
    }),

    [ScriptOpcode.UID]: checkedHandler(ActivePlayer, (state) => {
        // maybe more unique than this?
        state.pushInt(state.activePlayer.pid);
    }),

    [ScriptOpcode.P_LOGOUT]: checkedHandler(ProtectedActivePlayer, (state) => {
        state.activePlayer.logout();
    }),

    [ScriptOpcode.IF_SETCOLOUR]: checkedHandler(ActivePlayer, (state) => {
        const colour = state.popInt();
        const com = state.popInt();

        state.activePlayer.ifSetColour(com, colour);
    }),

    [ScriptOpcode.IF_OPENBOTTOM]: checkedHandler(ActivePlayer, (state) => {
        const com = state.popInt();

        state.activePlayer.openBottom(com);
    }),

    [ScriptOpcode.IF_OPENSUB]: checkedHandler(ActivePlayer, (state) => {
        const com2 = state.popInt();
        const com1 = state.popInt();

        state.activePlayer.openSub(com1, com2);
    }),

    [ScriptOpcode.IF_SETHIDE]: checkedHandler(ActivePlayer, (state) => {
        const hidden = state.popInt();
        const com = state.popInt();

        state.activePlayer.ifSetHide(com, hidden === 1);
    }),

    [ScriptOpcode.IF_SETOBJECT]: checkedHandler(ActivePlayer, (state) => {
        const [com, objId, scale] = state.popInts(3);

        state.activePlayer.ifSetObject(com, objId, scale);
    }),

    [ScriptOpcode.IF_SETTABACTIVE]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.ifSetTabFlash(state.popInt());
    }),

    [ScriptOpcode.IF_SETMODEL]: checkedHandler(ActivePlayer, (state) => {
        const modelId = state.popInt();
        const com = state.popInt();

        state.activePlayer.ifSetModel(com, modelId);
    }),

    [ScriptOpcode.IF_SETMODELCOLOUR]: checkedHandler(ActivePlayer, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.IF_SETTABFLASH]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.ifSetTabFlash(state.popInt());
    }),

    [ScriptOpcode.IF_SETANIM]: checkedHandler(ActivePlayer, (state) => {
        const seqId = state.popInt();
        const com = state.popInt();

        state.activePlayer.ifSetAnim(com, seqId);
    }),

    [ScriptOpcode.IF_SETTAB]: checkedHandler(ActivePlayer, (state) => {
        const tab = state.popInt();
        const com = state.popInt();

        state.activePlayer.ifSetTab(com, tab);
    }),

    [ScriptOpcode.IF_OPENTOP]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.openTop(state.popInt());
    }),

    [ScriptOpcode.IF_OPENSTICKY]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.openSticky(state.popInt());
    }),

    [ScriptOpcode.IF_OPENSIDEBAR]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.openSidebar(state.popInt());
    }),

    [ScriptOpcode.IF_SETPLAYERHEAD]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.ifSetPlayerHead(state.popInt());
    }),

    [ScriptOpcode.IF_SETTEXT]: checkedHandler(ActivePlayer, (state) => {
        const text = state.popString();
        const com = state.popInt();

        state.activePlayer.ifSetText(com, text);
    }),

    [ScriptOpcode.IF_SETNPCHEAD]: checkedHandler(ActivePlayer, (state) => {
        const npcId = state.popInt();
        const com = state.popInt();

        state.activePlayer.ifSetNpcHead(com, npcId);
    }),

    [ScriptOpcode.IF_SETPOSITION]: checkedHandler(ActivePlayer, (state) => {
        const y = state.popInt();
        const x = state.popInt();
        const com = state.popInt();

        state.activePlayer.ifSetPosition(com, x, y);
    }),

    [ScriptOpcode.IF_MULTIZONE]: checkedHandler(ActivePlayer, (state) => {
        state.activePlayer.ifMultiZone(state.popInt() === 1);
    }),

    [ScriptOpcode.GIVEXP]: checkedHandler(ProtectedActivePlayer, (state) => {
        const self = state.activePlayer;

        const xp = state.popInt();
        const stat = state.popInt();

        self.giveXp(stat, xp);
    }),

    [ScriptOpcode.DAMAGE]: (state) => {
        const amount = state.popInt();
        const type = state.popInt();
        const uid = state.popInt();

        World.getPlayer(uid)!.applyDamage(amount, type); // TODO (jkm) consider whether we want to use ! here
    },

    [ScriptOpcode.IF_SETRESUMEBUTTONS]: checkedHandler(ActivePlayer, (state) => {
        const [button1, button2, button3, button4, button5] = state.popInts(5);

        state.activePlayer.resumeButtons = [button1, button2, button3, button4, button5];
    }),

    [ScriptOpcode.TEXT_GENDER]: checkedHandler(ActivePlayer, (state) => {
        const [male, female] = state.popStrings(2);
        if (state.activePlayer.gender == 0) {
            state.pushString(male);
        } else {
            state.pushString(female);
        }
    }),

    [ScriptOpcode.MIDI_SONG]: (state) => {
        state.self.playSong(state.popString());
    },

    [ScriptOpcode.MIDI_JINGLE]: (state) => {
        // length of time of the midi in millis.
        const length = state.popInt();
        const name = state.popString();
        state.self.playJingle(name, length);
    },

    [ScriptOpcode.LAST_INV]: (state) => {
        state.pushInt(state.self.lastInv);
    },

    [ScriptOpcode.BUILDAPPEARANCE]: (state) => {
        state.self.generateAppearance(state.popInt());
    },

    [ScriptOpcode.SOFTTIMER]: checkedHandler(ActivePlayer, (state) => {
        const args = popScriptArgs(state);
        const interval = state.popInt();
        const timerId = state.popInt();

        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }
        state.activePlayer.setTimer('soft', script, args, interval);
    }),

    [ScriptOpcode.CLEARSOFTTIMER]: checkedHandler(ActivePlayer, (state) => {
        const timerId = state.popInt();

        state.activePlayer.clearTimer(timerId);
    }),

    [ScriptOpcode.SETTIMER]: checkedHandler(ActivePlayer, (state) => {
        const args = popScriptArgs(state);
        const interval = state.popInt();
        const timerId = state.popInt();

        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }
        state.activePlayer.setTimer('normal', script, args, interval);
    }),

    [ScriptOpcode.CLEARTIMER]: checkedHandler(ActivePlayer, (state) => {
        const timerId = state.popInt();

        state.activePlayer.clearTimer(timerId);
    }),

    [ScriptOpcode.HINT_COORD]: (state) => {
        const [offset, coord, height] = state.popInts(3);

        const x = (coord >> 14) & 0x3fff;
        const z = coord & 0x3fff;
        state.activePlayer.hintTile(offset, x, z, height);
    },

    [ScriptOpcode.HINT_STOP]: (state) => {
        state.activePlayer.stopHint();
    },

    [ScriptOpcode.IF_CLOSESTICKY]: (state) => {
        state.activePlayer.closeSticky();
    },

    [ScriptOpcode.P_EXACTMOVE]: checkedHandler(ProtectedActivePlayer, (state) => {
        const [start, end, startCycle, endCycle, direction] = state.popInts(5);

        const startX = (start >> 14) & 0x3fff;
        const startZ = start & 0x3fff;

        const endX = (end >> 14) & 0x3fff;
        const endZ = end & 0x3fff;

        /* direction:
            - 0 = 1024 (east)
            - 1 = 1536 (south)
            - 2 = 0 (west)
            - 3 = 512 (north)
        */

        state.activePlayer.exactMove(startX, startZ, endX, endZ, startCycle, endCycle, direction);
    }),

    [ScriptOpcode.BUSY]: (state) => {
        state.pushInt(state.activePlayer.busy() ? 1 : 0);
    },

    [ScriptOpcode.GETQUEUE]: (state) => {
        const scriptId = state.popInt();

        state.pushInt(state.activePlayer.queue.filter(req => req.script.id === scriptId).length);
    },

    [ScriptOpcode.GETWEAKQUEUE]: (state) => {
        const scriptId = state.popInt();

        state.pushInt(state.activePlayer.weakQueue.filter(req => req.script.id === scriptId).length);
    },

    // TODO: check active loc too
    [ScriptOpcode.P_LOCMERGE]: checkedHandler(ProtectedActivePlayer, (state) => {
        const [startCycle, endCycle, southEast, northWest] = state.popInts(4);

        const east = (southEast >> 14) & 0x3fff;
        const south = southEast & 0x3fff;

        const west = (northWest >> 14) & 0x3fff;
        const north = northWest & 0x3fff;

        const loc = state.activeLoc;
        World.getZone(loc.x, loc.z, loc.level).mergeLoc(loc, state.activePlayer, startCycle, endCycle, south, east, north, west);
    }),
};

/**
 * Pops a dynamic number of arguments intended for other scripts. Top of the stack
 * contains a string with the argument types to pop.
 *
 * @param state The script state.
 */
function popScriptArgs(state: ScriptState): ScriptArgument[] {
    const types = state.popString();
    const count = types.length;

    const args: ScriptArgument[] = [];
    for (let i = count - 1; i >= 0; i--) {
        const type = types.charAt(i);

        if (type === 's') {
            args[i] = state.popString();
        } else {
            args[i] = state.popInt();
        }
    }
    return args;
}

export default PlayerOps;
