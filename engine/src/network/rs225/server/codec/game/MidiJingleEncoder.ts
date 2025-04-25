import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import MidiJingle from '#/network/server/model/game/MidiJingle.js';

export default class MidiJingleEncoder extends MessageEncoder<MidiJingle> {
    prot = ServerProt.MIDI_JINGLE;

    encode(buf: Packet, message: MidiJingle): void {
        buf.p2(message.delay);
        buf.pdata(message.data, 0, message.data.length);
    }

    test(message: MidiJingle): number {
        return 2 + 4 + message.data.length;
    }
}
