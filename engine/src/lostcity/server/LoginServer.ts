import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';
import bcrypt from 'bcrypt';

import Packet from '#jagex2/io/Packet.js';

import { fromBase37 } from '#jagex2/jstring/JString.js';

import { db } from '#lostcity/db/query.js';

import NetworkStream from '#lostcity/server/NetworkStream.js';

import Environment from '#lostcity/util/Environment.js';

export class LoginResponse {
    static readonly SUCCESSFUL: Uint8Array = Uint8Array.from([2]);
    static readonly INVALID_USER_OR_PASS: Uint8Array = Uint8Array.from([3]); // Invalid username or password.
    static readonly ACCOUNT_DISABLED: Uint8Array = Uint8Array.from([4]); // Your account has been disabled.
    static readonly LOGGED_IN: Uint8Array = Uint8Array.from([5]); // Your account is already logged in.
    static readonly SERVER_UPDATED: Uint8Array = Uint8Array.from([6]); // RuneScape has been updated!
    static readonly WORLD_FULL: Uint8Array = Uint8Array.from([7]); // This world is full.
    static readonly LOGIN_SERVER_OFFLINE: Uint8Array = Uint8Array.from([8]); // Unable to connect.
    static readonly LOGIN_LIMIT_EXCEEDED: Uint8Array = Uint8Array.from([9]); // Login limit exceeded.
    static readonly UNABLE_TO_CONNECT: Uint8Array = Uint8Array.from([10]); // Unable to connect.
    static readonly LOGIN_REJECTED: Uint8Array = Uint8Array.from([11]); // Login server rejected session.
    static readonly NEED_MEMBERS_ACCOUNT: Uint8Array = Uint8Array.from([12]); // You need a members account to login to this world.
    static readonly COULD_NOT_COMPLETE: Uint8Array = Uint8Array.from([13]); // Could not complete login.
    static readonly SERVER_UPDATING: Uint8Array = Uint8Array.from([14]); // The server is being updated.
    static readonly RECONNECTING: Uint8Array = Uint8Array.from([15]);
    static readonly LOGIN_ATTEMPTS_EXCEEDED: Uint8Array = Uint8Array.from([16]); // Login attempts exceeded.
    static readonly STANDING_IN_MEMBERS: Uint8Array = Uint8Array.from([17]); // You are standing in a members-only area.
    static readonly STAFF_MOD_LEVEL: Uint8Array = Uint8Array.from([18]);
}

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
                const data = new Packet(new Uint8Array(3));
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
                    const password = data.gjstr();
                    const uid = data.g4();

                    if (!this.players[world]) {
                        this.players[world] = [];
                    }

                    const username = fromBase37(username37);
                    const account = await db.selectFrom('account').where('username', '=', username).selectAll().executeTakeFirst();
                    if (!account || !(await bcrypt.compare(password.toLowerCase(), account.password))) {
                        // invalid credentials (bad user or bad pass)
                        const reply = new Packet(new Uint8Array(1));
                        reply.p1(5);
                        await this.write(socket, reply.data);
                        return;
                    }

                    if (this.players[world].includes(username37)) {
                        // logged into this world (reconnect logic)
                        const reply = new Packet(new Uint8Array(1));
                        reply.p1(2);
                        await this.write(socket, reply.data);
                        return;
                    }

                    for (let i = 0; i < this.players.length; i++) {
                        if (!this.players[i]) {
                            continue;
                        }

                        if (this.players[i].includes(username37)) {
                            // logged into another world
                            const reply = new Packet(new Uint8Array(1));
                            reply.p1(3);
                            await this.write(socket, reply.data);
                            return;
                        }
                    }

                    this.players[world].push(username37);

                    if (!fs.existsSync(`data/players/${username}.sav`)) {
                        // new player save
                        const reply = new Packet(new Uint8Array(1));
                        reply.p1(4);
                        await this.write(socket, reply.data);
                        return;
                    }

                    const save = await fsp.readFile(`data/players/${username}.sav`);
                    const reply = new Packet(new Uint8Array(save.length + 2 + 1));
                    reply.p1(1);
                    reply.p2(save.length);
                    reply.pdata(save, 0, save.length);
                    await this.write(socket, reply.data);
                } else if (opcode === 2) {
                    // logout
                    const world = data.g2();
                    const username37 = data.g8();
                    const saveLength = data.g2();
                    const save = new Uint8Array(saveLength);
                    data.gdata(save, 0, save.length);

                    const username = fromBase37(username37);
                    await fsp.writeFile(`data/players/${username}.sav`, save);

                    if (!this.players[world]) {
                        this.players[world] = [];
                    }

                    const index = this.players[world].indexOf(username37);
                    if (index > -1) {
                        this.players[world].splice(index, 1);
                    }

                    const reply = new Packet(new Uint8Array(1));
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

                    const reply = new Packet(new Uint8Array(2));
                    reply.p2(this.players[world].length);
                    await this.write(socket, reply.data);
                } else if (opcode === 5) {
                    // heartbeat/check in - update player list (used for re-syncing right now... weird bug)
                    const world = data.g2();
                    this.players[world] = [];

                    const count = data.g2();
                    for (let i = 0; i < count; i++) {
                        const username37 = data.g8();
                        this.players[world].push(username37);
                    }
                }
            });

            socket.on('close', () => {});
            socket.on('error', () => {});
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

        const packet = new Packet(new Uint8Array(1 + 2 + (data !== null ? data?.length : 0)));
        packet.p1(opcode);
        if (data !== null) {
            packet.p2(data.length);
            packet.pdata(data, 0, data.length);
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

    async load(username37: bigint, password: string, uid: number): Promise<{ reply: number; data: Packet | null }> {
        await this.connect();

        if (this.socket === null) {
            return { reply: -1, data: null };
        }

        const request = new Packet(new Uint8Array(2 + 8 + password.length + 1 + 4));
        request.p2(Environment.WORLD_ID as number);
        request.p8(username37);
        request.pjstr(password);
        request.p4(uid);
        await this.write(this.socket, 1, request.data);

        const reply = await this.stream.readByte(this.socket);
        if (reply !== 1) {
            this.disconnect();
            return { reply, data: null };
        }

        const data = new Packet(new Uint8Array(2));
        await this.stream.readBytes(this.socket, data, 0, 2);

        const length = data.g2();
        const data2 = new Packet(new Uint8Array(length));
        await this.stream.readBytes(this.socket, data2, 0, length);
        const out = new Packet(new Uint8Array(2 + length));
        out.pdata(data.data, 0, data.data.length);
        out.pdata(data2.data, 0, data2.data.length);

        this.disconnect();
        return { reply, data: out };
    }

    async save(username37: bigint, save: Packet) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(2 + 8 + 2 + save.data.length));
        request.p2(Environment.WORLD_ID as number);
        request.p8(username37);
        request.p2(save.data.length);
        request.pdata(save.data, 0, save.data.length);
        save.release();
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

        const request = new Packet(new Uint8Array(2));
        request.p2(Environment.WORLD_ID as number);
        await this.write(this.socket, 3, request.data);

        this.disconnect();
    }

    async count(world: number) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(2));
        request.p2(world);
        await this.write(this.socket, 4, request.data);

        const reply = new Packet(new Uint8Array(2));
        await this.stream.readBytes(this.socket, reply, 0, 2);

        const count = reply.g2();

        this.disconnect();
        return count;
    }

    async heartbeat(players: bigint[]) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(2 + 2 + (players.length * 8)));
        request.p2(Environment.WORLD_ID as number);
        request.p2(players.length);
        for (const player of players) {
            request.p8(player);
        }
        await this.write(this.socket, 5, request.data);

        this.disconnect();
    }
}
