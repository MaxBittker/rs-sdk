import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpHeldT from '#/network/client/model/game/OpHeldT.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class OpHeldTDecoder extends MessageDecoder<OpHeldT> {
    prot = ClientProt.OPHELDT;

    decode(buf: Packet) {
        const obj = buf.g2();
        const slot = buf.g2();
        const component = buf.g2();
        const spellComponent = buf.g2();
        return new OpHeldT(obj, slot, component, spellComponent);
    }
}
