import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class LastLoginInfo extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly lastLoginIp: number,
        readonly daysSinceLogin: number,
        readonly daysSinceRecoveryChange: number,
        readonly unreadMessageCount: number
    ) {
        super();
    }
}
