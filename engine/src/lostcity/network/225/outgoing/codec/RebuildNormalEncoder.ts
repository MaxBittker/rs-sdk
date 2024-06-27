import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import RebuildNormal from '#lostcity/network/outgoing/model/RebuildNormal.js';
import {PRELOADED_CRC} from '#lostcity/server/PreloadedPacks.js';

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
}