import fs from 'fs';
import { parentPort } from 'worker_threads';

import { LoginClient } from '#/server/login/LoginClient.js';
import Environment from '#/util/Environment.js';

import { type GenericLoginThreadResponse } from './index.d.js';
import { trackLoginAttempts, trackLoginTime } from './LoginMetrics.js';

const client = new LoginClient(Environment.node.id);

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
    postMessage: (msg: GenericLoginThreadResponse) => void;
};

async function handleRequests(parentPort: ParentPort, msg: any) {
    const { type } = msg;

    switch (type) {
        case 'world_startup': {
            if (Environment.login.enabled) {
                await client.worldStartup();
            }
            break;
        }
        case 'player_login': {
            const { socket, remoteAddress, username, password, uid, lowMemory, reconnecting, hasSave } = msg;

            if (Environment.login.enabled) {
                trackLoginAttempts.inc();
                const stopTimer = trackLoginTime.startTimer();
                const response = await client.playerLogin(username, password, uid, socket, remoteAddress, reconnecting, hasSave);

                parentPort.postMessage({
                    type: 'player_login',
                    socket,
                    username,
                    lowMemory,
                    reconnecting,
                    ...response
                });
                stopTimer();
            } else {
                // rs-sdk: do not auto-grant dev staffmodlevel on non-production worlds (public server)
                const staffmodlevel = 0;

                const profile = Environment.node.profile;
                if (!fs.existsSync(`data/players/${profile}`)) {
                    fs.mkdirSync(`data/players/${profile}`, { recursive: true });
                }

                if (!fs.existsSync(`data/players/${profile}/${username}.sav`)) {
                    parentPort.postMessage({
                        type: 'player_login',
                        socket,
                        username,
                        lowMemory,
                        reconnecting,
                        reply: 4,
                        staffmodlevel,
                        save: null,
                        account_id: 1,
                        members: Environment.node.members
                    });
                } else {
                    parentPort.postMessage({
                        type: 'player_login',
                        socket,
                        username,
                        lowMemory,
                        reconnecting,
                        reply: 0,
                        staffmodlevel,
                        save: fs.readFileSync(`data/players/${profile}/${username}.sav`),
                        account_id: 1,
                        members: Environment.node.members
                    });
                }
            }
            break;
        }
        case 'player_logout': {
            const { username, save } = msg;

            if (Environment.login.enabled) {
                const success = await client.playerLogout(username, save);

                parentPort.postMessage({
                    type: 'player_logout',
                    username,
                    success
                });
            } else {
                const profile = Environment.node.profile;
                if (!fs.existsSync(`data/players/${profile}`)) {
                    fs.mkdirSync(`data/players/${profile}`, { recursive: true });
                }

                fs.writeFileSync(`data/players/${profile}/${username}.sav`, save);

                parentPort.postMessage({
                    type: 'player_logout',
                    username,
                    success: true
                });
            }
            break;
        }
        case 'player_autosave': {
            const { username, save } = msg;

            if (Environment.login.enabled) {
                await client.playerAutosave(username, save);
            } else {
                const profile = Environment.node.profile;
                if (!fs.existsSync(`data/players/${profile}`)) {
                    fs.mkdirSync(`data/players/${profile}`, { recursive: true });
                }

                fs.writeFileSync(`data/players/${profile}/${username}.sav`, save);
            }
            break;
        }
        case 'player_force_logout': {
            if (Environment.login.enabled) {
                const { username } = msg;
                await client.playerForceLogout(username);
            }
            break;
        }
        case 'player_ban': {
            if (Environment.login.enabled) {
                // todo: wait for confirmation? resend?
                const { staff, username, until } = msg;
                await client.playerBan(staff, username, until);
            }
            break;
        }
        case 'player_mute': {
            if (Environment.login.enabled) {
                // todo: wait for confirmation? resend?
                const { staff, username, until } = msg;
                await client.playerMute(staff, username, until);
            }
            break;
        }
        case 'world_heartbeat': {
            break;
        }
        default:
            console.error('Unknown message type: ' + msg.type);
            break;
    }
}
