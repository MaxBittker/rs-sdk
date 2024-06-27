import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfOpenSideModal from '#lostcity/network/outgoing/model/IfOpenSideModal.js';

export default class IfOpenSideModalEncoder extends MessageEncoder<IfOpenSideModal> {
    prot = ServerProt.IF_OPENSIDEMODAL;

    encode(buf: Packet, message: IfOpenSideModal): void {
        buf.p2(message.component);
    }
}