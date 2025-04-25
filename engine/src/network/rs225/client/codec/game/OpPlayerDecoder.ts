import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpPlayer from '#/network/client/model/game/OpPlayer.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class OpPlayerDecoder extends MessageDecoder<OpPlayer> {
    constructor(
        readonly prot: ClientProt,
        readonly op: number
    ) {
        super();
    }

    decode(buf: Packet) {
        const pid = buf.g2();
        return new OpPlayer(this.op, pid);
    }
}
