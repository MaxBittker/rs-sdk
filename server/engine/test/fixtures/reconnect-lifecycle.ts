// Run in a subprocess with a temporary cwd; no worker or network service starts.
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type ClientSocket from '../../src/server/ClientSocket.js';
import Packet from '../../src/io/Packet.js';

class TestWorker extends EventEmitter {
    messages: unknown[] = [];
    postMessage(message: unknown) {
        this.messages.push(message);
    }
}
mock.module('worker_threads', () => ({ Worker: TestWorker }));

const { default: World } = await import('../../src/engine/World.js');
const { NetworkPlayer } = await import('../../src/engine/entity/NetworkPlayer.js');
const { default: NullClientSocket } = await import('../../src/server/NullClientSocket.js');
const { default: WSClientSocket } = await import('../../src/server/ws/WSClientSocket.js');
const { default: TcpServer } = await import('../../src/server/tcp/TcpServer.js');
const { websocketHandlers } = await import('../../src/web/websocket.js');
const { PlayerLoading } = await import('../../src/engine/entity/PlayerLoading.js');
const { default: ScriptProvider } = await import('../../src/engine/script/ScriptProvider.js');
const { default: ScriptRunner } = await import('../../src/engine/script/ScriptRunner.js');
const { default: VarPlayerType } = await import('../../src/cache/config/VarPlayerType.js');
const world = World as any;

test('single-pass varp serialization matches the existing save layout byte for byte', () => {
    const get = spyOn(VarPlayerType, 'get').mockImplementation(id => ({
        scope: id % 3 === 0 ? VarPlayerType.SCOPE_TEMP : VarPlayerType.SCOPE_PERM
    }) as any);
    try {
        const { p } = player(new NullClientSocket());
        for (const values of [[], [0, 0, 0], [123, 1, 127, 456, 128, 16384, 789, -1, 2147483647, 0, -2147483648]]) {
            p.vars = new Int32Array(values);
            const expected = new Packet(new Uint8Array(1024));
            let count = 0;
            for (let id = 0; id < values.length; id++) {
                if (VarPlayerType.get(id).scope === VarPlayerType.SCOPE_PERM && values[id] !== 0) count++;
            }
            expected.p2(count);
            for (let id = 0; id < values.length; id++) {
                if (VarPlayerType.get(id).scope === VarPlayerType.SCOPE_PERM && values[id] !== 0) {
                    expected.p2(id);
                    expected.pVarInt(values[id]);
                }
            }
            const save = p.save(false);
            // Header, position, appearance, energy, playtime and 21 skill records.
            const offset = 4 + 5 + 7 + 5 + 1 + 2 + 4 + 21 * 5;
            expect(save.slice(offset, offset + expected.pos)).toEqual(expected.data.slice(0, expected.pos));
            expect(PlayerLoading.verify(new Packet(save))).toBe(true);
        }
    } finally {
        get.mockRestore();
    }
});

afterEach(() => {
    for (const player of World.playerLoop.all()) player.unlink();
    World.newPlayers.clear();
    world.players.fill(undefined);
    world.shutdownTick = -1;
    world.loginThread.messages.length = 0;
    world.friendThread.messages.length = 0;
});

function player(client: ClientSocket) {
    const p = new NetworkPlayer('reconnect', 1n, 1n, client);
    const logs: string[] = [];
    p.addSessionLog = (_type, message) => logs.push(message);
    return { p, logs };
}

test('saved snapshots own their bytes after serialization packet reuse', () => {
    const { p } = player(new NullClientSocket());
    p.x = 3200; p.z = 3201;
    const first = p.save(false);
    const expected = first.slice();
    expect(first.buffer.byteLength).toBe(first.byteLength);
    expect(PlayerLoading.verify(new Packet(first))).toBe(true);
    // Reuse and overwrite the released serialization packet before reading the save.
    const reused = Packet.alloc(2);
    reused.data.fill(255);
    reused.release();
    p.x = 3300;
    const second = p.save(false);
    expect(first).toEqual(expected);
    expect(first).not.toEqual(second);
    expect(PlayerLoading.verify(new Packet(first))).toBe(true);
    const restored = PlayerLoading.load(p.username, new Packet(first), null);
    expect(restored.x).toBe(3200);
    expect(restored.z).toBe(3201);
});

