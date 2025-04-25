import { CoordGrid } from '#/engine/CoordGrid.js';
import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateZonePartialFollows from '#/network/server/model/game/UpdateZonePartialFollows.js';

export default class UpdateZonePartialFollowsEncoder extends MessageEncoder<UpdateZonePartialFollows> {
    prot = ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS;

    encode(buf: Packet, message: UpdateZonePartialFollows): void {
        buf.p1((message.zoneX << 3) - CoordGrid.zoneOrigin(message.originX));
        buf.p1((message.zoneZ << 3) - CoordGrid.zoneOrigin(message.originZ));
    }
}
