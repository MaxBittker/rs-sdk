import Packet from '#jagex2/io/Packet.js';
import LocDel from '#lostcity/network/outgoing/model/LocDel.js';
import ZoneProt from '#lostcity/network/225/outgoing/prot/ZoneProt.js';
import ZoneMessageEncoder from '#lostcity/network/outgoing/codec/ZoneMessageEncoder.js';

export default class LocDelEncoder extends ZoneMessageEncoder<LocDel> {
    prot = ZoneProt.LOC_DEL;

    encode(buf: Packet, message: LocDel): void {
        buf.p1(message.coord);
        buf.p1((message.shape << 2) | (message.angle & 0x3));
    }
}