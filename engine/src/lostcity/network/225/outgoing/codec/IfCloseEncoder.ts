import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfClose from '#lostcity/network/outgoing/model/IfClose.js';

export default class IfCloseEncoder extends MessageEncoder<IfClose> {
    prot = ServerProt.IF_CLOSE;

    encode(_: Packet, __: IfClose): void {}
}