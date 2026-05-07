import { PlayerInfoProt } from '@2004scape/rsbuf';

import WordEnc from '#/cache/wordenc/WordEnc.js';
import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import Packet from '#/io/Packet.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import MessagePublic from '#/network/game/client/model/MessagePublic.js';
import OutgoingMessagePublic from '#/network/game/server/model/MessagePublic.js';
import WordPack from '#/wordenc/WordPack.js';

export default class MessagePublicHandler extends ClientGameMessageHandler<MessagePublic> {
    handle(message: MessagePublic, player: Player): boolean {
        const { colour, effect, input } = message;

        if (player.socialProtect || colour < 0 || colour > 11 || effect < 0 || effect > 2 || input.length > 100) {
            return false;
        }

        if (player.muted_until !== null && player.muted_until > new Date()) {
            // todo: do we still log their attempt to chat?
            return false;
        }

        const buf: Packet = Packet.alloc(0);
        buf.pdata(input, 0, input.length);
        buf.pos = 0;
        const unpack: string = WordPack.unpack(buf, input.length);
        buf.release();

        player.chatColour = colour;
        player.chatEffect = effect;
        player.chatRights = Math.min(player.staffModLevel, 2);
        player.logMessage = unpack;

        const out: Packet = Packet.alloc(0);
        WordPack.pack(out, WordEnc.filter(unpack));
        player.chatMessage = new Uint8Array(out.pos);
        out.pos = 0;
        out.gdata(player.chatMessage, 0, player.chatMessage.length);
        out.release();
        player.masks |= PlayerInfoProt.CHAT;

        // Broadcast chat globally to players outside visual range
        const filtered: string = WordEnc.filter(unpack);
        for (const other of World.playerLoop.all()) {
            if (other.slot === player.slot) {
                continue;
            }
            // Skip players within overhead chat bubble range
            const dx = Math.abs(player.x - other.x);
            const dz = Math.abs(player.z - other.z);
            if (player.level === other.level && dx <= 14 && dz <= 14) {
                continue;
            }
            other.write(new OutgoingMessagePublic(player.username37, filtered));
        }

        player.socialProtect = true;
        return true;
    }
}
