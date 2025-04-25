import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetHide from '#/network/server/model/game/IfSetHide.js';

export default class IfSetHideEncoder extends MessageEncoder<IfSetHide> {
    prot = ServerProt.IF_SETHIDE;

    encode(buf: Packet, message: IfSetHide): void {
        buf.p2(message.component);
        buf.pbool(message.hidden);
    }
}
