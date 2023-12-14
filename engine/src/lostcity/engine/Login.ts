import fs from 'fs';
import fsp from 'fs/promises';
import forge from 'node-forge';

import Isaac from '#jagex2/io/Isaac.js';
import Packet from '#jagex2/io/Packet.js';

import { toBase37 } from '#jagex2/jstring/JString.js';

import { CrcBuffer32 } from '#lostcity/cache/CrcTable.js';

import World from '#lostcity/engine/World.js';

import Player from '#lostcity/entity/Player.js';

import ClientSocket from '#lostcity/server/ClientSocket.js';
import { LoginClient, LoginError } from '#lostcity/server/LoginServer.js';

import Environment from '#lostcity/util/Environment.js';

const priv = forge.pki.privateKeyFromPem(fs.readFileSync('data/config/private.pem', 'ascii'));

class Login {
    async readIn(socket: ClientSocket, data: Packet) {
        const opcode = data.g1();

        if (opcode === 16 || opcode === 18) {
            const login = data.gPacket(data.g1());

            const revision = login.g1();
            if (revision !== 225) {
                socket.send(Uint8Array.from([6]));
                socket.close();
                return;
            }

            const info = login.g1();

            const crcs = login.gdata(9 * 4);
            if (Packet.crc32(crcs) !== CrcBuffer32) {
                socket.send(Uint8Array.from([6]));
                socket.close();
                return;
            }

            login.rsadec(priv);
            const magic = login.g1();
            if (magic !== 10) {
                socket.send(Uint8Array.from([11]));
                socket.close();
                return;
            }

            const seed = [];
            for (let i = 0; i < 4; i++) {
                seed.push(login.g4());
            }

            const uid = login.g4();
            let username = login.gjstr().toLowerCase();
            // if (username.length < 1 || username.length > 12) {
            //     socket.send(Uint8Array.from([3]));
            //     socket.close();
            //     return;
            // }
            if (!username.length) {
                username = 'Guest' + uid;
            }

            const password = login.gjstr();
            // if (password.length < 4 || password.length > 20) {
            //     socket.send(Uint8Array.from([3]));
            //     socket.close();
            //     return;
            // }

            if (World.getTotalPlayers() >= 2000) {
                socket.send(Uint8Array.from([7]));
                socket.close();
                return;
            }

            if (World.shutdownTick > -1 && World.currentTick - World.shutdownTick > 0) {
                socket.send(Uint8Array.from([14]));
                socket.close();
                return;
            }

            let sav = null;
            if (Environment.LOGIN_KEY) {
                const login = await LoginClient.load(toBase37(username), password);

                if (login.success) {
                    sav = login.data;
                } else if (login.error) {
                    if (login.code === LoginError.PLAYER_LOGGED_IN && opcode === 16) {
                        socket.send(Uint8Array.from([5]));
                        socket.close();
                        return;
                    } else if (login.code === LoginError.PLAYER_LOGGED_IN && opcode === 18) {
                        const world = login.data as number;

                        if (world !== Environment.WORLD_ID) {
                            // any other world we can immediately disconnect, otherwise we have to see
                            // if the player can reconnect
                            socket.send(Uint8Array.from([5]));
                            socket.close();
                            return;
                        }
                    } else if (login.code === LoginError.OFFLINE) {
                        socket.send(Uint8Array.from([8]));
                        socket.close();
                        return;
                    }
                }
            }

            let player = World.getPlayerByUsername(username);
            if ((opcode === 16 && player) || (opcode === 18 && !player) || (opcode === 18 && player && player.client !== null)) {
                socket.send(Uint8Array.from([5]));
                socket.close();
                return;
            }

            // todo: some isaac-related issue on webclient establishing new connections (race condition somewhere?)
            socket.decryptor = new Isaac(seed);
            for (let i = 0; i < 4; i++) {
                seed[i] += 50;
            }
            socket.encryptor = new Isaac(seed);

            if (!player) {
                if (Environment.LOGIN_KEY) {
                    if (sav !== null) {
                        // write to fs in case something goes wrong, we have a backup
                        await fsp.writeFile(`data/players/${username}.sav`, sav as Uint8Array);
                    }
                }

                player = Player.load(username);
                World.addPlayer(player, socket);
            } else {
                player.logoutRequested = false;
                player.netOut = []; // clear old packets
                player.playerIds = []; // clear old observed players
                player.npcIds = []; // clear old observed npcs
                player.loadedX = -1; // reload area
                player.loadedZ = -1;
                player.tele = true;
                player.jump = true;

                socket.state = 1;
                socket.send(Uint8Array.from([15]));
            }

            player.client = socket;
            player.lowMemory = (info & 0x1) === 1;
            player.webClient = socket.isWebSocket();
        } else {
            socket.close();
        }
    }
}

export default new Login();
