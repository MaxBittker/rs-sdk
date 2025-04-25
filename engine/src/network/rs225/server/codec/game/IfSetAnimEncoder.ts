import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetAnim from '#/network/server/model/game/IfSetAnim.js';

export default class IfSetAnimEncoder extends MessageEncoder<IfSetAnim> {
    prot = ServerProt.IF_SETANIM;

    encode(buf: Packet, message: IfSetAnim): void {
        buf.p2(message.component);
        buf.p2(message.seq);
    }
}
