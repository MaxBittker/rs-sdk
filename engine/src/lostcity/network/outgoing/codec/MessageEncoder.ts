import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import Packet from '#jagex2/io/Packet.js';

export default abstract class MessageEncoder<T extends OutgoingMessage> {
    abstract prot: ServerProt;
    abstract encode(buf: Packet, message: T): void;
}