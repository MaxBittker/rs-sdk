import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import UpdateIgnoreList from '#/network/game/server/model/UpdateIgnoreList.js';

export default class UpdateIgnoreListEncoder extends ServerGameMessageEncoder<UpdateIgnoreList> {
    prot = ServerGameProt.UPDATE_IGNORELIST;

    encode(buf: Packet, message: UpdateIgnoreList): void {
        for (const name of message.names) {
            buf.p8(name);
        }
    }
}
