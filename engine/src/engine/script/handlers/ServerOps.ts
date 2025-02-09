import { ParamHelper } from '#/cache/config/ParamHelper.js';
import ParamType from '#/cache/config/ParamType.js';
import StructType from '#/cache/config/StructType.js';
import SpotanimType from '#/cache/config/SpotanimType.js';
import MesanimType from '#/cache/config/MesanimType.js';

import World from '#/engine/World.js';

import ScriptOpcode from '#/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import {ActiveNpc, ActivePlayer} from '#/engine/script/ScriptPointer.js';
import {HuntIterator, NpcHuntAllCommandIterator} from '#/engine/script/ScriptIterators.js';

import { CoordGrid } from '#/engine/CoordGrid.js';
import MapFindSqaureType from '#/engine/entity/MapFindSquareType.js';
import HuntModeType from '#/engine/entity/hunt/HuntModeType.js';
import Player from '#/engine/entity/Player.js';
import Npc from '#/engine/entity/Npc.js';
import HuntVis from '#/engine/entity/hunt/HuntVis.js';

import Environment from '#/util/Environment.js';

import { LocLayer, LocAngle } from '@2004scape/rsmod-pathfinder';

import {
    isIndoors,
    isLineOfSight,
    isLineOfWalk,
    isMapBlocked,
    layerForLocShape
} from '#/engine/GameMap.js';

import {
    check,
    CoordValid,
    FontTypeValid,
    HuntVisValid,
    LocTypeValid,
    MesanimValid,
    NumberNotNull,
    NumberPositive,
    ParamTypeValid,
    SeqTypeValid,
    SpotAnimTypeValid,
    StructTypeValid,
    FindSquareValid
} from '#/engine/script/ScriptValidators.js';

