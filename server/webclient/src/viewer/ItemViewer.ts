/**
 * Standalone item/character renderer — proof of concept.
 *
 * Renders item icons and character models without the full game client.
 * Requires a <canvas id="canvas"> element to exist in the DOM before this module loads
 * (needed by the shared Canvas.ts module).
 *
 * Usage from HTML:
 *   <canvas id="canvas" width="256" height="256"></canvas>
 *   <script type="module">
 *     import { ItemViewer } from './viewer/viewer.js';
 *     const viewer = new ItemViewer();
 *     await viewer.init('/config...', '/textures...', '/models...');
 *     const icon = viewer.renderItemIcon(1277); // rune sword
 *     // icon is a Pix32 with .pixels (Int32Array)
 *   </script>
 */

import Pix2D from '#/graphics/Pix2D.js';
import Pix3D from '#/dash3d/Pix3D.js';
import Pix32 from '#/graphics/Pix32.js';
import PixMap from '#/graphics/PixMap.js';

import Model from '#/dash3d/Model.js';

import ObjType from '#/config/ObjType.js';
import IdkType from '#/config/IdkType.js';
import ClientPlayer from '#/dash3d/ClientPlayer.js';
import NpcType from '#/config/NpcType.js';
import SeqType from '#/config/SeqType.js';
import SpotType from '#/config/SpotType.js';
import FloType from '#/config/FloType.js';
import LocType from '#/config/LocType.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';
import OnDemandProvider from '#/io/OnDemandProvider.js';

import AnimFrame from '#/dash3d/AnimFrame.js';

import { canvas } from '#/graphics/Canvas.js';

import { downloadUrl } from '#/util/JsUtil.js';

import { gunzipSync, unzipSync } from 'fflate';

/**
 * Default new-player appearance (engine Player.body defaults), in the
 * player-info wire encoding: slot order with 0x100+idkId entries.
 */
export const DEFAULT_APPEARANCE = {
    gender: 0,
    colors: [0, 0, 0, 0, 0],
    slots: [0, 0, 0, 0, 0x100 + 18, 0, 0x100 + 26, 0x100 + 36, 0x100 + 0, 0x100 + 33, 0x100 + 42, 0x100 + 10]
};

/**
 * A no-op OnDemandProvider that never fetches — all models must be pre-loaded.
 */
class NoopProvider extends OnDemandProvider {
    override requestModel(_id: number): void {
        // In a full implementation, this could trigger a lazy HTTP fetch.
        // For now, models must be pre-loaded before rendering.
    }
}

/**
 * Synchronous provider that gunzips + unpacks a model from the ondemand.zip
 * entries the first time Model asks for it. Model.load/requestDownload re-check
 * the metadata table right after requestModel, so a render that only needs a
 * handful of models (a player sprite, an item icon) never touches the other
 * ~3000 entries. Missing ids are recorded as empty models so they aren't
 * re-requested forever.
 */
class ZipProvider extends OnDemandProvider {
    private readonly entries: Map<number, Uint8Array>;

    constructor(entries: Map<number, Uint8Array>) {
        super();
        this.entries = entries;
    }

    override requestModel(id: number): void {
        const entry = this.entries.get(id);
        if (!entry) {
            Model.unpack(id, null);
            return;
        }
        this.entries.delete(id);
        try {
            // Strip 2-byte version trailer and decompress
            Model.unpack(id, gunzipSync(entry.subarray(0, entry.length - 2)));
        } catch {
            Model.unpack(id, null);
        }
    }
}

export type ItemViewerData = { config: Uint8Array; textures: Uint8Array; versionlist: Uint8Array; ondemand: Uint8Array };
export type ItemViewerOptions = {
    /**
     * Keep model entries compressed and unpack them on first use instead of
     * gunzipping the whole archive up front. Cuts init from ~650ms/220MB to a
     * few ms for callers that render a handful of things (the engine's sprite
     * worker). Animation frames are still unpacked eagerly.
     */
    lazyModels?: boolean;
};

