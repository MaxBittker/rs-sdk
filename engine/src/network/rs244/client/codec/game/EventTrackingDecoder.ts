import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import EventTracking from '#/network/client/model/game/EventTracking.js';
import ClientProt from '#/network/rs244/client/prot/ClientProt.js';

export default class EventTrackingDecoder extends MessageDecoder<EventTracking> {
    prot = ClientProt.EVENT_TRACKING;

    decode(buf: Packet, len: number): EventTracking {
        const bytes: Uint8Array = new Uint8Array(len);
        buf.gdata(bytes, 0, len);
        return new EventTracking(bytes);
    }
}
