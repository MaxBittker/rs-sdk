import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpNpcT from '#/network/client/model/game/OpNpcT.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class OpNpcTDecoder extends MessageDecoder<OpNpcT> {
    prot = ClientProt.OPNPCT;

    decode(buf: Packet) {
        const nid = buf.g2();
        const spellComponent = buf.g2();
        return new OpNpcT(nid, spellComponent);
    }
}
