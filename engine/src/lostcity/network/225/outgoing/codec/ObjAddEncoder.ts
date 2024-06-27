import Packet from '#jagex2/io/Packet.js';
import ZoneProt from '#lostcity/network/225/outgoing/prot/ZoneProt.js';
import ObjAdd from '#lostcity/network/outgoing/model/ObjAdd.js';
import ZoneMessageEncoder from '#lostcity/network/outgoing/codec/ZoneMessageEncoder.js';

export default class ObjAddEncoder extends ZoneMessageEncoder<ObjAdd> {
    prot = ZoneProt.OBJ_ADD;

    encode(buf: Packet, message: ObjAdd): void {
        buf.p1(message.coord);
        buf.p2(message.obj);
        buf.p2(Math.min(message.count, 65535));
    }
}