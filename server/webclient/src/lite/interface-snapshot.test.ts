import { afterAll, beforeAll, expect, test } from 'bun:test';
import './dom-shim.js';
import IfType from '#/config/IfType.js';
import Packet from '#/io/Packet.js';
import { ServerProt } from '#/io/ServerProt.js';
import { BotStateCollector } from '#/bot/StateCollector.js';
import { BotOverlay } from '#/bot/BotOverlay.js';
import type { Client } from '#/client/Client.js';
import type { BotWorldState } from '#/bot/types.js';
import { captureBaseInterfaces, resetBaseInterfaces } from './interfaces.js';
import { LiteClient } from './LiteClient.js';
import { dispatch } from './protocol/incoming.js';

let stubbedBase = false;
const makeClient = () => new LiteClient({ connection: { out: Packet.alloc(1), isClosed: false } as never, locIndex: { lookup: () => 0 } as never, username: 'snapshot_fixture', password: '' });
beforeAll(() => {
    try {
        makeClient();
    } catch {
        IfType.list = [];
        captureBaseInterfaces();
        stubbedBase = true;
    }
});
afterAll(() => {
    if (stubbedBase) resetBaseInterfaces();
});

function install(client: LiteClient): void {
    client.interfaces.list[1] = Object.assign(new IfType(), { id: 1, type: 0, width: 512, height: 334, children: [2, 3], childX: [10, 10], childY: [10, 120] });
    client.interfaces.list[2] = Object.assign(new IfType(), { id: 2, type: 6, width: 100, height: 100 });
    client.interfaces.list[3] = Object.assign(new IfType(), { id: 3, type: 4, width: 200, height: 20 });
}
function feed(client: LiteClient, opcode: number, write: (p: Packet) => void): void {
    const p = Packet.alloc(1);
    write(p);
    const length = p.pos;
    p.pos = 0;
    dispatch(client, opcode, p, length);
}

test('publishes packet-updated models/text and isolates two lite clients', () => {
    const a = makeClient(),
        b = makeClient();
    install(a);
    install(b);
    for (const [client, meshId, text] of [
        [a, 100, 'First puzzle'],
        [b, 200, 'Second puzzle']
    ] as const) {
        feed(client, ServerProt.IF_SETMODEL, p => {
            p.p2(2);
            p.p2(meshId);
        });
        feed(client, ServerProt.IF_SETTEXT, p => {
            p.p2(3);
            p.pjstr(text);
        });
        feed(client, ServerProt.IF_OPENMAIN, p => p.p2(1));
    }
    const first = a.collectBotState(1).interface.snapshot;
    const second = b.collectBotState(1).interface.snapshot;
    expect(first?.components.find(c => c.id === 2)?.model).toMatchObject({ kind: 'raw', meshId: 100, objectId: null });
    expect(second?.components.find(c => c.id === 2)?.model?.meshId).toBe(200);
    expect(first?.components.find(c => c.id === 3)?.text).toBe('First puzzle');
    expect(second?.components.find(c => c.id === 3)?.text).toBe('Second puzzle');
    feed(a, ServerProt.IF_CLOSE, () => {});
    expect(a.collectBotState(2).interface.snapshot).toEqual({ version: 1, rootId: -1, components: [], truncated: false });
    expect(b.collectBotState(2).interface.snapshot?.rootId).toBe(1);
});

test('preserves shared collector metadata through the browser overlay publication path', () => {
    const client = makeClient();
    install(client);
    feed(client, ServerProt.IF_OPENMAIN, p => p.p2(1));
    feed(client, ServerProt.IF_SETMODEL, p => {
        p.p2(2);
        p.p2(300);
    });
    client.activate();
    const collector = new BotStateCollector(client as unknown as Client);
    const overlay = BotOverlay.prototype as unknown as { collectWorldState(this: { client: LiteClient; collector: BotStateCollector; serverTick: number }): BotWorldState };
    const state = overlay.collectWorldState.call({ client, collector, serverTick: 1 });
    expect(state.interface.snapshot).toEqual(client.collectBotState(1).interface.snapshot);
    expect(state.interface.snapshot?.components.find(c => c.id === 2)?.model?.meshId).toBe(300);
});
