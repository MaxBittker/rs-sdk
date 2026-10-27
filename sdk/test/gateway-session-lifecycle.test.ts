import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        if (await check()) return;
        await pause(10);
    }
    throw new Error('Timed out waiting for gateway lifecycle event');
}

const authRequests: { ws: any; replyTo: string }[] = [];
const clients: WebSocket[] = [];
let lookupCount = 0;
let holdLookup = false;
let releaseLookup: (() => void) | undefined;
const login = Bun.serve({
    port: 0,
    fetch(req, server) {
        if (server.upgrade(req)) return;
        return new Response('login');
    },
    websocket: {
        message(ws, raw) {
            const msg = JSON.parse(String(raw));
            if (msg.type === 'sdk_auth') authRequests.push({ ws, replyTo: msg.replyTo });
        }
    }
});
const management = Bun.serve({
    port: 0,
    async fetch() {
        lookupCount++;
        if (holdLookup) await new Promise<void>(resolve => { releaseLookup = resolve; });
        return Response.json({ outdated: null });
    }
});
const port = 30000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
let gateway: ReturnType<typeof Bun.spawn>;

beforeEach(async () => {
    gateway = Bun.spawn(['bun', join(import.meta.dir, '../../server/gateway/gateway.ts')], {
        env: { ...process.env, AGENT_PORT: String(port), GATEWAY_PUBLIC_PORT: '0', LOGIN_SERVER: 'true',
            LOGIN_HOST: '127.0.0.1', LOGIN_PORT: String(login.port),
            ENGINE_MANAGEMENT_URL: `http://127.0.0.1:${management.port}`, MEMORY_DIAGNOSTICS_DIR: '' },
        stdout: 'ignore', stderr: 'ignore'
    });
    await until(async () => {
        try { return (await fetch(`${base}/status`)).ok; } catch { return false; }
    });
});
afterEach(async () => {
    holdLookup = false;
    releaseLookup?.();
    releaseLookup = undefined;
    for (const client of clients.splice(0)) client.close();
    authRequests.length = 0;
    gateway?.kill();
    if (gateway) await gateway.exited;
});
afterAll(() => {
    login.stop(true);
    management.stop(true);
});

async function status(): Promise<any> { return (await fetch(`${base}/status`)).json(); }
async function connect(mode = 'observe') {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    clients.push(ws);
    const messages: any[] = [];
    ws.onmessage = event => messages.push(JSON.parse(String(event.data)));
    await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = reject; });
    ws.send(JSON.stringify({ type: 'sdk_connect', clientId: 'lifecycle-test', username: 'testbot', password: 'x', mode }));
    await until(() => authRequests.length > 0);
    return { ws, messages, auth: authRequests.shift()! };
}
function authenticate(request: { ws: any; replyTo: string }) {
    request.ws.send(JSON.stringify({ replyTo: request.replyTo, success: true }));
}
async function close(ws: WebSocket) {
    const closed = new Promise<void>(resolve => { ws.onclose = () => resolve(); });
    ws.close();
    await closed;
    // Ensure the server's close callback runs before releasing its pending async work.
    await pause(30);
}

test('a socket closed during authentication never becomes a registered SDK session', async () => {
    const client = await connect();
    await close(client.ws);
    const before = lookupCount;
    authenticate(client.auth);
    await pause(100);
    expect(Object.keys((await status()).sdks)).toHaveLength(0);
    expect(lookupCount).toBe(before);
});

test('a socket closed during the outdated-client lookup never becomes a registered session', async () => {
    holdLookup = true;
    const before = lookupCount;
    const client = await connect();
    authenticate(client.auth);
    await until(() => lookupCount > before && !!releaseLookup);
    await close(client.ws);
    releaseLookup!();
    await pause(100);
    expect(Object.keys((await status()).sdks)).toHaveLength(0);
});

test('an open socket still authenticates and is removed when it closes', async () => {
    const client = await connect();
    authenticate(client.auth);
    await until(() => client.messages.some(m => m.type === 'sdk_connected'));
    expect(Object.keys((await status()).sdks)).toHaveLength(1);
    await close(client.ws);
    expect(Object.keys((await status()).sdks)).toHaveLength(0);
});

test('a late auth reply for a closed controller cannot displace the live controller', async () => {
    const live = await connect('control');
    authenticate(live.auth);
    await until(() => live.messages.some(m => m.type === 'sdk_connected'));
    const originalSessions = Object.keys((await status()).sdks);

    const stale = await connect('control');
    await close(stale.ws);
    authenticate(stale.auth);
    await pause(100);

    expect(Object.keys((await status()).sdks)).toEqual(originalSessions);
    expect(live.ws.readyState).toBe(WebSocket.OPEN);
    expect(live.messages.some(m => m.type === 'sdk_error')).toBe(false);
});
