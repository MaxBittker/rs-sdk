import { Worker } from 'worker_threads';

import Isaac from '#jagex2/io/Isaac.js';
import Packet from '#jagex2/io/Packet.js';

import World from '#lostcity/engine/World.js';

import Player from '#lostcity/entity/Player.js';

import ClientSocket from '#lostcity/server/ClientSocket.js';
import { PlayerLoading } from '#lostcity/entity/PlayerLoading.js';
import { createWorker } from '#lostcity/util/WorkerFactory.js';
import {LoginResponse} from '#lostcity/server/LoginServer.js';
import { CrcBuffer32 } from '#lostcity/server/CrcTable.js';
import Environment from '#lostcity/util/Environment.js';

class Login {
    loginThread: Worker = createWorker('./src/lostcity/server/LoginThread.ts');
    loginRequests: Map<string, ClientSocket> = new Map();
    logoutRequests: Set<bigint> = new Set();

    constructor() {
        this.loginThread.on('message', msg => {
            try {
                this.onMessage(msg);
            } catch (err) {
                console.error('Login Thread:', err);
            }
        });
    }

    async readIn(socket: ClientSocket, data: Packet) {
        const opcode = data.g1();

        // todo: reconnect (opcode 18)
        if (opcode === 16) {
            const length = data.g1();
            if (data.available < length) {
                socket.terminate();
                return;
            }

            const post = new Uint8Array(length);
            data.gdata(post, 0, post.length);
            data.pos -= post.length;

            const revision = data.g1();
            if (revision !== 225) {
                socket.writeImmediate(LoginResponse.SERVER_UPDATED);
                return;
            }

            data.pos += 1;

            const crcs = new Uint8Array(9 * 4);
            data.gdata(crcs, 0, crcs.length);
            if (!Packet.checkcrc(crcs, 0, crcs.length, CrcBuffer32)) {
                socket.writeImmediate(LoginResponse.SERVER_UPDATED);
                return;
            }

            this.loginThread.postMessage({
                type: 'loginreq',
                opcode,
                data: post,
                socket: socket.uniqueId
            });

            this.loginRequests.set(socket.uniqueId, socket);
        } else {
            socket.terminate();
        }
    }

    logout(player: Player) {
        if (this.logoutRequests.has(player.username37)) {
            return;
        }

        const save = player.save();
        this.loginThread.postMessage({
            type: 'logout',
            username: player.username,
            save: save.data.subarray(0, save.pos)
        });
        save.release();
    }

    private onMessage(msg: any) {
        switch (msg.type) {
            case 'loginreply': {
                const { status, socket } = msg;

                const client = this.loginRequests.get(socket);
                if (!client) {
                    return;
                }

                this.loginRequests.delete(socket);

                if (status[0] !== 2) {
                    client.writeImmediate(status);
                    client.close();
                    return;
                }

                const { info, seed, username, save } = msg;

                if (World.getTotalPlayers() >= 2000) {
                    client.writeImmediate(LoginResponse.WORLD_FULL);
                    client.close();
                    return;
                }

                if (World.shutdownTick > -1 && World.currentTick - World.shutdownTick > 0) {
                    client.writeImmediate(LoginResponse.SERVER_UPDATING);
                    client.close();
                    return;
                }

                if (!Environment.LOGIN_KEY) {
                    // running without a login server
                    for (const player of World.players) {
                        if (player.username === username) {
                            client.writeImmediate(LoginResponse.LOGGED_IN);
                            client.close();
                            return;
                        }
                    }
                }

                client.decryptor = new Isaac(seed);
                for (let i = 0; i < 4; i++) {
                    seed[i] += 50;
                }
                client.encryptor = new Isaac(seed);

                const player = PlayerLoading.load(username, new Packet(save), client);
                player.lowMemory = (info & 0x1) !== 0;
                player.webClient = client.isWebSocket();

                World.addPlayer(player);
                break;
            }
            case 'logoutreply': {
                const { username } = msg;

                const player = World.getPlayerByUsername(username);
                if (player) {
                    World.getZone(player.x, player.z, player.level).leave(player);
                    World.players.remove(player.pid);
                    player.pid = -1;
                    player.terminate();

                    this.logoutRequests.delete(player.username37);
                }
                break;
            }
            default:
                throw new Error('Unknown message type: ' + msg.type);
        }
    }
}

export default new Login();
