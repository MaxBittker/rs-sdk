import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpPlayerU from '#/network/client/model/game/OpPlayerU.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class OpPlayerUDecoder extends MessageDecoder<OpPlayerU> {
    prot = ClientProt.OPPLAYERU;

    decode(buf: Packet) {
        const pid = buf.g2();
        const useObj = buf.g2();
        const useSlot = buf.g2();
        const useComponent = buf.g2();
        return new OpPlayerU(pid, useObj, useSlot, useComponent);
    }
}
