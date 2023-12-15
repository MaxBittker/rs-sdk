import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';

import Packet from '#jagex2/io/Packet.js';

import { fromBase37, toBase37 } from '#jagex2/jstring/JString.js';

import NetworkStream from '#lostcity/server/NetworkStream.js';

import Environment from '#lostcity/util/Environment.js';

export class LoginServer {
    private server: net.Server;
    private players: bigint[][] = [];

    constructor() {
        this.server = net.createServer();
    }

    start() {
        this.server.on('connection', socket => {
            socket.setNoDelay(true);
            socket.setTimeout(5000);

            const stream = new NetworkStream();

            socket.on('data', async buf => {
                stream.received(buf);
                if (stream.waiting > stream.available) {
                    return;
                }

                stream.waiting = 0;
                const data = new Packet();
                await stream.readBytes(socket, data, 0, 3);

                const opcode = data.g1();
                const length = data.g2();
                if (stream.available < length) {
                    stream.waiting = length - stream.available;
                    return;
                }

                await stream.readBytes(socket, data, 0, length);

                if (opcode === 1) {
                    // login
                    const world = data.g2();
                    const username37 = data.g8();

                    if (!this.players[world]) {
                        this.players[world] = [];
                    }

                    if (this.players[world].includes(username37)) {
                        // logged into this world (reconnect logic)
                        const reply = new Packet();
                        reply.p1(1);
                        await this.write(socket, reply.data);
                        return;
                    }

                    for (let i = 0; i < this.players.length; i++) {
                        if (!this.players[i]) {
                            continue;
                        }

                        if (this.players[i].includes(username37)) {
                            // logged into another world
                            const reply = new Packet();
                            reply.p1(2);
                            await this.write(socket, reply.data);
                            return;
                        }
                    }

                    this.players[world].push(username37);

                    const username = fromBase37(username37);
                    if (!fs.existsSync(`data/players/${username}.sav`)) {
                        // new player save
                        const reply = new Packet();
                        reply.p1(3);
                        await this.write(socket, reply.data);
                        return;
                    }

                    const save = await fsp.readFile(`data/players/${username}.sav`);
                    const reply = new Packet();
                    reply.p1(0);
                    reply.p2(save.length);
                    reply.pdata(save);
                    await this.write(socket, reply.data);
                } else if (opcode === 2) {
                    // logout
                    const world = data.g2();
                    const username37 = data.g8();
                    const saveLength = data.g2();
                    const save = data.gdata(saveLength);

                    const username = fromBase37(username37);
                    await fsp.writeFile(`data/players/${username}.sav`, save);

                    const index = this.players[world].indexOf(username37);
                    if (index > -1) {
                        this.players[world].splice(index, 1);
                    }

                    const reply = new Packet();
                    reply.p1(0);
                    await this.write(socket, reply.data);
                } else if (opcode === 3) {
                    // reset world
                    const world = data.g2();

                    if (!this.players[world]) {
                        this.players[world] = [];
                    }

                    this.players[world] = [];
                } else if (opcode === 4) {
                    // count players
                    const world = data.g2();

                    if (!this.players[world]) {
                        this.players[world] = [];
                    }

                    const reply = new Packet();
                    reply.p2(this.players[world].length);
                    await this.write(socket, reply.data);
                }
            });

            socket.on('close', () => { });
            socket.on('error', () => { });
        });

        this.server.listen({ port: Environment.LOGIN_PORT, host: '0.0.0.0' }, () => {
            console.log(`[Login]: Listening on port ${Environment.LOGIN_PORT}`);
        });
    }

    private async write(socket: net.Socket, data: Uint8Array | Buffer, full: boolean = true) {
        if (socket === null) {
            return;
        }

        const done = socket.write(data);

        if (!done && full) {
            await new Promise<void>(res => {
                const interval = setInterval(() => {
                    if (socket === null || socket.closed) {
                        clearInterval(interval);
                        res();
                    }
                }, 100);

                socket.once('drain', () => {
                    clearInterval(interval);
                    res();
                });
            });
        }
    }
}

export class LoginClient {
    private socket: net.Socket | null = null;
    private stream: NetworkStream = new NetworkStream();

    async connect() {
        if (this.socket) {
            return;
        }

        return new Promise<void>(res => {
            this.socket = net.createConnection({
                port: Environment.LOGIN_PORT as number,
                host: Environment.LOGIN_HOST as string
            });

            this.socket.setNoDelay(true);
            this.socket.setTimeout(1000);

            this.socket.on('data', async buf => {
                this.stream.received(buf);
            });

            this.socket.once('close', () => {
                this.disconnect();
                res();
            });

            this.socket.once('error', () => {
                this.disconnect();
                res();
            });

            this.socket.once('connect', () => {
                res();
            });
        });
    }

    disconnect() {
        if (this.socket === null) {
            return;
        }

        this.socket.destroy();
        this.socket = null;
        this.stream.clear();
    }

    private async write(socket: net.Socket, opcode: number, data: Uint8Array | null = null, full: boolean = true) {
        if (socket === null) {
            return;
        }

        const packet = new Packet();
        packet.p1(opcode);
        if (data !== null) {
            packet.p2(data.length);
            packet.pdata(data);
        } else {
            packet.p2(0);
        }
        const done = socket.write(packet.data);

        if (!done && full) {
            await new Promise<void>(res => {
                const interval = setInterval(() => {
                    if (socket === null || socket.closed) {
                        clearInterval(interval);
                        res();
                    }
                }, 100);

                socket.once('drain', () => {
                    clearInterval(interval);
                    res();
                });
            });
        }
    }

    async load(username37: bigint, _password: string): Promise<{ reply: number, data: Packet | null }> {
        await this.connect();

        if (this.socket === null) {
            return { reply: -1, data: null };
        }

        const request = new Packet();
        request.p2(Environment.WORLD_ID as number);
        request.p8(username37);
        await this.write(this.socket, 1, request.data);

        const reply = await this.stream.readByte(this.socket);
        if (reply !== 0) {
            this.disconnect();
            return { reply, data: null };
        }

        const data = new Packet();
        await this.stream.readBytes(this.socket, data, 0, 2);

        const length = data.g2();
        await this.stream.readBytes(this.socket, data, 0, length);

        this.disconnect();
        return { reply, data };
    }

    async save(username37: bigint, save: Packet | Uint8Array | Buffer) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet();
        request.p2(Environment.WORLD_ID as number);
        request.p8(username37);
        request.p2(save.length);
        request.pdata(save);
        await this.write(this.socket, 2, request.data);

        const reply = await this.stream.readByte(this.socket);
        this.disconnect();
        return reply;
    }

    async reset() {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet();
        request.p2(Environment.WORLD_ID as number);
        await this.write(this.socket, 3, request.data);

        this.disconnect();
    }

    async count(world: number) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet();
        request.p2(world);
        await this.write(this.socket, 4, request.data);

        const reply = new Packet();
        await this.stream.readBytes(this.socket, reply, 0, 2);

        const count = reply.g2();

        this.disconnect();
        return count;
    }
}
