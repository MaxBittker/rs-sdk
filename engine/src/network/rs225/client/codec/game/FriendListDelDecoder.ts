import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import FriendListDel from '#/network/client/model/game/FriendListDel.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class FriendListDelDecoder extends MessageDecoder<FriendListDel> {
    prot = ClientProt.FRIENDLIST_DEL;

    decode(buf: Packet) {
        const username = buf.g8();
        return new FriendListDel(username);
    }
}
