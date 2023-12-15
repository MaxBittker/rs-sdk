import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';

import Packet from '#jagex2/io/Packet.js';

import { fromBase37, toBase37 } from '#jagex2/jstring/JString.js';

import NetworkStream from '#lostcity/server/NetworkStream.js';

import Environment from '#lostcity/util/Environment.js';

export enum LoginOpcode {
    ERROR = 0,
    SUCCESS,

    WORLD_CONNECT,
    WORLD_COUNT,
    WORLD_RESET,

    PLAYER_LOGIN,
    PLAYER_LOGOUT,
}

export enum LoginError {
    UNSPECIFIED,
    INVALID_KEY,
    OUTDATED_PROTOCOL,
    PLAYER_NO_DATA,
    PLAYER_LOGGED_IN,
    OFFLINE, // client-sided login error
}

export enum LoginSuccess {
    UNSPECIFIED,
    WORLD_CONNECTED,
    LOGGED_IN,
    LOGGED_OUT,
    WORLD_COUNT,
    WORLD_RESET,
}

type LoginConfig = {
    worlds: {
        [key: string]: number
    }
}

class LoginServer {
    static INTERNAL_PROTOCOL = 1;

    config: LoginConfig;
    tcp: net.Server;
    players: Map<number, bigint[]> = new Map();

    constructor() {
        this.config = {
            worlds: {}
        };

        this.tcp = net.createServer();
    }

    start() {
        if (!fs.existsSync('data/config/login.json')) {
            console.error('Login config not found');
            process.exit(1);
        }

        this.config = JSON.parse(fs.readFileSync('data/config/login.json', 'utf8'));

        this.tcp.on('connection', (socket: net.Socket) => {
            socket.setKeepAlive(true);
            socket.setNoDelay(true);

            const stream = new NetworkStream();
            let key = '';

            socket.on('data', async (buf: Buffer) => {
                stream.received(buf);
                if (stream.waiting > stream.available) {
                    return;
                }

                const data = new Packet();
                await stream.readBytes(data, 0, 3);

                const opcode = data.g1();
                const length = data.g2();
                await stream.readBytes(data, 0, length);

                if (opcode === LoginOpcode.WORLD_CONNECT) {
                    const verifyVersion = data.g1();
                    if (verifyVersion !== LoginServer.INTERNAL_PROTOCOL) {
                        this.error(socket, LoginError.OUTDATED_PROTOCOL);
                        return;
                    }

                    const verifyKey = data.gjstr();
                    if (typeof this.config.worlds === 'undefined') {
                        this.error(socket, LoginError.INVALID_KEY);
                        return;
                    }

                    key = verifyKey;
                    this.success(socket, LoginSuccess.WORLD_CONNECTED);
                } else if (opcode === LoginOpcode.WORLD_RESET) {
                    const world = this.config.worlds[key];
                    this.players.set(world, []);

                    this.success(socket, LoginSuccess.WORLD_RESET);
                } else if (opcode === LoginOpcode.PLAYER_LOGIN) {
                    if (!key.length) {
                        this.error(socket, LoginError.INVALID_KEY);
                        return;
                    }

                    const username37 = data.g8();
                    const password = data.gjstr();

                    const username = fromBase37(username37);
                    if (!fs.existsSync(`data/players/${username}.sav`)) {
                        this.error(socket, LoginError.PLAYER_NO_DATA);
                        return;
                    }

                    // check if player is logged in on any world
                    for (const [world, players] of this.players) {
                        if (players.includes(username37)) {
                            const reply = new Packet();
                            reply.p2(world);
                            this.error(socket, LoginError.PLAYER_LOGGED_IN, reply);
                            return;
                        }
                    }

                    const sav = await fsp.readFile(`data/players/${username}.sav`);
                    this.success(socket, LoginSuccess.LOGGED_IN, sav);

                    const world = this.config.worlds[key];
                    const players = this.players.get(world) ?? [];
                    if (!players.includes(username37)) {
                        players.push(username37);
                    }
                    this.players.set(world, players);
                } else if (opcode === LoginOpcode.PLAYER_LOGOUT) {
                    if (!key.length) {
                        this.error(socket, LoginError.INVALID_KEY);
                        return;
                    }

                    const username37 = data.g8();
                    const username = fromBase37(username37);
                    const length = data.g2();

                    const sav = data.gdata(length);
                    await fsp.writeFile(`data/players/${username}.sav`, sav);

                    const world = this.config.worlds[key];
                    const players = this.players.get(world) ?? [];
                    const index = players.indexOf(username37);
                    if (index > -1) {
                        players.splice(index, 1);
                    }
                    this.players.set(world, players);
                } else if (opcode === LoginOpcode.WORLD_COUNT) {
                    const world = data.g2();
                    const players = this.players.get(world) ?? [];

                    const reply = new Packet();
                    reply.p2(players.length);
                    this.success(socket, LoginSuccess.WORLD_COUNT, reply);
                } else {
                    socket.destroy();
                }
            });

            socket.on('close', () => { });
            socket.on('error', () => { });
        });

        this.tcp.listen(Environment.LOGIN_PORT as number, '0.0.0.0', () => {
            console.log(`[Login]: Listening on port ${Environment.LOGIN_PORT} (internal service)`);
        });
    }

