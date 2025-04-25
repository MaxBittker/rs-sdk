import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import RebuildNormal from '#/network/server/model/game/RebuildNormal.js';

export default class RebuildNormalEncoder extends MessageEncoder<RebuildNormal> {
    prot = ServerProt.REBUILD_NORMAL;

    encode(buf: Packet, message: RebuildNormal): void {
        buf.p2(message.zoneX);
        buf.p2(message.zoneZ);
    }

    test(_message: RebuildNormal): number {
        return 4;
    }
}
