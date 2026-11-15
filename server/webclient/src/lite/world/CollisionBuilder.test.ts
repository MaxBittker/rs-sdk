// Differential test: lite CollisionBuilder vs the browser client's own builder.
//
// The browser client is the specification, so it can be the oracle. ClientBuild
// already supports a collision-only mode - `loadLocations(src, ox, oz, world,
// collisions)` and `finishBuild(world, collisions)` both accept `world: null` -
// so we can run the real thing headless and require the resulting CollisionMap
// flags to be byte-identical to ours.
//
// This is the check that matters for pathing. `movement.ts` is a verbatim port of
// Client.tryMove operating on these flags, and testWall/testWDecor/testLoc are
// the client's own methods, so identical flags means identical routing decisions.
// Anything wrong with the map data shows up here rather than as a bot that
// mysteriously can't reach a bank.
//
// Needs the game server for map data (cached on disk after the first run). Set
// LITE_TEST_ORIGIN to point elsewhere; the test skips if it's unreachable.

import { describe, expect, test } from 'bun:test';

import '../dom-shim.js';

import ClientBuild from '#/client/ClientBuild.js';
import CollisionMap, { BuildArea } from '#/dash3d/CollisionMap.js';
import Model from '#/dash3d/Model.js';
import World from '#/dash3d/World.js';
import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';
import { Int32Array3d, Uint8Array3d } from '#/util/Arrays.js';

import { gunzipSync, unzipSync } from 'fflate';

import { loadCache } from '../cache.js';
import { buildCollision } from './CollisionBuilder.js';
import { LocIndex } from './LocIndex.js';

const ORIGIN = process.env.LITE_TEST_ORIGIN ?? 'https://rs-sdk.maxbittker.com';
const CACHE_DIR = process.env.LITE_TEST_CACHE ?? '/tmp/rs-sdk-lite-test-cache';

// Both default to TRUE, but the engine serves the bot client with lowmem=0
// (engine/src/web/pages/client.ts), so the real client DOES load locs on levels
// 1-3. Leaving the defaults makes the oracle silently skip them and the test
// "passes" against a map that has no upper floors.
(ClientBuild as unknown as { lowMem: boolean }).lowMem = false;
(World as unknown as { lowMem: boolean }).lowMem = false;

// Collision is independent of models: ClientBuild.addLoc builds one, hands it to
// `world?.setWall(...)` (inert with world=null), then calls collision.addWall
// separately. A provider that always misses keeps model building from running.
(Model as unknown as { provider: unknown }).provider = {
    requestModel: () => null,
    request: () => {},
    getModel: () => null
};

/** Zone-centre coordinates (worldTile / 8) for a few dense, structurally varied regions. */
const REGIONS: Array<[string, number, number]> = [
    ['lumbridge', 402, 402],
    ['varrock', 402, 427],
    ['falador', 371, 422],
    ['draynor', 385, 412],
    ['alkharid', 410, 391]
];