/**
 * Minimal standalone renderer for items and characters.
 */
export class ItemViewer {
    private drawArea: PixMap | null = null;
    private initialized = false;

    /**
     * Initialize the rendering pipeline.
     *
     * Fetches game archives from the server, unpacks config data,
     * and pre-loads model data needed for rendering.
     *
     * @param serverBase - Base URL to fetch archives from (e.g. '' for same origin)
     */
    async init(serverBase: string = ''): Promise<void> {
        // Fetch CRC table to know archive filenames
        const crcData = new Packet(await downloadUrl(`${serverBase}/crc`));
        const crcs: number[] = [];
        for (let i = 0; i < 9; i++) {
            crcs[i] = crcData.g4();
        }

        // Fetch required archives
        const [config, textures, versionlist, ondemand] = await Promise.all([
            downloadUrl(`${serverBase}/config${crcs[2]}`),
            downloadUrl(`${serverBase}/textures${crcs[6]}`),
            downloadUrl(`${serverBase}/versionlist${crcs[5]}`),
            downloadUrl(`${serverBase}/ondemand.zip`)
        ]);

        this.initFromData({ config, textures, versionlist, ondemand });
    }

    /**
     * Initialize the rendering pipeline from already-loaded archive bytes.
     *
     * This is the transport-free half of init(): the engine uses it to run the
     * viewer inside a Bun worker (reading the pack from disk) so hiscores pages
     * can serve pre-rendered sprites instead of shipping the whole model cache
     * to every browser.
     */
    initFromData(data: ItemViewerData, options: ItemViewerOptions = {}): void {
        const jagConfig = new JagFile(data.config);
        const jagTextures = new JagFile(data.textures);
        const jagVersionlist = new JagFile(data.versionlist);

        // Parse version list to determine model count
        const versionlistPacket = new Packet(jagVersionlist.read('model_version'));
        const modelCount = (versionlistPacket.length / 2) | 0;

        // Parse anim version list for frame count
        const animVersionPacket = new Packet(jagVersionlist.read('anim_version'));
        const animCount = (animVersionPacket.length / 2) | 0;

        // Initialize model system
        AnimFrame.init(animCount);
        const zip = unzipSync(data.ondemand);
        if (options.lazyModels) {
            Model.init(modelCount, new ZipProvider(this.indexModels(zip)));
            this.preloadAnims(zip);
        } else {
            Model.init(modelCount, new NoopProvider());
            this.preloadModels(zip);
        }

        // Set up canvas drawing area
        this.drawArea = new PixMap(canvas.width, canvas.height);
        Pix3D.setRenderClipping();

        // Unpack textures (needed for textured model faces)
        Pix3D.unpackTextures(jagTextures);
        // without a texel pool, textureTriangle silently draws nothing (walls, doors, fences)
        Pix3D.initPool(20);

        // Initialize HSL-to-RGB colour lookup table (required for all rendering)
        Pix3D.initColourTable(0.8);

        // Unpack config data
        SeqType.init(jagConfig);
        LocType.init(jagConfig);
        FloType.init(jagConfig);
        ObjType.init(jagConfig, true);
        NpcType.init(jagConfig);
        IdkType.init(jagConfig);
        SpotType.init(jagConfig);

        this.initialized = true;
    }

    /**
     * Unpack every model and animation frame from an unzipped ondemand.zip.
     *
     * The zip contains entries named "{archive+1}.{file}" where:
     * - archive 0 (entries "1.*") = model data
     * - archive 1 (entries "2.*") = animation frame data
     *
     * Each entry is gzipped with a 2-byte version trailer that must be stripped
     * before decompression.
     */
    private preloadModels(zip: Record<string, Uint8Array>): void {
        for (const [name, entry] of Object.entries(zip)) {
            const parsed = ItemViewer.parseEntryName(name);
            if (!parsed) continue;

            const decompressed = gunzipSync(entry.subarray(0, entry.length - 2));
            if (parsed.archive === 0) {
                Model.unpack(parsed.file, decompressed);
            } else if (parsed.archive === 1) {
                AnimFrame.unpack(decompressed);
            }
        }
    }

