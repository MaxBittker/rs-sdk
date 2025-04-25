import Packet from '#/io/Packet.js';
import ZoneProt from '#/network/rs244/server/prot/ZoneProt.js';
import ZoneMessageEncoder from '#/network/server/codec/ZoneMessageEncoder.js';
import LocMerge from '#/network/server/model/game/LocMerge.js';

export default class LocMergeEncoder extends ZoneMessageEncoder<LocMerge> {
    prot = ZoneProt.LOC_MERGE;

    encode(buf: Packet, message: LocMerge): void {
        buf.p1(message.coord);
        buf.p1((message.shape << 2) | (message.angle & 0x3));
        buf.p2(message.locId);
        buf.p2(message.startCycle);
        buf.p2(message.endCycle);
        buf.p2(message.pid);
        buf.p1(message.east - message.srcX);
        buf.p1(message.south - message.srcZ);
        buf.p1(message.west - message.srcX);
        buf.p1(message.north - message.srcZ);
    }
}
