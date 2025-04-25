import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import DataLoc from '#/network/server/model/game/DataLoc.js';

export default class DataLocEncoder extends MessageEncoder<DataLoc> {
    prot = ServerProt.DATA_LOC;

    encode(buf: Packet, message: DataLoc): void {
        buf.p1(message.x);
        buf.p1(message.z);
        buf.p2(message.offset);
        buf.p2(message.length);
        buf.pdata(message.data, 0, message.data.length);
    }

    test(message: DataLoc): number {
        return 1 + 1 + 2 + 2 + message.data.length;
    }
}
