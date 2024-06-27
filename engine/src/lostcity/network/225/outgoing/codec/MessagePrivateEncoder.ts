import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import MessagePrivate from '#lostcity/network/outgoing/model/MessagePrivate.js';
import WordPack from '#jagex2/wordenc/WordPack.js';
import WordEnc from '#lostcity/cache/wordenc/WordEnc.js';

export default class MessagePrivateEncoder extends MessageEncoder<MessagePrivate> {
    prot = ServerProt.MESSAGE_PRIVATE;

    encode(buf: Packet, message: MessagePrivate): void {
        buf.p8(message.from);
        buf.p4(message.messageId);
        buf.p1(message.staffModLevel);
        WordPack.pack(buf, WordEnc.filter(message.msg));
    }
}