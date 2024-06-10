import ParamType from '#lostcity/cache/config/ParamType.js';
import NpcType from '#lostcity/cache/config/NpcType.js';
import { ParamHelper } from '#lostcity/cache/config/ParamHelper.js';
import SpotanimType from '#lostcity/cache/config/SpotanimType.js';

import World from '#lostcity/engine/World.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import ScriptPointer, {ActiveNpc, checkedHandler} from '#lostcity/engine/script/ScriptPointer.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import {NpcIterator} from '#lostcity/engine/script/ScriptIterators.js';

import Loc from '#lostcity/entity/Loc.js';
import Obj from '#lostcity/entity/Obj.js';
import { Position } from '#lostcity/entity/Position.js';
import NpcIteratorType from '#lostcity/entity/NpcIteratorType.js';
import Npc from '#lostcity/entity/Npc.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import Entity from '#lostcity/entity/Entity.js';
import Interaction from '#lostcity/entity/Interaction.js';
import HuntVis from '#lostcity/entity/hunt/HuntVis.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

import Environment from '#lostcity/util/Environment.js';

import {
    check,
    CoordValid,
    DurationValid,
    HitTypeValid,
    HuntTypeValid,
    HuntVisValid,
    NpcModeValid,
    NpcStatValid,
    NpcTypeValid,
    NumberNotNull,
    ParamTypeValid,
    QueueValid,
    SpotAnimTypeValid
} from '#lostcity/engine/script/ScriptValidators.js';

