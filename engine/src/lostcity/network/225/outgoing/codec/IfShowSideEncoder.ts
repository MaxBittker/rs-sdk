import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfShowSide from '#lostcity/network/outgoing/model/IfShowSide.js';

export default class IfShowSideEncoder extends MessageEncoder<IfShowSide> {
    prot = ServerProt.IF_SHOWSIDE;

    encode(buf: Packet, message: IfShowSide): void {
        buf.p1(message.tab);
    }
}