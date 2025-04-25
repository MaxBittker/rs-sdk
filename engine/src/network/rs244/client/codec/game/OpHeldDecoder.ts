import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpHeld from '#/network/client/model/game/OpHeld.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class OpHeldDecoder extends MessageDecoder<OpHeld> {
    constructor(
        readonly prot: ClientProt,
        readonly op: number
    ) {
        super();
    }

    decode(buf: Packet) {
        const obj = buf.g2();
        const slot = buf.g2();
        const component = buf.g2();
        return new OpHeld(this.op, obj, slot, component);
    }
}
