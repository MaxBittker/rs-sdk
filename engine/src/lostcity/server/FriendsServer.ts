import net from 'net';

import Packet from '#jagex2/io/Packet.js';

import { fromBase37, toBase37 } from '#jagex2/jstring/JString.js';

import NetworkStream from '#lostcity/server/NetworkStream.js';

import Environment from '#lostcity/util/Environment.js';
import { FriendsServerRepository } from './FriendsServerRepository.js';
import { ChatModePrivate } from '#lostcity/util/ChatModes.js';

/**
 * client -> server opcodes for friends server
 */
export enum FriendsClientOpcodes {
    WORLD_CONNECT,
    FRIENDLIST_ADD,
    FRIENDLIST_DEL,
    PLAYER_LOGIN,
    PLAYER_LOGOUT,
    PLAYER_CHAT_SETMODE,
}

/**
 * server -> client opcodes for friends server
 */
export enum FriendsServerOpcodes {
    UPDATE_FRIENDLIST,
}

// TODO make this configurable (or at least source it from somewhere common)
const WORLD_PLAYER_LIMIT = 2000;

/**
 * TODO refactor, this class shares a lot with the other servers
 */
export class FriendsServer {
    private server: net.Server;

    private repository: FriendsServerRepository = new FriendsServerRepository();

    /**
     * socketByWorld[worldId] = socket
     */
    private socketByWorld: Record<number, net.Socket> = {};

    constructor() {
        this.server = net.createServer();
    }

