import IdkType from '#lostcity/cache/config/IdkType.js';
import SpotanimType from '#lostcity/cache/config/SpotanimType.js';

import World from '#lostcity/engine/World.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import ScriptPointer, {ActivePlayer, checkedHandler, ProtectedActivePlayer} from '#lostcity/engine/script/ScriptPointer.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

import { PlayerQueueType, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import { PlayerTimerType } from '#lostcity/entity/EntityTimer.js';
import { isNetworkPlayer } from '#lostcity/entity/NetworkPlayer.js';
import { Position } from '#lostcity/entity/Position.js';
import CameraInfo from '#lostcity/entity/CameraInfo.js';
import Interaction from '#lostcity/entity/Interaction.js';
import PlayerStat from '#lostcity/entity/PlayerStat.js';
import Player from '#lostcity/entity/Player.js';

import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import CamShake from '#lostcity/network/outgoing/model/CamShake.js';
import CamReset from '#lostcity/network/outgoing/model/CamReset.js';
import PCountDialog from '#lostcity/network/outgoing/model/PCountDialog.js';
import SynthSound from '#lostcity/network/outgoing/model/SynthSound.js';
import IfSetColour from '#lostcity/network/outgoing/model/IfSetColour.js';
import IfSetHide from '#lostcity/network/outgoing/model/IfSetHide.js';
import IfSetObject from '#lostcity/network/outgoing/model/IfSetObject.js';
import IfShowSide from '#lostcity/network/outgoing/model/IfShowSide.js';
import IfSetModel from '#lostcity/network/outgoing/model/IfSetModel.js';
import IfSetRecol from '#lostcity/network/outgoing/model/IfSetRecol.js';
import TutorialFlashSide from '#lostcity/network/outgoing/model/TutorialFlashSide.js';
import IfSetAnim from '#lostcity/network/outgoing/model/IfSetAnim.js';
import IfSetPlayerHead from '#lostcity/network/outgoing/model/IfSetPlayerHead.js';
import IfSetText from '#lostcity/network/outgoing/model/IfSetText.js';
import IfSetNpcHead from '#lostcity/network/outgoing/model/IfSetNpcHead.js';
import IfSetPosition from '#lostcity/network/outgoing/model/IfSetPosition.js';
import SetMultiway from '#lostcity/network/outgoing/model/SetMultiway.js';

import Environment from '#lostcity/util/Environment.js';
import ColorConversion from '#lostcity/util/ColorConversion.js';

import * as rsmod from '@2004scape/rsmod-pathfinder';

import {
    check,
    CoordValid,
    HitTypeValid,
    IDKTypeValid,
    InvTypeValid,
    NpcTypeValid,
    NumberNotNull,
    ObjTypeValid,
    PlayerStatValid,
    SeqTypeValid,
    SpotAnimTypeValid,
    StringNotNull,
    GenderValid,
    SkinColourValid
} from '#lostcity/engine/script/ScriptValidators.js';

const PlayerOps: CommandHandlers = {
    [ScriptOpcode.FINDUID]: state => {
        const uid = state.popInt();
        const player = World.getPlayerByUid(uid);

        if (!player) {
            state.pushInt(0);
            return;
        }

        state.activePlayer = player;
        state.pointerAdd(ActivePlayer[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.P_FINDUID]: state => {
        const uid = state.popInt() >>> 0;
        const player = World.getPlayerByUid(uid);

        if (state.pointerGet(ProtectedActivePlayer[state.intOperand]) && state.activePlayer.uid === uid) {
            // script is already running on this player with protected access, no-op
            state.pushInt(1);
            return;
        }

        if (!player || !player.canAccess()) {
            state.pushInt(0);
            return;
        }

        state.activePlayer = player;
        state.pointerAdd(ActivePlayer[state.intOperand]);
        state.pointerAdd(ProtectedActivePlayer[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.STRONGQUEUE]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const delay = check(state.popInt(), NumberNotNull);
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        state.activePlayer.enqueueScript(script, PlayerQueueType.STRONG, delay, args);
    }),

    [ScriptOpcode.WEAKQUEUE]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const delay = check(state.popInt(), NumberNotNull);
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        state.activePlayer.enqueueScript(script, PlayerQueueType.WEAK, delay, args);
    }),

    [ScriptOpcode.QUEUE]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const delay = check(state.popInt(), NumberNotNull);
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        state.activePlayer.enqueueScript(script, PlayerQueueType.NORMAL, delay, args);
    }),

    [ScriptOpcode.QUEUE2]: checkedHandler(ScriptPointer.ActivePlayer2, state => {
        if (!state._activePlayer2) {
            return;
        }

        const args = popScriptArgs(state);
        const delay = check(state.popInt(), NumberNotNull);
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        state._activePlayer2.enqueueScript(script, PlayerQueueType.NORMAL, delay, args);
    }),

    [ScriptOpcode.ANIM]: checkedHandler(ActivePlayer, state => {
        const delay = check(state.popInt(), NumberNotNull);
        const seq = state.popInt();

        state.activePlayer.playAnimation(seq, delay);
    }),

    [ScriptOpcode.BUFFER_FULL]: checkedHandler(ActivePlayer, state => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.BUILDAPPEARANCE]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.generateAppearance(check(state.popInt(), InvTypeValid).id);
    }),

    [ScriptOpcode.CAM_LOOKAT]: checkedHandler(ActivePlayer, state => {
        const [coord, height, rotationSpeed, rotationMultiplier] = state.popInts(4);

        const pos: Position = check(coord, CoordValid);
        state.activePlayer.cameraPackets.addTail(new CameraInfo(ServerProt.CAM_LOOKAT, pos.x, pos.z, height, rotationSpeed, rotationMultiplier));
    }),

    [ScriptOpcode.CAM_MOVETO]: checkedHandler(ActivePlayer, state => {
        const [coord, height, rotationSpeed, rotationMultiplier] = state.popInts(4);

        const pos: Position = check(coord, CoordValid);
        state.activePlayer.cameraPackets.addTail(new CameraInfo(ServerProt.CAM_MOVETO, pos.x, pos.z, height, rotationSpeed, rotationMultiplier));
    }),

    [ScriptOpcode.CAM_SHAKE]: checkedHandler(ActivePlayer, state => {
        const [type, jitter, amplitude, frequency] = state.popInts(4);

        state.activePlayer.write(new CamShake(type, jitter, amplitude, frequency));
    }),

    [ScriptOpcode.CAM_RESET]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new CamReset());
    }),

    [ScriptOpcode.COORD]: checkedHandler(ActivePlayer, state => {
        const position: Position = state.activePlayer;
        state.pushInt(Position.packCoord(position.level, position.x, position.z));
    }),

    [ScriptOpcode.DISPLAYNAME]: checkedHandler(ActivePlayer, state => {
        state.pushString(state.activePlayer.displayName);
    }),

    [ScriptOpcode.FACESQUARE]: checkedHandler(ActivePlayer, state => {
        const pos: Position = check(state.popInt(), CoordValid);

        state.activePlayer.faceSquare(pos.x, pos.z);
    }),

    [ScriptOpcode.IF_CLOSE]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.closeModal();
    }),

    [ScriptOpcode.LAST_COM]: state => {
        state.pushInt(state.activePlayer.lastCom);
    },

    [ScriptOpcode.LAST_INT]: state => {
        state.pushInt(state.activePlayer.lastInt);
    },

    [ScriptOpcode.LAST_ITEM]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELD1,
            ServerTriggerType.OPHELD2,
            ServerTriggerType.OPHELD3,
            ServerTriggerType.OPHELD4,
            ServerTriggerType.OPHELD5,
            ServerTriggerType.OPHELDU,
            ServerTriggerType.OPHELDT,
            ServerTriggerType.INV_BUTTON1,
            ServerTriggerType.INV_BUTTON2,
            ServerTriggerType.INV_BUTTON3,
            ServerTriggerType.INV_BUTTON4,
            ServerTriggerType.INV_BUTTON5
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer.lastItem);
    },

    [ScriptOpcode.LAST_SLOT]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELD1,
            ServerTriggerType.OPHELD2,
            ServerTriggerType.OPHELD3,
            ServerTriggerType.OPHELD4,
            ServerTriggerType.OPHELD5,
            ServerTriggerType.OPHELDU,
            ServerTriggerType.OPHELDT,
            ServerTriggerType.INV_BUTTON1,
            ServerTriggerType.INV_BUTTON2,
            ServerTriggerType.INV_BUTTON3,
            ServerTriggerType.INV_BUTTON4,
            ServerTriggerType.INV_BUTTON5,
            ServerTriggerType.INV_BUTTOND
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer.lastSlot);
    },

    [ScriptOpcode.LAST_USEITEM]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELDU,
            ServerTriggerType.APOBJU,
            ServerTriggerType.APLOCU,
            ServerTriggerType.APNPCU,
            ServerTriggerType.APPLAYERU,
            ServerTriggerType.OPOBJU,
            ServerTriggerType.OPLOCU,
            ServerTriggerType.OPNPCU,
            ServerTriggerType.OPPLAYERU
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer.lastUseItem);
    },

    [ScriptOpcode.LAST_USESLOT]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELDU,
            ServerTriggerType.APOBJU,
            ServerTriggerType.APLOCU,
            ServerTriggerType.APNPCU,
            ServerTriggerType.APPLAYERU,
            ServerTriggerType.OPOBJU,
            ServerTriggerType.OPLOCU,
            ServerTriggerType.OPNPCU,
            ServerTriggerType.OPPLAYERU
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer.lastUseSlot);
    },

    [ScriptOpcode.MES]: checkedHandler(ActivePlayer, state => {
        const message = state.popString();

        if (Environment.CLIRUNNER) {
            console.log(message);
        }

        state.activePlayer.messageGame(message);
    }),

    [ScriptOpcode.NAME]: checkedHandler(ActivePlayer, state => {
        state.pushString(state.activePlayer.username);
    }),

    [ScriptOpcode.P_APRANGE]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.apRange = check(state.popInt(), NumberNotNull);
        state.activePlayer.apRangeCalled = true;
    }),

    [ScriptOpcode.P_ARRIVEDELAY]: checkedHandler(ProtectedActivePlayer, state => {
        if (state.activePlayer.lastMovement < World.currentTick) {
            return;
        }

        state.activePlayer.delay = 1;
        state.execution = ScriptState.SUSPENDED;
    }),

    [ScriptOpcode.P_COUNTDIALOG]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.write(new PCountDialog());
        state.execution = ScriptState.COUNTDIALOG;
    }),

    [ScriptOpcode.P_DELAY]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.delay = check(state.popInt(), NumberNotNull) + 1;
        state.execution = ScriptState.SUSPENDED;
        // TODO should this wipe any pointers?
    }),

    [ScriptOpcode.P_OPHELD]: checkedHandler(ProtectedActivePlayer, state => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.P_OPLOC]: checkedHandler(ProtectedActivePlayer, state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid oploc: ${type + 1}`);
        }
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeLoc, ServerTriggerType.APLOC1 + type);
    }),

    [ScriptOpcode.P_OPNPC]: checkedHandler(ProtectedActivePlayer, state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opnpc: ${type + 1}`);
        }
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeNpc, ServerTriggerType.APNPC1 + type, {type: state.activeNpc.type, com: -1});
    }),

    [ScriptOpcode.P_OPNPCT]: checkedHandler(ProtectedActivePlayer, state => {
        const spellId: number = check(state.popInt(), NumberNotNull);
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeNpc, ServerTriggerType.APNPCT, {type: state.activeNpc.type, com: spellId});
    }),

    [ScriptOpcode.P_PAUSEBUTTON]: checkedHandler(ProtectedActivePlayer, state => {
        state.execution = ScriptState.PAUSEBUTTON;
        // TODO last_com
    }),

    [ScriptOpcode.P_STOPACTION]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.stopAction();
    }),

    [ScriptOpcode.P_CLEARPENDINGACTION]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.clearPendingAction();
    }),

    [ScriptOpcode.P_TELEJUMP]: checkedHandler(ProtectedActivePlayer, state => {
        const position: Position = check(state.popInt(), CoordValid);

        state.activePlayer.teleJump(position.x, position.z, position.level);
    }),

    [ScriptOpcode.P_TELEPORT]: checkedHandler(ProtectedActivePlayer, state => {
        const position: Position = check(state.popInt(), CoordValid);

        state.activePlayer.teleport(position.x, position.z, position.level);
    }),

    [ScriptOpcode.P_WALK]: checkedHandler(ProtectedActivePlayer, state => {
        const pos: Position = check(state.popInt(), CoordValid);

        const player = state.activePlayer;
        player.queueWaypoints(rsmod.findPath(player.level, player.x, player.z, pos.x, pos.z, player.width, player.width, player.length, player.orientation));
        player.updateMovement(false); // try to walk immediately
    }),

    [ScriptOpcode.SAY]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.say(state.popString());
    }),

    [ScriptOpcode.SOUND_SYNTH]: checkedHandler(ActivePlayer, state => {
        const [synth, loops, delay] = state.popInts(3);

        state.activePlayer.write(new SynthSound(synth, loops, delay));
    }),

    [ScriptOpcode.STAFFMODLEVEL]: checkedHandler(ActivePlayer, state => {
        state.pushInt(state.activePlayer.staffModLevel);
    }),

    [ScriptOpcode.STAT]: checkedHandler(ActivePlayer, state => {
        const stat: PlayerStat = check(state.popInt(), PlayerStatValid);

        state.pushInt(state.activePlayer.levels[stat]);
    }),

    [ScriptOpcode.STAT_BASE]: checkedHandler(ActivePlayer, state => {
        const stat: PlayerStat = check(state.popInt(), PlayerStatValid);

        state.pushInt(state.activePlayer.baseLevels[stat]);
    }),

    [ScriptOpcode.STAT_ADD]: checkedHandler(ActivePlayer, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const player = state.activePlayer;
        const current = player.levels[stat];
        const added = current + (constant + (current * percent) / 100);
        player.levels[stat] = Math.min(added, 255);
        if (stat === 3 && player.levels[3] >= player.baseLevels[3]) {
            player.resetHeroPoints();
        }
    }),

    [ScriptOpcode.STAT_SUB]: checkedHandler(ActivePlayer, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const player = state.activePlayer;
        const current = player.levels[stat];
        const subbed = current - (constant + (current * percent) / 100);
        player.levels[stat] = Math.max(subbed, 0);
    }),

    [ScriptOpcode.SPOTANIM_PL]: checkedHandler(ActivePlayer, state => {
        const delay = check(state.popInt(), NumberNotNull);
        const height = state.popInt();
        const spotanimType: SpotanimType = check(state.popInt(), SpotAnimTypeValid);

        state.activePlayer.spotanim(spotanimType.id, height, delay);
    }),

    [ScriptOpcode.STAT_HEAL]: checkedHandler(ActivePlayer, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const player = state.activePlayer;
        const base = player.baseLevels[stat];
        const current = player.levels[stat];
        const healed = current + (constant + (current * percent) / 100);
        player.levels[stat] = Math.max(Math.min(healed, base), current);

        if (stat === 3 && player.levels[3] >= player.baseLevels[3]) {
            player.resetHeroPoints();
        }
    }),

    [ScriptOpcode.UID]: checkedHandler(ActivePlayer, state => {
        state.pushInt(state.activePlayer.uid);
    }),

    [ScriptOpcode.P_LOGOUT]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.logoutRequested = true;
    }),

    [ScriptOpcode.IF_SETCOLOUR]: checkedHandler(ActivePlayer, state => {
        const [com, colour] = state.popInts(2);

        check(com, NumberNotNull);
        check(colour, NumberNotNull);

        state.activePlayer.write(new IfSetColour(com, ColorConversion.rgb24to15(colour)));
    }),

    [ScriptOpcode.IF_OPENCHAT]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openChat(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_OPENMAINMODALSIDEOVERLAY]: checkedHandler(ActivePlayer, state => {
        const [main, side] = state.popInts(2);

        check(main, NumberNotNull);
        check(side, NumberNotNull);

        state.activePlayer.openMainModalSideOverlay(main, side);
    }),

    [ScriptOpcode.IF_SETHIDE]: checkedHandler(ActivePlayer, state => {
        const [com, hide] = state.popInts(2);

        check(com, NumberNotNull);
        check(hide, NumberNotNull);

        state.activePlayer.write(new IfSetHide(com, hide === 1));
    }),

    [ScriptOpcode.IF_SETOBJECT]: checkedHandler(ActivePlayer, state => {
        const [com, obj, scale] = state.popInts(3);

        check(com, NumberNotNull);
        check(obj, ObjTypeValid);
        check(scale, NumberNotNull);

        state.activePlayer.write(new IfSetObject(com, obj, scale));
    }),

    [ScriptOpcode.IF_SETTABACTIVE]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new IfShowSide(check(state.popInt(), NumberNotNull)));
    }),

    [ScriptOpcode.IF_SETMODEL]: checkedHandler(ActivePlayer, state => {
        const [com, model] = state.popInts(2);

        check(com, NumberNotNull);
        check(model, NumberNotNull);

        state.activePlayer.write(new IfSetModel(com, model));
    }),

    [ScriptOpcode.IF_SETRECOL]: checkedHandler(ActivePlayer, state => {
        const [com, src, dest] = state.popInts(3);

        check(com, NumberNotNull);

        state.activePlayer.write(new IfSetRecol(com, src, dest));
    }),

    [ScriptOpcode.IF_SETTABFLASH]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new TutorialFlashSide(check(state.popInt(), NumberNotNull)));
    }),

    [ScriptOpcode.IF_SETANIM]: checkedHandler(ActivePlayer, state => {
        const [com, seq] = state.popInts(2);

        check(com, NumberNotNull);

        if (seq === -1) {
            // uh, client crashes! which means empty dialogue wasn't an option at the time
            return;
        }

        state.activePlayer.write(new IfSetAnim(com, seq));
    }),

    [ScriptOpcode.IF_SETTAB]: checkedHandler(ActivePlayer, state => {
        const [com, tab] = state.popInts(2);

        check(tab, NumberNotNull);

        state.activePlayer.setTab(com, tab);
    }),

    [ScriptOpcode.IF_OPENMAINMODAL]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openMainModal(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_OPENCHATSTICKY]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openChatSticky(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_OPENSIDEOVERLAY]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openSideOverlay(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_SETPLAYERHEAD]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new IfSetPlayerHead(check(state.popInt(), NumberNotNull)));
    }),

    [ScriptOpcode.IF_SETTEXT]: checkedHandler(ActivePlayer, state => {
        const text = state.popString();
        const com = check(state.popInt(), NumberNotNull);

        state.activePlayer.write(new IfSetText(com, text));
    }),

    [ScriptOpcode.IF_SETNPCHEAD]: checkedHandler(ActivePlayer, state => {
        const [com, npc] = state.popInts(2);

        check(com, NumberNotNull);
        check(npc, NpcTypeValid);

        state.activePlayer.write(new IfSetNpcHead(com, npc));
    }),

    [ScriptOpcode.IF_SETPOSITION]: checkedHandler(ActivePlayer, state => {
        const [com, x, y] = state.popInts(3);

        check(com, NumberNotNull);

        state.activePlayer.write(new IfSetPosition(com, x, y));
    }),

    [ScriptOpcode.IF_MULTIZONE]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new SetMultiway(check(state.popInt(), NumberNotNull) === 1));
    }),

    [ScriptOpcode.GIVEXP]: checkedHandler(ProtectedActivePlayer, state => {
        const [stat, xp] = state.popInts(2);

        check(stat, NumberNotNull);
        check(xp, NumberNotNull);

        state.activePlayer.addXp(stat, xp);
    }),

    [ScriptOpcode.DAMAGE]: state => {
        const amount = check(state.popInt(), NumberNotNull);
        const type = check(state.popInt(), HitTypeValid);
        const uid = check(state.popInt(), NumberNotNull);

        const player = World.getPlayerByUid(uid);
        if (!player) {
            return;
        }

        player.applyDamage(amount, type);
    },

    [ScriptOpcode.IF_SETRESUMEBUTTONS]: checkedHandler(ActivePlayer, state => {
        const [button1, button2, button3, button4, button5] = state.popInts(5);

        state.activePlayer.resumeButtons = [button1, button2, button3, button4, button5];
    }),

    [ScriptOpcode.TEXT_GENDER]: checkedHandler(ActivePlayer, state => {
        const [male, female] = state.popStrings(2);
        if (state.activePlayer.gender == 0) {
            state.pushString(male);
        } else {
            state.pushString(female);
        }
    }),

    [ScriptOpcode.MIDI_SONG]: state => {
        state.activePlayer.playSong(check(state.popString(), StringNotNull));
    },

    [ScriptOpcode.MIDI_JINGLE]: state => {
        const delay = check(state.popInt(), NumberNotNull);
        const name = check(state.popString(), StringNotNull);
        state.activePlayer.playJingle(delay, name);
    },

    [ScriptOpcode.SOFTTIMER]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const interval = state.popInt();
        const timerId = state.popInt();

        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }
        state.activePlayer.setTimer(PlayerTimerType.SOFT, script, args, interval);
    }),

    [ScriptOpcode.CLEARSOFTTIMER]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.clearTimer(state.popInt());
    }),

    [ScriptOpcode.SETTIMER]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const interval = state.popInt();
        const timerId = state.popInt();

        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }
        state.activePlayer.setTimer(PlayerTimerType.NORMAL, script, args, interval);
    }),

    [ScriptOpcode.SETTIMER2]: checkedHandler(ScriptPointer.ActivePlayer2, state => {
        if (!state._activePlayer2) {
            return;
        }

        const args = popScriptArgs(state);
        const interval = state.popInt();
        const timerId = state.popInt();

        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }
        state._activePlayer2.setTimer(PlayerTimerType.NORMAL, script, args, interval);
    }),

    [ScriptOpcode.CLEARTIMER]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.clearTimer(state.popInt());
    }),

    [ScriptOpcode.HINT_COORD]: state => {
        const [offset, coord, height] = state.popInts(3);

        const position: Position = check(coord, CoordValid);
        state.activePlayer.hintTile(offset, position.x, position.z, height);
    },

    [ScriptOpcode.HINT_STOP]: state => {
        state.activePlayer.stopHint();
    },

    [ScriptOpcode.IF_CLOSESTICKY]: state => {
        state.activePlayer.closeSticky();
    },

    [ScriptOpcode.P_EXACTMOVE]: checkedHandler(ProtectedActivePlayer, state => {
        const [start, end, startCycle, endCycle, direction] = state.popInts(5);

        const startPos: Position = check(start, CoordValid);
        const endPos: Position = check(end, CoordValid);

        state.activePlayer.unsetMapFlag();
        state.activePlayer.exactMove(startPos.x, startPos.z, endPos.x, endPos.z, startCycle, endCycle, direction);
    }),

    [ScriptOpcode.BUSY]: state => {
        state.pushInt(state.activePlayer.busy() ? 1 : 0);
    },

    [ScriptOpcode.BUSY2]: state => {
        state.pushInt(state.activePlayer.hasInteraction() || state.activePlayer.hasWaypoints() ? 1 : 0);
    },

    [ScriptOpcode.GETQUEUE]: state => {
        const scriptId = state.popInt();

        let count: number = 0;
        for (let request = state.activePlayer.queue.head(); request !== null; request = state.activePlayer.queue.next()) {
            if (request.script.id === scriptId) {
                count++;
            }
        }
        for (let request= state.activePlayer.weakQueue.head(); request !== null; request = state.activePlayer.weakQueue.next()) {
            if (request.script.id === scriptId) {
                count++;
            }
        }
        state.pushInt(count);
    },

    // TODO: check active loc too
    [ScriptOpcode.P_LOCMERGE]: checkedHandler(ProtectedActivePlayer, state => {
        const [startCycle, endCycle, southEast, northWest] = state.popInts(4);

        const se: Position = check(southEast, CoordValid);
        const nw: Position = check(northWest, CoordValid);

        World.mergeLoc(state.activeLoc, state.activePlayer, startCycle, endCycle, se.z, se.x, nw.z, nw.x);
    }),

    [ScriptOpcode.LAST_LOGIN_INFO]: state => {
        const player = state.activePlayer;
        if (!isNetworkPlayer(player) || player.client === null) {
            return;
        }

        const client = player.client;

        const remoteAddress = client.remoteAddress;
        if (remoteAddress == null) {
            return;
        }

        const lastLoginIp = new Uint32Array(new Uint8Array(remoteAddress.split('.').map(x => parseInt(x))).reverse().buffer)[0];

        // 201 sends welcome_screen if.
        // not 201 sends welcome_screen_warning if.
        player.lastLoginInfo(lastLoginIp, 0, 201, 0);
    },

    [ScriptOpcode.BAS_READYANIM]: state => {
        state.activePlayer.basReadyAnim = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_TURNONSPOT]: state => {
        state.activePlayer.basTurnOnSpot = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_F]: state => {
        state.activePlayer.basWalkForward = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_B]: state => {
        state.activePlayer.basWalkBackward = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_L]: state => {
        state.activePlayer.basWalkLeft = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_R]: state => {
        state.activePlayer.basWalkRight = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_RUNNING]: state => {
        state.activePlayer.basRunning = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.GENDER]: state => {
        state.pushInt(state.activePlayer.gender);
    },

    [ScriptOpcode.HINT_NPC]: state => {
        state.activePlayer.hintNpc(check(state.popInt(), NumberNotNull));
    },

    [ScriptOpcode.HINT_PLAYER]: state => {
        state.activePlayer.hintPlayer(check(state.popInt(), NumberNotNull));
    },

    [ScriptOpcode.HEADICONS_GET]: state => {
        state.pushInt(state.activePlayer.headicons);
    },

    [ScriptOpcode.HEADICONS_SET]: state => {
        state.activePlayer.headicons = check(state.popInt(), NumberNotNull);
    },

    [ScriptOpcode.P_OPOBJ]: checkedHandler(ProtectedActivePlayer, state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opobj: ${type + 1}`);
        }
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeObj, ServerTriggerType.APOBJ1 + type);
    }),

    [ScriptOpcode.P_OPPLAYER]: checkedHandler(ProtectedActivePlayer, state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opplayer: ${type + 1}`);
        }
        const target = state._activePlayer2;
        if (!target) {
            return;
        }
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, target, ServerTriggerType.APPLAYER1 + type);
    }),

    [ScriptOpcode.ALLOWDESIGN]: state => {
        state.activePlayer.allowDesign = check(state.popInt(), NumberNotNull) === 1;
    },

    [ScriptOpcode.LAST_TARGETSLOT]: state => {
        const allowedTriggers = [ServerTriggerType.INV_BUTTOND];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer.lastTargetSlot);
    },

    [ScriptOpcode.WALKTRIGGER]: state => {
        state.activePlayer.walktrigger = state.popInt();
    },

    [ScriptOpcode.WALKTRIGGER2]: state => {
        if (!state._activePlayer2) {
            return;
        }

        state._activePlayer2.walktrigger = state.popInt();
    },

    [ScriptOpcode.GETWALKTRIGGER]: state => {
        state.pushInt(state.activePlayer.walktrigger);
    },

    [ScriptOpcode.CLEARQUEUE]: state => {
        const scriptId = state.popInt();

        for (let request = state.activePlayer.queue.head(); request !== null; request = state.activePlayer.queue.next()) {
            if (request.script.id === scriptId) {
                request.unlink();
            }
        }
        for (let request = state.activePlayer.weakQueue.head(); request !== null; request = state.activePlayer.weakQueue.next()) {
            if (request.script.id === scriptId) {
                request.unlink();
            }
        }
    },

    [ScriptOpcode.HEALENERGY]: state => {
        const amount = check(state.popInt(), NumberNotNull); // 100=1%, 1000=10%, 10000=100%

        const player = state.activePlayer;
        player.runenergy = Math.min(Math.max(player.runenergy + amount, 0), 10000);
    },

    [ScriptOpcode.AFK_EVENT]: state => {
        state.pushInt(state.activePlayer.afkEventReady ? 1 : 0);
        state.activePlayer.afkEventReady = false;
    },

    [ScriptOpcode.LOWMEMORY]: state => {
        state.pushInt(state.activePlayer.lowMemory ? 1 : 0);
    },

    [ScriptOpcode.SETIDKIT]: (state) => {
        const [idkit, color] = state.popInts(2);

        const idkType: IdkType = check(idkit, IDKTypeValid);

        let slot = idkType.type;
        if (state.activePlayer.gender === 1) {
            slot -= 7;
        }
        state.activePlayer.body[slot] = idkType.id;

        // 0 - hair/jaw
        // 1 - torso
        // 2 - legs
        // 3 - boots
        // 4 - skin
        let type = idkType.type;
        if(state.activePlayer.gender === 1) {
            type -= 7;
        }
        // console.log(type);
        let colorSlot = -1;
        if (type === 0 || type === 1) {
            colorSlot = 0;
        } else if (type === 2 || type === 3) {
            colorSlot = 1;
        } else if (type === 4) {
            /* no-op (no hand recoloring) */
        } else if (type === 5) {
            colorSlot = 2;
        } else if (type === 6) {
            colorSlot = 3;
        }

        if (colorSlot !== -1) {
            state.activePlayer.colors[colorSlot] = color;
        }
    },

    [ScriptOpcode.SETGENDER]: (state) => {
        const gender = check(state.popInt(), GenderValid);
        // convert idkit
        for (let i = 0; i < 7; i++) {
            state.activePlayer.body[i] = -1;
            for (let j = 0; j < IdkType.count; j++) {
                if (!IdkType.get(j).disable && IdkType.get(j).type == i + (gender === 0 ? 0 : 7)) {
                    state.activePlayer.body[i] = j;
                    break;
                }
            }
        }
        state.activePlayer.gender = gender;
    },

    [ScriptOpcode.SETSKINCOLOUR]: (state) => {
        const skin = check(state.popInt(), SkinColourValid);
        state.activePlayer.colors[4] = skin;
    },

    [ScriptOpcode.P_OPPLAYERT]: checkedHandler(ProtectedActivePlayer, state => {
        const spellId = check(state.popInt(), NumberNotNull);
        const target = state._activePlayer2;
        if (!target) {
            return;
        }
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, target, ServerTriggerType.APPLAYERT, {type: -1, com: spellId});
    }),

    [ScriptOpcode.FINDHERO]: checkedHandler(ActivePlayer, state => {
        const uid = state.activePlayer.findHero();
        if (uid === -1) {
            state.pushInt(0);
            return;
        }

        const player = World.getPlayerByUid(uid);
        if (!player) {
            state.pushInt(0);
            return;
        }
        state._activePlayer2 = player;
        state.pointerAdd(ScriptPointer.ActivePlayer2);
        state.pushInt(1);
    }),

    [ScriptOpcode.BOTH_HEROPOINTS]: checkedHandler(ActivePlayer, state => {
        const damage: number = check(state.popInt(), NumberNotNull);
        const secondary: boolean = state.intOperand === 1;

        const fromPlayer: Player | null = secondary ? state._activePlayer2 : state._activePlayer;
        const toPlayer: Player | null = secondary ? state._activePlayer : state._activePlayer2;

        if (!fromPlayer || !toPlayer) {
            throw new Error('player is null');
        }

        toPlayer.addHero(fromPlayer.uid, damage);
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
