import { parentPort } from 'worker_threads';

import { FriendClient } from '#lostcity/server/FriendServer.js';

import Environment from '#lostcity/util/Environment.js';

if (!parentPort) throw new Error('This file must be run as a worker thread.');

parentPort.on('message', async msg => {
    if (!Environment.FRIEND_KEY) return;

    try {
        if (!parentPort) throw new Error('This file must be run as a worker thread.');

        switch (msg.type) {
            case 'reset': {
                const client = new FriendClient();
                await client.reset();
                break;
            }
            case 'heartbeat': {
                const client = new FriendClient();
                await client.heartbeat(msg.players);
                break;
            }
            case 'login': {
                const client = new FriendClient();
                await client.login(msg.username);
                break;
            }
            case 'logout': {
                const client = new FriendClient();
                await client.logout(msg.username);
                break;
            }
            case 'latest': {
                // const client = new FriendClient();
                // const { messages, loggedInEvents, loggedOutEvents } = await client.latest();
                break;
            }
            case 'addfriend': {
                const client = new FriendClient();
                await client.addFriend(msg.player, msg.other);
                break;
            }
            case 'delfriend': {
                const client = new FriendClient();
                await client.delFriend(msg.player, msg.other);
                break;
            }
            case 'addignore': {
                const client = new FriendClient();
                await client.addIgnore(msg.player, msg.other);
                break;
            }
            case 'delignore': {
                const client = new FriendClient();
                await client.delIgnore(msg.player, msg.other);
                break;
            }
            case 'private_message': {
                const client = new FriendClient();
                await client.privateMessage(msg.from, msg.to, msg.text);
                break;
            }
            case 'public_message': {
                const client = new FriendClient();
                await client.publicMessage(msg.from, msg.text);
                break;
            }
            default:
                console.error('Unknown message type: ' + msg.type);
                break;
        }
    } catch (err) {
        console.error(err);
    }
});
