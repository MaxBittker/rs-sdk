import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import MidiJingle from '#/network/server/model/game/MidiJingle.js';

export default class MidiJingleEncoder extends MessageEncoder<MidiJingle> {
    prot = ServerProt.MIDI_JINGLE;

    encode(buf: Packet, message: MidiJingle): void {
        buf.p2(-1);
        buf.p2(message.delay);
    }

    test(_message: MidiJingle): number {
        return 4;
    }
}
