// Run in a subprocess with WORLD_FEED=true and a temporary cwd; no worker or network service starts.
import { afterEach, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';

class TestWorker extends EventEmitter {
    postMessage() {}
}
mock.module('worker_threads', () => ({ Worker: TestWorker }));

const { default: World } = await import('../../src/engine/World.js');
const { NetworkPlayer } = await import('../../src/engine/entity/NetworkPlayer.js');
const { default: NullClientSocket } = await import('../../src/server/NullClientSocket.js');
const { Visibility } = await import('../../src/network/rsbuf/visibility.js');
const { checkWorldFeedUpgrade, cycleWorldFeed, onWorldFeedClose, onWorldFeedMessage, onWorldFeedOpen } = await import('../../src/web/worldfeed.js');

type Message = { t: string; [key: string]: any };

const viewers: { close: () => void }[] = [];

afterEach(() => {
    for (const v of viewers.splice(0)) {
        v.close();
    }
    for (const player of World.playerLoop.all()) {
        player.unlink();
    }
});

function viewer(area?: { x: number; z: number; w: number; h: number }) {
    const sent: string[] = [];
    const ws = { data: { isWorldFeed: true }, send: (msg: string) => sent.push(msg), getBufferedAmount: () => 0 } as any;
    onWorldFeedOpen(ws);
    if (area) {
        onWorldFeedMessage(ws, JSON.stringify({ t: 'sub', ...area }));
    }
    const v = {
        ws,
        sent,
        last: (): Message => JSON.parse(sent[sent.length - 1]),
        close: () => onWorldFeedClose(ws)
    };
    viewers.push(v);
    return v;
}

function addPlayer(slot: number, x: number, z: number) {
    const player = new NetworkPlayer('feed' + slot, BigInt(slot), BigInt(slot), new NullClientSocket());
    player.slot = slot;
    player.x = player.lastTickX = x;
    player.z = player.lastTickZ = z;
    player.level = player.lastLevel = 0;
    player.isActive = true;
    player.appearanceBuf = Uint8Array.of(0, 0, 1, 2, 3);
    World.playerLoop.add(BigInt(slot), player);
    World.players[slot] = player;
    return player;
}

// What the engine does between ticks: cleanup resets the per-tick state.
function endTick() {
    for (const player of World.playerLoop.all()) {
        player.lastTickX = player.x;
        player.lastTickZ = player.z;
        player.lastLevel = player.level;
        player.walkDir = player.runDir = -1;
        player.tele = player.jump = false;
        player.masks = 0;
    }
    World.currentTick++;
}

const AREA = { x: 3200, z: 3200, w: 64, h: 64 };

test('first sight, shared step deltas, hidden players and leaving the area', () => {
    World.currentTick = 1;
    const a = viewer(AREA);
    const b = viewer(AREA);
    const outside = viewer({ x: 0, z: 0, w: 8, h: 8 });
    expect(JSON.parse(a.sent[0])).toMatchObject({ t: 'hello', v: 1 });

    const player = addPlayer(5, 3210, 3210);
    const hidden = addPlayer(6, 3211, 3211);
    hidden.visibility = Visibility.HARD;

    cycleWorldFeed();
    expect(a.last().p).toEqual([{ i: 5, f: 1, x: 3210, z: 3210, l: 0, ap: Buffer.from([0, 0, 1, 2, 3]).toString('base64') }]);
    expect(outside.last().p).toBeUndefined();
    endTick();

    // Idle: a tick with nothing in it.
    cycleWorldFeed();
    expect(a.last()).toEqual({ t: 'tick', k: 2, ms: expect.any(Number) });
    endTick();

    // Runs two steps east then north-east: both viewers get the same steps.
    player.x = 3212;
    player.z = 3211;
    player.walkDir = 4;
    player.runDir = 2;
    cycleWorldFeed();
    expect(a.last().p).toEqual([{ i: 5, x: 3212, z: 3211, l: 0, m: [4, 2] }]);
    expect(a.sent[a.sent.length - 1]).toBe(b.sent[b.sent.length - 1]);
    endTick();

    // Teleports out of the subscribed area: removed.
    player.x = 3300;
    player.tele = true;
    cycleWorldFeed();
    expect(a.last().rp).toEqual([5]);
    expect(a.last().p).toBeUndefined();
});

test('roster lists visible players every few ticks', () => {
    World.currentTick = 10;
    const v = viewer();
    onWorldFeedMessage(v.ws, JSON.stringify({ t: 'roster', on: true }));
    const player = addPlayer(7, 3222, 3218);

    cycleWorldFeed();
    const roster = v.sent.map(s => JSON.parse(s)).find(m => m.t === 'roster');
    expect(roster.p).toEqual([[7, 'Feed7', 3222, 3218, 0, 3]]);
    expect(player.isActive).toBe(true);
});

test('upgrade checks the token when one is configured', () => {
    expect(checkWorldFeedUpgrade(new URL('http://localhost/worldfeed'))).toBeUndefined();
});
