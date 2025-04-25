import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetPosition from '#/network/server/model/game/IfSetPosition.js';

export default class IfSetPositionEncoder extends MessageEncoder<IfSetPosition> {
    prot = ServerProt.IF_SETPOSITION;

    encode(buf: Packet, message: IfSetPosition): void {
        buf.p2(message.component);
        buf.p2(message.x);
        buf.p2(message.y);
    }
}
