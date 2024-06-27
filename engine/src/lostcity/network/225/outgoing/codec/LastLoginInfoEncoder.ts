import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import LastLoginInfo from '#lostcity/network/outgoing/model/LastLoginInfo.js';

export default class LastLoginInfoEncoder extends MessageEncoder<LastLoginInfo> {
    prot = ServerProt.LAST_LOGIN_INFO;

    encode(buf: Packet, message: LastLoginInfo): void {
        buf.p4(message.lastLoginIp);
        buf.p2(message.daysSinceLogin);
        buf.p1(message.daysSinceRecoveryChange);
        buf.p2(message.unreadMessageCount);
    }
}