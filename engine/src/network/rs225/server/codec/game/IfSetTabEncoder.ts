import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetTab from '#/network/server/model/game/IfSetTab.js';

export default class IfSetTabEncoder extends MessageEncoder<IfSetTab> {
    prot = ServerProt.IF_SETTAB;

    encode(buf: Packet, message: IfSetTab): void {
        buf.p2(message.component);
        buf.p1(message.tab);
    }
}
