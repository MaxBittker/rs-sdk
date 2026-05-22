import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import MinimapToggle from '#/network/game/server/model/MinimapToggle.js';

export default class MinimapToggleEncoder extends ServerGameMessageEncoder<MinimapToggle> {
    prot = ServerGameProt.MINIMAP_TOGGLE;

    encode(buf: Packet, message: MinimapToggle): void {
        // 0 normal
        // 1 disable click
        // 2 blacked out
        buf.p1(message.minimapType);
    }
}
