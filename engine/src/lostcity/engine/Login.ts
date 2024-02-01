import { Worker } from 'worker_threads';

import Isaac from '#jagex2/io/Isaac.js';
import Packet from '#jagex2/io/Packet.js';

import World from '#lostcity/engine/World.js';

import Player from '#lostcity/entity/Player.js';

import ClientSocket from '#lostcity/server/ClientSocket.js';

class Login {
    loginThread: Worker = new Worker('./src/lostcity/server/LoginThread.ts');
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

            this.loginThread.postMessage({
                type: 'loginreq',
                opcode,
                data: data.gdata(length),
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

        this.loginThread.postMessage({
            type: 'logout',
            username: player.username,
            save: player.save().data
        });
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

                if (status !== 2) {
                    client.writeImmediate(Uint8Array.from([status]));
                    client.terminate();
                    return;
                }

                const { info, seed, username, save } = msg;

                if (World.getTotalPlayers() >= 2000) {
                    client.writeImmediate(Uint8Array.from([7]));
                    client.terminate();
                    return;
                }

                if (World.shutdownTick > -1 && World.currentTick - World.shutdownTick > 0) {
                    client.writeImmediate(Uint8Array.from([14]));
                    client.terminate();
                    return;
                }

                client.decryptor = new Isaac(seed);
                for (let i = 0; i < 4; i++) {
                    seed[i] += 50;
                }
                client.encryptor = new Isaac(seed);

                const player = Player.load(username, new Packet(save));
                player.client = client;
                player.lowMemory = (info & 0x1) !== 0;
                player.webClient = client.isWebSocket();

                World.addPlayer(player, client);
                break;
            }
            case 'logoutreply': {
                const { username } = msg;

                const player = World.getPlayerByUsername(username);
                if (player) {
                    World.getZone(player.x, player.z, player.level).leave(player);

                    const index = World.playerIds[player.pid];
                    World.players[index] = null;
                    World.playerIds[player.pid] = -1;
                    player.pid = -1;
                    player.client = null;

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
