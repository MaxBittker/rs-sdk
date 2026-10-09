// One bot session: bootstrap the cache, log in, and pump packets on a timer.
//
// The loop is deliberately dumb compared to GameShell.run(): there is no redraw
// to pace against, so we just drain the socket every LOOP_MS. The 274 server
// ticks at 300-600ms, so 20ms polling is far below the noise floor while costing
// almost nothing.
//
// Death policy. A session that ends never resumes itself - reconnecting is the
// caller's call, because it owns whatever state was mid-flight. What this file
// guarantees is that an ending is always *noticed*: every exit resolves `stopped`
// (and calls `onEnd`) with a reason, including the two that used to be silent -
// a remote hang-up, which leaves `available` at 0 forever, and a socket that goes
// quiet without closing. A single bad packet is not an ending; see handlePacket.

import './dom-shim.js';

import { invalidateCache, loadCache } from './cache.js';
import { CLIENT_VERSION, GameConnection, LoginError, OutdatedClientError } from './net/GameConnection.js';
import { LiteClient } from './LiteClient.js';
import { LocIndex } from './world/LocIndex.js';
import { ClientProt } from '#/io/ClientProt.js';
import WordFilter from '#/wordfilter/WordFilter.js';

const LOOP_MS = 20;
/** Engine drops a socket after TIMEOUT_NO_RESPONSE; NO_TIMEOUT keeps it alive. */
const KEEPALIVE_CYCLES = 50;
/**
 * The engine writes PLAYER_INFO to every logged-in player every tick
 * (NetworkPlayer.updatePlayers), so a socket that has gone this long without a
 * single byte is dead even if no FIN ever arrived - a half-open connection that
 * a NAT dropped looks exactly like a healthy idle one otherwise.
 */
const IDLE_CYCLES = 3000; // ~60s, i.e. ~200 missed server ticks

export interface SessionOptions {
    host: string;
    username: string;
    password: string;
    secured?: boolean;
    cacheDir?: string;
    members?: boolean;
    maxMessageLength?: number;
    /**
     * Local chat censoring (WordFilter). Default on. Process-wide (WordFilter is
     * static), so in a multi-bot process like swarm.ts the last session started
     * wins. Cosmetic unless the server's NODE_PROFANITY_FILTER is also off - the
     * engine censors chat before it reaches any client.
     */
    profanityFilter?: boolean;
    quiet?: boolean;
    /**
     * Called exactly once when the packet loop ends, whatever the cause. Fires
     * before `stopped` resolves, so a supervisor can re-login straight away.
     */
    onEnd?(end: SessionEnd): void;
}

/**
 * Why a session ended. Only 'stopped' is us asking; everything else is a bot
 * that has left the game and will not come back on its own.
 */
export type SessionEndReason =
    /** stop() was called. */
    | 'stopped'
    /** The server sent LOGOUT (death of the account's session, world shutdown, ...). */
    | 'logged-out'
    /** The socket is gone. */
    | 'disconnected'
    /** The socket is nominally open but the server stopped talking. */
    | 'idle'
    /** The packet loop threw: stream desync, or handlers failing in a burst. */
    | 'error';

export interface SessionEnd {
    reason: SessionEndReason;
    /** Set when reason === 'error'. */
    error?: unknown;
}

export interface LiteSession {
    client: LiteClient;
    stop(): void;
    stopped: Promise<SessionEnd>;
}

/** The server's game revision from /api/version, or null if it doesn't say (older server, network). */
async function fetchServerRevision(origin: string): Promise<number | null> {
    try {
        const res = await fetch(`${origin}/api/version`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
            return null;
        }
        const body = (await res.json()) as { revision?: unknown };
        return typeof body.revision === 'number' ? body.revision : null;
    } catch {
        return null;
    }
}

