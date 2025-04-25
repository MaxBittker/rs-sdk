import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import UpdateInvPartial from '#/network/server/model/game/UpdateInvPartial.js';

export default class UpdateInvPartialEncoder extends MessageEncoder<UpdateInvPartial> {
    prot = ServerProt.UPDATE_INV_PARTIAL;

    encode(buf: Packet, message: UpdateInvPartial): void {
        const { component, inv } = message;

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

    test(message: UpdateInvPartial): number {
        const { inv } = message;

        let length: number = 0;
        length += 2;
        for (const slot of message.slots) {
            const obj = inv.get(slot);

            length += 1;
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
