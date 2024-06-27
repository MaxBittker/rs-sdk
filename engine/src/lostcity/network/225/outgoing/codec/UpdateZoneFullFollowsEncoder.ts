import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import UpdateZoneFullFollows from '#lostcity/network/outgoing/model/UpdateZoneFullFollows.js';
import {Position} from '#lostcity/entity/Position.js';

export default class UpdateZoneFullFollowsEncoder extends MessageEncoder<UpdateZoneFullFollows> {
    prot = ServerProt.UPDATE_ZONE_FULL_FOLLOWS;

    encode(buf: Packet, message: UpdateZoneFullFollows): void {
        buf.p1((message.zoneX << 3) - Position.zoneOrigin(message.originX));
        buf.p1((message.zoneZ << 3) - Position.zoneOrigin(message.originZ));
    }
}