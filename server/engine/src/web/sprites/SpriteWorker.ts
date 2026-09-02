// Sprite rendering worker thread.
//
// Hosts the webclient's standalone ItemViewer (server/webclient/src/viewer) inside a Bun
// worker so hiscores pages can serve pre-rendered PNG sprites instead of shipping the whole
// model cache (ondemand.zip, ~7MB) to every browser and re-unpacking it on every page view.
//
// Runs off the tick thread: viewer init takes ~400ms and ~150MB, and each render is a few
// ms of pure CPU. The main thread side is SpriteRenderer.ts, which owns the cache.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { parentPort } from 'worker_threads';

import type { SpriteRequest, SpriteResponse } from '#/web/sprites/SpriteProtocol.js';

if (!parentPort) throw new Error('This file must be run as a worker thread.');

const PACK_DIR = path.resolve(import.meta.dir, '../../../data/pack');
const VIEWER_ENTRY = new URL('../../../../webclient/src/viewer/ItemViewer.ts', import.meta.url).href;

// ---- DOM shim -------------------------------------------------------------------------------
// The viewer's dependency tree touches `document` at module load (Canvas.ts grabs
// #canvas, Jpeg.ts creates a scratch canvas) and PixMap asks the 2d context for an
// ImageData. None of that is used for offscreen sprite rendering, which rasterises into a
// plain Int32Array, so a minimal stand-in is enough. Must be installed before the import.
type FakeImageData = { data: Uint8ClampedArray; width: number; height: number };
const fakeContext = {
    createImageData: (width: number, height: number): FakeImageData => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    getImageData: (_x: number, _y: number, width: number, height: number): FakeImageData => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData: (): void => {},
    drawImage: (): void => {}
};
const fakeCanvas = { width: 256, height: 256, getContext: () => fakeContext };
const g = globalThis as Record<string, unknown>;
if (typeof g.document === 'undefined') {
    g.document = { getElementById: () => fakeCanvas, createElement: () => fakeCanvas };
}
if (typeof g.window === 'undefined') {
    g.window = { location: { host: 'localhost', protocol: 'http:' } };
}

// ---- viewer ---------------------------------------------------------------------------------
type Appearance = { gender: number; colors: number[]; slots: number[] };
// Pix32: `wi`/`hi` are the sprite's width/height
type Pix32Like = { data: Int32Array; wi: number; hi: number };
type Viewer = {
    initFromData(data: { config: Uint8Array; textures: Uint8Array; versionlist: Uint8Array; ondemand: Uint8Array }, options?: { lazyModels?: boolean }): void;
    renderPlayerSprite(appearance: Appearance, width: number, height: number, yaw?: number): Pix32Like | null;
    renderItemIcon(itemId: number, count?: number, outlineRgb?: number): Pix32Like | null;
};

let viewerPromise: Promise<Viewer> | null = null;

function loadViewer(): Promise<Viewer> {
    // memoised: requests queued behind the first one must not each init the viewer
    if (!viewerPromise) {
        viewerPromise = initViewer().catch(err => {
            viewerPromise = null;
            throw err;
        });
    }
    return viewerPromise;
}

async function initViewer(): Promise<Viewer> {
    // dynamic import: the viewer lives in the webclient package (outside this tsconfig's
    // rootDir) and needs the DOM shim above installed first
    const started = performance.now();
    const mod = (await import(VIEWER_ENTRY)) as { ItemViewer: new () => Viewer };
    const v = new mod.ItemViewer();
    v.initFromData(
        {
            config: fs.readFileSync(`${PACK_DIR}/client/config`),
            textures: fs.readFileSync(`${PACK_DIR}/client/textures`),
            versionlist: fs.readFileSync(`${PACK_DIR}/client/versionlist`),
            ondemand: fs.readFileSync(`${PACK_DIR}/ondemand.zip`)
        },
        { lazyModels: true }
    );
    console.log(`[sprites] viewer ready in ${(performance.now() - started).toFixed(0)}ms`);
    return v;
}

// ---- PNG encoder ----------------------------------------------------------------------------
// Bun has no canvas, so write the PNG by hand: 8-bit RGBA, filter type 0 on every row,
// one zlib stream. Pixel 0 is the renderer's transparent key.
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC_TABLE[i] = c;
}

function crc32(buf: Uint8Array): number {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ -1) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) {
        out[4 + i] = type.charCodeAt(i);
    }
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}

function encodePng(pixels: Int32Array, width: number, height: number): Uint8Array {
    const stride = width * 4 + 1;
    const raw = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) {
        const row = y * stride;
        raw[row] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            const p = pixels[y * width + x];
            if (p === 0) continue; // transparent key, already zeroed
            const o = row + 1 + x * 4;
            raw[o] = (p >> 16) & 0xff;
            raw[o + 1] = (p >> 8) & 0xff;
            raw[o + 2] = p & 0xff;
            raw[o + 3] = 0xff;
        }
    }

    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA

    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

// ---- request loop ---------------------------------------------------------------------------
parentPort.on('message', async (req: SpriteRequest) => {
    let png: Uint8Array | null = null;
    let error: string | undefined;
    try {
        const v = await loadViewer();
        let sprite: Pix32Like | null = null;
        if (req.kind === 'player') {
            sprite = v.renderPlayerSprite(req.appearance, req.width, req.height);
        } else if (req.kind === 'item') {
            sprite = v.renderItemIcon(req.itemId, req.count);
        }
        if (sprite) {
            png = encodePng(sprite.data, sprite.wi, sprite.hi);
        }
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
    }
    const res: SpriteResponse = { id: req.id, png, error };
    if (png) {
        parentPort!.postMessage(res, [png.buffer as ArrayBuffer]);
    } else {
        parentPort!.postMessage(res);
    }
});
