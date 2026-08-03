#!/usr/bin/env bun
/**
 * One-command progressive bot runner.
 *
 * 1. Compiles wiki/ → trainer JSON knowledge
 * 2. Ensures bots/progressive exists (local gateway)
 * 3. Starts local engine + gateway + webclient if needed
 * 4. Runs the progressive trainer
 *
 * Usage:
 *   bun run progressive
 *   bun run progressive -- --max-seconds=120
 *   bun run progressive -- --demo          # connect to rs-sdk-demo instead
 *   bun run progressive -- --no-stack      # skip starting local server processes
 */
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const ENGINE_DIR = join(ROOT, 'server', 'engine');
const WEBCLIENT_DIR = join(ROOT, 'server', 'webclient');
const GATEWAY_DIR = join(ROOT, 'server', 'gateway');
const BOT_DIR = join(ROOT, 'bots', 'progressive');
const ENGINE_URL = 'http://localhost:8890/rs2.cgi';
const GATEWAY_URL = 'http://localhost:7780/status';

type Args = {
    maxSeconds: number;
    demo: boolean;
    noStack: boolean;
};

function parseArgs(argv: string[]): Args {
    const out: Args = { maxSeconds: 0, demo: false, noStack: false };
    for (const arg of argv) {
        if (arg === '--demo') out.demo = true;
        else if (arg === '--no-stack') out.noStack = true;
        else if (arg.startsWith('--max-seconds=')) out.maxSeconds = Number(arg.split('=')[1] || '0');
        else if (arg === '--max-seconds') {
            /* handled next */
        }
    }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--max-seconds' && argv[i + 1]) out.maxSeconds = Number(argv[++i]);
    }
    return out;
}

function log(msg: string): void {
    console.log(`[progressive] ${msg}`);
}

async function httpReady(url: string, timeoutMs = 1200): Promise<boolean> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(t);
    }
}

async function waitForHttp(url: string, label: string, timeoutMs = 180_000): Promise<void> {
    const start = Date.now();
    let n = 0;
    while (Date.now() - start < timeoutMs) {
        n += 1;
        if (await httpReady(url)) {
            log(`${label} ready`);
            return;
        }
        if (n === 1 || n % 10 === 0) log(`waiting for ${label}… (${n})`);
        await Bun.sleep(1000);
    }
    throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function run(cmd: string, args: string[], cwd = ROOT): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: process.env });
        child.on('error', reject);
        child.on('exit', (code) => resolve(code ?? 1));
    });
}

const children: ChildProcess[] = [];

function spawnBg(name: string, cmd: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}): void {
    log(`start ${name}`);
    const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    const prefix = `[${name}]`;
    child.stdout?.on('data', (buf) => {
        for (const line of String(buf).split('\n').filter(Boolean)) console.log(`${prefix} ${line}`);
    });
    child.stderr?.on('data', (buf) => {
        for (const line of String(buf).split('\n').filter(Boolean)) console.log(`${prefix} ${line}`);
    });
    child.on('exit', (code, signal) => {
        log(`${name} exited code=${code} signal=${signal}`);
    });
}

function shutdown(): void {
    for (const child of children) {
        try {
            child.kill('SIGTERM');
        } catch {
            // ignore
        }
    }
}

function ensureBotEnv(demo: boolean): void {
    mkdirSync(BOT_DIR, { recursive: true });
    const envPath = join(BOT_DIR, 'bot.env');
    const scriptPath = join(BOT_DIR, 'script.ts');
    if (!existsSync(scriptPath)) {
        writeFileSync(
            scriptPath,
            `#!/usr/bin/env bun\nimport '../_shared/progressive-trainer';\n`,
        );
    }
    const server = demo ? 'rs-sdk-demo.fly.dev' : 'localhost';
    const body = `BOT_USERNAME=progressive
PASSWORD=ProgLocal123!
SERVER=${server}
WEB_PORT=8890
SHOW_CHAT=false
TELEMETRY=false
TRAINER_MAX_SECONDS=${process.env.TRAINER_MAX_SECONDS ?? '0'}
`;
    // Always refresh server/web port so local vs demo switches cleanly.
    writeFileSync(envPath, body);
    log(`wrote ${envPath} (SERVER=${server}, WEB_PORT=8890)`);
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    process.chdir(ROOT);

    log('compiling wiki knowledge…');
    let code = await run('bun', ['scripts/wiki-index.ts']);
    if (code !== 0) throw new Error('wiki-index failed');
    code = await run('bun', ['scripts/wiki-world.ts']);
    if (code !== 0) throw new Error('wiki-world failed');

    ensureBotEnv(args.demo);
    if (args.maxSeconds > 0) {
        process.env.TRAINER_MAX_SECONDS = String(args.maxSeconds);
        // Persist into bot.env for runner
        const envPath = join(BOT_DIR, 'bot.env');
        let env = readFileSync(envPath, 'utf8');
        if (/TRAINER_MAX_SECONDS=/.test(env)) {
            env = env.replace(/TRAINER_MAX_SECONDS=.*/g, `TRAINER_MAX_SECONDS=${args.maxSeconds}`);
        } else {
            env += `\nTRAINER_MAX_SECONDS=${args.maxSeconds}\n`;
        }
        writeFileSync(envPath, env);
    }

    let startedStack = false;
    if (!args.demo && !args.noStack) {
        const engineUp = await httpReady(ENGINE_URL);
        const gatewayUp = await httpReady(GATEWAY_URL);

        if (!engineUp) {
            // Ensure engine deps once
            if (!existsSync(join(ENGINE_DIR, 'node_modules'))) {
                log('installing engine deps…');
                await run('bun', ['install'], ENGINE_DIR);
            }
            spawnBg('engine', 'bun', ['run', 'start'], ENGINE_DIR, {
                WEB_PORT: '8890',
                NODE_TICKRATE: process.env.NODE_TICKRATE || '200',
            });
            startedStack = true;
        } else {
            log('engine already up');
        }

        if (!gatewayUp) {
            if (!existsSync(join(GATEWAY_DIR, 'node_modules'))) {
                log('installing gateway deps…');
                await run('bun', ['install'], GATEWAY_DIR);
            }
            spawnBg('gateway', 'bun', ['run', 'gateway'], GATEWAY_DIR);
            startedStack = true;
        } else {
            log('gateway already up');
        }

        if (!existsSync(join(WEBCLIENT_DIR, 'node_modules'))) {
            log('installing webclient deps…');
            await run('bun', ['install'], WEBCLIENT_DIR);
        }
        // Avoid duplicate watchers if one already serves assets via engine.
        spawnBg('webclient', 'bun', ['run', 'watch'], WEBCLIENT_DIR);
        startedStack = true;

        await waitForHttp(ENGINE_URL, 'engine');
        await waitForHttp(GATEWAY_URL, 'gateway');
    }

    process.on('SIGINT', () => {
        shutdown();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        shutdown();
        process.exit(0);
    });

    log('starting progressive trainer…');
    process.env.BOT_DIR = BOT_DIR;
    code = await run('bun', [join(BOT_DIR, 'script.ts')]);

    if (startedStack) {
        log('trainer exited — leaving stack running (engine/gateway/webclient)');
        log('stop manually if desired, or re-run this script (it reuses an up stack)');
    }
    process.exit(code);
}

main().catch((err) => {
    console.error(err);
    shutdown();
    process.exit(1);
});
