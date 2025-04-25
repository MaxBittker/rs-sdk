import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpObjT from '#/network/client/model/game/OpObjT.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class OpObjTDecoder extends MessageDecoder<OpObjT> {
    prot = ClientProt.OPOBJT;

    decode(buf: Packet) {
        const x = buf.g2();
        const z = buf.g2();
        const obj = buf.g2();
        const spellComponent = buf.g2();
        return new OpObjT(x, z, obj, spellComponent);
    }
}
