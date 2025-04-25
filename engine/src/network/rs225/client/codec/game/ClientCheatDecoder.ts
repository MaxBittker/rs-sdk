import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import ClientCheat from '#/network/client/model/game/ClientCheat.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class ClientCheatDecoder extends MessageDecoder<ClientCheat> {
    prot = ClientProt.CLIENT_CHEAT;

    decode(buf: Packet) {
        const input = buf.gjstr();
        return new ClientCheat(input);
    }
}
