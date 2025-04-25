import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import CamMoveTo from '#/network/server/model/game/CamMoveTo.js';

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
