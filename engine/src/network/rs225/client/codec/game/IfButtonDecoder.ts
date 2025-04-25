import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import IfButton from '#/network/client/model/game/IfButton.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class IfButtonDecoder extends MessageDecoder<IfButton> {
    prot = ClientProt.IF_BUTTON;

    decode(buf: Packet) {
        const component: number = buf.g2();
        return new IfButton(component);
    }
}