    start() {
        this.server.on('connection', socket => {
            socket.setNoDelay(true);
            socket.setTimeout(5000);

            const stream = new NetworkStream();

            /**
             * The world number for this connection. This is set when the world sends a WORLD_CONNECT packet.
             */
            let world: number | null = null;

            socket.on('data', async buf => {
                stream.received(buf);
                if (stream.waiting > stream.available) {
                    return;
                }

                stream.waiting = 0;
                const data = Packet.alloc(1);
                await stream.readBytes(socket, data, 0, 3);

                const opcode = data.g1();
                const length = data.g2();
                if (stream.available < length) {
                    stream.waiting = length - stream.available;
                    return;
                }

                await stream.readBytes(socket, data, 0, length);

                try
                {
                    if (opcode === FriendsClientOpcodes.WORLD_CONNECT) {
                        if (world !== null) {
                            console.error('[Friends]: Received WORLD_CONNECT after already connected');
                            return;
                        }

                        world = data.g2();

                        if (this.socketByWorld[world]) {
                            this.socketByWorld[world].destroy();
                        }

                        this.socketByWorld[world] = socket;

                        this.repository.initializeWorld(world, WORLD_PLAYER_LIMIT);

                        console.log(`[Friends]: World ${world} connected`);
                    } else if (opcode === FriendsClientOpcodes.PLAYER_LOGIN) {
                        if (world === null) {
                            console.error('[Friends]: Received PLAYER_LOGIN before WORLD_CONNECT');
                            return;
                        }

                        const username37 = data.g8();
                        let privateChat: ChatModePrivate = data.g1();

                        if (privateChat !== 0 && privateChat !== 1 && privateChat !== 2) {
                            console.error(`[Friends]: Player ${fromBase37(username37)} tried to log in with invalid private chat setting ${privateChat}`);
                            privateChat = ChatModePrivate.ON;
                        }
                        
                        // remove player from previous world, if any
                        this.repository.unregister(username37);

                        if (!await this.repository.register(world, username37, privateChat)) {
                            // TODO handle this better?
                            console.error(`[Friends]: World ${world} is full`);
                            return;
                        }

                        console.log(`[Friends]: Player ${fromBase37(username37)} (${privateChat}) logged in to world ${world}`);

                        // notify the player who just logged in about their friends
                        await this.sendFriendsListToPlayer(username37, socket);

                        // notify all friends of the player who just logged in
                        await this.broadcastWorldToFollowers(username37);
                    } else if (opcode === FriendsClientOpcodes.PLAYER_LOGOUT) {
                        if (world === null) {
                            console.error('[Friends]: Received PLAYER_LOGOUT before WORLD_CONNECT');
                            return;
                        }

                        const username37 = data.g8();
                        const username = fromBase37(username37);

                        console.log(`[Friends]: Player ${username} logged out of world ${world}`);

                        // remove player from previous world, if any
                        this.repository.unregister(username37);

                        await this.broadcastWorldToFollowers(username37);
                    } else if (opcode === FriendsClientOpcodes.PLAYER_CHAT_SETMODE) {
                        if (world === null) {
                            console.error('[Friends]: Received PLAYER_CHAT_SETMODE before WORLD_CONNECT');
                            return;
                        }

                        const username37 = data.g8();
                        let privateChat: ChatModePrivate = data.g1();
                        const username = fromBase37(username37);

                        if (privateChat !== 0 && privateChat !== 1 && privateChat !== 2) {
                            console.error(`[Friends]: Player ${fromBase37(username37)} tried to set chatmode to invalid private chat setting ${privateChat}`);
                            privateChat = ChatModePrivate.ON;
                        }

                        console.log(`[Friends]: Player ${username} set chat mode to ${privateChat}`);

                        this.repository.setChatMode(username37, privateChat);
                        await this.broadcastWorldToFollowers(username37);
                    } else if (opcode === FriendsClientOpcodes.FRIENDLIST_ADD) {
                        if (world === null) {
                            console.error('[Friends]: Received FRIENDLIST_ADD before WORLD_CONNECT');
                            return;
                        }

                        const username37 = data.g8();
                        const targetUsername37 = data.g8();

                        await this.repository.addFriend(username37, targetUsername37);

                        await this.sendPlayerWorldUpdate(username37, targetUsername37);

                        // we can refactor this to only send the update to the new friend
                        // currently we broadcast this in case the player has private chat set to "Friends"
                        await this.broadcastWorldToFollowers(username37);
                    } else if (opcode === FriendsClientOpcodes.FRIENDLIST_DEL) {
                        if (world === null) {
                            console.error('[Friends]: Received FRIENDLIST_DEL before WORLD_CONNECT');
                            return;
                        }

                        const username37 = data.g8();
                        const targetUsername37 = data.g8();

                        await this.repository.deleteFriend(username37, targetUsername37);

                        // we can refactor this to only send the update to the ex-friend
                        await this.broadcastWorldToFollowers(username37);
                    } else {
                        console.error(`[Friends]: Unknown opcode ${opcode}, length ${length}`);
                    }
                }
                finally
                {
                    data.release();
                }
            });

            socket.on('close', () => {});
            socket.on('error', () => {});
        });

        this.server.listen({ port: Environment.FRIENDS_PORT, host: '0.0.0.0' }, () => {
            console.log(`[Friends]: Listening on port ${Environment.FRIENDS_PORT}`);
        });
    }

    private async sendFriendsListToPlayer(username37: bigint, socket: net.Socket) {
        const playerFriends = await this.repository.getFriends(username37);

        if (playerFriends.length > 0) {
            const localFriendPacket = new Packet(new Uint8Array(8 + (playerFriends.length * 10)));
            localFriendPacket.p8(username37);
            for (const [worldId, friend] of playerFriends) {
                localFriendPacket.p2(worldId);
                localFriendPacket.p8(friend);
            }

            // we can use `socket` here because we know the player is connected to this world
            await this.write(socket, FriendsServerOpcodes.UPDATE_FRIENDLIST, localFriendPacket.data);
        }
    }

    private async broadcastWorldToFollowers(username37: bigint) {
        const followers = this.repository.getFollowers(username37);

        for (const follower of followers) {
            await this.sendPlayerWorldUpdate(follower, username37);
        }
    }

    private getPlayerWorldSocket(username: bigint) {
        const world = this.repository.getWorld(username);
        if (!world) {
            return null;
        }

        return this.socketByWorld[world] ?? null;
    }

