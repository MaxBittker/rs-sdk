import fs from 'fs';
import 'dotenv/config';

import { startWeb } from '#lostcity/web/app.js';

startWeb();

import TcpMaintenanceServer from '#lostcity/server/TcpMaintenanceServer.js';
import WSMaintenanceServer from '#lostcity/server/WSMaintenanceServer.js';

if (!fs.existsSync('.env')) {
    console.error('Missing .env file');
    console.error("Please make sure you have a .env file in the main directory, copy and rename .env.example if you don't have one");
    process.exit(1);
}

const tcpServer = new TcpMaintenanceServer();
tcpServer.start();

const wsServer = new WSMaintenanceServer();
wsServer.start();
