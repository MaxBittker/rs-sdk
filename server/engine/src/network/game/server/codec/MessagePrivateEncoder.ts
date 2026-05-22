import WordEnc from '#/cache/wordenc/WordEnc.js';
import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import MessagePrivate from '#/network/game/server/model/MessagePrivate.js';
import WordPack from '#/wordenc/WordPack.js';

export default class MessagePrivateEncoder extends ServerGameMessageEncoder<MessagePrivate> {
    prot = ServerGameProt.MESSAGE_PRIVATE;

    encode(buf: Packet, message: MessagePrivate): void {
        let staffLvl: number = message.staffModLevel;
        if (staffLvl > 3) {
            staffLvl = 3;
        }

        buf.p8(message.from);
        buf.p4(message.messageId);
        buf.p1(staffLvl);
        WordPack.pack(buf, WordEnc.filter(message.msg));
    }
}
