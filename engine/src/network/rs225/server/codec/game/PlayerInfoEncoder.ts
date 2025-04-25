import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import PlayerInfo from '#/network/server/model/game/PlayerInfo.js';

export default class PlayerInfoEncoder extends MessageEncoder<PlayerInfo> {
    prot = ServerProt.PLAYER_INFO;

    encode(buf: Packet, message: PlayerInfo): void {
        buf.pdata(message.bytes, 0, message.bytes.length);
    }

    test(message: PlayerInfo): number {
        return message.bytes.length;
    }
}
