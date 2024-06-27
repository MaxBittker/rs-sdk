import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';
import Hashable from '#jagex2/datastruct/Hashable.js';

export default abstract class OutgoingMessage extends Hashable {
    readonly abstract priority: ServerProtPriority;
}