export async function startSession(opts: SessionOptions): Promise<LiteSession> {
    if (opts.profanityFilter !== undefined) {
        WordFilter.enabled = opts.profanityFilter;
    }
    const secured = opts.secured ?? !(opts.host.startsWith('localhost') || opts.host.startsWith('127.'));
    const origin = `${secured ? 'https' : 'http'}://${opts.host}`;
    const cacheDir = opts.cacheDir ?? `${process.env.HOME}/.cache/rs-sdk-lite`;

    // Fail with the fix, not a decode error or an opaque login response 6, when the server
    // has moved to another revision. Servers without /api/version skip the check.
    const serverRevision = await fetchServerRevision(origin);
    if (serverRevision !== null && serverRevision !== CLIENT_VERSION) {
        throw new OutdatedClientError(origin, serverRevision);
    }

    let { checksums } = await loadCache({ origin, cacheDir, members: opts.members, quiet: opts.quiet });
    let locIndex = await LocIndex.load({ origin, cacheDir, versionlistCrc: checksums[5], quiet: opts.quiet });

    const connect = () =>
        GameConnection.connect({
            host: opts.host,
            secured,
            username: opts.username,
            password: opts.password,
            checksums
        });

    let connection: GameConnection;
    try {
        connection = await connect();
    } catch (err) {
        // Login response 6 from a long-lived process usually means the server's
        // content was redeployed under us and the memoized CRCs are stale, not
        // that this build is actually out of date. Re-fetch /crc once and retry;
        // if the checksums come back unchanged the mismatch is real, so rethrow.
        if (!(err instanceof LoginError) || err.code !== 6) {
            throw err;
        }
        const stale = checksums;
        invalidateCache();
        ({ checksums } = await loadCache({ origin, cacheDir, members: opts.members, quiet: opts.quiet }));
        if (checksums.every((crc, i) => crc === stale[i])) {
            // still refused with fresh CRCs: the revision is the likely cause unless the
            // server confirmed it matches
            throw serverRevision === null ? new OutdatedClientError(origin, null) : err;
        }
        console.error(`[lite] ${opts.username}: stale archive CRCs after server redeploy, re-fetched /crc and retrying login`);
        locIndex = await LocIndex.load({ origin, cacheDir, versionlistCrc: checksums[5], quiet: opts.quiet });
        connection = await connect();
    }

    const client = new LiteClient({
        connection,
        locIndex,
        username: opts.username,
        password: opts.password,
        maxMessageLength: opts.maxMessageLength
    });

    let running = true;
    let cycles = 0;
    let idle = 0;
    let seenPackets = 0;
    let resolveStopped: (end: SessionEnd) => void;
    const stopped = new Promise<SessionEnd>(resolve => {
        resolveStopped = resolve;
    });

    const loop = async (): Promise<void> => {
        let end: SessionEnd = { reason: 'stopped' };

        while (running) {
            if (client.isLoggedOut()) {
                end = { reason: 'logged-out' };
                break;
            }
            if (!client.isInGame()) {
                end = { reason: 'disconnected' };
                break;
            }

            try {
                await client.pumpPackets();

                if (++cycles % KEEPALIVE_CYCLES === 0) {
                    client.writeOpcode(ClientProt.NO_TIMEOUT);
                }
                client.flush();
                client.tickCycle();
            } catch (err) {
                if (!running) {
                    break;
                }
                // Individual bad packets are contained in handlePacket, so a throw
                // that reaches here is the stream or the socket, not one handler.
                end = client.isInGame() ? { reason: 'error', error: err } : { reason: 'disconnected' };
                break;
            }

            if (client.packetsReceived !== seenPackets) {
                seenPackets = client.packetsReceived;
                idle = 0;
            } else if (++idle > IDLE_CYCLES) {
                end = { reason: 'idle' };
                break;
            }

            await Bun.sleep(LOOP_MS);
        }

        connection.close();
        // Say so on the way out: a bot that dies quietly in a fleet just looks idle.
        if (end.reason !== 'stopped') {
            console.error(`[lite] ${opts.username}: session ended (${end.reason})`, end.error ?? '');
        }
        try {
            opts.onEnd?.(end);
        } catch (err) {
            console.error(`[lite] ${opts.username}: onEnd handler threw:`, err);
        }
        resolveStopped(end);
    };

    void loop();

    return {
        client,
        stop(): void {
            running = false;
            connection.close();
        },
        stopped
    };
}
