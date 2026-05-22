import Packet from '#/io/Packet.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';

export default abstract class ServerGameMessageEncoder<T extends ServerGameMessage> {
    abstract prot: ServerGameProt;

    abstract encode(buf: Packet, message: T): void;
}