    /** Unpack only the animation frames (archive 1); models stay compressed for ZipProvider. */
    private preloadAnims(zip: Record<string, Uint8Array>): void {
        for (const [name, entry] of Object.entries(zip)) {
            const parsed = ItemViewer.parseEntryName(name);
            if (parsed?.archive === 1) {
                AnimFrame.unpack(gunzipSync(entry.subarray(0, entry.length - 2)));
            }
        }
    }

    /** Map model id -> still-compressed zip entry (archive 0). */
    private indexModels(zip: Record<string, Uint8Array>): Map<number, Uint8Array> {
        const entries = new Map<number, Uint8Array>();
        for (const [name, entry] of Object.entries(zip)) {
            const parsed = ItemViewer.parseEntryName(name);
            if (parsed?.archive === 0) {
                entries.set(parsed.file, entry);
            }
        }
        return entries;
    }

    private static parseEntryName(name: string): { archive: number; file: number } | null {
        const parts = name.split('.');
        if (parts.length !== 2) return null;
        const archivePlusOne = parseInt(parts[0]);
        const file = parseInt(parts[1]);
        if (isNaN(archivePlusOne) || isNaN(file)) return null;
        return { archive: archivePlusOne - 1, file };
    }

    /**
     * Render a 32x32 item icon.
     *
     * @param itemId - The item ID to render
     * @param count - Stack count (affects icon for stackable items)
     * @param outlineRgb - Outline color (0 = shadow, -1 = none, >0 = colored outline)
     * @returns Pix32 with the rendered icon, or null if model data is missing
     */
    renderItemIcon(itemId: number, count: number = 1, outlineRgb: number = 0): Pix32 | null {
        if (!this.initialized) {
            throw new Error('ItemViewer not initialized. Call init() first.');
        }

        return ObjType.getSprite(itemId, count, outlineRgb);
    }

    /**
     * Render an item icon and return raw ImageData suitable for putImageData().
     */
    renderItemIconAsImageData(itemId: number, count: number = 1, outlineRgb: number = 0): ImageData | null {
        const icon = this.renderItemIcon(itemId, count, outlineRgb);
        if (!icon) return null;

        return this.pix32ToImageData(icon);
    }

    /**
     * Render a grid of item icons to the canvas.
     */
    renderItemGrid(itemIds: number[], columns: number = 8, iconSize: number = 32): void {
        if (!this.initialized || !this.drawArea) {
            throw new Error('ItemViewer not initialized. Call init() first.');
        }

        this.drawArea.setPixels();
        Pix2D.cls();

        const rows = Math.ceil(itemIds.length / columns);
        for (let i = 0; i < itemIds.length; i++) {
            const col = i % columns;
            const row = (i / columns) | 0;

            const icon = ObjType.getSprite(itemIds[i], 1, 0);
            if (icon) {
                // Draw icon to current Pix2D buffer at grid position
                const x = col * iconSize;
                const y = row * iconSize;

                for (let py = 0; py < 32; py++) {
                    for (let px = 0; px < 32; px++) {
                        const pixel = icon.data[px + py * 32];
                        if (pixel !== 0) {
                            const destX = x + px;
                            const destY = y + py;
                            if (destX >= 0 && destX < Pix2D.width && destY >= 0 && destY < Pix2D.height) {
                                Pix2D.pixels[destX + destY * Pix2D.width] = pixel;
                            }
                        }
                    }
                }
            }
        }

        this.drawArea.draw(0, 0);
    }

