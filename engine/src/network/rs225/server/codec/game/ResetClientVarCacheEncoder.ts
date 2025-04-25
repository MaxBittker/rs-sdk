import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import ResetClientVarCache from '#/network/server/model/game/ResetClientVarCache.js';

export default class ResetClientVarCacheEncoder extends MessageEncoder<ResetClientVarCache> {
    prot = ServerProt.RESET_CLIENT_VARCACHE;

    encode(_: Packet, __: ResetClientVarCache): void {}
}
