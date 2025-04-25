import Packet from '#/io/Packet.js';
import ZoneProt from '#/network/rs244/server/prot/ZoneProt.js';
import ZoneMessageEncoder from '#/network/server/codec/ZoneMessageEncoder.js';
import ObjAdd from '#/network/server/model/game/ObjAdd.js';

export default class ObjAddEncoder extends ZoneMessageEncoder<ObjAdd> {
    prot = ZoneProt.OBJ_ADD;

    encode(buf: Packet, message: ObjAdd): void {
        buf.p1(message.coord);
        buf.p2(message.obj);
        buf.p2(Math.min(message.count, 65535));
    }
}
