// A long-lived process must survive a server content redeploy.
//
// loadCache() memoizes the /crc checksums for the process lifetime, so before
// invalidateCache() existed, a shard that outlived a redeploy presented its
// boot-time CRCs on every reconnect and the engine answered login response 6
// (out of date) forever - recoverable only by restarting the process. This test
// drives the real startSession path against a mock game server: first login
// gets response 6, the session must re-fetch /crc once and retry with the new
// checksums, and must NOT retry when the re-fetched checksums are unchanged
// (then the mismatch is a genuinely stale build, not a redeploy).
//
// Needs the config archives; set LITE_TEST_ORIGIN to point elsewhere. Skips if
// the server is unreachable.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import './dom-shim.js';

import { invalidateCache, loadCache } from './cache.js';
import { LoginError } from './net/GameConnection.js';
import { startSession } from './session.js';
import { LocIndex } from './world/LocIndex.js';

const ORIGIN = process.env.LITE_TEST_ORIGIN ?? 'https://rs-sdk.maxbittker.com';
const CACHE_DIR = process.env.LITE_TEST_CACHE ?? '/tmp/rs-sdk-lite-test-cache';

let available = false;
let realChecksums: number[] = [];

beforeAll(async () => {
    try {
        // Warm the disk caches from the real origin so the mock server below
        // only ever has to serve /crc and the login handshake: the archive and
        // locindex fetches are keyed by CRC and will hit disk.
        const { checksums } = await loadCache({ origin: ORIGIN, cacheDir: CACHE_DIR, quiet: true });
        realChecksums = checksums;
        await LocIndex.load({ origin: ORIGIN, cacheDir: CACHE_DIR, versionlistCrc: checksums[5], quiet: true });
        available = true;
    } catch {
        available = false;
    }
});

afterAll(() => {
    // Don't leak the mock's checksums into later test files in this process.
    invalidateCache();
});

/** /crc body: 9 big-endian CRCs plus the rolling trailer fetchChecksums validates. */
function crcPayload(checksums: number[]): Uint8Array {
    const view = new DataView(new ArrayBuffer(40));
    let trailer = 1234;
    for (let i = 0; i < 9; i++) {
        view.setInt32(i * 4, checksums[i]);
        trailer = ((trailer << 1) + checksums[i]) | 0;
    }
    view.setInt32(36, trailer);
    return new Uint8Array(view.buffer);
}

interface MockState {
    crcFetches: number;
    /** The 9 CRCs presented in each login packet, in attempt order. */
    loginAttempts: number[][];
}

/**
 * A game server that always answers login response 6. Speaks just enough of the
 * protocol to reach the login packet: stage-1 ack + seed, then parse the
 * presented CRCs (offset 6: after opcode, length, 255, version, lowmem) and
 * reject.
 */
function startMockServer(servedChecksums: number[]): { port: number; state: MockState; stop(): void } {
    const state: MockState = { crcFetches: 0, loginAttempts: [] };

    const server = Bun.serve<{ buf: number[]; stage: number }, object>({
        port: 0,
        fetch(req, srv) {
            const url = new URL(req.url);
            if (url.pathname === '/crc') {
                state.crcFetches++;
                return new Response(crcPayload(servedChecksums));
            }
            if (srv.upgrade(req, { data: { buf: [], stage: 0 }, headers: { 'Sec-WebSocket-Protocol': 'binary' } })) {
                return;
            }
            return new Response('not found', { status: 404 });
        },
        websocket: {
            message(ws, msg): void {
                if (typeof msg === 'string') {
                    return;
                }
                ws.data.buf.push(...new Uint8Array(msg));

                if (ws.data.stage === 0 && ws.data.buf.length >= 2) {
                    // Stage 1 request consumed: 8 ignored bytes, status 0, 8-byte seed.
                    ws.data.buf.splice(0, 2);
                    ws.data.stage = 1;
                    ws.send(new Uint8Array(17));
                } else if (ws.data.stage === 1 && ws.data.buf.length >= 2 && ws.data.buf.length >= 2 + ws.data.buf[1]) {
                    const b = ws.data.buf;
                    const crcs: number[] = [];
                    for (let i = 0; i < 9; i++) {
                        const o = 6 + i * 4;
                        crcs.push(((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) | 0);
                    }
                    state.loginAttempts.push(crcs);
                    ws.data.stage = 2;
                    ws.send(new Uint8Array([6]));
                }
            }
        }
    });

    return {
        port: server.port!,
        state,
        stop: () => server.stop(true)
    };
}

function trySession(port: number): Promise<unknown> {
    return startSession({
        host: `localhost:${port}`,
        username: 'crctest',
        password: 'x',
        cacheDir: CACHE_DIR,
        quiet: true
    }).then(
        () => null,
        err => err
    );
}

/** What the server's CRCs become after the simulated redeploy. */
let redeployed: number[] = [];

describe('startSession recovery from login response 6', () => {
    test('re-fetches /crc and retries with the new checksums', async () => {
        if (!available) {
            return;
        }

        // One archive changed on the server; the three we unpack (and the
        // versionlist) did not, so every disk cache still hits.
        redeployed = [...realChecksums];
        redeployed[0] = (realChecksums[0] ^ 0x5eed) | 0;

        const mock = startMockServer(redeployed);
        try {
            const err = await trySession(mock.port);

            // Both attempts rejected, so the session still fails - but it must
            // have re-fetched /crc and presented the new CRCs the second time.
            expect(err).toBeInstanceOf(LoginError);
            expect((err as LoginError).code).toBe(6);
            expect(mock.state.crcFetches).toBe(1);
            expect(mock.state.loginAttempts).toEqual([realChecksums, redeployed]);
        } finally {
            mock.stop();
        }
    });

    test('does not retry when the re-fetched checksums are unchanged', async () => {
        if (!available) {
            return;
        }

        // The previous test's reload memoized `redeployed`; serving the same
        // set again means the response-6 is a stale build, not a redeploy.
        const mock = startMockServer(redeployed);
        try {
            const err = await trySession(mock.port);

            expect(err).toBeInstanceOf(LoginError);
            expect((err as LoginError).code).toBe(6);
            expect(mock.state.crcFetches).toBe(1);
            expect(mock.state.loginAttempts).toEqual([redeployed]);
        } finally {
            mock.stop();
        }
    });
});
