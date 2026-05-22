import { spawn } from 'child_process';
import http, { type IncomingMessage, type ServerResponse } from 'http';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';

import ejs from 'ejs';
import { register } from 'prom-client';

import Environment from '#/util/Environment.js';
import { createDefaultWorldConfig, loadWorldConfig, normalizeWorldConfig, saveWorldConfig } from '#/util/WorldConfig.js';
import { printInfo } from '#/util/Logger.js';
import kleur from 'kleur';

function jsonResponse(value: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(value, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

function getProcessMemorySnapshot() {
    const usage = process.memoryUsage();

    return {
        timestamp: Date.now(),
        runtime: {
            pid: process.pid,
            platform: process.platform,
            bun: process.versions.bun ?? null,
            node: process.versions.node ?? null
        },
        memory: {
            rss: usage.rss,
            heapTotal: usage.heapTotal,
            heapUsed: usage.heapUsed,
            external: usage.external,
            arrayBuffers: usage.arrayBuffers
        }
    };
}

function tailLines(value: string, count: number): string {
    const lines = value.trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - count)).join('\n');
}

async function runProcess(command: string, args: string[]): Promise<{ code: number; output: string }> {
    return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';

        child.stdout.on('data', data => {
            output += data.toString();
        });

        child.stderr.on('data', data => {
            output += data.toString();
        });

        child.on('error', reject);
        child.on('close', code => resolve({ code: code ?? -1, output }));
    });
}

async function runSetupMigration(backend: string): Promise<void> {
    const script = backend === 'sqlite' ? 'sqlite:migrate' : 'db:migrate';
    const command = Environment.runtime.isBun ? 'bun' : process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = ['run', script];

    printInfo(`Running ${script}...`);
    const result = await runProcess(command, args);

    if (result.code !== 0) {
        const tail = tailLines(result.output, 40);
        throw new Error(`Migration failed (${command} ${args.join(' ')}).\n${tail || 'No output.'}`);
    }

    printInfo('Database ready!');
}

async function handleManagementRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/setup') {
        return new Response(await ejs.renderFile('view/setup.ejs'), {
            headers: {
                'Content-Type': 'text/html'
            }
        });
    }

    if (url.pathname === '/setup/config') {
        if (method === 'GET') {
            return jsonResponse({
                config: loadWorldConfig(),
                defaults: createDefaultWorldConfig(),
                path: 'data/config/world.json'
            });
        }

        if (method === 'PUT') {
            let payload: unknown;
            try {
                payload = await req.json();
            } catch {
                return jsonResponse({ error: 'Invalid JSON payload' }, 400);
            }

            const config = normalizeWorldConfig(payload);
            saveWorldConfig(config);

            const hasSupportServer = config.login.enabled || config.friend.enabled || config.logger.enabled;
            const shouldRunMigration = hasSupportServer && config.db.host.trim().toLowerCase() === 'localhost';
            if (shouldRunMigration) {
                try {
                    await runSetupMigration(config.db.backend);
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Migration failed after saving configuration.';
                    return jsonResponse(
                        {
                            error: message,
                            config,
                            restartRequired: true
                        },
                        500
                    );
                }
            }

            return jsonResponse({
                config,
                restartRequired: true
            });
        }

        return new Response(null, {
            status: 405,
            headers: {
                Allow: 'GET, PUT'
            }
        });
    }

    if (url.pathname === '/prometheus') {
        return new Response(await register.metrics(), {
            headers: {
                'Content-Type': register.contentType
            }
        });
    }

    if (url.pathname === '/memory') {
        return jsonResponse(getProcessMemorySnapshot());
    }

    return new Response(null, { status: 404 });
}

function createNodeRequest(req: IncomingMessage, fallbackPort: number): Request {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${fallbackPort}`}`);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'undefined') {
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(key, item);
            }
        } else {
            headers.set(key, value);
        }
    }

    if (method === 'GET' || method === 'HEAD') {
        return new Request(url, { method, headers });
    }

    return new Request(url, {
        method,
        headers,
        body: Readable.toWeb(req) as ReadableStream,
        duplex: 'half'
    });
}

async function writeNodeResponse(res: ServerResponse, response: Response): Promise<void> {
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });

    if (!response.body) {
        res.end();
        return;
    }

    await new Promise<void>((resolve, reject) => {
        Readable.fromWeb(response.body as unknown as NodeReadableStream).pipe(res);
        res.on('finish', resolve);
        res.on('error', reject);
    });
}

async function startNodeManagementWeb(): Promise<void> {
    const server = http.createServer(async (req, res) => {
        try {
            const response = await handleManagementRequest(createNodeRequest(req, Environment.web.managementPort));
            await writeNodeResponse(res, response);
        } catch (err) {
            console.error(err);
            res.statusCode = 500;
            res.end();
        }
    });

    await new Promise<void>(resolve => {
        server.listen(Environment.web.managementPort, '0.0.0.0', () => resolve());
    });
}

async function startBunManagementWeb(): Promise<void> {
    Bun.serve({
        port: Environment.web.managementPort,
        fetch(req) {
            return handleManagementRequest(req);
        }
    });
}

function tryOpenBrowser(url: string): void {
    let openCmd = 'xdg-open';
    if (process.platform === 'darwin') {
        openCmd = 'open';
    } else if (process.platform === 'win32') {
        openCmd = 'start';
    }

    const command = process.platform === 'win32' ? `cmd /c ${openCmd} "" "${url}"` : `${openCmd} "${url}"`;

    try {
        const child = spawn(command, {
            detached: true,
            shell: true,
            stdio: 'ignore'
        });
        child.on('error', () => {
            printInfo(`Unable to open browser automatically. Open this URL manually: ${url}`);
        });
        child.unref();
    } catch {
        printInfo(`Unable to open browser automatically. Open this URL manually: ${url}`);
    }
}

if (Environment.runtime.isBun) {
    await startBunManagementWeb();
} else {
    await startNodeManagementWeb();
}

const setupUrl = `http://localhost:${Environment.web.managementPort}/setup`;
tryOpenBrowser(setupUrl);

console.log(kleur.green().bold('Continue setup') + kleur.white().bold(`: Visit ${setupUrl}`));
