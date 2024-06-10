import ParamType from '#lostcity/cache/config/ParamType.js';
import LocType from '#lostcity/cache/config/LocType.js';
import SeqType from '#lostcity/cache/config/SeqType.js';
import { ParamHelper } from '#lostcity/cache/config/ParamHelper.js';

import World from '#lostcity/engine/World.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import ScriptPointer, {ActiveLoc, checkedHandler} from '#lostcity/engine/script/ScriptPointer.js';
import { CommandHandlers } from '#lostcity/engine/script/ScriptRunner.js';
import {LocIterator} from '#lostcity/engine/script/ScriptIterators.js';
import Zone from '#lostcity/engine/zone/Zone.js';

import Loc from '#lostcity/entity/Loc.js';
import { Position } from '#lostcity/entity/Position.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

import {
    check,
    CoordValid,
    DurationValid,
    LocAngleValid,
    LocShapeValid,
    LocTypeValid,
    ParamTypeValid,
    SeqTypeValid
} from '#lostcity/engine/script/ScriptValidators.js';

import {LocAngle, LocShape} from '@2004scape/rsmod-pathfinder';

const LocOps: CommandHandlers = {
    [ScriptOpcode.LOC_ADD]: state => {
        const [coord, type, angle, shape, duration] = state.popInts(5);

        const position: Position = check(coord, CoordValid);
        const locType: LocType = check(type, LocTypeValid);
        const locAngle: LocAngle = check(angle, LocAngleValid);
        const locShape: LocShape = check(shape, LocShapeValid);
        check(duration, DurationValid);

        const zone: Zone = World.getZone(position.x, position.z, position.level);

        let loc: Loc;
        const staticLoc: number = zone.staticLocs.findIndex(loc => loc.type === locType.id && loc.angle === locAngle && loc.shape === locShape && loc.x === position.x && loc.z === position.z && !loc.checkLifeCycle(World.currentTick));
        if (staticLoc === -1) {
            loc = new Loc(position.level, position.x, position.z, locType.width, locType.length, EntityLifeCycle.DESPAWN, locType.id, locShape, locAngle);
            World.addLoc(loc, duration);
        } else {
            loc = zone.staticLocs[staticLoc];
            World.addLoc(loc, -1);
        }

        state.activeLoc = loc;
        state.pointerAdd(ActiveLoc[state.intOperand]);
    },

    [ScriptOpcode.LOC_ANGLE]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.angle, LocAngleValid));
    }),

    [ScriptOpcode.LOC_ANIM]: checkedHandler(ActiveLoc, state => {
        const seqType: SeqType = check(state.popInt(), SeqTypeValid);

        const loc = state.activeLoc;
        World.getZone(loc.x, loc.z, loc.level).animLoc(loc, seqType.id);
    }),

    [ScriptOpcode.LOC_CATEGORY]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.type, LocTypeValid).category);
    }),

    [ScriptOpcode.LOC_CHANGE]: checkedHandler(ActiveLoc, state => {
        const [id, duration] = state.popInts(2);

        const locType: LocType = check(id, LocTypeValid);
        check(duration, DurationValid);

        World.removeLoc(state.activeLoc, duration);

        const loc = new Loc(state.activeLoc.level, state.activeLoc.x, state.activeLoc.z, locType.width, locType.length, EntityLifeCycle.DESPAWN, id, state.activeLoc.shape, state.activeLoc.angle);
        World.addLoc(loc, duration);
        state.activeLoc = loc;
        state.pointerAdd(ActiveLoc[state.intOperand]);
    }),

    [ScriptOpcode.LOC_COORD]: checkedHandler(ActiveLoc, state => {
        const position: Position = state.activeLoc;
        state.pushInt(Position.packCoord(position.level, position.x, position.z));
    }),

    [ScriptOpcode.LOC_DEL]: checkedHandler(ActiveLoc, state => {
        World.removeLoc(state.activeLoc, check(state.popInt(), DurationValid));
    }),

    [ScriptOpcode.LOC_FIND]: state => {
        const [coord, locId] = state.popInts(2);

        const locType: LocType = check(locId, LocTypeValid);
        const position: Position = check(coord, CoordValid);

        const loc = World.getLoc(position.x, position.z, position.level, locType.id);
        if (!loc) {
            state.pushInt(0);
            return;
        }

        state.activeLoc = loc;
        state.pointerAdd(ActiveLoc[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.LOC_FINDALLZONE]: state => {
        const position: Position = check(state.popInt(), CoordValid);

        state.locIterator = new LocIterator(World.currentTick, position.level, position.x, position.z);
        // not necessary but if we want to refer to the original loc again, we can
        if (state._activeLoc) {
            state._activeLoc2 = state._activeLoc;
            state.pointerAdd(ScriptPointer.ActiveLoc2);
        }
    },

    [ScriptOpcode.LOC_FINDNEXT]: state => {
        const result = state.locIterator?.next();
        if (!result || result.done) {
            state.pushInt(0);
            return;
        }

        state.activeLoc = result.value;
        state.pointerAdd(ActiveLoc[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.LOC_PARAM]: checkedHandler(ActiveLoc, state => {
        const paramType: ParamType = check(state.popInt(), ParamTypeValid);

        const locType: LocType = check(state.activeLoc.type, LocTypeValid);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramType.id, locType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramType.id, locType, paramType.defaultInt));
        }
    }),

    [ScriptOpcode.LOC_TYPE]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.type, LocTypeValid).id);
    }),

    [ScriptOpcode.LOC_NAME]: checkedHandler(ActiveLoc, state => {
        state.pushString(check(state.activeLoc.type, LocTypeValid).name ?? 'null');
    }),

    [ScriptOpcode.LOC_SHAPE]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.shape, LocShapeValid));
    })
};

export default LocOps;
