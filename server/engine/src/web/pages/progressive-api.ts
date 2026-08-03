/**
 * HTTP API to start/stop the progressive trainer against an open bot client.
 *
 * POST /api/progressive/run   { username, password, webPort? }
 * POST /api/progressive/stop  { username }
 * GET  /api/progressive/status?username=
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

function findRepoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
        if (existsSync(join(dir, 'bots/_shared/progressive-trainer.ts'))) return dir;
        if (existsSync(join(dir, 'scripts/attach-progressive.ts'))) return dir;
        dir = join(dir, '..');
    }
    // engine cwd is usually server/engine
    return join(process.cwd(), '..', '..');
}

function runAttach(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    const root = findRepoRoot();
    const script = join(root, 'scripts/attach-progressive.ts');
    return new Promise((resolve) => {
        const child = spawn('bun', [script, ...args], {
            cwd: root,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (b) => {
            stdout += String(b);
        });
        child.stderr?.on('data', (b) => {
            stderr += String(b);
        });
        child.on('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
}

export async function handleProgressiveApi(req: Request, url: URL): Promise<Response | null> {
    if (!url.pathname.startsWith('/api/progressive')) return null;

    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    try {
        if (url.pathname === '/api/progressive/status' && req.method === 'GET') {
            const username = (url.searchParams.get('username') || '').replace(/\s+/g, '');
            if (!username) return json({ ok: false, error: 'username required' }, 400);
            const result = await runAttach(['--status', `--user=${username}`]);
            try {
                return json(JSON.parse(result.stdout.trim() || '{}'));
            } catch {
                return json({ ok: false, error: result.stderr || result.stdout }, 500);
            }
        }

        if (url.pathname === '/api/progressive/run' && req.method === 'POST') {
            const body = (await req.json().catch(() => ({}))) as {
                username?: string;
                password?: string;
                webPort?: string | number;
            };
            const username = (body.username || '').trim();
            const password = body.password || '';
            if (!username || !password) {
                return json({ ok: false, error: 'username and password required' }, 400);
            }
            const webPort = String(body.webPort || process.env.WEB_PORT || '8890');
            const result = await runAttach([
                `--user=${username}`,
                `--password=${password}`,
                `--web-port=${webPort}`,
            ]);
            if (result.code !== 0) {
                return json({ ok: false, error: result.stderr || result.stdout || 'spawn failed' }, 500);
            }
            try {
                return json(JSON.parse(result.stdout.trim()));
            } catch {
                return json({ ok: true, raw: result.stdout });
            }
        }

        if (url.pathname === '/api/progressive/stop' && req.method === 'POST') {
            const body = (await req.json().catch(() => ({}))) as { username?: string };
            const username = (body.username || '').trim();
            if (!username) return json({ ok: false, error: 'username required' }, 400);
            const result = await runAttach(['--stop', `--user=${username}`]);
            try {
                return json(JSON.parse(result.stdout.trim() || '{}'));
            } catch {
                return json({ ok: result.code === 0, raw: result.stdout || result.stderr });
            }
        }

        return json({ ok: false, error: 'unknown progressive endpoint' }, 404);
    } catch (e: any) {
        return json({ ok: false, error: e?.message ?? String(e) }, 500);
    }
}

/** Tail last lines of trainer log for UI. */
export function handleProgressiveLog(url: URL): Response | null {
    if (url.pathname !== '/api/progressive/log' || url.searchParams.get('username') == null) {
        return null;
    }
    const username = (url.searchParams.get('username') || '').replace(/\s+/g, '');
    const root = findRepoRoot();
    const logPath = join(root, 'bots', username, 'trainer-run.log');
    if (!existsSync(logPath)) {
        return json({ ok: true, lines: [] });
    }
    const text = readFileSync(logPath, 'utf8');
    const lines = text.trim().split(/\r?\n/).slice(-40);
    return json({ ok: true, lines });
}
