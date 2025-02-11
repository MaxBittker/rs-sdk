import MessageHandler from '#/network/client/handler/MessageHandler.js';
import EventTracking from '#/network/client/model/EventTracking.js';
import Player from '#/engine/entity/Player.js';
import Packet from '#/io/Packet.js';

export enum InputTrackingEventType {
    MOUSEDOWNL = 1,
    MOUSEDOWNR = 2,
    MOUSEUPL = 3,
    MOUSEUPR = 4,
    MOUSEMOVE1 = 5,
    MOUSEMOVE2 = 6,
    MOUSEMOVE3 = 7,
    KEYDOWN = 8,
    KEYUP = 9,
    FOCUS = 10,
    BLUR = 11,
    MOUSEENTER = 12,
    MOUSELEAVE = 13
}

export default class EventTrackingHandler extends MessageHandler<EventTracking> {
    handle(message: EventTracking, player: Player): boolean {
        const bytes: Uint8Array = message.bytes;
        if (bytes.length === 0 || bytes.length > 5000) {
            return false;
        }
        if (!player.input.tracking()) {
            return false;
        }
        const buf: Packet = new Packet(bytes);
        while (buf.available > 0 && player.input.tracking()) {
            const event: number = buf.g1();
            if (event === InputTrackingEventType.MOUSEDOWNL || event === InputTrackingEventType.MOUSEDOWNR) {
                this.onmousedown(player, buf, event);
            } else if (event === InputTrackingEventType.MOUSEUPL || event === InputTrackingEventType.MOUSEUPR) {
                this.onmouseup(player, buf, event);
            } else if (event === InputTrackingEventType.MOUSEMOVE1) {
                this.onmousemove(player, buf, event);
            } else if (event === InputTrackingEventType.MOUSEMOVE2) {
                this.onmousemove(player, buf, event);
            } else if (event === InputTrackingEventType.MOUSEMOVE3) {
                this.onmousemove(player, buf, event);
            } else if (event === InputTrackingEventType.KEYDOWN) {
                this.onkeydown(player, buf, event);
            } else if (event === InputTrackingEventType.KEYUP) {
                this.onkeyup(player, buf, event);
            } else if (event === InputTrackingEventType.FOCUS) {
                this.onfocus(player, buf, event);
            } else if (event === InputTrackingEventType.BLUR) {
                this.onblur(player, buf, event);
            } else if (event === InputTrackingEventType.MOUSEENTER) {
                this.onmouseenter(player, buf, event);
            } else if (event === InputTrackingEventType.MOUSELEAVE) {
                this.onmouseleave(player, buf, event);
            } else {
                break;
            }
        }
        return true;
    }

    onmousedown(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        const pos = buf.g3();
        const posX = pos & 0x3FF;
        const posY = (pos >> 10) & 0x3FF;
        player.input.record(event, delta, posX, posY);
    }

    onmouseup(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        player.input.record(event, delta);
    }

    onmousemove(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        let posX = -1;
        let posY = -1;
        if (event === InputTrackingEventType.MOUSEMOVE1) {
            const pos = buf.g1();
            posX = pos & 0xF;
            posY = (pos >> 4) & 0xFFF;
        } else if (event === InputTrackingEventType.MOUSEMOVE2) {
            posX = buf.g1();
            posY = buf.g1();
        } else if (event === InputTrackingEventType.MOUSEMOVE3) {
            const pos = buf.g3();
            posX = pos & 0x3FF;
            posY = (pos >> 10) & 0x3FF;
        }
        player.input.record(event, delta, posX, posY);
    }

    onkeydown(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        const key = buf.g1();
        player.input.record(event, delta, undefined, undefined, key);
    }

    onkeyup(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        const key = buf.g1();
        player.input.record(event, delta, undefined, undefined, key); 
    }

    onfocus(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        player.input.record(event, delta); 
    }

    onblur(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        player.input.record(event, delta); 
    }

    onmouseenter(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        player.input.record(event, delta); 
    }

    onmouseleave(player: Player, buf: Packet, event: InputTrackingEventType): void {
        const delta = buf.g1();
        player.input.record(event, delta); 
    }
}