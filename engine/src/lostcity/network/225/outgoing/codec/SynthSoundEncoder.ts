import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import SynthSound from '#lostcity/network/outgoing/model/SynthSound.js';

export default class SynthSoundEncoder extends MessageEncoder<SynthSound> {
    prot = ServerProt.SYNTH_SOUND;

    encode(buf: Packet, message: SynthSound): void {
        buf.p2(message.synth);
        buf.p1(message.loops);
        buf.p2(message.delay);
    }
}