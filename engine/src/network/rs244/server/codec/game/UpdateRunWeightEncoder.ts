import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateRunWeight from '#/network/server/model/game/UpdateRunWeight.js';

export default class UpdateRunWeightEncoder extends MessageEncoder<UpdateRunWeight> {
    prot = ServerProt.UPDATE_RUNWEIGHT;

    encode(buf: Packet, message: UpdateRunWeight): void {
        buf.p2(message.kg);
    }
}
