import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetColour from '#/network/server/model/game/IfSetColour.js';

export default class IfSetColourEncoder extends MessageEncoder<IfSetColour> {
    prot = ServerProt.IF_SETCOLOUR;

    encode(buf: Packet, message: IfSetColour): void {
        buf.p2(message.component);
        buf.p2(message.colour);
    }
}
