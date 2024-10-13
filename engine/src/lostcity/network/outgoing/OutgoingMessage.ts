import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';
import DoublyLinkable from '#jagex2/datastruct/DoublyLinkable.js';

export default abstract class OutgoingMessage extends DoublyLinkable {
    readonly abstract priority: ServerProtPriority;
}