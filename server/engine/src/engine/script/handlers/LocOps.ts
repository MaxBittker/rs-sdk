import { LocAngle, LocShape, locShapeLayer } from '#/engine/routefinder/index.js';

import LocType from '#/cache/config/LocType.js';
import { ParamHelper } from '#/cache/config/ParamHelper.js';
import ParamType from '#/cache/config/ParamType.js';
import SeqType from '#/cache/config/SeqType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import Loc from '#/engine/entity/Loc.js';
import { LocIterator } from '#/engine/script/ScriptIterators.js';
import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';
import { ActiveLoc, checkedHandler } from '#/engine/script/ScriptPointer.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import { check, CoordValid, DurationValid, LocAngleValid, LocShapeValid, LocTypeValid, ParamTypeValid, SeqTypeValid } from '#/engine/script/ScriptValidators.js';
import World from '#/engine/World.js';

const LocOps: CommandHandlers = {
    [ScriptOpcode.LOC_ADD]: state => {
        const [coord, type, angle, shape, duration] = state.popInts(5);

        const position: CoordGrid = check(coord, CoordValid);
        const locType: LocType = check(type, LocTypeValid);
        const locAngle: LocAngle = check(angle, LocAngleValid);
        const locShape: LocShape = check(shape, LocShapeValid);
        const locLayer = locShapeLayer(locShape);
        check(duration, DurationValid);

        // Search through zone and change a loc if it's on the same layer
        const locs: IterableIterator<Loc> = World.gameMap.getZone(position.x, position.z, position.level).getLocsUnsafe(CoordGrid.packZoneCoord(position.x, position.z));
        for (const loc of locs) {
            if (loc.layer === locLayer) {
                World.changeLoc(loc, type, locShape, locAngle, duration);
                state.activeLoc = loc;
                state.pointerAdd(ActiveLoc[state.intOperand]);
                return;
            }
        }

        const created: Loc = new Loc(position.level, position.x, position.z, locType.width, locType.length, EntityLifeCycle.DESPAWN, locType.id, locShape, locAngle);
        World.addLoc(created, duration);
        state.activeLoc = created;
        state.pointerAdd(ActiveLoc[state.intOperand]);
    },

    [ScriptOpcode.LOC_ANGLE]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.angle, LocAngleValid));
    }),

    // https://x.com/JagexAsh/status/1773801749175812307
    [ScriptOpcode.LOC_ANIM]: checkedHandler(ActiveLoc, state => {
        const seqType: SeqType = check(state.popInt(), SeqTypeValid);

        World.animLoc(state.activeLoc, seqType.id);
    }),

    [ScriptOpcode.LOC_CATEGORY]: checkedHandler(ActiveLoc, state => {
        state.pushInt(check(state.activeLoc.type, LocTypeValid).category);
    }),

    [ScriptOpcode.LOC_CHANGE]: checkedHandler(ActiveLoc, state => {
        const [id, duration] = state.popInts(2);

        check(duration, DurationValid);
        check(id, LocTypeValid);

        World.changeLoc(state.activeLoc, id, state.activeLoc.shape, state.activeLoc.angle, duration);
    }),

    [ScriptOpcode.LOC_COORD]: checkedHandler(ActiveLoc, state => {
        const coord: CoordGrid = state.activeLoc;
        state.pushInt(CoordGrid.packCoord(coord.level, coord.x, coord.z));
    }),

    [ScriptOpcode.LOC_DEL]: checkedHandler(ActiveLoc, state => {
        const duration: number = check(state.popInt(), DurationValid);
        World.removeLoc(state.activeLoc, duration);
    }),

    [ScriptOpcode.LOC_FIND]: state => {
        const [coord, locId] = state.popInts(2);

        const locType: LocType = check(locId, LocTypeValid);
        const position: CoordGrid = check(coord, CoordValid);

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
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.locIterator = new LocIterator(World.currentTick, coord.level, coord.x, coord.z);
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
