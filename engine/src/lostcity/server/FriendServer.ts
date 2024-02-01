import net from 'net';

import Packet from '#jagex2/io/Packet.js';

import { db } from '#lostcity/db/query.js';

import NetworkStream from '#lostcity/server/NetworkStream.js';

import Environment from '#lostcity/util/Environment.js';
import { fromBase37, toDisplayName } from '#jagex2/jstring/JString.js';

export class FriendServer {
    private server: net.Server;

    private players: bigint[][] = [];
    private messageId: number = 0;
    private messages: {
        sender: bigint;
        messageId: number;
        staffModLevel: number;
        text: string;
    }[][] = [];
    private loggedInEvents: bigint[][] = [];
    private loggedOutEvents: bigint[][] = [];

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
                    // world reset
                    const world = data.g2();

                    this.players[world] = [];
                    this.messages[world] = [];
                    this.loggedInEvents[world] = [];
                    this.loggedOutEvents[world] = [];
                } else if (opcode === 2) {
                    // heartbeat
                    const world = data.g2();
                    this.players[world] = [];

                    const count = data.g2();
                    for (let i = 0; i < count; i++) {
                        const username37 = data.g8();
                        this.players[world].push(username37);
                    }
                } else if (opcode === 3) {
                    // player logged in
                    const world = data.g2();
                    const username = data.g8();

                    if (!this.players[world]) {
                        this.players[world] = [];
                        this.messages[world] = [];
                        this.loggedInEvents[world] = [];
                        this.loggedOutEvents[world] = [];
                    }

                    this.players[world].push(username);
                } else if (opcode === 4) {
                    // player logged out
                    const world = data.g2();
                    const username = data.g8();

                    if (!this.players[world]) {
                        this.players[world] = [];
                        this.messages[world] = [];
                        this.loggedInEvents[world] = [];
                        this.loggedOutEvents[world] = [];
                    }

                    const index = this.players[world].indexOf(username);
                    if (index > -1) {
                        this.players[world].splice(index, 1);
                    }
                } else if (opcode === 5) {
                    // get latest state (messages, players)
                    const world = data.g2();

                    if (!this.players[world]) {
                        this.players[world] = [];
                        this.messages[world] = [];
                        this.loggedInEvents[world] = [];
                        this.loggedOutEvents[world] = [];
                    }

                    const reply = new Packet();
                    reply.p2(this.messages[world].length);
                    for (const message of this.messages[world]) {
                        reply.p8(message.sender);
                        reply.p2(message.messageId);
                        reply.p1(message.staffModLevel);
                        reply.pjstr(message.text);
                    }
                    // todo: send state of each world
                    await this.write(socket, reply.data);
                } else if (opcode === 6) {
                    // add friend
                    const player = data.g8();
                    const other = data.g8();

                    const playerAcc = await db.selectFrom('account').where('username', '=', fromBase37(player)).selectAll().executeTakeFirst();
                    const otherAcc = await db.selectFrom('account').where('username', '=', fromBase37(other)).selectAll().executeTakeFirst();

                    if (!playerAcc || !otherAcc) {
                        return;
                    }

                    await db
                        .insertInto('friendlist')
                        .values({
                            account_id: playerAcc.id,
                            friend_account_id: otherAcc?.id
                        })
                        .ignore()
                        .execute();
                } else if (opcode === 7) {
                    // del friend
                    const player = data.g8();
                    const other = data.g8();

                    const playerAcc = await db.selectFrom('account').where('username', '=', fromBase37(player)).selectAll().executeTakeFirst();
                    const otherAcc = await db.selectFrom('account').where('username', '=', fromBase37(other)).selectAll().executeTakeFirst();

                    if (!playerAcc || !otherAcc) {
                        return;
                    }

                    await db.deleteFrom('friendlist').where('account_id', '=', playerAcc.id).where('friend_account_id', '=', otherAcc.id).execute();
                } else if (opcode === 8) {
                    // add ignore
                    const player = data.g8();
                    const other = data.g8();

                    const playerAcc = await db.selectFrom('account').where('username', '=', fromBase37(player)).selectAll().executeTakeFirst();
                    const otherAcc = await db.selectFrom('account').where('username', '=', fromBase37(other)).selectAll().executeTakeFirst();

                    if (!playerAcc || !otherAcc) {
                        return;
                    }

                    await db
                        .insertInto('ignorelist')
                        .values({
                            account_id: playerAcc.id,
                            ignore_account_id: otherAcc?.id
                        })
                        .ignore()
                        .execute();
                } else if (opcode === 9) {
                    // del ignore
                    const player = data.g8();
                    const other = data.g8();

                    const playerAcc = await db.selectFrom('account').where('username', '=', fromBase37(player)).selectAll().executeTakeFirst();
                    const otherAcc = await db.selectFrom('account').where('username', '=', fromBase37(other)).selectAll().executeTakeFirst();

                    if (!playerAcc || !otherAcc) {
                        return;
                    }

                    await db.deleteFrom('ignorelist').where('account_id', '=', playerAcc.id).where('ignore_account_id', '=', otherAcc.id).execute();
                } else if (opcode === 10) {
                    // log private message
                    const world = data.g2();
                    const from = data.g8();
                    const to = data.g8();
                    const message = data.gjstr();

                    let toWorld = -1;
                    for (let i = 0; i < this.players.length; i++) {
                        if (this.players[i].includes(to)) {
                            toWorld = i;
                            break;
                        }
                    }

                    const fromAcc = await db.selectFrom('account').where('username', '=', fromBase37(from)).selectAll().executeTakeFirst();

                    const toAcc = await db.selectFrom('account').where('username', '=', fromBase37(to)).selectAll().executeTakeFirst();

                    if (toWorld == -1 || !fromAcc || !toAcc) {
                        return;
                    }

                    if (!this.messages[toWorld]) {
                        this.players[toWorld] = [];
                        this.messages[toWorld] = [];
                        this.loggedInEvents[toWorld] = [];
                        this.loggedOutEvents[toWorld] = [];
                    }

                    this.messages[toWorld].push({
                        sender: from,
                        messageId: this.messageId++,
                        staffModLevel: 0,
                        text: message
                    });

                    await db
                        .insertInto('private_chat')
                        .values({
                            from_account_id: fromAcc.id,
                            to_account_id: toAcc.id,
                            message: message
                        })
                        .execute();
                } else if (opcode === 11) {
                    // log public message
                    const world = data.g2();
                    const from = data.g8();
                    const message = data.gjstr();

                    const fromAcc = await db.selectFrom('account').where('username', '=', fromBase37(from)).selectAll().executeTakeFirst();

                    if (!fromAcc) {
                        return;
                    }

                    await db
                        .insertInto('public_chat')
                        .values({
                            account_id: fromAcc.id,
                            message: message
                        })
                        .execute();
                }
            });

            socket.on('close', () => {});
            socket.on('error', () => {});
        });

        this.server.listen({ port: Environment.FRIEND_PORT, host: '0.0.0.0' }, () => {
            console.log(`[Friend]: Listening on port ${Environment.FRIEND_PORT}`);
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

export class FriendClient {
    private socket: net.Socket | null = null;
    private stream: NetworkStream = new NetworkStream();

    async connect() {
        if (this.socket) {
            return;
        }

        return new Promise<void>(res => {
            this.socket = net.createConnection({
                port: Environment.FRIEND_PORT as number,
                host: Environment.FRIEND_HOST as string
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

    // ----

    async reset() {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet();
        request.p2(Environment.WORLD_ID as number);
        await this.write(this.socket, 1, request.data);

        this.disconnect();
    }

    async heartbeat(players: bigint[]) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet();
        request.p2(Environment.WORLD_ID as number);
        request.p2(players.length);
        for (const player of players) {
            request.p8(player);
        }
        await this.write(this.socket, 2, request.data);

        this.disconnect();
    }

    async login(player: bigint) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p2(Environment.WORLD_ID as number);
        data.p8(player);
        await this.write(this.socket, 3, data.data);
    }

    async logout(player: bigint) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p2(Environment.WORLD_ID as number);
        data.p8(player);
        await this.write(this.socket, 4, data.data);
    }

    async latest() {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p2(Environment.WORLD_ID as number);
        await this.write(this.socket, 5, data.data);
    }

    async addFriend(player: bigint, other: bigint) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p8(player);
        data.p8(other);
        await this.write(this.socket, 6, data.data);
    }

    async delFriend(player: bigint, other: bigint) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p8(player);
        data.p8(other);
        await this.write(this.socket, 7, data.data);
    }

    async addIgnore(player: bigint, other: bigint) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p8(player);
        data.p8(other);
        await this.write(this.socket, 8, data.data);
    }

    async delIgnore(player: bigint, other: bigint) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p8(player);
        data.p8(other);
        await this.write(this.socket, 9, data.data);
    }

    async privateMessage(from: bigint, to: bigint, message: string) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p2(Environment.WORLD_ID as number);
        data.p8(from);
        data.p8(to);
        data.pjstr(message);
        await this.write(this.socket, 10, data.data);
    }

    async publicMessage(from: bigint, message: string) {
        await this.connect();

        if (this.socket === null) {
            return;
        }

        const data = new Packet();
        data.p2(Environment.WORLD_ID as number);
        data.p8(from);
        data.pjstr(message);
        await this.write(this.socket, 11, data.data);
    }
}
