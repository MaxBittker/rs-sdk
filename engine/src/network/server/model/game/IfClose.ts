import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class IfClose extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;
}
