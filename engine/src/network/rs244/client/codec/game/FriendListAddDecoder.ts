import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import FriendListAdd from '#/network/client/model/game/FriendListAdd.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class FriendListAddDecoder extends MessageDecoder<FriendListAdd> {
    prot = ClientProt.FRIENDLIST_ADD;

    decode(buf: Packet) {
        const username = buf.g8();
        return new FriendListAdd(username);
    }
}
