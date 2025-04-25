import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import VarpLarge from '#/network/server/model/game/VarpLarge.js';

export default class VarpLargeEncoder extends MessageEncoder<VarpLarge> {
    prot = ServerProt.VARP_LARGE;

    encode(buf: Packet, message: VarpLarge): void {
        buf.p2(message.varp);
        buf.p4(message.value);
    }
}
