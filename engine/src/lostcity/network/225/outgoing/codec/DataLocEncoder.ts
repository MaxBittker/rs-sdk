import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import DataLoc from '#lostcity/network/outgoing/model/DataLoc.js';

export default class DataLocEncoder extends MessageEncoder<DataLoc> {
    prot = ServerProt.DATA_LOC;

    encode(buf: Packet, message: DataLoc): void {
        buf.p1(message.x);
        buf.p1(message.z);
        buf.p2(message.offset);
        buf.p2(message.length);
        buf.pdata(message.data, 0, message.data.length);
    }
}