describe('CollisionBuilder matches the browser client', () => {
    test('byte-identical collision flags across regions and levels', async () => {
        // Reachability is checked inside the test, not at module scope: a
        // top-level await runs after bun:test has already collected suites.
        const reachable = await fetch(`${ORIGIN}/crc`).then(r => r.ok).catch(() => false);
        if (!reachable) {
            console.warn(`[lite] skipping collision oracle test - ${ORIGIN} unreachable`);
            return;
        }

        const { checksums } = await loadCache({ origin: ORIGIN, cacheDir: CACHE_DIR, quiet: true });
        const index = await LocIndex.load({ origin: ORIGIN, cacheDir: CACHE_DIR, versionlistCrc: checksums[5], quiet: true });

        const versionlist = new JagFile(await get(`${ORIGIN}/versionlist${checksums[5]}`));
        const mapIndex = versionlist.read('map_index');
        expect(mapIndex).toBeTruthy();

        const landFile = new Map<number, number>();
        const locFile = new Map<number, number>();
        const buf = new Packet(mapIndex!);
        for (let i = 0; i < mapIndex!.length / 7; i++) {
            const square = buf.g2();
            landFile.set(square, buf.g2());
            locFile.set(square, buf.g2());
            buf.g1();
        }

        const zip = unzipSync(await get(`${ORIGIN}/ondemand.zip`));

        for (const [name, centreZoneX, centreZoneZ] of REGIONS) {
            const baseX = (centreZoneX - 6) * 8;
            const baseZ = (centreZoneZ - 6) * 8;

            const expectedMaps = oracle(centreZoneX, centreZoneZ, landFile, locFile, zip);
            const actualMaps: (CollisionMap | null)[] = [null, null, null, null];
            buildCollision(index, baseX, baseZ, actualMaps);

            for (let level = 0; level < BuildArea.LEVELS; level++) {
                const expectedFlags = expectedMaps[level]!.flags;
                const actualFlags = actualMaps[level]!.flags;

                let differing = 0;
                let firstDiff = -1;
                for (let i = 0; i < expectedFlags.length; i++) {
                    if (expectedFlags[i] !== actualFlags[i]) {
                        differing++;
                        if (firstDiff < 0) firstDiff = i;
                    }
                }

                const where =
                    firstDiff < 0
                        ? ''
                        : ` first at tile (${(firstDiff / BuildArea.SIZE) | 0},${firstDiff % BuildArea.SIZE}) ` +
                          `expected=0x${expectedFlags[firstDiff].toString(16)} actual=0x${actualFlags[firstDiff].toString(16)}`;

                expect(`${name} L${level}: ${differing} differing${where}`).toBe(`${name} L${level}: 0 differing`);
            }
        }
    }, 180_000);
});

/** Build the reference CollisionMaps using the browser client's own ClientBuild. */
function oracle(
    centreZoneX: number,
    centreZoneZ: number,
    landFile: Map<number, number>,
    locFile: Map<number, number>,
    zip: Record<string, Uint8Array>
): (CollisionMap | null)[] {
    const baseX = (centreZoneX - 6) * 8;
    const baseZ = (centreZoneZ - 6) * 8;

    const groundh = new Int32Array3d(BuildArea.LEVELS, BuildArea.SIZE + 1, BuildArea.SIZE + 1);
    const mapl = new Uint8Array3d(BuildArea.LEVELS, BuildArea.SIZE, BuildArea.SIZE);
    const build = new ClientBuild(BuildArea.SIZE, BuildArea.SIZE, groundh, mapl);

    const maps: (CollisionMap | null)[] = [new CollisionMap(), new CollisionMap(), new CollisionMap(), new CollisionMap()];
    for (const map of maps) {
        map!.reset();
    }

    const squares: Array<[number, number, number, number]> = [];
    for (let x = ((centreZoneX - 6) / 8) | 0; x <= (((centreZoneX + 6) / 8) | 0); x++) {
        for (let z = ((centreZoneZ - 6) / 8) | 0; z <= (((centreZoneZ + 6) / 8) | 0); z++) {
            squares.push([x, z, x * 64 - baseX, z * 64 - baseZ]);
        }
    }

    // Ground for every square first - loadLocations reads mapl[1] for the
    // LinkBelow bridge adjustment, so it must already be populated.
    for (const [mx, mz, ox, oz] of squares) {
        const entry = lookup(zip, landFile.get((mx << 8) + mz));
        if (entry) {
            build.loadGround(gunzipSync(entry), baseX, baseZ, ox, oz);
        }
    }
    for (const [mx, mz, ox, oz] of squares) {
        const entry = lookup(zip, locFile.get((mx << 8) + mz));
        if (entry) {
            build.loadLocations(gunzipSync(entry), ox, oz, null, maps);
        }
    }
    build.finishBuild(null, maps);

    return maps;
}

function lookup(zip: Record<string, Uint8Array>, file: number | undefined): Uint8Array | null {
    return file === undefined ? null : (zip[`4.${file}`] ?? null);
}

async function get(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`lite test: GET ${url} failed with ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
}
