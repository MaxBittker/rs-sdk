import ZoneProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import Packet from '#jagex2/io/Packet.js';
import ZoneMessage from '#lostcity/network/outgoing/ZoneMessage.js';
import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';

export default abstract class ZoneMessageEncoder<T extends ZoneMessage> extends MessageEncoder<T> {
    abstract prot: ZoneProt;

    enclose(message: T): Uint8Array {
        const buf: Packet = new Packet(new Uint8Array(1 + this.prot.length));
        buf.p1(this.prot.id);
        this.encode(buf, message);
        return buf.data;
    }
}