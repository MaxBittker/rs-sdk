#!/usr/bin/env bun
/** Local integration: CLIENT=browser|lite|both bun sdk/test/character-design.ts */
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BotSDK } from '../index';
import { BotActions } from '../actions';
import { appearanceMatchesDesign, type CharacterDesign } from '../character-design';

const root = join(import.meta.dir, '..', '..');
const password = process.env.BOT_PASSWORD ?? 'test';
const host = process.env.DESIGN_TEST_HOST ?? 'localhost:8888';
const gatewayUrl = process.env.GATEWAY_URL ?? 'ws://localhost:7780';
type Kind = 'browser' | 'lite';
type Session = { sdk: BotSDK; bot: BotActions; cleanup(): Promise<void> };

async function open(kind: Kind, name: string): Promise<Session> {
    if (kind === 'browser') {
        const { launchBotWithSDK } = await import('./utils/browser');
        return launchBotWithSDK(name, { skipTutorial: false, usePuppeteer: true, headless: true, exitOnCleanup: false });
    }
    const runner = Bun.spawn([process.execPath, 'src/lite/runner.ts', name], {
        cwd: join(root, 'server/webclient'),
        env: { ...process.env, GATEWAY_URL: gatewayUrl },
        stdout: 'pipe', stderr: 'pipe'
    });
    const ready = Promise.withResolvers<void>();
    let output = '';
    const drain = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            output = (output + decoder.decode(value)).slice(-12_000);
            if (output.includes('Gateway connected, registering')) ready.resolve();
        }
    };
    const streams = Promise.all([drain(runner.stdout), drain(runner.stderr)]);
    void runner.exited.then(code => ready.reject(new Error('Lite runner exited ' + code + ': ' + output)));
    const timer = setTimeout(() => ready.reject(new Error('Lite runner startup timeout: ' + output)), 60_000);
    const sdk = new BotSDK({ botUsername: name, password, gatewayUrl, autoLaunchBrowser: false, autoReconnect: false });
    const cleanup = async () => {
        clearTimeout(timer);
        await sdk.disconnect();
        runner.kill('SIGINT');
        await runner.exited;
        await streams;
    };
    try {
        await ready.promise;
        clearTimeout(timer);
        await sdk.connect();
        await sdk.waitForReady(30_000);
        return { sdk, bot: new BotActions(sdk), cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    }
}

async function scenario(kind: Kind, mode: 'custom' | 'default' | 'random'): Promise<void> {
    const name = 'ad' + crypto.randomUUID().replaceAll('-', '').slice(0, 9);
    const folder = join(root, 'bots', name);
    await mkdir(folder);
    await writeFile(join(folder, 'bot.env'), 'BOT_USERNAME=' + name + '\nPASSWORD=' + password + '\nSERVER=' + host + '\nGATEWAY_URL=' + gatewayUrl + '\n');
    let session: Session | undefined;
    try {
        console.log(kind + ': ' + mode + ' appearance (' + name + ')');
        session = await open(kind, name);
        await session.sdk.waitForCondition(s => !!s.characterDesign, 30_000);
        let expected = structuredClone(session.sdk.getCharacterDesign()!.current);
        if (mode === 'custom') {
            const { options } = session.sdk.getCharacterDesign()!;
            const hair = options.body.female.hair.at(-1)!;
            const edit = await session.sdk.sendSetCharacterDesign({ gender: false, body: { hair } });
            assert(edit.success, edit.message);
            const accepted = await session.bot.acceptCharacterDesign({
                colors: { hair: options.colors.hair.at(-1)!, torso: options.colors.torso.at(-1)!, skin: options.colors.skin.at(-1)! }
            }, 15_000);
            assert(accepted.success, accepted.message);
            expected = accepted.data.design as CharacterDesign;
            assert.equal(expected.body.hair, hair, 'a colour edit must preserve selected hair');
            assert(appearanceMatchesDesign(session.sdk.getState()?.player?.appearance, expected));
            await session.cleanup();
            session = undefined;
            // A new client session must observe the server's accepted design.
            session = await open(kind, name);
            await session.sdk.waitForCondition(s => appearanceMatchesDesign(s.player?.appearance, expected), 15_000);
            assert.equal(session.sdk.getCharacterDesign(), null, 'confirmed design must stay closed after reconnect');
        }
        const unsubscribe = session.sdk.onStateUpdate(s => {
            if (s.characterDesign) expected = structuredClone(s.characterDesign.current);
        });
        try {
            const result = await session.bot.skipTutorial(mode === 'default' ? { randomizeAppearance: false } : mode === 'random' ? { gender: false } : {});
            assert(result.success, result.message);
            await session.sdk.waitForCondition(s => !!s.player && s.player.worldX >= 3200 && s.player.worldX < 3300, 15_000);
            assert(appearanceMatchesDesign(session.sdk.getState()?.player?.appearance, expected), 'tutorial exit must preserve the confirmed design');
            if (mode === 'random') assert.equal(expected.gender, false);
            console.log('PASS ' + kind + ': ' + mode + (mode === 'custom' ? ' (including reconnect persistence)' : ''));
        } finally { unsubscribe(); }
    } finally {
        await session?.cleanup();
        await rm(folder, { recursive: true, force: true });
    }
}

async function main() {
    if (!/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(host)) {
        throw new Error('Character design integration uses disposable accounts on a local test server only');
    }
    const client = process.env.CLIENT ?? 'both';
    if (!['both', 'browser', 'lite'].includes(client)) throw new Error('CLIENT must be browser, lite, or both');
    for (const kind of (client === 'both' ? ['browser', 'lite'] : [client]) as Kind[]) {
        for (const mode of ['custom', 'default', 'random'] as const) await scenario(kind, mode);
    }
}

if (import.meta.main) {
    main().catch(error => { console.error(error); process.exitCode = 1; });
}
