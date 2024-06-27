import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import DataLandDone from '#lostcity/network/outgoing/model/DataLandDone.js';

export default class DataLandDoneEncoder extends MessageEncoder<DataLandDone> {
    prot = ServerProt.DATA_LAND_DONE;

    encode(buf: Packet, message: DataLandDone): void {
        buf.p1(message.x);
        buf.p1(message.z);
    }
}