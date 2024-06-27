import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import CamMoveTo from '#lostcity/network/outgoing/model/CamMoveTo.js';

export default class CamMoveToEncoder extends MessageEncoder<CamMoveTo> {
    prot = ServerProt.CAM_MOVETO;

    encode(buf: Packet, message: CamMoveTo): void {
        buf.p1(message.x);
        buf.p1(message.z);
        buf.p2(message.height);
        buf.p1(message.speed);
        buf.p1(message.multiplier);
    }
}