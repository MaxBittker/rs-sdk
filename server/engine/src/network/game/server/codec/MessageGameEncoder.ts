import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import MessageGame from '#/network/game/server/model/MessageGame.js';

export default class MessageGameEncoder extends ServerGameMessageEncoder<MessageGame> {
    prot = ServerGameProt.MESSAGE_GAME;

    encode(buf: Packet, message: MessageGame): void {
        buf.pjstr(message.msg);
    }
}