    /**
     * Render a full-body character sprite from an appearance descriptor.
     *
     * The appearance uses the player-info protocol encoding produced by the engine:
     * 12 slots of 0 (empty) / 0x100+idkId / 0x200+objId, 5 colour indices, gender.
     *
     * @param appearance - { gender, colors: number[5], slots: number[12] }
     * @param width/height - output sprite dimensions
     * @param yaw - model rotation, 0..2047 (0 faces the camera)
     * @returns Pix32 with 0 as the transparent key, or null if model data is missing
     */
    renderPlayerSprite(appearance: { gender: number; colors: number[]; slots: number[] }, width: number = 78, height: number = 130, yaw: number = 128): Pix32 | null {
        if (!this.initialized) {
            throw new Error('ItemViewer not initialized. Call init() first.');
        }

        const player = new ClientPlayer();
        player.gender = appearance.gender & 1;
        for (let i = 0; i < 12; i++) {
            player.appearance[i] = appearance.slots[i] ?? 0;
        }
        for (let i = 0; i < 5; i++) {
            player.colour[i] = appearance.colors[i] ?? 0;
        }
        // static ready-pose: no anims, lowMemory skips the tempModel animate path
        player.primaryAnim = -1;
        player.secondaryAnim = -1;
        player.lowMemory = true;
        player.ready = true;

        // model cache key, same derivation as ClientPlayer.setAppearance
        let baseId = 0n;
        for (let part = 0; part < 12; part++) {
            baseId <<= 0x4n;
            if (player.appearance[part] >= 256) {
                baseId += BigInt(player.appearance[part]) - 256n;
            }
        }
        if (player.appearance[0] >= 256) {
            baseId += (BigInt(player.appearance[0]) - 256n) >> 4n;
        }
        if (player.appearance[1] >= 256) {
            baseId += (BigInt(player.appearance[1]) - 256n) >> 8n;
        }
        for (let part = 0; part < 5; part++) {
            baseId <<= 0x3n;
            baseId += BigInt(player.colour[part]);
        }
        baseId <<= 0x1n;
        baseId += BigInt(player.gender);
        player.baseId = baseId;

        const model = player.getTempModel2();
        if (!model) {
            return null;
        }

        const sprite = new Pix32(width, height);

        // save the global rasterizer state and point it at our buffer (ObjType.getSprite pattern)
        const _cx: number = Pix3D.originX;
        const _cy: number = Pix3D.originY;
        const _loff: Int32Array = Pix3D.scanline;
        const _data: Int32Array = Pix2D.pixels;
        const _w: number = Pix2D.width;
        const _h: number = Pix2D.height;
        const _l: number = Pix2D.clipMinX;
        const _r: number = Pix2D.clipMaxX;
        const _t: number = Pix2D.clipMinY;
        const _b: number = Pix2D.clipMaxY;

        Pix3D.lowDetail = false;
        Pix2D.setPixels(sprite.data, width, height);
        Pix2D.fillRect(0, 0, width, height, 0);
        Pix3D.setRenderClipping();

        // frame the model: projected height = minY * 512 / eyeZ, fit to ~92% of the sprite
        const eyeZ = Math.max(1, ((model.minY * 512) / (height * 0.92)) | 0);
        model.objRender(0, yaw, 0, 0, 0, (model.minY / 2) | 0, eyeZ);

        Pix2D.setPixels(_data, _w, _h);
        Pix2D.setClipping(_l, _t, _r, _b);
        Pix3D.originX = _cx;
        Pix3D.originY = _cy;
        Pix3D.scanline = _loff;

        return sprite;
    }

    /**
     * Render a character sprite and return ImageData suitable for putImageData().
     */
    renderPlayerSpriteAsImageData(appearance: { gender: number; colors: number[]; slots: number[] }, width: number = 78, height: number = 130, yaw: number = 128): ImageData | null {
        const sprite = this.renderPlayerSprite(appearance, width, height, yaw);
        if (!sprite) return null;

        const imageData = new ImageData(width, height);
        const data = new Uint32Array(imageData.data.buffer);
        for (let i = 0; i < sprite.data.length; i++) {
            const pixel = sprite.data[i];
            if (pixel === 0) {
                data[i] = 0; // transparent
            } else {
                const r = (pixel >> 16) & 0xff;
                const g = (pixel >> 8) & 0xff;
                const b = pixel & 0xff;
                data[i] = 0xff000000 | (b << 16) | (g << 8) | r;
            }
        }
        return imageData;
    }

