import 'dotenv/config';
import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';
import { fromBase37, toBase37, toDisplayName } from '#jagex2/jstring/JString.js';

import { CollisionFlag } from '@2004scape/rsmod-pathfinder';

import CategoryType from '#lostcity/cache/CategoryType.js';
import FontType from '#lostcity/cache/FontType.js';
import DbRowType from '#lostcity/cache/DbRowType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import EnumType from '#lostcity/cache/EnumType.js';
import HuntType from '#lostcity/cache/HuntType.js';
import Component from '#lostcity/cache/Component.js';
import InvType from '#lostcity/cache/InvType.js';
import LocType from '#lostcity/cache/LocType.js';
import MesanimType from '#lostcity/cache/MesanimType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import ParamType from '#lostcity/cache/ParamType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';
import SeqType from '#lostcity/cache/SeqType.js';
import StructType from '#lostcity/cache/StructType.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';

import BlockWalk from '#lostcity/entity/BlockWalk.js';
import Entity from '#lostcity/entity/Entity.js';
import { EntityTimer, PlayerTimerType } from '#lostcity/entity/EntityTimer.js';
import { EntityQueueRequest, PlayerQueueType, QueueType, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Loc from '#lostcity/entity/Loc.js';
import Npc from '#lostcity/entity/Npc.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import Obj from '#lostcity/entity/Obj.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import { Position } from '#lostcity/entity/Position.js';

import { ClientProt, ClientProtLengths } from '#lostcity/server/ClientProt.js';
import ClientSocket from '#lostcity/server/ClientSocket.js';
import { ServerProt, ServerProtEncoders, ServerProtLengths } from '#lostcity/server/ServerProt.js';

import { Inventory } from '#lostcity/engine/Inventory.js';
import World from '#lostcity/engine/World.js';

import Script from '#lostcity/engine/script/Script.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import IdkType from '#lostcity/cache/IdkType.js';
import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';

import Environment from '#lostcity/util/Environment.js';
import WordEnc from '#lostcity/cache/WordEnc.js';
import WordPack from '#jagex2/wordenc/WordPack.js';
import SpotanimType from '#lostcity/cache/SpotanimType.js';

const levelExperience = new Int32Array(99);

let acc = 0;
for (let i = 0; i < 99; i++) {
    const level = i + 1;
    const delta = Math.floor(level + Math.pow(2.0, level / 7.0) * 300.0);
    acc += delta;
    levelExperience[i] = Math.floor(acc / 4) * 10;
}

function getLevelByExp(exp: number) {
    for (let i = 98; i >= 0; i--) {
        if (exp >= levelExperience[i]) {
            return Math.min(i + 2, 99);
        }
    }

    return 1;
}

function getExpByLevel(level: number) {
    return levelExperience[level - 2];
}

const PRELOADED = new Map<string, Uint8Array>();
const PRELOADED_CRC = new Map<string, number>();

if (!Environment.CI_MODE) {
    console.log('Preloading client data');
    console.time('Preloaded client data');
    if (!fs.existsSync('data/pack/client') || !fs.existsSync('data/pack/client/maps')) {
        console.log('Please build the client cache with client:pack!');
        process.exit(1);
    }

    const allMaps = fs.readdirSync('data/pack/client/maps');
    for (let i = 0; i < allMaps.length; i++) {
        const name = allMaps[i];

        const map = fs.readFileSync(`data/pack/client/maps/${name}`);
        const crc = Packet.crc32(map);

        PRELOADED.set(name, map);
        PRELOADED_CRC.set(name, crc);
    }

    const allSongs = fs.readdirSync('data/pack/client/songs');
    for (let i = 0; i < allSongs.length; i++) {
        const name = allSongs[i];

        const song = fs.readFileSync(`data/pack/client/songs/${name}`);
        const crc = Packet.crc32(song);

        PRELOADED.set(name, song);
        PRELOADED_CRC.set(name, crc);
    }

    const allJingles = fs.readdirSync('data/pack/client/jingles');
    for (let i = 0; i < allJingles.length; i++) {
        const name = allJingles[i];

        // Strip off bzip header.
        const jingle = fs.readFileSync(`data/pack/client/jingles/${name}`).subarray(4);
        const crc = Packet.crc32(jingle);

        PRELOADED.set(name, jingle);
        PRELOADED_CRC.set(name, crc);
    }
    console.timeEnd('Preloaded client data');
}

export default class Player extends PathingEntity {
    static APPEARANCE = 0x1;
    static ANIM = 0x2;
    static FACE_ENTITY = 0x4;
    static SAY = 0x8;
    static DAMAGE = 0x10;
    static FACE_COORD = 0x20;
    static CHAT = 0x40;
    static SPOTANIM = 0x100;
    static EXACT_MOVE = 0x200;

    static ATTACK = 0;
    static DEFENCE = 1;
    static STRENGTH = 2;
    static HITPOINTS = 3;
    static RANGED = 4;
    static PRAYER = 5;
    static MAGIC = 6;
    static COOKING = 7;
    static WOODCUTTING = 8;
    static FLETCHING = 9;
    static FISHING = 10;
    static FIREMAKING = 11;
    static CRAFTING = 12;
    static SMITHING = 13;
    static MINING = 14;
    static HERBLORE = 15;
    static AGILITY = 16;
    static THIEVING = 17;
    static RUNECRAFT = 20;

    static SKILLS = [
        'attack',
        'defence',
        'strength',
        'hitpoints',
        'ranged',
        'prayer',
        'magic',
        'cooking',
        'woodcutting',
        'fletching',
        'fishing',
        'firemaking',
        'crafting',
        'smithing',
        'mining',
        'herblore',
        'agility',
        'thieving',
        'stat18',
        'stat19',
        'runecraft'
    ];

    static DESIGN_BODY_COLORS: number[][] = [
        [6798, 107, 10283, 16, 4797, 7744, 5799, 4634, 33697, 22433, 2983, 54193],
        [8741, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003, 25239],
        [25238, 8742, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003],
        [4626, 11146, 6439, 12, 4758, 10270],
        [4550, 4537, 5681, 5673, 5790, 6806, 8076, 4574]
    ];

    static loadFromFile(name: string) {
        const name37 = toBase37(name);
        const safeName = fromBase37(name37);

        let save = new Packet();
        if (fs.existsSync(`data/players/${safeName}.sav`)) {
            save = Packet.load(`data/players/${safeName}.sav`);
        }

        return Player.load(name, save);
    }

    static load(name: string, sav: Packet) {
        const name37 = toBase37(name);
        const safeName = fromBase37(name37);

        const player = new Player(safeName, name37);

        if (sav.length < 2) {
            for (let i = 0; i < 21; i++) {
                player.stats[i] = 0;
                player.baseLevels[i] = 1;
                player.levels[i] = 1;
            }

            // hitpoints starts at level 10
            player.stats[Player.HITPOINTS] = getExpByLevel(10);
            player.baseLevels[Player.HITPOINTS] = 10;
            player.levels[Player.HITPOINTS] = 10;
            return player;
        }

        if (sav.g2() !== 0x2004) {
            throw new Error('Invalid player save');
        }

        const version = sav.g2();
        if (version > 2) {
            throw new Error('Unsupported player save format');
        }

        sav.pos = sav.length - 4;
        const crc = sav.g4s();
        if (crc != Packet.crc32(sav, sav.length - 4)) {
            throw new Error('Player save corrupted');
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
            player.playtime = sav.g4();
        } else {
            player.playtime = sav.g2();
        }

        for (let i = 0; i < 21; i++) {
            player.stats[i] = sav.g4();
            player.baseLevels[i] = getLevelByExp(player.stats[i]);
            player.levels[i] = sav.g1();
        }

        const varpCount = sav.g2();
        for (let i = 0; i < varpCount; i++) {
            player.varps[i] = sav.g4();
        }

        const invCount = sav.g1();
        for (let i = 0; i < invCount; i++) {
            const type = sav.g2();

            const inv = player.getInventory(type);
            if (inv) {
                for (let j = 0; j < inv.capacity; j++) {
                    const id = sav.g2();
                    if (id === 0) {
                        continue;
                    }

                    let count = sav.g1();
                    if (count === 255) {
                        count = sav.g4();
                    }

                    inv.set(j, {
                        id: id - 1,
                        count
                    });
                }
            }
        }

        player.combatLevel = player.getCombatLevel();
        player.lastResponse = World.currentTick;
        return player;
    }

    save() {
        const sav = new Packet();
        sav.p2(0x2004); // magic
        sav.p2(2); // version

        sav.p2(this.x);
        sav.p2(this.z);
        sav.p1(this.level);
        for (let i = 0; i < 7; i++) {
            sav.p1(this.body[i]);
        }
        for (let i = 0; i < 5; i++) {
            sav.p1(this.colors[i]);
        }
        sav.p1(this.gender);
        sav.p2(this.runenergy);
        sav.p4(this.playtime);

        for (let i = 0; i < 21; i++) {
            sav.p4(this.stats[i]);
            sav.p1(this.levels[i]);
        }

        sav.p2(this.varps.length);
        for (let i = 0; i < this.varps.length; i++) {
            const type = VarPlayerType.get(i);

            if (type.scope === VarPlayerType.SCOPE_PERM) {
                sav.p4(this.varps[i]);
            } else {
                sav.p4(0);
            }
        }

        let invCount = 0;
        const invStartPos = sav.pos;
        sav.p1(0); // placeholder for saved inventory count
        for (const [typeId, inventory] of this.invs) {
            const invType = InvType.get(typeId);
            if (invType.scope !== InvType.SCOPE_PERM) {
                continue;
            }

            sav.p2(typeId);
            for (let slot = 0; slot < inventory.capacity; slot++) {
                const obj = inventory.get(slot);
                if (!obj) {
                    sav.p2(0);
                    continue;
                }

                sav.p2(obj.id + 1);
                if (obj.count >= 255) {
                    sav.p1(255);
                    sav.p4(obj.count);
                } else {
                    sav.p1(obj.count);
                }
            }
            invCount++;
        }
        // set the total saved inv count as the placeholder
        sav.data[invStartPos] = invCount;

        sav.p4(Packet.crc32(sav));
        const safeName = fromBase37(this.username37);
        sav.save(`data/players/${safeName}.sav`);
        return sav;
    }

    // constructor properties
    username: string;
    username37: bigint;
    displayName: string;
    body: number[];
    colors: number[];
    gender: number;
    runenergy: number = 10000;
    lastRunEnergy: number = -1;
    runweight: number;
    playtime: number;
    stats: Int32Array = new Int32Array(21);
    levels: Uint8Array = new Uint8Array(21);
    varps: Int32Array;
    invs: Map<number, Inventory> = new Map<number, Inventory>();

    // runtime variables
    pid: number = -1;
    uid: number = -1;
    lowMemory: boolean = false;
    webClient: boolean = false;
    combatLevel: number = 3;
    headicons: number = 0;
    appearance: Packet | null = null; // cached appearance
    baseLevels = new Uint8Array(21);
    lastStats: Int32Array = new Int32Array(21); // we track this so we know to flush stats only once a tick on changes
    lastLevels: Uint8Array = new Uint8Array(21); // we track this so we know to flush stats only once a tick on changes
    // build area
    loadedX: number = -1;
    loadedZ: number = -1;
    loadedZones: Record<number, number> = {};
    npcs: Set<number> = new Set(); // observed npcs
    players: Set<number> = new Set(); // observed players
    lastMovement: number = 0; // for p_arrivedelay
    basReadyAnim: number = -1;
    basTurnOnSpot: number = -1;
    basWalkForward: number = -1;
    basWalkBackward: number = -1;
    basWalkLeft: number = -1;
    basWalkRight: number = -1;
    basRunning: number = -1;
    logoutRequested: boolean = false;
    invListeners: {
        type: number; // InvType
        com: number; // Component
        source: number; // uid or -1 for world
        firstSeen: boolean;
    }[] = [];
    allowDesign: boolean = false;
    afkEventReady: boolean = false;

    client: ClientSocket | null = null;
    netOut: Packet[] = [];
    lastResponse = -1;

    mask: number = 0;
    animId: number = -1;
    animDelay: number = -1;
    faceEntity: number = -1;
    alreadyFacedCoord: boolean = false;
    alreadyFacedEntity: boolean = false;
    chat: string | null = null;
    damageTaken: number = -1;
    damageType: number = -1;
    faceX: number = -1;
    faceZ: number = -1;
    messageColor: number | null = null;
    messageEffect: number | null = null;
    messageType: number | null = null;
    message: Uint8Array | null = null;
    graphicId: number = -1;
    graphicHeight: number = -1;
    graphicDelay: number = -1;

    // ---

    // script variables
    delay = 0;
    /**
     * An array of pending queues.
     */
    queue: EntityQueueRequest[] = [];
    /**
     * An array of pending weak queues.
     */
    weakQueue: EntityQueueRequest[] = [];
    engineQueue: EntityQueueRequest[] = [];
    timers: Map<number, EntityTimer> = new Map();
    modalState = 0;
    modalTop = -1;
    lastModalTop = -1;
    modalBottom = -1;
    lastModalBottom = -1;
    modalSidebar = -1;
    lastModalSidebar = -1;
    refreshModalClose = false;
    refreshModal = false;
    modalSticky = -1;
    overlaySide: number[] = new Array(14).fill(-1);
    receivedFirstClose = false; // workaround to not close welcome screen on login

    interacted: boolean = false;
    repathed: boolean = false;
    target: Player | Npc | Loc | Obj | null = null;
    targetOp: number = -1;
    targetSubject: number = -1; // for [opplayeru,obj]
    apRange: number = 10;
    apRangeCalled: boolean = false;

    protect: boolean = false; // whether protected access is available
    activeScript: ScriptState | null = null;
    resumeButtons: number[] = [];

    lastItem: number = -1; // opheld, opheldu, opheldt, inv_button
    lastSlot: number = -1; // opheld, opheldu, opheldt, inv_button, inv_buttond
    lastUseItem: number = -1; // opheldu, opobju, oplocu, opnpcu, opplayeru
    lastUseSlot: number = -1; // opheldu, opobju, oplocu, opnpcu, opplayeru
    lastTargetSlot: number = -1; // inv_buttond
    lastInt: number = -1; // resume_p_countdialog
    lastCom: number = -1; // if_button

    constructor(username: string, username37: bigint) {
        super(0, 3094, 3106, 1, 1, MoveRestrict.NORMAL, BlockWalk.NPC); // tutorial island.
        this.username = username;
        this.username37 = username37;
        this.displayName = toDisplayName(username);
        this.varps = new Int32Array(VarPlayerType.count);
        this.body = [
            0, // hair
            10, // beard
            18, // body
            26, // arms
            33, // gloves
            36, // legs
            42 // boots
        ];
        this.colors = [0, 0, 0, 0, 0];
        this.gender = 0;
        this.runenergy = 10000;
        this.runweight = 0;
        this.playtime = 0;
        this.lastStats.fill(-1);
        this.lastLevels.fill(-1);
    }

    resetEntity(respawn: boolean) {
        this.resetPathingEntity();
        this.repathed = false;
        this.protect = false;

        if (respawn) {
            // if needed for respawning
        }

        this.mask = 0;
        this.animId = -1;
        this.animDelay = -1;

        if (this.alreadyFacedCoord && this.faceX !== -1 && !this.hasWaypoints()) {
            this.faceX = -1;
            this.faceZ = -1;
            this.alreadyFacedCoord = false;
        } else if (this.alreadyFacedEntity && !this.target) {
            this.mask |= Player.FACE_ENTITY;
            this.faceEntity = -1;
            this.alreadyFacedEntity = false;
        }

        this.animId = -1;
        this.animDelay = -1;

        this.chat = null;

        this.damageTaken = -1;
        this.damageType = -1;

        this.messageColor = null;
        this.messageEffect = null;
        this.messageType = null;
        this.message = null;

        this.graphicId = -1;
        this.graphicHeight = -1;
        this.graphicDelay = -1;
    }

    decodeIn() {
        // this.lastResponse = World.currentTick; // use to keep headless players in the world
        if (this.client === null || this.client.inOffset < 1) {
            return;
        }

        let offset = 0;
        this.lastResponse = World.currentTick;

        const decoded = [];
        while (offset < this.client.inOffset) {
            const opcode = this.client.in[offset++];

            let length = ClientProtLengths[opcode];
            if (length == -1) {
                length = this.client.in[offset++];
            } else if (length == -2) {
                length = (this.client.in[offset++] << 8) | this.client.in[offset++];
            }

            decoded.push({
                opcode,
                data: new Packet(this.client.in.subarray(offset, offset + length))
            });

            offset += length;
        }

        let pathfindRequest = false;
        let pathfindX = 0;
        let pathfindZ = 0;

        for (let it = 0; it < decoded.length; it++) {
            const { opcode, data } = decoded[it];

            if (opcode === ClientProt.REBUILD_GETMAPS) {
                const requested = [];

                for (let i = 0; i < data.length / 3; i++) {
                    const type = data.g1();
                    const x = data.g1();
                    const z = data.g1();

                    requested.push({ type, x, z });
                }

                for (let i = 0; i < requested.length; i++) {
                    const { type, x, z } = requested[i];

                    const CHUNK_SIZE = 5000 - 1 - 2 - 1 - 1 - 2 - 2;
                    if (type == 0) {
                        const land = PRELOADED.get(`m${x}_${z}`);
                        if (!land) {
                            continue;
                        }

                        for (let off = 0; off < land.length; off += CHUNK_SIZE) {
                            this.write(ServerProt.DATA_LAND, x, z, off, land.length, land.subarray(off, off + CHUNK_SIZE));
                        }

                        this.write(ServerProt.DATA_LAND_DONE, x, z);
                    } else if (type == 1) {
                        const loc = PRELOADED.get(`l${x}_${z}`);
                        if (!loc) {
                            continue;
                        }

                        for (let off = 0; off < loc.length; off += CHUNK_SIZE) {
                            this.write(ServerProt.DATA_LOC, x, z, off, loc.length, loc.subarray(off, off + CHUNK_SIZE));
                        }

                        this.write(ServerProt.DATA_LOC_DONE, x, z);
                    }
                }
            } else if (opcode === ClientProt.MOVE_GAMECLICK || opcode === ClientProt.MOVE_MINIMAPCLICK) {
                const running = data.g1();
                const startX = data.g2();
                const startZ = data.g2();
                const offset = opcode === ClientProt.MOVE_MINIMAPCLICK ? 14 : 0;
                const checkpoints = (data.available - offset) >> 1;

                pathfindX = startX;
                pathfindZ = startZ;
                if (checkpoints != 0) {
                    // Just grab the last one we need skip the rest.
                    data.pos += (checkpoints - 1) << 1;
                    pathfindX = data.g1s() + startX;
                    pathfindZ = data.g1s() + startZ;
                }

                if (
                    this.delayed() ||
                    running < 0 ||
                    running > 1 ||
                    Position.distanceTo(this, {
                        x: pathfindX,
                        z: pathfindZ,
                        width: this.width,
                        length: this.length
                    }) > 104
                ) {
                    pathfindX = -1;
                    pathfindZ = -1;
                    this.unsetMapFlag();
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                if (this.runenergy < 100) {
                    this.setVar('temp_run', 0);
                } else {
                    this.setVar('temp_run', running);
                }
                pathfindRequest = true;
            } else if (opcode === ClientProt.MOVE_OPCLICK) {
                const running = data.g1();

                if (running < 0 || running > 1) {
                    continue;
                }

                if (this.runenergy < 100) {
                    this.setVar('temp_run', 0);
                } else {
                    this.setVar('temp_run', running);
                }
            } else if (opcode === ClientProt.CLIENT_CHEAT) {
                const cheat = data.gjstr();

                if (cheat.length > 80) {
                    continue;
                }

                this.onCheat(cheat);
            } else if (opcode === ClientProt.MESSAGE_PUBLIC) {
                const colour = data.g1();
                const effect = data.g1();
                const message = WordPack.unpack(data, data.length - 2);

                if (colour < 0 || colour > 11 || effect < 0 || effect > 2 || message.length > 100) {
                    continue;
                }

                this.messageColor = colour;
                this.messageEffect = effect;
                this.messageType = 0;

                const out = new Packet();
                WordPack.pack(out, WordEnc.filter(message));
                out.pos = 0;
                this.message = out.gdata();
                this.mask |= Player.CHAT;

                World.socialPublicMessage(this.username37, message);
            } else if (opcode === ClientProt.IF_PLAYERDESIGN) {
                const female = data.g1();

                const body = [];
                for (let i = 0; i < 7; i++) {
                    body[i] = data.g1();

                    if (body[i] === 255) {
                        body[i] = -1;
                    }
                }

                const colors = [];
                for (let i = 0; i < 5; i++) {
                    colors[i] = data.g1();
                }

                if (!this.allowDesign) {
                    continue;
                }

                if (female > 1) {
                    continue;
                }

                let pass = true;
                for (let i = 0; i < 7; i++) {
                    let type = i;
                    if (female === 1) {
                        type += 7;
                    }

                    if (type == 8 && body[i] === -1) {
                        // female jaw is an exception
                        continue;
                    }

                    const idk = IdkType.get(body[i]);
                    if (!idk || idk.disable || idk.type != type) {
                        pass = false;
                        break;
                    }
                }

                if (!pass) {
                    continue;
                }

                for (let i = 0; i < 5; i++) {
                    if (colors[i] >= Player.DESIGN_BODY_COLORS[i].length) {
                        pass = false;
                        break;
                    }
                }

                if (!pass) {
                    continue;
                }

                this.gender = female;
                this.body = body;
                this.colors = colors;
                this.generateAppearance(InvType.getId('worn'));
            } else if (opcode === ClientProt.TUTORIAL_CLICKSIDE) {
                const tab = data.g1();

                if (tab < 0 || tab > 13) {
                    continue;
                }

                const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.TUTORIAL_CLICKSIDE, -1, -1);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this), true);
                }
            } else if (opcode === ClientProt.CLOSE_MODAL) {
                this.closeModal();
            } else if (opcode === ClientProt.RESUME_PAUSEBUTTON) {
                if (!this.activeScript || this.activeScript.execution !== ScriptState.PAUSEBUTTON) {
                    continue;
                }

                this.executeScript(this.activeScript, true);
            } else if (opcode === ClientProt.RESUME_P_COUNTDIALOG) {
                const input = data.g4();
                if (!this.activeScript || this.activeScript.execution !== ScriptState.COUNTDIALOG) {
                    continue;
                }

                this.lastInt = input;
                this.executeScript(this.activeScript, true);
            } else if (opcode === ClientProt.IF_BUTTON) {
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                this.lastCom = comId;

                if (this.resumeButtons.indexOf(this.lastCom) !== -1) {
                    if (this.activeScript) {
                        this.executeScript(this.activeScript, true);
                    }
                } else {
                    const root = Component.get(com.rootLayer);

                    const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_BUTTON, comId, -1);
                    if (script) {
                        this.executeScript(ScriptRunner.init(script, this), root.overlay == false);
                    } else {
                        if (Environment.LOCAL_DEV) {
                            this.messageGame(`No trigger for [if_button,${com.comName}]`);
                        }
                    }
                }
            } else if (opcode === ClientProt.INV_BUTTON1 || opcode === ClientProt.INV_BUTTON2 || opcode === ClientProt.INV_BUTTON3 || opcode === ClientProt.INV_BUTTON4 || opcode === ClientProt.INV_BUTTON5) {
                // jagex has if_button1-5
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !com.inventoryOptions || !com.inventoryOptions.length || !this.isComponentVisible(com)) {
                    continue;
                }

                if (
                    (opcode === ClientProt.INV_BUTTON1 && !com.inventoryOptions[0]) ||
                    (opcode === ClientProt.INV_BUTTON2 && !com.inventoryOptions[1]) ||
                    (opcode === ClientProt.INV_BUTTON3 && !com.inventoryOptions[2]) ||
                    (opcode === ClientProt.INV_BUTTON4 && !com.inventoryOptions[3]) ||
                    (opcode === ClientProt.INV_BUTTON5 && !com.inventoryOptions[4])
                ) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastItem = item;
                this.lastSlot = slot;

                let trigger: ServerTriggerType;
                if (opcode === ClientProt.INV_BUTTON1) {
                    trigger = ServerTriggerType.INV_BUTTON1;
                } else if (opcode === ClientProt.INV_BUTTON2) {
                    trigger = ServerTriggerType.INV_BUTTON2;
                } else if (opcode === ClientProt.INV_BUTTON3) {
                    trigger = ServerTriggerType.INV_BUTTON3;
                } else if (opcode === ClientProt.INV_BUTTON4) {
                    trigger = ServerTriggerType.INV_BUTTON4;
                } else {
                    trigger = ServerTriggerType.INV_BUTTON5;
                }

                const script = ScriptProvider.getByTrigger(trigger, comId, -1);
                if (script) {
                    const root = Component.get(com.rootLayer);

                    this.executeScript(ScriptRunner.init(script, this), root.overlay == false);
                } else {
                    if (Environment.LOCAL_DEV) {
                        this.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${com.comName}]`);
                    }
                }
            } else if (opcode === ClientProt.INV_BUTTOND) {
                // jagex has if_buttond
                const comId = data.g2();
                const slot = data.g2();
                const targetSlot = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.get(slot) || !inv.validSlot(targetSlot)) {
                    continue;
                }

                if (this.delayed()) {
                    // do nothing; revert the client visual
                    this.write(ServerProt.UPDATE_INV_PARTIAL, comId, inv, [slot, targetSlot]);
                    continue;
                }

                this.lastSlot = slot;
                this.lastTargetSlot = targetSlot;

                const dragTrigger = ScriptProvider.getByTrigger(ServerTriggerType.INV_BUTTOND, comId);
                if (dragTrigger) {
                    const root = Component.get(com.rootLayer);

                    this.executeScript(ScriptRunner.init(dragTrigger, this), root.overlay == false);
                } else {
                    if (Environment.LOCAL_DEV) {
                        this.messageGame(`No trigger for [inv_buttond,${com.comName}]`);
                    }
                }
            } else if (opcode === ClientProt.OPHELD1 || opcode === ClientProt.OPHELD2 || opcode === ClientProt.OPHELD3 || opcode === ClientProt.OPHELD4 || opcode === ClientProt.OPHELD5) {
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const type = ObjType.get(item);
                if ((opcode === ClientProt.OPHELD1 && !type.iops[0]) || (opcode === ClientProt.OPHELD2 && !type.iops[1]) || (opcode === ClientProt.OPHELD3 && !type.iops[2]) || (opcode === ClientProt.OPHELD4 && !type.iops[3])) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastItem = item;
                this.lastSlot = slot;

                this.clearInteraction();
                this.closeModal();

                let trigger: ServerTriggerType;
                if (opcode === ClientProt.OPHELD1) {
                    trigger = ServerTriggerType.OPHELD1;
                } else if (opcode === ClientProt.OPHELD2) {
                    trigger = ServerTriggerType.OPHELD2;
                } else if (opcode === ClientProt.OPHELD3) {
                    trigger = ServerTriggerType.OPHELD3;
                } else if (opcode === ClientProt.OPHELD4) {
                    trigger = ServerTriggerType.OPHELD4;
                } else {
                    trigger = ServerTriggerType.OPHELD5;
                }

                const script = ScriptProvider.getByTrigger(trigger, type.id, type.category);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this), true);
                } else {
                    if (Environment.LOCAL_DEV) {
                        this.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${type.debugname}]`);
                    }
                }
            } else if (opcode === ClientProt.OPHELDU) {
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();
                const useItem = data.g2();
                const useSlot = data.g2();
                const useComId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const useCom = Component.get(comId);
                if (typeof useCom === 'undefined' || !this.isComponentVisible(useCom)) {
                    continue;
                }

                {
                    const listener = this.invListeners.find(l => l.com === comId);
                    if (!listener) {
                        continue;
                    }

                    const inv = this.getInventoryFromListener(listener);
                    if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                        continue;
                    }
                }

                {
                    const listener = this.invListeners.find(l => l.com === useComId);
                    if (!listener) {
                        continue;
                    }

                    const inv = this.getInventoryFromListener(listener);
                    if (!inv || !inv.validSlot(useSlot) || !inv.hasAt(useSlot, useItem)) {
                        continue;
                    }
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastItem = item;
                this.lastSlot = slot;
                this.lastUseItem = useItem;
                this.lastUseSlot = useSlot;

                const objType = ObjType.get(this.lastItem);
                const useObjType = ObjType.get(this.lastUseItem);

                // [opheldu,b]
                let script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, objType.id, -1);

                // [opheldu,a]
                if (!script) {
                    script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, useObjType.id, -1);
                    [this.lastItem, this.lastUseItem] = [this.lastUseItem, this.lastItem];
                    [this.lastSlot, this.lastUseSlot] = [this.lastUseSlot, this.lastSlot];
                }

                // [opheld,b_category]
                const objCategory = objType.category !== -1 ? CategoryType.get(objType.category) : null;
                if (!script && objCategory) {
                    script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, -1, objCategory.id);
                }

                // [opheld,a_category]
                const useObjCategory = useObjType.category !== -1 ? CategoryType.get(useObjType.category) : null;
                if (!script && useObjCategory) {
                    script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, -1, useObjCategory.id);
                    [this.lastItem, this.lastUseItem] = [this.lastUseItem, this.lastItem];
                    [this.lastSlot, this.lastUseSlot] = [this.lastUseSlot, this.lastSlot];
                }

                this.clearInteraction();
                this.closeModal();

                if (script) {
                    this.executeScript(ScriptRunner.init(script, this), true);
                } else {
                    if (Environment.LOCAL_DEV) {
                        this.messageGame(`No trigger for [opheldu,${objType.debugname}]`);
                    }

                    // todo: is this appropriate?
                    this.messageGame('Nothing interesting happens.');
                }
            } else if (opcode === ClientProt.OPHELDT) {
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();
                const spellComId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const spellCom = Component.get(comId);
                if (typeof spellCom === 'undefined' || !this.isComponentVisible(spellCom)) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastItem = item;
                this.lastSlot = slot;

                this.clearInteraction();
                this.closeModal();

                const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELDT, spellComId, -1);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this), true);
                } else {
                    if (Environment.LOCAL_DEV) {
                        this.messageGame(`No trigger for [opheldt,${spellCom.comName}]`);
                    }

                    // todo: is this appropriate?
                    this.messageGame('Nothing interesting happens.');
                }
            } else if (opcode === ClientProt.OPLOC1 || opcode === ClientProt.OPLOC2 || opcode === ClientProt.OPLOC3 || opcode === ClientProt.OPLOC4 || opcode === ClientProt.OPLOC5) {
                const x = data.g2();
                const z = data.g2();
                const locId = data.g2();

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const loc = World.getLoc(x, z, this.level, locId);
                if (!loc) {
                    continue;
                }

                const locType = LocType.get(loc.type);
                if (
                    (opcode === ClientProt.OPLOC1 && !locType.ops[0]) ||
                    (opcode === ClientProt.OPLOC2 && !locType.ops[1]) ||
                    (opcode === ClientProt.OPLOC3 && !locType.ops[2]) ||
                    (opcode === ClientProt.OPLOC4 && !locType.ops[3]) ||
                    (opcode === ClientProt.OPLOC5 && !locType.ops[4])
                ) {
                    continue;
                }

                let mode: ServerTriggerType;
                if (opcode === ClientProt.OPLOC1) {
                    mode = ServerTriggerType.APLOC1;
                } else if (opcode === ClientProt.OPLOC2) {
                    mode = ServerTriggerType.APLOC2;
                } else if (opcode === ClientProt.OPLOC3) {
                    mode = ServerTriggerType.APLOC3;
                } else if (opcode === ClientProt.OPLOC4) {
                    mode = ServerTriggerType.APLOC4;
                } else {
                    mode = ServerTriggerType.APLOC5;
                }

                this.setInteraction(loc, mode);
                pathfindX = loc.x;
                pathfindZ = loc.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPLOCU) {
                const x = data.g2();
                const z = data.g2();
                const locId = data.g2();

                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                const loc = World.getLoc(x, z, this.level, locId);
                if (!loc) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastUseItem = item;
                this.lastUseSlot = slot;

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(loc, ServerTriggerType.APLOCU);
                pathfindX = loc.x;
                pathfindZ = loc.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPLOCT) {
                const x = data.g2();
                const z = data.g2();
                const locId = data.g2();
                const spellComId = data.g2();

                const spellCom = Component.get(spellComId);
                if (typeof spellCom === 'undefined' || !this.isComponentVisible(spellCom)) {
                    continue;
                }

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const loc = World.getLoc(x, z, this.level, locId);
                if (!loc) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(loc, ServerTriggerType.APLOCT, spellComId);
                pathfindX = loc.x;
                pathfindZ = loc.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPNPC1 || opcode === ClientProt.OPNPC2 || opcode === ClientProt.OPNPC3 || opcode === ClientProt.OPNPC4 || opcode === ClientProt.OPNPC5) {
                const nid = data.g2();

                const npc = World.getNpc(nid);
                if (!npc || npc.delayed()) {
                    continue;
                }

                if (!this.npcs.has(npc.nid)) {
                    continue;
                }

                const npcType = NpcType.get(npc.type);
                if (
                    (opcode === ClientProt.OPNPC1 && !npcType.ops[0]) ||
                    (opcode === ClientProt.OPNPC2 && !npcType.ops[1]) ||
                    (opcode === ClientProt.OPNPC3 && !npcType.ops[2]) ||
                    (opcode === ClientProt.OPNPC4 && !npcType.ops[3]) ||
                    (opcode === ClientProt.OPNPC5 && !npcType.ops[4])
                ) {
                    continue;
                }

                let mode: ServerTriggerType;
                if (opcode === ClientProt.OPNPC1) {
                    mode = ServerTriggerType.APNPC1;
                } else if (opcode === ClientProt.OPNPC2) {
                    mode = ServerTriggerType.APNPC2;
                } else if (opcode === ClientProt.OPNPC3) {
                    mode = ServerTriggerType.APNPC3;
                } else if (opcode === ClientProt.OPNPC4) {
                    mode = ServerTriggerType.APNPC4;
                } else {
                    mode = ServerTriggerType.APNPC5;
                }

                this.setInteraction(npc, mode);
                pathfindX = npc.x;
                pathfindZ = npc.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPNPCU) {
                const nid = data.g2();
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                const npc = World.getNpc(nid);
                if (!npc || npc.delayed()) {
                    continue;
                }

                if (!this.npcs.has(npc.nid)) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastUseItem = item;
                this.lastUseSlot = slot;

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(npc, ServerTriggerType.APNPCU);
                pathfindX = npc.x;
                pathfindZ = npc.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPNPCT) {
                const nid = data.g2();
                const spellComId = data.g2();

                const spellCom = Component.get(spellComId);
                if (typeof spellCom === 'undefined' || !this.isComponentVisible(spellCom)) {
                    continue;
                }

                const npc = World.getNpc(nid);
                if (!npc || npc.delayed()) {
                    continue;
                }

                if (!this.npcs.has(npc.nid)) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(npc, ServerTriggerType.APNPCT, spellComId);
                pathfindX = npc.x;
                pathfindZ = npc.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPOBJ1 || opcode === ClientProt.OPOBJ2 || opcode === ClientProt.OPOBJ3 || opcode === ClientProt.OPOBJ4 || opcode === ClientProt.OPOBJ5) {
                const x = data.g2();
                const z = data.g2();
                const objId = data.g2();

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const obj = World.getObj(x, z, this.level, objId);
                if (!obj) {
                    continue;
                }

                const objType = ObjType.get(obj.type);
                // todo: validate all options
                if ((opcode === ClientProt.OPOBJ1 && !objType.ops[0]) || (opcode === ClientProt.OPOBJ4 && !objType.ops[3])) {
                    continue;
                }

                let mode: ServerTriggerType;
                if (opcode === ClientProt.OPOBJ1) {
                    mode = ServerTriggerType.APOBJ1;
                } else if (opcode === ClientProt.OPOBJ2) {
                    mode = ServerTriggerType.APOBJ2;
                } else if (opcode === ClientProt.OPOBJ3) {
                    mode = ServerTriggerType.APOBJ3;
                } else if (opcode === ClientProt.OPOBJ4) {
                    mode = ServerTriggerType.APOBJ4;
                } else {
                    mode = ServerTriggerType.APOBJ5;
                }

                this.setInteraction(obj, mode);
                pathfindX = obj.x;
                pathfindZ = obj.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPOBJU) {
                const x = data.g2();
                const z = data.g2();
                const objId = data.g2();

                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                const obj = World.getObj(x, z, this.level, objId);
                if (!obj) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastUseItem = item;
                this.lastUseSlot = slot;

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(obj, ServerTriggerType.APOBJU);
                pathfindX = obj.x;
                pathfindZ = obj.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPOBJT) {
                const x = data.g2();
                const z = data.g2();
                const objId = data.g2();
                const spellComId = data.g2();

                const spellCom = Component.get(spellComId);
                if (typeof spellCom === 'undefined' || !this.isComponentVisible(spellCom)) {
                    continue;
                }

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const obj = World.getObj(x, z, this.level, objId);
                if (!obj) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(obj, ServerTriggerType.APOBJT, spellComId);
                pathfindX = obj.x;
                pathfindZ = obj.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPPLAYER1 || opcode === ClientProt.OPPLAYER2 || opcode === ClientProt.OPPLAYER3 || opcode === ClientProt.OPPLAYER4) {
                const pid = data.g2();

                const player = World.getPlayer(pid);
                if (!player) {
                    // does player exist?
                    continue;
                }

                if (!this.players.has(player.uid)) {
                    // are we aware of the player?
                    continue;
                }

                let mode: ServerTriggerType;
                if (opcode === ClientProt.OPPLAYER1) {
                    mode = ServerTriggerType.APPLAYER1;
                } else if (opcode === ClientProt.OPPLAYER2) {
                    mode = ServerTriggerType.APPLAYER2;
                } else if (opcode === ClientProt.OPPLAYER3) {
                    mode = ServerTriggerType.APPLAYER3;
                } else {
                    mode = ServerTriggerType.APPLAYER4;
                }

                this.setInteraction(player, mode);
                pathfindX = player.x;
                pathfindZ = player.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPPLAYERU) {
                const pid = data.g2();
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === comId);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                const player = World.getPlayer(pid);
                if (!player) {
                    // does player exist?
                    continue;
                }

                if (!this.players.has(player.uid)) {
                    // are we aware of the player?
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.lastUseSlot = slot;

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(player, ServerTriggerType.APPLAYERU, item);
                pathfindX = player.x;
                pathfindZ = player.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPPLAYERT) {
                const pid = data.g2();
                const spellComId = data.g2();

                const spellCom = Component.get(spellComId);
                if (typeof spellCom === 'undefined' || !this.isComponentVisible(spellCom)) {
                    continue;
                }

                const player = World.getPlayer(pid);
                if (!player) {
                    // does player exist?
                    continue;
                }

                if (!this.players.has(player.uid)) {
                    // are we aware of the player?
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(player, ServerTriggerType.APPLAYERT, spellComId);
                pathfindX = player.x;
                pathfindZ = player.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.FRIENDLIST_ADD) {
                const other = data.g8();

                World.socialAddFriend(this.username37, other);
            } else if (opcode === ClientProt.FRIENDLIST_DEL) {
                const other = data.g8();

                World.socialRemoveFriend(this.username37, other);
            } else if (opcode === ClientProt.IGNORELIST_ADD) {
                const other = data.g8();

                World.socialAddIgnore(this.username37, other);
            } else if (opcode === ClientProt.IGNORELIST_DEL) {
                const other = data.g8();

                World.socialRemoveIgnore(this.username37, other);
            } else if (opcode === ClientProt.IDLE_TIMER) {
                if (!Environment.LOCAL_DEV) {
                    this.logout();
                    this.logoutRequested = true;
                }
            } else if (opcode === ClientProt.MESSAGE_PRIVATE) {
                const other = data.g8();
                const message = WordPack.unpack(data, data.length - 8);

                World.socialPrivateMessage(this.username37, other, message);
            }
        }

        if (this.forceMove && pathfindX !== -1 && pathfindZ !== -1) {
            this.unsetMapFlag();
            pathfindRequest = false;
            pathfindX = -1;
            pathfindZ = -1;
        }

        this.client?.reset();

        // process any pathfinder requests now
        if (pathfindRequest && pathfindX !== -1 && pathfindZ !== -1) {
            if (this.delayed()) {
                this.unsetMapFlag();
                return;
            }

            if (!this.target || this.target instanceof Loc || this.target instanceof Obj) {
                this.faceEntity = -1;
                this.mask |= Player.FACE_ENTITY;
            }

            if (this.target) {
                this.pathToTarget();
            } else {
                this.queueWaypoints(World.pathFinder.findPath(this.level, this.x, this.z, pathfindX, pathfindZ).waypoints);
            }

            pathfindX = -1;
            pathfindZ = -1;
        }
    }

    pathToTarget() {
        if (!this.target || this.target.x === -1 || this.target.z === -1) {
            return;
        }

        if (this.target instanceof PathingEntity) {
            this.queueWaypoints(World.pathFinder.findPath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length, this.target.orientation, -2).waypoints);
        } else if (this.target instanceof Loc) {
            const forceapproach = LocType.get(this.target.type).forceapproach;
            this.queueWaypoints(World.pathFinder.findPath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length, this.target.angle, this.target.shape, true, forceapproach).waypoints);
        } else {
            this.queueWaypoints(World.pathFinder.findPath(this.level, this.x, this.z, this.target.x, this.target.z).waypoints);
        }
    }

    encodeOut() {
        if (!this.client) {
            return;
        }

        if (this.modalTop !== this.lastModalTop || this.modalBottom !== this.lastModalBottom || this.modalSidebar !== this.lastModalSidebar || this.refreshModalClose) {
            if (this.refreshModalClose) {
                this.write(ServerProt.IF_CLOSE);
            }
            this.refreshModalClose = false;

            this.lastModalTop = this.modalTop;
            this.lastModalBottom = this.modalBottom;
            this.lastModalSidebar = this.modalSidebar;
        }

        if (this.refreshModal) {
            if ((this.modalState & 1) === 1 && (this.modalState & 4) === 4) {
                this.write(ServerProt.IF_OPENMAINSIDEMODAL, this.modalTop, this.modalSidebar);
            } else if ((this.modalState & 1) === 1) {
                this.write(ServerProt.IF_OPENMAINMODAL, this.modalTop);
            } else if ((this.modalState & 2) === 2) {
                this.write(ServerProt.IF_OPENCHATMODAL, this.modalBottom);
            } else if ((this.modalState & 4) === 4) {
                this.write(ServerProt.IF_OPENSIDEMODAL, this.modalSidebar);
            }

            this.refreshModal = false;
        }

        for (let j = 0; j < this.netOut.length; j++) {
            const out = this.netOut[j];

            if (this.client.encryptor) {
                out.data[0] = (out.data[0] + this.client.encryptor.nextInt()) & 0xff;
            }

            World.lastCycleBandwidth[1] += out.length;
            this.client.write(out);
        }

        this.client.flush();
        this.netOut = [];
    }

    writeImmediately(packet: Packet) {
        if (!this.client) {
            return;
        }

        if (this.client.encryptor) {
            packet.data[0] = (packet.data[0] + this.client.encryptor.nextInt()) & 0xff;
        }

        this.client.write(packet);
        this.client.flush();
    }

    // ----

    onLogin() {
        this.playerLog('Logging in');

        // normalize client between logins
        this.write(ServerProt.IF_CLOSE);
        this.write(ServerProt.UPDATE_UID192, this.pid);
        this.unsetMapFlag();
        this.write(ServerProt.RESET_ANIMS);

        this.write(ServerProt.RESET_CLIENT_VARCACHE);
        for (let varp = 0; varp < this.varps.length; varp++) {
            const type = VarPlayerType.get(varp);
            const value = this.varps[varp];

            if (type.transmit) {
                if (value < 256) {
                    this.write(ServerProt.VARP_SMALL, varp, value);
                } else {
                    this.write(ServerProt.VARP_LARGE, varp, value);
                }
            }
        }

        const loginTrigger = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGIN, -1, -1);
        if (loginTrigger) {
            this.executeScript(ScriptRunner.init(loginTrigger, this), true);
        }

        // play music, multiway, etc
        const moveTrigger = ScriptProvider.getByTriggerSpecific(ServerTriggerType.MOVE, -1, -1);
        if (moveTrigger) {
            const script = ScriptRunner.init(moveTrigger, this);
            this.runScript(script, true);
        }
    }

    calculateRunWeight() {
        this.runweight = 0;

        const invs = this.invs.values();
        for (let i = 0; i < this.invs.size; i++) {
            const inv = invs.next().value;
            if (!inv) {
                continue;
            }

            const invType = InvType.get(inv.type);
            if (!invType || !invType.runweight) {
                continue;
            }

            for (let slot = 0; slot < inv.capacity; slot++) {
                const item = inv.get(slot);
                if (!item) {
                    continue;
                }

                const type = ObjType.get(item.id);
                if (!type || type.stackable) {
                    continue;
                }

                this.runweight += type.weight * item.count;
            }
        }
    }

    playerLog(message: string, ...args: string[]) {
        if (args.length > 0) {
            fs.appendFileSync(`data/players/${this.username}.log`, `[${new Date().toISOString().split('T')[0]} ${this.client?.remoteAddress}]: ${message} ${args.join(' ')}\n`);
        } else {
            fs.appendFileSync(`data/players/${this.username}.log`, `[${new Date().toISOString().split('T')[0]} ${this.client?.remoteAddress}]: ${message}\n`);
        }
    }

    onCheat(cheat: string) {
        const args = cheat.toLowerCase().split(' ');
        const cmd = args.shift();
        if (!cmd) {
            return;
        }

        this.playerLog('Cheat ran', cheat);

        switch (cmd) {
            case 'reload': {
                if (Environment.LOCAL_DEV) {
                    // TODO: only reload config types that have changed to save time
                    CategoryType.load('data/pack/server');
                    ParamType.load('data/pack/server');
                    EnumType.load('data/pack/server');
                    StructType.load('data/pack/server');
                    InvType.load('data/pack/server');
                    IdkType.load('data/pack/server');
                    VarPlayerType.load('data/pack/server');
                    ObjType.load('data/pack/server', World.members);
                    LocType.load('data/pack/server');
                    NpcType.load('data/pack/server');
                    Component.load('data/pack/server');
                    SeqType.load('data/pack/server');
                    SpotanimType.load('data/pack/server');
                    MesanimType.load('data/pack/server');
                    DbTableType.load('data/pack/server');
                    DbRowType.load('data/pack/server');
                    HuntType.load('data/pack/server');

                    const count = ScriptProvider.load('data/pack/server');
                    this.messageGame(`Reloaded ${count} scripts.`);
                }
                break;
            }
            case 'setvar': {
                const varp = args.shift();
                if (!varp) {
                    this.messageGame('Usage: ::setvar <var> <value>');
                    return;
                }

                const value = args.shift();
                if (!value) {
                    this.messageGame('Usage: ::setvar <var> <value>');
                    return;
                }

                const varpType = VarPlayerType.getByName(varp);
                if (varpType) {
                    this.setVar(varp, parseInt(value, 10));
                    this.messageGame(`Setting var ${varp} to ${value}`);
                } else {
                    this.messageGame(`Unknown var ${varp}`);
                }
                break;
            }
            case 'getvar': {
                const varp = args.shift();
                if (!varp) {
                    this.messageGame('Usage: ::getvar <var>');
                    return;
                }

                const varpType = VarPlayerType.getByName(varp);
                if (varpType) {
                    this.messageGame(`Var ${varp}: ${this.varps[varpType.id]}`);
                } else {
                    this.messageGame(`Unknown var ${varp}`);
                }
                break;
            }
            case 'setlevel': {
                if (args.length < 2) {
                    this.messageGame('Usage: ::setlevel <stat> <level>');
                    return;
                }

                const stat = Player.SKILLS.indexOf(args[0]);
                if (stat === -1) {
                    this.messageGame(`Unknown stat ${args[0]}`);
                    return;
                }

                this.setLevel(stat, parseInt(args[1]));
                break;
            }
            case 'setxp': {
                if (args.length < 2) {
                    this.messageGame('Usage: ::setxp <stat> <xp>');
                    return;
                }

                const stat = Player.SKILLS.indexOf(args[0]);
                if (stat === -1) {
                    this.messageGame(`Unknown stat ${args[0]}`);
                    return;
                }

                const exp = parseInt(args[1]) * 10;
                this.setLevel(stat, getLevelByExp(exp));
                this.stats[stat] = exp;
                break;
            }
            case 'minlevel': {
                for (let i = 0; i < Player.SKILLS.length; i++) {
                    if (i === Player.HITPOINTS) {
                        this.setLevel(i, 10);
                    } else {
                        this.setLevel(i, 1);
                    }
                }
                break;
            }
            case 'serverdrop': {
                this.client?.terminate();
                this.client = null;
                break;
            }
            default: {
                if (cmd.length <= 0) {
                    return;
                }

                // lookup debugproc with the name and execute it
                const script = ScriptProvider.getByName(`[debugproc,${cmd}]`);
                if (!script) {
                    return;
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

                                params.push(Position.packCoord(level, (mx << 6) + lx, (mz << 6) + lz));
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
                        return;
                    }
                }

                this.executeScript(ScriptRunner.init(script, this, null, null, params), false);
                break;
            }
        }
    }

    processEngineQueue() {
        while (this.engineQueue.length) {
            const processedQueueCount = this.processEngineQueueInternal();
            if (processedQueueCount === 0) {
                break;
            }
        }
    }

    processEngineQueueInternal() {
        let processedQueueCount = 0;

        for (let i = 0; i < this.engineQueue.length; i++) {
            const queue = this.engineQueue[i];

            const delay = queue.delay--;
            if (this.canAccess() && delay <= 0) {
                const script = ScriptRunner.init(queue.script, this, null, null, queue.args);
                this.executeScript(script, true);

                processedQueueCount++;
                this.engineQueue.splice(i--, 1);
            }
        }

        return processedQueueCount;
    }

    // ----

    updateMovement(running: number = -1): boolean {
        if (this.containsModalInterface()) {
            return false;
        }

        if (this.target) {
            const apTrigger = this.getApTrigger();
            const outOfRange = !this.inApproachDistance(this.apRange, this.target) && apTrigger && !this.inOperableDistance(this.target);
            const targetMoved = this.hasWaypoints() && (this.waypoints[0].x !== this.target.x || this.waypoints[0].z !== this.target.z);

            // broken out to understand better
            if (!this.hasWaypoints() && !this.interacted) {
                this.pathToTarget();
            } else if (outOfRange) {
                this.pathToTarget();
            } else if (targetMoved) {
                this.pathToTarget();
            }
        }

        if (this.hasWaypoints() && this.moveCheck !== null) {
            const trigger = ScriptProvider.get(this.moveCheck);

            if (trigger) {
                const script = ScriptRunner.init(trigger, this);
                const state = this.runScript(script, true);
                if (state === -1) {
                    // player cannot move unless protected access is available
                    return false;
                }

                const result = script.popInt();
                if (!result) {
                    return false;
                }
            }

            this.moveCheck = null;
        }

        if (running === -1 && !this.forceMove) {
            if (this.runenergy < 100) {
                this.setVar('player_run', 0);
                this.setVar('temp_run', 0);
            }

            running = 0;
            running |= this.getVarp('player_run') ? 1 : 0;
            running |= this.getVarp('temp_run') ? 1 : 0;
        }
        if (!super.processMovement(running)) {
            this.setVar('temp_run', 0);
        }

        const moved = this.lastX !== this.x || this.lastZ !== this.z;
        if (moved) {
            const trigger = ScriptProvider.getByTriggerSpecific(ServerTriggerType.MOVE, -1, -1);

            if (trigger) {
                const script = ScriptRunner.init(trigger, this);
                this.runScript(script, true);
            }

            this.refreshZonePresence(this.lastX, this.lastZ, this.level);

            // run energy drain
            if (running) {
                // TODO: "Moving to an adjacent tile through walking will not drain energy, even if Run is turned on."
                const weightKg = Math.floor(this.runweight / 1000);
                const clampWeight = Math.min(Math.max(weightKg, 0), 64);
                const loss = 67 + (67 * clampWeight) / 64;

                this.runenergy = Math.max(this.runenergy - loss, 0);
                if (this.runenergy === 0) {
                    this.setVar('player_run', 0);
                    this.setVar('temp_run', 0);
                }
            }
        }

        if (!this.delayed() && (!moved || !running) && this.runenergy < 10000) {
            const recovered = this.baseLevels[Player.AGILITY] / 9 + 8;

            this.runenergy = Math.min(this.runenergy + recovered, 10000);
        }

        return moved;
    }

    blockWalkFlag(): number {
        return CollisionFlag.PLAYER;
    }

    // ----

    closeSticky() {
        if (this.modalSticky !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalSticky);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalSticky = -1;
            this.write(ServerProt.TUTORIAL_OPENCHAT, -1);
        }
    }

    closeModal() {
        if (!this.receivedFirstClose) {
            this.receivedFirstClose = true;
            return;
        }

        this.weakQueue = [];
        // this.activeScript = null;

        if (!this.delayed()) {
            this.protect = false;
        }

        if (this.modalState === 0) {
            return;
        }

        if (this.modalTop !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalTop);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalTop = -1;
        }

        if (this.modalBottom !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalBottom);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalBottom = -1;
        }

        if (this.modalSidebar !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalSidebar);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalSidebar = -1;
        }

        this.modalState = 0;
        this.refreshModalClose = true;
    }

    delayed() {
        return this.delay > 0;
    }

    containsModalInterface() {
        return (this.modalState & 1) === 1 || (this.modalState & 2) === 2 || (this.modalState & 16) === 16;
    }

    busy() {
        return this.delayed() || this.containsModalInterface();
    }

    canAccess() {
        return !this.protect && !this.busy();
    }

    /**
     *
     * @param script
     * @param {QueueType} type
     * @param delay
     * @param args
     */
    enqueueScript(script: Script, type: QueueType = PlayerQueueType.NORMAL, delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest(type, script, args, delay);
        if (type === PlayerQueueType.ENGINE) {
            request.delay = 0;
            this.engineQueue.push(request);
        } else if (type === PlayerQueueType.WEAK) {
            this.weakQueue.push(request);
        } else {
            this.queue.push(request);
        }
    }

    processQueues() {
        if (this.queue.some(queue => queue.type === PlayerQueueType.STRONG)) {
            this.closeModal();
        }

        while (this.queue.length) {
            const processedQueueCount = this.processQueue();
            if (processedQueueCount === 0) {
                break;
            }
        }

        while (this.weakQueue.length) {
            const processedQueueCount = this.processWeakQueue();
            if (processedQueueCount === 0) {
                break;
            }
        }
    }

    processQueue() {
        let processedQueueCount = 0;

        for (let i = 0; i < this.queue.length; i++) {
            const queue = this.queue[i];
            if (queue.type === PlayerQueueType.STRONG) {
                this.closeModal();
            }

            const delay = queue.delay--;
            if (this.canAccess() && delay <= 0) {
                const script = ScriptRunner.init(queue.script, this, null, null, queue.args);
                this.executeScript(script, true);

                processedQueueCount++;
                this.queue.splice(i--, 1);
            }
        }

        return processedQueueCount;
    }

    processWeakQueue() {
        let processedQueueCount = 0;

        for (let i = 0; i < this.weakQueue.length; i++) {
            const queue = this.weakQueue[i];

            const delay = queue.delay--;
            if (this.canAccess() && delay <= 0) {
                const script = ScriptRunner.init(queue.script, this, null, null, queue.args);
                this.executeScript(script, true);

                processedQueueCount++;
                this.weakQueue.splice(i--, 1);
            }
        }

        return processedQueueCount;
    }

    setTimer(type: PlayerTimerType, script: Script, args: ScriptArgument[] = [], interval: number) {
        const timerId = script.id;
        const timer = {
            type,
            script,
            args,
            interval,
            clock: interval
        };

        this.timers.set(timerId, timer);
    }

    clearTimer(timerId: number) {
        this.timers.delete(timerId);
    }

    processTimers(type: PlayerTimerType) {
        for (const timer of this.timers.values()) {
            if (type !== timer.type) {
                continue;
            }

            // only execute if it's time and able
            // soft timers can execute while busy, normal cannot
            if (--timer.clock <= 0 && (timer.type === PlayerTimerType.SOFT || this.canAccess())) {
                // set clock back to interval
                timer.clock = timer.interval;

                const script = ScriptRunner.init(timer.script, this, null, null, timer.args);
                this.runScript(script, timer.type === PlayerTimerType.NORMAL);
            }
        }
    }

    setInteraction(target: Player | Npc | Loc | Obj, op: ServerTriggerType, subject?: number) {
        if (this.forceMove || this.delayed()) {
            // console.log('not setting interaction');
            this.unsetMapFlag();
            return;
        }

        // console.log('setting interaction');
        this.closeModal();

        this.target = target;
        this.targetOp = op;
        this.targetSubject = subject ?? -1;
        this.apRange = 10;
        this.apRangeCalled = false;

        if (target instanceof Player) {
            this.faceEntity = target.pid + 32768;
            this.mask |= Player.FACE_ENTITY;
        } else if (target instanceof Npc) {
            this.faceEntity = target.nid;
            this.mask |= Player.FACE_ENTITY;
        } else if (target instanceof Loc) {
            const type = LocType.get(target.type);
            this.faceX = target.x * 2 + type.width;
            this.faceZ = target.z * 2 + type.length;
            this.mask |= Player.FACE_COORD;
        } else {
            this.faceX = target.x * 2 + 1;
            this.faceZ = target.z * 2 + 1;
            this.mask |= Player.FACE_COORD;
        }
    }

    clearInteraction() {
        this.target = null;
        this.targetOp = -1;
        this.targetSubject = -1;
        this.apRange = 10;
        this.apRangeCalled = false;
    }

    getOpTrigger() {
        if (!this.target) {
            return null;
        }

        let typeId = -1;
        let categoryId = -1;
        if (this.targetSubject !== -1) {
            typeId = this.targetSubject;
        } else if (this.target instanceof Npc || this.target instanceof Loc || this.target instanceof Obj) {
            const type = this.target instanceof Npc ? NpcType.get(this.target.type) : this.target instanceof Loc ? LocType.get(this.target.type) : ObjType.get(this.target.type);
            typeId = type.id;
            categoryId = type.category;
        }

        return ScriptProvider.getByTrigger(this.targetOp + 7, typeId, categoryId) ?? null;
    }

    getApTrigger() {
        if (!this.target) {
            return null;
        }

        let typeId = -1;
        let categoryId = -1;
        if (this.targetSubject !== -1) {
            typeId = this.targetSubject;
        } else if (this.target instanceof Npc || this.target instanceof Loc || this.target instanceof Obj) {
            const type = this.target instanceof Npc ? NpcType.get(this.target.type) : this.target instanceof Loc ? LocType.get(this.target.type) : ObjType.get(this.target.type);
            typeId = type.id;
            categoryId = type.category;
        }

        return ScriptProvider.getByTrigger(this.targetOp, typeId, categoryId) ?? null;
    }

    processInteraction() {
        if (this.target === null || !this.canAccess()) {
            this.updateMovement();
            return;
        }

        if (this.target.level !== this.level) {
            this.clearInteraction();
            return;
        }

        // todo: clear interaction on npc_changetype
        if (this.target instanceof Npc && this.target.delayed()) {
            this.clearInteraction();
            return;
        }

        if (this.target instanceof Obj && World.getObj(this.target.x, this.target.z, this.level, this.target.type) === null) {
            this.clearInteraction();
            return;
        }

        if (this.target instanceof Loc && World.getLoc(this.target.x, this.target.z, this.level, this.target.type) === null) {
            this.clearInteraction();
            return;
        }

        this.interacted = false;
        this.apRangeCalled = false;

        const opTrigger = this.getOpTrigger();
        const apTrigger = this.getApTrigger();

        // console.log('operable', opTrigger != null, 'trigger exists', this.inOperableDistance(this.target), 'in range');
        // console.log('approachable', apTrigger != null, 'trigger exists', this.inApproachDistance(this.apRange, this.target), 'in range');

        if (this.inOperableDistance(this.target) && opTrigger && this.target instanceof PathingEntity) {
            const target = this.target;
            this.target = null;
            const state = ScriptRunner.init(opTrigger, this, target);

            this.executeScript(state, true);

            if (this.target === null) {
                this.unsetMapFlag();
            }

            this.interacted = true;
        } else if (this.inApproachDistance(this.apRange, this.target) && apTrigger) {
            const target = this.target;
            this.target = null;
            const state = ScriptRunner.init(apTrigger, this, target);

            this.executeScript(state, true);

            if (this.apRangeCalled) {
                this.target = target;
            }

            if (this.target === null) {
                this.unsetMapFlag();
            }

            this.interacted = true;
        } else if (this.inOperableDistance(this.target) && this.target instanceof PathingEntity) {
            if (Environment.LOCAL_DEV && !opTrigger && !apTrigger) {
                let debugname = '_';
                if (this.target instanceof Npc) {
                    debugname = NpcType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.target instanceof Loc) {
                    debugname = LocType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.target instanceof Obj) {
                    debugname = ObjType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.targetSubject !== -1) {
                    if (this.targetOp === ServerTriggerType.APNPCT || this.targetOp === ServerTriggerType.APPLAYERT || this.targetOp === ServerTriggerType.APLOCT || this.targetOp === ServerTriggerType.APOBJT) {
                        debugname = Component.get(this.targetSubject)?.comName ?? this.targetSubject.toString();
                    } else {
                        debugname = ObjType.get(this.targetSubject)?.debugname ?? this.targetSubject.toString();
                    }
                }

                this.messageGame(`No trigger for [${ServerTriggerType[this.targetOp + 7].toLowerCase()},${debugname}]`);
            }

            this.target = null;
            this.messageGame('Nothing interesting happens.');
            this.interacted = true;
        }

        const moved = this.updateMovement();
        if (moved) {
            // we need to keep the mask if the player had to move.
            this.alreadyFacedEntity = false;
            this.alreadyFacedCoord = false;
            this.lastMovement = World.currentTick + 1;
        }

        if (this.target && (!this.interacted || this.apRangeCalled)) {
            this.interacted = false;

            if (this.inOperableDistance(this.target) && opTrigger && (this.target instanceof PathingEntity || !moved)) {
                const target = this.target;
                this.target = null;
                const state = ScriptRunner.init(opTrigger, this, target);

                this.executeScript(state, true);

                if (this.target === null) {
                    this.unsetMapFlag();
                }

                this.interacted = true;
            } else if (this.inApproachDistance(this.apRange, this.target) && apTrigger) {
                this.apRangeCalled = false;

                const target = this.target;
                this.target = null;
                const state = ScriptRunner.init(apTrigger, this, target);

                this.executeScript(state, true);

                if (this.apRangeCalled) {
                    this.target = target;
                }

                if (this.target === null) {
                    this.unsetMapFlag();
                }

                this.interacted = true;
            } else if (this.inOperableDistance(this.target) && (this.target instanceof PathingEntity || !moved)) {
                if (Environment.LOCAL_DEV && !opTrigger && !apTrigger) {
                    let debugname = '_';
                    if (this.target instanceof Npc) {
                        debugname = NpcType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.target instanceof Loc) {
                        debugname = LocType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.target instanceof Obj) {
                        debugname = ObjType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.targetSubject !== -1) {
                        if (this.targetOp === ServerTriggerType.APNPCT || this.targetOp === ServerTriggerType.APPLAYERT || this.targetOp === ServerTriggerType.APLOCT || this.targetOp === ServerTriggerType.APOBJT) {
                            debugname = Component.get(this.targetSubject)?.comName ?? this.targetSubject.toString();
                        } else {
                            debugname = ObjType.get(this.targetSubject)?.debugname ?? this.targetSubject.toString();
                        }
                    }

                    this.messageGame(`No trigger for [${ServerTriggerType[this.targetOp + 7].toLowerCase()},${debugname}]`);
                }

                this.target = null;
                this.messageGame('Nothing interesting happens.');
                this.interacted = true;
            }
        }

        if (!this.interacted && !this.hasWaypoints() && !moved) {
            this.messageGame("I can't reach that!");
            this.clearInteraction();
        }

        if (this.interacted && !this.apRangeCalled && this.target === null) {
            this.clearInteraction();
        }
    }

    // ----

    updateMap() {
        const dx = Math.abs(this.x - this.loadedX);
        const dz = Math.abs(this.z - this.loadedZ);

        // if the build area should be regenerated, do so now
        const { tele } = this.getMovementDir(); // wasteful but saves time on loading lines
        if (dx >= 36 || dz >= 36 || (tele && (Position.zone(this.x) !== Position.zone(this.loadedX) || Position.zone(this.z) !== Position.zone(this.loadedZ)))) {
            this.loadArea(Position.zone(this.x), Position.zone(this.z));

            this.loadedX = this.x;
            this.loadedZ = this.z;
            this.loadedZones = {};
        }
    }

    updateZones() {
        // check nearby zones for updates
        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;

        // update 3 zones around the player
        for (let x = centerX - 3; x <= centerX + 3; x++) {
            for (let z = centerZ - 3; z <= centerZ + 3; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                const zone = World.getZone(x << 3, z << 3, this.level);

                if (typeof this.loadedZones[zone.index] === 'undefined') {
                    // full update necessary to clear client zone memory
                    this.write(ServerProt.UPDATE_ZONE_FULL_FOLLOWS, x, z, this.loadedX, this.loadedZ);
                }

                if (zone.buffer.length > 0) {
                    this.write(ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED, x, z, this.loadedX, this.loadedZ, zone.buffer);
                }

                this.loadedZones[zone.index] = World.currentTick;
            }
        }
    }

    // ----

    isWithinDistance(other: Entity) {
        const dx = Math.abs(this.x - other.x);
        const dz = Math.abs(this.z - other.z);

        return dz < 16 && dx < 16 && this.level == other.level;
    }

    getNearbyPlayers(): number[] {
        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;

        // +/- 52 results in visibility at the border
        const absLeftX = this.loadedX - 48;
        const absRightX = this.loadedX + 48;
        const absTopZ = this.loadedZ + 48;
        const absBottomZ = this.loadedZ - 48;

        // update 2 zones around the player
        const nearby = [];
        for (let x = centerX - 2; x <= centerX + 2; x++) {
            for (let z = centerZ - 2; z <= centerZ + 2; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                const { players } = World.getZone(x << 3, z << 3, this.level);

                for (const uid of players) {
                    const player = World.getPlayerByUid(uid);
                    if (player === null || uid === this.uid || player.x < absLeftX || player.x >= absRightX || player.z >= absTopZ || player.z < absBottomZ) {
                        continue;
                    }

                    if (this.isWithinDistance(player)) {
                        nearby.push(uid);
                    }
                }
            }
        }

        return nearby;
    }

    updatePlayers() {
        const nearby = this.getNearbyPlayers();

        const bitBlock = new Packet();
        const byteBlock = new Packet();

        // temp variables to convert movement operations
        const { walkDir, runDir, tele } = this.getMovementDir();

        // update local player
        bitBlock.bits();
        bitBlock.pBit(1, tele || walkDir !== -1 || runDir !== -1 || this.mask > 0 ? 1 : 0);
        if (tele) {
            bitBlock.pBit(2, 3);
            bitBlock.pBit(2, this.level);
            bitBlock.pBit(7, Position.local(this.x));
            bitBlock.pBit(7, Position.local(this.z));
            bitBlock.pBit(1, this.jump ? 1 : 0);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (runDir !== -1) {
            bitBlock.pBit(2, 2);
            bitBlock.pBit(3, walkDir);
            bitBlock.pBit(3, runDir);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (walkDir !== -1) {
            bitBlock.pBit(2, 1);
            bitBlock.pBit(3, walkDir);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.mask > 0) {
            bitBlock.pBit(2, 0);
        }

        if (this.mask > 0) {
            this.writeUpdate(this, byteBlock, true);
        }

        // update other players (255 max - 8 bits)
        bitBlock.pBit(8, this.players.size);

        for (const uid of this.players) {
            const player = World.getPlayerByUid(uid);

            const loggedOut = !player;
            const notNearby = nearby.findIndex(p => p === uid) === -1;

            if (loggedOut || notNearby) {
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.players.delete(uid);
                continue;
            }

            const { walkDir, runDir, tele } = player.getMovementDir();
            if (tele) {
                // player full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.players.delete(uid);
                continue;
            }

            let hasMaskUpdate = player.mask > 0;

            const bitBlockBytes = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.length + player.calculateUpdateSize(false, false) > 5000) {
                hasMaskUpdate = false;
            }

            bitBlock.pBit(1, walkDir !== -1 || runDir !== -1 || hasMaskUpdate ? 1 : 0);
            if (runDir !== -1) {
                bitBlock.pBit(2, 2);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(3, runDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (walkDir !== -1) {
                bitBlock.pBit(2, 1);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (hasMaskUpdate) {
                bitBlock.pBit(2, 0);
            }

            if (hasMaskUpdate) {
                player.writeUpdate(this, byteBlock);
            }
        }

        // add new players
        // todo: add based on distance radius that shrinks if too many players are visible?
        for (let i = 0; i < nearby.length && this.players.size < 255; i++) {
            const uid = nearby[i];
            if (this.players.has(uid)) {
                continue;
            }

            const player = World.getPlayerByUid(uid);
            if (player === null) {
                continue;
            }

            // todo: tele optimization (not re-sending appearance block for recently observed players (they stay in memory))
            const hasInitialUpdate = true;

            const bitBlockSize = bitBlock.bitPos + 11 + 5 + 5 + 1 + 1;
            const bitBlockBytes = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.length + player.calculateUpdateSize(false, true) > 5000) {
                // more players get added next tick
                break;
            }

            bitBlock.pBit(11, player.pid);
            bitBlock.pBit(5, player.x - this.x);
            bitBlock.pBit(5, player.z - this.z);
            bitBlock.pBit(1, player.jump ? 1 : 0);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            if (hasInitialUpdate) {
                player.writeUpdate(this, byteBlock, false, true);
            }

            this.players.add(player.uid);
        }

        if (byteBlock.length > 0) {
            bitBlock.pBit(11, 2047);
        }

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.player.bin');
        this.write(ServerProt.PLAYER_INFO, bitBlock, byteBlock);
    }

    getAppearanceInSlot(slot: number) {
        let part = -1;
        if (slot === 8) {
            part = this.body[0];
        } else if (slot === 11) {
            part = this.body[1];
        } else if (slot === 4) {
            part = this.body[2];
        } else if (slot === 6) {
            part = this.body[3];
        } else if (slot === 9) {
            part = this.body[4];
        } else if (slot === 7) {
            part = this.body[5];
        } else if (slot === 10) {
            part = this.body[6];
        }

        if (part === -1) {
            return 0;
        } else {
            return 0x100 + part;
        }
    }

    getCombatLevel() {
        const base = 0.25 * (this.baseLevels[Player.DEFENCE] + this.baseLevels[Player.HITPOINTS] + Math.floor(this.baseLevels[Player.PRAYER] / 2));
        const melee = 0.325 * (this.baseLevels[Player.ATTACK] + this.baseLevels[Player.STRENGTH]);
        const range = 0.325 * (Math.floor(this.baseLevels[Player.RANGED] / 2) + this.baseLevels[Player.RANGED]);
        const magic = 0.325 * (Math.floor(this.baseLevels[Player.MAGIC] / 2) + this.baseLevels[Player.MAGIC]);
        return Math.floor(base + Math.max(melee, range, magic));
    }

    generateAppearance(inv: number) {
        const stream = new Packet();

        stream.p1(this.gender);
        stream.p1(this.headicons);

        const skippedSlots = [];

        let worn = this.getInventory(inv);
        if (!worn) {
            worn = new Inventory(0);
        }

        for (let i = 0; i < worn.capacity; i++) {
            const equip = worn.get(i);
            if (!equip) {
                continue;
            }

            const config = ObjType.get(equip.id);

            if (config.wearpos2 !== -1) {
                if (skippedSlots.indexOf(config.wearpos2) === -1) {
                    skippedSlots.push(config.wearpos2);
                }
            }

            if (config.wearpos3 !== -1) {
                if (skippedSlots.indexOf(config.wearpos3) === -1) {
                    skippedSlots.push(config.wearpos3);
                }
            }
        }

        for (let slot = 0; slot < 12; slot++) {
            if (skippedSlots.indexOf(slot) !== -1) {
                stream.p1(0);
                continue;
            }

            const equip = worn.get(slot);
            if (!equip) {
                const appearanceValue = this.getAppearanceInSlot(slot);
                if (appearanceValue < 1) {
                    stream.p1(0);
                } else {
                    stream.p2(appearanceValue);
                }
            } else {
                stream.p2(0x200 + equip.id);
            }
        }

        for (let i = 0; i < this.colors.length; i++) {
            stream.p1(this.colors[i]);
        }

        stream.p2(this.basReadyAnim);
        stream.p2(this.basTurnOnSpot);
        stream.p2(this.basWalkForward);
        stream.p2(this.basWalkBackward);
        stream.p2(this.basWalkLeft);
        stream.p2(this.basWalkRight);
        stream.p2(this.basRunning);

        stream.p8(this.username37);
        stream.p1(this.combatLevel);

        this.mask |= Player.APPEARANCE;
        this.appearance = stream;
    }

    calculateUpdateSize(self = false, newlyObserved = false) {
        let length = 0;
        let mask = this.mask;
        if (newlyObserved) {
            mask |= Player.APPEARANCE;
        }
        if (newlyObserved && (this.orientation != -1 || this.faceX != -1 || this.faceZ != -1)) {
            mask |= Player.FACE_COORD;
        }
        if (newlyObserved && this.faceEntity != -1) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xff) {
            mask |= 0x80;
        }

        if (self && mask & Player.CHAT) {
            // don't echo back local chat
            mask &= ~Player.CHAT;
        }

        length += 1;
        if (mask & 0x80) {
            length += 1;
        }

        if (mask & Player.APPEARANCE) {
            length += 1;
            length += this.appearance?.length ?? 0;
        }

        if (mask & Player.ANIM) {
            length += 3;
        }

        if (mask & Player.FACE_ENTITY) {
            length += 2;
        }

        if (mask & Player.SAY) {
            length += this.chat?.length ?? 0;
        }

        if (mask & Player.DAMAGE) {
            length += 4;
        }

        if (mask & Player.FACE_COORD) {
            length += 4;
        }

        if (mask & Player.CHAT) {
            length += 4;
            length += this.message?.length ?? 0;
        }

        if (mask & Player.SPOTANIM) {
            length += 6;
        }

        if (mask & Player.EXACT_MOVE) {
            length += 9;
        }

        return length;
    }

    writeUpdate(observer: Player, out: Packet, self = false, newlyObserved = false) {
        let mask = this.mask;
        if (newlyObserved) {
            mask |= Player.APPEARANCE;
        }
        if (newlyObserved && (this.orientation != -1 || this.faceX != -1 || this.faceZ != -1)) {
            mask |= Player.FACE_COORD;
        }
        if (newlyObserved && this.faceEntity != -1) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xff) {
            mask |= 0x80;
        }

        if (self && mask & Player.CHAT) {
            // don't echo back local chat
            mask &= ~Player.CHAT;
        }

        out.p1(mask & 0xff);
        if (mask & 0x80) {
            out.p1(mask >> 8);
        }

        if (mask & Player.APPEARANCE) {
            out.p1(this.appearance!.length);
            out.pdata(this.appearance!);
        }

        if (mask & Player.ANIM) {
            out.p2(this.animId);
            out.p1(this.animDelay);
        }

        if (mask & Player.FACE_ENTITY) {
            if (this.faceEntity !== -1) {
                this.alreadyFacedEntity = true;
            }

            out.p2(this.faceEntity);
        }

        if (mask & Player.SAY) {
            out.pjstr(this.chat);
        }

        if (mask & Player.DAMAGE) {
            out.p1(this.damageTaken);
            out.p1(this.damageType);
            out.p1(this.levels[Player.HITPOINTS]);
            out.p1(this.baseLevels[Player.HITPOINTS]);
        }

        if (mask & Player.FACE_COORD) {
            if (this.faceX !== -1) {
                this.alreadyFacedCoord = true;
            }

            if (newlyObserved && this.faceX != -1) {
                out.p2(this.faceX);
                out.p2(this.faceZ);
            } else if (newlyObserved && this.orientation != -1) {
                const faceX = Position.moveX(this.x, this.orientation);
                const faceZ = Position.moveZ(this.z, this.orientation);
                out.p2(faceX * 2 + 1);
                out.p2(faceZ * 2 + 1);
            } else {
                out.p2(this.faceX);
                out.p2(this.faceZ);
            }
        }

        if (mask & Player.CHAT) {
            out.p1(this.messageColor!);
            out.p1(this.messageEffect!);
            out.p1(this.messageType!);

            out.p1(this.message!.length);
            out.pdata(this.message!);
        }

        if (mask & Player.SPOTANIM) {
            out.p2(this.graphicId);
            out.p2(this.graphicHeight);
            out.p2(this.graphicDelay);
        }

        if (mask & Player.EXACT_MOVE) {
            out.p1(this.exactStartX - Position.zoneOrigin(observer.loadedX));
            out.p1(this.exactStartZ - Position.zoneOrigin(observer.loadedZ));
            out.p1(this.exactEndX - Position.zoneOrigin(observer.loadedX));
            out.p1(this.exactEndZ - Position.zoneOrigin(observer.loadedZ));
            out.p2(this.exactMoveStart);
            out.p2(this.exactMoveEnd);
            out.p1(this.exactMoveDirection);
        }
    }

    // ----

    getNearbyNpcs(): number[] {
        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;

        // +/- 52 results in visibility at the border
        const absLeftX = this.loadedX - 48;
        const absRightX = this.loadedX + 48;
        const absTopZ = this.loadedZ + 48;
        const absBottomZ = this.loadedZ - 48;

        // update 2 zones around the player
        const nearby = [];
        for (let x = centerX - 2; x <= centerX + 2; x++) {
            for (let z = centerZ - 2; z <= centerZ + 2; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                const { npcs } = World.getZone(x << 3, z << 3, this.level);

                for (const nid of npcs) {
                    const npc = World.getNpc(nid);
                    if (npc === null || npc.despawn !== -1 || npc.x < absLeftX || npc.x >= absRightX || npc.z >= absTopZ || npc.z < absBottomZ) {
                        continue;
                    }

                    if (this.isWithinDistance(npc)) {
                        nearby.push(nid);
                    }
                }
            }
        }

        return nearby;
    }

    updateNpcs() {
        const nearby = this.getNearbyNpcs();

        const bitBlock = new Packet();
        const byteBlock = new Packet();

        // update existing npcs (255 max - 8 bits)
        bitBlock.bits();
        bitBlock.pBit(8, this.npcs.size);

        for (const nid of this.npcs) {
            const npc = World.getNpc(nid);

            const despawned = !npc;
            const notNearby = nearby.findIndex(n => n === nid) === -1;

            if (despawned || notNearby) {
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.npcs.delete(nid);
                continue;
            }

            const { walkDir, runDir, tele } = npc.getMovementDir();
            if (tele) {
                // npc full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.npcs.delete(nid);
                continue;
            }

            let hasMaskUpdate = npc.mask > 0;

            const bitBlockBytes = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.length + npc.calculateUpdateSize(false) > 5000) {
                hasMaskUpdate = false;
            }

            bitBlock.pBit(1, runDir !== -1 || walkDir !== -1 || hasMaskUpdate ? 1 : 0);
            if (runDir !== -1) {
                bitBlock.pBit(2, 2);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(3, runDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (walkDir !== -1) {
                bitBlock.pBit(2, 1);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (hasMaskUpdate) {
                bitBlock.pBit(2, 0);
            }

            if (hasMaskUpdate) {
                npc.writeUpdate(byteBlock, false);
            }
        }

        // add new npcs
        for (let i = 0; i < nearby.length && this.npcs.size < 255; i++) {
            const nid = nearby[i];
            if (this.npcs.has(nid)) {
                continue;
            }

            const npc = World.getNpc(nid);
            if (npc === null) {
                continue;
            }

            const hasInitialUpdate = npc.mask > 0 || npc.orientation !== -1 || npc.faceX !== -1 || npc.faceZ !== -1 || npc.faceEntity !== -1;

            const bitBlockSize = bitBlock.bitPos + 13 + 11 + 5 + 5 + 1;
            const bitBlockBytes = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.length + npc.calculateUpdateSize(true) > 5000) {
                // more npcs get added next tick
                break;
            }

            bitBlock.pBit(13, npc.nid);
            bitBlock.pBit(11, npc.type);
            bitBlock.pBit(5, npc.x - this.x);
            bitBlock.pBit(5, npc.z - this.z);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            this.npcs.add(npc.nid);

            if (hasInitialUpdate) {
                npc.writeUpdate(byteBlock, true);
            }
        }

        if (byteBlock.length > 0) {
            bitBlock.pBit(13, 8191);
        }

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.npc.bin');
        this.write(ServerProt.NPC_INFO, bitBlock, byteBlock);
    }

    updateStats() {
        for (let i = 0; i < this.stats.length; i++) {
            if (this.stats[i] !== this.lastStats[i] || this.levels[i] !== this.lastLevels[i]) {
                this.write(ServerProt.UPDATE_STAT, i, this.stats[i], this.levels[i]);
                this.lastStats[i] = this.stats[i];
                this.lastLevels[i] = this.levels[i];
            }
        }

        if (Math.floor(this.runenergy) / 100 !== Math.floor(this.lastRunEnergy) / 100) {
            this.write(ServerProt.UPDATE_RUNENERGY, this.runenergy);
            this.lastRunEnergy = this.runenergy;
        }
    }

    // ----

    getInventoryFromListener(listener: any) {
        if (listener.source === -1) {
            return World.getInventory(listener.type);
        } else {
            const player = World.getPlayerByUid(listener.source);
            if (!player) {
                return null;
            }

            return player.getInventory(listener.type);
        }
    }

    updateInvs() {
        let runWeightChanged = false;

        for (let i = 0; i < this.invListeners.length; i++) {
            const listener = this.invListeners[i];
            if (!listener) {
                continue;
            }

            if (listener.source === -1) {
                // world inventory
                const inv = World.getInventory(listener.type);
                if (!inv) {
                    continue;
                }

                if (inv.update || listener.firstSeen) {
                    this.write(ServerProt.UPDATE_INV_FULL, listener.com, inv);
                    listener.firstSeen = false;
                }
            } else {
                // player inventory
                const player = World.getPlayerByUid(listener.source);
                if (!player) {
                    continue;
                }

                const inv = player.getInventory(listener.type);
                if (!inv) {
                    continue;
                }

                if (inv.update || listener.firstSeen) {
                    this.write(ServerProt.UPDATE_INV_FULL, listener.com, inv);
                    listener.firstSeen = false;

                    const invType = InvType.get(listener.type);
                    if (invType.runweight) {
                        runWeightChanged = true;
                    }
                }
            }
        }

        if (runWeightChanged) {
            const current = this.runweight;
            this.calculateRunWeight();
            runWeightChanged = current !== this.runweight;
        }

        if (runWeightChanged) {
            this.write(ServerProt.UPDATE_RUNWEIGHT, Math.ceil(this.runweight / 1000));
        }
    }

    getInventory(inv: number): Inventory | null {
        if (inv === -1) {
            return null;
        }

        const invType = InvType.get(inv);
        let container = null;

        if (!invType) {
            return null;
        }

        if (invType.scope === InvType.SCOPE_SHARED) {
            container = World.getInventory(inv);
        } else {
            container = this.invs.get(inv);

            if (!container) {
                container = Inventory.fromType(inv);
                this.invs.set(inv, container);
            }
        }

        return container;
    }

    invListenOnCom(inv: number, com: number, source: number) {
        if (inv === -1) {
            return;
        }

        const index = this.invListeners.findIndex(l => l.type === inv && l.com === com);
        if (index !== -1) {
            // already listening
            return;
        }

        const invType = InvType.get(inv);
        if (invType.scope === InvType.SCOPE_SHARED) {
            source = -1;
        }

        this.invListeners.push({ type: inv, com, source, firstSeen: true });
    }

    invStopListenOnCom(com: number) {
        const index = this.invListeners.findIndex(l => l.com === com);
        if (index === -1) {
            return;
        }

        this.invListeners.splice(index, 1);
        this.write(ServerProt.UPDATE_INV_STOP_TRANSMIT, com);
    }

    invGetSlot(inv: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invGetSlot: Invalid inventory type: ' + inv);
        }

        if (!container.validSlot(slot)) {
            throw new Error('invGetSlot: Invalid slot: ' + slot);
        }

        return container.get(slot);
    }

    invClear(inv: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invClear: Invalid inventory type: ' + inv);
        }

        container.removeAll();
    }

    invAdd(inv: number, obj: number, count: number, assureFullInsertion: boolean = true): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invAdd: Invalid inventory type: ' + inv);
        }

        const transaction = container.add(obj, count, -1, assureFullInsertion);
        return transaction.completed;
    }

    invSet(inv: number, obj: number, count: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invSet: Invalid inventory type: ' + inv);
        }

        if (!container.validSlot(slot)) {
            throw new Error('invSet: Invalid slot: ' + slot);
        }

        container.set(slot, { id: obj, count });
    }

    invDel(inv: number, obj: number, count: number, beginSlot: number = -1): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invDel: Invalid inventory type: ' + inv);
        }

        // has to start at -1
        if (beginSlot < -1 || beginSlot >= this.invSize(inv)) {
            throw new Error('invDel: Invalid beginSlot: ' + beginSlot);
        }

        const transaction = container.remove(obj, count, beginSlot);
        return transaction.completed;
    }

    invDelSlot(inv: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invDelSlot: Invalid inventory type: ' + inv);
        }

        if (!container.validSlot(slot)) {
            throw new Error('invDelSlot: Invalid slot: ' + slot);
        }

        container.delete(slot);
    }

    invSize(inv: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invSize: Invalid inventory type: ' + inv);
        }

        return container.capacity;
    }

    invTotal(inv: number, obj: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invTotal: Invalid inventory type: ' + inv);
        }

        return container.getItemCount(obj);
    }

    invFreeSpace(inv: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invFreeSpace: Invalid inventory type: ' + inv);
        }

        return container.freeSlotCount;
    }

    invItemSpace(inv: number, obj: number, count: number, size: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invItemSpace: Invalid inventory type: ' + inv);
        }

        const objType = ObjType.get(obj);

        // oc_uncert
        let uncert = obj;
        if (objType.certtemplate >= 0 && objType.certlink >= 0) {
            uncert = objType.certlink;
        }
        if (objType.stackable || uncert != obj || container.stackType == Inventory.ALWAYS_STACK) {
            const stockObj = InvType.get(inv).stockobj.includes(obj);
            if (this.invTotal(inv, obj) == 0 && this.invFreeSpace(inv) == 0 && !stockObj) {
                return count;
            }
            return Math.max(0, count - (Inventory.STACK_LIMIT - this.invTotal(inv, obj)));
        }
        return Math.max(0, count - (this.invFreeSpace(inv) - (this.invSize(inv) - size)));
    }

    invMoveToSlot(fromInv: number, toInv: number, fromSlot: number, toSlot: number) {
        const from = this.getInventory(fromInv);
        if (!from) {
            throw new Error('invMoveToSlot: Invalid inventory type: ' + fromInv);
        }

        if (!from.validSlot(fromSlot)) {
            throw new Error('invMoveToSlot: Invalid from slot: ' + fromSlot);
        }

        const to = this.getInventory(toInv);
        if (!to) {
            throw new Error('invMoveToSlot: Invalid inventory type: ' + toInv);
        }

        if (!to.validSlot(toSlot)) {
            throw new Error('invMoveToSlot: Invalid to slot: ' + toSlot);
        }

        const fromObj = this.invGetSlot(fromInv, fromSlot);
        if (!fromObj) {
            throw new Error(`invMoveToSlot: Invalid from obj was null. This means the obj does not exist at this slot: ${fromSlot}`);
        }

        const toObj = this.invGetSlot(toInv, toSlot);
        this.invSet(toInv, fromObj.id, fromObj.count, toSlot);

        if (toObj) {
            this.invSet(fromInv, toObj.id, toObj.count, fromSlot);
        } else {
            this.invDelSlot(fromInv, fromSlot);
        }
    }

    invMoveFromSlot(fromInv: number, toInv: number, fromSlot: number) {
        const from = this.getInventory(fromInv);
        if (!from) {
            throw new Error('invMoveFromSlot: Invalid inventory type: ' + fromInv);
        }

        const to = this.getInventory(toInv);
        if (!to) {
            throw new Error('invMoveFromSlot: Invalid inventory type: ' + toInv);
        }

        if (!from.validSlot(fromSlot)) {
            throw new Error('invMoveFromSlot: Invalid from slot: ' + fromSlot);
        }

        const fromObj = this.invGetSlot(fromInv, fromSlot);
        if (!fromObj) {
            throw new Error(`invMoveFromSlot: Invalid from obj was null. This means the obj does not exist at this slot: ${fromSlot}`);
        }

        return {
            overflow: fromObj.count - this.invAdd(toInv, fromObj.id, fromObj.count),
            fromObj: fromObj.id
        };
    }

    invTotalCat(inv: number, category: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invTotalCat: Invalid inventory type: ' + inv);
        }

        return container.itemsFiltered.filter(obj => ObjType.get(obj.id).category == category).reduce((count, obj) => count + obj.count, 0);
    }

    // ----

    getVarp(varp: string | number) {
        if (typeof varp === 'string') {
            varp = VarPlayerType.getId(varp);
        }

        if (typeof varp !== 'number' || varp === -1) {
            console.error(`Invalid setVar call: ${varp}`);
            return -1;
        }

        return this.varps[varp as number];
    }

    setVar(varp: number | string, value: number) {
        if (typeof varp === 'string') {
            varp = VarPlayerType.getId(varp);
        }

        if (typeof varp !== 'number' || varp === -1) {
            throw new Error(`Invalid setVar call: ${varp}, ${value}`);
        }

        const varpType = VarPlayerType.get(varp);
        this.varps[varp] = value;

        if (varpType.transmit) {
            if (value < 256) {
                this.write(ServerProt.VARP_SMALL, varp, value);
            } else {
                this.write(ServerProt.VARP_LARGE, varp, value);
            }
        }
    }

    addXp(stat: number, xp: number) {
        // require xp is >= 0. there is no reason for a requested addXp to be negative.
        if (xp < 0) {
            throw new Error(`Invalid xp parameter for addXp call: Stat was: ${stat}, Exp was: ${xp}`);
        }

        // if the xp arg is 0, then we do not have to change anything or send an unnecessary stat packet.
        if (xp == 0) {
            return;
        }

        const multi = Number(Environment.XP_MULTIPLIER) || 1;
        this.stats[stat] += xp * multi;

        // cap to 200m, this is represented as "2 billion" because we use 32-bit signed integers and divide by 10 to give us a decimal point
        if (this.stats[stat] > 2_000_000_000) {
            this.stats[stat] = 2_000_000_000;
        }

        const before = this.baseLevels[stat];
        if (this.levels[stat] === this.baseLevels[stat]) {
            // only update if no buff/debuff is active
            this.levels[stat] = getLevelByExp(this.stats[stat]);
        }
        this.baseLevels[stat] = getLevelByExp(this.stats[stat]);

        if (this.baseLevels[stat] > before) {
            const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LEVELUP, stat, -1);

            if (script) {
                this.enqueueScript(script, PlayerQueueType.ENGINE);
            }
        }

        if (this.combatLevel != this.getCombatLevel()) {
            this.combatLevel = this.getCombatLevel();
            this.generateAppearance(InvType.getId('worn'));
        }
    }

    setLevel(stat: number, level: number) {
        this.baseLevels[stat] = level;
        this.levels[stat] = level;
        this.stats[stat] = getExpByLevel(level);

        if (this.getCombatLevel() != this.combatLevel) {
            this.combatLevel = this.getCombatLevel();
            this.generateAppearance(InvType.getId('worn'));
        }
    }

    playAnimation(seq: number, delay: number) {
        if (seq > SeqType.count) {
            return;
        }

        this.animId = seq;
        this.animDelay = delay;
        this.mask |= Player.ANIM;
    }

    spotanim(spotanim: number, height: number, delay: number) {
        this.graphicId = spotanim;
        this.graphicHeight = height;
        this.graphicDelay = delay;
        this.mask |= Player.SPOTANIM;
    }

    applyDamage(damage: number, type: number) {
        this.damageTaken = damage;
        this.damageType = type;

        const current = this.levels[Player.HITPOINTS];
        if (current - damage <= 0) {
            this.levels[Player.HITPOINTS] = 0;
            this.damageTaken = current;
        } else {
            this.levels[Player.HITPOINTS] = current - damage;
        }

        this.mask |= Player.DAMAGE;
    }

    say(message: string) {
        this.chat = message;
        this.mask |= Player.SAY;
    }

    faceSquare(x: number, z: number) {
        this.faceX = x * 2 + 1;
        this.faceZ = z * 2 + 1;
        this.orientation = Position.face(this.x, this.z, x, z);
        this.mask |= Player.FACE_COORD;
    }

    playSong(name: string) {
        name = name.toLowerCase().replaceAll(' ', '_');
        if (!name) {
            return;
        }

        const song = PRELOADED.get(name + '.mid');
        const crc = PRELOADED_CRC.get(name + '.mid');
        if (song && crc) {
            const length = song.length;

            this.write(ServerProt.MIDI_SONG, name, crc, length);
        }
    }

    playJingle(delay: number, name: string): void {
        name = name.toLowerCase().replaceAll('_', ' ');
        if (!name) {
            return;
        }
        const jingle = PRELOADED.get(name + '.mid');
        if (jingle) {
            this.write(ServerProt.MIDI_JINGLE, delay, jingle);
        }
    }

    openMainModal(com: number) {
        if (this.modalState & 4) {
            this.write(ServerProt.IF_CLOSE); // need to close sidemodal
            this.modalState &= ~4;
            this.modalSidebar = -1;
        }

        this.modalState |= 1;
        this.modalTop = com;
        this.refreshModal = true;
    }

    openChat(com: number) {
        this.modalState |= 2;
        this.modalBottom = com;
        this.refreshModal = true;
    }

    openSideOverlay(com: number) {
        this.modalState |= 4;
        this.modalSidebar = com;
        this.refreshModal = true;
    }

    openChatSticky(com: number) {
        this.write(ServerProt.TUTORIAL_OPENCHAT, com);
        this.modalState |= 8;
        this.modalSticky = com;
    }

    openMainModalSideOverlay(top: number, side: number) {
        this.modalState |= 1;
        this.modalTop = top;
        this.modalState |= 4;
        this.modalSidebar = side;
        this.refreshModal = true;
    }

    exactMove(startX: number, startZ: number, endX: number, endZ: number, startCycle: number, endCycle: number, direction: number) {
        this.exactStartX = startX;
        this.exactStartZ = startZ;
        this.exactEndX = endX;
        this.exactEndZ = endZ;
        this.exactMoveStart = startCycle;
        this.exactMoveEnd = endCycle;
        this.exactMoveDirection = direction;
        this.mask |= Player.EXACT_MOVE;

        // todo: interpolate over time? instant teleport? verify with true tile on osrs
        this.x = endX;
        this.z = endZ;
    }

    setTab(com: number, tab: number) {
        this.overlaySide[tab] = com;
        this.write(ServerProt.IF_OPENSIDEOVERLAY, com, tab);
    }

    isComponentVisible(com: Component) {
        return this.modalTop === com.rootLayer || this.modalBottom === com.rootLayer || this.modalSidebar === com.rootLayer || this.overlaySide.findIndex(l => l === com.rootLayer) !== -1 || this.modalSticky === com.rootLayer;
    }

    // ----

    runScript(script: ScriptState, protect: boolean = false, force: boolean = false) {
        // console.log('Executing', script.script.info.scriptName);

        if (!force && protect && (this.protect || this.delayed())) {
            // can't get protected access, bye-bye
            // console.log('No protected access:', script.script.info.scriptName, protect, this.protect);
            return -1;
        }

        if (protect) {
            script.pointerAdd(ScriptPointer.ProtectedActivePlayer);
            this.protect = true;
        }

        const state = ScriptRunner.execute(script);

        if (protect) {
            this.protect = false;
        }

        if (script.pointerGet(ScriptPointer.ProtectedActivePlayer) && script._activePlayer) {
            script.pointerRemove(ScriptPointer.ProtectedActivePlayer);
            script._activePlayer.protect = false;
        }

        if (script.pointerGet(ScriptPointer.ProtectedActivePlayer2) && script._activePlayer2) {
            script.pointerRemove(ScriptPointer.ProtectedActivePlayer2);
            script._activePlayer2.protect = false;
        }

        return state;
    }

    executeScript(script: ScriptState, protect: boolean = false, force: boolean = false) {
        // console.log('Executing', script.script.info.scriptName);

        const state = this.runScript(script, protect, force);
        if (state === -1) {
            // console.log('Script did not run', script.script.info.scriptName, protect, this.protect);
            return;
        }

        if (state !== ScriptState.FINISHED && state !== ScriptState.ABORTED) {
            if (state === ScriptState.WORLD_SUSPENDED) {
                World.enqueueScript(script, script.popInt());
            } else if (state === ScriptState.NPC_SUSPENDED) {
                script.activeNpc.activeScript = script;
            } else {
                script.activePlayer.activeScript = script;
                script.activePlayer.protect = protect; // preserve protected access when delayed
            }
        } else if (script === this.activeScript) {
            this.activeScript = null;

            if ((this.modalState & 1) == 0) {
                this.closeModal();
            }
        }
    }

    wrappedMessageGame(mes: string) {
        const font = FontType.get(1);
        const lines = font.split(mes, 456);
        for (const line of lines) {
            this.messageGame(line);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    write(opcode: ServerProt, ...args: any[]) {
        if (opcode < 0 || opcode > 255 || !ServerProtEncoders[opcode]) {
            return;
        }

        // console.log('write', ServerProt[opcode], ServerProtLengths[opcode], args);

        const buf = new Packet();
        buf.p1(opcode);

        if (ServerProtLengths[opcode] === -1) {
            buf.p1(0);
        } else if (ServerProtLengths[opcode] === -2) {
            buf.p2(0);
        }
        const start = buf.pos;

        ServerProtEncoders[opcode](buf, ...args);

        if (ServerProtLengths[opcode] === -1) {
            buf.psize1(buf.pos - start);
        } else if (ServerProtLengths[opcode] === -2) {
            buf.psize2(buf.pos - start);
        }

        // console.log(buf.data);
        this.netOut.push(buf);
    }

    unsetMapFlag() {
        this.clearWalkSteps();
        this.write(ServerProt.UNSET_MAP_FLAG);
    }

    hintNpc(nid: number) {
        this.write(ServerProt.HINT_ARROW, 1, nid, 0, 0, 0, 0);
    }

    hintTile(offset: number, x: number, z: number, height: number) {
        this.write(ServerProt.HINT_ARROW, offset, 0, 0, x, z, height);
    }

    hintPlayer(pid: number) {
        this.write(ServerProt.HINT_ARROW, 10, 0, pid, 0, 0, 0);
    }

    stopHint() {
        this.write(ServerProt.HINT_ARROW, -1, 0, 0, 0, 0, 0);
    }

    lastLoginInfo(lastLoginIp: number, daysSinceLogin: number, daysSinceRecoveryChange: number, unreadMessageCount: number) {
        this.write(ServerProt.LAST_LOGIN_INFO, lastLoginIp, daysSinceLogin, daysSinceRecoveryChange, unreadMessageCount);
        this.modalState |= 16;
    }

    logout() {
        const out = new Packet();
        out.p1(ServerProt.LOGOUT);

        this.writeImmediately(out);
    }

    messageGame(msg: string) {
        this.write(ServerProt.MESSAGE_GAME, msg);
    }

    // todo
    loadArea(zoneX: number, zoneZ: number) {
        const out = new Packet();
        out.p1(ServerProt.REBUILD_NORMAL);
        out.p2(0);
        const start = out.pos;

        out.p2(zoneX);
        out.p2(zoneZ);

        // build area is 13x13 zones (8*13 = 104 tiles), so we need to load 6 zones in each direction
        const areas: { mapsquareX: number; mapsquareZ: number }[] = [];
        for (let x = zoneX - 6; x <= zoneX + 6; x++) {
            for (let z = zoneZ - 6; z <= zoneZ + 6; z++) {
                const mapsquareX = Position.mapsquare(x << 3);
                const mapsquareZ = Position.mapsquare(z << 3);

                if (areas.findIndex(a => a.mapsquareX === mapsquareX && a.mapsquareZ === mapsquareZ) === -1) {
                    areas.push({ mapsquareX, mapsquareZ });
                }
            }
        }

        for (let i = 0; i < areas.length; i++) {
            const { mapsquareX, mapsquareZ } = areas[i];
            out.p1(mapsquareX);
            out.p1(mapsquareZ);
            out.p4(PRELOADED_CRC.get(`m${mapsquareX}_${mapsquareZ}`) ?? 0);
            out.p4(PRELOADED_CRC.get(`l${mapsquareX}_${mapsquareZ}`) ?? 0);
        }

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }
}
