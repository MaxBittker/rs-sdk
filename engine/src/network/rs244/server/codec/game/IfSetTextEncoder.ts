import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetText from '#/network/server/model/game/IfSetText.js';

export default class IfSetTextEncoder extends MessageEncoder<IfSetText> {
    prot = ServerProt.IF_SETTEXT;

    encode(buf: Packet, message: IfSetText): void {
        buf.p2(message.component);
        buf.pjstr(message.text);
    }

    test(message: IfSetText): number {
        return 2 + 1 + message.text.length;
    }
}