    /**
     * Render a scenery (loc) model to a sprite.
     *
     * @param locId - The loc ID to render
     * @param width/height - output sprite dimensions
     * @param yaw - model rotation, 0..2047
     * @param eyePitch - camera pitch, 0..2047 (0 = head-on, ~128 = game-like 3/4 view)
     * @returns Pix32 with 0 as the transparent key, or null if no model
     */
    renderLocSprite(locId: number, width: number = 128, height: number = 128, yaw: number = 128, eyePitch: number = 128, background: number = 0): Pix32 | null {
        if (!this.initialized) {
            throw new Error('ItemViewer not initialized. Call init() first.');
        }

        const loc = LocType.list(locId);
        const shape = loc.shape ? loc.shape[0] : 10; // CENTREPIECE_STRAIGHT
        const model = loc.getModel(shape, 0, 0, 0, 0, 0, -1);
        if (!model) {
            return null;
        }

        // buildModel never computes bounds; objRender needs them for culling and we need them for framing
        model.calcBoundingCylinder();

        // sharelight models (walls, doors, fences) defer lighting to scene merge and
        // their face colours are still 0 (the transparent key) — bake the lighting now
        if (loc.sharelight) {
            const ambient = (loc.ambient & 0xff) + 64;
            const contrast = (loc.contrast & 0xff) * 5 + 768;
            const magnitude = Math.sqrt(50 * 50 + 10 * 10 + 50 * 50) | 0;
            model.light(ambient, (contrast * magnitude) >> 8, -50, -10, -50);
        }

        const sprite = new Pix32(width, height);

        const _cx: number = Pix3D.originX;
        const _cy: number = Pix3D.originY;
        const _loff: Int32Array = Pix3D.scanline;
        const _data: Int32Array = Pix2D.pixels;
        const _w: number = Pix2D.width;
        const _h: number = Pix2D.height;
        const _l: number = Pix2D.clipMinX;
        const _r: number = Pix2D.clipMaxX;
        const _t: number = Pix2D.clipMinY;
        const _b: number = Pix2D.clipMaxY;

        Pix3D.lowDetail = false;
        Pix2D.setPixels(sprite.data, width, height);
        Pix2D.fillRect(0, 0, width, height, background);
        Pix3D.setRenderClipping();

        // frame the model so both its height (minY) and footprint (radius) fit
        const sinPitch = Math.sin((eyePitch * Math.PI) / 1024);
        const cosPitch = Math.cos((eyePitch * Math.PI) / 1024);
        const projHeight = model.minY * cosPitch + 2 * model.radius * sinPitch;
        const fit = 0.8;
        const distByHeight = (projHeight * 512) / (height * fit);
        const distByWidth = (2 * model.radius * 512) / (width * fit);
        const dist = Math.max(1, Math.ceil(Math.max(distByHeight, distByWidth)));

        // orbit the camera around the model centre (the ObjType.getSprite pattern):
        // eyeY/eyeZ are the pitched components of the camera distance
        const eyeY = ((dist * sinPitch) | 0) + ((model.minY / 2) | 0);
        const eyeZ = Math.max(1, (dist * cosPitch) | 0);
        model.objRender(0, yaw, 0, eyePitch, 0, eyeY, eyeZ);

        Pix2D.setPixels(_data, _w, _h);
        Pix2D.setClipping(_l, _t, _r, _b);
        Pix3D.originX = _cx;
        Pix3D.originY = _cy;
        Pix3D.scanline = _loff;

        return sprite;
    }

