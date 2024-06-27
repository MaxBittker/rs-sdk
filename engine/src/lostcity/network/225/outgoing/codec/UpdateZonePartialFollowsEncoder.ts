import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import {Position} from '#lostcity/entity/Position.js';
import UpdateZonePartialFollows from '#lostcity/network/outgoing/model/UpdateZonePartialFollows.js';

export default class UpdateZonePartialFollowsEncoder extends MessageEncoder<UpdateZonePartialFollows> {
    prot = ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS;

    encode(buf: Packet, message: UpdateZonePartialFollows): void {
        buf.p1((message.zoneX << 3) - Position.zoneOrigin(message.originX));
        buf.p1((message.zoneZ << 3) - Position.zoneOrigin(message.originZ));
    }
}