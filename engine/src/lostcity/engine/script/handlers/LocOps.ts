import ParamType from '#lostcity/cache/config/ParamType.js';
import LocType from '#lostcity/cache/config/LocType.js';
import SeqType from '#lostcity/cache/config/SeqType.js';
import {ParamHelper} from '#lostcity/cache/config/ParamHelper.js';

import World from '#lostcity/engine/World.js';

import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import ScriptPointer, {ActiveLoc, checkedHandler} from '#lostcity/engine/script/ScriptPointer.js';
import {CommandHandlers} from '#lostcity/engine/script/ScriptRunner.js';
import {LocIterator} from '#lostcity/engine/script/ScriptIterators.js';

import Loc from '#lostcity/entity/Loc.js';
import {Position} from '#lostcity/entity/Position.js';
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

        const created: Loc = new Loc(position.level, position.x, position.z, locType.width, locType.length, EntityLifeCycle.DESPAWN, locType.id, locShape, locAngle);
        const locs: IterableIterator<Loc> = World.getZone(position.x, position.z, position.level).getLocsUnsafe(Position.packZoneCoord(position.x, position.z));
        for (const loc of locs) {
            if (loc !== created && loc.angle === locAngle && loc.shape === locShape) {
                World.removeLoc(loc, duration);
                break;
            }
        }
        World.addLoc(created, duration);
        state.activeLoc = created;
        state.pointerAdd(ActiveLoc[state.intOperand]);
    },

    [ScriptOpcode.LOC_ANGLE]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.angle, LocAngleValid));
    }),

    [ScriptOpcode.LOC_ANIM]: checkedHandler(ActiveLoc, state => {
        const seqType: SeqType = check(state.popInt(), SeqTypeValid);

        World.animLoc(state.activeLoc, seqType.id);
    }),

    [ScriptOpcode.LOC_CATEGORY]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.type, LocTypeValid).category);
    }),

    [ScriptOpcode.LOC_CHANGE]: checkedHandler(ActiveLoc, state => {
        const [id, duration] = state.popInts(2);

        const locType: LocType = check(id, LocTypeValid);
        check(duration, DurationValid);

        World.removeLoc(state.activeLoc, duration);

        // const loc = new Loc(state.activeLoc.level, state.activeLoc.x, state.activeLoc.z, locType.width, locType.length, EntityLifeCycle.DESPAWN, id, state.activeLoc.shape, state.activeLoc.angle);
        // World.addLoc(loc, duration);

        const {level, x, z, angle, shape} = state.activeLoc;
        const locs: IterableIterator<Loc> = World.getZone(x, z, level).getLocsUnsafe(Position.packZoneCoord(x, z));
        let found: Loc | null = null;
        for (const loc of locs) {
            if (loc.type === locType.id && loc.angle === angle && loc.shape === shape && loc.lifecycle === EntityLifeCycle.RESPAWN) {
                found = loc;
                World.addLoc(loc, 0);
                break;
            }
        }
        if (!found) {
            found = new Loc(level, x, z, locType.width, locType.length, EntityLifeCycle.DESPAWN, locType.id, shape, angle);
            World.addLoc(found, duration);
        }

        state.activeLoc = found;
        state.pointerAdd(ActiveLoc[state.intOperand]);
    }),

    [ScriptOpcode.LOC_COORD]: checkedHandler(ActiveLoc, state => {
        const position: Position = state.activeLoc;
        state.pushInt(Position.packCoord(position.level, position.x, position.z));
    }),

    [ScriptOpcode.LOC_DEL]: checkedHandler(ActiveLoc, state => {
        const duration: number = check(state.popInt(), DurationValid);

        const {level, x, z, angle, shape} = state.activeLoc;
        const locs: IterableIterator<Loc> = World.getZone(x, z, level).getLocsUnsafe(Position.packZoneCoord(x, z));
        for (const loc of locs) {
            if (loc !== state.activeLoc && loc.angle === angle && loc.shape === shape) {
                World.removeLoc(loc, duration);
                break;
            }
        }
        World.removeLoc(state.activeLoc, duration);
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
