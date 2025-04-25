import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import IfClose from '#/network/server/model/game/IfClose.js';

export default class IfCloseEncoder extends MessageEncoder<IfClose> {
    prot = ServerProt.IF_CLOSE;

    encode(_: Packet, __: IfClose): void {}
}
