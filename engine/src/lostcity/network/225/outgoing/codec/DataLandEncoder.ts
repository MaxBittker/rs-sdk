import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import DataLand from '#lostcity/network/outgoing/model/DataLand.js';

export default class DataLandEncoder extends MessageEncoder<DataLand> {
    prot = ServerProt.DATA_LAND;

    encode(buf: Packet, message: DataLand): void {
        buf.p1(message.x);
        buf.p1(message.z);
        buf.p2(message.offset);
        buf.p2(message.length);
        buf.pdata(message.data, 0, message.data.length);
    }
}