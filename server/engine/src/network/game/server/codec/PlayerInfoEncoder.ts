import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import PlayerInfo from '#/network/game/server/model/PlayerInfo.js';

export default class PlayerInfoEncoder extends ServerGameMessageEncoder<PlayerInfo> {
    prot = ServerGameProt.PLAYER_INFO;

    encode(buf: Packet, message: PlayerInfo): void {
        buf.pdata(message.bytes, 0, message.bytes.length);
    }
}