function queuedReconnects(count: number, onSave = () => {}) {
    const entries = [];
    for (let index = 0; index < count; index++) {
        const old = websocket();
        const next = websocket();
        old.client.state = next.client.state = 1;
        const name = `budget${index}`;
        const active = new NetworkPlayer(name, BigInt(index + 1), 1n, old.client);
        const pending = new NetworkPlayer(name, BigInt(index + 1), 1n, next.client);
        active.save = () => { onSave(); return Uint8Array.of(index); };
        active.onReconnect = () => {};
        active.addSessionLog = pending.addSessionLog = () => {};
        pending.reconnecting = true;
        World.playerLoop.add(1n, active);
        World.newPlayers.add(pending);
        entries.push({ active, pending, next });
    }
    return entries;
}

test('a slow reconnect yields after one save and the remaining accounts drain without loss', () => {
    let elapsed = 0;
    const clock = spyOn(performance, 'now').mockImplementation(() => elapsed);
    const entries = queuedReconnects(185, () => { elapsed += 120; });
    const initialRate = World.tickRate;
    World.tickRate = 300;
    try {
        for (let remaining = 184; remaining >= 0; remaining--) {
            const before = elapsed;
            world.processLogins();
            expect(World.newPlayers.size).toBe(remaining);
            expect(elapsed - before).toBe(120);
        }
        expect(world.loginThread.messages).toHaveLength(185);
        for (const { active, next } of entries) {
            expect(active.client).toBe(next.client);
            expect(next.client.player).toBe(active);
            expect(next.sent).toEqual([[15]]);
        }
    } finally {
        World.tickRate = initialRate;
        clock.mockRestore();
    }
});

test('a logout burst retains deferred accounts and runs at most one slow checkpoint per phase', () => {
    let elapsed = 0;
    const clock = spyOn(performance, 'now').mockImplementation(() => elapsed);
    const entries = queuedReconnects(3);
    World.newPlayers.clear();
    for (const { active } of entries) {
        active.loggingOut = true;
        active.canAccess = () => true;
        active.closeModal = () => {};
    }
    const trigger = spyOn(ScriptProvider, 'getByTriggerSpecific').mockReturnValue({} as any);
    const init = spyOn(ScriptRunner, 'init').mockReturnValue({ pointerAdd() {} } as any);
    const execute = spyOn(ScriptRunner, 'execute').mockImplementation(() => {});
    const remove = spyOn(World, 'removePlayer').mockImplementation(p => { elapsed += 120; p.unlink(); });
    try {
        for (let remaining = 2; remaining >= 0; remaining--) {
            world.processLogouts();
            expect([...World.playerLoop.all()]).toHaveLength(remaining);
            for (const p of World.playerLoop.all()) expect(p.loggingOut).toBe(true);
        }
        expect(remove).toHaveBeenCalledTimes(3);
        const shutdownEntries = queuedReconnects(3);
        World.newPlayers.clear();
        for (const { active } of shutdownEntries) {
            active.canAccess = () => true;
            active.closeModal = () => {};
        }
        world.shutdownTick = 0;
        world.processLogouts();
        expect([...World.playerLoop.all()]).toHaveLength(0);
        expect(remove).toHaveBeenCalledTimes(6);
    } finally {
        clock.mockRestore(); trigger.mockRestore(); init.mockRestore(); execute.mockRestore(); remove.mockRestore();
    }
});

test('cheap reconnects respect the count limit and closed queued sockets are discarded', () => {
    const clock = spyOn(performance, 'now').mockReturnValue(0);
    const entries = queuedReconnects(12);
    entries[0].next.close();
    try {
        world.processLogins();
        expect(World.newPlayers.size).toBe(2);
        expect(world.loginThread.messages).toHaveLength(9);
        expect(entries[0].next.sent).toEqual([]);
        world.processLogins();
        expect(World.newPlayers.size).toBe(0);
        expect(world.loginThread.messages).toHaveLength(11);
    } finally {
        clock.mockRestore();
    }
});

