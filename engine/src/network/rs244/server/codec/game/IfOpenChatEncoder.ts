import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfOpenChat from '#/network/server/model/game/IfOpenChat.js';

export default class IfOpenChatEncoder extends MessageEncoder<IfOpenChat> {
    prot = ServerProt.IF_OPENCHAT;

    encode(buf: Packet, message: IfOpenChat): void {
        buf.p2(message.component);
    }
}
