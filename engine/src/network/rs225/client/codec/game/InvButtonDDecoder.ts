import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import InvButtonD from '#/network/client/model/game/InvButtonD.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class InvButtonDDecoder extends MessageDecoder<InvButtonD> {
    prot = ClientProt.INV_BUTTOND;

    decode(buf: Packet) {
        const component = buf.g2();
        const slot = buf.g2();
        const targetSlot = buf.g2();
        return new InvButtonD(component, slot, targetSlot);
    }
}
