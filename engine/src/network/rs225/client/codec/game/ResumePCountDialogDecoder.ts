import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import ResumePCountDialog from '#/network/client/model/game/ResumePCountDialog.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class ResumePCountDialogDecoder extends MessageDecoder<ResumePCountDialog> {
    prot = ClientProt.RESUME_P_COUNTDIALOG;

    decode(buf: Packet) {
        const input = buf.g4();
        return new ResumePCountDialog(input);
    }
}
