import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import Logout from '#lostcity/network/outgoing/model/Logout.js';

export default class LogoutEncoder extends MessageEncoder<Logout> {
    prot = ServerProt.LOGOUT;

    encode(_: Packet, __: Logout): void {}
}