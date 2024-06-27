import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfOpenMainModal from '#lostcity/network/outgoing/model/IfOpenMainModal.js';

export default class IfOpenMainModalEncoder extends MessageEncoder<IfOpenMainModal> {
    prot = ServerProt.IF_OPENMAINMODAL;

    encode(buf: Packet, message: IfOpenMainModal): void {
        buf.p2(message.component);
    }
}