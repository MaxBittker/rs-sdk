import Packet from '#/io/Packet.js';
import ZoneProt from '#/network/rs225/server/prot/ZoneProt.js';
import ZoneMessageEncoder from '#/network/server/codec/ZoneMessageEncoder.js';
import LocDel from '#/network/server/model/game/LocDel.js';

export default class LocDelEncoder extends ZoneMessageEncoder<LocDel> {
    prot = ZoneProt.LOC_DEL;

    encode(buf: Packet, message: LocDel): void {
        buf.p1(message.coord);
        buf.p1((message.shape << 2) | (message.angle & 0x3));
    }
}
