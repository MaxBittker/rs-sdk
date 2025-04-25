import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import MessagePublic from '#/network/client/model/game/MessagePublic.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class MessagePublicDecoder extends MessageDecoder<MessagePublic> {
    prot = ClientProt.MESSAGE_PUBLIC;

    decode(buf: Packet, length: number) {
        const color = buf.g1();
        const effect = buf.g1();
        const input = buf.data.slice(buf.pos, buf.pos + length - 2);
        buf.pos += length;
        return new MessagePublic(input, color, effect);
    }
}
