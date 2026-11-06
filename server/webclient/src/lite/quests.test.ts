// Quest state comes from the quest journal tab: the server colours each quest's
// line with IF_SETCOLOUR, and sends quest points as varp 101. This drives the
// real packet path against the real interface archive, so it fails if the
// tab's layout or the colour decoding changes under the collector.
//
// Needs the interface archive; set LITE_TEST_ORIGIN to point elsewhere. Skips if
// the server is unreachable.

import { beforeAll, describe, expect, test } from 'bun:test';

import './dom-shim.js';

import Packet from '#/io/Packet.js';
import { ServerProt } from '#/io/ServerProt.js';

import type { QuestState } from '#/bot/types.js';

import { loadCache } from './cache.js';
import { LiteClient } from './LiteClient.js';
import { dispatch } from './protocol/incoming.js';

const ORIGIN = process.env.LITE_TEST_ORIGIN ?? 'https://rs-sdk-demo.fly.dev';
const CACHE_DIR = process.env.LITE_TEST_CACHE ?? '/tmp/rs-sdk-lite-test-cache';

// questlist components (content/pack/interface.pack)
const FORTRESS = 7332; // Black Knight's Fortress
const COOK = 7333; // Cook's Assistant
const DEMON = 7334; // Demon Slayer

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

function send(client: LiteClient, prot: ServerProt, write: (buf: Packet) => void): void {
    const buf = Packet.alloc(1);
    write(buf);
    const size = buf.pos;
    buf.pos = 0;
    dispatch(client, prot, Object.assign(buf, { psize: size }), size);
}

/**
 * The client's quest state as its collector publishes it. A socket-less client
 * has no world to collect, so this reads just the quest fields.
 */
function questState(client: LiteClient): { quests: QuestState[]; questPoints: number } {
    client.activate();
    const collector = (client as any).bridge().collector;
    return { quests: collector.collectQuests(), questPoints: (client as any).var[101] ?? 0 };
}

/** IF_SETCOLOUR as the server writes it: a 24-bit colour packed to 5 bits per channel. */
function setColour(client: LiteClient, comId: number, rgb: number): void {
    const packed = (((rgb >> 19) & 0x1f) << 10) | (((rgb >> 11) & 0x1f) << 5) | ((rgb >> 3) & 0x1f);
    send(client, ServerProt.IF_SETCOLOUR, buf => {
        buf.p2(comId);
        buf.p2(packed);
    });
}

describe('quest state from the quest journal tab', () => {
    test('quest line colours and varp 101 become quests and questPoints', () => {
        if (!available) {
            console.warn(`[skip] ${ORIGIN} unreachable`);
            return;
        }

        const client = makeClient('questbot');
        setColour(client, FORTRESS, 0xff0000); // ^red_rgb
        setColour(client, COOK, 0x00ff00); // ^green_rgb
        setColour(client, DEMON, 0xffff00); // ^yellow_rgb
        send(client, ServerProt.VARP_SMALL, buf => {
            buf.p2(101);
            buf.p1(1);
        });

        const state = questState(client);
        const status = Object.fromEntries(state.quests.map(q => [q.name, q.status]));

        expect(state.quests.length).toBe(68);
        expect(status["Black Knight's Fortress"]).toBe('not_started');
        expect(status["Cook's Assistant"]).toBe('complete');
        expect(status['Demon Slayer']).toBe('in_progress');
        expect(status['Monkey Madness']).toBe('not_started'); // untouched: the cache's red
        expect(state.questPoints).toBe(1);
    });

    test('two clients keep separate quest progress', () => {
        if (!available) {
            return;
        }

        const a = makeClient('questa');
        const b = makeClient('questb');
        setColour(a, COOK, 0x00ff00);

        const cook = (client: LiteClient) => questState(client).quests.find(q => q.name === "Cook's Assistant")?.status;
        expect(cook(a)).toBe('complete');
        expect(cook(b)).toBe('not_started');
    });
});
