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
 * A no-op OnDemandProvider that never fetches — all models must be pre-loaded.
 */
class NoopProvider extends OnDemandProvider {
    override requestModel(_id: number): void {
        // In a full implementation, this could trigger a lazy HTTP fetch.
        // For now, models must be pre-loaded before rendering.
    }
}

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
        const [configData, texturesData, versionlistData] = await Promise.all([
            downloadUrl(`${serverBase}/config${crcs[2]}`),
            downloadUrl(`${serverBase}/textures${crcs[6]}`),
            downloadUrl(`${serverBase}/versionlist${crcs[5]}`),
        ]);

        const jagConfig = new JagFile(configData);
        const jagTextures = new JagFile(texturesData);
        const jagVersionlist = new JagFile(versionlistData);

        // Parse version list to determine model count
        const versionlistPacket = new Packet(jagVersionlist.read('model_version'));
        const modelCount = (versionlistPacket.length / 2) | 0;

        // Parse anim version list for frame count
        const animVersionPacket = new Packet(jagVersionlist.read('anim_version'));
        const animCount = (animVersionPacket.length / 2) | 0;

        // Initialize model system
        AnimFrame.init(animCount);
        Model.init(modelCount, new NoopProvider());

        // Set up canvas drawing area
        this.drawArea = new PixMap(canvas.width, canvas.height);
        Pix3D.setRenderClipping();

        // Unpack textures (needed for textured model faces)
        Pix3D.unpackTextures(jagTextures);

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

        // Pre-load model data from ondemand.zip
        await this.preloadModels(serverBase);

        this.initialized = true;
    }

    /**
     * Fetch and unpack all models from ondemand.zip.
     *
     * The zip contains entries named "{archive+1}.{file}" where:
     * - archive 0 (entries "1.*") = model data
     * - archive 1 (entries "2.*") = animation frame data
     *
     * Each entry is gzipped with a 2-byte version trailer that must be stripped
     * before decompression.
     */
    private async preloadModels(serverBase: string): Promise<void> {
        const data = await downloadUrl(`${serverBase}/ondemand.zip`);
        const zip = unzipSync(data);

        for (const [name, entryData] of Object.entries(zip)) {
            const parts = name.split('.');
            if (parts.length !== 2) continue;

            const archivePlusOne = parseInt(parts[0]);
            const file = parseInt(parts[1]);
            if (isNaN(archivePlusOne) || isNaN(file)) continue;

            const archive = archivePlusOne - 1;

            // Strip 2-byte version trailer and decompress
            const entry = entryData as Uint8Array;
            const decompressed = gunzipSync(entry.slice(0, entry.length - 2));

            if (archive === 0) {
                Model.unpack(file, decompressed);
            } else if (archive === 1) {
                AnimFrame.unpack(decompressed);
            }
        }
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
