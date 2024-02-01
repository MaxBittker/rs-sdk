import 'dotenv/config';
import fs from 'fs';

import { startWeb } from '#lostcity/web/app.js';

import World from '#lostcity/engine/World.js';

import TcpServer from '#lostcity/server/TcpServer.js';
import WSServer from '#lostcity/server/WSServer.js';

import Environment from '#lostcity/util/Environment.js';

if (!fs.existsSync('.env')) {
    console.error('Missing .env file');
    console.error("Please make sure you have a .env file in the main directory, copy and rename .env.example if you don't have one");
    process.exit(1);
}

fs.mkdirSync('data/players', { recursive: true });

if (fs.existsSync('dump')) {
    fs.rmSync('dump', { recursive: true, force: true });
    fs.mkdirSync('dump', { recursive: true });
}

await World.start();

startWeb();

const tcpServer = new TcpServer();
tcpServer.start();

const wsServer = new WSServer();
wsServer.start();

let exiting = false;
process.on('SIGINT', function () {
    if (exiting) {
        return;
    }

    exiting = true;

    if (Environment.LOCAL_DEV) {
        World.rebootTimer(0);
    } else {
        World.rebootTimer(Environment.SHUTDOWN_TIMER as number);
    }
});
