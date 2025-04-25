import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdatePid from '#/network/server/model/game/UpdatePid.js';

export default class UpdatePidEncoder extends MessageEncoder<UpdatePid> {
    prot = ServerProt.UPDATE_PID;

    encode(buf: Packet, message: UpdatePid): void {
        buf.p2(message.uid);
    }
}
