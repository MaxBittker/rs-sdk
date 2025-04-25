import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpNpc from '#/network/client/model/game/OpNpc.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class OpNpcDecoder extends MessageDecoder<OpNpc> {
    constructor(
        readonly prot: ClientProt,
        readonly op: number
    ) {
        super();
    }

    decode(buf: Packet) {
        const nid = buf.g2();
        return new OpNpc(this.op, nid);
    }
}
