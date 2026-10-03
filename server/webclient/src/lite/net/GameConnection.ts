// Game socket + login handshake for the lite client.
//
// This is a direct port of Client.ts `login()` (rev 274). The handshake is
// deliberately not "cleaned up" - the byte order, the two ISAAC streams seeded
// 50 apart, and the 9 CRCs are all load-bearing, and the engine rejects with an
// opaque "out of date" (response 6) for any of them.

import ClientStream from '#/io/ClientStream.js';
import Isaac from '#/io/Isaac.js';
import JString from '#/datastruct/JString.js';
import Packet from '#/io/Packet.js';

const CLIENT_VERSION = 274;

/** Defaults match webclient/bundle.ts, which bakes these in at build time. */
const DEFAULT_RSA_MODULUS =
    '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789';
const DEFAULT_RSA_EXPONENT = '58778699976184461502525193738213253649000149147835990136706041084440742975821';

export const LOGIN_RESPONSE: Record<number, string> = {
    3: 'Invalid username or password',
    // 4 is "disabled" on paper but this server also returns it for login races
    // (session still tearing down / logged in too fast). Lite retries transiently.
    4: 'Account disabled',
    5: 'Account already logged in',
    6: 'Client out of date (revision or archive CRC mismatch)',
    7: 'World is full',
    8: 'Login server offline',
    9: 'Login limit exceeded',
    10: 'Bad session id',
    11: 'Login server rejected session',
    12: 'Members account required',
    13: 'Could not complete login',
    14: 'Server is being updated',
    15: 'Reconnecting',
    16: 'Too many login attempts',
    17: 'Members area - please subscribe',
    18: 'Account locked'
};

export interface ConnectOptions {
    /** ws(s) host:port of the game server, e.g. 'localhost:8888'. */
    host: string;
    secured: boolean;
    username: string;
    password: string;
    /** All 9 archive CRCs from loadCache(). */
    checksums: number[];
    lowMemory?: boolean;
    rsaModulus?: string;
    rsaExponent?: string;
    /** Reconnect after a dropped socket (opcode 18 instead of 16). */
    reconnect?: boolean;
}

export class LoginError extends Error {
    constructor(
        readonly code: number,
        message: string
    ) {
        super(message);
        this.name = 'LoginError';
    }
}

/**
 * A logged-in game socket: the two ISAAC-keyed packet buffers plus the raw
 * stream. Packet framing is the caller's job (see PacketReader) because the
 * read loop needs to interleave with tick processing.
 */
export class GameConnection {
    readonly stream: ClientStream;
    /** Outbound buffer. `out.random` is the encoder ISAAC - use p1Enc for opcodes. */
    readonly out: Packet = Packet.alloc(1);
    /** Inbound scratch buffer, sized for the largest variable-length packet. */
    readonly in: Packet = Packet.alloc(1);
    /** Decoder ISAAC. Opcodes are `(raw - randomIn.nextInt) & 0xff`. */
    readonly randomIn: Isaac;
    readonly staffModLevel: number;
    readonly mouseTracked: boolean;

    private closed = false;

    private constructor(stream: ClientStream, randomIn: Isaac, staffModLevel: number, mouseTracked: boolean) {
        this.stream = stream;
        this.randomIn = randomIn;
        this.staffModLevel = staffModLevel;
        this.mouseTracked = mouseTracked;
    }

    static async connect(opts: ConnectOptions): Promise<GameConnection> {
        if (opts.username.length < 1 || opts.username.length > 12) {
            throw new LoginError(-1, 'Username must be 1-12 characters');
        }
        if (opts.password.length < 1 || opts.password.length > 20) {
            throw new LoginError(-1, 'Password must be 1-20 characters');
        }

        const stream = new ClientStream(await ClientStream.openSocket(opts.host, opts.secured));

        try {
            const out = Packet.alloc(1);
            const loginout = Packet.alloc(1);

            // Stage 1: ask which login server holds this account's save.
            const userhash = JString.toUserhash(opts.username);
            const loginServer = Number(userhash >> 16n) & 0x1f;

            out.pos = 0;
            out.p1(14);
            out.p1(loginServer);
            stream.write(out.data, 2);

            // Engine sends 8 ignored bytes before the status byte.
            for (let i = 0; i < 8; i++) {
                await stream.read();
            }

            let response = await stream.read();
            if (response !== 0) {
                throw new LoginError(response, LOGIN_RESPONSE[response] ?? `Login rejected (${response})`);
            }

            // Stage 2: server nonce -> ISAAC seeds.
            const scratch = new Packet(new Uint8Array(8));
            await stream.readBytes(scratch.data, 0, 8);
            scratch.pos = 0;
            const loginSeed = scratch.g8();

            const seed = new Int32Array([
                Math.floor(Math.random() * 99999999),
                Math.floor(Math.random() * 99999999),
                Number(loginSeed >> 32n),
                Number(loginSeed & BigInt(0xffffffff))
            ]);

            out.pos = 0;
            out.p1(10);
            out.p4(seed[0]);
            out.p4(seed[1]);
            out.p4(seed[2]);
            out.p4(seed[3]);
            out.p4(1337); // uid - the browser client hardcodes this too
            out.pjstr(opts.username);
            out.pjstr(opts.password);
            out.rsaenc(BigInt(opts.rsaModulus ?? process.env.LOGIN_RSAN ?? DEFAULT_RSA_MODULUS), BigInt(opts.rsaExponent ?? process.env.LOGIN_RSAE ?? DEFAULT_RSA_EXPONENT));

            loginout.pos = 0;
            loginout.p1(opts.reconnect ? 18 : 16);
            loginout.p1(out.pos + 36 + 1 + 2 + 1);
            loginout.p1(255);
            loginout.p2(CLIENT_VERSION);
            loginout.p1(opts.lowMemory ? 1 : 0);
            for (let i = 0; i < 9; i++) {
                loginout.p4(opts.checksums[i]);
            }
            loginout.pdata(out.data, 0, out.pos);

            // Encoder is seeded from the raw seeds, decoder from seeds+50.
            const conn = (() => {
                const encoder = new Isaac(seed);
                const decoderSeed = new Int32Array(seed);
                for (let i = 0; i < 4; i++) {
                    decoderSeed[i] += 50;
                }
                return { encoder, decoder: new Isaac(decoderSeed) };
            })();

            stream.write(loginout.data, loginout.pos);

            response = await stream.read();
            if (response !== 2) {
                throw new LoginError(response, LOGIN_RESPONSE[response] ?? `Login rejected (${response})`);
            }

            const staffModLevel = await stream.read();
            const mouseTracked = (await stream.read()) === 1;

            const game = new GameConnection(stream, conn.decoder, staffModLevel, mouseTracked);
            game.out.random = conn.encoder;
            game.out.pos = 0;
            return game;
        } catch (err) {
            stream.close();
            throw err;
        }
    }

    /** Closed by us, or hung up on by the server - either way there is no session left. */
    get isClosed(): boolean {
        return this.closed || this.stream.isClosed;
    }

    /** Flush the outbound buffer if it has anything queued. */
    flush(): void {
        if (this.closed || this.out.pos === 0) {
            return;
        }
        this.stream.write(this.out.data, this.out.pos);
        this.out.pos = 0;
    }

    close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.stream.close();
    }
}
