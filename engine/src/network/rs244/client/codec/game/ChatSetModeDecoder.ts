import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import ChatSetMode from '#/network/client/model/game/ChatSetMode.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class ChatSetModeDecoder extends MessageDecoder<ChatSetMode> {
    prot = ClientProt.CHAT_SETMODE;

    decode(buf: Packet) {
        const publicChatSetting = buf.g1();
        const privateChatSetting = buf.g1();
        const tradeChatSetting = buf.g1();

        return new ChatSetMode(publicChatSetting, privateChatSetting, tradeChatSetting);
    }
}
