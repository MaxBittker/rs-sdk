import MessageHandler from '#lostcity/network/incoming/handler/MessageHandler.js';
import Player from '#lostcity/entity/Player.js';
import ClientCheat from '#lostcity/network/incoming/model/ClientCheat.js';
import Environment from '#lostcity/util/Environment.js';
import InvType from '#lostcity/cache/config/InvType.js';
import IdkType from '#lostcity/cache/config/IdkType.js';
import VarPlayerType from '#lostcity/cache/config/VarPlayerType.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import World from '#lostcity/engine/World.js';
import LocType from '#lostcity/cache/config/LocType.js';
import NpcType from '#lostcity/cache/config/NpcType.js';
import Component from '#lostcity/cache/config/Component.js';
import SeqType from '#lostcity/cache/config/SeqType.js';
import SpotanimType from '#lostcity/cache/config/SpotanimType.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import { CollisionFlag, findPath, isFlagged } from '@2004scape/rsmod-pathfinder';
import { NetworkPlayer } from '#lostcity/entity/NetworkPlayer.js';
import { toBase37 } from '#jagex2/jstring/JString.js';
import NullClientSocket from '#lostcity/server/NullClientSocket.js';
import { tryParseInt } from '#lostcity/util/TryParse.js';
import ScriptVarType from '#lostcity/cache/config/ScriptVarType.js';
import { Position } from '#lostcity/entity/Position.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import PlayerStat from '#lostcity/entity/PlayerStat.js';

