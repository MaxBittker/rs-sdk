import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import IfOpenSideOverlay from '#lostcity/network/outgoing/model/IfOpenSideOverlay.js';

export default class IfOpenSideOverlayEncoder extends MessageEncoder<IfOpenSideOverlay> {
    prot = ServerProt.IF_OPENSIDEOVERLAY;

    encode(buf: Packet, message: IfOpenSideOverlay): void {
        buf.p2(message.component);
        buf.p1(message.tab);
    }
}