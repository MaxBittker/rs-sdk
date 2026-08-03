#!/usr/bin/env bun
/**
 * Attach the progressive trainer to an already-open bot client session.
 *
 * Usage:
 *   bun scripts/attach-progressive.ts --user=Name --password=secret [--web-port=8890] [--quests]
 *   bun scripts/attach-progressive.ts --stop --user=Name
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

function arg(name: string, fallback = ''): string {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    if (hit) return hit.slice(prefix.length);
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
    return fallback;
}

function flag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

function sanitizeUser(raw: string): string {
    const u = raw.trim();
    if (!u || u.length > 12 || !/^[a-zA-Z0-9 ]+$/.test(u)) {
        throw new Error('Username must be 1-12 alphanumeric chars (spaces ok)');
    }
    // Folder name: collapse spaces
    return u.replace(/\s+/g, '');
}

function botPaths(username: string) {
    const dir = join(ROOT, 'bots', username);
    return {
        dir,
        script: join(dir, 'script.ts'),
        env: join(dir, 'bot.env'),
        pid: join(dir, 'trainer.pid'),
        log: join(dir, 'trainer-run.log'),
    };
}

function stopTrainer(username: string): boolean {
    const { pid } = botPaths(username);
    if (!existsSync(pid)) return false;
    const raw = readFileSync(pid, 'utf8').trim();
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
        try {
            process.kill(n, 'SIGTERM');
        } catch {
            // already dead
        }
        try {
            process.kill(n, 'SIGKILL');
        } catch {
            // ignore
        }
    }
    try {
        unlinkSync(pid);
    } catch {
        // ignore
    }
    return true;
}

function ensureBotFiles(
    username: string,
    password: string,
    webPort: string,
    autoQuests: boolean,
): void {
    const paths = botPaths(username);
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(
        paths.script,
        `#!/usr/bin/env bun\nimport '../_shared/progressive-trainer';\n`,
    );
    const envLines = [
        `BOT_USERNAME=${username}`,
        `PASSWORD=${password}`,
        'SERVER=localhost',
        `WEB_PORT=${webPort}`,
        'SHOW_CHAT=false',
        'TELEMETRY=false',
        'TRAINER_MAX_SECONDS=0',
    ];
    if (autoQuests) {
        envLines.push('TRAINER_AUTO_QUESTS=1');
    }
    envLines.push('');
    writeFileSync(paths.env, envLines.join('\n'));
}

function startTrainer(
    username: string,
    password: string,
    webPort: string,
    autoQuests: boolean,
): number {
    stopTrainer(username);
    ensureBotFiles(username, password, webPort, autoQuests);
    // Compile wiki knowledge (fast if already fresh)
    spawn('bun', ['scripts/wiki-index.ts'], { cwd: ROOT, stdio: 'ignore' }).unref?.();
    spawn('bun', ['scripts/wiki-world.ts'], { cwd: ROOT, stdio: 'ignore' }).unref?.();

    const paths = botPaths(username);
    // Truncate log
    writeFileSync(paths.log, `==== attach ${new Date().toISOString()} user=${username} ====\n`);

    const child = spawn('bun', [paths.script], {
        cwd: ROOT,
        env: {
            ...process.env,
            BOT_DIR: paths.dir,
            WEB_PORT: webPort,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
    });

    const append = (buf: Buffer) => {
        try {
            writeFileSync(paths.log, buf, { flag: 'a' });
        } catch {
            // ignore
        }
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.unref();

    if (!child.pid) throw new Error('Failed to spawn trainer');
    writeFileSync(paths.pid, String(child.pid));
    return child.pid;
}

function status(username: string): { running: boolean; pid: number | null } {
    const { pid } = botPaths(username);
    if (!existsSync(pid)) return { running: false, pid: null };
    const n = Number(readFileSync(pid, 'utf8').trim());
    if (!Number.isFinite(n) || n <= 0) return { running: false, pid: null };
    try {
        process.kill(n, 0);
        return { running: true, pid: n };
    } catch {
        return { running: false, pid: null };
    }
}

async function main(): Promise<void> {
    const userRaw = arg('user') || arg('username');
    if (!userRaw) {
        console.error('Missing --user=');
        process.exit(1);
    }
    const username = sanitizeUser(userRaw);

    if (flag('stop')) {
        const stopped = stopTrainer(username);
        console.log(JSON.stringify({ ok: true, stopped, username }));
        return;
    }
    if (flag('status')) {
        console.log(JSON.stringify({ ok: true, username, ...status(username) }));
        return;
    }

    const password = arg('password');
    if (!password) {
        console.error('Missing --password=');
        process.exit(1);
    }
    const webPort = arg('web-port', process.env.WEB_PORT || '8890');
    const autoQuests = flag('quests') || process.env.TRAINER_AUTO_QUESTS === '1';
    const pid = startTrainer(username, password, webPort, autoQuests);
    console.log(JSON.stringify({ ok: true, username, pid, webPort, autoQuests }));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
