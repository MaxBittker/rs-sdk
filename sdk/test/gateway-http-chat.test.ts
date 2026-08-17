// The gateway's HTTP chat endpoints (GET /chat/:bot, POST /say/:bot) exist so
// chat tools can work in one bounded request/response instead of a fresh
// observer WebSocket per invocation - over TLS tunnels that per-invocation
// handshake stalls, and the old CLI could eat a shell tool's whole 120s
// timeout in silence. These tests run the real gateway as a subprocess with a
// scripted bot client on the other side.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'path';

const PORT = 20000 + Math.floor(Math.random() * 10000);
const BASE = `http://localhost:${PORT}`;
const REPO_ROOT = join(import.meta.dir, '..', '..');

let gateway: ReturnType<typeof Bun.spawn> | null = null;
let bot: WebSocket | null = null;

/** Say actions the fake bot client has received, in order. */
const receivedSays: string[] = [];

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number, what: string) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${what}`);
}

beforeAll(async () => {
    gateway = Bun.spawn({
        cmd: ['bun', join(REPO_ROOT, 'server', 'gateway', 'gateway.ts')],
        env: { ...process.env, AGENT_PORT: String(PORT), LOGIN_SERVER: 'false' },
        stdout: 'ignore',
        stderr: 'ignore'
    });
    await waitFor(async () => {
        try {
            return (await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(500) })).ok;
        } catch {
            return false;
        }
    }, 15000, 'gateway to boot');

    // Fake bot client: registers as 'tbot', answers say actions unless the
    // text contains 'noreply' (which simulates a dead game client).
    bot = new WebSocket(`ws://localhost:${PORT}`);
    bot.onopen = () => {
        bot!.send(JSON.stringify({ type: 'connected', clientId: 'bot-test', username: 'tbot', maxMessageLength: 400 }));
        bot!.send(JSON.stringify({
            type: 'state',
            state: {
                tick: 1,
                inGame: true,
                player: { name: 'tbot', worldX: 3222, worldZ: 3218 },
                gameMessages: [
                    { type: 0, text: 'Welcome to RuneScape', sender: '', tick: 1, observationId: 1, fromSelf: false },
                    { type: 2, text: 'meet me at the bank', sender: 'Partner', tick: 1, observationId: 1, fromSelf: false }
                ]
            }
        }));
    };
    bot.onmessage = (event) => {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'action' && msg.action?.type === 'say') {
            receivedSays.push(msg.action.message);
            if (msg.action.message.includes('noreply')) return;
            bot!.send(JSON.stringify({
                type: 'actionResult',
                actionId: msg.actionId,
                result: { success: true, message: 'Said', data: { finalText: msg.action.message } }
            }));
        }
    };
    await waitFor(async () => {
        try {
            const status: any = await (await fetch(`${BASE}/status/tbot`)).json();
            return status.status === 'active';
        } catch {
            return false;
        }
    }, 10000, 'fake bot to register');
});

afterAll(() => {
    try { bot?.close(); } catch {}
    gateway?.kill();
});

