import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import UpdateInvStopTransmit from '#lostcity/network/outgoing/model/UpdateInvStopTransmit.js';

export default class UpdateInvStopTransmitEncoder extends MessageEncoder<UpdateInvStopTransmit> {
    prot = ServerProt.UPDATE_INV_STOP_TRANSMIT;

    encode(buf: Packet, message: UpdateInvStopTransmit): void {
        buf.p2(message.component);
    }
}