import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import WsSyncReq from '../src/3rdparty/ws-sync/ws-sync.js';

class FakeSocket extends EventEmitter {
    readyState = 1;
    sent: string[] = [];

    send(data: string) {
        this.sent.push(data);
    }
}

test('login reply callbacks are released after timeout, response, and failed send', async () => {
    const socket = new FakeSocket();
    const client = new WsSyncReq(socket);
    client.loopPauseWaitIntervalMS = 1;

    const pending = client.fetchSync({ type: 'player_login' }, 10);
    expect(Object.keys(client.waitedSyncCallbacks)).toHaveLength(1);
    expect((await pending).error).toContain('exceeded timeout');
    expect(Object.keys(client.waitedSyncCallbacks)).toHaveLength(0);

    const accepted = client.fetchSync({ type: 'player_login' }, 1000);
    const { replyTo } = JSON.parse(socket.sent.at(-1)!);
    socket.emit('message', Buffer.from(JSON.stringify({ replyTo, response: 0 })));
    expect((await accepted).result.response).toBe(0);
    expect(Object.keys(client.waitedSyncCallbacks)).toHaveLength(0);

    socket.readyState = 3;
    expect((await client.fetchSync({ type: 'player_login' })).error).toContain('failed to send');
    expect(Object.keys(client.waitedSyncCallbacks)).toHaveLength(0);
});
