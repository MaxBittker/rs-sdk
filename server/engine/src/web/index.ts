import { register } from 'prom-client';
import Environment from '#/util/Environment.js';
import World from '#/engine/World.js';
import { handleClientPage, handleCacheEndpoints } from './pages/client.js';
import { handleHiscoresPage, handleHiscoresPlayerPage, handleHiscoresOutfitPage, handleHiscoresBankPage, handleHiscoresKothPage } from './pages/hiscores.js';
import { handleViewerAssets } from './hiscoresServer.js';
import { handleScreenshotsListPage, handleScreenshotFilePage } from './pages/screenshots.js';
import { handleScreenshotUpload, handleExportCollisionApi } from './pages/api.js';
import { handleBugReport } from './pages/bug-report.js';
import { handleDisclaimerPage, handleMapviewPage, handlePublicFiles } from './pages/static.js';
import { WebSocketData, handleWebSocketUpgrade, handleGatewayEndpointGet, websocketHandlers } from './websocket.js';
import { getIp } from './utils.js';

export type { WebSocketData };

export type WebSocketRoutes = {
    '/': Response
};

// rs-sdk: per-route request accounting so /tickstats (management port) can show what the
// public web server is being asked to do, and slow handlers get logged with the client IP.
// Everything here runs on the tick thread, so a slow HTTP handler is a stalled world.
type RouteStat = { count: number; totalMs: number; maxMs: number };
let webWindowStart = Date.now();
let webWindow: Map<string, RouteStat> = new Map();
let webLastWindow: { start: number; end: number; routes: Record<string, RouteStat> } | null = null;
const WEB_WINDOW_MS = 60_000;
const WEB_SLOW_MS = Number(process.env.WEB_SLOW_MS ?? 100);

function routeKey(url: URL): string {
    // collapse ids/usernames so keys stay bounded: keep the first two path segments
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'status' && parts.length > 1) parts[1] = ':bot';
    let key = '/' + parts.slice(0, 2).join('/');
    if (parts.length > 2) key += '/*';
    if (url.searchParams.size > 0) key += '?' + [...url.searchParams.keys()].slice(0, 3).sort().join('&');
    return key;
}

function recordRequest(url: URL, req: Request, ms: number) {
    const now = Date.now();
    if (now - webWindowStart >= WEB_WINDOW_MS) {
        webLastWindow = { start: webWindowStart, end: now, routes: Object.fromEntries(webWindow) };
        webWindow = new Map();
        webWindowStart = now;
    }
    const key = routeKey(url);
    const stat = webWindow.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
    stat.count++;
    stat.totalMs += ms;
    if (ms > stat.maxMs) stat.maxMs = ms;
    webWindow.set(key, stat);
    if (ms >= WEB_SLOW_MS) {
        console.warn(`[web] slow ${req.method} ${url.pathname}${url.search} ${ms}ms ip=${getIp(req) ?? req.headers.get('fly-client-ip') ?? '?'}`);
    }
}

export function getWebStats() {
    return {
        current: { start: webWindowStart, end: Date.now(), routes: Object.fromEntries(webWindow) },
        last: webLastWindow
    };
}

export async function startWeb() {
    Bun.serve<WebSocketData, WebSocketRoutes>({
        port: Environment.WEB_PORT,
        async fetch(req, server) {
            const url = new URL(req.url ?? '', `http://${req.headers.get('host')}`);
            const start = Date.now();
            try {
                return await handleRequest(req, server, url);
            } finally {
                recordRequest(url, req, Date.now() - start);
            }
        },
        websocket: websocketHandlers
    });
}

