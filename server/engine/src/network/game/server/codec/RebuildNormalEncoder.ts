import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import RebuildNormal from '#/network/game/server/model/RebuildNormal.js';

export default class RebuildNormalEncoder extends ServerGameMessageEncoder<RebuildNormal> {
    prot = ServerGameProt.REBUILD_NORMAL;

    encode(buf: Packet, message: RebuildNormal): void {
        buf.p2(message.zoneX);
        buf.p2(message.zoneZ);
    }
}