    private error(socket: net.Socket, error: LoginError, data: Packet | Buffer | Uint8Array | null = null) {
        const reply = new Packet();
        reply.p1(LoginOpcode.ERROR);
        reply.p1(error);
        if (data !== null) {
            reply.p2(data.length);
            reply.pdata(data);
        } else {
            reply.p2(0);
        }
        socket.write(reply.data);
    }

    private success(socket: net.Socket, success: LoginSuccess, data: Packet | Buffer | Uint8Array | null = null) {
        const reply = new Packet();
        reply.p1(LoginOpcode.SUCCESS);
        reply.p1(success);
        if (data !== null) {
            reply.p2(data.length);
            reply.pdata(data);
        } else {
            reply.p2(0);
        }
        socket.write(reply.data);
        // todo: safe to wait for drain?
    }
}

export default new LoginServer();

enum LoginState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
}

class _LoginClient {
    state: LoginState = LoginState.DISCONNECTED;
    socket: net.Socket | null = null;
    stream: NetworkStream = new NetworkStream();

    async start(): Promise<{ opcode: LoginOpcode, result: LoginSuccess | LoginError }> {
        this.socket = net.createConnection({
            port: Environment.LOGIN_PORT as number,
            host: Environment.LOGIN_HOST as string
        });

        this.socket.setKeepAlive(true);
        this.socket.setNoDelay(true);
        this.socket.setTimeout(5000);

        // todo: handle protocol version mismatch
        this.socket.on('data', (buf: Buffer) => {
            if (!this.socket) {
                return;
            }

            this.stream.received(buf);
        });

        this.socket.on('error', () => {
            this.state = LoginState.DISCONNECTED;
            this.socket = null;
        });

        this.socket.on('close', () => {
            this.state = LoginState.DISCONNECTED;
            this.socket = null;
        });

        return await this.identify();
    }

    async identify() {
        this.state = LoginState.CONNECTING;

        await new Promise<void>(res => {
            this.socket?.once('connect', () => res());
            this.socket?.once('error', () => res());
            this.socket?.once('close', () => res());
        });
        if (this.socket === null) {
            return { opcode: LoginOpcode.ERROR, result: LoginError.OFFLINE };
        }

        const request = new Packet();
        request.p1(LoginServer.INTERNAL_PROTOCOL);
        request.pjstr(Environment.LOGIN_KEY as string);
        await this.write(LoginOpcode.WORLD_CONNECT, request);

        const reply = new Packet();
        await this.stream.readBytes(reply, 0, 4);

        const opcode = reply.g1();
        const result = reply.g1();
        const length = reply.g2();
        await this.stream.readBytes(reply, 0, length);

        if (opcode === LoginOpcode.SUCCESS) {
            if (result === LoginSuccess.WORLD_CONNECTED) {
                this.state = LoginState.CONNECTED;
            }
        } else {
            this.state = LoginState.DISCONNECTED;
            this.socket?.end();
            this.socket = null;
        }

        return { opcode, result };
    }

