import Packet from '#/io/Packet.js';
import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import TutFlash from '#/network/server/model/game/TutFlash.js';

export default class TutFlashEncoder extends MessageEncoder<TutFlash> {
    prot = ServerProt.TUT_FLASH;

    encode(buf: Packet, message: TutFlash): void {
        buf.p1(message.tab);
    }
}
