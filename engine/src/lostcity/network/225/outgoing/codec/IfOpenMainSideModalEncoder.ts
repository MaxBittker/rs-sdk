import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfOpenMainSideModal from '#lostcity/network/outgoing/model/IfOpenMainSideModal.js';

export default class IfOpenMainSideModalEncoder extends MessageEncoder<IfOpenMainSideModal> {
    prot = ServerProt.IF_OPENMAINSIDEMODAL;

    encode(buf: Packet, message: IfOpenMainSideModal): void {
        buf.p2(message.main);
        buf.p2(message.side);
    }
}