import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfOpenSide from '#/network/server/model/game/IfOpenSide.js';

export default class IfOpenSideEncoder extends MessageEncoder<IfOpenSide> {
    prot = ServerProt.IF_OPENSIDE;

    encode(buf: Packet, message: IfOpenSide): void {
        buf.p2(message.component);
    }
}
