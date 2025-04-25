import { PRELOADED_CRC } from '#/cache/PreloadedPacks.js';
import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import RebuildNormal from '#/network/server/model/game/RebuildNormal.js';

export default class RebuildNormalEncoder extends MessageEncoder<RebuildNormal> {
    prot = ServerProt.REBUILD_NORMAL;

    encode(buf: Packet, message: RebuildNormal): void {
        buf.p2(message.zoneX);
        buf.p2(message.zoneZ);
        for (const packed of message.mapsquares) {
            const x: number = packed >> 8;
            const z: number = packed & 0xff;
            buf.p1(x);
            buf.p1(z);
            buf.p4(PRELOADED_CRC.get(`m${x}_${z}`) ?? 0);
            buf.p4(PRELOADED_CRC.get(`l${x}_${z}`) ?? 0);
        }
    }

    test(message: RebuildNormal): number {
        return 2 + 2 + message.mapsquares.size * (1 + 1 + 4 + 4);
    }
}
