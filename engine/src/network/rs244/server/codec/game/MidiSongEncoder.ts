import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs244/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import MidiSong from '#/network/server/model/game/MidiSong.js';

export default class MidiSongEncoder extends MessageEncoder<MidiSong> {
    prot = ServerProt.MIDI_SONG;

    encode(buf: Packet, _message: MidiSong): void {
        buf.p2(-1);
    }

    test(_message: MidiSong): number {
        return 2;
    }
}
