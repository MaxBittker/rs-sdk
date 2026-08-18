// Outgoing packet encoding must match the engine's decoders byte for byte.
//
// The engine never complains about a malformed interaction packet - it decodes
// whatever arrives and validates the *values* (InvButtonHandler checks
// inv.hasAt(slot, obj) exactly), so a swapped field order or a wrong component
// id fails silently: the op is discarded and the bot sees nothing. These tests
// drive the real LiteClient action methods against a socketless connection and
// assert the exact bytes written to the out packet - opcode, field order,
// values - against the decoder layouts in
// server/engine/src/network/game/client/codec/.
//
// The connection stub's Packet has no ISAAC cipher (`random` is null), so
// p1Enc writes the plaintext opcode and the bytes can be compared directly.
//
// Needs the config archives; set LITE_TEST_ORIGIN to point elsewhere. Skips if
// the server is unreachable.

import { beforeAll, describe, expect, test } from 'bun:test';

import './dom-shim.js';

import CollisionMap from '#/dash3d/CollisionMap.js';
import JString from '#/datastruct/JString.js';
import { ClientProt } from '#/io/ClientProt.js';
import Packet from '#/io/Packet.js';
import { ServerProt } from '#/io/ServerProt.js';
import WordPack from '#/wordfilter/WordPack.js';

import { loadCache } from './cache.js';
import { LiteClient } from './LiteClient.js';
import { tryMoveTo } from './movement.js';
import { dispatch } from './protocol/incoming.js';

const ORIGIN = process.env.LITE_TEST_ORIGIN ?? 'https://rs-sdk-demo.fly.dev';
const CACHE_DIR = process.env.LITE_TEST_CACHE ?? '/tmp/rs-sdk-lite-test-cache';

const INV_COMPONENT = 3214; // inventory:inv
const BANK_SIDE_INV = 2006; // bank_side:inv on this 274 build (5064 is the 317-era id)

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

/**
 * UPDATE_INV_FULL body. `items` maps slot -> obj id; the wire (and therefore
 * linkObjType) carries obj id + 1, with 0 meaning empty.
 */
function invPacket(componentId: number, items: Record<number, number>): Packet {
    const slots = Object.keys(items).map(Number);
    const size = Math.max(...slots) + 1;
    const buf = Packet.alloc(1);
    buf.p2(componentId);
    buf.p1(size);
    for (let slot = 0; slot < size; slot++) {
        const objId = items[slot];
        buf.p2(objId !== undefined ? objId + 1 : 0);
        buf.p1(objId !== undefined ? 1 : 0);
    }
    const total = buf.pos;
    buf.pos = 0;
    return Object.assign(buf, { psize: total });
}

function giveItems(c: LiteClient, componentId: number, items: Record<number, number>): void {
    const packet = invPacket(componentId, items);
    dispatch(c, ServerProt.UPDATE_INV_FULL, packet, packet.pos + 8);
}

/** Reads back what an action wrote to the out packet after `from`. */
class Capture {
    private pos: number;
    constructor(
        private readonly buf: Packet,
        from: number
    ) {
        this.pos = from;
    }
    g1(): number {
        return this.buf.data[this.pos++];
    }
    g2(): number {
        const value = ((this.buf.data[this.pos] << 8) | this.buf.data[this.pos + 1]) & 0xffff;
        this.pos += 2;
        return value;
    }
    g8(): bigint {
        let value = 0n;
        for (let i = 0; i < 8; i++) {
            value = (value << 8n) | BigInt(this.buf.data[this.pos++]);
        }
        return value;
    }
    rest(until: number): number[] {
        return Array.from(this.buf.data.subarray(this.pos, until));
    }
    get at(): number {
        return this.pos;
    }
}

