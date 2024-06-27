import Packet from '#jagex2/io/Packet.js';
import ZoneProt from '#lostcity/network/225/outgoing/prot/ZoneProt.js';
import MapProjAnim from '#lostcity/network/outgoing/model/MapProjAnim.js';
import ZoneMessageEncoder from '#lostcity/network/outgoing/codec/ZoneMessageEncoder.js';

export default class MapProjAnimEncoder extends ZoneMessageEncoder<MapProjAnim> {
    prot = ZoneProt.MAP_PROJANIM;

    // variables fully broken out for now
    //coord $from, coord $to, spotanim $spotanim, int $fromHeight, int $toHeight, int $startDelay, int $endDelay, int $peak, int $arc
    encode(buf: Packet, message: MapProjAnim): void {
        buf.p1(message.coord);
        buf.p1(message.dstX - message.srcX);
        buf.p1(message.dstZ - message.srcZ);
        buf.p2(message.target); // 0: coord, > 0: npc, < 0: player
        buf.p2(message.spotanim);
        buf.p1(message.srcHeight);
        buf.p1(message.dstHeight);
        buf.p2(message.startDelay);
        buf.p2(message.endDelay);
        buf.p1(message.peak);
        buf.p1(message.arc);
    }
}