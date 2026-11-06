import { LocLayer, LocShape, locShapeLayer } from '#/engine/routefinder/index.js';
import Packet from '#/io/Packet.js';

/** [level, x, z, shape, angle, blockrange] - the `doors` entries of /api/exportCollision. */
export type DoorEntry = [number, number, number, number, number, number];

/** The loc config fields the door scan reads. */
export interface DoorLocType {
    blockwalk: boolean;
    blockrange: boolean;
    width: number;
    length: number;
    op: (string | null)[] | null;
}

const MAPSQUARE_SIZE = 64;
const LEVELS = 4;
const LINK_BELOW = 0x2;

/**
 * Whether a loc of this shape and type is a door the SDK should route through.
 *
 * Straight and corner wall shapes are on the WALL layer. A diagonal wall
 * (shape 9, e.g. the Wizards' Tower inner door at 3107,3162) is on the GROUND
 * layer and blocks its tile like a 1x1 loc, so only 1x1 diagonal doors are
 * exported: the SDK unmasks them with changeLoc(1, 1).
 */
export function isRoutableDoor(shape: number, type: DoorLocType | null | undefined): boolean {
    if (!type || !type.blockwalk) return false;
    if (!type.op?.some(o => o && /^open$/i.test(o))) return false;
    if (locShapeLayer(shape) === LocLayer.WALL) return true;
    return shape === LocShape.WALL_DIAGONAL && type.width === 1 && type.length === 1;
}

/**
 * Scan one mapsquare's loc file (same format as GameMap.loadLocations) for
 * openable doors and gates, applying the same bridge level adjustment.
 */
export function scanMapsquareDoors(
    mx: number,
    mz: number,
    locPacket: Packet,
    groundPacket: Packet,
    getLocType: (id: number) => DoorLocType | null | undefined
): DoorEntry[] {
    const doors: DoorEntry[] = [];
    const mapsquareX = mx << 6;
    const mapsquareZ = mz << 6;

    // Ground data for bridge level adjustments (same as GameMap.loadGround)
    const lands = new Int8Array(LEVELS * MAPSQUARE_SIZE * MAPSQUARE_SIZE);
    for (let level = 0; level < LEVELS; level++) {
        for (let x = 0; x < MAPSQUARE_SIZE; x++) {
            for (let z = 0; z < MAPSQUARE_SIZE; z++) {
                while (groundPacket.pos < groundPacket.data.length) {
                    const opcode = groundPacket.g1();
                    if (opcode === 0) break;
                    if (opcode === 1) { groundPacket.pos++; break; }
                    if (opcode <= 49) { groundPacket.pos++; }
                    else if (opcode <= 81) {
                        lands[(z & 0x3f) | ((x & 0x3f) << 6) | ((level & 0x3) << 12)] = opcode - 49;
                    }
                }
            }
        }
    }

    let locId = -1;
    let locIdOffset = locPacket.gsmarts();
    while (locIdOffset !== 0) {
        locId += locIdOffset;

        let coord = 0;
        let coordOffset = locPacket.gsmarts();

        while (coordOffset !== 0) {
            coord += coordOffset - 1;
            const localZ = coord & 0x3f;
            const localX = (coord >> 6) & 0x3f;
            const level = (coord >> 12) & 0x3;

            const info = locPacket.g1();
            coordOffset = locPacket.gsmarts();

            // Bridge level adjustment (same as GameMap.loadLocations)
            const bridged = (level === 1
                ? lands[coord] & LINK_BELOW
                : lands[(localZ & 0x3f) | ((localX & 0x3f) << 6) | ((1 & 0x3) << 12)] & LINK_BELOW
            ) === LINK_BELOW;
            const actualLevel = bridged ? level - 1 : level;
            if (actualLevel < 0) continue;

            const shape = info >> 2;
            const angle = info & 0x3;
            const type = getLocType(locId);
            if (!isRoutableDoor(shape, type)) continue;

            doors.push([actualLevel, localX + mapsquareX, localZ + mapsquareZ, shape, angle, type!.blockrange ? 1 : 0]);
        }
        locIdOffset = locPacket.gsmarts();
    }
    return doors;
}
