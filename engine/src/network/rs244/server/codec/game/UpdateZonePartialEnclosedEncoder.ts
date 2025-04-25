import { CoordGrid } from '#/engine/CoordGrid.js';
import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateZonePartialEnclosed from '#/network/server/model/game/UpdateZonePartialEnclosed.js';

export default class UpdateZonePartialEnclosedEncoder extends MessageEncoder<UpdateZonePartialEnclosed> {
    prot = ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED;

    encode(buf: Packet, message: UpdateZonePartialEnclosed): void {
        buf.p1((message.zoneX << 3) - CoordGrid.zoneOrigin(message.originX));
        buf.p1((message.zoneZ << 3) - CoordGrid.zoneOrigin(message.originZ));
        buf.pdata(message.data, 0, message.data.length);
    }

    test(message: UpdateZonePartialEnclosed): number {
        return 1 + 1 + message.data.length;
    }
}
