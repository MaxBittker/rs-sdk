import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateIgnoreList from '#/network/server/model/game/UpdateIgnoreList.js';

export default class UpdateIgnoreListEncoder extends MessageEncoder<UpdateIgnoreList> {
    prot = ServerProt.UPDATE_IGNORELIST;

    encode(buf: Packet, message: UpdateIgnoreList): void {
        for (const name of message.names) {
            buf.p8(name);
        }
    }

    test(message: UpdateIgnoreList): number {
        return 8 * message.names.length;
    }
}
