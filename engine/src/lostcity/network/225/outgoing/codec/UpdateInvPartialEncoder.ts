import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import UpdateInvPartial from '#lostcity/network/outgoing/model/UpdateInvPartial.js';

export default class UpdateInvPartialEncoder extends MessageEncoder<UpdateInvPartial> {
    prot = ServerProt.UPDATE_INV_PARTIAL;

    encode(buf: Packet, message: UpdateInvPartial): void {
        const {component, inv} = message;

        buf.p2(component);
        for (const slot of message.slots) {
            const obj = inv.get(slot);

            buf.p1(slot);
            if (obj) {
                buf.p2(obj.id + 1);

                if (obj.count >= 255) {
                    buf.p1(255);
                    buf.p4(obj.count);
                } else {
                    buf.p1(obj.count);
                }
            } else {
                buf.p2(0);
                buf.p1(0);
            }
        }
    }
}