test('a slow session takeover finishes admission before yielding, even at the IP cap', () => {
    let elapsed = 0;
    const clock = spyOn(performance, 'now').mockImplementation(() => elapsed);
    const entries = queuedReconnects(2);
    entries[0].pending.reconnecting = false;
    entries[0].active.slot = 1;
    world.players[1] = entries[0].active;
    const events: string[] = [];
    entries[0].active.closeModal = () => { events.push('close modal'); };
    entries[0].active.save = () => { events.push('save'); elapsed += 120; return Uint8Array.of(42); };
    entries[0].pending.staffModLevel = 1;
    const loaded = new NetworkPlayer(entries[0].active.username, entries[0].active.username37, 1n, entries[0].next.client);
    loaded.onLogin = () => { events.push('login'); };
    loaded.addSessionLog = () => {};
    const load = spyOn(PlayerLoading, 'load').mockImplementation((_name, packet) => {
        expect([...packet.data]).toEqual([42]);
        return loaded;
    });
    const remove = spyOn(World, 'removePlayerWithoutSave').mockImplementation(p => {
        events.push('remove');
        delete world.players[p.slot];
        p.unlink();
    });
    const zone = spyOn(World.gameMap, 'getZone').mockReturnValue({ enter() {} } as any);
    const trigger = spyOn(ScriptProvider, 'getByTriggerSpecific').mockReturnValue({} as any);
    const init = spyOn(ScriptRunner, 'init').mockImplementation((_script, self) => {
        expect(self).toBe(entries[0].active);
        return { pointerAdd() {} } as any;
    });
    const execute = spyOn(ScriptRunner, 'execute').mockImplementation(() => { events.push('logout trigger'); return 0 as any; });
    try {
        world.processLogins();
        expect(events).toEqual(['close modal', 'logout trigger', 'save', 'remove', 'login']);
        expect([...World.playerLoop.all()]).toContain(loaded);
        expect(world.players[loaded.slot]).toBe(loaded);
        expect(loaded.staffModLevel).toBe(1);
        expect(World.newPlayers.size).toBe(1);
        expect(entries[0].next.sent).toEqual([[2, 1, 1]]);
        world.processLogins();
        expect(World.newPlayers.size).toBe(0);
        expect(entries[1].next.sent).toEqual([[15]]);
    } finally {
        clock.mockRestore(); load.mockRestore(); remove.mockRestore(); zone.mockRestore();
        trigger.mockRestore(); init.mockRestore(); execute.mockRestore();
    }
});

test('a takeover waits for the old session to finish dying, and gives up at the combat-lock cap', () => {
    const entries = queuedReconnects(2);
    const [dying, fighting] = entries;
    for (const [index, entry] of entries.entries()) {
        entry.pending.reconnecting = false;
        entry.active.slot = index + 1;
        world.players[index + 1] = entry.active;
        entry.active.closeModal = () => {};
    }
    // mid ~player_death: suspended on p_delay with item loss still to run
    dying.active.delayed = true;
    world.currentTick = 1000;
    fighting.active.preventLogoutUntil = 1000 + 500;
    const loaded = new NetworkPlayer(dying.active.username, dying.active.username37, 1n, dying.next.client);
    loaded.onLogin = () => {};
    loaded.addSessionLog = () => {};
    const load = spyOn(PlayerLoading, 'load').mockReturnValue(loaded);
    const removed: string[] = [];
    const remove = spyOn(World, 'removePlayerWithoutSave').mockImplementation(p => {
        removed.push(p.username);
        delete world.players[p.slot];
        p.unlink();
    });
    const zone = spyOn(World.gameMap, 'getZone').mockReturnValue({ enter() {} } as any);
    try {
        world.processLogins();
        expect(removed).toEqual([]);
        expect(World.newPlayers.size).toBe(2);
        expect(dying.next.sent).toEqual([]);

        dying.active.delayed = false;
        world.currentTick++;
        world.processLogins();
        expect(removed).toEqual([dying.active.username]);
        expect(dying.next.sent).toEqual([[2, 0, 1]]);
        expect([...World.newPlayers]).toEqual([fighting.pending]);

        world.currentTick += 49;
        world.processLogins();
        expect(fighting.next.sent).toEqual([[5]]);
        expect(World.newPlayers.size).toBe(0);
        expect(removed).toEqual([dying.active.username]);
    } finally {
        load.mockRestore(); remove.mockRestore(); zone.mockRestore();
        world.currentTick = 0;
    }
});

test('a takeover waits out a duel instead of cancelling it through [logout,_]', () => {
    const [entry] = queuedReconnects(1);
    entry.pending.reconnecting = false;
    entry.active.slot = 1;
    world.players[1] = entry.active;
    entry.active.closeModal = () => {};
    entry.active.vars = new Int32Array([6]); // ^duelstatus_start
    const varp = spyOn(VarPlayerType, 'getId').mockImplementation(name => (name === 'duelstatus' ? 0 : -1));
    const remove = spyOn(World, 'removePlayerWithoutSave');
    try {
        world.processLogins();
        expect(remove).not.toHaveBeenCalled();
        expect([...World.newPlayers]).toEqual([entry.pending]);
        expect(entry.next.sent).toEqual([]);
    } finally {
        varp.mockRestore(); remove.mockRestore();
    }
});

