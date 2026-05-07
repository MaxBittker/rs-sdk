import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import MessagePublic from '#/network/game/server/model/MessagePublic.js';
import WordPack from '#/wordenc/WordPack.js';

export default class MessagePublicEncoder extends ServerGameMessageEncoder<MessagePublic> {
    prot = ServerGameProt.MESSAGE_PUBLIC;

    encode(buf: Packet, message: MessagePublic): void {
        buf.p8(message.from);
        WordPack.pack(buf, message.msg);
    }

    test(message: MessagePublic): number {
        return 8 + Math.ceil(message.msg.length / 2) + 1;
    }
}
