import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';

import Packet from '#jagex2/io/Packet.js';

import Environment from '#lostcity/util/Environment.js';
import { fromBase37, toBase37 } from '#jagex2/jstring/JString.js';

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
    INVALID_PROTOCOL,
    PLAYER_NO_DATA,
    PLAYER_LOGGED_IN,
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

            let key = '';

            socket.on('data', async (buf: Buffer) => {
                const data = new Packet(buf);
                const opcode = data.g1();

                // console.log(LoginOpcode[opcode]);

                if (opcode === LoginOpcode.WORLD_CONNECT) {
                    const verifyVersion = data.g1();
                    if (verifyVersion !== LoginServer.INTERNAL_PROTOCOL) {
                        this.error(socket, LoginError.INVALID_PROTOCOL);
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
                        const reply = new Packet();
                        reply.p8(username37);
                        this.error(socket, LoginError.PLAYER_NO_DATA, reply);
                        return;
                    }

                    // check if player is logged in on any world
                    for (const [world, players] of this.players) {
                        if (players.includes(username37)) {
                            const reply = new Packet();
                            reply.p8(username37);
                            reply.p2(world);
                            this.error(socket, LoginError.PLAYER_LOGGED_IN, reply);
                            return;
                        }
                    }

                    const sav = await fsp.readFile(`data/players/${username}.sav`);
                    const reply = new Packet();
                    reply.p8(username37);
                    reply.p2(sav.length);
                    reply.pdata(sav);
                    this.success(socket, LoginSuccess.LOGGED_IN, reply);

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
                    if (data.available < length) {
                        // TODO: TCP fragmentation?
                        return;
                    }

                    const sav = data.gdata(length);
                    await fsp.writeFile(`data/players/${username}.sav`, sav);

                    const reply = new Packet();
                    reply.p8(toBase37(username));
                    this.success(socket, LoginSuccess.LOGGED_OUT, reply);

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
                    reply.p2(world);
                    reply.p2(players.length);
                    this.success(socket, LoginSuccess.WORLD_COUNT, reply);
                } else {
                    socket.destroy();
                }
            });

            socket.on('close', () => {});
            socket.on('error', () => {});
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
    }
}

export default new LoginServer();

enum LoginState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
}

type LoadDataRequest = {
    success?: boolean,
    error?: boolean,
    code: LoginSuccess | LoginError,
    data: unknown
}

class _LoginClient {
    state: LoginState = LoginState.DISCONNECTED;
    socket: net.Socket | null = null;
    loadDataQueue: Map<bigint, LoadDataRequest> = new Map(); // queue of responses to receive
    worldCount: Map<number, number> = new Map(); // world id -> player count

    start() {
        this.state = LoginState.CONNECTING;
        this.socket = net.createConnection({
            port: Environment.LOGIN_PORT as number,
            host: Environment.LOGIN_HOST as string
        });

        this.socket.on('connect', () => {
            if (!this.socket) {
                return;
            }

            const open = new Packet();
            open.p1(LoginOpcode.WORLD_CONNECT);
            open.p1(LoginServer.INTERNAL_PROTOCOL);
            open.pjstr(Environment.LOGIN_KEY as string);
            this.socket.write(open.data);
        });

        this.socket.on('data', (buf: Buffer) => {
            if (!this.socket) {
                return;
            }

            const data = new Packet(buf);
            const opcode = data.g1();
            const result = data.g1();
            const length = data.g2();
            const stream = data.gPacket(length);

            if (opcode === LoginOpcode.SUCCESS) {
                // console.log(LoginOpcode[opcode], LoginSuccess[result]);

                if (result === LoginSuccess.WORLD_CONNECTED) {
                    this.state = LoginState.CONNECTED;
                } else if (result === LoginSuccess.LOGGED_IN) {
                    const username37 = stream.g8();
                    const length = stream.g2();
                    const sav = stream.gdata(length);

                    this.loadDataQueue.set(username37, {
                        success: true,
                        code: result,
                        data: sav
                    });
                } else if (result === LoginSuccess.WORLD_COUNT) {
                    const world = stream.g2();
                    const count = stream.g2();

                    this.worldCount.set(world, count);
                }
            } else if (opcode === LoginOpcode.ERROR) {
                // console.log(LoginOpcode[opcode], LoginError[result]);

                if (result === LoginError.INVALID_KEY) {
                    this.state = LoginState.DISCONNECTED;
                    this.socket.destroy();
                } else if (result === LoginError.INVALID_PROTOCOL) {
                    this.state = LoginState.DISCONNECTED;
                    this.socket.destroy();
                } else if (result === LoginError.PLAYER_NO_DATA) {
                    const username37 = stream.g8();

                    this.loadDataQueue.set(username37, {
                        error: true,
                        code: result,
                        data: null
                    });
                } else if (result === LoginError.PLAYER_LOGGED_IN) {
                    const username37 = stream.g8();
                    const world = stream.g2();

                    this.loadDataQueue.set(username37, {
                        error: true,
                        code: result,
                        data: world
                    });
                }
            }
        });

        this.socket.on('error', () => {
            this.state = LoginState.DISCONNECTED;
            this.socket = null;
        });

        this.socket.on('close', () => {
            this.state = LoginState.DISCONNECTED;
            this.socket = null;
        });
    }

    async connect() {
        return new Promise(res => {
            let counter = 0;

            const interval = setInterval(() => {
                counter++;

                if (!this.socket || this.state === LoginState.DISCONNECTED) {
                    this.start();
                } else if (this.state === LoginState.CONNECTED) {
                    clearInterval(interval);
                    return res(true);
                }

                if (counter > 1) {
                    clearInterval(interval);
                    return res(false);
                }
            }, 1000);
        });
    }

    async load(username37: bigint, password: string): Promise<LoadDataRequest> {
        await this.connect();

        const load = new Packet();
        load.p1(LoginOpcode.PLAYER_LOGIN);
        load.p8(username37);
        load.pjstr(password);
        this.socket?.write(load.data);

        return new Promise(res => {
            const interval = setInterval(() => {
                if (!this.socket || this.state !== LoginState.CONNECTED) {
                    // todo: safe?
                    return res({
                        error: true,
                        code: LoginError.UNSPECIFIED,
                        data: null
                    });
                }

                const sav = this.loadDataQueue.get(username37);
                if (sav !== undefined) {
                    this.loadDataQueue.delete(username37);
                    clearInterval(interval);
                    return res(sav);
                }
            }, 1000);
        });
    }

    async save(username37: bigint, data: Uint8Array | Buffer): Promise<void> {
        await this.connect();

        return new Promise(res => {
            const load = new Packet();
            load.p1(LoginOpcode.PLAYER_LOGOUT);
            load.p8(username37);
            load.p2(data.length);
            load.pdata(data);

            const done = this.socket?.write(load.data);
            if (done) {
                return res();
            }

            this.socket?.once('drain', () => res());
        });
    }

    async reset() {
        await this.connect();

        const reset = new Packet();
        reset.p1(LoginOpcode.WORLD_RESET);
        this.socket?.write(reset.data);
    }

    async count(world: number) {
        await this.connect();

        const count = new Packet();
        count.p1(LoginOpcode.WORLD_COUNT);
        count.p2(world);
        this.socket?.write(count.data);
    }
}

export const LoginClient = new _LoginClient();
