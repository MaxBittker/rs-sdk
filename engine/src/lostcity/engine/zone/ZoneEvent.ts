import ZoneEventType from '#lostcity/engine/zone/ZoneEventType.js';
import ZoneMessage from '#lostcity/network/outgoing/ZoneMessage.js';

export default class ZoneEvent {
    readonly type: ZoneEventType;
    readonly receiverId: number;
    readonly message: ZoneMessage;

    constructor(type: ZoneEventType, receiverId: number, message: ZoneMessage) {
        this.type = type;
        this.receiverId = receiverId;
        this.message = message;
    }
}
