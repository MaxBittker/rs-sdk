import 'dotenv/config';
import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';
import { fromBase37, toBase37 } from '#jagex2/jstring/JString.js';

import CollisionFlag from '#rsmod/flag/CollisionFlag.js';

import CategoryType from '#lostcity/cache/CategoryType.js';
import FontType from '#lostcity/cache/FontType.js';
import DbRowType from '#lostcity/cache/DbRowType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import EnumType from '#lostcity/cache/EnumType.js';
import HuntType from '#lostcity/cache/HuntType.js';
import IfType from '#lostcity/cache/IfType.js';
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
import { EntityQueueRequest, QueueType, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Loc from '#lostcity/entity/Loc.js';
import Npc from '#lostcity/entity/Npc.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import Obj from '#lostcity/entity/Obj.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import { Position } from '#lostcity/entity/Position.js';

import { ClientProt, ClientProtLengths } from '#lostcity/server/ClientProt.js';
import ClientSocket from '#lostcity/server/ClientSocket.js';
import { ServerProt } from '#lostcity/server/ServerProt.js';

import { Inventory } from '#lostcity/engine/Inventory.js';
import World from '#lostcity/engine/World.js';

import Script from '#lostcity/engine/script/Script.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import IdkType from '#lostcity/cache/IdkType.js';

const levelExperience = new Int32Array(99);

let acc = 0;
for (let i = 0; i < 99; i++) {
    const level = i + 1;
    const delta = Math.floor(level + Math.pow(2.0, level / 7.0) * 300.0);
    acc += delta;
    levelExperience[i] = Math.floor((acc / 4)) * 10;
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

function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

const PRELOADED = new Map<string, Uint8Array>();
const PRELOADED_CRC = new Map<string, number>();

if (process.env.CI_MODE !== 'true') {
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
        'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer',
        'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking',
        'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving',
        'stat18', 'stat19', 'runecraft'
    ];

    static DESIGN_BODY_COLORS: number[][] = [
        [ 6798, 107, 10283, 16, 4797, 7744, 5799, 4634, 33697, 22433, 2983, 54193 ],
        [ 8741, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003, 25239 ],
        [ 25238, 8742, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003 ],
        [ 4626, 11146, 6439, 12, 4758, 10270 ],
        [ 4550, 4537, 5681, 5673, 5790, 6806, 8076, 4574 ]
    ];

    static load(name: string) {
        const name37 = toBase37(name);
        const safeName = fromBase37(name37);

        const player = new Player(safeName, name37);

        if (!fs.existsSync(`data/players/${safeName}.sav`)) {
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

        const sav = Packet.load(`data/players/${safeName}.sav`);
        if (sav.g2() !== 0x2004) {
            throw new Error('Invalid player save');
        }

        if (sav.g2() > 1) {
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
        player.playtime = sav.g2();

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

        player.lastResponse = World.currentTick;
        return player;
    }

    save() {
        const sav = new Packet();
        sav.p2(0x2004); // magic
        sav.p2(1); // version

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
        sav.p2(this.playtime);

        for (let i = 0; i < 21; i++) {
            sav.p4(this.stats[i]);

            if (this.levels[i] === 0) {
                sav.p1(this.levels[i]);
            } else {
                sav.p1(getLevelByExp(this.stats[i]));
            }
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
    runenergy: number;
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
    loadedX: number = -1; // build area
    loadedZ: number = -1;
    loadedZones: Record<number, number> = {};
    npcIds: number[] = []; // observed npcs
    playerIds: number[] = []; // observed players
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
        type: number, // InvType
        com: number, // IfType
        source: number, // uid or -1 for world
        firstSeen: boolean
    }[] = [];
    allowDesign: boolean = false;

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
    receivedFirstClose = false; // workaround to not close welcome screen on login

    interacted: boolean = false;
    interactionSet: boolean = false;
    repathed: boolean = false;
    target: (Player | Npc | Loc | Obj | null) = null;
    targetOp: number = -1;
    targetSubject: number = -1; // for [opplayeru,obj]
    apRange: number = 10;
    apRangeCalled: boolean = false;

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
        this.displayName = toTitleCase(username);
        this.varps = new Int32Array(VarPlayerType.count);
        this.body = [
            0, // hair
            10, // beard
            18, // body
            26, // arms
            33, // gloves
            36, // legs
            42, // boots
        ];
        this.colors = [
            0,
            0,
            0,
            0,
            0
        ];
        this.gender = 0;
        this.runenergy = 10000;
        this.runweight = 0;
        this.playtime = 0;
        this.lastStats.fill(-1);
    }

    resetEntity(respawn: boolean) {
        this.resetPathingEntity();
        this.repathed = false;

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
                length = this.client.in[offset++] << 8 | this.client.in[offset++];
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

            if (opcode === ClientProt.MAP_REQUEST_AREAS) {
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
                            this.dataLand(x, z, land.subarray(off, off + CHUNK_SIZE), off, land.length);
                        }

                        this.dataLandDone(x, z);
                    } else if (type == 1) {
                        const loc = PRELOADED.get(`l${x}_${z}`);
                        if (!loc) {
                            continue;
                        }

                        for (let off = 0; off < loc.length; off += CHUNK_SIZE) {
                            this.dataLoc(x, z, loc.subarray(off, off + CHUNK_SIZE), off, loc.length);
                        }

                        this.dataLocDone(x, z);
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

                if (this.delayed() || running < 0 || running > 1 || Position.distanceTo(this, { x: pathfindX, z: pathfindZ }) > 104) {
                    pathfindX = -1;
                    pathfindZ = -1;
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                this.setVarp('temp_run', running);
                pathfindRequest = true;
            } else if (opcode === ClientProt.MOVE_OPCLICK) {
                const running = data.g1();
                
                if (running < 0 || running > 1) {
                    continue;
                }
                
                this.setVarp('temp_run', running);
            } else if (opcode === ClientProt.CLIENT_CHEAT) {
                const cheat = data.gjstr();

                if (cheat.length > 80) {
                    continue;
                }

                this.onCheat(cheat);
            } else if (opcode === ClientProt.MESSAGE_PUBLIC) {
                const colour = data.g1();
                const effect = data.g1();
                const message = data.gdata();

                if (colour < 0 || colour > 11 || effect < 0 || effect > 2 || message.length > 80) {
                    continue;
                }

                this.messageColor = colour;
                this.messageEffect = effect;
                this.messageType = 0;
                this.message = message;
                this.mask |= Player.CHAT;
            } else if (opcode === ClientProt.IF_DESIGN) {
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
            } else if (opcode === ClientProt.IF_FLASHING_TAB) {
                const tab = data.g1();

                if (tab < 0 || tab > 13) {
                    continue;
                }

                const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_FLASHING_TAB, -1, -1);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                }
            } else if (opcode === ClientProt.CLOSE_MODAL) {
                this.closeModal();
            } else if (opcode === ClientProt.RESUME_PAUSEBUTTON) {
                if (!this.activeScript || this.activeScript.execution !== ScriptState.PAUSEBUTTON) {
                    continue;
                }

                this.executeScript(this.activeScript);
            } else if (opcode === ClientProt.RESUME_P_COUNTDIALOG) {
                const input = data.g4();
                if (!this.activeScript || this.activeScript.execution !== ScriptState.COUNTDIALOG) {
                    continue;
                }

                this.lastInt = input;
                this.executeScript(this.activeScript);
            } else if (opcode === ClientProt.IF_BUTTON) {
                const com = data.g2();

                // TODO: verify component is opened
                const ifType = IfType.get(com);
                if (!ifType) {
                    continue;
                }

                this.lastCom = com;

                if (this.resumeButtons.indexOf(this.lastCom) !== -1) {
                    if (this.activeScript) {
                        this.executeScript(this.activeScript);
                    }
                } else {
                    const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_BUTTON, ifType.id, -1);
                    if (script) {
                        this.executeScript(ScriptRunner.init(script, this));
                    } else {
                        if (!process.env.PROD_MODE) {
                            this.messageGame(`No trigger for [if_button,${ifType.comName}]`);
                        }
                    }
                }
            } else if (opcode === ClientProt.INV_BUTTON1 || opcode === ClientProt.INV_BUTTON2 || opcode === ClientProt.INV_BUTTON3 || opcode === ClientProt.INV_BUTTON4 || opcode === ClientProt.INV_BUTTON5) {
                const item = data.g2();
                const slot = data.g2();
                const com = data.g2();

                const ifType = IfType.get(com);
                if (!ifType || !ifType.inventoryOptions || !ifType.inventoryOptions.length) {
                    continue;
                }

                // todo: validate against inv component properties
                if (opcode === ClientProt.INV_BUTTON1 && !ifType.inventoryOptions[0] ||
                    opcode === ClientProt.INV_BUTTON2 && !ifType.inventoryOptions[1] ||
                    opcode === ClientProt.INV_BUTTON3 && !ifType.inventoryOptions[2] ||
                    opcode === ClientProt.INV_BUTTON4 && !ifType.inventoryOptions[3] ||
                    opcode === ClientProt.INV_BUTTON5 && !ifType.inventoryOptions[4]
                ) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
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

                const script = ScriptProvider.getByTrigger(trigger, ifType.id, -1);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        this.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${ifType.comName}]`);
                    }
                }
            } else if (opcode === ClientProt.INV_BUTTOND) {
                const com = data.g2();
                const slot = data.g2();
                const targetSlot = data.g2();

                const ifType = IfType.get(com);
                if (!ifType) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.get(slot) || !inv.validSlot(targetSlot)) {
                    continue;
                }

                if (this.delayed()) {
                    // do nothing; revert the client visual
                    this.updateInvPartial(com, inv, [slot, targetSlot]);
                    continue;
                }

                this.lastSlot = slot;
                this.lastTargetSlot = targetSlot;

                const script = ScriptProvider.getByName(`[inv_buttond,${ifType.comName}]`);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        this.messageGame(`No trigger for [inv_buttond,${ifType.comName}]`);
                    }
                }
            } else if (opcode === ClientProt.OPHELD1 || opcode === ClientProt.OPHELD2 || opcode === ClientProt.OPHELD3 || opcode === ClientProt.OPHELD4 || opcode === ClientProt.OPHELD5) {
                const item = data.g2();
                const slot = data.g2();
                const com = data.g2();

                if (!IfType.get(com)) {
                    continue;
                }

                const type = ObjType.get(item);
                if (opcode === ClientProt.OPHELD1 && !type.iops[0] ||
                    opcode === ClientProt.OPHELD2 && !type.iops[1] ||
                    opcode === ClientProt.OPHELD3 && !type.iops[2] ||
                    opcode === ClientProt.OPHELD4 && !type.iops[3]
                ) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
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
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        this.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${type.debugname}]`);
                    }
                }
            } else if (opcode === ClientProt.OPHELDU) {
                const item = data.g2();
                const slot = data.g2();
                const com = data.g2();
                const useItem = data.g2();
                const useSlot = data.g2();
                const useCom = data.g2();

                if (!IfType.get(com)) {
                    continue;
                }

                if (!IfType.get(useCom)) {
                    continue;
                }

                {
                    const listener = this.invListeners.find(l => l.com === com);
                    if (!listener) {
                        continue;
                    }

                    const inv = this.getInventoryFromListener(listener);
                    if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                        continue;
                    }
                }

                {
                    const listener = this.invListeners.find(l => l.com === useCom);
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
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        this.messageGame(`No trigger for [opheldu,${objType.debugname}]`);
                    }

                    // todo: is this appropriate?
                    this.messageGame('Nothing interesting happens.');
                }
            } else if (opcode === ClientProt.OPHELDT) {
                const item = data.g2();
                const slot = data.g2();
                const com = data.g2();
                const spellCom = data.g2();

                if (!IfType.get(com)) {
                    continue;
                }

                if (!IfType.get(spellCom)) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
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

                const type = IfType.get(spellCom);
                const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELDT, type.id, -1);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        this.messageGame(`No trigger for [opheldt,${type.comName}]`);
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
                if (opcode === ClientProt.OPLOC1 && !locType.ops[0] ||
                    opcode === ClientProt.OPLOC2 && !locType.ops[1] ||
                    opcode === ClientProt.OPLOC3 && !locType.ops[2] ||
                    opcode === ClientProt.OPLOC4 && !locType.ops[3] ||
                    opcode === ClientProt.OPLOC5 && !locType.ops[4]
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
                const com = data.g2();

                if (!IfType.get(com)) {
                    continue;
                }

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
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
                const spellCom = data.g2();

                if (!IfType.get(spellCom)) {
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

                this.setInteraction(loc, ServerTriggerType.APLOCT, spellCom);
                pathfindX = loc.x;
                pathfindZ = loc.z;
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPNPC1 || opcode === ClientProt.OPNPC2 || opcode === ClientProt.OPNPC3 || opcode === ClientProt.OPNPC4 || opcode === ClientProt.OPNPC5) {
                const nid = data.g2();

                const npc = World.getNpc(nid);
                if (!npc) {
                    continue;
                }

                if (this.npcIds.indexOf(npc.nid) === -1 || npc.delayed()) {
                    continue;
                }

                const npcType = NpcType.get(npc.type);
                if (opcode === ClientProt.OPNPC1 && !npcType.ops[0] ||
                    opcode === ClientProt.OPNPC2 && !npcType.ops[1] ||
                    opcode === ClientProt.OPNPC3 && !npcType.ops[2] ||
                    opcode === ClientProt.OPNPC4 && !npcType.ops[3] ||
                    opcode === ClientProt.OPNPC5 && !npcType.ops[4]
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
                const com = data.g2();

                if (!IfType.get(com)) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
                if (!listener) {
                    continue;
                }

                const inv = this.getInventoryFromListener(listener);
                if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
                    continue;
                }

                const npc = World.getNpc(nid);
                if (!npc) {
                    continue;
                }

                if (this.npcIds.indexOf(npc.nid) === -1 || npc.delayed()) {
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
                const spellCom = data.g2();

                if (!IfType.get(spellCom)) {
                    continue;
                }

                const npc = World.getNpc(nid);
                if (!npc) {
                    continue;
                }

                if (this.npcIds.indexOf(npc.nid) === -1 || npc.delayed()) {
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(npc, ServerTriggerType.APNPCT, spellCom);
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
                if (opcode === ClientProt.OPOBJ1 && !objType.ops[0] ||
                    opcode === ClientProt.OPOBJ4 && !objType.ops[3]
                ) {
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
                const com = data.g2();

                if (!IfType.get(com)) {
                    continue;
                }

                const absLeftX = this.loadedX - 52;
                const absRightX = this.loadedX + 52;
                const absTopZ = this.loadedZ + 52;
                const absBottomZ = this.loadedZ - 52;
                if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
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
                const spellCom = data.g2();

                if (!IfType.get(spellCom)) {
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

                this.setInteraction(obj, ServerTriggerType.APOBJT, spellCom);
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

                if (!this.playerIds.find(uid => uid === player.uid)) {
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
                const com = data.g2();

                if (!IfType.get(com)) {
                    continue;
                }

                const listener = this.invListeners.find(l => l.com === com);
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

                if (!this.playerIds.find(uid => uid === player.uid)) {
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
                const spellCom = data.g2();

                if (!IfType.get(spellCom)) {
                    continue;
                }

                const player = World.getPlayer(pid);
                if (!player) {
                    // does player exist?
                    continue;
                }

                if (!this.playerIds.find(uid => uid === player.uid)) {
                    // are we aware of the player?
                    continue;
                }

                if (this.delayed()) {
                    continue;
                }

                this.clearInteraction();
                this.closeModal();

                this.setInteraction(player, ServerTriggerType.APPLAYERT, spellCom);
                pathfindX = player.x;
                pathfindZ = player.z;
                pathfindRequest = true;
            }
        }

        if (this.forceMove && pathfindX !== -1 && pathfindZ !== -1) {
            this.clearWalkingQueue();
            pathfindRequest = false;
            pathfindX = -1;
            pathfindZ = -1;
        }

        this.client?.reset();

        // process any pathfinder requests now
        if (pathfindRequest && pathfindX !== -1 && pathfindZ !== -1) {
            if (this.delayed()) {
                this.clearWalkingQueue();
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
                this.ifClose();
            }
            this.refreshModalClose = false;

            this.lastModalTop = this.modalTop;
            this.lastModalBottom = this.modalBottom;
            this.lastModalSidebar = this.modalSidebar;
        }

        if (this.refreshModal) {
            if ((this.modalState & 1) === 1 && (this.modalState & 4) === 4) {
                this.ifOpenMainModalSideOverlay(this.modalTop, this.modalSidebar);
            } else if ((this.modalState & 1) === 1) {
                this.ifOpenMainModal(this.modalTop);
            } else if ((this.modalState & 2) === 2) {
                this.ifOpenChat(this.modalBottom);
            } else if ((this.modalState & 4) === 4) {
                this.ifOpenSideOverlay(this.modalSidebar);
            }

            this.refreshModal = false;
        }

        for (let j = 0; j < this.netOut.length; j++) {
            const out = this.netOut[j];

            if (this.client.encryptor) {
                out.data[0] = (out.data[0] + this.client.encryptor.nextInt()) & 0xFF;
            }

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
            packet.data[0] = (packet.data[0] + this.client.encryptor.nextInt()) & 0xFF;
        }

        this.client.write(packet);
        this.client.flush();
    }

    // ----

    onLogin() {
        // normalize client between logins
        this.ifClose();
        this.updateUid192(this.pid);
        this.clearWalkingQueue();

        this.resetClientVarCache();
        for (let i = 0; i < this.varps.length; i++) {
            const type = VarPlayerType.get(i);
            const varp = this.varps[i];

            if (type.transmit && type.scope === VarPlayerType.SCOPE_PERM) {
                if (varp < 256) {
                    this.varpSmall(i, varp);
                } else {
                    this.varpLarge(i, varp);
                }
            }
        }

        const loginScript = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGIN, -1, -1);
        if (loginScript) {
            this.executeScript(ScriptRunner.init(loginScript, this));
        }

        this.updateRunEnergy(this.runenergy);
        this.updateRunWeight(this.runweight);
    }

    onCheat(cheat: string) {
        const args = cheat.toLowerCase().split(' ');
        const cmd = args.shift();
        if (!cmd) {
            return;
        }

        switch (cmd) {
            case 'reload': {
                // TODO: only reload config types that have changed to save time
                CategoryType.load('data/pack/server');
                ParamType.load('data/pack/server');
                EnumType.load('data/pack/server');
                StructType.load('data/pack/server');
                InvType.load('data/pack/server');
                VarPlayerType.load('data/pack/server');
                ObjType.load('data/pack/server', World.members);
                LocType.load('data/pack/server');
                NpcType.load('data/pack/server');
                IfType.load('data/pack/server');
                SeqType.load('data/pack/server');
                MesanimType.load('data/pack/server');
                DbTableType.load('data/pack/server');
                DbRowType.load('data/pack/server');
                HuntType.load('data/pack/server');

                const count = ScriptProvider.load('data/pack/server');
                this.messageGame(`Reloaded ${count} scripts.`);
            } break;
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
                    this.setVarp(varp, parseInt(value, 10));
                    this.messageGame(`Setting var ${varp} to ${value}`);
                } else {
                    this.messageGame(`Unknown var ${varp}`);
                }
            } break;
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
            } break;
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
            } break;
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
            } break;
            case 'minlevel': {
                for (let i = 0; i < Player.SKILLS.length; i++) {
                    if (i === Player.HITPOINTS) {
                        this.setLevel(i, 10);
                    } else {
                        this.setLevel(i, 1);
                    }
                }
            } break;
            case 'inter': {
                const name = args.shift();
                if (!name) {
                    this.messageGame('Usage: ::inter <inter>');
                    return;
                }

                const inter = IfType.getByName(name);
                if (!inter) {
                    this.messageGame(`Unknown interface ${args[0]}`);
                    return;
                }

                this.openMainModal(inter.id);
            } break;
            case 'serverdrop': {
                this.client?.terminate();
                this.client = null;
            } break;
            default: {
                if (cmd.length <= 0) {
                    return;
                }

                // lookup debugproc with the name and execute it
                const script = ScriptProvider.getByName(`[debugproc,${cmd}]`);
                if (!script) {
                    // this.messageGame(`Unable to locate [debugproc,${cmd}].`);
                    return;
                }

                const params = [];
                for (let i = 0; i < script.info.parameterTypes.length; i++) {
                    const type = script.info.parameterTypes[i];

                    switch (type) {
                        case ScriptVarType.STRING: {
                            const value = args.shift();

                            params.push(value ?? '');
                        } break;
                        case ScriptVarType.INT: {
                            const value = args.shift();

                            // todo: range check? runtime only operates on 32-bits
                            params.push(parseInt(value ?? '0', 10));
                        } break;
                        case ScriptVarType.NAMEDOBJ: {
                            const name = args.shift();

                            params.push(ObjType.getId(name ?? ''));
                        } break;
                        case ScriptVarType.NPC: {
                            const name = args.shift();

                            params.push(NpcType.getId(name ?? ''));
                        } break;
                        case ScriptVarType.LOC: {
                            const name = args.shift();

                            params.push(LocType.getId(name ?? ''));
                        } break;
                        case ScriptVarType.SEQ: {
                            const name = args.shift();

                            params.push(SeqType.getId(name ?? ''));
                        } break;
                        case ScriptVarType.STAT: {
                            const name = args.shift();

                            params.push(Player.SKILLS.indexOf(name ?? ''));
                        } break;
                        case ScriptVarType.INV: {
                            const name = args.shift();

                            params.push(InvType.getId(name ?? ''));
                        } break;
                        case ScriptVarType.COORD: {
                            const args2 = cheat.split('_');

                            const level = parseInt(args2[0].slice(6));
                            const mx = parseInt(args2[1]);
                            const mz = parseInt(args2[2]);
                            const lx = parseInt(args2[3]);
                            const lz = parseInt(args2[4]);

                            params.push(Position.packCoord(level, (mx << 6) + lx, (mz << 6) + lz));
                        } break;
                    }
                }

                this.executeScript(ScriptRunner.init(script, this, null, null, params));
            } break;
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
            if (!this.busy() && delay <= 0) {
                const state = ScriptRunner.init(queue.script, this, null, null, queue.args);
                const executionState = ScriptRunner.execute(state);

                if (executionState !== ScriptState.FINISHED && executionState !== ScriptState.ABORTED) {
                    this.activeScript = state;
                }

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
            const outOfRange = (!this.inApproachDistance(this.apRange, this.target) && apTrigger) && !this.inOperableDistance(this.target);
            const targetMoved = this.hasWaypoints() && (this.waypoints[0].x !== this.target.x || this.waypoints[0].z !== this.target.z);

            // broken out to understand better
            if (!this.hasWaypoints() && !this.interacted) {
                this.pathToTarget();
            } else if (outOfRange) {
                this.pathToTarget();
            } else if (targetMoved && !this.interactionSet) {
                this.pathToTarget();
            }
        }

        if (this.hasWaypoints() && this.moveCheck !== null) {
            const script = ScriptProvider.get(this.moveCheck);
            if (script) {
                const state = ScriptRunner.init(script, this);
                ScriptRunner.execute(state);

                const result = state.popInt();
                if (!result) {
                    return false;
                }
            }

            this.moveCheck = null;
        }

        if (running === -1 && !this.forceMove) {
            running = 0;
            running |= this.getVarp('player_run') ? 1 : 0;
            running |= this.getVarp('temp_run') ? 1 : 0;
        }
        if (!super.processMovement(running)) {
            this.setVarp('temp_run', 0);
        }

        const moved = this.lastX !== this.x || this.lastZ !== this.z;
        if (moved) {
            const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.MOVE, -1, -1);

            if (script) {
                const state = ScriptRunner.init(script, this);
                ScriptRunner.execute(state);
            }

            this.refreshZonePresence(this.lastX, this.lastZ, this.level);
        }

        return moved;
    }

    blockWalkFlag(): number {
        return CollisionFlag.PLAYER;
    }

    // ----

    closeSticky() {
        if (this.modalSticky !== -1) {
            const modalType = IfType.get(this.modalSticky);

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }

            this.modalSticky = -1;
            this.ifOpenChatSticky(-1);
        }
    }

    closeModal() {
        if (!this.receivedFirstClose) {
            this.receivedFirstClose = true;
            return;
        }

        this.weakQueue = [];
        // this.activeScript = null;

        if (this.modalState === 0) {
            return;
        }

        if (this.modalTop !== -1) {
            const modalType = IfType.get(this.modalTop);
            this.modalTop = -1;

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }
        }

        if (this.modalBottom !== -1) {
            const modalType = IfType.get(this.modalBottom);
            this.modalBottom = -1;

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }
        }

        if (this.modalSidebar !== -1) {
            const modalType = IfType.get(this.modalSidebar);
            this.modalSidebar = -1;

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }
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

    /**
     *
     * @param script
     * @param {QueueType} type
     * @param delay
     * @param args
     */
    enqueueScript(script: Script, type: QueueType = 'normal', delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest(type, script, args, delay + 1);
        if (type === 'engine') {
            this.engineQueue.push(request);
        } else if (type === 'weak') {
            this.weakQueue.push(request);
        } else {
            this.queue.push(request);
        }
    }

    processQueues() {
        if (this.queue.some(queue => queue.type === 'strong')) {
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
            if (queue.type === 'strong') {
                this.closeModal();
            }

            const delay = queue.delay--;
            if (!this.busy() && delay <= 0) {
                const state = ScriptRunner.init(queue.script, this, null, null, queue.args);
                const executionState = ScriptRunner.execute(state);

                if (executionState !== ScriptState.FINISHED && executionState !== ScriptState.ABORTED) {
                    this.activeScript = state;
                }

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
            if (!this.busy() && delay <= 0) {
                const state = ScriptRunner.init(queue.script, this, null, null, queue.args);
                const executionState = ScriptRunner.execute(state);

                if (executionState !== ScriptState.FINISHED && executionState !== ScriptState.ABORTED) {
                    this.activeScript = state;
                }

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
            if (--timer.clock <= 0 && (timer.type === 'soft' || !this.busy())) {
                // set clock back to interval
                timer.clock = timer.interval;

                // execute the timer
                // TODO soft timer does not have protected access
                const state = ScriptRunner.init(timer.script, this, null, null, timer.args);
                ScriptRunner.execute(state);
            }
        }
    }

    setInteraction(target: (Player | Npc | Loc | Obj), op: ServerTriggerType, subject?: number) {
        if (this.forceMove || this.delayed()) {
            // console.log('not setting interaction');
            this.clearWalkingQueue();
            return;
        }

        // console.log('setting interaction');
        this.closeModal();

        this.interactionSet = true;
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
            this.faceX = (target.x * 2) + type.width;
            this.faceZ = (target.z * 2) + type.length;
            this.mask |= Player.FACE_COORD;
        } else {
            this.faceX = (target.x * 2) + 1;
            this.faceZ = (target.z * 2) + 1;
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
        // console.log(World.currentTick);
        if (!this.target || this.busy()) {
            this.updateMovement();
            return;
        }

        this.interacted = false;
        this.interactionSet = false;
        this.apRangeCalled = false;

        const opTrigger = this.getOpTrigger();
        const apTrigger = this.getApTrigger();
        // console.log('opTrigger', opTrigger != null);
        // console.log('apTrigger', apTrigger != null);

        // console.log('operable', this.inOperableDistance(this.target));
        // console.log('approachable', this.inApproachDistance(this.apRange, this.target));

        if (this.inOperableDistance(this.target) && opTrigger && this.target instanceof PathingEntity) {
            const state = ScriptRunner.init(opTrigger, this, this.target);
            this.executeScript(state);
            if (!this.interactionSet) {
                this.clearWalkingQueue();
            }

            this.interacted = true;
        } else if (this.inApproachDistance(this.apRange, this.target) && apTrigger) {
            const state = ScriptRunner.init(apTrigger, this, this.target);
            this.executeScript(state);
            if (!this.interactionSet) {
                this.clearWalkingQueue();
            }

            this.interacted = true;
        } else if (this.inOperableDistance(this.target) && this.target instanceof PathingEntity) {
            if (!process.env.PROD_MODE && !opTrigger && !apTrigger) {
                let debugname = '_';
                if (this.target instanceof Npc) {
                    debugname = NpcType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.target instanceof Loc) {
                    debugname = LocType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.target instanceof Obj) {
                    debugname = ObjType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.targetSubject !== -1) {
                    if (this.targetOp === ServerTriggerType.APNPCT || this.targetOp === ServerTriggerType.APPLAYERT || this.targetOp === ServerTriggerType.APLOCT || this.targetOp === ServerTriggerType.APOBJT) {
                        debugname = IfType.get(this.targetSubject)?.comName ?? this.targetSubject.toString();
                    } else {
                        debugname = ObjType.get(this.targetSubject)?.debugname ?? this.targetSubject.toString();
                    }
                }

                this.messageGame(`No trigger for [${ServerTriggerType[this.targetOp + 7].toLowerCase()},${debugname}]`);
            }

            this.messageGame('Nothing interesting happens.');
            this.interacted = true;
        }
        // console.log('1st', this.interacted, this.interactionSet, this.apRangeCalled, this.apRange, this.target ? Position.distanceTo(this, this.target) : -1);

        const moved = this.updateMovement();
        if (moved) {
            this.lastMovement = World.currentTick + 1;
        }
        // console.log('moved', moved);

        if (!this.interacted || this.apRangeCalled) {
            this.interacted = false;

            if (this.inOperableDistance(this.target) && opTrigger && (this.target instanceof PathingEntity || !moved)) {
                const state = ScriptRunner.init(opTrigger, this, this.target);
                this.executeScript(state);
                if (!this.interactionSet) {
                    this.clearWalkingQueue();
                }

                this.interacted = true;
            } else if (this.inApproachDistance(this.apRange, this.target) && apTrigger) {
                this.apRangeCalled = false;

                const state = ScriptRunner.init(apTrigger, this, this.target);
                this.executeScript(state);
                if (!this.interactionSet) {
                    this.clearWalkingQueue();
                }

                this.interacted = true;
            } else if (this.inOperableDistance(this.target) && (this.target instanceof PathingEntity || !moved)) {
                if (!process.env.PROD_MODE && !opTrigger && !apTrigger) {
                    let debugname = '_';
                    if (this.target instanceof Npc) {
                        debugname = NpcType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.target instanceof Loc) {
                        debugname = LocType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.target instanceof Obj) {
                        debugname = ObjType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.targetSubject !== -1) {
                        if (this.targetOp === ServerTriggerType.APNPCT || this.targetOp === ServerTriggerType.APPLAYERT || this.targetOp === ServerTriggerType.APLOCT || this.targetOp === ServerTriggerType.APOBJT) {
                            debugname = IfType.get(this.targetSubject)?.comName ?? this.targetSubject.toString();
                        } else {
                            debugname = ObjType.get(this.targetSubject)?.debugname ?? this.targetSubject.toString();
                        }
                    }

                    this.messageGame(`No trigger for [${ServerTriggerType[this.targetOp + 7].toLowerCase()},${debugname}]`);
                }

                this.messageGame('Nothing interesting happens.');
                this.interacted = true;
            }
            // console.log('2nd', this.interacted, this.interactionSet, this.apRangeCalled, this.apRange, this.target ? Position.distanceTo(this, this.target) : -1);
        }

        if (!this.interacted && !this.hasWaypoints() && !moved) {
            // console.log('cannot reach');
            this.messageGame('I can\'t reach that!');
            this.clearInteraction();
        }

        if (this.interacted && !this.apRangeCalled && !this.interactionSet) {
            // console.log('interaction finished');
            this.clearInteraction();
        }
    }

    // ----

    updateMap() {
        const dx = Math.abs(this.x - this.loadedX);
        const dz = Math.abs(this.z - this.loadedZ);

        // if the build area should be regenerated, do so now
        if (dx >= 36 || dz >= 36 || (this.tele && (Position.zone(this.x) !== Position.zone(this.loadedX) || Position.zone(this.z) !== Position.zone(this.loadedZ)))) {
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

                // todo: receiver/shared buffer logic
                if (typeof this.loadedZones[zone.index] === 'undefined') {
                    // full update necessary to clear client zone memory
                    this.updateZoneFullFollows(x << 3, z << 3);
                    this.loadedZones[zone.index] = -1; // note: flash appears when changing floors
                }

                const updates = World.getUpdates(zone.index).filter(event => {
                    return event.tick > this.loadedZones[zone.index];
                });

                if (updates.length) {
                    this.updateZonePartialFollows(x << 3, z << 3);

                    for (let i = 0; i < updates.length; i++) {
                        // have to copy because encryption will be applied to buffer
                        this.netOut.push(new Packet(updates[i].buffer));
                    }
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

    getNearbyPlayers(): Player[] {
        // todo: move to create an array of uids rather than Player objects (which may live longer than it should)
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

                for (let i = 0; i < players.length; i++) {
                    const player = players[i];
                    if (player.uid === this.uid || player.x < absLeftX || player.x >= absRightX || player.z >= absTopZ || player.z < absBottomZ) {
                        continue;
                    }

                    if (this.isWithinDistance(player)) {
                        nearby.push(player);
                    }
                }
            }
        }

        return nearby;
    }

    updatePlayers() {
        const nearby = this.getNearbyPlayers();

        const out = new Packet();
        out.bits();

        // temp variables to convert movement operations
        const { walkDir, runDir, tele } = this.getMovementDir();

        // update local player
        out.pBit(1, (tele || walkDir !== -1 || runDir !== -1 || this.mask > 0) ? 1 : 0);
        if (tele) {
            out.pBit(2, 3);
            out.pBit(2, this.level);
            out.pBit(7, Position.local(this.x));
            out.pBit(7, Position.local(this.z));
            out.pBit(1, this.jump ? 1 : 0);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (runDir !== -1) {
            out.pBit(2, 2);
            out.pBit(3, walkDir);
            out.pBit(3, runDir);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (walkDir !== -1) {
            out.pBit(2, 1);
            out.pBit(3, walkDir);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.mask > 0) {
            out.pBit(2, 0);
        }

        // update other players
        out.pBit(8, this.playerIds.length);

        const updates: number[] = [];
        for (let i = 0; i < this.playerIds.length; i++) {
            const uid = this.playerIds[i];
            const player = World.getPlayerByUid(uid);
            if (!player) {
                // player logged out
                out.pBit(1, 1);
                out.pBit(2, 3);
                this.playerIds.splice(i--, 1);
                continue;
            }

            if (nearby.findIndex(p => p.uid === uid) === -1) {
                // no longer observing this player
                out.pBit(1, 1);
                out.pBit(2, 3);
                this.playerIds.splice(i--, 1);
                continue;
            }

            const { walkDir, runDir, tele } = player.getMovementDir();
            if (tele) {
                // teleporting requires re-adding
                out.pBit(1, 1);
                out.pBit(2, 3);
                this.playerIds.splice(i--, 1);
                continue;
            }

            out.pBit(1, (walkDir !== -1 || runDir !== -1 || player.mask > 0) ? 1 : 0);
            if (runDir !== -1) {
                out.pBit(2, 2);
                out.pBit(3, walkDir);
                out.pBit(3, runDir);
                out.pBit(1, player.mask > 0 ? 1 : 0);
            } else if (walkDir !== -1) {
                out.pBit(2, 1);
                out.pBit(3, walkDir);
                out.pBit(1, player.mask > 0 ? 1 : 0);
            } else if (player.mask > 0) {
                out.pBit(2, 0);
            }

            if (player.mask > 0) {
                updates.push(uid);
            }
        }

        // add new players
        const newlyObserved: number[] = [];
        for (let i = 0; i < nearby.length; i++) {
            const player = nearby[i];
            if (this.playerIds.indexOf(player.uid) !== -1) {
                continue;
            }

            if (!World.getPlayerByUid(player.uid)) {
                continue;
            }

            out.pBit(11, player.pid);
            out.pBit(5, player.x - this.x);
            out.pBit(5, player.z - this.z);
            out.pBit(1, player.jump ? 1 : 0);

            // TODO: tele optimization
            out.pBit(1, 1);

            this.playerIds.push(player.uid);
            newlyObserved.push(player.uid);

            updates.push(player.uid);
        }

        // update masks
        if (this.mask > 0 || updates.length > 0) {
            out.pBit(11, 2047);
        }

        out.bytes();

        if (this.mask > 0) {
            this.writeUpdate(this, out, true, false);
        }

        for (let i = 0; i < updates.length; i++) {
            const uid = updates[i];
            const player = World.getPlayerByUid(uid);
            if (!player) {
                continue;
            }

            // TODO: tele optimization
            player.writeUpdate(this, out, false, newlyObserved.indexOf(uid) !== -1);
        }

        // out.save('dump/' + World.currentTick + '.' + this.username + '.player.bin');
        this.playerInfo(out);
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

    writeUpdate(observer: Player, out: Packet, self = false, firstSeen = false) {
        let mask = this.mask;
        if (firstSeen) {
            mask |= Player.APPEARANCE;
        }
        if (firstSeen && (this.orientation != -1 || this.faceX != -1 || this.faceZ != -1)) {
            mask |= Player.FACE_COORD;
        }
        if (firstSeen && (this.faceEntity != -1)) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xFF) {
            mask |= 0x80;
        }

        if (self && (mask & Player.CHAT)) {
            // don't echo back local chat
            mask &= ~Player.CHAT;
        }

        out.p1(mask & 0xFF);
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

            if (firstSeen && this.faceX != -1) {
                out.p2(this.faceX);
                out.p2(this.faceZ);
            } else if (firstSeen && this.orientation != -1) {
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

    getNearbyNpcs(): Npc[] {
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

                for (let i = 0; i < npcs.length; i++) {
                    const npc = npcs[i];
                    if (npc.x < absLeftX || npc.x >= absRightX || npc.z >= absTopZ || npc.z < absBottomZ) {
                        continue;
                    }

                    if (this.isWithinDistance(npc)) {
                        nearby.push(npc);
                    }
                }
            }
        }

        return nearby;
    }

    updateNpcs() {
        const nearby = this.getNearbyNpcs();

        const out = new Packet();
        out.bits();

        // update existing npcs
        out.pBit(8, this.npcIds.length);

        const updates: number[] = [];
        for (let i = 0; i < this.npcIds.length; i++) {
            const nid = this.npcIds[i];
            const npc = World.getNpc(nid);
            if (!npc) {
                // npc deleted
                out.pBit(1, 1);
                out.pBit(2, 3);
                this.npcIds.splice(i--, 1);
                continue;
            }

            if (nearby.findIndex(n => n.nid === nid) === -1) {
                // no longer observing this npc
                out.pBit(1, 1);
                out.pBit(2, 3);
                this.npcIds.splice(i--, 1);
                continue;
            }

            const { walkDir, runDir, tele } = npc.getMovementDir();
            if (tele) {
                // teleporting requires re-adding
                out.pBit(1, 1);
                out.pBit(2, 3);
                this.npcIds.splice(i--, 1);
                continue;
            }

            out.pBit(1, (runDir !== -1 || walkDir !== -1 || npc.mask > 0) ? 1 : 0);
            if (runDir !== -1) {
                out.pBit(2, 2);
                out.pBit(3, walkDir);
                out.pBit(3, runDir);
                out.pBit(1, npc.mask > 0 ? 1 : 0);
            } else if (walkDir !== -1) {
                out.pBit(2, 1);
                out.pBit(3, walkDir);
                out.pBit(1, npc.mask > 0 ? 1 : 0);
            } else if (npc.mask > 0) {
                out.pBit(2, 0);
            }

            if (npc.mask > 0) {
                updates.push(nid);
            }
        }

        // add new npcs
        const newlyObserved: number[] = [];
        for (let i = 0; i < nearby.length; i++) {
            const npc = nearby[i];
            if (this.npcIds.indexOf(npc.nid) !== -1) {
                continue;
            }

            if (!World.getNpc(npc.nid)) {
                continue;
            }

            out.pBit(13, npc.nid);
            out.pBit(11, npc.type);
            out.pBit(5, npc.x - this.x);
            out.pBit(5, npc.z - this.z);

            // TODO: tele optimization

            const hasUpdate = npc.mask > 0 || npc.orientation !== -1 || npc.faceX !== -1 || npc.faceZ !== -1 || npc.faceEntity !== -1;
            out.pBit(1, hasUpdate ? 1 : 0);

            this.npcIds.push(npc.nid);
            newlyObserved.push(npc.nid);

            if (hasUpdate) {
                updates.push(npc.nid);
            }
        }

        if (updates.length > 0) {
            out.pBit(13, 8191);
        }

        out.bytes();

        for (let i = 0; i < updates.length; i++) {
            const nid = updates[i];
            const npc = World.getNpc(nid);
            if (!npc) {
                continue;
            }

            npc.writeUpdate(out, newlyObserved.indexOf(nid) !== -1);
        }

        // out.save('dump/' + World.currentTick + '.' + this.username + '.npc.bin');
        this.npcInfo(out);
    }

    updateStats() {
        for (let i = 0; i < this.stats.length; i++) {
            if (this.stats[i] !== this.lastStats[i]) {
                this.updateStat(i, this.stats[i], this.levels[i]);
                this.lastStats[i] = this.stats[i];
            }
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
                    this.updateInvFull(listener.com, inv);
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
                    this.updateInvFull(listener.com, inv);
                    listener.firstSeen = false;
                }
            }
        }
    }

    getInventory(inv: number): Inventory | null {
        if (inv === -1) {
            return null;
        }

        const invType = InvType.get(inv);
        let container = null;

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
        this.updateInvStopTransmit(com);
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
        if (objType.stackable || (uncert != obj) || container.stackType == Inventory.ALWAYS_STACK) {
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

        return {overflow: fromObj.count - this.invAdd(toInv, fromObj.id, fromObj.count), fromObj: fromObj.id};
    }

    invTotalCat(inv: number, category: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invTotalCat: Invalid inventory type: ' + inv);
        }

        return container.itemsFiltered.filter(obj => ObjType.get(obj.id).category == category).reduce((count, obj) => count + obj.count, 0);
    }

    stockBase(inv: number, obj: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('stockBase: Invalid inventory type: ' + inv);
        }

        const invType = InvType.get(container.type);
        const index = invType.stockobj.indexOf(obj);
        return index >= 0 ? invType.stockcount[index] : -1;
    }

    // ----

    getVarp(varp: string | number) {
        if (typeof varp === 'string') {
            varp = VarPlayerType.getId(varp);
        }

        if (typeof varp !== 'number' || varp === -1) {
            console.error(`Invalid setVarp call: ${varp}`);
            return -1;
        }

        return this.varps[varp as number];
    }

    setVarp(varp: number | string, value: number) {
        if (typeof varp === 'string') {
            varp = VarPlayerType.getId(varp);
        }

        if (typeof varp !== 'number' || varp === -1) {
            throw new Error(`Invalid setVarp call: ${varp}, ${value}`);
        }

        const varpType = VarPlayerType.get(varp);
        this.varps[varp] = value;

        if (varpType.transmit) {
            if (value < 256) {
                this.varpSmall(varp, value);
            } else {
                this.varpLarge(varp, value);
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

        const multi = Number(process.env.XP_MULTIPLIER) || 1;
        this.stats[stat] += xp * multi;

        // cap to 200m, this is represented as "2 billion" because we use 32-bit signed integers and divide by 10 to give us a decimal point
        if (this.stats[stat] > 2_000_000_000) {
            this.stats[stat] = 2_000_000_000;
        }

        const before = this.baseLevels[stat];
        this.baseLevels[stat] = getLevelByExp(this.stats[stat]);
        this.levels[stat] = this.baseLevels[stat]; // TODO: preserve buffs/debuffs?

        if (this.baseLevels[stat] > before) {
            const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LEVELUP, stat, -1);

            if (script) {
                this.enqueueScript(script, 'engine');
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

            this.midiSong(name, crc, length);
        }
    }

    playJingle(name: string, length: number): void {
        name = name.toLowerCase().replaceAll('_', ' ');
        if (!name) {
            return;
        }
        const jingle = PRELOADED.get(name + '.mid');
        if (jingle) {
            this.midiJingle(length, jingle);
        }
    }

    openMainModal(com: number) {
        if (this.modalState & 4) {
            this.ifClose(); // need to close sideoverlay
            this.modalState &= ~4;
            this.modalSidebar = -1;
        }

        // this.ifOpenMainModal(com);
        this.modalState |= 1;
        this.modalTop = com;
        this.refreshModal = true;
    }

    openChat(com: number) {
        // this.ifOpenChat(com);
        this.modalState |= 2;
        this.modalBottom = com;
        this.refreshModal = true;
    }

    openSideOverlay(com: number) {
        // this.ifOpenSideOverlay(com);
        this.modalState |= 4;
        this.modalSidebar = com;
        this.refreshModal = true;
    }

    openChatSticky(com: number) {
        this.ifOpenChatSticky(com);
        this.modalState |= 8;
        this.modalSticky = com;
    }

    openMainModalSideOverlay(top: number, side: number) {
        // this.ifOpenMainModalSideOverlay(top, side);
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

    // ----

    executeScript(script: ScriptState) {
        if (!script) {
            return;
        }

        const state = ScriptRunner.execute(script);
        if (state !== ScriptState.FINISHED && state !== ScriptState.ABORTED) {
            if (state === ScriptState.WORLD_SUSPENDED) {
                World.enqueueScript(script, script.popInt());
            } else if (state === ScriptState.NPC_SUSPENDED) {
                script.activeNpc.activeScript = script;
            } else {
                this.activeScript = script;
            }
        } else if (script === this.activeScript) {
            this.activeScript = null;

            if ((this.modalState & 1) == 0) {
                this.closeModal();
            }
        }
    }

    // ---- raw server protocol ----

    ifSetColour(com: number, colour: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETCOLOUR);

        out.p2(com);
        out.p2(colour);

        this.netOut.push(out);
    }

    ifOpenChat(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENCHAT);

        out.p2(com);

        this.netOut.push(out);
    }

    ifOpenMainModalSideOverlay(top: number, side: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENMAINMODALSIDEOVERLAY);

        out.p2(top);
        out.p2(side);

        this.netOut.push(out);
    }

    ifSetHide(com: number, state: boolean) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETHIDE);

        out.p2(com);
        out.pbool(state);

        this.netOut.push(out);
    }

    ifSetObject(com: number, objId: number, scale: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETOBJECT);

        out.p2(com);
        out.p2(objId);
        out.p2(scale);

        this.netOut.push(out);
    }

    ifSetTabActive(tab: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETTAB_ACTIVE);

        out.p1(tab);

        this.netOut.push(out);
    }

    ifSetModel(com: number, modelId: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETMODEL);

        out.p2(com);
        out.p2(modelId);

        this.netOut.push(out);
    }

    ifSetModelColour(com: number, int2: number, int3: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETMODEL_COLOUR);

        out.p2(com);
        out.p2(int2);
        out.p2(int3);

        this.netOut.push(out);
    }

    ifSetTabFlash(tab: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETTAB_FLASH);

        out.p1(tab);

        this.netOut.push(out);
    }

    ifClose() {
        const out = new Packet();
        out.p1(ServerProt.IF_CLOSE);

        this.netOut.push(out);
    }

    ifSetAnim(com: number, seqId: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETANIM);

        out.p2(com);
        out.p2(seqId);

        this.netOut.push(out);
    }

    ifSetTab(com: number, tab: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETTAB);

        out.p2(com);
        out.p1(tab);

        this.netOut.push(out);
    }

    ifOpenMainModal(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENMAINMODAL);

        out.p2(com);

        this.netOut.push(out);
    }

    ifOpenChatSticky(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENCHATSTICKY);

        out.p2(com);

        this.netOut.push(out);
    }

    ifOpenSideOverlay(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENSIDEOVERLAY);

        out.p2(com);

        this.netOut.push(out);
    }

    ifSetPlayerHead(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETPLAYERHEAD);

        out.p2(com);

        this.netOut.push(out);
    }

    ifSetText(com: number, text: string) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETTEXT);
        out.p2(0);
        const start = out.pos;

        out.p2(com);
        out.pjstr(text);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    ifSetNpcHead(com: number, npcId: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETNPCHEAD);

        out.p2(com);
        out.p2(npcId);

        this.netOut.push(out);
    }

    ifSetPosition(com: number, int2: number, int3: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_SETPOSITION);

        out.p2(com);
        out.p2(int2);
        out.p2(int3);

        this.netOut.push(out);
    }

    ifIAmount() {
        const out = new Packet();
        out.p1(ServerProt.IF_IAMOUNT);

        this.netOut.push(out);
    }

    ifMultiZone(state: boolean) {
        const out = new Packet();
        out.p1(ServerProt.IF_MULTIZONE);

        out.pbool(state);

        this.netOut.push(out);
    }

    updateInvStopTransmit(com: number) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        const out = new Packet();
        out.p1(ServerProt.UPDATE_INV_STOP_TRANSMIT);

        out.p2(com);

        this.netOut.push(out);
    }

    updateInvFull(com: number, inv: Inventory) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        const out = new Packet();
        out.p1(ServerProt.UPDATE_INV_FULL);
        out.p2(0);
        const start = out.pos;

        const comType = IfType.get(com);
        const limit = Math.min(inv.capacity, comType.width * comType.height);

        out.p2(com);
        out.p1(limit);
        for (let slot = 0; slot < limit; slot++) {
            const obj = inv.get(slot);

            if (obj) {
                out.p2(obj.id + 1);

                if (obj.count >= 255) {
                    out.p1(255);
                    out.p4(obj.count);
                } else {
                    out.p1(obj.count);
                }
            } else {
                out.p2(0);
                out.p1(0);
            }
        }

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    updateInvPartial(com: number, inv: Inventory, slots: number[] = []) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        const out = new Packet();
        out.p1(ServerProt.UPDATE_INV_PARTIAL);
        out.p2(0);
        const start = out.pos;

        out.p2(com);
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const obj = inv.get(slot);

            out.p1(slot);
            if (obj) {
                out.p2(obj.id + 1);

                if (obj.count >= 255) {
                    out.p1(255);
                    out.p4(obj.count);
                } else {
                    out.p1(obj.count);
                }
            } else {
                out.p2(0);
                out.p1(0);
            }
        }

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    camLookAt(targetX: number, targetZ: number, cameraHeight: number, transitionStepBase: number, transitionStepScale: number) {
        const out = new Packet();
        out.p1(ServerProt.CAM_LOOKAT);

        out.p1(targetX);
        out.p1(targetZ);
        out.p2(cameraHeight);
        out.p1(transitionStepBase);
        out.p1(transitionStepScale);

        this.netOut.push(out);
    }

    camShake(type: number, jitter: number, amplitude: number, frequency: number) {
        const out = new Packet();
        out.p1(ServerProt.CAM_SHAKE);

        out.p1(type); // direction?
        out.p1(jitter);
        out.p1(amplitude);
        out.p1(frequency);

        this.netOut.push(out);
    }

    camMoveTo(targetX: number, targetZ: number, cameraHeight: number, transitionStepBase: number, transitionStepScale: number) {
        const out = new Packet();
        out.p1(ServerProt.CAM_MOVETO);

        out.p1(targetX);
        out.p1(targetZ);
        out.p2(cameraHeight);
        out.p1(transitionStepBase);
        out.p1(transitionStepScale);

        this.netOut.push(out);
    }

    camReset() {
        const out = new Packet();
        out.p1(ServerProt.CAM_RESET);

        this.netOut.push(out);
    }

    npcInfo(data: Packet) {
        const out = new Packet();
        out.p1(ServerProt.NPC_INFO);
        out.p2(0);
        const start = out.pos;

        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    playerInfo(data: Packet) {
        const out = new Packet();
        out.p1(ServerProt.PLAYER_INFO);
        out.p2(0);
        const start = out.pos;

        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    clearWalkingQueue() {
        this.clearWalkSteps();

        const out = new Packet();
        out.p1(ServerProt.CLEAR_WALKING_QUEUE);

        this.netOut.push(out);
    }

    updateRunWeight(kg: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_RUNWEIGHT);

        out.p2(kg);

        this.netOut.push(out);
    }

    // pseudo-packet
    hintNpc(nid: number) {
        const out = new Packet();
        out.p1(ServerProt.HINT_ARROW);

        out.p1(1);
        out.p2(nid);
        out.p2(0);
        out.p1(0);

        this.netOut.push(out);
    }

    // pseudo-packet
    hintTile(offset: number, x: number, z: number, height: number) {
        const out = new Packet();
        out.p1(ServerProt.HINT_ARROW);

        // 2 - 64, 64 offset - centered
        // 3 - 0, 64 offset - far left
        // 4 - 128, 64 offset - far right
        // 5 - 64, 0 offset - bottom left
        // 6 - 64, 128 offset - top left

        out.p1(2 + offset);
        out.p2(x);
        out.p2(z);
        out.p1(height);

        this.netOut.push(out);
    }

    // pseudo-packet
    hintPlayer(pid: number) {
        const out = new Packet();
        out.p1(ServerProt.HINT_ARROW);

        out.p1(10);
        out.p2(pid);
        out.p2(0);
        out.p1(0);

        this.netOut.push(out);
    }

    stopHint() {
        const out = new Packet();
        out.p1(ServerProt.HINT_ARROW);

        out.p1(-1);
        out.p2(0);
        out.p2(0);
        out.p1(0);

        this.netOut.push(out);
    }

    updateRebootTimer(ticks: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_REBOOT_TIMER);

        out.p2(ticks);

        this.netOut.push(out);
    }

    updateStat(stat: number, xp: number, tempLevel: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_STAT);

        out.p1(stat);
        out.p4(xp / 10);
        out.p1(tempLevel);

        this.netOut.push(out);
    }

    updateRunEnergy(energy: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_RUNENERGY);

        out.p1(Math.floor(energy / 100));

        this.netOut.push(out);
    }

    finishTracking() {
        const out = new Packet();
        out.p1(ServerProt.FINISH_TRACKING);

        this.netOut.push(out);
    }

    resetAnims() {
        const out = new Packet();
        out.p1(ServerProt.RESET_ANIMS);

        this.netOut.push(out);
    }

    updateUid192(pid: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_UID192);

        out.p2(pid);

        this.netOut.push(out);
    }

    lastLoginInfo(lastLoginIp: number, daysSinceLogin: number, daysSinceRecoveryChange: number, unreadMessageCount: number) {
        const out = new Packet();
        out.p1(ServerProt.LAST_LOGIN_INFO);

        out.p4(lastLoginIp);
        out.p2(daysSinceLogin);
        out.p1(daysSinceRecoveryChange);
        out.p2(unreadMessageCount);

        this.netOut.push(out);
        this.modalState |= 16;
    }

    logout() {
        const out = new Packet();
        out.p1(ServerProt.LOGOUT);

        this.writeImmediately(out);
    }

    enableTracking() {
        const out = new Packet();
        out.p1(ServerProt.ENABLE_TRACKING);

        this.netOut.push(out);
    }

    messageGame(str1: string) {
        const out = new Packet();
        out.p1(ServerProt.MESSAGE_GAME);
        out.p1(0);
        const start = out.pos;

        out.pjstr(str1);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    wrappedMessageGame(mes: string) {
        const font = FontType.get(1);
        const lines = font.split(mes, 456);
        for (const line of lines) {
            this.messageGame(line);
        }
    }

    updateIgnoreList(name37s: bigint[]) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_IGNORELIST);

        for (let i = 0; i < name37s.length; i++) {
            out.p8(name37s[i]);
        }

        this.netOut.push(out);
    }

    chatFilterSettings(int1: number, int2: number, int3: number) {
        const out = new Packet();
        out.p1(ServerProt.CHAT_FILTER_SETTINGS);

        out.p1(int1);
        out.p1(int2);
        out.p1(int3);

        this.netOut.push(out);
    }

    messagePrivate(from37: bigint, messageId: number, fromRights: number, message: Packet) {
        const out = new Packet();
        out.p1(ServerProt.MESSAGE_PRIVATE);
        out.p1(0);
        const start = out.pos;

        out.p8(from37);
        out.p4(messageId);
        out.p1(fromRights);
        out.pdata(message);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    updateFriendList(username37: bigint, worldNode: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_FRIENDLIST);

        out.p8(username37);
        out.p1(worldNode);

        this.netOut.push(out);
    }

    dataLocDone(x: number, z: number) {
        const out = new Packet();
        out.p1(ServerProt.DATA_LOC_DONE);

        out.p1(x);
        out.p1(z);

        this.netOut.push(out);
    }

    dataLandDone(x: number, z: number) {
        const out = new Packet();
        out.p1(ServerProt.DATA_LAND_DONE);

        out.p1(x);
        out.p1(z);

        this.netOut.push(out);
    }

    dataLand(x: number, z: number, data: Uint8Array, off: number, length: number) {
        const out = new Packet();
        out.p1(ServerProt.DATA_LAND);
        out.p2(0);
        const start = out.pos;

        out.p1(x);
        out.p1(z);
        out.p2(off);
        out.p2(length);
        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    dataLoc(x: number, z: number, data: Uint8Array, off: number, length: number) {
        const out = new Packet();
        out.p1(ServerProt.DATA_LOC);
        out.p2(0);
        const start = out.pos;

        out.p1(x);
        out.p1(z);
        out.p2(off);
        out.p2(length);
        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    loadArea(zoneX: number, zoneZ: number) {
        const out = new Packet();
        out.p1(ServerProt.LOAD_AREA);
        out.p2(0);
        const start = out.pos;

        out.p2(zoneX);
        out.p2(zoneZ);

        // build area is 13x13 zones (8*13 = 104 tiles), so we need to load 6 zones in each direction
        const areas = [];
        for (let x = zoneX - 6; x <= zoneX + 6; x++) {
            for (let z = zoneZ - 6; z <= zoneZ + 6; z++) {
                const mapsquareX = Position.mapsquare(x << 3);
                const mapsquareZ = Position.mapsquare(z << 3);

                const landExists = PRELOADED.has(`m${mapsquareX}_${mapsquareZ}`);
                const locExists = PRELOADED.has(`l${mapsquareX}_${mapsquareZ}`);

                if ((landExists || locExists) && areas.findIndex(a => a.mapsquareX === mapsquareX && a.mapsquareZ === mapsquareZ) === -1) {
                    areas.push({ mapsquareX, mapsquareZ, landExists, locExists });
                }
            }
        }

        for (let i = 0; i < areas.length; i++) {
            const { mapsquareX, mapsquareZ, landExists, locExists } = areas[i];

            out.p1(mapsquareX);
            out.p1(mapsquareZ);
            out.p4(landExists ? PRELOADED_CRC.get(`m${mapsquareX}_${mapsquareZ}`) ?? 0 : 0);
            out.p4(locExists ? PRELOADED_CRC.get(`l${mapsquareX}_${mapsquareZ}`) ?? 0 : 0);
        }

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    varpSmall(varp: number, value: number) {
        const out = new Packet();
        out.p1(ServerProt.VARP_SMALL);

        out.p2(varp);
        out.p1(value);

        this.netOut.push(out);
    }

    varpLarge(varp: number, value: number) {
        const out = new Packet();
        out.p1(ServerProt.VARP_LARGE);

        out.p2(varp);
        out.p4(value);

        this.netOut.push(out);
    }

    resetClientVarCache() {
        const out = new Packet();
        out.p1(ServerProt.RESET_CLIENT_VARCACHE);

        this.netOut.push(out);
    }

    synthSound(id: number, loops: number, delay: number) {
        const out = new Packet();
        out.p1(ServerProt.SYNTH_SOUND);

        out.p2(id);
        out.p1(loops);
        out.p2(delay);

        this.netOut.push(out);
    }

    midiSong(name: string, crc: number, length: number) {
        const out = new Packet();
        out.p1(ServerProt.MIDI_SONG);
        out.p1(0);
        const start = out.pos;

        out.pjstr(name);
        out.p4(crc);
        out.p4(length);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    midiJingle(length: number, bytes: Uint8Array) {
        const out = new Packet();
        out.p1(ServerProt.MIDI_JINGLE);
        out.p2(0);
        const start = out.pos;

        out.p2(length);
        out.p4(bytes.length);
        out.pdata(bytes, true);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    updateZonePartialFollows(baseX: number, baseZ: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS);

        // delta to loaded zone
        out.p1(baseX - Position.zoneOrigin(this.loadedX));
        out.p1(baseZ - Position.zoneOrigin(this.loadedZ));

        this.netOut.push(out);
    }

    updateZoneFullFollows(baseX: number, baseZ: number) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_ZONE_FULL_FOLLOWS);

        // delta to loaded zone
        out.p1(baseX - Position.zoneOrigin(this.loadedX));
        out.p1(baseZ - Position.zoneOrigin(this.loadedZ));

        this.netOut.push(out);
    }

    updateZonePartialEnclosed(baseX: number, baseZ: number, data: Packet) {
        const out = new Packet();
        out.p1(ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED);
        out.p2(0);
        const start = out.pos;

        // delta to loaded zone
        out.p1(baseX - Position.zoneOrigin(this.loadedX));
        out.p1(baseZ - Position.zoneOrigin(this.loadedZ));
        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }
}
