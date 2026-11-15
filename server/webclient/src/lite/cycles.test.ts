// Two bots in one process must not share the frame counter.
//
// `Client.loopCycle` (the LoopCycle box in client/LoopCycle.ts) is module state,
// which is one-per-client in a browser tab but one-per-process headless. Sharing
// it means every bot's tickCycle() bumps the same number, so it runs ~N times
// faster than any single bot's cycles - and everything that measures an age in
// cycles (chat line age, dialogHistory ticks, the `cycle + 400` combat windows
// StateCollector reads) comes out scaled by N. This test drives the real paths
// (tickCycle plus a dispatched MESSAGE_GAME) rather than the counter itself.
//
// Needs the interface archive; set LITE_TEST_ORIGIN to point elsewhere. Skips if
// the server is unreachable.

import { beforeAll, describe, expect, test } from 'bun:test';

import './dom-shim.js';

import { ComponentType } from '#/config/IfType.js';
import Packet from '#/io/Packet.js';
import { ServerProt } from '#/io/ServerProt.js';

import { loadCache } from './cache.js';
import { LiteClient } from './LiteClient.js';
import { dispatch } from './protocol/incoming.js';

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

/** A LiteClient with no socket: nothing below touches the connection. */
function makeClient(name: string): LiteClient {
    return new LiteClient({
        connection: { out: Packet.alloc(1), isClosed: false } as never,
        locIndex: {} as never,
        username: name,
        password: 'x'
    });
}

/** MESSAGE_GAME body: one null-terminated string. */
function messagePacket(text: string): Packet {
    const buf = Packet.alloc(1);
    buf.pjstr(text);
    const size = buf.pos;
    buf.pos = 0;
    return Object.assign(buf, { psize: size });
}

describe('per-client cycle counters', () => {
    test('one client ticking does not advance another', () => {
        if (!available) {
            console.warn(`[skip] ${ORIGIN} unreachable`);
            return;
        }

        const a = makeClient('bota');
        const b = makeClient('botb');

        for (let i = 0; i < 5; i++) {
            a.tickCycle();
        }
        b.tickCycle();

        expect(a.getClientCycle()).toBe(5);
        expect(b.getClientCycle()).toBe(1);
        expect(a.loopCycle).toBe(5);
        expect(b.loopCycle).toBe(1);
    });

    test('message age is measured in the receiving bot`s cycles', () => {
        if (!available) {
            return;
        }

        const a = makeClient('bota');
        const b = makeClient('botb');

        for (let i = 0; i < 3; i++) {
            a.tickCycle();
        }

        const packet = messagePacket('hello');
        dispatch(a, ServerProt.MESSAGE_GAME, packet, packet.pos + 8);

        // b's cycles keep running while a's message sits in the ring buffer.
        for (let i = 0; i < 100; i++) {
            b.tickCycle();
        }
        a.tickCycle();

        expect(a.chatText[0]).toBe('hello');
        expect(a.messageTick[0]).toBe(3);
        // One tick old from a's point of view, whatever b has been doing.
        expect(a.getClientCycle() - a.messageTick[0]).toBe(1);
    });

    test('dialog history ticks come from the owning client', () => {
        if (!available) {
            return;
        }

        const a = makeClient('bota');
        const b = makeClient('botb');

        for (let i = 0; i < 50; i++) {
            b.tickCycle();
        }
        a.tickCycle();
        a.tickCycle();

        // captureDialogToHistory needs an open chat modal with text in it. The
        // scan starts at the modal component itself, so making that one a text
        // component is enough - and it is a copy-on-write clone, so forcing its
        // type here cannot leak into b.
        const DIALOG_ID = 210;
        a.chatModalId = DIALOG_ID;
        const line = a.ifMutable(DIALOG_ID);
        expect(line).toBeDefined();
        line!.type = ComponentType.TYPE_TEXT;
        line!.text = 'a line of dialog';
        a.captureDialogToHistory();

        const history = a.getDialogHistory();
        expect(history.length).toBe(1);
        expect(history[0].tick).toBe(2);
    });
});
