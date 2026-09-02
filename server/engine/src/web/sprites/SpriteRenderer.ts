// Server-side sprite rendering for the hiscores pages.
//
// Pages used to embed <canvas> tags plus a module script that pulled the whole model cache
// (config/textures/versionlist + a 7MB ondemand.zip, no cache headers) into every browser
// and unpacked it all before drawing a dozen sprites. Now the page emits <img> tags that
// point at /sprite/... URLs; the sprite is rendered once in a worker thread (SpriteWorker.ts),
// PNG-encoded, kept in an in-memory LRU, and served with long cache headers.
//
// URL formats (all parameters are part of the path so the PNG is cacheable by URL):
//   /sprite/player/{w}x{h}/{gender}/{c0.c1.c2.c3.c4}/{s0.s1.….s11}.png
//   /sprite/item/{itemId}.png            /sprite/item/{itemId}-{count}.png
import { Worker } from 'worker_threads';

import type { PlayerAppearance, SpriteJob, SpriteRequest, SpriteResponse } from '#/web/sprites/SpriteProtocol.js';

const CACHE_MAX_ENTRIES = Number(process.env.SPRITE_CACHE_MAX ?? 5000);
const RENDER_TIMEOUT_MS = 15_000;
const MAX_DIMENSION = 256;
const MAX_PENDING = 512;

// ---- worker client --------------------------------------------------------------------------
// ok=false means the worker never answered (timeout, crash, backpressure) — don't cache that
type RenderResult = { png: Uint8Array | null; ok: boolean };
type Pending = { resolve: (result: RenderResult) => void; timer: ReturnType<typeof setTimeout> };

let worker: Worker | null = null;
let restarting: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function settle(id: number, result: RenderResult): void {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(result);
}

function failAll(reason: string): void {
    if (pending.size > 0) {
        console.error(`[sprites] failing ${pending.size} pending render(s): ${reason}`);
    }
    for (const id of [...pending.keys()]) {
        settle(id, { png: null, ok: false });
    }
}

function getWorker(): Worker | null {
    if (worker) return worker;
    if (restarting) return null;

    const w = new Worker(new URL('./SpriteWorker.ts', import.meta.url));
    worker = w;
    w.on('message', (res: SpriteResponse) => {
        if (res.error) {
            console.error(`[sprites] render ${res.id} failed: ${res.error}`);
        }
        settle(res.id, { png: res.png, ok: !res.error });
    });
    w.on('error', err => {
        console.error('[sprites] worker error:', err);
    });
    w.on('exit', code => {
        worker = null;
        failAll(`worker exited with code ${code}`);
        if (code === 0) return;
        console.error(`[sprites] worker exited with code ${code}; restarting shortly.`);
        restarting = setTimeout(() => {
            restarting = null;
        }, 2000);
    });
    return w;
}

function renderInWorker(req: SpriteJob): Promise<RenderResult> {
    const w = getWorker();
    if (!w || pending.size >= MAX_PENDING) {
        return Promise.resolve({ png: null, ok: false });
    }
    const id = nextId++;
    return new Promise<RenderResult>(resolve => {
        const timer = setTimeout(() => {
            console.error(`[sprites] render ${id} timed out`);
            settle(id, { png: null, ok: false });
        }, RENDER_TIMEOUT_MS);
        pending.set(id, { resolve, timer });
        const msg: SpriteRequest = { ...req, id };
        w.postMessage(msg);
    });
}

// ---- cache ----------------------------------------------------------------------------------
// keyed by the canonical URL path; null caches a "can't render" so a bad id doesn't hit the
// worker on every request. Insertion-ordered Map as an LRU.
const cache = new Map<string, Uint8Array | null>();
const inflight = new Map<string, Promise<Uint8Array | null>>();

function cacheGet(key: string): Uint8Array | null | undefined {
    if (!cache.has(key)) return undefined;
    const value = cache.get(key)!;
    cache.delete(key);
    cache.set(key, value);
    return value;
}

