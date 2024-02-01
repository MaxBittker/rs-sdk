import 'dotenv/config';
import fs from 'fs';

import { FriendServer } from '#lostcity/server/FriendServer.js';

if (!fs.existsSync('.env')) {
    console.error('Missing .env file');
    console.error("Please make sure you have a .env file in the main directory, copy and rename .env.example if you don't have one");
    process.exit(1);
}

const friend = new FriendServer();
friend.start();
