import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import IfOpenChatModal from '#lostcity/network/outgoing/model/IfOpenChatModal.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';

export default class IfOpenChatModalEncoder extends MessageEncoder<IfOpenChatModal> {
    prot = ServerProt.IF_OPENCHATMODAL;

    encode(buf: Packet, message: IfOpenChatModal): void {
        buf.p2(message.component);
    }
}