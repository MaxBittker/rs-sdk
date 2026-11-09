import fs from 'fs';

import { unzipSync } from 'fflate';
// 274 replaced the @2004scape/rsmod-pathfinder WASM with an in-engine TypeScript
// routefinder. Read collision from that module so the export reflects the actual
// collision state the engine populates at startup (the WASM is no longer fed).
import * as rsmod from '#/engine/routefinder/index.js';
import { CollisionFlag } from '#/engine/routefinder/index.js';
import LocType from '#/cache/config/LocType.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { type DoorEntry, scanMapsquareDoors } from '#/web/pages/collision-doors.js';

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

// Export collision data for SDK bundling.
// The full scan takes seconds and runs on the tick thread, so the serialized
// result is cached after the first request. Collision is populated once from
// packed map data at startup; a server restart (i.e. any map/content change)
// naturally invalidates the cache.
let collisionExportCache: string | null = null;

// rs-sdk: lets clients outside the browser (the lite runner) check they speak this server's revision
export function handleVersionApi(url: URL): Response | null {
    if (url.pathname !== '/api/version') {
        return null;
    }
    return Response.json({ revision: Environment.engine.revision });
}

export function handleExportCollisionApi(req: Request, url: URL): Response | null {
    if (url.pathname !== '/api/exportCollision') {
        return null;
    }
    if (req.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
    }
    if (collisionExportCache !== null) {
        return new Response(collisionExportCache, {
            headers: { 'Content-Type': 'application/json' }
        });
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

        // Discover mapsquares the engine could have loaded. GameMap.init prefers the
        // packed zip (data/pack/.cache/maps-server.zip) and only falls back to the raw
        // maps dir when the zip is absent. The two sources don't fully overlap — the zip
        // had ~41 mapsquares (e.g. the SW mainland around Yanille, Tirannwn) absent from
        // the dir. Discovering from the dir alone silently dropped those from the export,
        // leaving bots with no collision data there. Union both sources and let the
        // isZoneAllocated() check below filter to the mapsquares actually loaded.
        const mapsquareSet = new Set<string>();
        const addMapsquare = (name: string): void => {
            if (name[0] !== 'm') return;
            const parts = name.substring(1).split('_').map(Number);
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                mapsquareSet.add(`${parts[0]}_${parts[1]}`);
            }
        };

        let zipEntries: Record<string, Uint8Array> | null = null;
        const zipPath = 'data/pack/.cache/maps-server.zip';
        if (fs.existsSync(zipPath)) {
            try {
                zipEntries = unzipSync(fs.readFileSync(zipPath));
                for (const name of Object.keys(zipEntries)) addMapsquare(name);
            } catch (e) {
                console.warn('exportCollision: failed to read maps zip, falling back to dir only', e);
            }
        }
        const mapDir = 'data/pack/server/maps/';
        if (fs.existsSync(mapDir)) {
            for (const file of fs.readdirSync(mapDir)) addMapsquare(file);
        }

        // Load a map packet (e.g. "m37_71" / "l37_71") from whichever source has it —
        // the raw dir or the zip. Mapsquares present only in the zip have no dir file,
        // so reading from the dir alone throws ENOENT during the door scan below.
        const loadMapPacket = (prefix: string, mx: number, mz: number): Packet | null => {
            const file = `${mapDir}${prefix}${mx}_${mz}`;
            if (fs.existsSync(file)) {
                return Packet.load(file);
            }
            const bytes = zipEntries?.[`${prefix}${mx}_${mz}`];
            return bytes ? new Packet(bytes) : null;
        };
        const mapsquares: Array<[number, number]> = [...mapsquareSet].map(k => {
            const [mx, mz] = k.split('_').map(Number);
            return [mx, mz];
        });
        console.log(`Found ${mapsquares.length} mapsquares (zip ∪ dir)`);

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

        // Scan loc map files for doors/gates (wall-shaped locs with "Open" option,
        // including diagonal ones - see isRoutableDoor). The SDK uses this list to
        // remove the door's collision, so the pathfinder routes through doorways but
        // respects permanent walls.
        const doors: DoorEntry[] = [];
        for (const [mx, mz] of mapsquares) {
            // Skip squares with no loc data in either source — nothing to scan for doors.
            const locPacket = loadMapPacket('l', mx, mz);
            if (!locPacket) continue;
            const groundPacket = loadMapPacket('m', mx, mz) ?? new Packet(new Uint8Array());
            doors.push(...scanMapsquareDoors(mx, mz, locPacket, groundPacket, id => LocType.get(id)));
        }

        console.log(`Found ${doors.length} openable doors/gates`);

        collisionExportCache = JSON.stringify({ tiles, zones, doors });
        return new Response(collisionExportCache, {
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
