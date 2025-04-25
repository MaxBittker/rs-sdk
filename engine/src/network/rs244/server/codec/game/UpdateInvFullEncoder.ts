import Component from '#/cache/config/Component.js';
import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateInvFull from '#/network/server/model/game/UpdateInvFull.js';

export default class UpdateInvFullEncoder extends MessageEncoder<UpdateInvFull> {
    prot = ServerProt.UPDATE_INV_FULL;

    encode(buf: Packet, message: UpdateInvFull): void {
        const { component, inv } = message;

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

    test(message: UpdateInvFull): number {
        const { component, inv } = message;

        const comType = Component.get(component);
        const size = Math.min(inv.capacity, comType.width * comType.height);

        let length: number = 0;
        length += 3;
        for (let slot = 0; slot < size; slot++) {
            const obj = inv.get(slot);
            if (obj) {
                length += 2;

                if (obj.count >= 255) {
                    length += 5;
                } else {
                    length += 1;
                }
            } else {
                length += 3;
            }
        }
        return length;
    }
}
