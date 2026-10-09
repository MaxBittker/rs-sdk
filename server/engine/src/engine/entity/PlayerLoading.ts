import { playerSaveStore } from '#/engine/market/MarketStore.js';
import InvType from '#/cache/config/InvType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import Player, { getExpByLevel, getLevelByExp } from '#/engine/entity/Player.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import World from '#/engine/World.js';
import Packet from '#/io/Packet.js';
import ClientSocket from '#/server/ClientSocket.js';
import { fromBase37, toBase37 } from '#/util/JString.js';

export class PlayerLoading {
    public static readonly SAV_MAGIC: number = 0x2004;
    public static readonly SAV_VERSION: number = 8;

    static verify(sav: Packet) {
        if (sav.g2() !== PlayerLoading.SAV_MAGIC) {
            return false;
        }

        const version = sav.g2();
        if (version > PlayerLoading.SAV_VERSION) {
            return false;
        }

        sav.pos = sav.data.length - 4;
        const crc = sav.g4s();
        return crc === Packet.getcrc(sav.data, 0, sav.data.length - 4);
    }

    static load(name: string, sav: Packet, client: ClientSocket | null) {
        const hash64 = toBase37(name); // username or email.
        const name37 = toBase37(name); // always username.
        const safeName = fromBase37(name37); // always safe username.
        // Exchange participants use the atomic ledger checkpoint, including after a crash.
        const checkpoint = playerSaveStore()?.saved(safeName);
        if (checkpoint) sav = new Packet(checkpoint);

        const player = client ? new NetworkPlayer(safeName, name37, hash64, client) : new Player(safeName, name37, hash64);

        player.lastConnected = World.currentTick;
        player.lastResponse = World.currentTick;

        if (sav.data.length < 2) {
            for (let i = 0; i < 21; i++) {
                player.stats[i] = 0;
                player.baseLevels[i] = 1;
                player.levels[i] = 1;
            }

            // hitpoints starts at level 10
            player.stats[PlayerStat.HITPOINTS] = getExpByLevel(10);
            player.baseLevels[PlayerStat.HITPOINTS] = 10;
            player.levels[PlayerStat.HITPOINTS] = 10;
            return player;
        }

        if (sav.g2() !== PlayerLoading.SAV_MAGIC) {
            throw new Error('Invalid save file');
        }

        const version = sav.g2();
        if (version > PlayerLoading.SAV_VERSION) {
            throw new Error('Unsupported save version');
        }

        sav.pos = sav.data.length - 4;
        const crc = sav.g4s();
        if (crc != Packet.getcrc(sav.data, 0, sav.data.length - 4)) {
            throw new Error('Incorrect save checksum');
        }

        sav.pos = 4;
        player.x = sav.g2();
        player.z = sav.g2();
        player.level = sav.g1();
        for (let i = 0; i < 7; i++) {
            player.body[i] = sav.g1();
            if (player.body[i] === 255) {
                player.body[i] = -1;
            }
        }
        for (let i = 0; i < 5; i++) {
            player.colors[i] = sav.g1();
        }
        player.gender = sav.g1();
        player.runenergy = sav.g2();
        if (version >= 2) {
            // oops playtime overflow
            player.playtime = sav.g4s();
        } else {
            player.playtime = sav.g2();
        }

        for (let i = 0; i < 21; i++) {
            player.stats[i] = sav.g4s();
            player.baseLevels[i] = getLevelByExp(player.stats[i]);
            player.levels[i] = Math.min(sav.g1(), player.baseLevels[i]);
        }

        const varpCount = sav.g2();
        if (version >= 7) {
            for (let i = 0; i < varpCount; i++) {
                const id = sav.g2();
                player.vars[id] = sav.gVarInt();
            }
        } else {
            for (let i = 0; i < varpCount; i++) {
                player.vars[i] = sav.g4s();
            }
        }

        // rs-sdk: pvp_death_mark was varp 358 until the 289 upgrade gave that id to
        // boardgames_varbit4. That varp is temp-scoped, so 289-era saves never write 358:
        // a value there is a pre-289 death mark. Move it to the varp's new id.
        const pvpDeathMark = VarPlayerType.getId('pvp_death_mark');
        if (pvpDeathMark !== -1 && pvpDeathMark !== 358 && player.vars[358] !== 0 && VarPlayerType.get(358).scope !== VarPlayerType.SCOPE_PERM) {
            player.vars[pvpDeathMark] = player.vars[358];
            player.vars[358] = 0;
        }

        const invCount = sav.g1();
        for (let i = 0; i < invCount; i++) {
            const type = sav.g2();
            const invType = InvType.get(type);
            const size = version >= 5 ? sav.g2() : invType.size;

            const objs = [];
            for (let slot = 0; slot < size; slot++) {
                const id = sav.g2() - 1;
                if (id === -1) {
                    continue;
                }

                let count = sav.g1();
                if (count === 255) {
                    count = sav.g4s();
                }

                objs.push({ slot, id, count });
            }

            if (invType.scope === InvType.SCOPE_PERM) {
                const inv = player.getInventory(type);
                if (inv) {
                    for (const obj of objs) {
                        inv.set(obj.slot, { id: obj.id, count: obj.count });
                    }
                }
            }
        }

        // afk zones
        if (version >= 3) {
            const afkZones: number = sav.g1();
            for (let index: number = 0; index < afkZones; index++) {
                player.afkZones[index] = sav.g4s();
            }
            player.lastAfkZone = sav.g2();
        }

        // chat modes
        if (version >= 4) {
            const packedChatModes = sav.g1();
            player.publicChat = (packedChatModes >> 4) & 0b11;
            player.privateChat = (packedChatModes >> 2) & 0b11;
            player.tradeDuel = packedChatModes & 0b11;
        }

        // last login info
        if (version >= 6) {
            player.lastLoginTime = sav.g8();
        }

        if (version >= 8) {
            const count = sav.g2();
            for (let i = 0; i < count; i++) {
                player.recoveryItems.push({ id: sav.g2(), count: sav.g4s() });
            }
            player.recoverItems();
        }

        player.combatLevel = player.getCombatLevel();

        return player;
    }
}
