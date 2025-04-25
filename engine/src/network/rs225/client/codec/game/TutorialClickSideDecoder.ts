import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import TutorialClickSide from '#/network/client/model/game/TutorialClickSide.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class TutorialClickSideDecoder extends MessageDecoder<TutorialClickSide> {
    prot = ClientProt.TUTORIAL_CLICKSIDE;

    decode(buf: Packet) {
        const tab = buf.g1();
        return new TutorialClickSide(tab);
    }
}