test('a normal logout refuses queued logins loaded before its save', () => {
    const [entry, bystander] = queuedReconnects(2);
    entry.pending.reconnecting = false;
    entry.active.slot = 1;
    world.players[1] = entry.active;
    const flush = spyOn(World, 'flushPlayer').mockImplementation(() => {});
    const zone = spyOn(World.gameMap, 'getZone').mockReturnValue({ leave() {} } as any);
    try {
        World.removePlayer(entry.active);
        expect([...World.newPlayers]).toEqual([bystander.pending]);
        expect(entry.next.sent).toEqual([[5]]);
    } finally {
        flush.mockRestore(); zone.mockRestore();
    }
});

function websocket() {
    const client = new WSClientSocket();
    const sent: number[][] = [];
    const ws = { data: { client }, send: (data: Uint8Array) => { sent.push([...data]); return data.length; } } as any;
    const close = () => websocketHandlers.close(ws);
    client.init({ send: ws.send, close, terminate: close }, '127.0.0.1');
    return { client, sent, close };
}

class TestTcpSocket extends EventEmitter {
    remoteAddress = '127.0.0.1';
    sent: number[][] = [];
    setTimeout() { return this; }
    setNoDelay() { return this; }
    write(data: Uint8Array) { this.sent.push([...data]); return true; }
    end() { this.emit('close'); }
    destroy() { this.emit('close'); }
}

function tcp() {
    const server = new TcpServer();
    // Register the real connection/close callbacks without opening a listener.
    server.tcp.listen = (() => server.tcp) as typeof server.tcp.listen;
    server.start();
    const socket = new TestTcpSocket();
    let client: ClientSocket | undefined;
    const capture = spyOn(World, 'onClientData').mockImplementation(value => { client = value; });
    try {
        server.tcp.emit('connection', socket);
        socket.emit('data', Buffer.alloc(0));
    } finally {
        capture.mockRestore();
    }
    expect(client).toBeDefined();
    return { client: client!, sent: socket.sent, close: () => { socket.emit('close'); } };
}

for (const [name, connection] of [['WebSocket', websocket], ['TCP', tcp]] as const) {
    test(`${name}: reconnect survives the old close and the current close cleans up`, () => {
        const old = connection();
        const replacement = connection();
        old.client.state = replacement.client.state = 1;
        const active = player(old.client);
        const temporary = player(replacement.client);
        const save = Uint8Array.of(1, 2, 3);
        let saved = 0, reconnected = 0;
        active.p.save = () => { saved++; return save; };
        active.p.onReconnect = () => { reconnected++; };
        temporary.p.reconnecting = true;
        World.playerLoop.add(1n, active.p);
        World.newPlayers.add(temporary.p);

        // Actual production reconnect path, including closure of the previous client.
        world.processLogins();
        expect(old.client.state).toBe(-1);
        expect(active.p.client).toBe(replacement.client);
        expect(replacement.client.player).toBe(active.p);
        expect(active.p.session).toBe(replacement.client.uuid);
        expect(replacement.sent).toEqual([[15]]);
        expect(saved).toBe(1);
        expect(reconnected).toBe(1);
        expect(world.loginThread.messages).toEqual([{ type: 'player_autosave', username: active.p.username, save }]);
        expect(World.newPlayers.size).toBe(0);

        // close() is delayed on both transports: its event arrives after ownership moved.
        old.close();
        expect(old.client.state).toBe(-1);
        expect(active.p.client).toBe(replacement.client);
        expect(replacement.client.player).toBe(active.p);
        expect(active.logs).toEqual([]);

        replacement.close();
        expect(replacement.client.state).toBe(-1);
        expect(active.p.client).toBeInstanceOf(NullClientSocket);
        expect(active.logs).toEqual([name === 'TCP' ? 'TCP socket closed' : 'WS socket closed']);
        expect(temporary.logs.some(log => log.includes('socket closed'))).toBe(false);
    });

    test(`${name}: an unreplaced current socket still detaches on close`, () => {
        const current = connection();
        current.client.state = 1;
        const active = player(current.client);
        current.close();
        expect(current.client.state).toBe(-1);
        expect(active.p.client).toBeInstanceOf(NullClientSocket);
        expect(active.logs).toEqual([name === 'TCP' ? 'TCP socket closed' : 'WS socket closed']);
    });
}
