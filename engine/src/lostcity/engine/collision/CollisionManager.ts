import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import ZoneManager from '#lostcity/engine/zone/ZoneManager.js';
import LocType from '#lostcity/cache/LocType.js';
import Loc from '#lostcity/entity/Loc.js';

import {allocateIfAbsent, changeFloor, changeLoc, changeNpc, changePlayer, changeRoof, changeWall, LocAngle, LocLayer, locShapeLayer} from '@2004scape/rsmod-pathfinder';

export default class CollisionManager {
    init(zoneManager: ZoneManager) {
        console.time('Loading collision');

        const maps: string[] = fs.readdirSync('data/pack/server/maps').filter((x: string): boolean => x[0] === 'm');
        for (let index: number = 0; index < maps.length; index++) {
            const [mx, mz] = maps[index].substring(1).split('_').map((x: string) => parseInt(x));

            const mapsquareX: number = mx << 6;
            const mapsquareZ: number = mz << 6;

            const lands: Int8Array = new Int8Array(4 * 64 * 64); // 4 * 64 * 64 size is guaranteed for lands
            this.decodeLands(lands, Packet.load(`data/pack/server/maps/m${mx}_${mz}`), mapsquareX, mapsquareZ);
            this.decodeLocs(zoneManager, lands, Packet.load(`data/pack/server/maps/l${mx}_${mz}`), mapsquareX, mapsquareZ);
        }
        console.timeEnd('Loading collision');
    }

    /**
     * Change collision at a specified Position for lands/floors.
     * @param x The x pos.
     * @param z The z pos.
     * @param level The level pos.
     * @param add True if adding this collision. False if removing.
     */
    changeLandCollision(x: number, z: number, level: number, add: boolean): void {
        changeFloor(x, z, level, add);
    }

    /**
     * Change collision at a specified Position for locs.
     * @param shape The shape of the loc to change.
     * @param angle The angle of the loc to change.
     * @param blockrange If this loc blocks range.
     * @param length The length of this loc.
     * @param width The width of this loc.
     * @param active If this loc is active.
     * @param x The x pos.
     * @param z The z pos.
     * @param level The level pos.
     * @param add True if adding this collision. False if removing.
     */
    changeLocCollision(shape: number, angle: number, blockrange: boolean, length: number, width: number, active: number, x: number, z: number, level: number, add: boolean): void {
        const locLayer: LocLayer = locShapeLayer(shape);
        if (locLayer === LocLayer.WALL) {
            changeWall(x, z, level, angle, shape, blockrange, false, add);
        } else if (locLayer === LocLayer.GROUND) {
            if (angle === LocAngle.NORTH || angle === LocAngle.SOUTH) {
                changeLoc(x, z, level, length, width, blockrange, false, add);
            } else {
                changeLoc(x, z, level, width, length, blockrange, false, add);
            }
        } else if (locLayer === LocLayer.GROUND_DECOR) {
            if (active === 1) {
                changeFloor(x, z, level, add);
            }
        }
    }

    /**
     * Change collision at a specified Position for npcs.
     * @param size The size square of this npc. (1x1, 2x2, etc).
     * @param x The x pos.
     * @param z The z pos.
     * @param level The level pos.
     * @param add True if adding this collision. False if removing.
     */
    changeNpcCollision(size: number, x: number, z: number, level: number, add: boolean): void {
        changeNpc(x, z, level, size, add);
    }

    /**
     * Change collision at a specified Position for players.
     * @param size The size square of this npc. (1x1, 2x2, etc).
     * @param x The x pos.
     * @param z The z pos.
     * @param level The level pos.
     * @param add True if adding this collision. False if removing.
     */
    changePlayerCollision(size: number, x: number, z: number, level: number, add: boolean): void {
        changePlayer(x, z, level, size, add);
    }

    /**
     * Change collision at a specified Position for roofs.
     * @param x The x pos.
     * @param z The z pos.
     * @param level The level pos.
     * @param add True if adding this collision. False if removing.
     */
    changeRoofCollision(x: number, z: number, level: number, add: boolean): void {
        changeRoof(x, z, level, add);
    }