const ServerOps: CommandHandlers = {
    [ScriptOpcode.MAP_CLOCK]: state => {
        state.pushInt(World.currentTick);
    },

    [ScriptOpcode.MAP_MEMBERS]: state => {
        state.pushInt(Environment.NODE_MEMBERS ? 1 : 0);
    },

    [ScriptOpcode.MAP_PLAYERCOUNT]: state => {
        const [c1, c2] = state.popInts(2);

        const from: CoordGrid = check(c1, CoordValid);
        const to: CoordGrid = check(c2, CoordValid);
    
        let count = 0;
        for (let x = Math.floor(from.x / 8); x <= Math.ceil(to.x / 8); x++) {
            for (let z = Math.floor(from.z / 8); z <= Math.ceil(to.z / 8); z++) {
                for (const player of World.gameMap.getZone(x << 3, z << 3, from.level).getAllPlayersSafe()) {
                    if (player.x >= from.x && player.x <= to.x && player.z >= from.z && player.z <= to.z) {
                        count++;
                    }
                }
            }
        }
    
        state.pushInt(count);
    },

    [ScriptOpcode.HUNTALL]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.huntIterator = new HuntIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, -1, -1, HuntModeType.PLAYER);
    },

    [ScriptOpcode.HUNTNEXT]: state => {
        const result = state.huntIterator?.next();
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
    },

    // https://x.com/JagexAsh/status/1796460129430433930
    // https://x.com/JagexAsh/status/1821236327150710829
    [ScriptOpcode.NPC_HUNTALL]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.huntIterator = new NpcHuntAllCommandIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis);
    },

    [ScriptOpcode.NPC_HUNTNEXT]: state => {
        const result = state.huntIterator?.next();
        if (!result || result.done) {
            state.pushInt(0);
            return;
        }

        if (!(result.value instanceof Npc)) {
            throw new Error('[ServerOps] npc_huntnext command must result instance of Npc.');
        }

        state.activeNpc = result.value;
        state.pointerAdd(ActiveNpc[state.intOperand]);
        state.pushInt(1);
    },

    [ScriptOpcode.INZONE]: state => {
        const [c1, c2, c3] = state.popInts(3);

        const from: CoordGrid = check(c1, CoordValid);
        const to: CoordGrid = check(c2, CoordValid);
        const pos: CoordGrid = check(c3, CoordValid);

        if (pos.x < from.x || pos.x > to.x) {
            state.pushInt(0);
        } else if (pos.level < from.level || pos.level > to.level) {
            state.pushInt(0);
        } else if (pos.z < from.z || pos.z > to.z) {
            state.pushInt(0);
        } else {
            state.pushInt(1);
        }
    },

    [ScriptOpcode.LINEOFWALK]: state => {
        const [c1, c2] = state.popInts(2);

        const from: CoordGrid = check(c1, CoordValid);
        const to: CoordGrid = check(c2, CoordValid);

        if (from.level !== to.level) {
            state.pushInt(0);
            return;
        }

        if (!Environment.NODE_MEMBERS && !World.gameMap.isFreeToPlay(to.x, to.z)) {
            state.pushInt(0);
            return;
        }

        state.pushInt(isLineOfWalk(from.level, from.x, from.z, to.x, to.z) ? 1 : 0);
    },

    // https://x.com/JagexAsh/status/1110604592138670083
    [ScriptOpcode.STAT_RANDOM]: state => {
        const [level, low, high] = state.popInts(3);

        const value = Math.floor((low * (99 - level)) / 98) + Math.floor((high * (level - 1)) / 98) + 1;
        const chance = Math.floor(Math.random() * 256);

        state.pushInt(value > chance ? 1 : 0);
    },

    [ScriptOpcode.SPOTANIM_MAP]: state => {
        const [spotanim, coord, height, delay] = state.popInts(4);

        const position: CoordGrid = check(coord, CoordValid);
        const spotanimType: SpotanimType = check(spotanim, SpotAnimTypeValid);

        World.animMap(position.level, position.x, position.z, spotanimType.id, height, delay);
    },

    [ScriptOpcode.DISTANCE]: state => {
        const [c1, c2] = state.popInts(2);

        const from: CoordGrid = check(c1, CoordValid);
        const to: CoordGrid = check(c2, CoordValid);

        state.pushInt(CoordGrid.distanceToSW(from, to));
    },

    [ScriptOpcode.MOVECOORD]: state => {
        const [coord, x, y, z] = state.popInts(4);

        const position: CoordGrid = check(coord, CoordValid);
        state.pushInt(CoordGrid.packCoord(position.level + y, position.x + x, position.z + z));
    },

    [ScriptOpcode.SEQLENGTH]: state => {
        state.pushInt(check(state.popInt(), SeqTypeValid).duration);
    },

    [ScriptOpcode.SPLIT_INIT]: state => {
        const [maxWidth, linesPerPage, fontId] = state.popInts(3);
        let text = state.popString();

        const font = check(fontId, FontTypeValid);

        // todo: later this needs to lookup by <p=id> instead of <p,name>
        if (text.startsWith('<p,') && text.indexOf('>') !== -1) {
            const mesanim = text.substring(3, text.indexOf('>'));
            state.splitMesanim = MesanimType.getId(mesanim);
            text = text.substring(text.indexOf('>') + 1);
        } else {
            state.splitMesanim = -1;
        }

        state.splitPages = [];
        const lines = font.split(text, maxWidth);
        while (lines.length > 0) {
            state.splitPages.push(lines.splice(0, linesPerPage));
        }
    },

    [ScriptOpcode.SPLIT_GET]: state => {
        const [page, line] = state.popInts(2);

        state.pushString(state.splitPages[page][line]);
    },

    [ScriptOpcode.SPLIT_PAGECOUNT]: state => {
        state.pushInt(state.splitPages.length);
    },

    [ScriptOpcode.SPLIT_LINECOUNT]: state => {
        const page = state.popInt();

        state.pushInt(state.splitPages[page].length);
    },

    [ScriptOpcode.SPLIT_GETANIM]: state => {
        const page = state.popInt();
        if (state.splitMesanim === -1) {
            state.pushInt(-1);
            return;
        }

        state.pushInt(check(state.splitMesanim, MesanimValid).len[state.splitPages[page].length - 1]);
    },

    [ScriptOpcode.STRUCT_PARAM]: state => {
        const [structId, paramId] = state.popInts(2);

        const paramType: ParamType = check(paramId, ParamTypeValid);
        const structType: StructType = check(structId, StructTypeValid);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramType.id, structType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramType.id, structType, paramType.defaultInt));
        }
    },

    [ScriptOpcode.COORDX]: state => {
        state.pushInt(check(state.popInt(), CoordValid).x);
    },

    [ScriptOpcode.COORDY]: state => {
        state.pushInt(check(state.popInt(), CoordValid).level);
    },

    [ScriptOpcode.COORDZ]: state => {
        state.pushInt(check(state.popInt(), CoordValid).z);
    },

    [ScriptOpcode.PLAYERCOUNT]: state => {
        state.pushInt(World.getTotalPlayers());
    },

    [ScriptOpcode.MAP_BLOCKED]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.pushInt(isMapBlocked(coord.x, coord.z, coord.level) ? 1 : 0);
    },

    [ScriptOpcode.MAP_INDOORS]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.pushInt(isIndoors(coord.x, coord.z, coord.level) ? 1 : 0);
    },

    [ScriptOpcode.LINEOFSIGHT]: state => {
        const [c1, c2] = state.popInts(2);

        const from: CoordGrid = check(c1, CoordValid);
        const to: CoordGrid = check(c2, CoordValid);

        if (from.level !== to.level) {
            state.pushInt(0);
            return;
        }

        if (!Environment.NODE_MEMBERS && !World.gameMap.isFreeToPlay(to.x, to.z)) {
            state.pushInt(0);
            return;
        }

        state.pushInt(isLineOfSight(from.level, from.x, from.z, to.x, to.z) ? 1 : 0);
    },

    // https://x.com/JagexAsh/status/1730321158858276938
    // https://x.com/JagexAsh/status/1814230119411540058
    [ScriptOpcode.WORLD_DELAY]: state => {
        // arg is popped elsewhere
        state.execution = ScriptState.WORLD_SUSPENDED;
    },

    [ScriptOpcode.PROJANIM_PL]: state => {
        const [srcCoord, uid, spotanim, srcHeight, dstHeight, delay, duration, peak, arc] = state.popInts(9);

        const srcPos: CoordGrid = check(srcCoord, CoordValid);
        const spotanimType: SpotanimType = check(spotanim, SpotAnimTypeValid);

        const player = World.getPlayerByUid(uid);
        if (!player) {
            throw new Error(`attempted to use invalid player uid: ${uid}`);
        }

        World.mapProjAnim(srcPos.level, srcPos.x, srcPos.z, player.x, player.z, -player.pid - 1, spotanimType.id, srcHeight + 100, dstHeight + 100, delay, duration, peak, arc);
    },

    [ScriptOpcode.PROJANIM_NPC]: state => {
        const [srcCoord, npcUid, spotanim, srcHeight, dstHeight, delay, duration, peak, arc] = state.popInts(9);

        const srcPos: CoordGrid = check(srcCoord, CoordValid);
        const spotanimType: SpotanimType = check(spotanim, SpotAnimTypeValid);

        const slot = npcUid & 0xffff;
        const _expectedType = (npcUid >> 16) & 0xffff;

        const npc = World.getNpc(slot);
        if (!npc) {
            throw new Error(`attempted to use invalid npc uid: ${npcUid}`);
        }

        World.mapProjAnim(srcPos.level, srcPos.x, srcPos.z, npc.x, npc.z, npc.nid + 1, spotanimType.id, srcHeight + 100, dstHeight + 100, delay, duration, peak, arc);
    },

    [ScriptOpcode.PROJANIM_MAP]: state => {
        const [srcCoord, dstCoord, spotanim, srcHeight, dstHeight, delay, duration, peak, arc] = state.popInts(9);

        const spotanimType: SpotanimType = check(spotanim, SpotAnimTypeValid);
        const srcPos: CoordGrid = check(srcCoord, CoordValid);
        const dstPos: CoordGrid = check(dstCoord, CoordValid);

        World.mapProjAnim(srcPos.level, srcPos.x, srcPos.z, dstPos.x, dstPos.z, 0, spotanimType.id, srcHeight + 100, dstHeight, delay, duration, peak, arc);
    },

    [ScriptOpcode.MAP_LOCADDUNSAFE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        for (const loc of World.gameMap.getZone(coord.x, coord.z, coord.level).getAllLocsUnsafe()) {
            const type = check(loc.type, LocTypeValid);

            if (type.active !== 1) {
                continue;
            }

            const layer = layerForLocShape(loc.shape);

            if (!loc.checkLifeCycle(World.currentTick) && layer === LocLayer.WALL) {
                continue;
            }

            if (layer === LocLayer.WALL) {
                if (loc.x === coord.x && loc.z === coord.z) {
                    state.pushInt(1);
                    return;
                }
            } else if (layer === LocLayer.GROUND) {
                const width = loc.angle === LocAngle.NORTH || loc.angle === LocAngle.SOUTH ? loc.length : loc.width;
                const length = loc.angle === LocAngle.NORTH || loc.angle === LocAngle.SOUTH ? loc.width : loc.length;
                for (let index = 0; index < width * length; index++) {
                    const deltaX = loc.x + (index % width);
                    const deltaZ = loc.z + ((index / width) | 0);
                    if (deltaX === coord.x && deltaZ === coord.z) {
                        state.pushInt(1);
                        return;
                    }
                }
            } else if (layer === LocLayer.GROUND_DECOR) {
                if (loc.x === coord.x && loc.z === coord.z) {
                    state.pushInt(1);
                    return;
                }
            }
        }
        state.pushInt(0);
    },

    [ScriptOpcode.NPCCOUNT]: state => {
        state.pushInt(World.getTotalNpcs());
    },

    [ScriptOpcode.ZONECOUNT]: state => {
        state.pushInt(World.gameMap.getTotalZones());
    },

    [ScriptOpcode.LOCCOUNT]: state => {
        state.pushInt(World.gameMap.getTotalLocs());
    },

    [ScriptOpcode.OBJCOUNT]: state => {
        state.pushInt(World.gameMap.getTotalObjs());
    },

    [ScriptOpcode.MAP_FINDSQUARE]: state => {
        const [coord, minRadius, maxRadius, type] = state.popInts(4);
        check(minRadius, NumberPositive);
        check(maxRadius, NumberPositive);
        check(type, FindSquareValid);
        const origin: CoordGrid = check(coord, CoordValid);
        const freeWorld = !Environment.NODE_MEMBERS;
        if (maxRadius < 10) {
            if (type === MapFindSqaureType.NONE) {
                for (let i = 0; i < 50; i++) {
                    const distX = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distanceSquared = distX * distX + distZ * distZ;
                    if (distanceSquared < minRadius * minRadius || distanceSquared > maxRadius * maxRadius) {
                        continue;
                    }
                    const randomX = origin.x + distX;
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(randomX, randomZ)) {
                        continue;
                    }
                    if (!isMapBlocked(randomX, randomZ, origin.level)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, randomX, randomZ));
                        return;
                    }
                }
            } else if (type === MapFindSqaureType.LINEOFWALK) {
                for (let i = 0; i < 50; i++) {
                    const distX = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distanceSquared = distX * distX + distZ * distZ;
                    if (distanceSquared < minRadius * minRadius || distanceSquared > maxRadius * maxRadius) {
                        continue;
                    }
                    const randomX = origin.x + distX;
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(randomX, randomZ)) {
                        continue;
                    }
                    if (isLineOfWalk(origin.level, randomX, randomZ, origin.x, origin.z) && !isMapBlocked(randomX, randomZ, origin.level)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, randomX, randomZ));
                        return;
                    }
                }
            } else if (type === MapFindSqaureType.LINEOFSIGHT) {
                for (let i = 0; i < 50; i++) {
                    const distX = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distanceSquared = distX * distX + distZ * distZ;
                    if (distanceSquared < minRadius * minRadius || distanceSquared > maxRadius * maxRadius) {
                        continue;
                    }
                    const randomX = origin.x + distX;
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(randomX, randomZ)) {
                        continue;
                    }   
                    if (isLineOfSight(origin.level, randomX, randomZ, origin.x, origin.z) && !isMapBlocked(randomX, randomZ, origin.level)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, randomX, randomZ));
                        return;
                    }
                }
            }
        } else {
            // west bias (imps)
            if (type === MapFindSqaureType.NONE) {
                for (let x = origin.x - maxRadius; x <= origin.x + maxRadius; x++) {
                    const distX = x - origin.x;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distanceSquared = distX * distX + distZ * distZ;
                    if (distanceSquared < minRadius * minRadius || distanceSquared > maxRadius * maxRadius) {
                        continue;
                    }
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(x, randomZ)) {
                        continue;
                    }
                    if (!isMapBlocked(x, randomZ, origin.level) && !CoordGrid.isWithinDistanceSW({x: x, z: randomZ}, origin, minRadius)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, x, randomZ));
                        return;
                    }
                }
            } else if (type === MapFindSqaureType.LINEOFWALK) {
                for (let x = origin.x - maxRadius; x <= origin.x + maxRadius; x++) {
                    const distX = x - origin.x;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distanceSquared = distX * distX + distZ * distZ;
                    if (distanceSquared < minRadius * minRadius || distanceSquared > maxRadius * maxRadius) {
                        continue;
                    }
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(x, randomZ)) {
                        continue;
                    }
                    if (isLineOfWalk(origin.level, x, randomZ, origin.x, origin.z) && !isMapBlocked(x, randomZ, origin.level) && !CoordGrid.isWithinDistanceSW({x: x, z: randomZ}, origin, minRadius)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, x, randomZ));
                        return;
                    }
                }
            } else if (type === MapFindSqaureType.LINEOFSIGHT) {
                for (let x = origin.x - maxRadius; x <= origin.x + maxRadius; x++) {
                    const distX = x - origin.x;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distanceSquared = distX * distX + distZ * distZ;
                    if (distanceSquared < minRadius * minRadius || distanceSquared > maxRadius * maxRadius) {
                        continue;
                    }
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(x, randomZ)) {
                        continue;
                    }
                    if (isLineOfSight(origin.level, x, randomZ, origin.x, origin.z) && !isMapBlocked(x, randomZ, origin.level) && !CoordGrid.isWithinDistanceSW({x: x, z: randomZ}, origin, minRadius)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, x, randomZ));
                        return;
                    }
                }
            }
        }
        
        state.pushInt(coord);
    },

    [ScriptOpcode.MAP_MULTIWAY]: state => {
        const coord = state.popInt();

        state.pushInt(World.gameMap.isMulti(coord) ? 1 : 0);
    }
};

export default ServerOps;
