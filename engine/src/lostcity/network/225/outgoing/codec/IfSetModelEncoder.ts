import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfSetModel from '#lostcity/network/outgoing/model/IfSetModel.js';

export default class IfSetModelEncoder extends MessageEncoder<IfSetModel> {
    prot = ServerProt.IF_SETMODEL;

    encode(buf: Packet, message: IfSetModel): void {
        buf.p2(message.component);
        buf.p2(message.model);
    }
}