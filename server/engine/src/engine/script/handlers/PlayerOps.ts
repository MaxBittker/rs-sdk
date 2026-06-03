import IdkType from '#/cache/config/IdkType.js';
import LocType from '#/cache/config/LocType.js';
import NpcType from '#/cache/config/NpcType.js';
import ObjType from '#/cache/config/ObjType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import CameraInfo from '#/engine/entity/CameraInfo.js';
import { PlayerTimerType } from '#/engine/entity/EntityTimer.js';
import type { HuntVis } from '#/engine/entity/hunt/HuntVis.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import Player from '#/engine/entity/Player.js';
import { PlayerQueueType, ScriptArgument } from '#/engine/entity/PlayerQueueRequest.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import { findPath } from '#/engine/GameMap.js';
import { PlayerHuntAllCommandIterator } from '#/engine/script/ScriptIterators.js';
import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';
import ScriptPointer, { ActivePlayer, checkedHandler, ProtectedActivePlayer } from '#/engine/script/ScriptPointer.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
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
    StringNotNull,
    GenderValid,
    PlayerOpIndexValid,
    PlayerOpStateValid,
    HuntVisValid
} from '#/engine/script/ScriptValidators.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import CamReset from '#/network/game/server/model/CamReset.js';
import CamShake from '#/network/game/server/model/CamShake.js';
import IfSetAnim from '#/network/game/server/model/IfSetAnim.js';
import IfSetColour from '#/network/game/server/model/IfSetColour.js';
import IfSetHide from '#/network/game/server/model/IfSetHide.js';
import IfSetModel from '#/network/game/server/model/IfSetModel.js';
import IfSetNpcHead from '#/network/game/server/model/IfSetNpcHead.js';
import IfSetObject from '#/network/game/server/model/IfSetObject.js';
import IfSetPlayerHead from '#/network/game/server/model/IfSetPlayerHead.js';
import IfSetPosition from '#/network/game/server/model/IfSetPosition.js';
import IfSetScrollPos from '#/network/game/server/model/IfSetScrollPos.js';
import IfSetTabActive from '#/network/game/server/model/IfSetTabActive.js';
import IfSetText from '#/network/game/server/model/IfSetText.js';
import MinimapToggle from '#/network/game/server/model/MinimapToggle.js';
import PCountDialog from '#/network/game/server/model/PCountDialog.js';
import SetPlayerOp from '#/network/game/server/model/SetPlayerOp.js';
import SynthSound from '#/network/game/server/model/SynthSound.js';
import TutFlash from '#/network/game/server/model/TutFlash.js';
import ColorConversion from '#/util/ColorConversion.js';
import Environment from '#/util/Environment.js';
import JavaRandom from '#/util/JavaRandom.js';

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

    // https://x.com/JagexAsh/status/1652956821798223873
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

    // https://x.com/JagexAsh/status/1698973910048403797
    [ScriptOpcode.STRONGQUEUE]: checkedHandler(ActivePlayer, state => {
        const [scriptId, delay, arg] = state.popInts(3);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.STRONG, delay, [arg]);
    }),

    [ScriptOpcode.STRONGQUEUEVARARG]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const [scriptId, delay] = state.popInts(2);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.STRONG, delay, args);
    }),

    // https://x.com/JagexAsh/status/1698973910048403797
    [ScriptOpcode.WEAKQUEUE]: checkedHandler(ActivePlayer, state => {
        const [scriptId, delay, arg] = state.popInts(3);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.WEAK, delay, [arg]);
    }),

    [ScriptOpcode.WEAKQUEUEVARARG]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const [scriptId, delay] = state.popInts(2);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.WEAK, delay, args);
    }),

    // https://x.com/JagexAsh/status/1698973910048403797
    // https://x.com/JagexAsh/status/1821831590906859683
    [ScriptOpcode.QUEUE]: checkedHandler(ActivePlayer, state => {
        const [scriptId, delay, arg] = state.popInts(3);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.NORMAL, delay, [arg]);
    }),

    [ScriptOpcode.QUEUEVARARG]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const [scriptId, delay] = state.popInts(2);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.NORMAL, delay, args);
    }),

    [ScriptOpcode.LONGQUEUE]: checkedHandler(ActivePlayer, state => {
        const [scriptId, delay, arg, logoutAction] = state.popInts(4);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.LONG, delay, [logoutAction, arg]);
    }),

    [ScriptOpcode.LONGQUEUEVARARG]: checkedHandler(ActivePlayer, state => {
        const args = popScriptArgs(state);
        const [scriptId, delay, logoutAction] = state.popInts(3);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        state.activePlayer.enqueueScript(script, PlayerQueueType.LONG, delay, [logoutAction, ...args]);
    }),

    // https://x.com/JagexAsh/status/1806246992797921391
    [ScriptOpcode.ANIM]: checkedHandler(ActivePlayer, state => {
        const delay = state.popInt();
        const seq = state.popInt();

        state.activePlayer.playAnimation(seq, delay);
    }),

    [ScriptOpcode.BUILDAPPEARANCE]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.buildAppearance(check(state.popInt(), InvTypeValid).id);
    }),

    [ScriptOpcode.CAM_LOOKAT]: checkedHandler(ActivePlayer, state => {
        const [coord, height, rotationSpeed, rotationMultiplier] = state.popInts(4);

        const pos: CoordGrid = check(coord, CoordValid);
        state.activePlayer.cameraPackets.addTail(new CameraInfo(1, pos.x, pos.z, height, rotationSpeed, rotationMultiplier));
    }),

    [ScriptOpcode.CAM_MOVETO]: checkedHandler(ActivePlayer, state => {
        const [coord, height, rotationSpeed, rotationMultiplier] = state.popInts(4);

        const pos: CoordGrid = check(coord, CoordValid);
        state.activePlayer.cameraPackets.addTail(new CameraInfo(0, pos.x, pos.z, height, rotationSpeed, rotationMultiplier));
    }),

    [ScriptOpcode.CAM_SHAKE]: checkedHandler(ActivePlayer, state => {
        const [type, jitter, amplitude, frequency] = state.popInts(4);

        state.activePlayer.write(new CamShake(type, jitter, amplitude, frequency));
    }),

    [ScriptOpcode.CAM_RESET]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new CamReset());
    }),

    [ScriptOpcode.COORD]: checkedHandler(ActivePlayer, state => {
        const coord: CoordGrid = state.activePlayer;
        state.pushInt(CoordGrid.packCoord(coord.level, coord.x, coord.z));
    }),

    [ScriptOpcode.DISPLAYNAME]: checkedHandler(ActivePlayer, state => {
        state.pushString(state.activePlayer.displayName);
    }),

    [ScriptOpcode.FACESQUARE]: checkedHandler(ActivePlayer, state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.activePlayer.faceSquare(coord.x, coord.z);
    }),

    [ScriptOpcode.IF_CLOSE]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.closeModal();
    }),

    [ScriptOpcode.LAST_COM]: state => {
        state.pushInt(state.activePlayer.lastCom);
    },

    // https://x.com/JagexAsh/status/1782377050021523947
    // todo: move out of PlayerOps
    [ScriptOpcode.LAST_INT]: state => {
        state.pushInt(state.lastInt);
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

        state.activePlayer.messageGame(message);
    }),

    [ScriptOpcode.NAME]: checkedHandler(ActivePlayer, state => {
        state.pushString(state.activePlayer.username);
    }),

    [ScriptOpcode.P_APRANGE]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.apRange = check(state.popInt(), NumberNotNull);
        state.activePlayer.apRangeCalled = true;
    }),

    // https://x.com/JagexAsh/status/1648254846686904321
    [ScriptOpcode.P_ARRIVEDELAY]: checkedHandler(ProtectedActivePlayer, state => {
        if (state.activePlayer.lastMovement < World.currentTick) {
            return;
        }

        state.activePlayer.delayed = true;
        state.activePlayer.delayedUntil = World.currentTick + 1;
        state.execution = ScriptState.SUSPENDED;
    }),

    [ScriptOpcode.P_COUNTDIALOG]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.write(new PCountDialog());
        state.execution = ScriptState.COUNTDIALOG;
    }),

    // https://x.com/JagexAsh/status/1684478874703343616
    // https://x.com/JagexAsh/status/1780932943038345562
    [ScriptOpcode.P_DELAY]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.delayed = true;
        state.activePlayer.delayedUntil = World.currentTick + 1 + check(state.popInt(), NumberNotNull);
        state.execution = ScriptState.SUSPENDED;
    }),

    [ScriptOpcode.P_OPHELD]: checkedHandler(ProtectedActivePlayer, () => {
        throw new Error('unimplemented');
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPLOC]: checkedHandler(ProtectedActivePlayer, state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid oploc: ${type + 1}`);
        }
        const locType: LocType = LocType.get(state.activeLoc.type);
        if (!locType.op || !locType.op[type]) {
            return;
        }
        state.activePlayer.stopAction();
        if (!state.activePlayer.inOperableDistance(state.activeLoc)) {
            state.activePlayer.queueWaypoint(state.activeLoc.x, state.activeLoc.z);
        }
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeLoc, ServerTriggerType.APLOC1 + type);
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPNPC]: checkedHandler(ProtectedActivePlayer, state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opnpc: ${type + 1}`);
        }
        const npcType: NpcType = NpcType.get(state.activeNpc.type);
        if (!npcType.op || !npcType.op[type]) {
            return;
        }
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeNpc, ServerTriggerType.APNPC1 + type);
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPNPCT]: checkedHandler(ProtectedActivePlayer, state => {
        const spellId: number = check(state.popInt(), NumberNotNull);
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeNpc, ServerTriggerType.APNPCT, spellId);
    }),

    // https://x.com/JagexAsh/status/1389465615631519744
    [ScriptOpcode.P_PAUSEBUTTON]: checkedHandler(ProtectedActivePlayer, state => {
        state.execution = ScriptState.PAUSEBUTTON;
    }),

    // https://x.com/JagexAsh/status/1780904271610867780
    [ScriptOpcode.P_STOPACTION]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.stopAction();
    }),

    // https://x.com/JagexAsh/status/1780230057023181259
    [ScriptOpcode.P_CLEARPENDINGACTION]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.clearPendingAction();
    }),

    // https://x.com/JagexAsh/status/1697517518007541917
    [ScriptOpcode.P_TELEJUMP]: checkedHandler(ProtectedActivePlayer, state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.activePlayer.teleJump(coord.x, coord.z, coord.level);
    }),

    // https://x.com/JagexAsh/status/1697517518007541917
    // https://x.com/JagexAsh/status/1790684996480442796
    [ScriptOpcode.P_TELEPORT]: checkedHandler(ProtectedActivePlayer, state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.activePlayer.teleport(coord.x, coord.z, coord.level);
    }),

    // https://x.com/JagexAsh/status/1605130887292751873
    // https://x.com/JagexAsh/status/1698248664349614138
    [ScriptOpcode.P_WALK]: checkedHandler(ProtectedActivePlayer, state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const player = state.activePlayer;
        player.queueWaypoints(findPath(player.level, player.x, player.z, coord.x, coord.z));
    }),

    [ScriptOpcode.SAY]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.say(state.popString());
    }),

    [ScriptOpcode.SOUND_SYNTH]: checkedHandler(ActivePlayer, state => {
        const [synth, loops, delay] = state.popInts(3);

        check(synth, NumberNotNull);

        const player = state.activePlayer;
        if (player.lowMemory) {
            return;
        }

        player.write(new SynthSound(synth, loops, delay));
    }),

    [ScriptOpcode.STAFFMODLEVEL]: checkedHandler(ActivePlayer, state => {
        state.pushInt(state.activePlayer.staffModLevel);
    }),

    [ScriptOpcode.STAT]: checkedHandler(ActivePlayer, state => {
        const stat: PlayerStat = check(state.popInt(), PlayerStatValid);

        state.pushInt(state.activePlayer.levels[stat]);
    }),

    [ScriptOpcode.STAT_TOTAL]: checkedHandler(ActivePlayer, state => {
        let total = 0;
        for (let stat = 0; stat < state.activePlayer.baseLevels.length; stat++) {
            total += state.activePlayer.baseLevels[stat];
        }

        state.pushInt(total);
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
        const base = player.baseLevels[stat];
        const current = player.levels[stat];
        const added = current + ((constant + (base * percent) / 100) | 0);
        player.levels[stat] = Math.min(added, 255);
        if (stat === PlayerStat.HITPOINTS && player.levels[PlayerStat.HITPOINTS] >= player.baseLevels[PlayerStat.HITPOINTS]) {
            player.heroPoints.clear();
        }
        if (added !== current) {
            player.changeStat(stat);
        }
    }),

    [ScriptOpcode.STAT_SUB]: checkedHandler(ActivePlayer, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const player = state.activePlayer;
        const base = player.baseLevels[stat];
        const current = player.levels[stat];
        const subbed = current - ((constant + (base * percent) / 100) | 0);
        player.levels[stat] = Math.max(subbed, 0);
        if (subbed !== current) {
            player.changeStat(stat);
        }
    }),

    [ScriptOpcode.STAT_BOOST]: checkedHandler(ActivePlayer, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const player = state.activePlayer;
        const base = player.baseLevels[stat];
        const current = player.levels[stat];

        const boost = (constant + (base * percent) / 100) | 0;
        const boosted = Math.max(Math.min(current + boost, base + boost), current);
        player.levels[stat] = Math.min(boosted, 255);
        if (stat === PlayerStat.HITPOINTS && player.levels[PlayerStat.HITPOINTS] >= player.baseLevels[PlayerStat.HITPOINTS]) {
            player.heroPoints.clear();
        }
        if (boosted !== current) {
            player.changeStat(stat);
        }
    }),

    // same as stat_sub except it drains the current level instead of base level
    [ScriptOpcode.STAT_DRAIN]: checkedHandler(ActivePlayer, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const player = state.activePlayer;
        const current = player.levels[stat];
        const subbed = current - ((constant + (current * percent) / 100) | 0);
        player.levels[stat] = Math.max(subbed, 0);
        if (subbed !== current) {
            player.changeStat(stat);
        }
    }),

    // https://x.com/JagexAsh/status/1110604592138670083
    [ScriptOpcode.STAT_RANDOM]: checkedHandler(ActivePlayer, state => {
        const [stat, low, high] = state.popInts(3);

        const level = state.activePlayer.levels[stat];
        const value = Math.floor((low * (99 - level)) / 98) + Math.floor((high * (level - 1)) / 98) + 1;
        const chance = Math.floor(JavaRandom.nextDouble() * 256);

        state.pushInt(value > chance ? 1 : 0);
    }),

    [ScriptOpcode.SPOTANIM_PL]: checkedHandler(ActivePlayer, state => {
        const delay = check(state.popInt(), NumberNotNull);
        const height = state.popInt();
        const spotanim = state.popInt();

        state.activePlayer.spotanim(spotanim, height, delay);
    }),

    [ScriptOpcode.STAT_HEAL]: checkedHandler(ActivePlayer, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const player = state.activePlayer;
        const base = player.baseLevels[stat];
        const current = player.levels[stat];
        const healed = current + ((constant + (base * percent) / 100) | 0);
        player.levels[stat] = Math.max(Math.min(healed, base), current);

        if (stat === PlayerStat.HITPOINTS && player.levels[PlayerStat.HITPOINTS] >= player.baseLevels[PlayerStat.HITPOINTS]) {
            player.heroPoints.clear();
        }

        if (healed !== current) {
            player.changeStat(stat);
        }
    }),

    [ScriptOpcode.UID]: checkedHandler(ActivePlayer, state => {
        state.pushInt(state.activePlayer.uid);
    }),

    [ScriptOpcode.P_LOGOUT]: checkedHandler(ProtectedActivePlayer, state => {
        console.warn(`[LOGOUT DEBUG] P_LOGOUT script opcode called for ${state.activePlayer.username}`);
        state.activePlayer.requestLogout = true;
    }),

    [ScriptOpcode.P_PREVENTLOGOUT]: checkedHandler(ProtectedActivePlayer, state => {
        // a short antilog can overwrite a long one in osrs, so no checks here
        state.activePlayer.preventLogoutMessage = check(state.popString(), StringNotNull);
        state.activePlayer.preventLogoutUntil = World.currentTick + check(state.popInt(), NumberNotNull);
    }),

    [ScriptOpcode.IF_SETCOLOUR]: checkedHandler(ActivePlayer, state => {
        const [com, colour] = state.popInts(2);

        check(com, NumberNotNull);
        check(colour, NumberNotNull);

        state.activePlayer.write(new IfSetColour(com, ColorConversion.rgb24to15(colour)));
    }),

    [ScriptOpcode.IF_OPENCHAT]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openChatModal(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_OPENMAIN_SIDE]: checkedHandler(ActivePlayer, state => {
        const [main, side] = state.popInts(2);

        check(main, NumberNotNull);
        check(side, NumberNotNull);

        state.activePlayer.openMainSideModal(main, side);
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
        state.activePlayer.write(new IfSetTabActive(check(state.popInt(), NumberNotNull)));
    }),

    [ScriptOpcode.IF_SETMODEL]: checkedHandler(ActivePlayer, state => {
        const [com, model] = state.popInts(2);

        check(com, NumberNotNull);
        check(model, NumberNotNull);

        state.activePlayer.write(new IfSetModel(com, model));
    }),

    [ScriptOpcode.TUT_FLASH]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new TutFlash(check(state.popInt(), NumberNotNull)));
    }),

    [ScriptOpcode.IF_SETANIM]: checkedHandler(ActivePlayer, state => {
        const [com, seq] = state.popInts(2);

        check(com, NumberNotNull);

        state.activePlayer.write(new IfSetAnim(com, seq));
    }),

    [ScriptOpcode.IF_SETTAB]: checkedHandler(ActivePlayer, state => {
        const [com, tab] = state.popInts(2);

        check(tab, NumberNotNull);

        state.activePlayer.setTab(com, tab);
    }),

    [ScriptOpcode.IF_OPENMAIN]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openMainModal(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_OPENOVERLAY]: checkedHandler(ActivePlayer, state => {
        const com = state.popInt();
        state.activePlayer.openMainOverlay(com);
    }),

    [ScriptOpcode.TUT_OPEN]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openTutorial(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_OPENSIDE]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.openSideModal(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.IF_SETPLAYERHEAD]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.write(new IfSetPlayerHead(check(state.popInt(), NumberNotNull)));
    }),

    [ScriptOpcode.IF_SETTEXT]: checkedHandler(ActivePlayer, state => {
        let text = state.popString();
        const com = check(state.popInt(), NumberNotNull);

        if (text.indexOf('\\n') !== -1 && text.indexOf('@') !== -1) {
            const lines = text.split('\\n');
            let savedCol: string | null = null;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (i > 0 && savedCol !== null && line.length > 0) {
                    const strIndex = line.indexOf('@str@');
                    if (strIndex !== -1) {
                        if (line.substring(strIndex + 5, strIndex + 10) !== '@bla@') {
                            line = line.substring(0, strIndex + 5) + '@bla@' + line.substring(strIndex + 5);
                        }
                        savedCol = null;
                    } else {
                        line = savedCol + line;
                    }
                    lines[i] = line;
                }

                for (let j = 0; j + 4 < line.length; j++) {
                    if (line.charAt(j) === '@' && line.charAt(j + 4) === '@') {
                        const col = line.substring(j + 1, j + 4);
                        if (col === 'str') {
                            savedCol = null;
                            if (line.substring(j + 5, j + 10) === '@bla@') {
                                j += 9;
                                continue;
                            }
                        } else {
                            savedCol = line.substring(j, j + 5);
                        }
                        j += 4;
                    }
                }
            }
            text = lines.join('\\n');
        }

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

    [ScriptOpcode.IF_SETSCROLLPOS]: checkedHandler(ActivePlayer, state => {
        const [com, y] = state.popInts(2);

        check(com, NumberNotNull);

        state.activePlayer.write(new IfSetScrollPos(com, y));
    }),

    [ScriptOpcode.STAT_ADVANCE]: checkedHandler(ActivePlayer, state => {
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

    [ScriptOpcode.IF_ADDRESUMEBUTTON]: checkedHandler(ActivePlayer, state => {
        const comId = state.popInt();

        state.activePlayer.resumeButtons.push(comId);
    }),

    [ScriptOpcode.TEXT_GENDER]: checkedHandler(ActivePlayer, state => {
        const [male, female] = state.popStrings(2);
        if (state.activePlayer.gender === 0) {
            state.pushString(male);
        } else {
            state.pushString(female);
        }
    }),

    [ScriptOpcode.MIDI_SONG]: state => {
        const id = state.popInt();

        const player = state.activePlayer;
        if (player.lowMemory) {
            return;
        }

        player.playSong(id);
    },

    [ScriptOpcode.MIDI_JINGLE]: state => {
        const id = state.popInt();

        const player = state.activePlayer;
        if (player.lowMemory) {
            return;
        }

        player.playJingle(id);
    },

    [ScriptOpcode.MINIMAP_TOGGLE]: checkedHandler(ActivePlayer, state => {
        const type = check(state.popInt(), NumberNotNull);
        state.activePlayer.write(new MinimapToggle(type));
    }),

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

    [ScriptOpcode.CLEARTIMER]: checkedHandler(ActivePlayer, state => {
        state.activePlayer.clearTimer(state.popInt());
    }),

    [ScriptOpcode.GETTIMER]: checkedHandler(ActivePlayer, state => {
        const timerId = state.popInt();
        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }

        for (const timer of state.activePlayer.timers.values()) {
            if (timer.script.id === timerId) {
                state.pushInt(timer.clock);
                return;
            }
        }

        state.pushInt(-1);
    }),

    [ScriptOpcode.HINT_COORD]: state => {
        const [offset, coord, height] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        state.activePlayer.hintTile(offset, position.x, position.z, height);
    },

    [ScriptOpcode.HINT_STOP]: state => {
        state.activePlayer.stopHint();
    },

    [ScriptOpcode.TUT_CLOSE]: state => {
        state.activePlayer.closeTutorial();
    },

    // https://x.com/JagexAsh/status/1684174294086033410
    [ScriptOpcode.P_EXACTMOVE]: checkedHandler(ProtectedActivePlayer, state => {
        const [start, end, startCycle, endCycle, direction] = state.popInts(5);

        const startPos: CoordGrid = check(start, CoordValid);
        const endPos: CoordGrid = check(end, CoordValid);

        state.activePlayer.unsetMapFlag();
        state.activePlayer.exactMove(startPos.x, startPos.z, endPos.x, endPos.z, startCycle, endCycle, direction);
    }),

    // https://x.com/JagexAsh/status/1653407769989349377
    [ScriptOpcode.BUSY]: state => {
        state.pushInt(state.activePlayer.busy() || state.activePlayer.loggingOut ? 1 : 0);
    },

    // https://x.com/JagexAsh/status/1791053667228856563
    [ScriptOpcode.BUSY2]: state => {
        state.pushInt(state.activePlayer.hasInteraction() || state.activePlayer.hasWaypoints() ? 1 : 0);
    },

    // https://x.com/JagexAsh/status/1821831590906859683
    [ScriptOpcode.GETQUEUE]: state => {
        const scriptId = state.popInt();

        let count: number = 0;
        for (const request of state.activePlayer.queue.all()) {
            if (request.script.id === scriptId) {
                count++;
            }
        }
        for (const request of state.activePlayer.weakQueue.all()) {
            if (request.script.id === scriptId) {
                count++;
            }
        }
        state.pushInt(count);
    },

    // https://x.com/JagexAsh/status/1684232225397657602
    // TODO: check active loc too
    [ScriptOpcode.P_LOCMERGE]: checkedHandler(ProtectedActivePlayer, state => {
        const [startCycle, endCycle, southEast, northWest] = state.popInts(4);

        const se: CoordGrid = check(southEast, CoordValid);
        const nw: CoordGrid = check(northWest, CoordValid);

        World.mergeLoc(state.activeLoc, state.activePlayer, startCycle, endCycle, se.z, se.x, nw.z, nw.x);
    }),

    [ScriptOpcode.LAST_LOGIN_INFO]: state => {
        state.activePlayer.lastLoginInfo();
    },

    [ScriptOpcode.READYANIM]: state => {
        state.activePlayer.readyanim = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.TURNANIM]: state => {
        state.activePlayer.turnanim = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.WALKANIM]: state => {
        state.activePlayer.walkanim = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.WALKANIM_B]: state => {
        state.activePlayer.walkanim_b = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.WALKANIM_L]: state => {
        state.activePlayer.walkanim_l = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.WALKANIM_R]: state => {
        state.activePlayer.walkanim_r = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.RUNANIM]: state => {
        const seq = state.popInt();
        if (seq === -1) {
            state.activePlayer.runanim = -1;
            return;
        }
        state.activePlayer.runanim = check(seq, SeqTypeValid).id;
    },

    [ScriptOpcode.GENDER]: state => {
        state.pushInt(state.activePlayer.gender);
    },

    [ScriptOpcode.HINT_NPC]: state => {
        state.activePlayer.hintNpc(state.activeNpc.nid);
    },

    [ScriptOpcode.HINT_PL]: state => {
        state.activePlayer.hintPlayer(state.activePlayer2.slot);
    },

    [ScriptOpcode.HEADICONS_GET]: state => {
        state.pushInt(state.activePlayer.headicons);
    },

    [ScriptOpcode.HEADICONS_SET]: state => {
        state.activePlayer.headicons = check(state.popInt(), NumberNotNull);
    },

    // https://x.com/JagexAsh/status/1791472651623370843
    // https://x.com/JagexAsh/status/1790684996480442796
    [ScriptOpcode.P_OPOBJ]: checkedHandler(ProtectedActivePlayer, state => {
        const op = check(state.popInt(), NumberNotNull) - 1;
        if (op < 0 || op >= 5) {
            throw new Error(`Invalid opobj: ${op + 1}`);
        }

        const type: ObjType = ObjType.get(state.activeObj.type);
        if (type.op[op] === null) {
            return;
        }

        state.activePlayer.stopAction();

        // Sets player destination naively to the Obj's coordinate
        state.activePlayer.queueWaypoint(state.activeObj.x, state.activeObj.z);
        state.activePlayer.setInteraction(Interaction.SCRIPT, state.activeObj, ServerTriggerType.APOBJ1 + op);
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
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

    // https://x.com/JagexAsh/status/1779778790593372205
    [ScriptOpcode.GETWALKTRIGGER]: state => {
        state.pushInt(state.activePlayer.walktrigger);
    },

    // https://x.com/JagexAsh/status/1821831590906859683
    [ScriptOpcode.CLEARQUEUE]: state => {
        const scriptId = state.popInt();
        state.activePlayer.unlinkQueuedScript(scriptId);
    },

    [ScriptOpcode.HEALENERGY]: state => {
        const amount = check(state.popInt(), NumberNotNull); // 100=1%, 1000=10%, 10000=100%

        const player = state.activePlayer;
        player.runenergy = Math.min(Math.max(player.runenergy + amount, 0), 10000);
    },

    [ScriptOpcode.AFK_EVENT]: state => {
        state.pushInt((Environment.node.debug || state.activePlayer.staffModLevel < 2) && state.activePlayer.afkEventReady ? 1 : 0);
        state.activePlayer.afkEventReady = false;
    },

    [ScriptOpcode.LOWMEM]: state => {
        state.pushInt(state.activePlayer.lowMemory ? 1 : 0);
    },

    [ScriptOpcode.SETIDKIT]: state => {
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
        if (state.activePlayer.gender === 1) {
            type -= 7;
        }
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

    [ScriptOpcode.SETGENDER]: state => {
        const gender = check(state.popInt(), GenderValid);
        // convert idkit, have to use a mapping cause order + there's not always an equivalence
        for (let i = 0; i < 7; i++) {
            if (gender === 1) {
                state.activePlayer.body[i] = Player.MALE_FEMALE_MAP.get(state.activePlayer.body[i]) ?? -1;
            } else {
                if (i === 1) {
                    state.activePlayer.body[i] = 14;
                    continue;
                }
                state.activePlayer.body[i] = Player.FEMALE_MALE_MAP.get(state.activePlayer.body[i]) ?? -1;
            }
        }
        state.activePlayer.gender = gender;
    },

    [ScriptOpcode.SET_SKILL_LEVEL]: checkedHandler(ActivePlayer, state => {
        const level = check(state.popInt(), NumberNotNull);
        state.activePlayer.skillLevel = level;
    }),

    [ScriptOpcode.SETIDKCOLOUR]: state => {
        const [slot, color] = state.popInts(2);
        if (slot > state.activePlayer.colors.length || slot < 0) {
            throw new Error(`Invalid idk slot: ${slot}`);
        }
        state.activePlayer.colors[slot] = color;
    },

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPPLAYERT]: checkedHandler(ProtectedActivePlayer, state => {
        const spellId = check(state.popInt(), NumberNotNull);
        const target = state._activePlayer2;
        if (!target) {
            return;
        }
        state.activePlayer.stopAction();
        state.activePlayer.setInteraction(Interaction.SCRIPT, target, ServerTriggerType.APPLAYERT, spellId);
    }),

    // https://x.com/JagexAsh/status/1799020087086903511
    [ScriptOpcode.FINDHERO]: checkedHandler(ActivePlayer, state => {
        const hash64 = state.activePlayer.heroPoints.findHero();
        if (hash64 === -1n) {
            state.pushInt(0);
            return;
        }

        const player = World.getPlayerByHash64(hash64);
        if (!player) {
            state.pushInt(0);
            return;
        }
        state._activePlayer2 = player;
        state.pointerAdd(ScriptPointer.ActivePlayer2);
        state.pushInt(1);
    }),

    // https://x.com/JagexAsh/status/1799020087086903511
    [ScriptOpcode.BOTH_HEROPOINTS]: checkedHandler(ActivePlayer, state => {
        const damage: number = check(state.popInt(), NumberNotNull);
        const secondary: boolean = state.intOperand === 1;

        const fromPlayer: Player | null = secondary ? state._activePlayer2 : state._activePlayer;
        const toPlayer: Player | null = secondary ? state._activePlayer : state._activePlayer2;

        if (!fromPlayer || !toPlayer) {
            throw new Error('player is null');
        }

        toPlayer.heroPoints.addHero(fromPlayer.hash64, damage);
    }),

    // https://x.com/JagexAsh/status/1806246992797921391
    [ScriptOpcode.P_ANIMPROTECT]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.animProtect = check(state.popInt(), NumberNotNull);
    }),

    [ScriptOpcode.RUNENERGY]: checkedHandler(ActivePlayer, state => {
        const player = state.activePlayer;
        state.pushInt(player.runenergy);
    }),

    [ScriptOpcode.WEIGHT]: checkedHandler(ProtectedActivePlayer, state => {
        state.pushInt(state.activePlayer.runweight);
    }),

    [ScriptOpcode.SESSION_LOG]: checkedHandler(ActivePlayer, state => {
        const eventType = state.popInt() + 2;
        const event = state.popString();

        state.activePlayer.addSessionLog(eventType, event);
    }),

    [ScriptOpcode.WEALTH_EVENT]: checkedHandler(ActivePlayer, state => {
        const name = state.popString();
        const [eventType, count, value] = state.popInts(3);

        const objType = ObjType.getByName(name);

        state.activePlayer.addWealthEvent({
            event_type: eventType,
            account_items: [{ id: objType?.id, name, count }],
            account_value: value
        });
    }),

    [ScriptOpcode.P_RUN]: checkedHandler(ProtectedActivePlayer, state => {
        state.activePlayer.run = state.popInt();

        // todo: better way to sync engine varp
        state.activePlayer.setVar(VarPlayerType.RUN, state.activePlayer.run);
    }),

    [ScriptOpcode.PLAYERMEMBER]: checkedHandler(ActivePlayer, state => {
        state.pushInt(state.activePlayer.members ? 1 : 0);
    }),

    [ScriptOpcode.SET_PLAYER_OP]: checkedHandler(ActivePlayer, state => {
        const text = state.popString();
        const [index, primary] = state.popInts(2);

        check(index, PlayerOpIndexValid);
        check(primary, PlayerOpStateValid);

        state.activePlayer.write(new SetPlayerOp(index, text, primary));
    }),

    [ScriptOpcode.HUNTALL]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.playerIterator = new PlayerHuntAllCommandIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis);
    },

    [ScriptOpcode.HUNTNEXT]: state => {
        const result = state.playerIterator?.next();
        if (!result || result.done) {
            state.pushInt(0);
            return;
        }

        if (!(result.value instanceof Player)) {
            throw new Error('[ServerOps] huntnext command must result instance of Player.');
        }

        state.activePlayer = result.value;
        state.pointerAdd(ActivePlayer[state.intOperand]);
        state.pushInt(1);
    }
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
