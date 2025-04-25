import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import NpcInfo from '#/network/server/model/game/NpcInfo.js';

export default class NpcInfoEncoder extends MessageEncoder<NpcInfo> {
    prot = ServerProt.NPC_INFO;

    encode(buf: Packet, message: NpcInfo): void {
        buf.pdata(message.bytes, 0, message.bytes.length);
    }

    test(message: NpcInfo): number {
        return message.bytes.length;
    }
}
