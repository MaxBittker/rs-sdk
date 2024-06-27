import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import UpdateIgnoreList from '#lostcity/network/outgoing/model/UpdateIgnoreList.js';

export default class UpdateIgnoreListEncoder extends MessageEncoder<UpdateIgnoreList> {
    prot = ServerProt.UPDATE_IGNORELIST;

    encode(buf: Packet, message: UpdateIgnoreList): void {
        for (const name of message.names) {
            buf.p8(name);
        }
    }
}