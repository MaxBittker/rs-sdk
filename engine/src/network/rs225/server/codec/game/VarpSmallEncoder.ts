import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import VarpSmall from '#/network/server/model/game/VarpSmall.js';

export default class VarpSmallEncoder extends MessageEncoder<VarpSmall> {
    prot = ServerProt.VARP_SMALL;

    encode(buf: Packet, message: VarpSmall): void {
        buf.p2(message.varp);
        buf.p1(message.value);
    }
}