describe('outgoing action encoding', () => {
    test('OPHELDU field order matches OpHeldUDecoder (obj, slot, com, useObj, useSlot, useCom)', () => {
        if (!available) {
            console.warn(`[skip] ${ORIGIN} unreachable`);
            return;
        }

        const c = makeClient('bota');
        // slot 0: knife (946), slot 3: logs (1511)
        giveItems(c, INV_COMPONENT, { 0: 946, 3: 1511 });

        const start = c.out.pos;
        expect(c.useItemOnItem(0, 3)).toBe(true);

        const r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.OPHELDU);
        expect(r.g2()).toBe(1511); // obj: the *target* item id
        expect(r.g2()).toBe(3); // slot: target slot
        expect(r.g2()).toBe(INV_COMPONENT); // com
        expect(r.g2()).toBe(946); // useObj: the source item id
        expect(r.g2()).toBe(0); // useSlot: source slot
        expect(r.g2()).toBe(INV_COMPONENT); // useCom
        expect(r.at).toBe(c.out.pos); // nothing extra written
    });

    test('OPHELDT field order matches OpHeldTDecoder (obj, slot, com, spellCom)', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        giveItems(c, INV_COMPONENT, { 2: 1511 });

        const SPELL_COM = 1162;
        const start = c.out.pos;
        expect(c.spellOnItem(2, SPELL_COM)).toBe(true);

        const r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.OPHELDT);
        expect(r.g2()).toBe(1511); // obj first
        expect(r.g2()).toBe(2); // then slot
        expect(r.g2()).toBe(INV_COMPONENT);
        expect(r.g2()).toBe(SPELL_COM);
        expect(r.at).toBe(c.out.pos);
    });

    test('bank deposit targets bank_side:inv 2006 and maps amounts to the browser option table', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        // The bank side inventory is its own component; depositing reads it,
        // not inventory:inv. This dispatch doubles as proof that 2006 is a real
        // inv component in this build's interface pack.
        giveItems(c, BANK_SIDE_INV, { 4: 995 });

        // option 1/2/3 = 1/5/10, option 4 = All (-1 or >= 2^31-1), option 5 = X.
        const cases: Array<[number, number]> = [
            [1, ClientProt.INV_BUTTON1],
            [5, ClientProt.INV_BUTTON2],
            [10, ClientProt.INV_BUTTON3],
            [7, ClientProt.INV_BUTTON5],
            [-1, ClientProt.INV_BUTTON4],
            [2147483647, ClientProt.INV_BUTTON4]
        ];

        for (const [amount, opcode] of cases) {
            const start = c.out.pos;
            expect(c.bankDeposit(4, amount)).toBe(true);

            const r = new Capture(c.out, start);
            expect(r.g1()).toBe(opcode);
            expect(r.g2()).toBe(995); // obj
            expect(r.g2()).toBe(4); // slot
            expect(r.g2()).toBe(BANK_SIDE_INV); // com
            expect(r.at).toBe(c.out.pos);
        }
    });

    test('MESSAGE_PUBLIC carries colour + effect inside the size byte, then packed text', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');

        const start = c.out.pos;
        const outcome = c.say('hello world');
        expect(outcome.ok).toBe(true);

        // The oracle: pack the same text the way the browser client does.
        const scratch = Packet.alloc(0);
        WordPack.pack(scratch, 'hello world');
        const packed = Array.from(scratch.data.subarray(0, scratch.pos));

        const r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.MESSAGE_PUBLIC);
        expect(r.g1()).toBe(2 + packed.length); // size covers colour + effect + text
        expect(r.g1()).toBe(0); // colour
        expect(r.g1()).toBe(0); // effect
        expect(r.rest(c.out.pos)).toEqual(packed);
    });

    test('say() self-echoes into the chat ring like incoming public chat', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        c.say('hello world');

        expect(c.chatType[0]).toBe(2); // same type incoming MESSAGE_PUBLIC uses
        expect(c.chatText[0]).toBe('Hello world'); // sentence-cased like the browser echo
        expect(c.localPlayer!.chatMessage).toBe('Hello world');
        expect(c.localPlayer!.chatTimer).toBe(150);
    });

    test('MESSAGE_PRIVATE carries the target userhash inside the size byte, then packed text', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');

        const start = c.out.pos;
        const outcome = c.sendPrivateMessage('botb', 'hello world');
        expect(outcome.ok).toBe(true);

        // The oracle: pack the same text the way the browser client does.
        const scratch = Packet.alloc(0);
        WordPack.pack(scratch, 'hello world');
        const packed = Array.from(scratch.data.subarray(0, scratch.pos));

        const r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.MESSAGE_PRIVATE);
        expect(r.g1()).toBe(8 + packed.length); // size covers userhash + text
        expect(r.g8()).toBe(JString.toUserhash('botb'));
        expect(r.rest(c.out.pos)).toEqual(packed);
    });

    test('sendPrivateMessage() self-echoes as a sent-PM (type 6) and rejects bad names', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        c.sendPrivateMessage('botb', 'hello world');

        expect(c.chatType[0]).toBe(6); // same type the browser uses for "To <name>:"
        expect(c.chatUsername[0]).toBe('Botb');
        expect(c.chatText[0]).toBe('Hello world');

        const before = c.out.pos;
        expect(c.sendPrivateMessage('', 'hi').ok).toBe(false);
        expect(c.out.pos).toBe(before); // nothing written for an invalid target
    });

    test('INV_BUTTON carries the real obj id from linkObjType, not 0', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        giveItems(c, INV_COMPONENT, { 1: 1511 });

        let start = c.out.pos;
        expect(c.clickInterfaceIop(INV_COMPONENT, 2, 1)).toBe(true);

        let r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.INV_BUTTON2);
        expect(r.g2()).toBe(1511); // the id InvButtonHandler checks with inv.hasAt
        expect(r.g2()).toBe(1); // slot
        expect(r.g2()).toBe(INV_COMPONENT);
        expect(r.at).toBe(c.out.pos);

        // An empty slot still sends, with obj 0 - matching the browser.
        start = c.out.pos;
        expect(c.clickInterfaceIop(INV_COMPONENT, 1, 9)).toBe(true);

        r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.INV_BUTTON1);
        expect(r.g2()).toBe(0);
        expect(r.g2()).toBe(9);
        expect(r.g2()).toBe(INV_COMPONENT);
    });

    test('useInventoryItem routes non-inventory components to INV_BUTTON (no OPHELD handlers there)', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        giveItems(c, INV_COMPONENT, { 2: 385 }); // shark in the main inventory
        giveItems(c, BANK_SIDE_INV, { 1: 385 }); // shark in the bank side inventory

        // Main inventory (default): OPHELDn, as the engine expects for 3214.
        let start = c.out.pos;
        expect(c.useInventoryItem(2, 4)).toBe(true);

        let r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.OPHELD4);
        expect(r.g2()).toBe(385);
        expect(r.g2()).toBe(2);
        expect(r.g2()).toBe(INV_COMPONENT);
        expect(r.at).toBe(c.out.pos);

        // Foreign component: INV_BUTTONn with the same field order - OPHELD
        // against a non-3214 com id is silently dropped by the engine.
        start = c.out.pos;
        expect(c.useInventoryItem(1, 4, BANK_SIDE_INV)).toBe(true);

        r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.INV_BUTTON4);
        expect(r.g2()).toBe(385);
        expect(r.g2()).toBe(1);
        expect(r.g2()).toBe(BANK_SIDE_INV);
        expect(r.at).toBe(c.out.pos);
    });

    test('long walks clamp to the current scene edge like the browser client', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        c.mapBuildBaseX = 3200;
        c.mapBuildBaseZ = 3200;
        c.collision[0] = new CollisionMap();
        c.localPlayer!.routeX[0] = 50;
        c.localPlayer!.routeZ[0] = 50;

        const start = c.out.pos;
        expect(c.walkTo(4000, 3250, true)).toEqual({ moved: true, outOfRange: true });

        const r = new Capture(c.out, start);
        expect(r.g1()).toBe(ClientProt.MOVE_GAMECLICK);
        expect(r.g1()).toBe(5); // one turn: run flag + absolute x/z
        expect(r.g1()).toBe(1); // running
        expect(r.g2()).toBe(3302); // baseX + build-area max interior tile
        expect(r.g2()).toBe(3250);
        expect(r.at).toBe(c.out.pos);

        // An in-area destination reports outOfRange false.
        expect(c.walkTo(3251, 3251, true)).toEqual({ moved: true, outOfRange: false });
    });

    test('an actor already inside an NPC footprint needs no movement packet', () => {
        if (!available) {
            return;
        }

        const c = makeClient('bota');
        c.collision[0] = new CollisionMap();
        c.localPlayer!.routeX[0] = 50;
        c.localPlayer!.routeZ[0] = 50;

        const start = c.out.pos;
        // A size-five NPC rooted at 48,48 contains the actor at 50,50.
        expect(tryMoveTo(c, 48, 48, 5, 5, 0, 0, 0)).toBe(true);
        expect(c.out.pos).toBe(start);
    });
});
