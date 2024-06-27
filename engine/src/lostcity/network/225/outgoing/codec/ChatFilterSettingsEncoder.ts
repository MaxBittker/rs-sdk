import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import ChatFilterSettings from '#lostcity/network/outgoing/model/ChatFilterSettings.js';

export default class ChatFilterSettingsEncoder extends MessageEncoder<ChatFilterSettings> {
    prot = ServerProt.CHAT_FILTER_SETTINGS;

    encode(buf: Packet, message: ChatFilterSettings): void {
        buf.p1(message.publicChat);
        buf.p1(message.privateChat);
        buf.p1(message.tradeDuel);
    }
}