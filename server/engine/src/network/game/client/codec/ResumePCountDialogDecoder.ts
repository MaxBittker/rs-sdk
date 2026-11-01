import Packet from '#/io/Packet.js';
import ClientGameMessageDecoder from '#/network/game/client/ClientGameMessageDecoder.js';
import ClientGameProt from '#/network/game/client/ClientGameProt.js';
import ResumePCountDialog from '#/network/game/client/model/ResumePCountDialog.js';

export default class ResumePCountDialogDecoder extends ClientGameMessageDecoder<ResumePCountDialog> {
    prot = ClientGameProt.RESUME_P_COUNTDIALOG;

    decode(buf: Packet) {
        const input = buf.g4s();

        return new ResumePCountDialog(Math.max(0, input));
    }
}
