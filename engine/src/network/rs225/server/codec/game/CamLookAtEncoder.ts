import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import CamLookAt from '#/network/server/model/game/CamLookAt.js';

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
