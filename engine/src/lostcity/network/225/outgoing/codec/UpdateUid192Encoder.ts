import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import UpdateUid192 from '#lostcity/network/outgoing/model/UpdateUid192.js';

export default class UpdateUid192Encoder extends MessageEncoder<UpdateUid192> {
    prot = ServerProt.UPDATE_UID192;

    encode(buf: Packet, message: UpdateUid192): void {
        buf.p2(message.uid);
    }
}