    /**
     * Render a loc sprite and return ImageData suitable for putImageData().
     *
     * Renders twice (black and white background) and diffs, so models with
     * pure-black faces (doors, fences) don't get holes from the 0-as-transparent key.
     */
    renderLocSpriteAsImageData(locId: number, width: number = 128, height: number = 128, yaw: number = 128, eyePitch: number = 128): ImageData | null {
        const onBlack = this.renderLocSprite(locId, width, height, yaw, eyePitch, 0);
        if (!onBlack) return null;
        const onWhite = this.renderLocSprite(locId, width, height, yaw, eyePitch, 0xffffff);
        if (!onWhite) return null;

        const imageData = new ImageData(width, height);
        const data = new Uint32Array(imageData.data.buffer);
        for (let i = 0; i < onBlack.data.length; i++) {
            const pixel = onBlack.data[i];
            if (pixel === 0 && onWhite.data[i] === 0xffffff) {
                data[i] = 0; // background in both passes → truly transparent
            } else {
                const r = (pixel >> 16) & 0xff;
                const g = (pixel >> 8) & 0xff;
                const b = pixel & 0xff;
                data[i] = 0xff000000 | (b << 16) | (g << 8) | r;
            }
        }
        return imageData;
    }

    /**
     * Render a player in an animation pose.
     *
     * @param seqId - Animation (SeqType) id, or -1 for the static ready pose
     * @param frame - Frame index within the seq (clamped by modulo)
     * @param yaw - model rotation, 0..2047
     * @param appearance - optional appearance override; defaults to a fresh-spawn look
     * @returns Pix32 with 0 as the transparent key, or null if data is missing
     */
    renderPlayerPose(seqId: number, frame: number = 0, width: number = 128, height: number = 128, yaw: number = 128, appearance: { gender: number; colors: number[]; slots: number[] } = DEFAULT_APPEARANCE, background: number = 0): Pix32 | null {
        if (!this.initialized) {
            throw new Error('ItemViewer not initialized. Call init() first.');
        }

        const player = new ClientPlayer();
        player.gender = appearance.gender & 1;
        for (let i = 0; i < 12; i++) {
            player.appearance[i] = appearance.slots[i] ?? 0;
        }
        for (let i = 0; i < 5; i++) {
            player.colour[i] = appearance.colors[i] ?? 0;
        }
        player.ready = true;
        player.lowMemory = false; // use the tempModel path so anim frames apply
        player.primaryAnim = -1;
        player.secondaryAnim = -1;
        player.primaryAnimDelay = 0;

        if (seqId >= 0) {
            const seq = SeqType.list[seqId];
            if (!seq || !seq.frames || seq.frames.length === 0) {
                return null;
            }
            player.primaryAnim = seqId;
            player.primaryAnimFrame = ((frame % seq.frames.length) + seq.frames.length) % seq.frames.length;
        }

        // model cache key, same derivation as ClientPlayer.setAppearance
        let baseId = 0n;
        for (let part = 0; part < 12; part++) {
            baseId <<= 0x4n;
            if (player.appearance[part] >= 256) {
                baseId += BigInt(player.appearance[part]) - 256n;
            }
        }
        if (player.appearance[0] >= 256) {
            baseId += (BigInt(player.appearance[0]) - 256n) >> 4n;
        }
        if (player.appearance[1] >= 256) {
            baseId += (BigInt(player.appearance[1]) - 256n) >> 8n;
        }
        for (let part = 0; part < 5; part++) {
            baseId <<= 0x3n;
            baseId += BigInt(player.colour[part]);
        }
        baseId <<= 0x1n;
        baseId += BigInt(player.gender);
        player.baseId = baseId;

        const model = player.getTempModel2();
        if (!model) {
            return null;
        }
        if (model.minY === 0 && model.radius === 0) {
            model.calcBoundingCylinder();
        }

        const sprite = new Pix32(width, height);

        const _cx: number = Pix3D.originX;
        const _cy: number = Pix3D.originY;
        const _loff: Int32Array = Pix3D.scanline;
        const _data: Int32Array = Pix2D.pixels;
        const _w: number = Pix2D.width;
        const _h: number = Pix2D.height;
        const _l: number = Pix2D.clipMinX;
        const _r: number = Pix2D.clipMaxX;
        const _t: number = Pix2D.clipMinY;
        const _b: number = Pix2D.clipMaxY;

        Pix3D.lowDetail = false;
        Pix2D.setPixels(sprite.data, width, height);
        Pix2D.fillRect(0, 0, width, height, background);
        Pix3D.setRenderClipping();

        // fit both height and pose width (some poses sprawl sideways)
        const fit = 0.85;
        const eyeZ = Math.max(1, Math.ceil(Math.max((model.minY * 512) / (height * fit), (2 * model.radius * 512) / (width * fit))));
        model.objRender(0, yaw, 0, 0, 0, (model.minY / 2) | 0, eyeZ);

        Pix2D.setPixels(_data, _w, _h);
        Pix2D.setClipping(_l, _t, _r, _b);
        Pix3D.originX = _cx;
        Pix3D.originY = _cy;
        Pix3D.scanline = _loff;

        return sprite;
    }

