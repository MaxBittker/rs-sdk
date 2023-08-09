import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';
import { fromBase37, toBase37 } from '#jagex2/jstring/JString.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';
import { Position } from '#lostcity/entity/Position.js';
import { ClientProt, ClientProtLengths } from '#lostcity/server/ClientProt.js';
import { ServerProt } from '#lostcity/server/ServerProt.js';
import IfType from '#lostcity/cache/IfType.js';
import InvType from '#lostcity/cache/InvType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import { Inventory } from '#lostcity/engine/Inventory.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import World from '#lostcity/engine/World.js';
import Npc from '#lostcity/entity/Npc.js';
import LocType from '#lostcity/cache/LocType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import ReachStrategy from '#rsmod/reach/ReachStrategy.js';
import { EntityQueueRequest, QueueType, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Script from '#lostcity/engine/script/Script.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import Loc from '#lostcity/entity/Loc.js';
import ParamType from '#lostcity/cache/ParamType.js';
import EnumType from '#lostcity/cache/EnumType.js';
import StructType from '#lostcity/cache/StructType.js';
import CategoryType from '#lostcity/cache/CategoryType.js';
import SeqType from '#lostcity/cache/SeqType.js';
import MesanimType from '#lostcity/cache/MesanimType.js';
import FontType from '#lostcity/cache/FontType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import DbRowType from '#lostcity/cache/DbRowType.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import { EntityTimer, PlayerTimerType } from '#lostcity/entity/EntityTimer.js';
import Entity from '#lostcity/entity/Entity.js';
import Obj from '#lostcity/entity/Obj.js';
import { Interaction } from '#lostcity/entity/Interaction.js';
import ClientSocket from '#lostcity/server/ClientSocket.js';
import { MoveRestrict } from '#lostcity/entity/MoveRestrict.js';

// * 10
const EXP_LEVELS = [
    0, 830, 1740, 2760, 3880, 5120, 6500, 8010, 9690, 11540, 13580, 15840, 18330, 21070, 24110, 27460,
    31150, 352300, 397300, 447000, 501800, 562400, 629100, 70280, 78420, 87400, 97300, 108240, 120310, 133630,
    148330, 164560, 182470, 202240, 224060, 248150, 274730, 304080, 336480, 372240, 411710, 455290,
    503390, 556490, 615120, 679830, 751270, 830140, 917210, 1013330, 1119450, 1236600, 1365940, 1508720,
    1666360, 1840400, 2032540, 2244660, 2478860, 2737420, 3022880, 3338040, 3685990, 4070150, 4494280,
    4962540, 5479530, 6050320, 6680510, 7376270, 8144450, 8992570, 9928950, 10962780, 12104210, 13364430,
    14755810, 16292000, 17988080, 19860680, 21928180, 24210870, 26731140, 29513730, 32585940, 35977920,
    39722940, 43857760, 48422950, 53463320, 59028310, 65172530, 71956290, 79446140, 87715580,
    96845770, 106926290, 118056060, 130344310
];

function getLevelByExp(exp: number) {
    if (exp > EXP_LEVELS[EXP_LEVELS.length - 1]) {
        return 99;
    } else if (!exp) {
        return 1;
    }

    for (let i = 1; i < EXP_LEVELS.length; ++i) {
        if (exp < EXP_LEVELS[i]) {
            return i;
        }
    }

    return 1;
}

function getExpByLevel(level: number) {
    return EXP_LEVELS[level - 1];
}

function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

const PRELOADED = new Map<string, Uint8Array>();
const PRELOADED_CRC = new Map<string, number>();

console.log('Preloading client data');
console.time('Preloaded client data');
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

    static load(name: string) {
        const name37 = toBase37(name);
        const safeName = fromBase37(name37);

        const player = new Player(safeName, name37);

        if (!fs.existsSync(`data/players/${safeName}.sav`)) {
            for (let i = 0; i < 21; i++) {
                player.stats[i] = 0;
                player.baseLevel[i] = 1;
                player.levels[i] = 1;
            }

            // hitpoints starts at level 10
            player.stats[3] = 11540;
            player.baseLevel[3] = 10;
            player.levels[3] = 10;

            player.placement = true;
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
            player.baseLevel[i] = getLevelByExp(player.stats[i]);
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

        player.placement = true;
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
    pid: number;
    username37: bigint;
    displayName: string;
    body: number[];
    colors: number[];
    gender: number;
    runenergy: number;
    runweight: number;
    playtime: number;
    stats: Int32Array;
    levels: Uint8Array;
    varps: Int32Array;
    invs: Map<number, Inventory>;

    // runtime variables
    lowMemory: boolean = false;
    webClient: boolean = false;
    combatLevel: number = 3;
    headicons: number = 0;
    appearance: Packet | null = null; // cached appearance
    baseLevel = new Uint8Array(21);
    loadedX: number = -1; // build area
    loadedZ: number = -1;
    loadedZones: any = {};
    lastMapsquareX: number = -1; // map enter
    lastMapsquareZ: number = -1;
    orientation: number = -1;
    npcs: {type: number, nid: number, npc: Npc}[] = [];
    players: {type: number, pid: number, player: Player}[] = [];
    lastMovement: number = 0; // for p_arrivedelay
    pathfindX: number = -1;
    pathfindZ: number = -1;

    client: ClientSocket | null = null;
    netOut: Packet[] = [];

    placement: boolean = false;
    runDir: number = -1;
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
    exactStartX: number = -1;
    exactStartZ: number = -1;
    exactEndX: number = -1;
    exactEndZ: number = -1;
    exactMoveStart: number = -1;
    exactMoveEnd: number = -1;
    exactFaceDirection: number = -1;

    constructor(username: string, username37: bigint) {
        super(0, 3094, 3106, 1, 1, MoveRestrict.NORMAL); // tutorial island.
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
        this.stats = new Int32Array(21);
        this.levels = new Uint8Array(21);
        this.invs = new Map<number, Inventory>();
    }

    resetTransient() {
        this.placement = false;
        this.mask = 0;

        this.animId = -1;
        this.animDelay = -1;

        if (this.alreadyFacedCoord && this.faceX !== -1) {
            this.faceX = -1;
            this.faceZ = -1;
            this.alreadyFacedCoord = false;
        } else if (this.alreadyFacedEntity && !this.interaction) {
            this.mask |= Player.FACE_ENTITY;
            this.faceEntity = -1;
            this.alreadyFacedEntity = false;
        }

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

        this.exactStartX = -1;
        this.exactStartZ = -1;
        this.exactEndX = -1;
        this.exactEndZ = -1;
        this.exactMoveStart = -1;
        this.exactMoveEnd = -1;
        this.exactFaceDirection = -1;

        this.walkDir = -1;
        this.runDir = -1;
        this.lastX = this.x;
        this.lastZ = this.z;
    }

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
    interaction: Interaction | null = null;

    activeScript: ScriptState | null = null;
    resumeButtons: number[] = [];
    lastInt = 0; // p_countdialog input
    lastItem: number | null = null;
    lastVerifyObj: number | null = null;
    lastSlot: number | null = null;
    lastCom: number | null = null;
    lastUseItem: number | null = null;
    lastUseSlot: number | null = null;
    lastUseCom: number | null = null;
    lastInv: number | null = null;
    lastTab: number = -1; // clicking flashing tab during tutorial

    decodeIn() {
        if (this.client === null || this.client.inOffset < 1) {
            return;
        }

        let offset = 0;

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

        // only process the last of these packet types per tick
        const DEDUPE_PACKETS = [
            ClientProt.OPLOC1, ClientProt.OPLOC2, ClientProt.OPLOC3, ClientProt.OPLOC4, ClientProt.OPLOC5, ClientProt.OPLOCT, ClientProt.OPLOCU,
        ];

        let pathfindRequest = false;
        for (let it = 0; it < decoded.length; it++) {
            const { opcode, data } = decoded[it];

            if (DEDUPE_PACKETS.indexOf(opcode) !== -1 && decoded.findIndex((d, index) => index > it && d.opcode === opcode) !== -1) {
                continue;
            }

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
                this.setVarp('temp_run', data.g1());
                const startX = data.g2();
                const startZ = data.g2();
                const offset = opcode === ClientProt.MOVE_MINIMAPCLICK ? 14 : 0;
                const checkpoints = (data.available - offset) >> 1;

                this.pathfindX = startX;
                this.pathfindZ = startZ;
                if (checkpoints != 0) {
                    // Just grab the last one we need skip the rest.
                    data.pos += (checkpoints - 1) << 1;
                    this.pathfindX = data.g1s() + startX;
                    this.pathfindZ = data.g1s() + startZ;
                }

                if (!this.delayed()) {
                    this.resetInteraction();
                    this.closeModal();
                }
                pathfindRequest = true;
            } else if (opcode === ClientProt.MOVE_OPCLICK) {
                this.setVarp('temp_run', data.g1());
            } else if (opcode === ClientProt.CLIENT_CHEAT) {
                this.onCheat(data.gjstr());
            } else if (opcode === ClientProt.MESSAGE_PUBLIC) {
                this.messageColor = data.g1();
                this.messageEffect = data.g1();
                this.messageType = 0;
                this.message = data.gdata();
                this.mask |= Player.CHAT;
            } else if (opcode === ClientProt.IF_DESIGN) {
                this.gender = data.g1();

                this.body = [];
                for (let i = 0; i < 7; i++) {
                    this.body[i] = data.g1();

                    if (this.body[i] === 255) {
                        this.body[i] = -1;
                    }
                }

                for (let i = 0; i < 5; i++) {
                    this.colors[i] = data.g1();
                }

                this.generateAppearance(InvType.getId('worn'));
            } else if (opcode === ClientProt.IF_FLASHING_TAB) {
                this.lastTab = data.g1();
                const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_FLASHING_TAB, -1, -1);

                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                }
            } else if (opcode === ClientProt.CLOSE_MODAL) {
                this.closeModal();
            } else if (opcode === ClientProt.RESUME_PAUSEBUTTON) {
                if (this.activeScript) {
                    this.executeScript(this.activeScript);
                }
            } else if (opcode === ClientProt.RESUME_P_COUNTDIALOG) {
                const count = data.g4();

                this.lastInt = count;
                if (this.activeScript) {
                    this.executeScript(this.activeScript);
                }
            } else if (opcode === ClientProt.IF_BUTTON) {
                this.lastCom = data.g2();

                if (this.resumeButtons.indexOf(this.lastCom) !== -1) {
                    if (this.activeScript) {
                        this.executeScript(this.activeScript);
                    }
                } else {
                    // TODO verify component exists and is opened
                    const ifType = IfType.get(this.lastCom);
                    const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_BUTTON, ifType.id, -1);
                    if (script) {
                        this.executeScript(ScriptRunner.init(script, this));
                    } else {
                        if (!process.env.PROD_MODE) {
                            this.messageGame(`No trigger for [if_button,${ifType.comName}]`);
                        }
                    }
                }
            } else if (opcode === ClientProt.IF_BUTTON1 || opcode === ClientProt.IF_BUTTON2 || opcode === ClientProt.IF_BUTTON3 || opcode === ClientProt.IF_BUTTON4 || opcode === ClientProt.IF_BUTTON5) {
                this.lastVerifyObj = data.g2();
                this.lastSlot = data.g2();
                this.lastCom = data.g2();

                let trigger: ServerTriggerType;
                if (opcode === ClientProt.IF_BUTTON1) {
                    trigger = ServerTriggerType.IF_BUTTON1;
                } else if (opcode === ClientProt.IF_BUTTON2) {
                    trigger = ServerTriggerType.IF_BUTTON2;
                } else if (opcode === ClientProt.IF_BUTTON3) {
                    trigger = ServerTriggerType.IF_BUTTON3;
                } else if (opcode === ClientProt.IF_BUTTON4) {
                    trigger = ServerTriggerType.IF_BUTTON4;
                } else {
                    trigger = ServerTriggerType.IF_BUTTON5;
                }

                // TODO verify component exists and is opened
                const ifType = IfType.get(this.lastCom);
                const script = ScriptProvider.getByTrigger(trigger, ifType.id, -1);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        this.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${ifType.comName}]`);
                    }
                }
            } else if (opcode === ClientProt.IF_BUTTOND) {
                this.lastCom = data.g2();
                this.lastSlot = data.g2();
                this.lastUseSlot = data.g2();

                const modalType = IfType.get(this.lastCom);

                const script = ScriptProvider.getByName(`[if_buttond,${modalType.comName}]`);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    console.log(`Unhandled IF_BUTTOND event: ${modalType.comName}`);
                }
            } else if (opcode === ClientProt.OPHELD1 || opcode === ClientProt.OPHELD2 || opcode === ClientProt.OPHELD3 || opcode === ClientProt.OPHELD4 || opcode === ClientProt.OPHELD5) {
                this.lastItem = data.g2();
                this.lastSlot = data.g2();
                this.lastCom = data.g2();

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

                const type = ObjType.get(this.lastItem);
                const script = ScriptProvider.getByTrigger(trigger, type.id, type.category);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        const objType = ObjType.get(this.lastItem);
                        this.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${objType.debugname}]`);
                    }
                }
            } else if (opcode === ClientProt.OPHELDU) {
                this.lastItem = data.g2();
                this.lastSlot = data.g2();
                this.lastCom = data.g2();
                this.lastUseItem = data.g2();
                this.lastUseSlot = data.g2();
                this.lastUseCom = data.g2();

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

                if (script) {
                    this.executeScript(ScriptRunner.init(script, this));
                } else {
                    if (!process.env.PROD_MODE) {
                        this.messageGame(`No trigger for [opheldu,${objType.debugname}]`);
                    }
                }
            } else if (opcode === ClientProt.OPHELDT) {
                this.lastItem = data.g2();
                this.lastSlot = data.g2();
                const comId = data.g2();
                const spellComId = data.g2();

                // TODO: expose spell to script
            } else if (opcode === ClientProt.OPLOC1 || opcode === ClientProt.OPLOC2 || opcode === ClientProt.OPLOC3 || opcode === ClientProt.OPLOC4 || opcode === ClientProt.OPLOC5) {
                const x = data.g2();
                const z = data.g2();
                const locId = data.g2();

                const loc = World.getLoc(x, z, this.level, locId);
                if (!loc) {
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

                this.setInteraction(mode, loc);
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPLOCU) {
                const x = data.g2();
                const z = data.g2();
                const locId = data.g2();
                this.lastItem = data.g2();
                this.lastSlot = data.g2();
                this.lastCom = data.g2();

                const loc = World.getLoc(x, z, this.level, locId);
                if (!loc) {
                    continue;
                }

                this.setInteraction(ServerTriggerType.APLOCU, loc);
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPLOCT) {
                const x = data.g2();
                const z = data.g2();
                const locId = data.g2();
                const comId = data.g2();
                const spellComId = data.g2();

                // TODO: expose spell to script
            } else if (opcode === ClientProt.OPNPC1 || opcode === ClientProt.OPNPC2 || opcode === ClientProt.OPNPC3 || opcode === ClientProt.OPNPC4 || opcode === ClientProt.OPNPC5) {
                const nid = data.g2();

                const npc = World.getNpc(nid);
                if (!npc) {
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

                this.setInteraction(mode, npc);
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPNPCU) {
                const nid = data.g2();
                this.lastItem = data.g2();
                this.lastSlot = data.g2();
                this.lastCom = data.g2();

                const npc = World.getNpc(nid);
                if (!npc) {
                    continue;
                }

                this.setInteraction(ServerTriggerType.APNPCU, npc);
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPNPCT) {
                const nid = data.g2();
                const comId = data.g2();
                const spellComId = data.g2();

                // TODO: expose spell to script
            } else if (opcode === ClientProt.OPOBJ1 || opcode === ClientProt.OPOBJ2 || opcode === ClientProt.OPOBJ3 || opcode === ClientProt.OPOBJ4 || opcode === ClientProt.OPOBJ5) {
                const x = data.g2();
                const z = data.g2();
                const objId = data.g2();

                const obj = World.getObj(x, z, this.level, objId);
                if (!obj) {
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

                this.setInteraction(mode, obj);
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPOBJU) {
                const x = data.g2();
                const z = data.g2();
                const objId = data.g2();
                this.lastItem = data.g2();
                this.lastSlot = data.g2();
                this.lastCom = data.g2();

                const obj = World.getObj(x, z, this.level, objId);
                if (!obj) {
                    continue;
                }

                this.setInteraction(ServerTriggerType.APOBJU, obj);
                pathfindRequest = true;
            } else if (opcode === ClientProt.OPOBJT) {
                const x = data.g2();
                const z = data.g2();
                const objId = data.g2();
                const comId = data.g2();
                const spellComId = data.g2();

                // TODO: expose spell to script
            } else if (opcode === ClientProt.OPPLAYER1 || opcode === ClientProt.OPPLAYER2 || opcode === ClientProt.OPPLAYER3 || opcode === ClientProt.OPPLAYER4) {
                const pid = data.g2();

                // TODO: player trigger
            } else if (opcode === ClientProt.OPPLAYERU) {
                const pid = data.g2();
                this.lastItem = data.g2();
                this.lastSlot = data.g2();
                this.lastCom = data.g2();

                // TODO: player trigger
            } else if (opcode === ClientProt.OPPLAYERT) {
                const pid = data.g2();
                const comId = data.g2();
                const spellComId = data.g2();

                // TODO: player trigger, expose spell to script
            }
        }

        if (this.forceMove) {
            pathfindRequest = false;
            this.pathfindX = -1;
            this.pathfindZ = -1;
        }

        this.client.reset();

        // process any pathfinder requests now
        if (pathfindRequest && this.pathfindX !== -1 && this.pathfindZ !== -1) {
            if (this.delayed()) {
                this.clearWalkingQueue();
                return;
            }

            if (!this.interaction || this.interaction.target instanceof Loc || this.interaction.target instanceof Obj) {
                this.faceEntity = -1;
                this.mask |= Player.FACE_ENTITY;
            }

            let path;
            if (this.interaction) {
                const target = this.interaction.target;
                if (target instanceof Player || target instanceof Npc) {
                    path = World.pathFinder.findPath(this.level, this.x, this.z, target.x, target.z, 1, target.width, target.length, 0, -2);
                } else if (target instanceof Loc) {
                    const forceapproach = LocType.get(target.type).forceapproach;
                    path = World.pathFinder.findPath(this.level, this.x, this.z, target.x, target.z, 1, target.width, target.length, target.rotation, target.shape, false, forceapproach);
                }
            }

            if (!path) {
                path = World.pathFinder.findPath(this.level, this.x, this.z, this.pathfindX, this.pathfindZ);
            }

            this.queueWalkWaypoints(path.waypoints);

            this.pathfindX = -1;
            this.pathfindZ = -1;
        }
    }

    queueWalkWaypoint(x: number, z: number, forceMove: boolean = false) {
        super.queueWalkWaypoint(x, z);
        this.forceMove = forceMove;
    }

    encodeOut() {
        if (this.modalTop !== this.lastModalTop || this.modalBottom !== this.lastModalBottom || this.modalSidebar !== this.lastModalSidebar) {
            if (this.refreshModalClose) {
                this.ifCloseSub();
            }
            this.refreshModalClose = false;

            this.lastModalTop = this.modalTop;
            this.lastModalBottom = this.modalBottom;
            this.lastModalSidebar = this.modalSidebar;
        }

        if (this.refreshModal) {
            if ((this.modalState & 1) === 1 && (this.modalState & 4) === 4) {
                this.ifOpenSub(this.modalTop, this.modalSidebar);
            } else if ((this.modalState & 1) === 1) {
                this.ifOpenTop(this.modalTop);
            } else if ((this.modalState & 2) === 2) {
                this.ifOpenBottom(this.modalBottom);
            } else if ((this.modalState & 4) === 4) {
                this.ifOpenSidebar(this.modalSidebar);
            }

            this.refreshModal = false;
        }

        if (this.client != null) {
            for (let j = 0; j < this.netOut.length; j++) {
                const out: any = this.netOut[j];

                if (this.client.encryptor) {
                    out.data[0] = (out.data[0] + this.client.encryptor.nextInt()) & 0xFF;
                }

                this.client.write(out);
            }
            this.client.flush();
        }

        this.netOut = [];
    }

    // ----

    onLogin() {
        const loginScript = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGIN, -1, -1);
        if (loginScript) {
            this.executeScript(ScriptRunner.init(loginScript, this));
        }

        // normalize client between logins
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

        for (let i = 0; i < this.stats.length; i++) {
            this.updateStat(i, this.stats[i], this.levels[i]);
        }

        // TODO: move to runescript
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
                ObjType.load('data/pack/server');
                LocType.load('data/pack/server');
                NpcType.load('data/pack/server');
                IfType.load('data/pack/server');
                SeqType.load('data/pack/server');
                MesanimType.load('data/pack/server');
                DbTableType.load('data/pack/server');
                DbRowType.load('data/pack/server');

                const count = ScriptProvider.load('data/pack/server');
                this.messageGame(`Reloaded ${count} scripts.`);
            } break;
            case 'clearinv': {
                const inv = args.shift();
                if (inv) {
                    this.invClear(InvType.getId(inv));
                } else {
                    this.invClear(InvType.getId('inv'));
                }
            } break;
            case 'give': {
                const obj = args.shift();
                if (!obj) {
                    this.messageGame('Usage: ::give <obj> (count) (inv)');
                    return;
                }

                let count = args.shift() || 1;
                const inv = args.shift() || 'inv';

                if (typeof count === 'string') {
                    count = parseInt(count, 10);
                }

                const objType = ObjType.getByName(obj);
                if (!objType) {
                    this.messageGame(`Unknown object ${obj}`);
                    return;
                }

                const invId = InvType.getId(inv);
                if (invId === -1) {
                    this.messageGame(`Unknown inventory ${inv}`);
                    return;
                }

                if (inv === 'worn') {
                    this.invSet(invId, objType.id, count, objType.wearpos);
                    this.generateAppearance(invId);
                } else {
                    this.invAdd(invId, objType.id, count);
                }

                this.messageGame(`Added ${objType.name} x ${count}`);
            } break;
            case 'item': {
                const obj = args.shift();
                if (!obj) {
                    this.messageGame('Usage: ::item <obj> (count) (inv)');
                    return;
                }

                let count = args.shift() || 1;
                const inv = args.shift() || 'inv';

                if (typeof count === 'string') {
                    count = parseInt(count, 10);
                }

                const objType = ObjType.get(parseInt(obj));
                if (!objType) {
                    this.messageGame(`Unknown object ${obj}`);
                    return;
                }

                this.invAdd(InvType.getId(inv), objType.id, count);
                this.messageGame(`Added ${objType.name} x ${count}`);
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
            case 'coord': {
                this.messageGame(`Coord: ${this.level}_${Position.mapsquare(this.x)}_${Position.mapsquare(this.z)}_${Position.localOrigin(this.x)}_${Position.localOrigin(this.z)}`);
            } break;
            case 'jtele': {
                const args2 = cheat.split('_');

                if (args2.length < 5) {
                    this.messageGame('Usage: ::jtele level_mx_mz_lx_lz');
                    return;
                }

                const level = parseInt(args2[0].slice(6));
                const mx = parseInt(args2[1]);
                const mz = parseInt(args2[2]);
                const lx = parseInt(args2[3]);
                const lz = parseInt(args2[4]);

                this.teleport((mx << 6) + lx, (mz << 6) + lz, level);
            } break;
            case 'pos': {
                this.messageGame(`Position: ${this.x} ${this.z} ${this.level}`);
            } break;
            case 'zone': {
                this.messageGame(`Zone: ${this.x >> 3}_${this.z >> 3}`);
            } break;
            case 'tele': {
                if (args.length < 2) {
                    this.messageGame('Usage: ::tele <x> <z> (level)');
                    return;
                }

                const x = parseInt(args[0]);
                const z = parseInt(args[1]);
                const level = parseInt(args[2] ?? this.level);

                this.teleport(x, z, level);
            } break;
            case 'telelevel': {
                if (args.length < 1) {
                    this.messageGame('Usage: ::telelevel <level>');
                }

                const level = parseInt(args[0]);

                this.teleport(this.x, this.z, level);
            } break;
            case 'region': {
                if (args.length < 2) {
                    this.messageGame('Usage: ::region <x> <z> (level)');
                    return;
                }

                const x = parseInt(args[0]);
                const z = parseInt(args[1]);
                const level = parseInt(args[2] ?? this.level);

                this.teleport((x << 6) + 32, (z << 6) + 32, level);
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
            case 'maxlevel': {
                for (let i = 0; i < Player.SKILLS.length; i++) {
                    this.setLevel(i, 99);
                }
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
            case 'home': {
                this.teleport(3222, 3222, 0);
            } break;
            case 'givecrap': {
                for (let i = 0; i < 8; i++) {
                    const obj = ObjType.get(Math.random() * ObjType.configs.length);
                    this.invAdd(InvType.getId('inv'), obj.id, obj.stackable ? Math.random() * 100 : 1);
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

                this.openTop(inter.id);
            } break;
            case 'npc': {
                const name = args.shift();
                if (!name) {
                    this.messageGame('Usage: ::npc <name>');
                    return;
                }

                const npcType = NpcType.getByName(name);
                if (!npcType) {
                    this.messageGame(`Unknown npc ${name}`);
                    return;
                }

                const npc = new Npc(
                    this.level,
                    this.x,
                    this.z,
                    npcType.size,
                    npcType.size,
                    World.getNextNid(),
                    npcType.id,
                    npcType.moverestrict
                );
                World.addNpc(npc);
            } break;
            case 'loc': {
                const name = args.shift();
                if (!name) {
                    this.messageGame('Usage: ::loc <name>');
                    return;
                }

                const locType = LocType.getByName(name);
                if (!locType) {
                    this.messageGame(`Unknown loc ${name}`);
                    return;
                }

                const entity = new Loc(
                    this.level,
                    this.x,
                    this.z,
                    locType.width,
                    locType.length,
                    locType.id,
                    10,
                    0
                );
                World.addLoc(entity, 500);
            } break;
            case 'seq': {
                const name = args.shift();
                if (!name) {
                    this.messageGame('Usage: ::seq <name>');
                    return;
                }

                const seqType = SeqType.getByName(name);
                if (!seqType) {
                    this.messageGame(`Unknown seq ${name}`);
                    return;
                }
                this.playAnimation(seqType.id, 0);
            } break;
            case 'close': {
                this.closeModal();
            } break;
            default: {
                if (cmd.length <= 0) {
                    return;
                }

                // lookup debugproc with the name and execute it
                const script = ScriptProvider.getByName(`[debugproc,${cmd}]`);
                if (!script) {
                    // TODO only send message if staffmodlevel >= 2
                    this.messageGame(`Unable to locate [debugproc,${cmd}].`);
                    return;
                }

                this.executeScript(ScriptRunner.init(script, this));
            } break;
        }
    }

    onMapEnter() {
        if (Position.mapsquare(this.x) == Position.mapsquare(this.lastMapsquareX) && Position.mapsquare(this.z) == Position.mapsquare(this.lastMapsquareZ)) {
            return;
        }

        const script = ScriptProvider.getByName('[mapenter,_]');
        if (script) {
            this.executeScript(ScriptRunner.init(script, this));
        }

        this.lastMapsquareX = this.x;
        this.lastMapsquareZ = this.z;
    }

    // ----

    refreshZonePresence(preX: number, preZ: number) {
        // update collision map
        World.collisionManager.changeEntityCollision(preX, preZ, this.level, false);
        World.collisionManager.changeEntityCollision(this.x, this.z, this.level, true);

        if (Position.zone(preX) !== Position.zone(this.x) || Position.zone(preZ) !== Position.zone(this.z)) {
            // update zone entities
            World.getZone(preX, preZ, this.level).removePlayer(this);
            World.getZone(this.x, this.z, this.level).addPlayer(this);
        }
    }

    updateMovement(): void {
        if (this.containsModalInterface() || this.placement) {
            this.walkDir = -1;
            this.runDir = -1;
            return;
        }

        if (this.x === this.lastX && this.z === this.lastZ) {
            this.processMovement();
        }

        const preX = this.x;
        const preZ = this.z;
        if (this.exactMoveEnd !== -1) {
            // TODO: revisit this later, to be able to combine walk+exactmove
            this.lastX = this.x;
            this.lastZ = this.z;

            // TODO: interpolate start/end over time like client?
            this.x = this.exactEndX + Position.zoneOrigin(this.loadedX);
            this.z = this.exactEndZ + Position.zoneOrigin(this.loadedZ);
        }
        this.refreshZonePresence(preX, preZ);

        // if we've arrived to our original destination, check if the target has moved since, so we can path to their latest coord and try again later
        if (this.interaction && !this.hasSteps() && (this.interaction.target.x !== this.interaction.x || this.interaction.target.z !== this.interaction.z)) {
            const target = this.interaction.target;

            let path;
            if (target instanceof Player || target instanceof Npc) {
                path = World.pathFinder.findPath(this.level, this.x, this.z, target.x, target.z, 1, target.width, target.length, 0, -2);
            }

            if (path) {
                this.queueWalkWaypoints(path.waypoints);
            }

            this.interaction.x = target.x;
            this.interaction.z = target.z;

            if (this.walkDir === -1) {
                this.updateMovement();
            }
        }
    }

    processMovement(running = -1) {
        if (!this.hasSteps()) {
            if (this.faceX != -1) {
                this.mask |= Player.FACE_COORD;
                this.alreadyFacedCoord = true;
            }

            this.walkStep = -1;
            this.walkQueue = [];
            this.setVarp('temp_run', 0);
            this.forceMove = false;
            return;
        }

        if (running === -1 && !this.forceMove) {
            running = 0;
            running |= this.getVarp('player_run') ? 1 : 0;
            running |= this.getVarp('temp_run') ? 1 : 0;
        }

        const preX = this.x;
        const preZ = this.z;

        if (this.forceMove) {
            if (this.walkDir !== -1 && this.runDir === -1) {
                this.runDir = this.updateMovementStep();
            } else if (this.walkDir === -1) {
                this.walkDir = this.updateMovementStep();
            } else {
                this.updateMovementStep();
            }
        } else {
            if (this.walkDir === -1) {
                this.walkDir = this.updateMovementStep();
            }

            if (this.walkDir !== -1 && this.runDir === -1 && running === 1) {
                this.runDir = this.updateMovementStep();
            }
        }

        this.refreshZonePresence(preX, preZ);
    }

    // ----

    setInteraction(mode: ServerTriggerType, target: Player | Npc | Loc | Obj) {
        if (this.forceMove) {
            return;
        }

        this.closeModal();

        this.interaction = {
            mode,
            target,
            x: target.x,
            z: target.z,
            ap: true, // true so we check for existence of ap script first
            apRange: 10,
            apRangeCalled: false,
        };

        this.pathfindX = target.x;
        this.pathfindZ = target.z;

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
        } else {
            this.faceX = (target.x * 2) + 1;
            this.faceZ = (target.z * 2) + 1;
        }

        if (!this.getInteractionScript(this.interaction) || this.inOperableDistance(this.interaction)) {
            this.interaction.ap = false;
        }
    }

    resetInteraction() {
        this.interaction = null;
    }

    getInteractionScript(interaction: Interaction) {
        if (interaction == null) {
            return null;
        }

        let typeId = -1;
        let categoryId = -1;
        if (interaction.target instanceof Npc || interaction.target instanceof Loc || interaction.target instanceof Obj) {
            const type = interaction.target instanceof Npc ? NpcType.get(interaction.target.type) : interaction.target instanceof Loc ? LocType.get(interaction.target.type) : ObjType.get(interaction.target.type);
            typeId = type.id;
            categoryId = type.category;
        }

        let script = null;

        if (interaction.ap) {
            script = ScriptProvider.getByTrigger(interaction.mode, typeId, categoryId);
        } else {
            script = ScriptProvider.getByTrigger(interaction.mode + 7, typeId, categoryId);
        }

        if (!script && typeId !== -1 && categoryId !== -1) {
            if (interaction.ap) {
                script = ScriptProvider.getByTrigger(interaction.mode, -1, categoryId);
            } else {
                script = ScriptProvider.getByTrigger(interaction.mode + 7, -1, categoryId);
            }
        }

        if (!script && typeId !== -1 && categoryId !== -1) {
            if (interaction.ap) {
                script = ScriptProvider.getByTrigger(interaction.mode, -1, -1);
            } else {
                script = ScriptProvider.getByTrigger(interaction.mode + 7, -1, -1);
            }
        }

        return script ?? null;
    }

    executeInteraction(interaction: Interaction) {
        const script = this.getInteractionScript(interaction);
        if (!script) {
            if (!process.env.PROD_MODE) {
                if (interaction.target instanceof Player) {
                    this.messageGame(`No trigger for [${ServerTriggerType.toString(interaction.mode + 7).toString()},_]`);
                } else {
                    const type = interaction.target instanceof Npc ? NpcType.get(interaction.target.type) : interaction.target instanceof Loc ? LocType.get(interaction.target.type) : ObjType.get(interaction.target.type);
                    this.messageGame(`No trigger for [${ServerTriggerType.toString(interaction.mode  + 7).toString()},${type.debugname}] - Coord: ${this.level}_${Position.mapsquare(this.x)}_${Position.mapsquare(this.z)}_${Position.localOrigin(this.x)}_${Position.localOrigin(this.z)}`);
                }
            }

            this.messageGame('Nothing interesting happens.');
            return;
        }

        const state = ScriptRunner.init(script, this, interaction.target);
        this.executeScript(state);

        if (state.execution !== ScriptState.FINISHED && state.execution !== ScriptState.ABORTED) {
            this.interaction = null;
        }
    }

    closeSticky() {
        if (this.modalSticky !== -1) {
            const modalType = IfType.get(this.modalSticky);

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }

            this.modalSticky = -1;
            this.ifOpenSticky(-1);
        }
    }

    closeModal() {
        this.weakQueue = [];
        this.activeScript = null;

        if (this.modalState === 0) {
            return;
        }

        if (this.modalTop !== -1) {
            const modalType = IfType.get(this.modalTop);

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }

            this.modalTop = -1;
        }

        if (this.modalBottom !== -1) {
            const modalType = IfType.get(this.modalBottom);

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }

            this.modalBottom = -1;
        }

        if (this.modalSidebar !== -1) {
            const modalType = IfType.get(this.modalSidebar);

            const script = ScriptProvider.getByName(`[if_close,${modalType.comName}]`);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
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
        return (this.modalState & 1) === 1 || (this.modalState & 2) === 2;
    }

    busy() {
        return this.delayed() || this.containsModalInterface();
    }

    inOperableDistance(interaction: Interaction): boolean {
        const target = interaction.target;

        if (this.x === target.x && this.z === target.z) {
            return true;
        }

        if (target instanceof Player || target instanceof Npc || target instanceof Obj) {
            return ReachStrategy.reached(World.collisionFlags, this.level, this.x, this.z, target.x, target.z, 1, 1, 1, 0, -2);
        } else if (target instanceof Loc) {
            const type = LocType.get(target.type);
            return ReachStrategy.reached(World.collisionFlags, this.level, this.x, this.z, target.x, target.z, type.width, type.length, 1, target.rotation, target.shape);
        }

        return false;
    }

    inApproachDistance(interaction: Interaction): boolean {
        const target = interaction.target;

        if (target instanceof Player || target instanceof Npc) {
            return World.linePathFinder.lineOfSight(this.level, this.x, this.z, target.x, target.z, 1, 1, 1).success && Position.distanceTo(this, target) <= interaction.apRange;
        } else if (target instanceof Loc) {
            const type = LocType.get(target.type);
            return World.linePathFinder.lineOfSight(this.level, this.x, this.z, target.x, target.z, 1, type.width, type.length).success && Position.distanceTo(this, target) <= interaction.apRange;
        } else if (target instanceof Obj) {
            return World.linePathFinder.lineOfSight(this.level, this.x, this.z, target.x, target.z, 1).success && Position.distanceTo(this, target) <= interaction.apRange;
        }

        return false;
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
        if (type === 'weak') {
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

    processInteraction() {
        // check if the target currently exists, if not clear the interaction
        if (this.interaction) {
            const target = this.interaction.target;
            if (target instanceof Player) {
                if (World.getPlayer(target.pid) == null) {
                    this.resetInteraction();
                    return;
                }
            } else if (target instanceof Npc) {
                if (World.getNpc(target.nid) == null) {
                    this.resetInteraction();
                    return;
                }
            } else if (target instanceof Loc) {
                if (World.getLoc(target.x, target.z, this.level, target.type) == null) {
                    this.resetInteraction();
                    return;
                }
            } else if (target instanceof Obj) {
                if (World.getObj(target.x, target.z, this.level, target.type) == null) {
                    this.resetInteraction();
                    return;
                }
            }
        }

        if (!this.interaction) {
            // skip the full interaction logic and just process movement
            this.updateMovement();
            return;
        }

        const interaction = this.interaction;
        interaction.apRangeCalled = false;

        const target = interaction.target;
        let interacted = false;

        if (!this.busy()) {
            if (!interaction.ap && this.inOperableDistance(interaction) && (target instanceof Player || target instanceof Npc)) {
                this.executeInteraction(interaction);
                interacted = true;
            } else if (interaction.ap && this.inApproachDistance(interaction)) {
                this.executeInteraction(interaction);
                interacted = true;
            }
        }

        this.updateMovement();
        const moved = this.lastX !== this.x || this.lastZ !== this.z;
        if (moved) {
            this.lastMovement = World.currentTick + 1;
        }

        if (!this.busy()) {
            if (!interacted || interaction.apRangeCalled) {
                if (!interaction.ap && this.inOperableDistance(interaction) && ((target instanceof Player || target instanceof Npc) || !moved)) {
                    this.executeInteraction(interaction);
                    interacted = true;
                } else if (interaction.ap && this.inApproachDistance(interaction)) {
                    this.executeInteraction(interaction);
                    interacted = true;
                }
            }
        }

        if (!this.delayed()) {
            if (!interacted && !moved && !this.hasSteps()) {
                this.messageGame('I can\'t reach that!');
                this.resetInteraction();
            }

            if (interacted && !interaction.apRangeCalled && this.interaction === interaction) {
                this.resetInteraction();
            }
        }
    }

    // ----

    updateBuildArea() {
        const dx = Math.abs(this.x - this.loadedX);
        const dz = Math.abs(this.z - this.loadedZ);

        // if the build area should be regenerated, do so now
        if (dx >= 36 || dz >= 36 || (this.placement && (Position.zone(this.x) !== Position.zone(this.loadedX) || Position.zone(this.z) !== Position.zone(this.loadedZ)))) {
            this.loadArea(Position.zone(this.x), Position.zone(this.z));

            this.loadedX = this.x;
            this.loadedZ = this.z;
            this.loadedZones = {};
        }

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

                let newlyObserved = false;
                if (typeof this.loadedZones[zone.index] === 'undefined') {
                    // full update necessary to clear client zone memory
                    this.updateZoneFullFollows(x << 3, z << 3);
                    newlyObserved = true;
                }

                const buffer = World.getSharedEvents(zone.index);
                if (buffer && buffer.length) {
                    this.updateZonePartialEnclosed(x << 3, z << 3, buffer);
                }

                const updates = World.getReceiverUpdates(zone.index, this.pid).filter(event => {
                    return newlyObserved || (!newlyObserved && !event.static && event.tick > this.loadedZones[zone.index]);
                });
                if (updates.length) {
                    this.updateZonePartialFollows(x << 3, z << 3);

                    for (let i = 0; i < updates.length; i++) {
                        // have to copy because encryption will be applied to buffer
                        this.netOut.push(new Packet(updates[i].buffer));
                    }
                }

                this.loadedZones[zone.index] = zone.lastEvent;
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
        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;
        const absLeftX = this.loadedX - 52;
        const absRightX = this.loadedX + 52;
        const absTopZ = this.loadedZ + 52;
        const absBottomZ = this.loadedZ - 52;

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
                    if (player === this || player.x < absLeftX || player.x >= absRightX - 4 || player.z >= absTopZ - 4 || player.z < absBottomZ) {
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
        const out = new Packet();
        out.bits();

        out.pBit(1, (this.mask > 0 || this.placement || (this.walkDir !== -1 || this.runDir !== -1)) ? 1 : 0);
        if (this.placement) {
            out.pBit(2, 3);
            out.pBit(2, this.level);
            out.pBit(7, Position.local(this.x));
            out.pBit(7, Position.local(this.z));
            out.pBit(1, !this.hasSteps() ? 1 : 0);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.runDir !== -1) {
            out.pBit(2, 2);
            out.pBit(3, this.walkDir);
            out.pBit(3, this.runDir);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.walkDir !== -1) {
            out.pBit(2, 1);
            out.pBit(3, this.walkDir);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.mask > 0) {
            out.pBit(2, 0);
        }

        const nearby = this.getNearbyPlayers();
        this.players = this.players.filter(x => x !== null);

        const removedPlayers = this.players.filter(x => nearby.findIndex(y => y.pid === x.pid) === -1);
        this.players.filter(x => removedPlayers.findIndex(y => x.pid === y.pid) !== -1).map(x => {
            x.type = 1;
        });

        const updates: any[] = [];
        out.pBit(8, this.players.length);
        this.players = this.players.filter(x => {
            if (x.type === 1 || x.player.placement) {
                // remove
                out.pBit(1, 1);
                out.pBit(2, 3);
                return false;
            } else if (x.type === 0) {
                if (x.player.mask > 0) {
                    updates.push(x.player);
                }

                out.pBit(1, (x.player.mask > 0 || (x.player.walkDir !== -1 || x.player.runDir !== -1)) ? 1 : 0);
                if (x.player.runDir !== -1) {
                    out.pBit(2, 2);
                    out.pBit(3, x.player.runDir);
                    out.pBit(3, x.player.walkDir);
                    out.pBit(1, x.player.mask > 0 ? 1 : 0);
                } else if (x.player.walkDir !== -1) {
                    out.pBit(2, 1);
                    out.pBit(3, x.player.walkDir);
                    out.pBit(1, x.player.mask > 0 ? 1 : 0);
                } else if (x.player.mask > 0) {
                    out.pBit(2, 0);
                }

                return true;
            }
        });

        const newPlayers = nearby.filter(x => this.players.findIndex(y => y.pid === x.pid) === -1);
        newPlayers.map(p => {
            out.pBit(11, p.pid);
            let xPos = p.x - this.x;
            if (xPos < 0) {
                xPos += 32;
            }
            let zPos = p.z - this.z;
            if (zPos < 0) {
                zPos += 32;
            }
            out.pBit(5, xPos);
            out.pBit(5, zPos);
            out.pBit(1, !this.hasSteps() ? 1 : 0);
            out.pBit(1, 1); // update mask follows
            updates.push(p);

            this.players.push({ type: 0, pid: p.pid, player: p });
        });

        if (this.mask > 0 || updates.length) {
            out.pBit(11, 2047);
        }

        out.bytes();

        if (this.mask > 0) {
            this.writeUpdate(out, true, false);
        }

        updates.map(p => {
            const newlyObserved = newPlayers.find(x => x == p) != null;

            p.writeUpdate(out, false, newlyObserved);
        });

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
        const base = 0.25 * (this.baseLevel[Player.DEFENCE] + this.baseLevel[Player.HITPOINTS] + Math.floor(this.baseLevel[Player.PRAYER] / 2));
        const melee = 0.325 * (this.baseLevel[Player.ATTACK] + this.baseLevel[Player.STRENGTH]);
        const range = 0.325 * (Math.floor(this.baseLevel[Player.RANGED] / 2) + this.baseLevel[Player.RANGED]);
        const magic = 0.325 * (Math.floor(this.baseLevel[Player.MAGIC] / 2) + this.baseLevel[Player.MAGIC]);
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

        stream.p2(808);
        stream.p2(823);
        stream.p2(819);
        stream.p2(820);
        stream.p2(821);
        stream.p2(822);
        stream.p2(824);

        stream.p8(this.username37);
        stream.p1(this.combatLevel);

        this.mask |= Player.APPEARANCE;
        this.appearance = stream;
    }

    writeUpdate(out: Packet, self = false, firstSeen = false) {
        let mask = this.mask;
        if (firstSeen) {
            mask |= Player.APPEARANCE;
        }
        if (firstSeen && (this.faceX != -1 || this.faceZ != -1)) {
            mask |= Player.FACE_COORD;
        }
        if (firstSeen && (this.faceEntity != -1)) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xFF) {
            mask |= 0x80;
        }

        if (self && (mask & Player.CHAT)) {
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
            out.pjstr(this.chat!);
        }

        if (mask & Player.DAMAGE) {
            out.p1(this.damageTaken);
            out.p1(this.damageType);
            out.p1(this.levels[3]);
            out.p1(this.baseLevel[3]);
        }

        if (mask & Player.FACE_COORD) {
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
            out.p1(this.exactStartX);
            out.p1(this.exactStartZ);
            out.p1(this.exactEndX);
            out.p1(this.exactEndZ);
            out.p2(this.exactMoveStart);
            out.p2(this.exactMoveEnd);
            out.p1(this.exactFaceDirection);
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
        const absLeftX = this.loadedX - 52;
        const absRightX = this.loadedX + 52;
        const absTopZ = this.loadedZ + 52;
        const absBottomZ = this.loadedZ - 52;

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
                    if (npc.x < absLeftX || npc.x >= absRightX - 4 || npc.z >= absTopZ - 4 || npc.z < absBottomZ) {
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
        this.npcs = this.npcs.filter(x => x !== null);

        const newNpcs = nearby.filter(x => this.npcs.findIndex(y => y.nid === x.nid) === -1);
        const removedNpcs = this.npcs.filter(x => nearby.findIndex(y => y.nid === x.nid) === -1);
        this.npcs.filter(x => removedNpcs.findIndex(y => x.nid === y.nid) !== -1).map(x => {
            x.type = 1;
        });

        const out = new Packet();
        out.bits();

        // TODO this needs to be reworked
        const updates: any[] = [];
        out.pBit(8, this.npcs.length);
        this.npcs = this.npcs.map((x: any) => {
            if (x.type === 0) {
                if (x.npc.mask > 0) {
                    updates.push(x.npc);
                }

                out.pBit(1, x.npc.walkDir != -1 || x.npc.mask > 0 ? 1 : 0);

                if (x.npc.walkDir !== -1) {
                    out.pBit(2, 1);
                    out.pBit(3, x.npc.walkDir);
                    out.pBit(1, x.npc.mask > 0 ? 1 : 0);
                } else if (x.npc.mask > 0) {
                    out.pBit(2, 0);
                }
                return x;
            } else if (x.type === 1) {
                // remove
                out.pBit(1, 1);
                out.pBit(2, 3);
                return null;
            }
        });

        newNpcs.map(n => {
            out.pBit(13, n.nid);
            out.pBit(11, n.type);
            let xPos = n.x - this.x;
            if (xPos < 0) {
                xPos += 32;
            }
            let zPos = n.z - this.z;
            if (zPos < 0) {
                zPos += 32;
            }
            out.pBit(5, xPos);
            out.pBit(5, zPos);

            if (n.orientation !== -1) {
                out.pBit(1, 1);
                updates.push(n);
            } else {
                out.pBit(1, 0);
            }

            this.npcs.push({ type: 0, nid: n.nid, npc: n });
        });

        if (updates.length) {
            out.pBit(13, 8191);
        }
        out.bytes();

        updates.map(n => {
            const newlyObserved = newNpcs.find(x => x == n) != null;

            let mask = n.mask;
            if (newlyObserved && (n.orientation !== -1 || n.faceX !== -1)) {
                mask |= Npc.FACE_COORD;
            }
            if (newlyObserved && n.faceEntity !== -1) {
                mask |= Npc.FACE_ENTITY;
            }
            out.p1(mask);

            if (mask & Npc.ANIM) {
                out.p2(n.animId);
                out.p1(n.animDelay);
            }

            if (mask & Npc.FACE_ENTITY) {
                out.p2(n.faceEntity);
            }

            if (mask & Npc.SAY) {
                out.pjstr(n.chat);
            }

            if (mask & Npc.DAMAGE) {
                out.p1(n.damageTaken);
                out.p1(n.damageType);
                out.p1(n.currentHealth);
                out.p1(n.maxHealth);
            }

            if (mask & Npc.TRANSMOGRIFY) {
                out.p2(n.transmogId);
            }

            if (mask & Npc.SPOTANIM) {
                out.p2(n.graphicId);
                out.p2(n.graphicHeight);
                out.p2(n.graphicDelay);
            }

            if (mask & Npc.FACE_COORD) {
                if (newlyObserved && n.faceX != -1) {
                    out.p2(n.faceX);
                    out.p2(n.faceZ);
                } else if (newlyObserved && n.orientation != -1) {
                    const faceX = Position.moveX(n.x, n.orientation);
                    const faceZ = Position.moveZ(n.z, n.orientation);
                    out.p2(faceX * 2 + 1);
                    out.p2(faceZ * 2 + 1);
                } else {
                    out.p2(n.faceX);
                    out.p2(n.faceZ);
                }
            }
        });

        this.npcInfo(out);
    }

    // ----

    updateInvs() {
        // TODO change to listeningInvs

        for (const inv of this.invs.values()) {
            if (!inv || !inv.listeners.length || !inv.update) {
                continue;
            }

            for (let j = 0; j < inv.listeners.length; j++) {
                const listener = inv.listeners[j];
                if (!listener) {
                    continue;
                }

                this.updateInvFull(listener.com, inv);
            }

            inv.update = false;
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

    invListenOnCom(inv: number, com: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invGetSlot: Invalid inventory type: ' + inv);
        }

        container.listeners.push({ pid: this.pid, com: com });
        container.update = true;
    }

    invStopListenOnCom(inv: number, com: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invGetSlot: Invalid inventory type: ' + inv);
        }

        const index = container.listeners.findIndex(x => x && x.pid === this.pid && x.com === com);
        if (index !== -1) {
            container.listeners.splice(index, 1);
        }
    }

    invGetSlot(inv: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invGetSlot: Invalid inventory type: ' + inv);
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

    invAdd(inv: number, obj: number, count: number): boolean {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invDel: Invalid inventory type: ' + inv);
        }

        if (obj === -1) {
            return false;
        }

        container.add(obj, count);
        return true;
    }

    invSet(inv: number, obj: number, count: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invSet: Invalid inventory type: ' + inv);
        }

        if (obj === -1) {
            container.delete(slot);
            return;
        }

        container.set(slot, { id: obj, count });
    }

    invDel(inv: number, obj: number, count: number): boolean {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invDel: Invalid inventory type: ' + inv);
        }

        container.remove(obj, count);
        return true;
    }

    invDelSlot(inv: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invSize: Invalid inventory type: ' + inv);
        }

        return container.delete(slot);
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

    invSwap(inv: number, slot1: number, slot2: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invFreeSpace: Invalid inventory type: ' + inv);
        }

        container.swap(slot1, slot2);
    }

    invFreeSpace(inv: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invFreeSpace: Invalid inventory type: ' + inv);
        }

        return container.freeSlotCount();
    }

    // ----

    getVarp(varp: any) {
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

    giveXp(stat: number, xp: number) {
        // require xp is >= 0. there is no reason for a requested giveXp to be negative.
        if (xp < 0) {
            throw new Error(`Invalid xp parameter for giveXp call: Stat was: ${stat}, Exp was: ${xp}`);
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

        // TODO: levelup trigger
        this.baseLevel[stat] = getLevelByExp(this.stats[stat]);
        // TODO: update this.levels[stat]?
        this.updateStat(stat, this.stats[stat], this.levels[stat]);

        if (this.getCombatLevel() != this.combatLevel) {
            this.combatLevel = this.getCombatLevel();
            this.generateAppearance(InvType.getId('worn'));
        }
    }

    setLevel(stat: number, level: number) {
        this.baseLevel[stat] = level;
        this.levels[stat] = level;
        this.stats[stat] = getExpByLevel(level);

        if (this.getCombatLevel() != this.combatLevel) {
            this.combatLevel = this.getCombatLevel();
            this.generateAppearance(InvType.getId('worn'));
        }

        this.updateStat(stat, this.stats[stat], this.levels[stat]);
    }

    playAnimation(seq: number, delay: number) {
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

        this.levels[3] -= damage;
        if (this.levels[3] < 0) {
            this.levels[3] = 0;
        }

        this.mask |= Player.DAMAGE;
    }

    teleport(x: number, z: number, level: number) {
        if (isNaN(level)) {
            level = 0;
        }
        level = Math.max(0, Math.min(level, 3));

        const preX = this.x;
        const preZ = this.z;
        this.x = x;
        this.z = z;
        if (this.level != level) {
            this.loadedZones = {};
        }
        this.level = level;
        this.refreshZonePresence(preX, preZ);

        this.placement = true;
        this.walkDir = -1;
        this.runDir = -1;
        this.walkStep = 0;
        this.walkQueue = [];
    }

    say(message: string) {
        this.chat = message;
        this.mask |= Player.SAY;
    }

    faceSquare(x: number, z: number) {
        this.faceX = x * 2 + 1;
        this.faceZ = z * 2 + 1;
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

    openTop(com: number) {
        // this.ifOpenTop(com);
        this.modalState |= 1;
        this.modalTop = com;
        this.refreshModal = true;
    }

    openBottom(com: number) {
        // this.ifOpenBottom(com);
        this.modalState |= 2;
        this.modalBottom = com;
        this.refreshModal = true;
    }

    openSidebar(com: number) {
        // this.ifOpenSidebar(com);
        this.modalState |= 4;
        this.modalSidebar = com;
        this.refreshModal = true;
    }

    openSticky(com: number) {
        this.ifOpenSticky(com);
        this.modalState |= 8;
        this.modalSticky = com;
    }

    openSub(top: number, side: number) {
        // this.ifOpenSub(top, side);
        this.modalState |= 1;
        this.modalTop = top;
        this.modalState |= 4;
        this.modalSidebar = side;
        this.refreshModal = true;
    }

    exactMove(startX: number, startZ: number, endX: number, endZ: number, startCycle: number, endCycle: number, direction: number) {
        startX -= Position.zoneOrigin(this.loadedX);
        startZ -= Position.zoneOrigin(this.loadedZ);
        endX -= Position.zoneOrigin(this.loadedX);
        endZ -= Position.zoneOrigin(this.loadedZ);

        this.exactStartX = startX;
        this.exactStartZ = startZ;
        this.exactEndX = endX;
        this.exactEndZ = endZ;
        this.exactMoveStart = startCycle;
        this.exactMoveEnd = endCycle;
        this.exactFaceDirection = direction;
        this.mask |= Player.EXACT_MOVE;
    }

    // ----

    executeScript(script: ScriptState) {
        if (!script) {
            return;
        }

        const state = ScriptRunner.execute(script);
        if (state !== ScriptState.FINISHED && state !== ScriptState.ABORTED) {
            this.activeScript = script;
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

    ifOpenBottom(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENBOTTOM);

        out.p2(com);

        this.netOut.push(out);
    }

    ifOpenSub(top: number, side: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENSUB);

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

    ifCloseSub() {
        const out = new Packet();
        out.p1(ServerProt.IF_CLOSESUB);

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

    ifOpenTop(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENTOP);

        out.p2(com);

        this.netOut.push(out);
    }

    ifOpenSticky(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENSTICKY);

        out.p2(com);

        this.netOut.push(out);
    }

    ifOpenSidebar(com: number) {
        const out = new Packet();
        out.p1(ServerProt.IF_OPENSIDEBAR);

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

    updateInvClear(com: number) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        const out = new Packet();
        out.p1(ServerProt.UPDATE_INV_CLEAR);

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

        out.p2(com);
        out.p1(inv.capacity);
        for (let slot = 0; slot < inv.capacity; slot++) {
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
            if (!obj) {
                continue;
            }

            out.p1(slot);
            out.p2(obj.id);
            if (obj.count >= 255) {
                out.p1(255);
                out.p4(obj.count);
            } else {
                out.p1(obj.count);
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

    lastLoginInfo(pid: number) {
        const out = new Packet();
        out.p1(ServerProt.LAST_LOGIN_INFO);

        out.p2(pid);

        this.netOut.push(out);
    }

    logout() {
        const out = new Packet();
        out.p1(ServerProt.LOGOUT);

        this.netOut.push(out);
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
