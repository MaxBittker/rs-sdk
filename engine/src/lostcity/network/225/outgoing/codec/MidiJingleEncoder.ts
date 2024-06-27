import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import MidiJingle from '#lostcity/network/outgoing/model/MidiJingle.js';

export default class MidiJingleEncoder extends MessageEncoder<MidiJingle> {
    prot = ServerProt.MIDI_JINGLE;

    encode(buf: Packet, message: MidiJingle): void {
        buf.p2(message.delay);
        buf.p4(message.data.length);
        buf.pdata(message.data, 0, message.data.length);
    }
}