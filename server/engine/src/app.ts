import fs from 'fs';

import { collectDefaultMetrics, register } from 'prom-client';

import { packAll } from '#tools/pack/PackAll.js';
import World from '#/engine/World.js';
import TcpServer from '#/server/tcp/TcpServer.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';
import { startManagementWeb, startWeb } from '#/web.js';
import OnDemand from '#/engine/OnDemand.js';
import { createRuntimeWorker } from '#/util/RuntimeWorker.js';

if (OnDemand.cache.count(0) !== 9 || OnDemand.cache.count(2) === 0 || !fs.existsSync('data/pack/server/script.dat')) {
    printInfo('Packing cache, please wait until you see the world is ready.');

    try {
        // todo: different logic so the main thread doesn't have to load pack files
        const modelFlags: number[] = [];
        await packAll(modelFlags);
    } catch (err) {
        if (err instanceof Error) {
            printError(err);
        }

        process.exit(1);
    }
}

if (Environment.easyStartup) {
    createRuntimeWorker(new URL('./login.ts', import.meta.url));
    createRuntimeWorker(new URL('./friend.ts', import.meta.url));
    createRuntimeWorker(new URL('./logger.ts', import.meta.url));
}

await World.start();

const tcpServer = new TcpServer();
tcpServer.start();

await startWeb();
await startManagementWeb();

register.setDefaultLabels({ nodeId: Environment.node.id });
collectDefaultMetrics({ register });

// bun does not give us a signal to gracefully shut down in our dev mode...
let exiting = false;
function safeExit() {
    if (exiting) {
        return;
    }

    exiting = true;
    World.rebootTimer(0);
}

process.on('SIGINT', safeExit);
process.on('SIGTERM', safeExit);

process.on('uncaughtException', function (err) {
    console.error(err, 'Uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error({ promise, reason }, 'Unhandled Rejection at: Promise');
});
