import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfSetPlayerHead from '#/network/server/model/game/IfSetPlayerHead.js';

export default class IfSetPlayerHeadEncoder extends MessageEncoder<IfSetPlayerHead> {
    prot = ServerProt.IF_SETPLAYERHEAD;

    encode(buf: Packet, message: IfSetPlayerHead): void {
        buf.p2(message.component);
    }
}
