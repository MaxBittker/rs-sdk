import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import NpcInfo from '#/network/game/server/model/NpcInfo.js';

export default class NpcInfoEncoder extends ServerGameMessageEncoder<NpcInfo> {
    prot = ServerGameProt.NPC_INFO;

    encode(buf: Packet, message: NpcInfo): void {
        buf.pdata(message.bytes, 0, message.bytes.length);
    }
}