    async write(loginOpcode: LoginOpcode, data: Packet | Buffer | Uint8Array | null = null): Promise<void> {
        if (this.socket === null) {
            return;
        }

        const packet = new Packet();
        packet.p1(loginOpcode);
        if (data !== null) {
            packet.p2(data.length);
            packet.pdata(data);
        } else {
            packet.p2(0);
        }

        return new Promise(res => {
            const done = this.socket?.write(packet.data);
            if (done) {
                return res();
            }

            this.socket?.once('drain', () => res());
        });
    }

    async load(username37: bigint, password: string): Promise<{ opcode: LoginOpcode, result: LoginSuccess | LoginError, data: Uint8Array | number | null }> {
        if (this.socket === null || this.state !== LoginState.CONNECTED) {
            const { opcode, result } = await this.start();

            if (opcode === LoginOpcode.SUCCESS) {
                return this.load(username37, password);
            } else {
                return { opcode, result, data: null };
            }
        }

        const request = new Packet();
        request.p8(username37);
        request.pjstr(password);
        await this.write(LoginOpcode.PLAYER_LOGIN, request);

        const reply = new Packet();
        await this.stream.readBytes(reply, 0, 4);

        const opcode = reply.g1();
        const result = reply.g1();
        const length = reply.g2();
        await this.stream.readBytes(reply, 0, length);

        if (opcode === LoginOpcode.SUCCESS && result === LoginSuccess.LOGGED_IN) {
            return { opcode, result, data: reply.data };
        } else if (opcode === LoginOpcode.ERROR && result === LoginError.PLAYER_LOGGED_IN) {
            return { opcode, result, data: reply.g2() };
        } else {
            return { opcode, result, data: null };
        }
    }

    async save(username37: bigint, data: Uint8Array | Buffer): Promise<void> {
        if (this.socket === null || this.state !== LoginState.CONNECTED) {
            const { opcode } = await this.start();

            if (opcode === LoginOpcode.SUCCESS) {
                return this.save(username37, data);
            } else {
                return;
            }
        }

        const request = new Packet();
        request.p8(username37);
        request.p2(data.length);
        request.pdata(data);
        await this.write(LoginOpcode.PLAYER_LOGOUT, request);
    }

    async reset(): Promise<void> {
        if (this.socket === null || this.state !== LoginState.CONNECTED) {
            const { opcode } = await this.start();

            if (opcode === LoginOpcode.SUCCESS) {
                return this.reset();
            } else {
                return;
            }
        }

        await this.write(LoginOpcode.WORLD_RESET);
    }

    async count(world: number): Promise<number> {
        if (this.socket === null || this.state !== LoginState.CONNECTED) {
            const { opcode } = await this.start();

            if (opcode === LoginOpcode.SUCCESS) {
                return this.count(world);
            } else {
                return 0;
            }
        }

        const request = new Packet();
        request.p2(world);
        await this.write(LoginOpcode.WORLD_COUNT, request);

        const reply = new Packet();
        await this.stream.readBytes(reply, 0, 4);

        const opcode = reply.g1();
        const result = reply.g1();
        const length = reply.g2();
        await this.stream.readBytes(reply, 0, length);

        if (opcode === LoginOpcode.SUCCESS) {
            if (result === LoginSuccess.WORLD_COUNT) {
                return reply.g2();
            }
        }

        return 0;
    }
}

export const LoginClient = new _LoginClient();
