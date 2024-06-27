import Packet from '#jagex2/io/Packet.js';
import ZoneProt from '#lostcity/network/225/outgoing/prot/ZoneProt.js';
import MapAnim from '#lostcity/network/outgoing/model/MapAnim.js';
import ZoneMessageEncoder from '#lostcity/network/outgoing/codec/ZoneMessageEncoder.js';

export default class MapAnimEncoder extends ZoneMessageEncoder<MapAnim> {
    prot = ZoneProt.MAP_ANIM;

    encode(buf: Packet, message: MapAnim): void {
        buf.p1(message.coord);
        buf.p2(message.spotanim);
        buf.p1(message.height);
        buf.p2(message.delay);
    }
}