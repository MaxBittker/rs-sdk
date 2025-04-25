import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UnsetMapFlag from '#/network/server/model/game/UnsetMapFlag.js';

export default class UnsetMapFlagEncoder extends MessageEncoder<UnsetMapFlag> {
    prot = ServerProt.UNSET_MAP_FLAG;

    encode(_: Packet, __: UnsetMapFlag): void {}
}
