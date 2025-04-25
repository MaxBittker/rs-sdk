import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import DataLocDone from '#/network/server/model/game/DataLocDone.js';

export default class DataLocDoneEncoder extends MessageEncoder<DataLocDone> {
    prot = ServerProt.DATA_LOC_DONE;

    encode(buf: Packet, message: DataLocDone): void {
        buf.p1(message.x);
        buf.p1(message.z);
    }
}
