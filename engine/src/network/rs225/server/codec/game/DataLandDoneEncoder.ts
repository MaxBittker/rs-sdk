import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import DataLandDone from '#/network/server/model/game/DataLandDone.js';

export default class DataLandDoneEncoder extends MessageEncoder<DataLandDone> {
    prot = ServerProt.DATA_LAND_DONE;

    encode(buf: Packet, message: DataLandDone): void {
        buf.p1(message.x);
        buf.p1(message.z);
    }
}
