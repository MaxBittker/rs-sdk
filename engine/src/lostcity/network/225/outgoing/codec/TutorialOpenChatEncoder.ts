import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import TutorialOpenChat from '#lostcity/network/outgoing/model/TutorialOpenChat.js';

export default class TutorialOpenChatEncoder extends MessageEncoder<TutorialOpenChat> {
    prot = ServerProt.TUTORIAL_OPENCHAT;

    encode(buf: Packet, message: TutorialOpenChat): void {
        buf.p2(message.component);
    }
}