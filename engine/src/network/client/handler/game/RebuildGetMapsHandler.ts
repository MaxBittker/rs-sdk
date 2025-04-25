import { PRELOADED } from '#/cache/PreloadedPacks.js';
import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import RebuildGetMaps from '#/network/client/model/game/RebuildGetMaps.js';
import DataLand from '#/network/server/model/game/DataLand.js';
import DataLandDone from '#/network/server/model/game/DataLandDone.js';
import DataLoc from '#/network/server/model/game/DataLoc.js';
import DataLocDone from '#/network/server/model/game/DataLocDone.js';

export default class RebuildGetMapsHandler extends MessageHandler<RebuildGetMaps> {
    private static readonly CHUNK_SIZE: number = 1000 - 1 - 2 - 1 - 1 - 2 - 2;
    private static readonly LAST_BUILD_TICKS: number = 10;
    private static readonly MAPS_LIMIT: number = 9 * 2; // 9 mapsquares * 2 (m & l)

    handle(message: RebuildGetMaps, player: Player): boolean {
        if (player.buildArea.lastBuild + RebuildGetMapsHandler.LAST_BUILD_TICKS < World.currentTick) {
            // allows up to 10 ticks to download maps.
            return false;
        }

        const requested = message.maps;

        if (requested.length > RebuildGetMapsHandler.MAPS_LIMIT) {
            // allows up to 9 mapsquares to be downloaded.
            return false;
        }

        const chunk: number = RebuildGetMapsHandler.CHUNK_SIZE;

        for (let i = 0; i < requested.length; i++) {
            const packed: number = requested[i];
            const mapsquare: number = packed & 0xffff;

            if (!player.buildArea.mapsquares.has(mapsquare)) {
                continue;
            }

            const type: number = (packed >> 16) & 0x1;
            const x: number = (mapsquare >> 8) & 0xff;
            const z: number = mapsquare & 0xff;

            if (type === 0) {
                const land: Uint8Array | undefined = PRELOADED.get(`m${x}_${z}`);
                if (!land) {
                    continue;
                }

                for (let off: number = 0; off < land.length; off += chunk) {
                    player.write(new DataLand(x, z, off, land.length, land.subarray(off, off + chunk)));
                }
                player.write(new DataLandDone(x, z));
            } else if (type === 1) {
                const loc: Uint8Array | undefined = PRELOADED.get(`l${x}_${z}`);
                if (!loc) {
                    continue;
                }

                for (let off: number = 0; off < loc.length; off += chunk) {
                    player.write(new DataLoc(x, z, off, loc.length, loc.subarray(off, off + chunk)));
                }
                player.write(new DataLocDone(x, z));
            }
        }

        player.buildArea.rebuildZones();

        return true;
    }
}
