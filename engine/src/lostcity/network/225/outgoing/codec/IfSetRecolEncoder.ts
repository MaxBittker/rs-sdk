import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfSetRecol from '#lostcity/network/outgoing/model/IfSetRecol.js';

export default class IfSetRecolEncoder extends MessageEncoder<IfSetRecol> {
    prot = ServerProt.IF_SETRECOL;

    encode(buf: Packet, message: IfSetRecol): void {
        buf.p2(message.component);
        buf.p2(message.src);
        buf.p2(message.dst);
    }
}