import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfOpenMainSide from '#/network/server/model/game/IfOpenMainSide.js';

export default class IfOpenMainSideEncoder extends MessageEncoder<IfOpenMainSide> {
    prot = ServerProt.IF_OPENMAIN_SIDE;

    encode(buf: Packet, message: IfOpenMainSide): void {
        buf.p2(message.main);
        buf.p2(message.side);
    }
}
