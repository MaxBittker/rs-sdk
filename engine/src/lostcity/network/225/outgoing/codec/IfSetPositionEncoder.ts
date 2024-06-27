import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfSetPosition from '#lostcity/network/outgoing/model/IfSetPosition.js';

export default class IfSetPositionEncoder extends MessageEncoder<IfSetPosition> {
    prot = ServerProt.IF_SETPOSITION;

    encode(buf: Packet, message: IfSetPosition): void {
        buf.p2(message.component);
        buf.p2(message.x);
        buf.p2(message.y);
    }
}