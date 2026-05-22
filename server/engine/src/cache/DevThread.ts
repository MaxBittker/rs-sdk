import fs from 'fs';
import path from 'path';
import { parentPort } from 'worker_threads';

import { packAll } from '#tools/pack/PackAll.js';
import Environment from '#/util/Environment.js';

// todo: this file queue is so the rebuild/reload process can utilize the additional context
let processNextQueue: Set<string> = new Set();
let processNextTimeout: NodeJS.Timeout | null = null;

// prevent other file change events from building multiple times
let active = false;
const watchedDirs = new Set<string>();

async function processChangedFiles() {
    active = true;

    // in case another event happens during build we can queue it up for the next change event
    // by copying the old set and creating a new one for the next events
    const queue = processNextQueue;
    processNextQueue = new Set();

    try {
        const modelFlags: number[] = [];
        await packAll(modelFlags);

        if (parentPort) {
            parentPort.postMessage({
                type: 'dev_reload',
                queue
            });
        }
    } catch (err: unknown) {
        if (parentPort) {
            parentPort.postMessage({
                type: 'dev_failure',
                error: err instanceof Error ? err.message : undefined
            });
        }

        // console.log(err);
    }

    processNextTimeout = null;
    active = false;

    if (processNextQueue.size > 0) {
        // if another event happened during build we prepare to build again
        processNextTimeout = setTimeout(processChangedFiles, 1000);
    }
}

function trackFileChange(filename: string) {
    processNextQueue.add(filename);

    if (active) {
        return;
    }

    if (processNextTimeout) {
        // we want to wait an additional period of time instead of trying to fit this change in on the next run
        clearTimeout(processNextTimeout);
    }

    processNextTimeout = setTimeout(processChangedFiles, 1000);
}

function trackDir(dir: string) {
    if (watchedDirs.has(dir)) {
        return;
    }

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    watchedDirs.add(dir);
    fs.watch(dir, (_event, filename) => {
        if (!filename) {
            return;
        }

        const full = path.join(dir, filename.toString());
        trackFileChange(full);

        try {
            if (fs.statSync(full).isDirectory()) {
                trackDir(full);
            }
        } catch {
            // The path may have been removed or replaced between the watch event and stat.
        }
    });

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) {
            trackDir(full);
        }
    }
}

if (parentPort) {
    parentPort.on('message', msg => {
        if (msg.type === 'world_rebuild') {
            processNextTimeout = setTimeout(processChangedFiles, 1000);
        }
    });
}

trackDir(`${Environment.build.srcDir}/maps`);
trackDir(`${Environment.build.srcDir}/songs`);
trackDir(`${Environment.build.srcDir}/jingles`);
trackDir(`${Environment.build.srcDir}/binary`);
trackDir(`${Environment.build.srcDir}/fonts`);
trackDir(`${Environment.build.srcDir}/title`);
trackDir(`${Environment.build.srcDir}/scripts`);
trackDir(`${Environment.build.srcDir}/sprites`);
trackDir(`${Environment.build.srcDir}/models`);
trackDir(`${Environment.build.srcDir}/textures`);
trackDir(`${Environment.build.srcDir}/synth`);
trackDir(`${Environment.build.srcDir}/wordenc`);
