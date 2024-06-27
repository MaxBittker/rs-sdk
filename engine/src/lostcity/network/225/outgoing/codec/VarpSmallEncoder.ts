import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import VarpSmall from '#lostcity/network/outgoing/model/VarpSmall.js';

export default class VarpSmallEncoder extends MessageEncoder<VarpSmall> {
    prot = ServerProt.VARP_SMALL;

    encode(buf: Packet, message: VarpSmall): void {
        buf.p2(message.varp);
        buf.p1(message.value);
    }
}