export default class ClientCheatHandler extends MessageHandler<ClientCheat> {
    handle(message: ClientCheat, player: Player): boolean {
        if (message.input.length > 80) {
            return false;
        }

        const { input: cheat } = message;

        const args: string[] = cheat.toLowerCase().split(' ');
        const cmd: string | undefined = args.shift();
        if (cmd === undefined || cmd.length <= 0) {
            return false;
        }

        player.playerLog('Cheat ran', cheat);

        // authentic
        if (cmd === 'advancestat') {
            // todo find a real usage to see if we have it right
            if (args.length < 1) {
                return false;
            }

            // ::advancestat <name> (levels)
            const stat = Player.SKILLS.indexOf(args[0]);
            const level = Math.min(99, Math.max(1, tryParseInt(args[1], 1)));

            if (stat === -1) {
                return false;
            }

            player.setLevel(stat, player.baseLevels[stat] + level);
        } else if (cmd === 'getcoord') {
            // todo find a real usage to see if we have it right
            player.messageGame(Position.formatString(player.level, player.x, player.z, '_'));
        } else if (cmd === 'getvar') {
            // todo find a real usage to see if we have it right
            if (args.length < 1) {
                return false;
            }

            // ::getvar <name>
            const varp = VarPlayerType.getId(args[0]);

            if (varp === -1) {
                return false;
            }

            const value = player.getVar(varp);
            player.messageGame('get ' + args[0] + ': ' + value);
        } else if (cmd === 'give') {
            if (args.length < 1) {
                return false;
            }

            // ::give <obj> (id)
            const obj = ObjType.getId(args[0]);
            const count = Math.max(1, Math.min(tryParseInt(args[1], 1), 0x7fffffff));

            if (obj === -1) {
                return false;
            }

            player.invAdd(InvType.INV, obj, count, false);
        } else if (cmd === 'givecrap') {
            // todo find a real usage to be able to write this
        } else if (cmd === 'givemany') {
            // todo find a real usage to be able to write this
        } else if (cmd === 'setstat') {
            if (args.length < 2) {
                return false;
            }

            // ::setstat <name> <level>
            const stat = Player.SKILLS.indexOf(args[0]);
            if (stat === -1) {
                return false;
            }

            player.setLevel(stat, parseInt(args[1]));
        } else if (cmd === 'setvar') {
            if (args.length < 2) {
                return false;
            }

            // ::setvar <name> <value>
            const varp = VarPlayerType.getId(args[0]);
            const value = Math.max(-0x80000000, Math.min(tryParseInt(args[1], 0), 0x7fffffff));

            if (varp === -1) {
                return false;
            }

            player.setVar(varp, value);
            player.messageGame('set ' + args[0] + ': to ' + value);
        } else if (cmd === 'tele') {
            if (args.length < 1) {
                return false;
            }

            // ::tele level,x,z,x,z
            // ::tele up
            // ::tele down

            if (args[0] === 'up') {
                player.teleJump(player.x, player.z, player.level + 1);
                player.messageGame('::tele ' + Position.formatString(player.level, player.x, player.z, ','));
            } else if (args[0] === 'down') {
                player.teleJump(player.x, player.z, player.level - 1);
                player.messageGame('::tele ' + Position.formatString(player.level, player.x, player.z, ','));
            } else if (args[0].indexOf(',') === -1) {
                // not authentic but rsps users are used to absolute coordinates
                player.teleJump(tryParseInt(args[0], 3200), tryParseInt(args[1], 3200), tryParseInt(args[2], player.level));
            } else {
                const coord = args[0].split(',');
                if (coord.length !== 5) {
                    return false;
                }

                const level = tryParseInt(coord[0], 0);
                const mx = tryParseInt(coord[1], 50);
                const mz = tryParseInt(coord[2], 50);
                const lx = tryParseInt(coord[3], 0);
                const lz = tryParseInt(coord[4], 0);

                if (level < 0 || level > 3 ||
                    mx < 0 || mx > 255 ||
                    mz < 0 || mz > 255 ||
                    lx < 0 || lx > 63 ||
                    lz < 0 || lz > 63
                ) {
                    return false;
                }

                player.teleJump((mx << 6) + lx, (mz << 6) + lz, level);
            }
        }
        // custom
        else if (cmd === 'reload' && Environment.LOCAL_DEV) {
            World.reload();

            // todo: we're probably reloading twice now, just to get count?
            const count = ScriptProvider.load('data/pack');
            player.messageGame(`Reloaded ${count} scripts.`);
        } else if (cmd === 'rebuild' && Environment.LOCAL_DEV) {
            World.devThread!.postMessage({
                type: 'pack'
            });
        } else if (cmd === 'setxp') {
            if (args.length < 2) {
                player.messageGame('Usage: ::setxp <stat> <xp>');
                return false;
            }

            const stat = Player.SKILLS.indexOf(args[0]);
            if (stat === -1) {
                player.messageGame(`Unknown stat ${args[0]}`);
                return false;
            }

            const exp = parseInt(args[1]) * 10;
            player.stats[stat] = exp;
        } else if (cmd === 'minlevel') {
            for (let i = 0; i < Player.SKILLS.length; i++) {
                if (i === PlayerStat.HITPOINTS) {
                    player.setLevel(i, 10);
                } else {
                    player.setLevel(i, 1);
                }
            }
        } else if (cmd === 'serverdrop') {
            player.terminate();
        } else if (cmd === 'random') {
            player.afkEventReady = true;
        } else if (cmd === 'bench' && player.staffModLevel >= 3) {
            const start = Date.now();
            for (let index = 0; index < 100_000; index++) {
                findPath(player.level, player.x, player.z, player.x, player.z + 10);
            }
            const end = Date.now();
            console.log(`took = ${end - start} ms`);
        } else if (cmd === 'bots' && player.staffModLevel >= 3) {
            player.messageGame('Adding bots');
            for (let i = 0; i < 2000; i++) {
                const bot = new NetworkPlayer(`bot${i}`, toBase37(`bot${i}`), new NullClientSocket());
                bot.onLogin();
                World.addPlayer(bot);
            }
        } else if (cmd === 'teleall' && player.staffModLevel >= 3) {
            player.messageGame('Teleporting all players');
            for (const player of World.players) {
                player.closeModal();

                do {
                    const x = Math.floor(Math.random() * 640) + 3200;
                    const z = Math.floor(Math.random() * 640) + 3200;

                    player.teleport(x + Math.floor(Math.random() * 64) - 32, z + Math.floor(Math.random() * 64) - 32, 0);
                } while (isFlagged(player.x, player.z, player.level, CollisionFlag.WALK_BLOCKED));
            }
        } else if (cmd === 'moveall' && player.staffModLevel >= 3) {
            player.messageGame('Moving all players');
            console.time('moveall');
            for (const player of World.players) {
                player.closeModal();
                player.queueWaypoints(findPath(player.level, player.x, player.z, ((player.x >>> 6) << 6) + 32, ((player.z >>> 6) << 6) + 32));
            }
            console.timeEnd('moveall');
        } else if (cmd === 'speed' && player.staffModLevel >= 3) {
            if (args.length < 1) {
                player.messageGame('Usage: ::speed <ms>');
                return false;
            }

            const speed: number = tryParseInt(args.shift(), 20);
            if (speed < 20) {
                player.messageGame('::speed input was too low.');
                return false;
            }

            player.messageGame(`World speed was changed to ${speed}ms`);
            World.tickRate = speed;
        }

        // lookup debugproc with the name and execute it
        const script = ScriptProvider.getByName(`[debugproc,${cmd}]`);
        if (!script) {
            return false;
        }

        const params = new Array(script.info.parameterTypes.length).fill(-1);

        for (let i = 0; i < script.info.parameterTypes.length; i++) {
            const type = script.info.parameterTypes[i];

            try {
                switch (type) {
                    case ScriptVarType.STRING: {
                        const value = args.shift();
                        params[i] = value ?? '';
                        break;
                    }
                    case ScriptVarType.INT: {
                        const value = args.shift();
                        params[i] = parseInt(value ?? '0', 10) | 0;
                        break;
                    }
                    case ScriptVarType.OBJ:
                    case ScriptVarType.NAMEDOBJ: {
                        const name = args.shift();
                        params[i] = ObjType.getId(name ?? '');
                        break;
                    }
                    case ScriptVarType.NPC: {
                        const name = args.shift();
                        params[i] = NpcType.getId(name ?? '');
                        break;
                    }
                    case ScriptVarType.LOC: {
                        const name = args.shift();
                        params[i] = LocType.getId(name ?? '');
                        break;
                    }
                    case ScriptVarType.SEQ: {
                        const name = args.shift();
                        params[i] = SeqType.getId(name ?? '');
                        break;
                    }
                    case ScriptVarType.STAT: {
                        const name = args.shift();
                        params[i] = Player.SKILLS.indexOf(name ?? '');
                        break;
                    }
                    case ScriptVarType.INV: {
                        const name = args.shift();
                        params[i] = InvType.getId(name ?? '');
                        break;
                    }
                    case ScriptVarType.COORD: {
                        const args2 = cheat.split('_');

                        const level = parseInt(args2[0].slice(6));
                        const mx = parseInt(args2[1]);
                        const mz = parseInt(args2[2]);
                        const lx = parseInt(args2[3]);
                        const lz = parseInt(args2[4]);

                        params[i] = Position.packCoord(level, (mx << 6) + lx, (mz << 6) + lz);
                        break;
                    }
                    case ScriptVarType.INTERFACE: {
                        const name = args.shift();
                        params[i] = Component.getId(name ?? '');
                        break;
                    }
                    case ScriptVarType.SPOTANIM: {
                        const name = args.shift();
                        params[i] = SpotanimType.getId(name ?? '');
                        break;
                    }
                    case ScriptVarType.IDKIT: {
                        const name = args.shift();
                        params[i] = IdkType.getId(name ?? '');
                        break;
                    }
                }
            } catch (err) {
                return false;
            }
        }

        player.executeScript(ScriptRunner.init(script, player, null, params), false);
        return true;
    }
}
