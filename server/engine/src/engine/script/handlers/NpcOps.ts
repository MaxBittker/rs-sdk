import NpcType from '#/cache/config/NpcType.js';
import { ParamHelper } from '#/cache/config/ParamHelper.js';
import ParamType from '#/cache/config/ParamType.js';
import SpotanimType from '#/cache/config/SpotanimType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import Entity from '#/engine/entity/Entity.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import { HuntVis } from '#/engine/entity/hunt/HuntVis.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import Loc from '#/engine/entity/Loc.js';
import Npc from '#/engine/entity/Npc.js';
import { NpcIteratorType } from '#/engine/entity/NpcIteratorType.js';
import { NpcMode } from '#/engine/entity/NpcMode.js';
import { NpcStat } from '#/engine/entity/NpcStat.js';
import Obj from '#/engine/entity/Obj.js';
import { NpcHuntAllCommandIterator, NpcIterator } from '#/engine/script/ScriptIterators.js';
import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';
import ScriptPointer, { ActiveNpc, ActivePlayer, checkedHandler } from '#/engine/script/ScriptPointer.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import {
    CategoryTypeValid,
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
} from '#/engine/script/ScriptValidators.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';

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

        const position: CoordGrid = check(coord, CoordValid);
        const npcType: NpcType = check(id, NpcTypeValid);
        check(duration, DurationValid);

        const npc = new Npc(position.level, position.x, position.z, npcType.size, npcType.size, EntityLifeCycle.DESPAWN, World.getNextNid(), npcType.id, npcType.blockwalk);
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

    // https://x.com/JagexAsh/status/1821835323808026853
    [ScriptOpcode.NPC_COORD]: checkedHandler(ActiveNpc, state => {
        const coord: CoordGrid = state.activeNpc;
        state.pushInt(CoordGrid.packCoord(coord.level, coord.x, coord.z));
    }),

    [ScriptOpcode.NPC_DEL]: checkedHandler(ActiveNpc, state => {
        World.removeNpc(state.activeNpc, check(state.activeNpc.type, NpcTypeValid).respawnrate);
    }),

    [ScriptOpcode.NPC_DELAY]: checkedHandler(ActiveNpc, state => {
        state.activeNpc.delayed = true;
        state.activeNpc.delayedUntil = World.currentTick + 1 + check(state.popInt(), NumberNotNull);
        state.execution = ScriptState.NPC_SUSPENDED;
    }),

    [ScriptOpcode.NPC_FACESQUARE]: checkedHandler(ActiveNpc, state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.activeNpc.faceSquare(coord.x, coord.z);
    }),

    [ScriptOpcode.NPC_FINDEXACT]: state => {
        const [coord, id] = state.popInts(2);

        const position: CoordGrid = check(coord, CoordValid);
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
        const hash64 = state.activeNpc.heroPoints.findHero();
        if (hash64 === -1n) {
            state.pushInt(0);
            return;
        }

        const player = World.getPlayerByHash64(hash64);
        if (!player) {
            state.pushInt(0);
            return;
        }

        state.activePlayer = player;
        state.pointerAdd(ActivePlayer[state.intOperand]);
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

    // https://x.com/JagexAsh/status/1570357528172859392
    [ScriptOpcode.NPC_QUEUE]: checkedHandler(ActiveNpc, state => {
        const delay = check(state.popInt(), NumberNotNull);
        const arg = state.popInt();
        const queueId = check(state.popInt(), QueueValid);

        state.activeNpc.enqueueScript(ServerTriggerType.AI_QUEUE1 + queueId - 1, delay, arg);
    }),

    [ScriptOpcode.NPC_RANGE]: checkedHandler(ActiveNpc, state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const npc = state.activeNpc;
        if (coord.level !== npc.level) {
            state.pushInt(-1);
        } else {
            state.pushInt(
                CoordGrid.distanceTo(npc, {
                    x: coord.x,
                    z: coord.z,
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
        // TODO is this authentic? or is there npc_clearhuntmode (or similar)?
        const huntTypeId = state.popInt();

        if (huntTypeId === -1) {
            state.activeNpc.huntMode = -1;
        } else {
            state.activeNpc.huntMode = check(huntTypeId, HuntTypeValid).id;
        }
    }),

    // https://x.com/JagexAsh/status/1795184135327089047
    // https://x.com/JagexAsh/status/1821835323808026853
    [ScriptOpcode.NPC_SETMODE]: checkedHandler(ActiveNpc, state => {
        const mode = check(state.popInt(), NpcModeValid);

        if (mode === NpcMode.NONE || mode === NpcMode.WANDER || mode === NpcMode.PATROL) {
            state.activeNpc.clearInteraction();
            state.activeNpc.targetOp = mode;
            if (mode === NpcMode.PATROL) {
                state.activeNpc.clearPatrol();
            }
            return;
        } else if (mode === NpcMode.NULL) {
            state.activeNpc.resetDefaults();
            return;
        }
        state.activeNpc.targetOp = mode;
        let target: Entity | null;
        if (mode >= NpcMode.OPNPC1) {
            if (state.intOperand === 0) {
                target = state._activeNpc2;
            } else {
                target = state._activeNpc;
            }
        } else if (mode >= NpcMode.OPOBJ1) {
            target = state._activeObj;
        } else if (mode >= NpcMode.OPLOC1) {
            target = state._activeLoc;
        } else {
            target = state._activePlayer;
        }

        if (target) {
            if (target instanceof Npc || target instanceof Obj || target instanceof Loc) {
                state.activeNpc.setInteraction(Interaction.SCRIPT, target, mode);
            } else {
                state.activeNpc.setInteraction(Interaction.SCRIPT, target, mode);
            }
        }
        // There wasn't an active entity to target
        else {
            state.activeNpc.resetDefaults();
            return;
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
        const healed = current + ((constant + (base * percent) / 100) | 0);
        npc.levels[stat] = Math.min(healed, base);

        if (stat === NpcStat.HITPOINTS && npc.levels[stat] >= npc.baseLevels[stat]) {
            npc.heroPoints.clear();
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

    [ScriptOpcode.NPC_HUNT]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        // const npcType: NpcType = check(npc, NpcTypeValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        let closestNpc: Npc | null = null;
        let closestDistance = Number.MAX_SAFE_INTEGER;

        const npcs = new NpcHuntAllCommandIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis);

        for (const npc of npcs) {
            if (npc) {
                // Picks the smallest euclidean distance
                const npcDistance = CoordGrid.euclideanSquaredDistance(position, npc);
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

        state.activeNpc = closestNpc;
        state.pointerAdd(ActiveNpc[state.intOperand]);
        state.pushInt(1);
    },

    // https://x.com/JagexAsh/status/1796460129430433930
    // https://x.com/JagexAsh/status/1821236327150710829
    [ScriptOpcode.NPC_HUNTALL]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.npcIterator = new NpcHuntAllCommandIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis);
    },

    // https://x.com/JagexAsh/status/1796460129430433930
    [ScriptOpcode.NPC_FIND]: state => {
        const [coord, npc, distance, checkVis] = state.popInts(4);

        const position: CoordGrid = check(coord, CoordValid);
        const npcType: NpcType = check(npc, NpcTypeValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        let closestNpc;
        let closestDistance = Number.MAX_SAFE_INTEGER;

        const npcs = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE);

        for (const npc of npcs) {
            if (npc && npc.type === npcType.id) {
                // Picks the smallest euclidean distance
                const npcDistance = CoordGrid.euclideanSquaredDistance(position, npc);
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

        state.activeNpc = closestNpc;
        state.pointerAdd(ActiveNpc[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.NPC_FINDCAT]: state => {
        const [coord, npcCategory, distance, checkVis] = state.popInts(4);

        const position: CoordGrid = check(coord, CoordValid);
        check(npcCategory, CategoryTypeValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        let closestNpc;
        let closestDistance = Number.MAX_SAFE_INTEGER;

        const npcs = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE);

        for (const npc of npcs) {
            if (npc && NpcType.get(npc.type).category === npcCategory) {
                // Picks the smallest euclidean distance
                const npcDistance = CoordGrid.euclideanSquaredDistance(position, npc);
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

        state.activeNpc = closestNpc;
        state.pointerAdd(ActiveNpc[state.intOperand]);
        state.pushInt(1);
    },

    // https://x.com/JagexAsh/status/1796878374398246990
    [ScriptOpcode.NPC_FINDALLANY]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE);
    },

    [ScriptOpcode.NPC_FINDALL]: state => {
        const [coord, npc, distance, checkVis] = state.popInts(4);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const npcType: NpcType = check(npc, NpcTypeValid);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE, npcType);
    },

    [ScriptOpcode.NPC_FINDALLZONE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.npcIterator = new NpcIterator(World.currentTick, coord.level, coord.x, coord.z, 0, 0, NpcIteratorType.ZONE);
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
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.activeNpc.teleport(coord.x, coord.z, coord.level);
    }),

    // https://x.com/JagexAsh/status/1821835323808026853
    // https://x.com/JagexAsh/status/1780932943038345562
    [ScriptOpcode.NPC_WALK]: checkedHandler(ActiveNpc, state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.activeNpc.queueWaypoint(coord.x, coord.z);
    }),

    [ScriptOpcode.NPC_CHANGETYPE]: checkedHandler(ActiveNpc, state => {
        const [id, duration] = state.popInts(2);
        const npcType: number = check(id, NpcTypeValid).id;
        check(duration, DurationValid);

        state.activeNpc.changeType(npcType, duration);
    }),

    [ScriptOpcode.NPC_CHANGETYPE_KEEPALL]: checkedHandler(ActiveNpc, state => {
        const [id, duration] = state.popInts(2);
        const npcType: number = check(id, NpcTypeValid).id;
        check(duration, DurationValid);

        state.activeNpc.changeType(npcType, duration, false);
    }),

    [ScriptOpcode.NPC_GETMODE]: checkedHandler(ActiveNpc, state => {
        state.pushInt(state.activeNpc.targetOp);
    }),

    // https://x.com/JagexAsh/status/1704492467226091853
    [ScriptOpcode.NPC_HEROPOINTS]: checkedHandler([ScriptPointer.ActivePlayer, ...ActiveNpc], state => {
        state.activeNpc.heroPoints.addHero(state.activePlayer.hash64, check(state.popInt(), NumberNotNull));
    }),

    // https://x.com/JagexAsh/status/1780932943038345562
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
        const base = npc.baseLevels[stat];
        const current = npc.levels[stat];
        const added = current + ((constant + (base * percent) / 100) | 0);
        npc.levels[stat] = Math.min(added, 255);
    }),

    [ScriptOpcode.NPC_STATSUB]: checkedHandler(ActiveNpc, state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, NpcStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const npc = state.activeNpc;
        const base = npc.baseLevels[stat];
        const current = npc.levels[stat];
        const subbed = current - ((constant + (base * percent) / 100) | 0);
        npc.levels[stat] = Math.max(subbed, 0);
    }),

    // https://twitter.com/JagexAsh/status/1614498680144527360
    [ScriptOpcode.NPC_ATTACKRANGE]: checkedHandler(ActiveNpc, state => {
        state.pushInt(check(state.activeNpc.type, NpcTypeValid).attackrange);
    }),

    // https://x.com/JagexAsh/status/1821492251429679257
    [ScriptOpcode.NPC_HASOP]: checkedHandler(ActiveNpc, state => {
        const op = state.popInt();

        check(op, NumberNotNull);

        const npcType: NpcType = NpcType.get(state.activeNpc.type);

        if (!npcType.op) {
            state.pushInt(0);
            return;
        }

        state.pushInt(npcType.op[op - 1] ? 1 : 0);
    }),

    // https://x.com/JagexAsh/status/1432296606376906752
    [ScriptOpcode.NPC_ARRIVEDELAY]: checkedHandler(ActiveNpc, state => {
        if (state.activeNpc.lastMovement < World.currentTick - 1) {
            return;
        }
        // If npc moved 1 tick ago, delay for 1 tick. If npc moved this tick, delay for 2 ticks
        state.activeNpc.delayed = true;
        if (state.activeNpc.lastMovement === World.currentTick - 1) {
            state.activeNpc.delayedUntil = World.currentTick + 1;
        } else {
            state.activeNpc.delayedUntil = World.currentTick + 2;
        }

        state.execution = ScriptState.NPC_SUSPENDED;
    }),
    [ScriptOpcode.NPC_INRANGE]: checkedHandler(ActiveNpc, state => {
        state.pushInt(state.activeNpc.targetWithinMaxRange() ? 1 : 0);
    }),

    [ScriptOpcode.NPC_DESTINATION]: checkedHandler(ActiveNpc, state => {
        if (!state.activeNpc.hasWaypoints()) {
            state.pushInt(state.activeNpc.coord);
            return;
        }
        state.pushInt(state.activeNpc.waypoints[0]);
    })
};

export default NpcOps;
