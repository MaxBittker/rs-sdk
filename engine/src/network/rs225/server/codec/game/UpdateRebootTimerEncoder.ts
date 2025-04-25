import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateRebootTimer from '#/network/server/model/game/UpdateRebootTimer.js';

export default class UpdateRebootTimerEncoder extends MessageEncoder<UpdateRebootTimer> {
    prot = ServerProt.UPDATE_REBOOT_TIMER;

    encode(buf: Packet, message: UpdateRebootTimer): void {
        buf.p2(message.ticks);
    }
}
