import fs from 'fs';
import fsp from 'fs/promises';
import forge from 'node-forge';
import { parentPort } from 'worker_threads';

import Packet from '#jagex2/io/Packet.js';

import { toBase37, toSafeName } from '#jagex2/jstring/JString.js';

import { CrcBuffer32 } from '#lostcity/cache/CrcTable.js';

import { LoginClient } from '#lostcity/server/LoginServer.js';

import Environment from '#lostcity/util/Environment.js';

if (!parentPort) throw new Error('This file must be run as a worker thread.');

const priv = forge.pki.privateKeyFromPem(fs.readFileSync('data/config/private.pem', 'ascii'));

parentPort.on('message', async msg => {
    try {
        if (!parentPort) throw new Error('This file must be run as a worker thread.');

        switch (msg.type) {
            case 'reset': {
                if (!Environment.LOGIN_KEY) {
                    return;
                }

                const login = new LoginClient();
                await login.reset();
                break;
            }
            case 'heartbeat': {
                if (!Environment.LOGIN_KEY) {
                    return;
                }

                const login = new LoginClient();
                await login.heartbeat(msg.players);
                break;
            }
            case 'loginreq': {
                const { opcode, data, socket } = msg;

                const stream = new Packet(data);

                const revision = stream.g1();
                if (revision !== 225) {
                    parentPort.postMessage({
                        type: 'loginreply',
                        status: 6,
                        socket
                    });
                    return;
                }

                const info = stream.g1();

                const crcs = stream.gdata(9 * 4);
                if (Packet.crc32(crcs) !== CrcBuffer32) {
                    parentPort.postMessage({
                        type: 'loginreply',
                        status: 6,
                        socket
                    });
                    return;
                }

                stream.rsadec(priv);

                if (stream.g1() !== 10) {
                    parentPort.postMessage({
                        type: 'loginreply',
                        status: 11,
                        socket
                    });
                    return;
                }

                const seed = [];
                for (let i = 0; i < 4; i++) {
                    seed[i] = stream.g4();
                }

                const uid = stream.g4();
                const username = toSafeName(stream.gjstr());
                const password = stream.gjstr();

                if (username.length < 1 || username.length > 12) {
                    parentPort.postMessage({
                        type: 'loginreply',
                        status: 3,
                        socket
                    });
                    return;
                }

                if (Environment.LOGIN_KEY) {
                    if (password.length < 5 || password.length > 20) {
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 3,
                            socket
                        });
                        return;
                    }

                    const login = new LoginClient();
                    const request = await login.load(toBase37(username), password, uid);

                    if (request.reply === 1 && request.data) {
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 2,
                            socket,
                            info,
                            seed,
                            username: toSafeName(username),
                            save: request.data.data
                        });
                    } else if ((request.reply === 2 || request.reply === 3) && opcode === 16) {
                        // new connection + already logged in
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 5,
                            socket
                        });
                        return;
                    } else if (request.reply === 3 && opcode === 18) {
                        // reconnection + already logged into another world (???)
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 5,
                            socket
                        });
                        return;
                    } else if (request.reply === 4) {
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 2,
                            socket,
                            info,
                            seed,
                            username: toSafeName(username),
                            save: new Uint8Array()
                        });
                    } else if (request.reply === 5) {
                        // invalid credentials (bad user or bad pass)
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 3,
                            socket
                        });
                        return;
                    } else if (request.reply === -1) {
                        // login server connection error
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 8,
                            socket
                        });
                        return;
                    } else {
                        parentPort.postMessage({
                            type: 'loginreply',
                            status: 11,
                            socket
                        });
                        return;
                    }
                } else {
                    let save = new Uint8Array();
                    if (fs.existsSync(`data/players/${username}.sav`)) {
                        save = await fsp.readFile(`data/players/${username}.sav`);
                    }

                    parentPort.postMessage({
                        type: 'loginreply',
                        status: 2,
                        socket,
                        info,
                        seed,
                        username: toSafeName(username),
                        save
                    });
                }
                break;
            }
            case 'logout': {
                const { username, save } = msg;

                if (Environment.LOGIN_KEY) {
                    const login = new LoginClient();
                    const reply = await login.save(toBase37(username), save);

                    if (reply === 0) {
                        parentPort.postMessage({
                            type: 'logoutreply',
                            username
                        });
                    }
                } else {
                    parentPort.postMessage({
                        type: 'logoutreply',
                        username
                    });
                }
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
