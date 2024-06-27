import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import UpdateRebootTimer from '#lostcity/network/outgoing/model/UpdateRebootTimer.js';

export default class UpdateRebootTimerEncoder extends MessageEncoder<UpdateRebootTimer> {
    prot = ServerProt.UPDATE_REBOOT_TIMER;

    encode(buf: Packet, message: UpdateRebootTimer): void {
        buf.p2(message.ticks);
    }
}