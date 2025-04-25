import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetNpcHead from '#/network/server/model/game/IfSetNpcHead.js';

export default class IfSetNpcHeadEncoder extends MessageEncoder<IfSetNpcHead> {
    prot = ServerProt.IF_SETNPCHEAD;

    encode(buf: Packet, message: IfSetNpcHead): void {
        buf.p2(message.component);
        buf.p2(message.npc);
    }
}
