import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import MidiJingle from '#/network/game/server/model/MidiJingle.js';

export default class MidiJingleEncoder extends ServerGameMessageEncoder<MidiJingle> {
    prot = ServerGameProt.MIDI_JINGLE;

    encode(buf: Packet, message: MidiJingle): void {
        buf.p2(message.id);
        buf.p2(message.delay);
    }
}
