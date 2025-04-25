import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpLoc from '#/network/client/model/game/OpLoc.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class OpLocDecoder extends MessageDecoder<OpLoc> {
    constructor(
        readonly prot: ClientProt,
        readonly op: number
    ) {
        super();
    }

    decode(buf: Packet) {
        const x = buf.g2();
        const z = buf.g2();
        const loc = buf.g2();
        return new OpLoc(this.op, x, z, loc);
    }
}