async function handleRequest(req: Request, server: Bun.Server, url: URL): Promise<Response | undefined> {
            // Handle WebSocket upgrades first
            const wsResponse = handleWebSocketUpgrade(req, server, url);
            if (wsResponse !== undefined) {
                return wsResponse;
            }

            // Gateway endpoint GET request
            const gatewayResponse = handleGatewayEndpointGet(url);
            if (gatewayResponse) return gatewayResponse;

            // SDK bug report index (GET) / submission (POST), no auth
            const bugReportResponse = await handleBugReport(req, url);
            if (bugReportResponse) return bugReportResponse;

            // Engine status endpoint
            if (url.pathname === '/engine-status' || url.pathname === '/engine-status/') {
                return new Response(JSON.stringify({
                    status: 'running',
                    server: 'rs-agent-engine',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0'
                }, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            // Player count endpoint
            if (url.pathname === '/playercount' || url.pathname === '/playercount/') {
                return new Response(JSON.stringify({
                    count: World.getTotalPlayers()
                }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            // Player positions endpoint
            if (url.pathname === '/playerpositions' || url.pathname === '/playerpositions/') {
                const players: {x: number, z: number, level: number, name: string}[] = [];
                for (const player of World.playerLoop.all()) {
                    players.push({ x: player.x, z: player.z, level: player.level, name: player.displayName });
                }
                return new Response(JSON.stringify(players), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            // Anonymous long-term movement traces for the map history mode (proxied from
            // the logger worker, which owns the telemetry DB work; payload is pre-gzipped)
            if (url.pathname === '/playertraces' || url.pathname === '/playertraces/') {
                try {
                    const hours = url.searchParams.get('hours') ?? '24';
                    const upstream = await fetch(`http://${Environment.logger.host}:${Environment.logger.port + 1}/traces?hours=${encodeURIComponent(hours)}`);
                    if (!upstream.ok) {
                        throw new Error(`traces upstream ${upstream.status}`);
                    }
                    return new Response(await upstream.arrayBuffer(), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Encoding': 'gzip',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                } catch (_err) {
                    return new Response(JSON.stringify({ error: 'traces unavailable' }), {
                        status: 503,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
            }

            // Gateway status endpoint (proxy all bot statuses)
            if (url.pathname === '/status' || url.pathname === '/status/') {
                try {
                    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:7780';
                    const response = await fetch(`${gatewayUrl}/status`);
                    const data = await response.json();
                    return new Response(JSON.stringify(data, null, 2), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                } catch (error) {
                    return new Response(JSON.stringify({
                        error: 'Failed to fetch gateway status',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }, null, 2), {
                        status: 503,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
            }

            // Bot status endpoint (proxy to gateway)
            const botStatusMatch = url.pathname.match(/^\/status\/([^/]+)\/?$/);
            if (botStatusMatch) {
                const username = botStatusMatch[1];
                try {
                    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:7780';
                    const response = await fetch(`${gatewayUrl}/status/${username}`);
                    const data = await response.json();
                    return new Response(JSON.stringify(data, null, 2), {
                        status: response.status,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                } catch (error) {
                    return new Response(JSON.stringify({
                        error: 'Failed to fetch bot status from gateway',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }, null, 2), {
                        status: 503,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
            }

            // Client pages (/, /bot, /rs2.cgi)
            const clientResponse = await handleClientPage(url);
            if (clientResponse) return clientResponse;

            // Cache endpoints
            const cacheResponse = handleCacheEndpoints(url);
            if (cacheResponse) return cacheResponse;

            // Disclaimer page
            const disclaimerResponse = handleDisclaimerPage(url);
            if (disclaimerResponse) return disclaimerResponse;

            // Map viewer page
            const mapviewResponse = handleMapviewPage(url);
            if (mapviewResponse) return mapviewResponse;

            // API endpoints
            const screenshotUploadResponse = await handleScreenshotUpload(req, url);
            if (screenshotUploadResponse) return screenshotUploadResponse;

            const exportCollisionResponse = handleExportCollisionApi(req, url);
            if (exportCollisionResponse) return exportCollisionResponse;

            // Hiscores
            const hiscoresResponse = await handleHiscoresPage(url);
            if (hiscoresResponse) return hiscoresResponse;

            const hiscoresPlayerResponse = await handleHiscoresPlayerPage(url);
            if (hiscoresPlayerResponse) return hiscoresPlayerResponse;

            const hiscoresOutfitResponse = await handleHiscoresOutfitPage(url);
            if (hiscoresOutfitResponse) return hiscoresOutfitResponse;

            const hiscoresBankResponse = await handleHiscoresBankPage(url);
            if (hiscoresBankResponse) return hiscoresBankResponse;

            const hiscoresKothResponse = await handleHiscoresKothPage(url);
            if (hiscoresKothResponse) return hiscoresKothResponse;

            // Viewer assets (cache data, JS, WASM for item icon rendering)
            const viewerResponse = handleViewerAssets(url);
            if (viewerResponse) return viewerResponse;

            // Screenshots
            const screenshotsListResponse = handleScreenshotsListPage(url);
            if (screenshotsListResponse) return screenshotsListResponse;

            const screenshotFileResponse = handleScreenshotFilePage(url);
            if (screenshotFileResponse) return screenshotFileResponse;

            // Public static files
            const publicFilesResponse = handlePublicFiles(url);
            if (publicFilesResponse) return publicFilesResponse;

            // 404
            return new Response(null, { status: 404 });
}

// Internal-only diagnostics (management port is not exposed by fly). Reach it with
// `fly proxy 8898:8898` or `fly ssh console -C "bun -e 'fetch(\"http://localhost:8898/tickstats\").then(r=>r.text()).then(console.log)'"`.
let profileRunning = false;

export async function startManagementWeb() {
    Bun.serve({
        port: Environment.WEB_MANAGEMENT_PORT,
        routes: {
            // computed per request (a static Response here froze the metrics at startup)
            '/prometheus': async () => new Response(await register.metrics(), {
                headers: {
                    'Content-Type': register.contentType
                }
            }),
            // rolling per-phase cycle timings over the last ~300 ticks
            '/tickstats': () => Response.json({ ...World.getTickStats(), web: getWebStats() }),
            // sample the main thread with JSC's sampling profiler for ?ms= (default 3000, max 15000)
            // at ?interval= microseconds (default 250). Covers everything on the event loop:
            // world cycles, websocket I/O callbacks, timers.
            '/profile': async (req: Request) => {
                if (profileRunning) {
                    return new Response('profile already running', { status: 409 });
                }
                const url = new URL(req.url);
                const ms = Math.min(15000, Math.max(100, parseInt(url.searchParams.get('ms') ?? '3000') || 3000));
                const interval = Math.min(5000, Math.max(50, parseInt(url.searchParams.get('interval') ?? '250') || 250));
                const stacks = Math.max(0, parseInt(url.searchParams.get('stacks') ?? '40') || 40);
                profileRunning = true;
                try {
                    const { profile } = await import('bun:jsc');
                    const before = World.getTickStats();
                    const result = await profile(() => Bun.sleep(ms), interval);
                    const after = World.getTickStats();
                    // stackTraces is really { interval, traces: [{ frames: [{ name, sourceURL?, line, category }] }] };
                    // fold into inclusive sample counts per frame (each frame counted once per trace) and
                    // the hottest leaf->caller pairs, which is what actually points at the slow code path.
                    type Frame = { name: string; sourceURL?: string; line: number; category: string };
                    const traces: { frames: Frame[] }[] = (result.stackTraces as unknown as { traces?: { frames: Frame[] }[] })?.traces ?? [];
                    const label = (f: Frame) => `${f.name || '(anon)'} ${f.sourceURL ? f.sourceURL.replace(/^.*\/src\//, 'src/') + ':' + f.line : f.category}`;
                    const inclusive = new Map<string, number>();
                    const leafPairs = new Map<string, number>();
                    for (const t of traces) {
                        const seen = new Set<string>();
                        for (const f of t.frames) {
                            const k = label(f);
                            if (!seen.has(k)) {
                                seen.add(k);
                                inclusive.set(k, (inclusive.get(k) ?? 0) + 1);
                            }
                        }
                        // frames[0] is the leaf; walk up to the first frame with a source file
                        const leaf = t.frames[0];
                        const caller = t.frames.find((f, i) => i > 0 && f.sourceURL);
                        if (leaf) {
                            const k = `${label(leaf)}  <-  ${caller ? label(caller) : '?'}`;
                            leafPairs.set(k, (leafPairs.get(k) ?? 0) + 1);
                        }
                    }
                    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, stacks).map(([k, v]) => `${String(v).padStart(6)}  ${(100 * v / Math.max(1, traces.length)).toFixed(1).padStart(5)}%  ${k}`);
                    const text = [
                        `# profile ${ms}ms @ ${interval}us, ${traces.length} samples (~${(traces.length * interval / 1000 / ms * 100).toFixed(0)}% of wall busy in JS), ticks ${before.tick}..${after.tick}, players ${after.players}`,
                        '',
                        `# inclusive samples per frame (top ${stacks})`,
                        ...top(inclusive),
                        '',
                        `# hottest leaf <- nearest source caller (top ${stacks})`,
                        ...top(leafPairs),
                        '',
                        result.functions,
                        '',
                        result.bytecodes
                    ].join('\n');
                    return new Response(text, { headers: { 'Content-Type': 'text/plain' } });
                } catch (err) {
                    return new Response(`profile failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`, { status: 500 });
                } finally {
                    profileRunning = false;
                }
            }
        },
        fetch() {
            return new Response(null, { status: 404 });
        },
    });
}
