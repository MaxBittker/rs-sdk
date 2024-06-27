import Packet from '#jagex2/io/Packet.js';
import ZoneProt from '#lostcity/network/225/outgoing/prot/ZoneProt.js';
import ObjDel from '#lostcity/network/outgoing/model/ObjDel.js';
import ZoneMessageEncoder from '#lostcity/network/outgoing/codec/ZoneMessageEncoder.js';

export default class ObjDelEncoder extends ZoneMessageEncoder<ObjDel> {
    prot = ZoneProt.OBJ_DEL;

    encode(buf: Packet, message: ObjDel): void {
        buf.p1(message.coord);
        buf.p2(message.obj);
    }
}