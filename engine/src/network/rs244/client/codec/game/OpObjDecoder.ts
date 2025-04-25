import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpObj from '#/network/client/model/game/OpObj.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class OpObjDecoder extends MessageDecoder<OpObj> {
    constructor(
        readonly prot: ClientProt,
        readonly op: number
    ) {
        super();
    }

    decode(buf: Packet) {
        const x = buf.g2();
        const z = buf.g2();
        const obj = buf.g2();
        return new OpObj(this.op, x, z, obj);
    }
}