    private decodeLands(lands: Int8Array, packet: Packet, mapsquareX: number, mapsquareZ: number): void {
        for (let level: number = 0; level < 4; level++) {
            for (let x: number = 0; x < 64; x++) {
                for (let z: number = 0; z < 64; z++) {
                    lands[this.packCoord(x, z, level)] = this.decodeLand(packet);
                }
            }
        }
        this.applyLandCollision(mapsquareX, mapsquareZ, lands);
    }

    private applyLandCollision(mapsquareX: number, mapsquareZ: number, lands: Int8Array): void {
        for (let level: number = 0; level < 4; level++) {
            for (let x: number = 0; x < 64; x++) {
                const absoluteX: number = x + mapsquareX;

                for (let z: number = 0; z < 64; z++) {
                    const absoluteZ: number = z + mapsquareZ;

                    if (x % 7 === 0 && z % 7 === 0) { // allocate per zone
                        allocateIfAbsent(absoluteX, absoluteZ, level);
                    }

                    const land: number = lands[this.packCoord(x, z, level)];
                    if ((land & 0x4) !== 0) {
                        this.changeRoofCollision(absoluteX, absoluteZ, level, true);
                    }
                    if ((land & 0x1) !== 1) {
                        continue;
                    }

                    const bridged: boolean = (level === 1 ? land & 0x2 : lands[this.packCoord(x, z, 1)] & 0x2) === 2;
                    const actualLevel: number = bridged ? level - 1 : level;
                    if (actualLevel < 0) {
                        continue;
                    }

                    this.changeLandCollision(absoluteX, absoluteZ, actualLevel, true);
                }
            }
        }
    }

    private decodeLand(packet: Packet, collision: number = 0): number {
        const opcode: number = packet.g1();
        if (opcode === 0 || opcode === 1) {
            if (opcode === 1) {
                packet.g1();
            }
            return collision;
        }
        if (opcode >= 2 && opcode <= 49) {
            packet.g1b();
        }
        return this.decodeLand(packet, opcode >= 50 && opcode <= 81 ? opcode - 49 : collision);
    }

    private decodeLocs(zoneManager: ZoneManager, lands: Int8Array, packet: Packet, mapsquareX: number, mapsquareZ: number): void {
        let locId: number = -1;
        let locIdOffset: number = packet.gsmart();
        while (locIdOffset !== 0) {
            locId += locIdOffset;

            let coord: number = 0;
            let coordOffset: number = packet.gsmart();

            while (coordOffset !== 0) {
                const {x, z, level} = this.unpackCoord(coord += coordOffset - 1);

                const info: number = packet.g1();
                coordOffset = packet.gsmart();

                const bridged: boolean = (level === 1 ? lands[coord] & 0x2 : lands[this.packCoord(x, z, 1)] & 0x2) === 2;
                const actualLevel: number = bridged ? level - 1 : level;
                if (actualLevel < 0) {
                    continue;
                }

                const type: LocType = LocType.get(locId);
                const width: number = type.width;
                const length: number = type.length;
                const shape: number = info >> 2;
                const angle: number = info & 0x3;

                const absoluteX: number = x + mapsquareX;
                const absoluteZ: number = z + mapsquareZ;

                zoneManager.getZone(absoluteX, absoluteZ, actualLevel).addStaticLoc(new Loc(actualLevel, absoluteX, absoluteZ, width, length, locId, shape, angle));

                if (type.blockwalk) {
                    this.changeLocCollision(shape, angle, type.blockrange, length, width, type.active, absoluteX, absoluteZ, actualLevel, true);
                }
            }
            locIdOffset = packet.gsmart();
        }
    }

    private packCoord(x: number, z: number, level: number): number {
        return (z & 0x3f) | ((x & 0x3f) << 6) | ((level & 0x3) << 12);
    }

    private unpackCoord(packed: number): { level: number; x: number; z: number } {
        const z: number = packed & 0x3f;
        const x: number = (packed >> 6) & 0x3f;
        const level: number = (packed >> 12) & 0x3;
        return { x, z, level };
    }
}
