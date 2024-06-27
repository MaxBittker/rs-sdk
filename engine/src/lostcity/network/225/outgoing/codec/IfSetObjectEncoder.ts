import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfSetObject from '#lostcity/network/outgoing/model/IfSetObject.js';

export default class IfSetObjectEncoder extends MessageEncoder<IfSetObject> {
    prot = ServerProt.IF_SETOBJECT;

    encode(buf: Packet, message: IfSetObject): void {
        buf.p2(message.component);
        buf.p2(message.obj);
        buf.p2(message.scale);
    }
}