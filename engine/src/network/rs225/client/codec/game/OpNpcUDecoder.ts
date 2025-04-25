import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpNpcU from '#/network/client/model/game/OpNpcU.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class OpNpcUDecoder extends MessageDecoder<OpNpcU> {
    prot = ClientProt.OPNPCU;

    decode(buf: Packet) {
        const nid = buf.g2();
        const useObj = buf.g2();
        const useSlot = buf.g2();
        const useComponent = buf.g2();
        return new OpNpcU(nid, useObj, useSlot, useComponent);
    }
}
