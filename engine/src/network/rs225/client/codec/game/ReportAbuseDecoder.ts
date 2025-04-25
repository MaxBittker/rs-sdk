import Packet from '#/io/Packet.js';
import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import ReportAbuse from '#/network/client/model/game/ReportAbuse.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';

export default class ReportAbuseDecoder extends MessageDecoder<ReportAbuse> {
    prot = ClientProt.REPORT_ABUSE;

    decode(buf: Packet) {
        const offender = buf.g8();
        const reason = buf.g1();
        const moderatorMute = buf.gbool();

        return new ReportAbuse(offender, reason, moderatorMute);
    }
}
