import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import ClientCheat from '#/network/client/model/ClientCheat.js';
import Environment from '#/util/Environment.js';
import InvType from '#/cache/config/InvType.js';
import IdkType from '#/cache/config/IdkType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import ObjType from '#/cache/config/ObjType.js';
import World from '#/engine/World.js';
import LocType from '#/cache/config/LocType.js';
import NpcType from '#/cache/config/NpcType.js';
import Component from '#/cache/config/Component.js';
import SeqType from '#/cache/config/SeqType.js';
import SpotanimType from '#/cache/config/SpotanimType.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import { tryParseInt } from '#/util/TryParse.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import { PlayerStat, PlayerStatEnabled, PlayerStatKey } from '#/engine/entity/PlayerStat.js';
import MoveStrategy from '#/engine/entity/MoveStrategy.js';
import LoggerEventType from '#/server/logger/LoggerEventType.js';
import Obj from '#/engine/entity/Obj.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';

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

        if (player.staffModLevel >= 2) {
            player.addSessionLog(LoggerEventType.MODERATOR, 'Ran cheat', cheat);    
        }

        if (!Environment.NODE_PRODUCTION && player.staffModLevel >= 3) {
            // developer commands

            if (cmd[0] === '~') {
                // debugprocs are NOT allowed on live ;)
                const script = ScriptProvider.getByName(`[debugproc,${cmd.slice(1)}]`);
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
                                const name = args.shift() ?? '';
                                params[i] = PlayerStat[name.toUpperCase() as PlayerStatKey];
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

                                params[i] = CoordGrid.packCoord(level, (mx << 6) + lx, (mz << 6) + lz);
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
            } else if (cmd === 'reload' && !Environment.STANDALONE_BUNDLE) {
                World.reload();
            } else if (cmd === 'rebuild' && !Environment.STANDALONE_BUNDLE) {
                player.messageGame('Rebuilding scripts...');
                World.rebuild();
            } else if (cmd === 'fly') {
                if (player.moveStrategy === MoveStrategy.FLY) {
                    player.moveStrategy = MoveStrategy.SMART;
                } else {
                    player.moveStrategy = MoveStrategy.FLY;
                }

                player.messageGame(`Changed move strategy: ${player.moveStrategy === MoveStrategy.FLY ? 'fly' : 'smart'}`);
            } else if (cmd === 'naive') {
                if (player.moveStrategy === MoveStrategy.NAIVE) {
                    player.moveStrategy = MoveStrategy.SMART;
                } else {
                    player.moveStrategy = MoveStrategy.NAIVE;
                }

                player.messageGame(`Naive move strategy: ${player.moveStrategy === MoveStrategy.NAIVE ? 'naive' : 'smart'}`);
            } else if (cmd === 'shutdown') {
                if (args.length < 1) {
                    // ::shutdown <seconds>
                    return false;
                }

                World.rebootTimer(Math.ceil(tryParseInt(args[0], 30) * 1000 / 600));
            } else if (cmd === 'random') {
                player.afkEventReady = true;
            } else if (cmd === 'minme') {
                // like maxme debugproc, but in engine because xp goes down
                for (let i = 0; i < PlayerStatEnabled.length; i++) {
                    if (i === PlayerStat.HITPOINTS) {
                        player.setLevel(i, 10);
                    } else {
                        player.setLevel(i, 1);
                    }
                }
            } else if (cmd === 'objtest') {
                for (let x = player.x - 500; x < player.x + 500; x++) {
                    for (let z = player.z - 500; z < player.z + 500; z++) {
                        // using player.pid will result in individual packets rather than using zone_enclosed
                        World.addObj(new Obj(player.level, x, z, EntityLifeCycle.DESPAWN, 1333, 1), Obj.NO_RECEIVER, 100);
                    }
                }
            } else if (cmd === 'serverdrop') {
                player.terminate();
            }
        }

        if (Environment.NODE_ALLOW_CHEATS || player.staffModLevel >= 2) {
            // admin commands

            if (cmd === 'getcoord') {
                // authentic
                player.messageGame(CoordGrid.formatString(player.level, player.x, player.z, ','));
            } else if (cmd === 'tele') {
                // authentic
                if (args.length < 1) {
                    // ::tele level,mx,mz,lx,lz
                    return false;
                }

                const coord = args[0].split(',');
                if (coord.length !== 5) {
                    return false;
                }

                player.closeModal();

                if (!player.canAccess()) {
                    player.messageGame('Please finish what you are doing first.');
                    return false;
                }

                player.clearInteraction();
                player.unsetMapFlag();

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
            } else if (cmd === 'teleto') {
                if (args.length < 1) {
                    return false;
                }

                // ::teleto <username>
                const other = World.getPlayerByUsername(args[0]);
                if (!other) {
                    player.messageGame(`${args[0]} is not logged in.`);
                    return false;
                }

                player.closeModal();

                if (!player.canAccess()) {
                    player.messageGame('Please finish what you are doing first.');
                    return false;
                }

                player.clearInteraction();
                player.unsetMapFlag();

                player.teleJump(other.x, other.z, other.level);
            } else if (cmd === 'teleother') {
                if (args.length < 1) {
                    return false;
                }

                // ::teleother <username>
                const other = World.getPlayerByUsername(args[0]);
                if (!other) {
                    player.messageGame(`${args[0]} is not logged in.`);
                    return false;
                }

                other.closeModal();

                if (!other.canAccess()) {
                    player.messageGame(`${args[0]} is busy right now.`);
                    return false;
                }

                other.clearInteraction();
                other.unsetMapFlag();

                other.teleJump(player.x, player.z, player.level);
            } else if (cmd === 'setvar') {
                // authentic
                if (args.length < 2) {
                    return false;
                }

                // ::setvar <name> <value>
                const varp = VarPlayerType.getByName(args[0]);
                if (!varp) {
                    return false;
                }

                if (varp.protect) {
                    player.closeModal();

                    if (!player.canAccess()) {
                        player.messageGame('Please finish what you are doing first.');
                        return false;
                    }

                    player.clearInteraction();
                    player.unsetMapFlag();
                }

                const value = Math.max(-0x80000000, Math.min(tryParseInt(args[1], 0), 0x7fffffff));
                player.setVar(varp.id, value);
                player.messageGame('set ' + varp.debugname + ': to ' + value);
            } else if (cmd === 'setvarother') {
                if (args.length < 3) {
                    return false;
                }

                // ::setvarother <username> <name> <value>
                const other = World.getPlayerByUsername(args[0]);
                if (!other) {
                    player.messageGame(`${args[0]} is not logged in.`);
                    return false;
                }

                const varp = VarPlayerType.getByName(args[1]);
                if (!varp) {
                    return false;
                }

                if (varp.protect) {
                    other.closeModal();

                    if (!other.canAccess()) {
                        player.messageGame(`${args[0]} is busy right now.`);
                        return false;
                    }

                    other.clearInteraction();
                    other.unsetMapFlag();
                }

                const value = Math.max(-0x80000000, Math.min(tryParseInt(args[2], 0), 0x7fffffff));
                other.setVar(varp.id, value);
                player.messageGame('set ' + args[1] + ': to ' + value + ' on ' + other.username);
            } else if (cmd === 'getvar') {
                // authentic
                if (args.length < 1) {
                    return false;
                }

                // ::getvar <varp>
                const varp = VarPlayerType.getByName(args[0]);
                if (!varp) {
                    return false;
                }

                const value = player.getVar(varp.id);
                player.messageGame('get ' + varp.debugname + ': ' + value);
            } else if (cmd === 'getvarother') {
                if (args.length < 2) {
                    // ::getvarother <username> <varp>
                    return false;
                }

                const other = World.getPlayerByUsername(args[0]);
                if (!other) {
                    player.messageGame(`${args[0]} is not logged in.`);
                    return false;
                }

                const varp = VarPlayerType.getByName(args[1]);
                if (!varp) {
                    return false;
                }

                const value = player.getVar(varp.id);
                player.messageGame('get ' + varp.debugname + ': ' + value + ' on ' + other.username);
            } else if (cmd === 'setstat') {
                // authentic
                if (args.length < 2) {
                    // ::setstat <name> <level>
                    return false;
                }

                const stat = PlayerStat[args[0].toUpperCase() as PlayerStatKey];
                if (typeof stat === 'undefined') {
                    return false;
                }

                player.setLevel(stat, parseInt(args[1]));
            } else if (cmd === 'advancestat') {
                // authentic
                if (args.length < 1) {
                    // ::advancestat <name> (levels)
                    return false;
                }

                const stat = PlayerStat[args[0].toUpperCase() as PlayerStatKey];
                if (typeof stat === 'undefined') {
                    return false;
                }

                const level = Math.min(99, Math.max(1, tryParseInt(args[1], 1)));
                player.setLevel(stat, player.baseLevels[stat] + level);
            } else if (cmd === 'give') {
                // authentic
                if (args.length < 1) {
                    // ::give <obj> (count)
                    return false;
                }

                const obj = ObjType.getId(args[0]);
                if (obj === -1) {
                    return false;
                }

                const count = Math.max(1, Math.min(tryParseInt(args[1], 1), 0x7fffffff));
                player.invAdd(InvType.INV, obj, count, false);
            } else if (cmd === 'giveother') {
                if (args.length < 2) {
                    // ::giveother <username> <obj> (count)
                    return false;
                }

                const other = World.getPlayerByUsername(args[0]);
                if (!other) {
                    player.messageGame(`${args[0]} is not logged in.`);
                    return false;
                }

                const obj = ObjType.getId(args[1]);
                if (obj === -1) {
                    return false;
                }

                const count = Math.max(1, Math.min(tryParseInt(args[2], 1), 0x7fffffff));
                other.invAdd(InvType.INV, obj, count, false);
            }
            // todo:
            // else if (cmd === 'givecrap') {
            //     // authentic
            // } else if (cmd === 'givemany') {
            //     // authentic
            // }
            else if (cmd === 'ban') {
                if (args.length < 2) {
                    // ::ban <username> <minutes>
                    return false;
                }

                const username = args[0];
                const minutes = Math.max(0, tryParseInt(args[1], 60));

                World.notifyPlayerBan(player.username, username, Date.now() + (minutes * 60 * 1000));

                const other = World.getPlayerByUsername(username);
                if (other) {
                    World.removePlayer(other);
                }
            } else if (cmd === 'kick') {
                if (args.length < 1) {
                    // ::kick <username>
                    return false;
                }

                const username = args[0];

                const other = World.getPlayerByUsername(username);
                if (other) {
                    World.removePlayer(other);
                }
            } else if (cmd === 'mute') {
                if (args.length < 2) {
                    // ::mute <username> <minutes>
                    return false;
                }

                const other = World.getPlayerByUsername(args[0]);
                if (!other) {
                    player.messageGame(`${args[0]} is not logged in.`);
                    return false;
                }

                const minutes = Math.max(0, tryParseInt(args[1], 60));

                other.muted_until = new Date(Date.now() + (minutes * 60 * 1000));
                World.notifyPlayerMute(player.username, other.username, Date.now() + (minutes * 60 * 1000));
            } else if (cmd === 'broadcast') {
                if (args.length < 0) {
                    return false;
                }

                World.broadcastMes(cheat.substring(cmd.length + 1));
            }
        }

        return true;
    }
}
