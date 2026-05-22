import { CoordGrid } from '#/engine/CoordGrid.js';
import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import UpdateZonePartialEnclosed from '#/network/game/server/model/UpdateZonePartialEnclosed.js';

export default class UpdateZonePartialEnclosedEncoder extends ServerGameMessageEncoder<UpdateZonePartialEnclosed> {
    prot = ServerGameProt.UPDATE_ZONE_PARTIAL_ENCLOSED;

    encode(buf: Packet, message: UpdateZonePartialEnclosed): void {
        buf.p1((message.zoneX << 3) - CoordGrid.zoneOrigin(message.originX));
        buf.p1((message.zoneZ << 3) - CoordGrid.zoneOrigin(message.originZ));
        buf.pdata(message.data, 0, message.data.length);
    }
}
