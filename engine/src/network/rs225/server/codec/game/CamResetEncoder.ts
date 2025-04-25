import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import CamReset from '#/network/server/model/game/CamReset.js';

export default class CamResetEncoder extends MessageEncoder<CamReset> {
    prot = ServerProt.CAM_RESET;

    encode(_: Packet, __: CamReset): void {}
}
