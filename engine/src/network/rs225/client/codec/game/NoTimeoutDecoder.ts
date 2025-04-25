import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import NoTimeout from '#/network/client/model/game/NoTimeout.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class NoTimeoutDecoder extends MessageDecoder<NoTimeout> {
    prot = ClientProt.NO_TIMEOUT;

    decode() {
        return new NoTimeout();
    }
}