function cacheSet(key: string, value: Uint8Array | null): void {
    cache.set(key, value);
    while (cache.size > CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

async function renderCached(key: string, req: SpriteJob): Promise<Uint8Array | null> {
    const hit = cacheGet(key);
    if (hit !== undefined) return hit;
    const existing = inflight.get(key);
    if (existing) return existing;

    const job = renderInWorker(req).then(result => {
        inflight.delete(key);
        if (result.ok) {
            cacheSet(key, result.png);
        }
        return result.png;
    });
    inflight.set(key, job);
    return job;
}

export function spriteCacheStats(): { entries: number; inflight: number; pending: number; workerAlive: boolean } {
    return { entries: cache.size, inflight: inflight.size, pending: pending.size, workerAlive: worker !== null };
}

// ---- URL helpers ----------------------------------------------------------------------------
function clampInt(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n | 0));
}

/** URL for a player sprite; the page embeds this in an <img src>. */
export function playerSpriteUrl(appearance: PlayerAppearance, width: number, height: number): string {
    const colors = Array.from({ length: 5 }, (_, i) => clampInt(appearance.colors[i] ?? 0, 0, 255));
    const slots = Array.from({ length: 12 }, (_, i) => clampInt(appearance.slots[i] ?? 0, 0, 0xffff));
    return `/sprite/player/${clampInt(width, 1, MAX_DIMENSION)}x${clampInt(height, 1, MAX_DIMENSION)}/${appearance.gender & 1}/${colors.join('.')}/${slots.join('.')}.png`;
}

/** URL for a 32x32 item icon. */
export function itemSpriteUrl(itemId: number, count: number = 1): string {
    return count > 1 ? `/sprite/item/${itemId | 0}-${count | 0}.png` : `/sprite/item/${itemId | 0}.png`;
}

const PLAYER_RE = /^\/sprite\/player\/(\d{1,3})x(\d{1,3})\/([01])\/((?:\d{1,3}\.){4}\d{1,3})\/((?:\d{1,5}\.){11}\d{1,5})\.png$/;
const ITEM_RE = /^\/sprite\/item\/(\d{1,6})(?:-(\d{1,10}))?\.png$/;

function parseSpriteUrl(pathname: string): { key: string; req: SpriteJob } | null {
    const player = pathname.match(PLAYER_RE);
    if (player) {
        const width = Number(player[1]);
        const height = Number(player[2]);
        if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) return null;
        const appearance: PlayerAppearance = {
            gender: Number(player[3]),
            colors: player[4].split('.').map(Number),
            slots: player[5].split('.').map(Number)
        };
        if (appearance.colors.some(c => c > 255) || appearance.slots.some(s => s > 0xffff)) return null;
        // canonical form so "007" and "7" share a cache entry
        const key = playerSpriteUrl(appearance, width, height);
        return { key, req: { kind: 'player', appearance, width, height } };
    }

    const item = pathname.match(ITEM_RE);
    if (item) {
        const itemId = Number(item[1]);
        const count = item[2] ? Number(item[2]) : 1;
        if (count < 1 || count > 0x7fffffff) return null;
        return { key: itemSpriteUrl(itemId, count), req: { kind: 'item', itemId, count } };
    }

    return null;
}

/** Route handler: returns a PNG response for /sprite/... paths, null for anything else. */
export async function handleSpriteRequest(url: URL): Promise<Response | null> {
    if (!url.pathname.startsWith('/sprite/')) return null;

    const parsed = parseSpriteUrl(url.pathname);
    if (!parsed) {
        return new Response('Bad sprite request', { status: 400 });
    }

    const png = await renderCached(parsed.key, parsed.req);
    if (!png) {
        return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
    }
    return new Response(png, {
        headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(png.length),
            'Cache-Control': 'public, max-age=86400'
        }
    });
}
