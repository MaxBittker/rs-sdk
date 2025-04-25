import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateFriendList from '#/network/server/model/game/UpdateFriendList.js';

export default class UpdateFriendListEncoder extends MessageEncoder<UpdateFriendList> {
    prot = ServerProt.UPDATE_FRIENDLIST;

    encode(buf: Packet, message: UpdateFriendList): void {
        buf.p8(message.name);
        buf.p1(message.nodeId);
    }
}
