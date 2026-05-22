import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import IfSetText from '#/network/game/server/model/IfSetText.js';

export default class IfSetTextEncoder extends ServerGameMessageEncoder<IfSetText> {
    prot = ServerGameProt.IF_SETTEXT;

    encode(buf: Packet, message: IfSetText): void {
        buf.p2(message.component);
        buf.pjstr(message.text);
    }
}
