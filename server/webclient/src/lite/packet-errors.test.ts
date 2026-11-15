// A packet handler that throws must not end the session, but a burst of them
// must. The framing has already consumed the whole body by the time a handler
// runs, so the stream is still in sync and one bad packet can just be dropped;
// handlers failing in a burst mean the client's own state is wrong, and then
// ending the session is what gets it restarted.
//
// Drives the real framing path (handlePacket over a fake socket) rather than
// dispatch() directly, because containment lives in the framing.
//
// Needs the interface archive; set LITE_TEST_ORIGIN to point elsewhere. Skips if
// the server is unreachable.

import { beforeAll, describe, expect, test } from 'bun:test';

import './dom-shim.js';

import Packet from '#/io/Packet.js';
import { ServerProt } from '#/io/ServerProt.js';

import { loadCache } from './cache.js';
import { LiteClient } from './LiteClient.js';
import { handlePacket } from './protocol/incoming.js';

const ORIGIN = process.env.LITE_TEST_ORIGIN ?? 'https://rs-sdk.maxbittker.com';
const CACHE_DIR = process.env.LITE_TEST_CACHE ?? '/tmp/rs-sdk-lite-test-cache';

let available = false;

beforeAll(async () => {
    try {
        await loadCache({ origin: ORIGIN, cacheDir: CACHE_DIR, quiet: true });
        available = true;
    } catch {
        available = false;
    }
});

/** A socket that hands back a fixed byte script. */
class FakeStream {
    constructor(private readonly bytes: number[]) {}

    get available(): number {
        return this.bytes.length;
    }

    async readBytes(dst: Uint8Array, off: number, len: number): Promise<void> {
        for (let i = 0; i < len; i++) {
            dst[off + i] = this.bytes.shift() ?? 0;
        }
    }
}

/**
 * MESSAGE_GAME on the wire: opcode, one length byte (its ServerProtSizes entry is
 * -1), then the string. `randomIn.nextInt` is stubbed to 0 below, so the opcode
 * needs no ISAAC offset.
 */
function messageBytes(text: string): number[] {
    const body = Packet.alloc(1);
    body.pjstr(text);
    return [ServerProt.MESSAGE_GAME, body.pos, ...body.data.slice(0, body.pos)];
}

function makeClient(name: string, script: number[]): LiteClient {
    return new LiteClient({
        connection: {
            stream: new FakeStream(script),
            in: Packet.alloc(1),
            out: Packet.alloc(1),
            randomIn: { nextInt: 0 },
            isClosed: false
        } as never,
        locIndex: {} as never,
        username: name,
        password: 'x'
    });
}

/** The containment path logs every dropped packet; keep the suite readable. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
    const real = console.error;
    console.error = (): void => {};
    try {
        return await fn();
    } finally {
        console.error = real;
    }
}

describe('packet handler errors', () => {
    test('a throwing handler drops its packet and the next one still lands', async () => {
        if (!available) {
            console.warn(`[skip] ${ORIGIN} unreachable`);
            return;
        }

        const client = makeClient('botx', [...messageBytes('first'), ...messageBytes('second')]);

        // Fail the first packet from inside the handler, the way a real defect
        // would (the reported case was ifMutable being unavailable mid-dispatch).
        let first = true;
        (client as unknown as { addChat: unknown }).addChat = (): void => {
            if (first) {
                first = false;
                throw new TypeError('c.ifMutable is not a function');
            }
        };

        await quietly(async () => {
            expect(await handlePacket(client)).toBe(true);
            expect(await handlePacket(client)).toBe(true);
        });

        expect(client.dispatchErrors).toBe(1);
        expect(client.packetsReceived).toBe(2);
        // Second packet was dispatched, i.e. framing stayed in sync across the throw.
        expect(first).toBe(false);
        expect(await handlePacket(client)).toBe(false); // and the stream is drained
    });

    test('handlers failing in a burst end the session', async () => {
        if (!available) {
            console.warn(`[skip] ${ORIGIN} unreachable`);
            return;
        }

        const script: number[] = [];
        for (let i = 0; i < 30; i++) {
            script.push(...messageBytes(`msg${i}`));
        }
        const client = makeClient('boty', script);
        (client as unknown as { addChat: unknown }).addChat = (): void => {
            throw new TypeError('always broken');
        };

        const thrown = await quietly(async () => {
            for (let i = 0; i < 30; i++) {
                try {
                    await handlePacket(client);
                } catch (err) {
                    return err;
                }
            }
            return null;
        });

        // Contained up to the burst limit, then handed to the session loop to act on.
        expect(thrown).toBeInstanceOf(Error);
        expect(String(thrown)).toContain('unreliable');
        expect(client.dispatchErrors).toBe(20);
    });
});
