import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import CamShake from '#lostcity/network/outgoing/model/CamShake.js';

export default class CamShakeEncoder extends MessageEncoder<CamShake> {
    prot = ServerProt.CAM_SHAKE;

    encode(buf: Packet, message: CamShake): void {
        buf.p1(message.type); // direction?
        buf.p1(message.jitter);
        buf.p1(message.amplitude);
        buf.p1(message.frequency);
    }
}