import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import RebuildGetMaps from '#/network/client/model/game/RebuildGetMaps.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class RebuildGetMapsDecoder extends MessageDecoder<RebuildGetMaps> {
    prot = ClientProt.REBUILD_GETMAPS;

    decode(buf: Packet, length: number) {
        const maps = new Int32Array(length / 3);
        for (let i = 0; i < maps.length; i++) {
            maps[i] = buf.g3();
        }
        return new RebuildGetMaps(maps);
    }
}
