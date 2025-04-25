import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import OpHeldU from '#/network/client/model/game/OpHeldU.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class OpHeldUDecoder extends MessageDecoder<OpHeldU> {
    prot = ClientProt.OPHELDU;

    decode(buf: Packet) {
        const obj = buf.g2();
        const slot = buf.g2();
        const component = buf.g2();
        const useObj = buf.g2();
        const useSlot = buf.g2();
        const useComponent = buf.g2();
        return new OpHeldU(obj, slot, component, useObj, useSlot, useComponent);
    }
}
