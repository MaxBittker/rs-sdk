import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import TutOpen from '#/network/server/model/game/TutOpen.js';

export default class TutOpenEncoder extends MessageEncoder<TutOpen> {
    prot = ServerProt.TUT_OPEN;

    encode(buf: Packet, message: TutOpen): void {
        buf.p2(message.component);
    }
}
