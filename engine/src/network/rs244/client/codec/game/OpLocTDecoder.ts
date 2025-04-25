import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpLocT from '#/network/client/model/game/OpLocT.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class OpLocTDecoder extends MessageDecoder<OpLocT> {
    prot = ClientProt.OPLOCT;

    decode(buf: Packet) {
        const x = buf.g2();
        const z = buf.g2();
        const loc = buf.g2();
        const spellComponent = buf.g2();
        return new OpLocT(x, z, loc, spellComponent);
    }
}
