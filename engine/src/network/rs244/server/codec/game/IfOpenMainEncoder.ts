import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfOpenMain from '#/network/server/model/game/IfOpenMain.js';

export default class IfOpenMainEncoder extends MessageEncoder<IfOpenMain> {
    prot = ServerProt.IF_OPENMAIN;

    encode(buf: Packet, message: IfOpenMain): void {
        buf.p2(message.component);
    }
}
