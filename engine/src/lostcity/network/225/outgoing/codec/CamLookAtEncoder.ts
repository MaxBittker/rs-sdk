import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import CamLookAt from '#lostcity/network/outgoing/model/CamLookAt.js';

export default class CamLookAtEncoder extends MessageEncoder<CamLookAt> {
    prot = ServerProt.CAM_LOOKAT;

    encode(buf: Packet, message: CamLookAt): void {
        buf.p1(message.x);
        buf.p1(message.z);
        buf.p2(message.height);
        buf.p1(message.speed);
        buf.p1(message.multiplier);
    }
}