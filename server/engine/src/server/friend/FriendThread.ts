import { parentPort } from 'worker_threads';

import { FriendClient, FriendsServerOpcodes } from '#/server/friend/FriendServer.js';
import Environment from '#/util/Environment.js';

const client = new FriendClient(Environment.node.id);

export interface FriendThreadMessage {
    opcode: FriendsServerOpcodes;
    data: any;
}

if (!parentPort) throw new Error('This file must be run as a worker thread.');

parentPort.on('message', async msg => {
    try {
        if (!parentPort) throw new Error('This file must be run as a worker thread.');
        await handleRequests(parentPort, msg);
    } catch (err) {
        console.error(err);
    }
});

client.onMessage((opcode, data) => {
    parentPort!.postMessage({ opcode, data });
});

type ParentPort = {
    postMessage: (msg: any) => void;
};

async function handleRequests(_parentPort: ParentPort, msg: any) {
    switch (msg.type) {
        case 'connect': {
            if (Environment.friend.enabled) {
                await client.worldConnect();
            }
            break;
        }
        case 'player_login': {
            if (Environment.friend.enabled) {
                const { username, chatModePrivate, staffLvl } = msg;
                await client.playerLogin(username, chatModePrivate, staffLvl);
            }
            break;
        }
        case 'player_logout': {
            if (Environment.friend.enabled) {
                const { username } = msg;
                await client.playerLogout(username);
            }
            break;
        }
        case 'player_friendslist_add': {
            if (Environment.friend.enabled) {
                const { username, target } = msg;
                await client.playerFriendslistAdd(username, target);
            }
            break;
        }
        case 'player_friendslist_remove': {
            if (Environment.friend.enabled) {
                const { username, target } = msg;
                await client.playerFriendslistRemove(username, target);
            }
            break;
        }
        case 'player_ignorelist_add': {
            if (Environment.friend.enabled) {
                const { username, target } = msg;
                await client.playerIgnorelistAdd(username, target);
            }
            break;
        }
        case 'player_ignorelist_remove': {
            if (Environment.friend.enabled) {
                const { username, target } = msg;
                await client.playerIgnorelistRemove(username, target);
            }
            break;
        }
        case 'player_chat_setmode': {
            if (Environment.friend.enabled) {
                const { username, chatModePrivate } = msg;
                await client.playerChatSetMode(username, chatModePrivate);
            }
            break;
        }
        case 'private_message': {
            if (Environment.friend.enabled) {
                const { username, staffLvl, pmId, target, message, coord } = msg;
                await client.privateMessage(username, staffLvl, pmId, target, message, coord);
            }
            break;
        }
        case 'public_message': {
            if (Environment.friend.enabled) {
                const { session_uuid, coord, chat } = msg;
                await client.publicMessage(session_uuid, coord, chat);
            }
            break;
        }
        default:
            console.error('Unknown message type: ' + msg.type);
            break;
    }
}