    /**
     * Render a player pose and return ImageData (two-pass background diff for
     * correct transparency around pure-black pixels).
     */
    renderPlayerPoseAsImageData(seqId: number, frame: number = 0, width: number = 128, height: number = 128, yaw: number = 128, appearance: { gender: number; colors: number[]; slots: number[] } = DEFAULT_APPEARANCE): ImageData | null {
        const onBlack = this.renderPlayerPose(seqId, frame, width, height, yaw, appearance, 0);
        if (!onBlack) return null;
        const onWhite = this.renderPlayerPose(seqId, frame, width, height, yaw, appearance, 0xffffff);
        if (!onWhite) return null;

        const imageData = new ImageData(width, height);
        const data = new Uint32Array(imageData.data.buffer);
        for (let i = 0; i < onBlack.data.length; i++) {
            const pixel = onBlack.data[i];
            if (pixel === 0 && onWhite.data[i] === 0xffffff) {
                data[i] = 0;
            } else {
                const r = (pixel >> 16) & 0xff;
                const g = (pixel >> 8) & 0xff;
                const b = pixel & 0xff;
                data[i] = 0xff000000 | (b << 16) | (g << 8) | r;
            }
        }
        return imageData;
    }

    /**
     * Get total number of animations (seqs).
     */
    getSeqCount(): number {
        return SeqType.numDefinitions;
    }

    /**
     * Number of frames in a seq, or 0 if it has none.
     */
    getSeqFrameCount(seqId: number): number {
        const seq = SeqType.list[seqId];
        return seq && seq.frames ? seq.frames.length : 0;
    }

    /**
     * Get loc name by ID.
     */
    getLocName(locId: number): string | null {
        return LocType.list(locId).name;
    }

    /**
     * Whether a loc has any model data (i.e. is renderable).
     */
    locHasModel(locId: number): boolean {
        return LocType.list(locId).model !== null;
    }

    /**
     * Get total number of locs.
     */
    getLocCount(): number {
        return LocType.numDefinitions;
    }

    /**
     * Get item name by ID.
     */
    getItemName(itemId: number): string | null {
        return ObjType.list(itemId).name;
    }

    /**
     * Check if an item is a noted (certificate) variant.
     */
    isNoted(itemId: number): boolean {
        return ObjType.list(itemId).certtemplate !== -1;
    }

    /**
     * Get total number of items.
     */
    getItemCount(): number {
        return ObjType.numDefinitions;
    }

    /**
     * Convert a Pix32 to browser ImageData.
     */
    private pix32ToImageData(pix: Pix32): ImageData {
        const imageData = new ImageData(32, 32);
        const data = new Uint32Array(imageData.data.buffer);
        for (let i = 0; i < pix.data.length; i++) {
            const pixel = pix.data[i];
            if (pixel === 0) {
                data[i] = 0; // transparent
            } else {
                // Convert from RGB (0xRRGGBB) to ABGR (for little-endian Uint32Array ImageData)
                const r = (pixel >> 16) & 0xff;
                const g = (pixel >> 8) & 0xff;
                const b = pixel & 0xff;
                data[i] = 0xff000000 | (b << 16) | (g << 8) | r;
            }
        }
        return imageData;
    }
}
