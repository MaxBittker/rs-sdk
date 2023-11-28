import {CommandHandlers} from '#lostcity/engine/script/ScriptRunner.js';
import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import ParamType from '#lostcity/cache/ParamType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import {ParamHelper} from '#lostcity/cache/ParamHelper.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import {Position} from '#lostcity/entity/Position.js';
import ScriptPointer, {checkedHandler} from '#lostcity/engine/script/ScriptPointer.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import World from '#lostcity/engine/World.js';
import Npc from '#lostcity/entity/Npc.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import Player from '#lostcity/entity/Player.js';
import Loc from '#lostcity/entity/Loc.js';
import Obj from '#lostcity/entity/Obj.js';
import HuntType from '#lostcity/cache/HuntType.js';

const ActiveNpc = [ScriptPointer.ActiveNpc, ScriptPointer.ActiveNpc2];

const NpcOps: CommandHandlers = {
    [ScriptOpcode.NPC_FINDUID]: (state) => {
        const npcUid = state.popInt();
        const slot = npcUid & 0xFFFF;
        const expectedType = npcUid >> 16 & 0xFFFF;
        const npc = World.getNpc(slot);

        if (npc !== null && npc.type === expectedType) {
            state.activeNpc = npc;
            state.pointerAdd(ActiveNpc[state.intOperand]);
            state.pushInt(1);
        } else {
            state.pointerRemove(ActiveNpc[state.intOperand]);
            state.pushInt(0);
        }
    },

    [ScriptOpcode.NPC_ADD]: (state) => {
        const [coord, id, duration] = state.popInts(3);

        if (id == -1) {
            throw new Error('NPC_ADD attempted to use obj was null.');
        }

        if (duration < 1) {
            throw new Error(`NPC_ADD attempted to use duration that was out of range: ${duration}. duration should be greater than zero.`);
        }

        if (coord < 0 || coord > Position.max) {
            throw new Error(`NPC_ADD attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const pos = Position.unpackCoord(coord);
        const npcType = NpcType.get(id);

        const npc = new Npc(
            pos.level,
            pos.x,
            pos.z,
            npcType.size,
            npcType.size,
            World.getNextNid(),
            npcType.id,
            npcType.moverestrict,
            npcType.blockwalk
        );

        npc.static = false;
        npc.despawn = World.currentTick + duration;
        World.addNpc(npc);
        state.activeNpc = npc;
        state.pointerAdd(ActiveNpc[state.intOperand]);
    },

    [ScriptOpcode.NPC_ANIM]: checkedHandler(ActiveNpc, (state) => {
        const delay = state.popInt();
        const seq = state.popInt();

        state.activeNpc.playAnimation(seq, delay);
    }),

    [ScriptOpcode.NPC_BASESTAT]: checkedHandler(ActiveNpc, (state) => {
        const stat = state.popInt();
        state.pushInt(state.activeNpc.baseLevels[stat]);
    }),

    [ScriptOpcode.NPC_CATEGORY]: checkedHandler(ActiveNpc, (state) => {
        const npc = NpcType.get(state.activeNpc.type);
        state.pushInt(npc.category);
    }),

    [ScriptOpcode.NPC_COORD]: checkedHandler(ActiveNpc, (state) => {
        const npc = state.activeNpc;
        state.pushInt(Position.packCoord(npc.level, npc.x, npc.z));
    }),

    [ScriptOpcode.NPC_DEL]: checkedHandler(ActiveNpc, (state) => {
        World.removeNpc(state.activeNpc);
    }),

    [ScriptOpcode.NPC_DELAY]: checkedHandler(ActiveNpc, (state) => {
        state.activeNpc.delay = state.popInt() + 1;
        state.execution = ScriptState.SUSPENDED;
    }),

    [ScriptOpcode.NPC_FACESQUARE]: checkedHandler(ActiveNpc, (state) => {
        const coord = state.popInt();

        if (coord < 0 || coord > Position.max) {
            throw new Error(`NPC_FACESQUARE attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const pos = Position.unpackCoord(coord);

        state.activeNpc.faceSquare(pos.x, pos.z);
    }),

    [ScriptOpcode.NPC_FINDEXACT]: (state) => {
        throw new Error('unimplemented');
    },

    [ScriptOpcode.NPC_FINDHERO]: checkedHandler(ActiveNpc, (state) => {
        const uid = state.activeNpc.findHero();
        if (uid === -1) {
            state.pushInt(0);
            return;
        }

        const player = World.getPlayer(uid);
        if (!player) {
            state.pushInt(0);
            return;
        }

        state.activePlayer = player;
        state.pointerAdd(ScriptPointer.ActivePlayer);
        state.pushInt(1);
    }),

    [ScriptOpcode.NPC_PARAM]: checkedHandler(ActiveNpc, (state) => {
        const paramId = state.popInt();
        const param = ParamType.get(paramId);
        const npc = NpcType.get(state.activeNpc.type);
        if (param.isString()) {
            state.pushString(ParamHelper.getStringParam(paramId, npc, param.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramId, npc, param.defaultInt));
        }
    }),

    [ScriptOpcode.NPC_QUEUE]: checkedHandler(ActiveNpc, (state) => {
        const delay = state.popInt();
        const arg = state.popInt();
        const queueId = state.popInt() - 1;
        if (queueId < 0 || queueId >= 20) {
            throw new Error(`Invalid ai_queue: ${queueId + 1}`);
        }

        const type = NpcType.get(state.activeNpc.type);
        const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE1 + queueId, type.id, type.category);
        if (script) {
            state.activeNpc.enqueueScript(script, delay, [arg]);
        }
    }),

    [ScriptOpcode.NPC_RANGE]: checkedHandler(ActiveNpc, (state) => {
        const coord = state.popInt();

        if (coord < 0 || coord > Position.max) {
            throw new Error(`NPC_RANGE attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const pos = Position.unpackCoord(coord);

        if (pos.level !== state.activeNpc.level) {
            state.pushInt(-1);
        } else {
            state.pushInt(Position.distanceTo(state.activeNpc, pos));
        }
    }),

    [ScriptOpcode.NPC_SAY]: checkedHandler(ActiveNpc, (state) => {
        state.activeNpc.say(state.popString());
    }),

    [ScriptOpcode.NPC_SETHUNT]: checkedHandler(ActiveNpc, (state) => {
        throw new Error('unimplemented');
    }),

    [ScriptOpcode.NPC_SETHUNTMODE]: checkedHandler(ActiveNpc, (state) => {
        const mode = state.popInt();
        
        if (mode === -1) {
            throw new Error('NPC_SETHUNTMODE attempted to use a hunt mode type that was null.');
        }

        const huntType = HuntType.get(mode);
        
        state.activeNpc.huntMode = huntType.id;
    }),

    [ScriptOpcode.NPC_SETMODE]: checkedHandler(ActiveNpc, (state) => {
        const mode = state.popInt();

        if (mode > NpcMode.APNPC5) {
            throw new Error('NPC_SETMODE attempted to use an npc mode that was null.');
        }

        state.activeNpc.mode = mode;
        state.activeNpc.clearWalkSteps();

        if (mode === NpcMode.NULL || mode === NpcMode.NONE || mode === NpcMode.WANDER || mode === NpcMode.PATROL) {
            state.activeNpc.resetInteraction();
            return;
        }

        let target: Player | Npc | Loc | Obj | null;
        if (mode >= NpcMode.OPNPC1) {
            target = state._activeNpc2;
        } else if (mode >= NpcMode.OPOBJ1) {
            target = state._activeObj;
        } else if (mode >= NpcMode.OPLOC1) {
            target = state._activeLoc;
        } else {
            target = state._activePlayer;
        }

        if (target) {
            state.activeNpc.resetInteraction();
            state.activeNpc.setInteraction(mode, target);
        } else {
            state.activeNpc.noMode();
        }
    }),

    [ScriptOpcode.NPC_STAT]: checkedHandler(ActiveNpc, (state) => {
        const stat = state.popInt();
        state.pushInt(state.activeNpc.levels[stat]);
    }),

    [ScriptOpcode.NPC_STATHEAL]: checkedHandler(ActiveNpc, (state) => {
        const [stat, constant, percent] = state.popInts(3);

        const npc = state.activeNpc;
        const base = npc.baseLevels[stat];
        const current = npc.levels[stat];
        const healed = current + (constant + (current * percent) / 100);
        npc.levels[stat] = Math.min(healed, base);

        // reset hero points if hp current == base
        if (stat === 0 && npc.levels[stat] === npc.baseLevels[stat]) {
            npc.resetHeroPoints();
        }
    }),

    [ScriptOpcode.NPC_TYPE]: checkedHandler(ActiveNpc, (state) => {
        state.pushInt(state.activeNpc.type);
    }),

    [ScriptOpcode.NPC_DAMAGE]: checkedHandler(ActiveNpc, (state) => {
        const amount = state.popInt();
        const type = state.popInt();

        state.activeNpc.applyDamage(amount, type);
    }),

    [ScriptOpcode.NPC_NAME]: checkedHandler(ActiveNpc, (state) => {
        const npcType = NpcType.get(state.activeNpc.type);

        state.pushString(npcType.name ?? 'null');
    }),

    [ScriptOpcode.NPC_UID]: checkedHandler(ActiveNpc, (state) => {
        const npc = state.activeNpc;
        state.pushInt((npc.type << 16) | npc.nid);
    }),

    [ScriptOpcode.NPC_SETTIMER]: checkedHandler(ActiveNpc, (state) => {
        const interval = state.popInt();

        state.activeNpc.setTimer(interval);
    }),

    [ScriptOpcode.SPOTANIM_NPC]: checkedHandler(ActiveNpc, (state) => {
        const delay = state.popInt();
        const height = state.popInt();
        const spotanim = state.popInt();

        state.activeNpc.spotanim(spotanim, height, delay);
    }),

    [ScriptOpcode.NPC_FINDALLZONE]: (state) => {
        const coord = state.popInt();

        if (coord < 0 || coord > Position.max) {
            throw new Error(`NPC_FINDALLZONE attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const pos = Position.unpackCoord(coord);

        state.npcFindAllZone = World.getZoneNpcs(pos.x, pos.z, pos.level);
        state.npcFindAllZoneIndex = 0;

        // not necessary but if we want to refer to the original npc again, we can
        if (state._activeNpc) {
            state._activeNpc2 = state._activeNpc;
            state.pointerAdd(ScriptPointer.ActiveNpc2);
        }
    },

    [ScriptOpcode.NPC_FINDNEXT]: (state) => {
        const npc = state.npcFindAllZone[state.npcFindAllZoneIndex++];

        if (npc) {
            state._activeNpc = npc;
            state.pointerAdd(ScriptPointer.ActiveNpc);
        }

        state.pushInt(npc ? 1 : 0);
    },

    [ScriptOpcode.NPC_TELE]: checkedHandler(ActiveNpc, (state) => {
        const coord = state.popInt();

        if (coord < 0 || coord > Position.max) {
            throw new Error(`NPC_TELE attempted to use coord that was out of range: ${coord}. Range should be: 0 to ${Position.max}`);
        }

        const pos = Position.unpackCoord(coord);

        state.activeNpc.teleport(pos.x, pos.z, pos.level);
    }),

    [ScriptOpcode.NPC_CHANGETYPE]: checkedHandler(ActiveNpc, (state) => {
        const id = state.popInt();
        state.activeNpc.changeType(id);
    }),

    [ScriptOpcode.NPC_GETMODE]: checkedHandler(ActiveNpc, (state) => {
        state.pushInt(state.activeNpc.mode);
    }),

    [ScriptOpcode.NPC_HEROPOINTS]: checkedHandler([ScriptPointer.ActivePlayer, ...ActiveNpc], (state) => {
        const damage = state.popInt();

        state.activeNpc.addHero(state.activePlayer.pid, damage);
    }),
};

export default NpcOps;
