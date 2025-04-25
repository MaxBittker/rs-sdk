import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateInvStopTransmit from '#/network/server/model/game/UpdateInvStopTransmit.js';

export default class UpdateInvStopTransmitEncoder extends MessageEncoder<UpdateInvStopTransmit> {
    prot = ServerProt.UPDATE_INV_STOP_TRANSMIT;

    encode(buf: Packet, message: UpdateInvStopTransmit): void {
        buf.p2(message.component);
    }
}
