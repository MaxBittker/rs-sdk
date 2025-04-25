import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import MessageGame from '#/network/server/model/game/MessageGame.js';

export default class MessageGameEncoder extends MessageEncoder<MessageGame> {
    prot = ServerProt.MESSAGE_GAME;

    encode(buf: Packet, message: MessageGame): void {
        buf.pjstr(message.msg);
    }

    test(message: MessageGame): number {
        return 1 + message.msg.length;
    }
}
