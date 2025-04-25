import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import IfPlayerDesign from '#/network/client/model/game/IfPlayerDesign.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class IfPlayerDesignDecoder extends MessageDecoder<IfPlayerDesign> {
    prot = ClientProt.IF_PLAYERDESIGN;

    decode(buf: Packet) {
        const gender = buf.g1();

        const idkit: number[] = [];
        for (let i = 0; i < 7; i++) {
            idkit[i] = buf.g1();

            if (idkit[i] === 255) {
                idkit[i] = -1;
            }
        }

        const color: number[] = [];
        for (let i = 0; i < 5; i++) {
            color[i] = buf.g1();
        }

        return new IfPlayerDesign(gender, idkit, color);
    }
}
