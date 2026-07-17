#!/usr/bin/env bun
// Refreshes sdk/collision-data.json, which sdk/pathfinding.ts imports directly.
// The file IS tracked in git, so a clone already has a working copy — this script
// is for regenerating it after map changes, or pulling from a non-default server.
// Commit the result: a stale tracked copy is how 442-vs-483 mapsquare drift crept
// in before. Requires --force to overwrite an existing file.
import { existsSync, statSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const DEFAULT_SERVER = 'https://rs-sdk-demo.fly.dev';
const OUTPUT_PATH = join(import.meta.dir, 'collision-data.json');

async function fetchCollisionData(server: string, force: boolean) {
    if (existsSync(OUTPUT_PATH) && !force) {
        const mb = (statSync(OUTPUT_PATH).size / 1_000_000).toFixed(1);
        console.log(`collision-data.json already present (${mb}MB) - skipping. Use --force to refresh.`);
        return;
    }

    const url = `${server}/api/exportCollision`;
    console.log(`Fetching collision data from ${url} ...`);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} returned ${response.status} ${response.statusText}`);
    }

    // Buffer fully before writing so an interrupted download can't leave a
    // truncated file behind — pathfinding.ts would fail to parse it on import.
    const body = await response.arrayBuffer();
    if (body.byteLength === 0) {
        throw new Error(`${url} returned an empty body`);
    }

    await writeFile(OUTPUT_PATH, new Uint8Array(body));
    const mb = (body.byteLength / 1_000_000).toFixed(1);
    console.log(`Wrote ${OUTPUT_PATH} (${mb}MB)`);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const serverArg = args.find(a => a.startsWith('--server='))?.split('=')[1];
const server = serverArg || process.env.COLLISION_SERVER || DEFAULT_SERVER;

try {
    await fetchCollisionData(server, force);
} catch (e) {
    console.error(`\nFailed to fetch collision data: ${e instanceof Error ? e.message : e}`);
    console.error('Pathfinding (sdk/pathfinding.ts) will not work until this file exists.');
    console.error(`Retry with:  bun sdk/fetch-collision-data.ts --force --server=${server}`);
    process.exit(1);
}
