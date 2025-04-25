import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import LastLoginInfo from '#/network/server/model/game/LastLoginInfo.js';

export default class LastLoginInfoEncoder extends MessageEncoder<LastLoginInfo> {
    prot = ServerProt.LAST_LOGIN_INFO;

    encode(buf: Packet, message: LastLoginInfo): void {
        buf.p4(message.lastLoginIp);
        buf.p2(message.daysSinceLogin);
        buf.p1(message.daysSinceRecoveryChange);
        buf.p2(message.unreadMessageCount);
    }
}
