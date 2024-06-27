import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import TutorialFlashSide from '#lostcity/network/outgoing/model/TutorialFlashSide.js';

export default class TutorialFlashSideEncoder extends MessageEncoder<TutorialFlashSide> {
    prot = ServerProt.TUTORIAL_FLASHSIDE;

    encode(buf: Packet, message: TutorialFlashSide): void {
        buf.p1(message.tab);
    }
}