const NpcOps: CommandHandlers = {
    [ScriptOpcode.NPC_FINDUID]: state => {
        const npcUid = state.popInt();
        const slot = npcUid & 0xffff;
        const expectedType = (npcUid >> 16) & 0xffff;
        const npc = World.getNpc(slot);

        if (!npc || npc.type !== expectedType) {
            state.pushInt(0);
            return;
        }

        state.activeNpc = npc;
        state.pointerAdd(ActiveNpc[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.NPC_ADD]: state => {
        const [coord, id, duration] = state.popInts(3);

        const position: Position = check(coord, CoordValid);
        const npcType: NpcType = check(id, NpcTypeValid);
        check(duration, DurationValid);

        const npc = new Npc(position.level, position.x, position.z, npcType.size, npcType.size, EntityLifeCycle.DESPAWN, World.getNextNid(), npcType.id, npcType.moverestrict, npcType.blockwalk);
        World.addNpc(npc, duration);
        state.activeNpc = npc;
        state.pointerAdd(ActiveNpc[state.intOperand]);
    },

    [ScriptOpcode.NPC_ANIM]: checkedHandler(ActiveNpc, state => {
        const delay = check(state.popInt(), NumberNotNull);
        const seq = state.popInt();

        state.activeNpc.playAnimation(seq, delay);
    }),

    [ScriptOpcode.NPC_BASESTAT]: checkedHandler(ActiveNpc, state => {
        const stat = check(state.popInt(), NpcStatValid);

        state.pushInt(state.activeNpc.baseLevels[stat]);
    }),

    [ScriptOpcode.NPC_CATEGORY]: checkedHandler(ActiveNpc, state => {
        state.pushInt(check(state.activeNpc.type, NpcTypeValid).category);
    }),

    [ScriptOpcode.NPC_COORD]: checkedHandler(ActiveNpc, state => {
        const position: Position = state.activeNpc;
        state.pushInt(Position.packCoord(position.level, position.x, position.z));
    }),

    [ScriptOpcode.NPC_DEL]: checkedHandler(ActiveNpc, state => {
        if (Environment.CLIRUNNER) {
            return;
        }

        World.removeNpc(state.activeNpc, check(state.activeNpc.type, NpcTypeValid).respawnrate);
    }),

    [ScriptOpcode.NPC_DELAY]: checkedHandler(ActiveNpc, state => {
        if (Environment.CLIRUNNER) {
            return;
        }

        state.activeNpc.delay = state.popInt() + 1;
        state.execution = ScriptState.NPC_SUSPENDED;
    }),

    [ScriptOpcode.NPC_FACESQUARE]: checkedHandler(ActiveNpc, state => {
        const position: Position = check(state.popInt(), CoordValid);

        state.activeNpc.faceSquare(position.x, position.z);
    }),

    [ScriptOpcode.NPC_FINDEXACT]: state => {
        const [coord, id] = state.popInts(2);

        const position: Position = check(coord, CoordValid);
        const npcType: NpcType = check(id, NpcTypeValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, 0, 0, NpcIteratorType.ZONE);

        for (const npc of state.npcIterator) {
            if (npc.type === npcType.id && npc.x === position.x && npc.level === position.level && npc.z === position.z) {
                state.activeNpc = npc;
                state.pointerAdd(ActiveNpc[state.intOperand]);
                state.pushInt(1);
                return;
            }
        }
        state.pushInt(0);
        return;
    },

    [ScriptOpcode.NPC_FINDHERO]: checkedHandler(ActiveNpc, state => {
        const uid = state.activeNpc.findHero();
        if (uid === -1) {
            state.pushInt(0);
            return;
        }

        const player = World.getPlayerByUid(uid);
        if (!player) {
            state.pushInt(0);
            return;
        }

        state.activePlayer = player;
        state.pointerAdd(ScriptPointer.ActivePlayer);
        state.pushInt(1);
    }),

    [ScriptOpcode.NPC_PARAM]: checkedHandler(ActiveNpc, state => {
        const paramType: ParamType = check(state.popInt(), ParamTypeValid);

        const npcType: NpcType = check(state.activeNpc.type, NpcTypeValid);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramType.id, npcType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramType.id, npcType, paramType.defaultInt));
        }
    }),

    [ScriptOpcode.NPC_QUEUE]: checkedHandler(ActiveNpc, state => {
        const delay = check(state.popInt(), NumberNotNull);
        const arg = state.popInt();
        const queueId = check(state.popInt(), QueueValid);

        const npcType: NpcType = check(state.activeNpc.type, NpcTypeValid);
        const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE1 + queueId - 1, npcType.id, npcType.category);
        if (script) {
            state.activeNpc.enqueueScript(script, delay, [arg]);
        }
    }),

    [ScriptOpcode.NPC_RANGE]: checkedHandler(ActiveNpc, state => {
        const position: Position = check(state.popInt(), CoordValid);

        const npc = state.activeNpc;
        if (position.level !== npc.level) {
            state.pushInt(-1);
        } else {
            state.pushInt(
                Position.distanceTo(npc, {
                    x: position.x,
                    z: position.z,
                    width: 1,
                    length: 1
                })
            );
        }
    }),

    [ScriptOpcode.NPC_SAY]: checkedHandler(ActiveNpc, state => {
        state.activeNpc.say(state.popString());
    }),

    [ScriptOpcode.NPC_SETHUNT]: checkedHandler(ActiveNpc, state => {
        state.activeNpc.huntrange = check(state.popInt(), NumberNotNull);
    }),

    [ScriptOpcode.NPC_SETHUNTMODE]: checkedHandler(ActiveNpc, state => {
        state.activeNpc.huntMode = check(state.popInt(), HuntTypeValid).id;
    }),

    [ScriptOpcode.NPC_SETMODE]: checkedHandler(ActiveNpc, state => {
        const mode = check(state.popInt(), NpcModeValid);
        state.activeNpc.clearWaypoints();

        if (mode === NpcMode.NULL || mode === NpcMode.NONE || mode === NpcMode.WANDER || mode === NpcMode.PATROL) {
            state.activeNpc.clearInteraction();
            state.activeNpc.targetOp = mode;
            return;
        }
        
        state.activeNpc.targetOp = mode;
        let target: Entity | null;
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
            if (target instanceof Npc || target instanceof Obj || target instanceof Loc) {
                state.activeNpc.setInteraction(Interaction.SCRIPT, target, mode, {type: target.type, com: -1});
            } else {
                state.activeNpc.setInteraction(Interaction.SCRIPT, target, mode);
            }
        } else {
            state.activeNpc.noMode();
        }
    }),

    [ScriptOpcode.NPC_STAT]: checkedHandler(ActiveNpc, state => {
        const stat = check(state.popInt(), NpcStatValid);

        state.pushInt(state.activeNpc.levels[stat]);
    }),

    [ScriptOpcode.NPC_STATHEAL]: checkedHandler(ActiveNpc, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, NpcStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

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

    [ScriptOpcode.NPC_TYPE]: checkedHandler(ActiveNpc, state => {
        state.pushInt(check(state.activeNpc.type, NpcTypeValid).id);
    }),

    [ScriptOpcode.NPC_DAMAGE]: checkedHandler(ActiveNpc, state => {
        const amount = check(state.popInt(), NumberNotNull);
        const type = check(state.popInt(), HitTypeValid);

        state.activeNpc.applyDamage(amount, type);
    }),

    [ScriptOpcode.NPC_NAME]: checkedHandler(ActiveNpc, state => {
        state.pushString(check(state.activeNpc.type, NpcTypeValid).name ?? 'null');
    }),

    [ScriptOpcode.NPC_UID]: checkedHandler(ActiveNpc, state => {
        state.pushInt(state.activeNpc.uid);
    }),

    [ScriptOpcode.NPC_SETTIMER]: checkedHandler(ActiveNpc, state => {
        state.activeNpc.setTimer(check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.SPOTANIM_NPC]: checkedHandler(ActiveNpc, state => {
        const delay = check(state.popInt(), NumberNotNull);
        const height = check(state.popInt(), NumberNotNull);
        const spotanimType: SpotanimType = check(state.popInt(), SpotAnimTypeValid);

        state.activeNpc.spotanim(spotanimType.id, height, delay);
    }),

    [ScriptOpcode.NPC_FIND]: state => {
        const [coord, npc, distance, checkVis] = state.popInts(4);

        const position: Position = check(coord, CoordValid);
        const npcType: NpcType = check(npc, NpcTypeValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        let closestNpc;
        let closestDistance = distance;

        const npcs = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE);

        for (const npc of npcs) {
            if(npc && npc.type === npcType.id) {
                const npcDistance = Position.distanceToSW(position, npc);
                if (npcDistance <= closestDistance) {
                    closestNpc = npc;
                    closestDistance = npcDistance;
                }
            }
        }
        if (!closestNpc) {
            state.pushInt(0);
            return;
        }
        // not necessary but if we want to refer to the original npc again, we can
        state.activeNpc = closestNpc;
        state.pointerAdd(ActiveNpc[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.NPC_FINDALLANY]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: Position = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE);
        // not necessary but if we want to refer to the original npc again, we can
        if (state._activeNpc) {
            state._activeNpc2 = state._activeNpc;
            state.pointerAdd(ScriptPointer.ActiveNpc2);
        }
    },

    [ScriptOpcode.NPC_FINDALLZONE]: state => {
        const position: Position = check(state.popInt(), CoordValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, 0, 0, NpcIteratorType.ZONE);
        // not necessary but if we want to refer to the original npc again, we can
        if (state._activeNpc) {
            state._activeNpc2 = state._activeNpc;
            state.pointerAdd(ScriptPointer.ActiveNpc2);
        }
    },

    [ScriptOpcode.NPC_FINDNEXT]: state => {
        const result = state.npcIterator?.next();
        if (!result || result.done) {
            // no more npcs in zone
            state.pushInt(0);
            return;
        }

        state.activeNpc = result.value;
        state.pointerAdd(ActiveNpc[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.NPC_TELE]: checkedHandler(ActiveNpc, state => {
        const position: Position = check(state.popInt(), CoordValid);

        state.activeNpc.teleport(position.x, position.z, position.level);
    }),

    [ScriptOpcode.NPC_WALK]: checkedHandler(ActiveNpc, state => {
        const position: Position = check(state.popInt(), CoordValid);

        state.activeNpc.queueWaypoint(position.x, position.z);
    }),

    [ScriptOpcode.NPC_CHANGETYPE]: checkedHandler(ActiveNpc, state => {
        state.activeNpc.changeType(check(state.popInt(), NpcTypeValid).id);
    }),

    [ScriptOpcode.NPC_GETMODE]: checkedHandler(ActiveNpc, state => {
        state.pushInt(state.activeNpc.targetOp);
    }),

    [ScriptOpcode.NPC_HEROPOINTS]: checkedHandler([ScriptPointer.ActivePlayer, ...ActiveNpc], state => {
        state.activeNpc.addHero(state.activePlayer.uid, check(state.popInt(), NumberNotNull));
    }),

    [ScriptOpcode.NPC_WALKTRIGGER]: checkedHandler(ActiveNpc, state => {
        const [queueId, arg] = state.popInts(2);

        check(queueId, QueueValid);

        state.activeNpc.walktrigger = queueId - 1;
        state.activeNpc.walktriggerArg = arg;
    }),

    [ScriptOpcode.NPC_STATADD]: checkedHandler(ActiveNpc, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, NpcStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const npc = state.activeNpc;
        const current = npc.levels[stat];
        const added = current + (constant + (current * percent) / 100);
        npc.levels[stat] = Math.min(added, 255);

        if (stat === 0 && npc.levels[stat] >= npc.baseLevels[stat]) {
            npc.resetHeroPoints();
        }
    }),

    [ScriptOpcode.NPC_STATSUB]: checkedHandler(ActiveNpc, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, NpcStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const npc = state.activeNpc;
        const current = npc.levels[stat];
        const subbed = current - (constant + (current * percent) / 100);
        npc.levels[stat] = Math.max(subbed, 0);
    }),

    // https://twitter.com/JagexAsh/status/1614498680144527360
    [ScriptOpcode.NPC_ATTACKRANGE]: checkedHandler(ActiveNpc, state => {
        state.pushInt(check(state.activeNpc.type, NpcTypeValid).attackrange);
    }),
};

export default NpcOps;
