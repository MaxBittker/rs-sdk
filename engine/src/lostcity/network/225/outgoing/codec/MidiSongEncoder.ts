import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import MidiSong from '#lostcity/network/outgoing/model/MidiSong.js';

export default class MidiSongEncoder extends MessageEncoder<MidiSong> {
    prot = ServerProt.MIDI_SONG;

    encode(buf: Packet, message: MidiSong): void {
        buf.pjstr(message.name);
        buf.p4(message.crc);
        buf.p4(message.length);
    }
}