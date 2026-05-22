import { LocLayer, LocAngle } from '#/engine/routefinder/index.js';

import SpotanimType from '#/cache/config/SpotanimType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { MapFindSquareType } from '#/engine/entity/MapFindSquareType.js';
import { isIndoors, isLineOfSight, isLineOfWalk, isMapBlocked } from '#/engine/GameMap.js';
import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import { check, CoordValid, LocTypeValid, NumberPositive, SeqTypeValid, SpotAnimTypeValid, FindSquareValid } from '#/engine/script/ScriptValidators.js';
import World from '#/engine/World.js';
import Environment from '#/util/Environment.js';
import Midi from '#/cache/midi/Midi.js';

const ServerOps: CommandHandlers = {
    [ScriptOpcode.MAP_CLOCK]: state => {
        state.pushInt(World.currentTick);
    },

    [ScriptOpcode.MAP_MEMBERS]: state => {
        state.pushInt(Environment.node.members ? 1 : 0);
    },

    [ScriptOpcode.MAP_LIVE]: state => {
        state.pushInt(Environment.node.production ? 1 : 0);
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

        if (!Environment.node.members && !World.gameMap.isFreeToPlay(to.x, to.z)) {
            state.pushInt(0);
            return;
        }

        state.pushInt(isLineOfWalk(from.level, from.x, from.z, to.x, to.z) ? 1 : 0);
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

        if (!Environment.node.members && !World.gameMap.isFreeToPlay(coord.x, coord.z)) {
            state.pushInt(1);
            return;
        }
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

        if (!Environment.node.members && !World.gameMap.isFreeToPlay(to.x, to.z)) {
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

        World.mapProjAnim(srcPos.level, srcPos.x, srcPos.z, player.x, player.z, -player.slot - 1, spotanimType.id, srcHeight, dstHeight, delay, duration, peak, arc);
    },

    [ScriptOpcode.PROJANIM_NPC]: state => {
        const [srcCoord, npcUid, spotanim, srcHeight, dstHeight, delay, duration, peak, arc] = state.popInts(9);

        const srcPos: CoordGrid = check(srcCoord, CoordValid);
        const spotanimType: SpotanimType = check(spotanim, SpotAnimTypeValid);

        const slot = npcUid & 0xffff;
        // const _expectedType = (npcUid >> 16) & 0xffff;

        const npc = World.getNpc(slot);
        if (!npc) {
            throw new Error(`attempted to use invalid npc uid: ${npcUid}`);
        }

        World.mapProjAnim(srcPos.level, srcPos.x, srcPos.z, npc.x, npc.z, npc.nid + 1, spotanimType.id, srcHeight, dstHeight, delay, duration, peak, arc);
    },

    [ScriptOpcode.PROJANIM_MAP]: state => {
        const [srcCoord, dstCoord, spotanim, srcHeight, dstHeight, delay, duration, peak, arc] = state.popInts(9);

        const spotanimType: SpotanimType = check(spotanim, SpotAnimTypeValid);
        const srcPos: CoordGrid = check(srcCoord, CoordValid);
        const dstPos: CoordGrid = check(dstCoord, CoordValid);

        World.mapProjAnim(srcPos.level, srcPos.x, srcPos.z, dstPos.x, dstPos.z, 0, spotanimType.id, srcHeight, dstHeight, delay, duration, peak, arc);
    },

    [ScriptOpcode.MAP_LOCADDUNSAFE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);
        // check south and west neighboring zones for big locs that bleed over...
        // Maybe theres a smarter way to do this?
        for (let x = -8; x <= 0; x += 8) {
            for (let z = -8; z <= 0; z += 8) {
                for (const loc of World.gameMap.getZone(coord.x + x, coord.z + z, coord.level).getAllLocsUnsafe()) {
                    const type = check(loc.type, LocTypeValid);

                    if (type.active !== 1) {
                        continue;
                    }

                    if (!loc.isActive && loc.layer === LocLayer.WALL) {
                        continue;
                    }
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
                }
            }
        }
        state.pushInt(0);
    },

    [ScriptOpcode.MAP_LOC]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);
        for (let x = -8; x <= 0; x += 8) {
            for (let z = -8; z <= 0; z += 8) {
                for (const loc of World.gameMap.getZone(coord.x + x, coord.z + z, coord.level).getAllLocsSafe()) {
                    const type = check(loc.type, LocTypeValid);

                    if (type.active !== 1) {
                        continue;
                    }

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
                }
            }
        }
        state.pushInt(0);
    },

    [ScriptOpcode.MAP_FINDSQUARE]: state => {
        const [coord, minRadius, maxRadius, type] = state.popInts(4);
        check(minRadius, NumberPositive);
        check(maxRadius, NumberPositive);
        check(type, FindSquareValid);
        const origin: CoordGrid = check(coord, CoordValid);
        const freeWorld = !Environment.node.members;
        if (maxRadius < 10) {
            if (type === MapFindSquareType.NONE) {
                for (let i = 0; i < 50; i++) {
                    const distX = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distance = Math.max(Math.abs(distX), Math.abs(distZ));
                    if (distance < minRadius || distance > maxRadius) {
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
            } else if (type === MapFindSquareType.LINEOFWALK) {
                for (let i = 0; i < 50; i++) {
                    const distX = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distance = Math.max(Math.abs(distX), Math.abs(distZ));
                    if (distance < minRadius || distance > maxRadius) {
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
            } else if (type === MapFindSquareType.LINEOFSIGHT) {
                for (let i = 0; i < 50; i++) {
                    const distX = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distance = Math.max(Math.abs(distX), Math.abs(distZ));
                    if (distance < minRadius || distance > maxRadius) {
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
            if (type === MapFindSquareType.NONE) {
                for (let x = origin.x - maxRadius; x <= origin.x + maxRadius; x++) {
                    const distX = x - origin.x;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distance = Math.max(Math.abs(distX), Math.abs(distZ));
                    if (distance < minRadius || distance > maxRadius) {
                        continue;
                    }
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(x, randomZ)) {
                        continue;
                    }
                    if (!isMapBlocked(x, randomZ, origin.level) && !CoordGrid.isWithinDistanceSW({ x: x, z: randomZ }, origin, minRadius)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, x, randomZ));
                        return;
                    }
                }
            } else if (type === MapFindSquareType.LINEOFWALK) {
                for (let x = origin.x - maxRadius; x <= origin.x + maxRadius; x++) {
                    const distX = x - origin.x;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distance = Math.max(Math.abs(distX), Math.abs(distZ));
                    if (distance < minRadius || distance > maxRadius) {
                        continue;
                    }
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(x, randomZ)) {
                        continue;
                    }
                    if (isLineOfWalk(origin.level, x, randomZ, origin.x, origin.z) && !isMapBlocked(x, randomZ, origin.level) && !CoordGrid.isWithinDistanceSW({ x: x, z: randomZ }, origin, minRadius)) {
                        state.pushInt(CoordGrid.packCoord(origin.level, x, randomZ));
                        return;
                    }
                }
            } else if (type === MapFindSquareType.LINEOFSIGHT) {
                for (let x = origin.x - maxRadius; x <= origin.x + maxRadius; x++) {
                    const distX = x - origin.x;
                    const distZ = Math.floor(Math.random() * (2 * maxRadius + 1)) - maxRadius;
                    const distance = Math.max(Math.abs(distX), Math.abs(distZ));
                    if (distance < minRadius || distance > maxRadius) {
                        continue;
                    }
                    const randomZ = origin.z + distZ;
                    if (freeWorld && !World.gameMap.isFreeToPlay(x, randomZ)) {
                        continue;
                    }
                    if (isLineOfSight(origin.level, x, randomZ, origin.x, origin.z) && !isMapBlocked(x, randomZ, origin.level) && !CoordGrid.isWithinDistanceSW({ x: x, z: randomZ }, origin, minRadius)) {
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
    },

    [ScriptOpcode.MIDI_LENGTH]: state => {
        const track = state.popInt();

        state.pushInt(Midi.getTickLength(track));
    }
};

export default ServerOps;
