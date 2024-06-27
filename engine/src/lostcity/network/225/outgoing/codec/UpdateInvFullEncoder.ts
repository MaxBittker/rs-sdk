import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import UpdateInvFull from '#lostcity/network/outgoing/model/UpdateInvFull.js';
import Component from '#lostcity/cache/config/Component.js';

export default class UpdateInvFullEncoder extends MessageEncoder<UpdateInvFull> {
    prot = ServerProt.UPDATE_INV_FULL;

    encode(buf: Packet, message: UpdateInvFull): void {
        const {component, inv} = message;

        const comType = Component.get(component);
        const size = Math.min(inv.capacity, comType.width * comType.height);

        // todo: size should be the index of the last non-empty slot
        buf.p2(component);
        buf.p1(size);
        for (let slot = 0; slot < size; slot++) {
            const obj = inv.get(slot);

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