describe('gateway HTTP chat endpoints', () => {
    test('/status/:bot reports the relay cap alongside liveness', async () => {
        const status: any = await (await fetch(`${BASE}/status/tbot`)).json();
        expect(status.status).toBe('active');
        expect(status.inGame).toBe(true);
        expect(status.maxMessageLength).toBe(400);
    });

    test('GET /chat/:bot returns player chat and hides system lines by default', async () => {
        const body: any = await (await fetch(`${BASE}/chat/tbot`)).json();
        expect(body.messages.map((m: any) => m.text)).toEqual(['meet me at the bank']);
        expect(body.botStatus).toBe('active');

        const withSystem: any = await (await fetch(`${BASE}/chat/tbot?system=1`)).json();
        expect(withSystem.messages.map((m: any) => m.text)).toEqual(['Welcome to RuneScape', 'meet me at the bank']);
    });

    test('GET /chat for an unknown bot answers empty, not an error', async () => {
        const res = await fetch(`${BASE}/chat/ghost`);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.messages).toEqual([]);
        expect(body.botStatus).toBe('dead');
    });

    test('POST /say/:bot relays through the client and echoes the final text', async () => {
        const res = await fetch(`${BASE}/say/tbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'heading to the anvil now' })
        });
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.ok).toBe(true);
        expect(body.results).toHaveLength(1);
        expect(body.results[0].data.finalText).toBe('heading to the anvil now');
        expect(receivedSays).toContain('heading to the anvil now');
    });

    test('POST /say splits long messages using the relay cap', async () => {
        const before = receivedSays.length;
        const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');  // > 400 chars
        const res = await fetch(`${BASE}/say/tbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const body: any = await res.json();
        expect(body.ok).toBe(true);
        expect(body.results.length).toBeGreaterThan(1);
        const chunks = receivedSays.slice(before);
        expect(chunks.length).toBe(body.results.length);
        for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(400);
        expect(chunks.join(' ')).toBe(text);
    }, 15000);

    test('POST /say for an unconnected bot fails fast with 409', async () => {
        const start = Date.now();
        const res = await fetch(`${BASE}/say/ghost`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'anyone home?' })
        });
        expect(res.status).toBe(409);
        const body: any = await res.json();
        expect(body.error).toMatch(/not connected/i);
        expect(Date.now() - start).toBeLessThan(2000);
    });

    test('POST /say answers a failed result within its budget when the client never replies', async () => {
        const start = Date.now();
        const res = await fetch(`${BASE}/say/tbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'noreply please', timeoutMs: 2000 })
        });
        expect(res.status).toBe(502);
        const body: any = await res.json();
        expect(body.ok).toBe(false);
        expect(body.results[0].reason).toBe('timeout');
        expect(Date.now() - start).toBeLessThan(5000);
    }, 10000);

    test('GET /state/:bot returns the last frame with its age', async () => {
        const res = await fetch(`${BASE}/state/tbot`);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.state.player.name).toBe('tbot');
        expect(body.state.inGame).toBe(true);
        expect(typeof body.stateAge).toBe('number');
        expect(body.botStatus).toBe('active');
    });

    test('GET /state for an unknown bot answers 404 JSON, not a banner', async () => {
        const res = await fetch(`${BASE}/state/nobody`);
        expect(res.status).toBe(404);
        const body: any = await res.json();
        expect(body.state).toBeNull();
        expect(body.botStatus).toBe('dead');
    });

    test('POST /say rejects a missing text body without dispatching', async () => {
        const res = await fetch(`${BASE}/say/tbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        expect(res.status).toBe(400);
    });
});

describe('chat CLI over HTTP', () => {
    async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        const proc = Bun.spawn({
            cmd: ['bun', join(REPO_ROOT, 'sdk', 'chat.ts'), ...args, '--server', `localhost:${PORT}`],
            cwd: REPO_ROOT,
            stdout: 'pipe',
            stderr: 'pipe'
        });
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited
        ]);
        return { exitCode, stdout, stderr };
    }

    test('sends a message end-to-end', async () => {
        const { exitCode, stdout } = await runCli(['tbot', 'cli says hi']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('Sent: cli says hi');
        expect(receivedSays).toContain('cli says hi');
    }, 20000);

    test('reads chat end-to-end', async () => {
        const { exitCode, stdout } = await runCli(['tbot', '--limit', '50']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('Partner: meet me at the bank');
    }, 20000);

    test('reports a dead relay within the chunk budget instead of stalling', async () => {
        const start = Date.now();
        const { exitCode, stderr } = await runCli(['tbot', 'noreply again']);
        expect(exitCode).toBe(1);
        expect(stderr).toMatch(/timed out/i);
        expect(Date.now() - start).toBeLessThan(20000);
    }, 30000);
});

describe('state CLI over HTTP', () => {
    async function runStateCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        const proc = Bun.spawn({
            cmd: ['bun', join(REPO_ROOT, 'sdk', 'cli.ts'), ...args, '--server', `localhost:${PORT}`],
            cwd: REPO_ROOT,
            stdout: 'pipe',
            stderr: 'pipe'
        });
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited
        ]);
        return { exitCode, stdout, stderr };
    }

    test('dumps state end-to-end without an observer socket', async () => {
        const before = ((await (await fetch(`${BASE}/status/tbot`)).json()) as any).observers.length;
        const { exitCode, stdout } = await runStateCli(['tbot', 'state', '--json']);
        expect(exitCode).toBe(0);
        expect(JSON.parse(stdout).player.name).toBe('tbot');
        const after = ((await (await fetch(`${BASE}/status/tbot`)).json()) as any).observers.length;
        expect(after).toBe(before);
    }, 20000);

    test('explains a missing bot instead of hanging', async () => {
        const start = Date.now();
        const { exitCode, stderr } = await runStateCli(['nobody', 'state', '--timeout', '3000']);
        expect(exitCode).toBe(1);
        expect(stderr).toContain("No game state for 'nobody'");
        expect(Date.now() - start).toBeLessThan(15000);
    }, 20000);
});
