import fs from 'fs';
import * as rsmod from '@2004scape/rsmod-pathfinder';
import { CollisionFlag, LocLayer } from '@2004scape/rsmod-pathfinder';
import LocType from '#/cache/config/LocType.js';
import Packet from '#/io/Packet.js';

export async function handleScreenshotUpload(req: Request, url: URL): Promise<Response | null> {
    if (url.pathname !== '/api/screenshot' || req.method !== 'POST') {
        return null;
    }

    try {
        const data = await req.text();
        const base64Data = data.replace(/^data:image\/png;base64,/, '');
        const filename = `screenshot-${Date.now()}.png`;
        const filepath = `screenshots/${filename}`;
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
        return new Response(JSON.stringify({ success: true, filename }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Export collision data for SDK bundling
export function handleExportCollisionApi(url: URL): Response | null {
    if (url.pathname !== '/api/exportCollision') {
        return null;
    }

    try {
        console.log('Exporting collision data...');

        // Include wall flags so the pathfinder can see permanent walls (city walls, etc).
        // Doors/gates are exported separately so the SDK can mask their collision at init.
        const FLAG_BITS = [
            CollisionFlag.LOC, CollisionFlag.FLOOR, CollisionFlag.FLOOR_DECORATION, CollisionFlag.ROOF,
            // Directional wall flags
            CollisionFlag.WALL_NORTH, CollisionFlag.WALL_EAST,
            CollisionFlag.WALL_SOUTH, CollisionFlag.WALL_WEST,
            CollisionFlag.WALL_NORTH_WEST, CollisionFlag.WALL_NORTH_EAST,
            CollisionFlag.WALL_SOUTH_EAST, CollisionFlag.WALL_SOUTH_WEST,
        ];

        // Discover mapsquares from the same map files the server loaded,
        // so we automatically cover every area including dungeons.
        const mapDir = 'data/pack/server/maps/';
        const mapsquares: Array<[number, number]> = [];
        if (fs.existsSync(mapDir)) {
            for (const file of fs.readdirSync(mapDir)) {
                if (file[0] !== 'm') continue;
                const parts = file.substring(1).split('_').map(Number);
                if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    mapsquares.push([parts[0], parts[1]]);
                }
            }
        }
        console.log(`Found ${mapsquares.length} mapsquares from ${mapDir}`);

        const LEVELS = 4;
        const tiles: Array<[number, number, number, number]> = [];
        // Track all allocated zones so SDK can allocate them even if they have no collision tiles
        const zones: Array<[number, number, number]> = [];

        for (let level = 0; level < LEVELS; level++) {
            for (const [mx, mz] of mapsquares) {
                const baseX = mx << 6;
                const baseZ = mz << 6;

                for (let zx = 0; zx < 8; zx++) {
                    for (let zz = 0; zz < 8; zz++) {
                        const zoneBaseX = baseX + (zx << 3);
                        const zoneBaseZ = baseZ + (zz << 3);

                        if (!rsmod.isZoneAllocated(zoneBaseX, zoneBaseZ, level)) {
                            continue;
                        }

                        // Record this zone as allocated
                        zones.push([level, zoneBaseX, zoneBaseZ]);

                        for (let dx = 0; dx < 8; dx++) {
                            for (let dz = 0; dz < 8; dz++) {
                                const x = zoneBaseX + dx;
                                const z = zoneBaseZ + dz;

                                let flags = 0;
                                for (const bit of FLAG_BITS) {
                                    if (rsmod.isFlagged(x, z, level, bit)) {
                                        flags |= bit;
                                    }
                                }

                                if (flags !== 0) {
                                    tiles.push([level, x, z, flags]);
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log(`Exported ${tiles.length} tiles with collision, ${zones.length} zones allocated`);

        // Scan loc map files for doors/gates (wall-shaped locs with "Open" option).
        // The SDK uses this list to remove wall collision at door positions,
        // so the pathfinder routes through doorways but respects permanent walls.
        const doors: Array<[number, number, number, number, number, number]> = [];
        const MAPSQUARE_SIZE = 64;
        const LINK_BELOW = 0x2;

        for (const [mx, mz] of mapsquares) {
            const mapsquareX = mx << 6;
            const mapsquareZ = mz << 6;

            // Load ground data for bridge level adjustments (same as GameMap.loadGround)
            const lands = new Int8Array(4 * MAPSQUARE_SIZE * MAPSQUARE_SIZE);
            const groundPacket = Packet.load(`${mapDir}m${mx}_${mz}`);
            for (let level = 0; level < LEVELS; level++) {
                for (let x = 0; x < MAPSQUARE_SIZE; x++) {
                    for (let z = 0; z < MAPSQUARE_SIZE; z++) {
                        while (true) {
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

            // Parse loc file (same format as GameMap.loadLocations)
            const locPacket = Packet.load(`${mapDir}l${mx}_${mz}`);
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

                    const absoluteX = localX + mapsquareX;
                    const absoluteZ = localZ + mapsquareZ;

                    // Bridge level adjustment (same as GameMap.loadLocations)
                    const bridged = (level === 1
                        ? lands[coord] & LINK_BELOW
                        : lands[(localZ & 0x3f) | ((localX & 0x3f) << 6) | ((1 & 0x3) << 12)] & LINK_BELOW
                    ) === LINK_BELOW;
                    const actualLevel = bridged ? level - 1 : level;
                    if (actualLevel < 0) continue;

                    const shape = info >> 2;
                    const angle = info & 0x3;
                    const locLayer = rsmod.locShapeLayer(shape);

                    // Only interested in wall-shaped locs that are doors/gates
                    if (locLayer !== LocLayer.WALL) continue;

                    const type = LocType.get(locId);
                    if (!type || !type.blockwalk) continue;

                    // Check if this loc has an "Open" interaction option
                    const hasOpen = type.op?.some((o: string | null) => o && /^open$/i.test(o));
                    if (!hasOpen) continue;

                    doors.push([actualLevel, absoluteX, absoluteZ, shape, angle, type.blockrange ? 1 : 0]);
                }
                locIdOffset = locPacket.gsmarts();
            }
        }

        console.log(`Found ${doors.length} openable doors/gates`);

        return new Response(JSON.stringify({ tiles, zones, doors }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(
            JSON.stringify({
                success: false,
                error: e.message
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}
