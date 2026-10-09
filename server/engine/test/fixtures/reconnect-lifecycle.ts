// Run in a subprocess with a temporary cwd; no worker or network service starts.
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type ClientSocket from '../../src/server/ClientSocket.js';

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
const world = World as any;

afterEach(() => {
    for (const player of World.playerLoop.all()) player.unlink();
    World.newPlayers.clear();
    world.loginThread.messages.length = 0;
    world.friendThread.messages.length = 0;
});

function player(client: ClientSocket) {
    const p = new NetworkPlayer('reconnect', 1n, 1n, client);
    const logs: string[] = [];
    p.addSessionLog = (_type, message) => logs.push(message);
    return { p, logs };
}

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