    private sendPlayerWorldUpdate(viewer: bigint, other: bigint) {
        const socket = this.getPlayerWorldSocket(viewer);

        if (!socket) {
            return Promise.resolve();
        }

        const otherPlayerWorld = this.repository.getWorld(other);

        const packet = new Packet(new Uint8Array(8 + 2 + 8));
        packet.p8(viewer);
        packet.p2(this.repository.isVisibleTo(viewer, other) ? otherPlayerWorld : 0);
        packet.p8(other);

        return this.write(socket, FriendsServerOpcodes.UPDATE_FRIENDLIST, packet.data);
    }

    /**
     * TODO this might be better if it adds the packet to some queue for the given socket,
     *      that way the friend server logic won't wait on the outbound traffic
     */
    private async write(socket: net.Socket, opcode: FriendsServerOpcodes, data: Uint8Array | null = null, full: boolean = true) {
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
}

export class FriendsClient {
    private socket: net.Socket | null = null;
    private stream: NetworkStream = new NetworkStream();

    async connect() {
        if (this.socket) {
            return;
        }

        return new Promise<void>(res => {
            this.socket = net.createConnection({
                port: Environment.FRIENDS_PORT as number,
                host: Environment.FRIENDS_HOST as string
            });

            this.socket.setNoDelay(true);
            this.socket.setTimeout(1000);

            this.socket.on('data', async buf => {
                this.stream.received(buf);

                if (this.stream.waiting > this.stream.available) {
                    return;
                }

                this.stream.waiting = 0;
                const meta = Packet.alloc(1);
                await this.stream.readBytes(this.socket!, meta, 0, 3);

                const opcode = meta.g1();
                const length = meta.g2();

                meta.release();

                if (this.stream.available < length) {
                    this.stream.waiting = length - this.stream.available;
                    return;
                }

                // TODO review - doing this to avoid passing a 5kb buffer for each message
                const data = Packet.alloc(length);

                await this.stream.readBytes(this.socket!, data, 0, length);

                this.messageHandlers.forEach(fn => fn(opcode, data.data));

                data.release();
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

    private async write(socket: net.Socket, opcode: FriendsClientOpcodes, data: Uint8Array | null = null, full: boolean = true) {
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

    private messageHandlers: ((opcode: number, data: Uint8Array) => void)[] = [];

    public async onMessage(fn: (opcode: number, data: Uint8Array) => void) {
        this.messageHandlers.push(fn);
    }

    public async worldConnect(world: number) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(2));
        request.p2(world);
        await this.write(this.socket, FriendsClientOpcodes.WORLD_CONNECT, request.data);
    }

    public async playerLogin(username: string, privateChat: number) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(9));
        request.p8(toBase37(username));
        request.p1(privateChat);
        await this.write(this.socket, FriendsClientOpcodes.PLAYER_LOGIN, request.data);
    }

    public async playerLogout(username: string) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(8));
        request.p8(toBase37(username));
        await this.write(this.socket, FriendsClientOpcodes.PLAYER_LOGOUT, request.data);
    }

    public async playerFriendslistAdd(username: string, target: bigint) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(16));
        request.p8(toBase37(username));
        request.p8(target);
        await this.write(this.socket, FriendsClientOpcodes.FRIENDLIST_ADD, request.data);
    }

    public async playerFriendslistRemove(username: string, target: bigint) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(16));
        request.p8(toBase37(username));
        request.p8(target);
        await this.write(this.socket, FriendsClientOpcodes.FRIENDLIST_DEL, request.data);
    }

    public async playerChatSetMode(username: string, privateChatMode: ChatModePrivate) {
        await this.connect();

        if (this.socket === null) {
            return -1;
        }

        const request = new Packet(new Uint8Array(9));
        request.p8(toBase37(username));
        request.p1(privateChatMode);
        await this.write(this.socket, FriendsClientOpcodes.PLAYER_CHAT_SETMODE, request.data);
    }
}
