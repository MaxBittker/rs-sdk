import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';
import { fromBase37, toBase37 } from '#jagex2/jstring/JString.js';
import VarpType from '#lostcity/cache/VarpType.js';
import { Position } from '#lostcity/entity/Position.js';
import { ClientProt, ClientProtLengths, ClientProtNames } from '#lostcity/server/ClientProt.js';
import { ServerProt } from '#lostcity/server/ServerProt.js';
import IfType from '#lostcity/cache/IfType.js';
import InvType from '#lostcity/cache/InvType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import { Inventory } from '#lostcity/engine/Inventory.js';
import ScriptProvider from '#lostcity/engine/ScriptProvider.js';
import ScriptState from '#lostcity/engine/ScriptState.js';
import ScriptRunner from '#lostcity/engine/ScriptRunner.js';
import World from '#lostcity/engine/World.js';
import Npc from '#lostcity/entity/Npc.js';
import LocType from '#lostcity/cache/LocType.js';
import NpcType from '#lostcity/cache/NpcType.js';

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

function getLevelByExp(exp) {
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

function getExpByLevel(level) {
    return EXP_LEVELS[level - 1];
}

export default class Player {
    static APPEARANCE = 0x1;
    static ANIM = 0x2;
    static FACE_ENTITY = 0x4;
    static FORCED_CHAT = 0x8;
    static DAMAGE = 0x10;
    static FACE_COORD = 0x20;
    static CHAT = 0x40;
    static SPOTANIM = 0x100;
    static FORCED_MOVEMENT = 0x200;

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

    username = 'invalid_name';
    x = 3222;
    z = 3222;
    level = 0;
    body = [
        0, // hair
        10, // beard
        18, // body
        26, // arms
        33, // gloves
        36, // legs
        42, // boots
    ];
    colors = [
        0,
        0,
        0,
        0,
        0
    ];
    gender = 0;
    runenergy = 10000;
    runweight = 0;
    playtime = 0;
    stats = new Int32Array(21);
    levels = new Uint8Array(21);
    varps = new Int32Array(VarpType.count);
    invs = [
        Inventory.fromType('inv'),
        Inventory.fromType('worn'),
        Inventory.fromType('bank')
    ];

    static load(name) {
        let name37 = toBase37(name);
        let safeName = fromBase37(name37);

        let player = new Player();
        player.username = safeName;
        player.username37 = name37;

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
            player.generateAppearance();
            return player;
        }

        let sav = Packet.load(`data/players/${safeName}.sav`);
        if (sav.g2() !== 0x2004) {
            throw new Error('Invalid player save');
        }

        if (sav.g2() > 1) {
            throw new Error('Unsupported player save format');
        }

        sav.pos = sav.length - 4;
        let crc = sav.g4s();
        if (crc != Packet.crc32(sav, sav.length - 4)) {
            throw new Error('Player save corrupted');
        }

        sav.pos = 4;
        player.x = sav.g2();
        player.z = sav.g2();
        player.level = sav.g1();
        for (let i = 0; i < 7; i++) {
            player.body[i] = sav.g1();
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

        let varpCount = sav.g2();
        for (let i = 0; i < varpCount; i++) {
            player.varps[i] = sav.g4();
        }

        let invCount = sav.g1();
        for (let i = 0; i < invCount; i++) {
            let size = sav.g1();

            // todo
            for (let j = 0; j < size; j++) {
                sav.g2();
                sav.g4();
            }
        }

        player.placement = true;
        player.generateAppearance();
        return player;
    }

    save() {
        let sav = new Packet();
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
            let type = VarpType.get(i);

            if (type.scope === 'perm') {
                sav.p4(this.varps[i]);
            } else {
                sav.p4(0);
            }
        }

        sav.p1(0); // this.invs.length);
        for (let i = 0; i < 0; i++) {
            sav.p1(this.invs[i].size);

            for (let j = 0; j < this.invs[i].size; j++) {
                sav.p2(this.invs[i].objs[j].id);
                sav.p4(this.invs[i].objs[j].count);
            }
        }

        sav.p4(Packet.crc32(sav));
        let safeName = fromBase37(this.username37);
        sav.save(`data/players/${safeName}.sav`);
        return sav;
    }

    // runtime variables
    pid = -1;
    username37 = -1;
    lowMemory = false;
    webClient = false;
    combatLevel = 3;
    headicons = 0;
    appearance = null; // cached appearance
    baseLevel = new Uint8Array(21);
    loadedX = -1;
    loadedZ = -1;
    walkQueue = [];
    walkStep = -1;
    orientation = -1;
    npcs = [];
    players = [];
    clocks = {
        lastMovement: 0,
        skilling: 0
    };

    client = null;
    netOut = [];

    placement = false;
    mask = 0;
    animId = -1;
    animDelay = -1;
    faceEntity = -1;
    forcedChat = null;
    damageTaken = -1;
    damageType = -1;
    faceX = -1;
    faceZ = -1;
    messageColor = null;
    messageEffect = null;
    messageType = null;
    message = null;
    graphicId = -1;
    graphicHeight = -1;
    graphicDelay = -1;
    forceStartX = -1;
    forceStartZ = -1;
    forceDestX = -1;
    forceDestZ = -1;
    forceMoveStart = -1;
    forceMoveEnd = -1;
    forceFaceDirection = -1;

    resetMasks() {
        this.placement = false;
        if (this.mask === 0) {
            return;
        }

        this.mask = 0;
        this.animId = -1;
        this.animDelay = -1;
        this.faceEntity = -1;
        this.forcedChat = null;
        this.damageTaken = -1;
        this.damageType = -1;
        this.currentHealth = -1;
        this.maxHealth = -1;
        this.faceX = -1;
        this.faceZ = -1;
        this.messageColor = null;
        this.messageEffect = null;
        this.messageType = null;
        this.message = null;
        this.graphicId = -1;
        this.graphicHeight = -1;
        this.graphicDelay = -1;
        this.forceStartX = -1;
        this.forceStartZ = -1;
        this.forceDestX = -1;
        this.forceDestZ = -1;
        this.forceMoveStart = -1;
        this.forceMoveEnd = -1;
        this.forceFaceDirection = -1;
    }

    // script variables
    delay = 0;
    queue = [];
    weakQueue = [];
    timers = [];
    modalOpen = false;
    apScript = null;
    opScript = null;
    currentApRange = 10;
    apRangeCalled = false;
    target = null;
    persistent = false;

    interfaceScript = null; // used to store a paused script (waiting for input)
    countInput = 0; // p_countdialog input
    lastVerifyObj = null;
    lastVerifySlot = null;
    lastVerifyCom = null;

    decodeIn() {
        if (this.client.inOffset < 1) {
            return;
        }

        let offset = 0;

        let decoded = [];
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

        for (let it = 0; it < decoded.length; it++) {
            const { opcode, data } = decoded[it];

            if (opcode === ClientProt.MAP_REQUEST_AREAS) {
                let requested = [];

                for (let i = 0; i < data.length / 3; i++) {
                    let type = data.g1();
                    let x = data.g1();
                    let z = data.g1();

                    requested.push({ type, x, z });
                }

                for (let i = 0; i < requested.length; i++) {
                    const { type, x, z } = requested[i];

                    const CHUNK_SIZE = 5000 - 1 - 2 - 1 - 1 - 2 - 2;
                    if (type == 0) {
                        let land = Packet.load(`data/pack/client/maps/m${x}_${z}`);

                        for (let off = 0; off < land.length; off += CHUNK_SIZE) {
                            this.dataLand(x, z, land.gdata(CHUNK_SIZE), off, land.length);
                        }

                        this.dataLandDone(x, z);
                    } else if (type == 1) {
                        let loc = Packet.load(`data/pack/client/maps/l${x}_${z}`);

                        for (let off = 0; off < loc.length; off += CHUNK_SIZE) {
                            this.dataLoc(x, z, loc.gdata(CHUNK_SIZE), off, loc.length);
                        }

                        this.dataLocDone(x, z);
                    }
                }
            } else if (opcode === ClientProt.MOVE_GAMECLICK || opcode === ClientProt.MOVE_MINIMAPCLICK || opcode === ClientProt.MOVE_OPCLICK) {
                let ctrlDown = data.g1() === 1;
                let startX = data.g2();
                let startZ = data.g2();

                let offset = 0;
                if (opcode == ClientProt.MOVE_MINIMAPCLICK) {
                    offset = 14;
                }
                let count = (data.available - offset) / 2;

                if (!this.delayed()) {
                    this.walkQueue = [];
                    this.walkQueue.push({ x: startX, z: startZ });
                    for (let i = 0; i < count; ++i) {
                        let x = data.g1s() + startX;
                        let z = data.g1s() + startZ;
                        this.walkQueue.push({ x, z });
                    }
                    this.walkQueue.reverse();
                    this.walkStep = this.walkQueue.length - 1;
                    
                    if (this.target) {
                        this.resetInteraction();
                    }

                    this.closeModal();

                    if (ctrlDown) {
                        this.setVarp('temp_run', 1);
                    } else {
                        this.setVarp('temp_run', 0);
                    }
                } else {
                    this.clearWalkingQueue();
                }
            } else if (opcode === ClientProt.CLIENT_CHEAT) {
                this.onCheat(data.gjstr());
            } else if (opcode == ClientProt.CLOSE_MODAL) {
                this.closeModal(false);
            } else if (opcode == ClientProt.IF_DESIGN) {
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

                this.generateAppearance();
            } else if (opcode == ClientProt.OPHELD1 || opcode == ClientProt.OPHELD2 || opcode == ClientProt.OPHELD3 || opcode == ClientProt.OPHELD4 || opcode == ClientProt.OPHELD5) {
                this.lastVerifyObj = data.g2();
                this.lastVerifySlot = data.g2();
                this.lastVerifyCom = data.g2();

                let atSlot = this.invGetSlot('inv', this.lastVerifySlot);
                if (!atSlot || atSlot.id != this.lastVerifyObj) {
                    return;
                }

                // TODO: verify com visibility

                let trigger = 'opheld';
                if (opcode == ClientProt.OPHELD1) {
                    trigger += '1';
                } else if (opcode == ClientProt.OPHELD2) {
                    trigger += '2';
                } else if (opcode == ClientProt.OPHELD3) {
                    trigger += '3';
                } else if (opcode == ClientProt.OPHELD4) {
                    trigger += '4';
                } else if (opcode == ClientProt.OPHELD5) {
                    trigger += '5';
                }

                let objType = ObjType.get(this.lastVerifyObj);
                let script = ScriptProvider.getByName(`[${trigger},${objType.config}]`);
                if (script) {
                    let state = ScriptRunner.init(script, this, null, null, objType);
                    this.executeInterface(state);
                }
            } else if (opcode === ClientProt.OPNPC1 || opcode === ClientProt.OPNPC2 || opcode === ClientProt.OPNPC3 || opcode === ClientProt.OPNPC4 || opcode === ClientProt.OPNPC5) {
                let nid = data.g2();

                this.setInteraction(ClientProtNames[opcode].toLowerCase(), { nid });
            } else if (opcode == ClientProt.RESUME_P_COUNTDIALOG) {
                let count = data.g4();

                this.lastInt = count;
                this.resumeInterface();
            } else if (opcode == ClientProt.MESSAGE_PUBLIC) {
                this.messageColor = data.g1();
                this.messageEffect = data.g1();
                this.messageType = 0;
                this.message = data.gdata();
                this.mask |= Player.CHAT;
            } else if (opcode === ClientProt.IF_BUTTON) {
                let com = data.g2();

                let script = ScriptProvider.getByName(`[if_button,${IfType.get(com).config}]`);
                if (script) {
                    let state = ScriptRunner.init(script, this);
                    this.executeInterface(state);
                } else {
                    this.messageGame('Nothing interesting happens.');
                }
            }
        }

        this.client.reset();
    }

    encodeOut() {
        for (let j = 0; j < this.netOut.length; j++) {
            let out = this.netOut[j];

            if (this.client.encryptor) {
                out.data[0] = (out.data[0] + this.client.encryptor.nextInt()) & 0xFF;
            }

            this.client.write(out);
        }

        this.netOut = [];
        this.client.flush();
    }

    // ----

    onLogin() {
        this.messageGame('Welcome to RuneScape.');
        this.updateUid192(this.pid);

        // normalize client between logins
        this.resetClientVarCache();
        this.camReset();
        this.ifCloseSub();
        this.clearWalkingQueue();

        for (let i = 0; i < this.varps.length; i++) {
            let type = VarpType.get(i);
            let varp = this.varps[i];
            if (varp === 0) {
                continue;
            }

            if ((type.transmit === 'always' || type.transmit === 'once') && scope === 'perm') {
                if (varp < 256) {
                    this.varpSmall(i, varp);
                } else {
                    this.varpLarge(i, varp);
                }
            }
        }

        // TODO: do this automatically when invenory and wornitems get opened
        this.invListenOnCom('inv', 'inventory:inv');
        this.invListenOnCom('worn', 'wornitems:wear');

        for (let i = 0; i < this.stats.length; i++) {
            this.updateStat(i, this.stats[i], this.levels[i]);
        }

        this.updateRunEnergy(this.runenergy);
        this.updateRunWeight(this.runweight);

        // TODO: do we want this in runescript instead? (some tabs need text populated too)
        this.ifSetTab('attack_unarmed', 0); // this needs to select based on weapon style equipped
        this.ifSetTab('skills', 1);
        this.ifSetTab('quest_journal', 2); // quest states are not displayed via varp, have to update colors manually
        this.ifSetTab('inventory', 3);
        this.ifSetTab('wornitems', 4); // contains equip bonuses to update
        this.ifSetTab('prayer', 5);
        this.ifSetTab('magic', 6);
        this.ifSetTab('friends', 8);
        this.ifSetTab('ignore', 9);
        this.ifSetTab('logout', 10);
        this.ifSetTab('player_controls', 12);

        if (this.lowMemory) {
            this.ifSetTab('game_options_ld', 11);
            this.ifSetTab('musicplayer_ld', 13);
        } else {
            this.ifSetTab('game_options', 11);
            this.ifSetTab('musicplayer', 13);
        }
    }

    onCheat(cheat) {
        let args = cheat.toLowerCase().split(' ');
        let cmd = args.shift();

        switch (cmd) {
            case 'clearinv': {
                if (args.length > 0) {
                    let inv = args.shift();
                    this.invClear(inv);
                } else {
                    this.invClear('inv');
                }
            } break;
            case 'giveitem': {
                if (args.length < 1) {
                    this.messageGame('Usage: ::giveitem <obj> (count) (inv)');
                    return;
                }

                let obj = args.shift();
                let count = args.shift() || 1;
                let inv = args.shift() || 'inv';

                this.invAdd(inv, obj, count);

                let objType = ObjType.getByName(obj);
                this.messageGame(`Added ${objType.name} x ${count}`);
            } break;
            case 'setvar': {
                if (args.length < 2) {
                    this.messageGame('Usage: ::setvar <var> <value>');
                    return;
                }

                let varp = args.shift();
                let value = args.shift();

                let varpType = VarpType.getByName(varp);
                if (varpType) {
                    this.setVarp(varp, value);
                    this.messageGame(`Setting var ${varp} to ${value}`);
                } else {
                    this.messageGame(`Unknown var ${varp}`);
                }
            } break;
            case 'anim': {
                this.playAnimation(422, 0);
            } break;
        }
    }

    // ----

    updateMovementStep() {
        let dst = this.walkQueue[this.walkStep];
        let dir = Position.face(this.x, this.z, dst.x, dst.z);

        this.x = Position.moveX(this.x, dir);
        this.z = Position.moveZ(this.z, dir);

        if (dir == -1) {
            this.walkStep--;

            if (this.walkStep < this.walkQueue.length - 1 && this.walkStep != -1) {
                dir = this.updateMovementStep();
            }
        }

        return dir;
    }

    updateMovement() {
        if (this.modalOpen) {
            this.walkDir = -1;
            this.runDir = -1;
            return;
        }

        if (!this.placement && this.walkStep != -1 && this.walkStep < this.walkQueue.length) {
            this.walkDir = this.updateMovementStep();

            if ((this.getVarp('player_run') || this.getVarp('temp_run')) && this.walkStep != -1 && this.walkStep < this.walkQueue.length) {
                this.runDir = this.updateMovementStep();

                // run energy depletion
                let weightKg = Math.floor(this.runweight / 1000);
                let clampWeight = Math.min(Math.max(weightKg, 0), 64);
                let loss = 67 + ((67 * clampWeight) / 64);

                this.runenergy -= loss;
                this.updateRunEnergy(this.runenergy);
            } else {
                this.runDir = -1;
            }

            if (this.runDir != -1) {
                this.orientation = this.runDir;
            } else if (this.walkDir != -1) {
                this.orientation = this.walkDir;
            }
        } else {
            this.walkDir = -1;
            this.runDir = -1;
            this.walkQueue = [];
            this.setVarp('temp_run', 0);
        }
    }

    // ----

    setInteraction(trigger, subject) {
        if (this.delayed()) {
            return;
        }

        let ap = false;
        let script = null;
        let target = null;
        let type = null;

        if (typeof subject.nid !== 'undefined') {
            target = World.getNpc(subject.nid);
            type = NpcType.get(target.type);
        }

        if (target) {
            // priority: ap,subject -> ap,_category -> op,subject -> op,_category -> ap,_ -> op,_ (less and less specific)
            let operable = this.inOperableDistance(target);

            // ap,subject
            if (!operable) {
                script = ScriptProvider.getByName(`[${trigger.replace('op', 'ap')},${type.config}]`);

                // ap,_category
                if (!script && target.category) {
                    script = ScriptProvider.getByName(`[${trigger.replace('op', 'ap')},_${target.category}]`);
                }

                if (script) {
                    ap = true;
                }
            }

            // op,subject
            if (!script) {
                script = ScriptProvider.getByName(`[${trigger},${type.config}]`);
            }

            // op,_category
            if (!script && target.category) {
                script = ScriptProvider.getByName(`[${trigger},_${target.category}]`);
            }

            // ap,_ & op,_
            if (!script) {
                if (!operable) {
                    script = ScriptProvider.getByName(`[${trigger.replace('op', 'ap')},_]`);

                    if (script) {
                        ap = true;
                    }
                } else {
                    script = ScriptProvider.getByName(`[${trigger},_]`);
                }
            }
        }

        this.target = target;

        if (!script) {
            return;
        }

        if (ap) {
            this.apScript = ScriptRunner.init(script, this, target);
        } else {
            this.opScript = ScriptRunner.init(script, this, target);
        }

        this.persistent = false;
        this.closeModal();
    }

    resetInteraction() {
        this.apScript = null;
        this.opScript = null;
        this.currentApRange = 10;
        this.apRangeCalled = false;
        this.target = null;
        this.persistent = false;

        if (this.faceEntity != -1) {
            this.mask |= Player.FACE_ENTITY;
            this.faceEntity = -1;
        }
    }

    closeModal(flush = true) {
        this.modalOpen = false;
        this.interfaceScript = null;

        if (flush) {
            this.ifCloseSub();
        }
    }

    delayed() {
        return this.delay > 0;
    }

    containsModalInterface() {
        return this.modalOpen;
    }

    // check if the player is in melee distance and has line of walk
    inOperableDistance(target) {
        let dx = Math.abs(this.x - target.x);
        let dz = Math.abs(this.z - target.z);

        // TODO: line of walk check
        if (dx > 1 || dz > 1) {
            // out of range
            return false;
        } else if (dx == 1 && dz == 1) {
            // diagonal
            return false;
        } else if (dx == 0 && dz == 0) {
            // same tile
            return true;
        } else if (dx == 1 && dz == 0) {
            // west/east
            return true;
        } else if (dx == 0 && dz == 1) {
            // north/south
            return true;
        }

        return false;
    }

    // check if the player is in range of the target and has line of sight
    inApproachDistance(target) {
        // TODO: line of sight check
        return Position.distanceTo(this, target) <= this.currentApRange;
    }

    hasSteps() {
        return this.walkQueue.length > 0;
    }

    enqueueScript(script, type = 'normal', delay = 0, args = []) {
        let state = ScriptRunner.init(script, this, null, null, args);
        state.type = type;
        state.clock = World.currentTick + delay;

        if (type === 'weak') {
            this.weakQueue.push(state);
        } else {
            this.queue.push(state);
        }
    }

    processQueue() {
        let processedQueueCount = 0;

        // execute and remove scripts from the queue
        this.queue = this.queue.filter(s => {
            if (s.type == 'strong') {
                // strong scripts always close the modal
                this.closeModal();
            }

            if (!this.delayed() && !this.containsModalInterface() && !s.future()) {
                let state = ScriptRunner.execute(s);
                let finished = state == ScriptState.ABORTED || state == ScriptState.FINISHED;
                processedQueueCount++;
                return !finished; // only keep if finished
            } else if (!s.future()) {
                // guess we're done here!
                return false;
            }

            // keep it to try again later
            return true;
        });

        return processedQueueCount;
    }

    processWeakQueue() {
        let processedQueueCount = 0;

        // execute and remove scripts from the queue
        this.weakQueue = this.weakQueue.filter(s => {
            if (!this.delayed() && !this.containsModalInterface() && !s.future()) {
                let state = ScriptRunner.execute(s);
                let finished = state == ScriptState.ABORTED || state == ScriptState.FINISHED;
                processedQueueCount++;
                return !finished;
            } else if (!s.future()) {
                return false;
            }

            return true;
        });

        return processedQueueCount;
    }

    processInteractions() {
        if (!this.target) {
            this.updateMovement();
            return;
        }

        let interacted = false;
        this.apRangeCalled = false;

        if (!this.delayed() && !this.containsModalInterface()) {
            if (this.opScript != null && this.inOperableDistance(this.target) && (this.target instanceof Player || this.target instanceof Npc)) {
                ScriptRunner.execute(this.opScript, true);
                interacted = true;
            } else if (this.apScript != null && this.inApproachDistance(this.target)) {
                ScriptRunner.execute(this.apScript, true);
                interacted = true;
            } else if (this.inApproachDistance(this.target)) {
                // no-op
            } else if (this.inOperableDistance(this.target)) {
                this.messageGame('Nothing interesting happens.');
                interacted = true;
            }
        }

        this.updateMovement();

        let moved = this.walkDir != -1;
        if (moved) {
            this.clocks.lastMovement = World.currentTick + 1;
        }

        // re-check interactions after movement (ap can turn into op)
        if (!this.delayed() && !this.containsModalInterface()) {
            if (!interacted || this.apRangeCalled) {
                if (this.opScript != null && this.inOperableDistance(this.target) && ((this.target instanceof Player || this.target instanceof Npc) || !moved)) {
                    ScriptRunner.execute(this.opScript, true);
                    interacted = true;
                } else if (this.apScript != null && this.inApproachDistance(this.target)) {
                    this.apRangeCalled = false;
                    ScriptRunner.execute(this.apScript, true);
                    interacted = true;
                } else if (this.inApproachDistance(this.target)) {
                    this.messageGame('Nothing interesting happens.');
                    interacted = true;
                } else if (this.inOperableDistance(this.target) && !moved) {
                    this.messageGame('Nothing interesting happens.');
                    interacted = true;
                }
            }
        }

        if (!this.delayed() && !this.containsModalInterface()) {
            if (!interacted && !moved && !this.hasSteps()) {
                this.messageGame("I can't reach that!");
                this.resetInteraction();
            }

            if (interacted && !this.apRangeCalled && !this.persistent) {
                this.resetInteraction();
            }
        }
    }

    // ----

    updateBuildArea() {
        let dx = Math.abs(this.x - this.loadedX);
        let dz = Math.abs(this.z - this.loadedZ);

        if (dx >= 36 || dz >= 36) {
            this.loadArea(Position.zone(this.x), Position.zone(this.z));

            this.loadedX = this.x;
            this.loadedZ = this.z;
        }

        // TODO: zone updates in build area
    }

    // ----

    isWithinDistance(other) {
        let dx = Math.abs(this.x - other.x);
        let dz = Math.abs(this.z - other.z);

        return dz < 16 && dx < 16 && this.level == other.level;
    }

    getNearbyPlayers() {
        // TODO: limit searching to build area zones
        let players = [];

        for (let i = 0; i < World.players.length; i++) {
            if (World.players[i] == null || World.players[i].pid === this.pid) {
                continue;
            }

            let player = World.players[i];
            if (this.isWithinDistance(player)) {
                players.push(player);
            }
        }

        return players;
    }

    updatePlayers() {
        let out = new Packet();
        out.bits();

        out.pBit(1, (this.placement || this.mask > 0 || this.walkDir != -1) ? 1 : 0);
        if (this.placement) {
            out.pBit(2, 3);
            out.pBit(2, this.level);
            out.pBit(7, Position.local(this.x));
            out.pBit(7, Position.local(this.z));
            out.pBit(1, 1);
            out.pBit(1, this.mask ? 1 : 0);
        } else if (this.runDir != -1) {
            out.pBit(2, 2);
            out.pBit(3, this.walkDir);
            out.pBit(3, this.runDir);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.walkDir != -1) {
            out.pBit(2, 1);
            out.pBit(3, this.walkDir);
            out.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.mask > 0) {
            out.pBit(2, 0);
        }

        let nearby = this.getNearbyPlayers();
        this.players = this.players.filter(x => x !== null);

        let newPlayers = nearby.filter(x => this.players.findIndex(y => y.pid === x.pid) === -1);
        let removedPlayers = this.players.filter(x => nearby.findIndex(y => y.pid === x.pid) === -1);
        this.players.filter(x => removedPlayers.findIndex(y => x.pid === y.pid) !== -1).map(x => {
            x.type = 1;
        });

        let updates = [];
        out.pBit(8, this.players.length);
        this.players = this.players.map(x => {
            if (x.type === 0) {
                if (x.player.mask > 0) {
                    updates.push(x.player);
                }

                out.pBit(1, (x.player.placement || x.player.mask || x.player.walkDir != -1) ? 1 : 0);

                if (x.player.placement) {
                    out.pBit(2, 3);
                    out.pBit(2, x.player.level);
                    out.pBit(7, Position.local(x.player.x));
                    out.pBit(7, Position.local(x.player.z));
                    out.pBit(1, 1);
                    out.pBit(1, x.player.mask ? 1 : 0);
                } if (x.player.runDir !== -1) {
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

                return x;
            } else if (x.type === 1) {
                // remove
                out.pBit(1, 1);
                out.pBit(2, 3);
                return null;
            }
        });

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
            out.pBit(1, 1); // clear walking queue
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
            let newlyObserved = newPlayers.find(x => x == p) != null;

            p.writeUpdate(out, false, newlyObserved);
        });

        this.playerInfo(out);
    }

    getAppearanceInSlot(slot) {
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
        let base = 0.25 * (this.baseLevel[Player.DEFENCE] + this.baseLevel[Player.HITPOINTS] + Math.floor(this.baseLevel[Player.PRAYER] / 2));
        let melee = 0.325 * (this.baseLevel[Player.ATTACK] + this.baseLevel[Player.STRENGTH]);
        let range = 0.325 * (Math.floor(this.baseLevel[Player.RANGED] / 2) + this.baseLevel[Player.RANGED]);
        let magic = 0.325 * (Math.floor(this.baseLevel[Player.MAGIC] / 2) + this.baseLevel[Player.MAGIC]);
        return Math.floor(base + Math.max(melee, range, magic));
    }

    generateAppearance() {
        let stream = new Packet();

        stream.p1(this.gender);
        stream.p1(this.headicons);

        let skippedSlots = [];

        let worn = this.getInv('worn');
        for (let i = 0; i < worn.capacity; i++) {
            let equip = this.invGetSlot('worn', i);
            if (!equip) {
                continue;
            }

            let config = ObjType.get(equip.id);

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

            let equip = worn.get(slot);
            if (!equip) {
                let appearanceValue = this.getAppearanceInSlot(slot);
                if (appearanceValue === 0) {
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

    writeUpdate(out, self = false, firstSeen = false) {
        let mask = this.mask;
        if (firstSeen) {
            mask |= Player.APPEARANCE;
        }
        if (firstSeen && (this.faceX != -1 || this.faceY != -1)) {
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
            out.p1(this.appearance.length);
            out.pdata(this.appearance);
        }

        if (mask & Player.ANIM) {
            out.p2(this.animId);
            out.p1(this.animDelay);
        }

        if (mask & Player.FACE_ENTITY) {
            out.p2(this.faceEntity);
        }

        if (mask & Player.FORCED_CHAT) {
            out.pjstr(this.forcedChat);
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
                let faceX = Position.moveX(this.x, this.orientation);
                let faceZ = Position.moveZ(this.z, this.orientation);
                out.p2(faceX * 2 + 1);
                out.p2(faceZ * 2 + 1);
            } else {
                out.p2(this.faceX);
                out.p2(this.faceZ);
            }
        }

        if (mask & Player.CHAT) {
            out.p1(this.messageColor);
            out.p1(this.messageEffect);
            out.p1(this.messageType);

            out.p1(this.message.length);
            out.pdata(this.message);
        }

        if (mask & Player.SPOTANIM) {
            out.p2(this.graphicId);
            out.p2(this.graphicHeight);
            out.p2(this.graphicDelay);
        }

        if (mask & Player.FORCED_MOVEMENT) {
            out.p1(this.forceStartX);
            out.p1(this.forceStartY);
            out.p1(this.forceDestX);
            out.p1(this.forceDestY);
            out.p2(this.forceMoveStart);
            out.p2(this.forceMoveEnd);
            out.p1(this.forceFaceDirection);
        }
    }

    // ----

    getNearbyNpcs() {
        // TODO: limit searching to build area zones
        let npcs = [];

        for (let i = 0; i < World.npcs.length; i++) {
            if (World.npcs[i] == null) {
                continue;
            }

            let npc = World.npcs[i];
            if (this.isWithinDistance(npc)) {
                npcs.push(npc);
            }
        }

        return npcs;
    }

    updateNpcs() {
        let nearby = this.getNearbyNpcs();
        this.npcs = this.npcs.filter(x => x !== null);

        let newNpcs = nearby.filter(x => this.npcs.findIndex(y => y.nid === x.nid) === -1);
        let removedNpcs = this.npcs.filter(x => nearby.findIndex(y => y.nid === x.nid) === -1);
        this.npcs.filter(x => removedNpcs.findIndex(y => x.nid === y.nid) !== -1).map(x => {
            x.type = 1;
        });

        let out = new Packet();
        out.bits();

        let updates = [];
        out.pBit(8, this.npcs.length);
        this.npcs = this.npcs.map(x => {
            if (x.type === 0) {
                if (x.npc.mask > 0) {
                    updates.push(x.npc);
                }

                out.pBit(1, x.npc.walkDir != -1 || x.npc.mask > 0);

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
            let newlyObserved = newNpcs.find(x => x == n) != null;

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

            if (mask & Npc.FORCED_CHAT) {
                out.pjstr(n.forcedChat);
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
                    let faceX = Position.moveX(n.x, n.orientation);
                    let faceZ = Position.moveZ(n.z, n.orientation);
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
        for (let i = 0; i < this.invs.length; i++) {
            let inv = this.invs[i];
            if (!inv || inv.com == -1 || !inv.update) {
                continue;
            }

            // TODO: implement partial updates
            this.updateInvFull(inv.com, inv);
            inv.update = false;
        }
    }

    // ----

    getInv(inv) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (inv === -1) {
            console.error(`Invalid invGetSlot call: ${inv} ${slot}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invGetSlot call: ${inv} ${slot}`);
            return;
        }

        return container;
    }

    invListenOnCom(inv, com) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        if (inv === -1 || com === -1) {
            console.error(`Invalid invListenOnCom call: ${inv}, ${com}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invListenOnCom call: ${inv}, ${com}`);
            return;
        }

        container.com = com;
        container.update = true;
    }

    invGetSlot(inv, slot) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (inv === -1) {
            console.error(`Invalid invGetSlot call: ${inv} ${slot}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invGetSlot call: ${inv} ${slot}`);
            return;
        }

        return container.get(slot);
    }

    invClear(inv) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (inv === -1) {
            console.error(`Invalid invClear call: ${inv}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invClear call: ${inv}`);
            return;
        }

        container.removeAll();

        if (container == this.getInv('worn')) {
            this.generateAppearance();
        }
    }

    invAdd(inv, obj, count) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (typeof obj === 'string') {
            obj = ObjType.getId(obj);
        }

        if (inv === -1 || obj === -1) {
            console.error(`Invalid invAdd call: ${inv}, ${obj}, ${count}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invAdd call: ${inv}, ${obj}, ${count}`);
            return;
        }

        // probably should error if transaction != count
        container.add(obj, count);

        if (container == this.getInv('worn')) {
            this.generateAppearance();
        }
    }

    invSet(inv, obj, count, slot) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (typeof obj === 'string') {
            obj = ObjType.getId(obj);
        }

        if (inv === -1 || obj === -1) {
            console.error(`Invalid invAdd call: ${inv}, ${obj}, ${count}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invAdd call: ${inv}, ${obj}, ${count}`);
            return;
        }

        container.set(slot, { id: obj, count });

        if (container == this.getInv('worn')) {
            this.generateAppearance();
        }
    }

    invDel(inv, obj, count) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (typeof obj === 'string') {
            obj = ObjType.getId(obj);
        }

        if (inv === -1 || obj === -1) {
            console.error(`Invalid invDel call: ${inv}, ${obj}, ${count}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invDel call: ${inv}, ${obj}, ${count}`);
            return;
        }

        // probably should error if transaction != count
        container.remove(obj, count);

        if (container == this.getInv('worn')) {
            this.generateAppearance();
        }
    }

    invDelSlot(inv, slot) {
        if (typeof inv === 'string') {
            inv = InvType.getId(inv);
        }

        if (inv === -1) {
            console.error(`Invalid invDel call: ${inv}, ${slot}`);
            return;
        }

        let container = this.invs.find(x => x.type === inv);
        if (!container) {
            console.error(`Invalid invDel call: ${inv}, ${slot}`);
            return;
        }

        container.delete(slot);

        if (container == this.getInv('worn')) {
            this.generateAppearance();
        }
    }

    getVarp(varp) {
        if (typeof varp === 'string') {
            varp = VarpType.getId(varp);
        }

        if (varp === -1) {
            console.error(`Invalid setVarp call: ${varp}, ${value}`);
            return -1;
        }

        return this.varps[varp];
    }

    setVarp(varp, value) {
        if (typeof varp === 'string') {
            varp = VarpType.getId(varp);
        }

        if (varp === -1) {
            console.error(`Invalid setVarp call: ${varp}, ${value}`);
            return;
        }

        let varpType = VarpType.get(varp);
        if (varpType.transmit !== 'always') {
            return;
        }

        this.varps[varp] = value;

        if (value < 256) {
            this.varpSmall(varp, value);
        } else {
            this.varpLarge(varp, value);
        }
    }

    giveXp(stat, xp) {
        let multi = Number(process.env.XP_MULTIPLIER) || 1;
        this.stats[stat] += xp * multi;

        // cap to 200m, this is represented as "2 billion" because we use 32-bit signed integers and divide by 10 to give us a decimal point
        if (this.stats[stat] > 2_000_000_000) {
            this.stats[stat] = 2_000_000_000;
        }

        // TODO: levelup trigger
        this.baseLevel[stat] = getLevelByExp(this.stats[stat]);
        // TODO: this.levels[stat]
        this.updateStat(stat, this.stats[stat], this.levels[stat]);

        if (this.getCombatLevel() != this.combatLevel) {
            this.combatLevel = this.getCombatLevel();
            this.generateAppearance();
        }
    }

    playAnimation(seq, delay) {
        this.animId = seq;
        this.animDelay = delay;
        this.mask |= Player.ANIM;
    }

    applyDamage(damage, type) {
        this.damageTaken = damage;
        this.damageType = type;

        this.levels[3] -= damage;
        if (this.levels[3] < 0) {
            this.levels[3] = 0;
        }

        this.mask |= Player.DAMAGE;
    }

    // ----

    executeInterface(script) {
        if (!script) {
            this.messageGame('Nothing interesting happens.');
            return;
        }

        let state = ScriptRunner.execute(script);
        if (state === ScriptState.SUSPENDED) {
            this.interfaceScript = script;
        } else {
            this.interfaceScript = null;
        }
    }

    // ---- raw server protocol ----

    ifSetColour(int1, int2) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETCOLOUR);

        out.p2(int1);
        out.p2(int2);

        this.netOut.push(out);
    }

    ifOpenBottom(int1) {
        let out = new Packet();
        out.p1(ServerProt.IF_OPENBOTTOM);

        out.p2(int1);

        this.netOut.push(out);
    }

    ifOpenSub(int1, int2) {
        let out = new Packet();
        out.p1(ServerProt.IF_OPENSUB);

        out.p2(int1);
        out.p2(int2);

        this.netOut.push(out);
    }

    ifSetHide(int1, bool1) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETHIDE);

        out.p1(int1);
        out.pbool(bool1);

        this.netOut.push(out);
    }

    ifSetObject(int1, int2, int3) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETOBJECT);

        out.p2(int1);
        out.p2(int2);
        out.p2(int3);

        this.netOut.push(out);
    }

    ifSetTabActive(tab) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETTAB_ACTIVE);

        out.p1(tab);

        this.netOut.push(out);
    }

    ifSetModel(int1, int2) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETMODEL);

        out.p2(int1);
        out.p2(int2);

        this.netOut.push(out);
    }

    ifSetModelColour(int1, int2, int3) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETMODEL_COLOUR);

        out.p2(int1);
        out.p2(int2);
        out.p2(int3);

        this.netOut.push(out);
    }

    ifSetTabFlash(tab) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETTAB_FLASH);

        out.p1(tab);

        this.netOut.push(out);
    }

    ifCloseSub() {
        let out = new Packet();
        out.p1(ServerProt.IF_CLOSESUB);

        this.netOut.push(out);
    }

    ifSetAnim(int1, int2) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETANIM);

        out.p2(int1);
        out.p2(int2);

        this.netOut.push(out);
    }

    ifSetTab(com, tab) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        let out = new Packet();
        out.p1(ServerProt.IF_SETTAB);

        out.p2(com);
        out.p1(tab);

        this.netOut.push(out);
    }

    ifOpenTop(int1) {
        let out = new Packet();
        out.p1(ServerProt.IF_OPENTOP);

        out.p2(int1);

        this.netOut.push(out);
    }

    ifOpenSticky(int1) {
        let out = new Packet();
        out.p1(ServerProt.IF_OPENSTICKY);

        out.p2(int1);

        this.netOut.push(out);
    }

    ifOpenSidebar(int1) {
        let out = new Packet();
        out.p1(ServerProt.IF_OPENSIDEBAR);

        out.p2(int1);

        this.netOut.push(out);
    }

    ifSetPlayerHead(int1) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETPLAYERHEAD);

        out.p2(int1);

        this.netOut.push(out);
    }

    ifSetText(int1, string1) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETTEXT);

        out.p2(int1);
        out.pjstr(string1);

        this.netOut.push(out);
    }

    ifSetNpcHead(int1, int2) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETNPCHEAD);

        out.p2(int1);
        out.p2(int2);

        this.netOut.push(out);
    }

    ifSetPosition(int1, int2, int3) {
        let out = new Packet();
        out.p1(ServerProt.IF_SETPOSITION);

        out.p2(int1);
        out.p2(int2);
        out.p2(int3);

        this.netOut.push(out);
    }

    ifIAmount() {
        let out = new Packet();
        out.p1(ServerProt.IF_IAMOUNT);

        this.netOut.push(out);
    }

    ifMultiZone(bool1) {
        let out = new Packet();
        out.p1(ServerProt.IF_MULTIZONE);

        out.pbool(bool1);

        this.netOut.push(out);
    }

    updateInvClear(com) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        let out = new Packet();
        out.p1(ServerProt.UPDATE_INV_CLEAR);

        out.p2(com);

        this.netOut.push(out);
    }

    updateInvFull(com, inv) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        let out = new Packet();
        out.p1(ServerProt.UPDATE_INV_FULL);
        out.p2(0);
        let start = out.pos;

        out.p2(com);
        out.p1(inv.capacity);
        for (let slot = 0; slot < inv.capacity; slot++) {
            let obj = inv.get(slot);

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

    updateInvPartial(com, inv, slots = []) {
        if (typeof com === 'string') {
            com = IfType.getId(com);
        }

        let out = new Packet();
        out.p1(ServerProt.UPDATE_INV_PARTIAL);
        out.p2(0);
        let start = out.pos;

        out.p2(com);
        for (let i = 0; i < slots.length; i++) {
            let slot = slots[i];
            let obj = inv.get(slot);
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

    camForceAngle(int1, int2, int3, int4, int5) {
        let out = new Packet();
        out.p1(ServerProt.CAM_FORCEANGLE);

        out.p1(int1);
        out.p1(int2);
        out.p2(int3);
        out.p1(int4);
        out.p1(int5);

        this.netOut.push(out);
    }

    camShake(int1, int2, int3, int4) {
        let out = new Packet();
        out.p1(ServerProt.CAM_SHAKE);

        out.p1(int1);
        out.p1(int2);
        out.p1(int3);
        out.p1(int4);

        this.netOut.push(out);
    }

    camMoveTo(int1, int2, int3, int4, int5) {
        let out = new Packet();
        out.p1(ServerProt.CAM_MOVETO);

        out.p1(int1);
        out.p1(int2);
        out.p2(int3);
        out.p1(int4);
        out.p1(int5);

        this.netOut.push(out);
    }

    camReset() {
        let out = new Packet();
        out.p1(ServerProt.CAM_RESET);

        this.netOut.push(out);
    }

    npcInfo(data) {
        let out = new Packet();
        out.p1(ServerProt.NPC_INFO);
        out.p2(0);
        let start = out.pos;

        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    playerInfo(data) {
        let out = new Packet();
        out.p1(ServerProt.PLAYER_INFO);
        out.p2(0);
        let start = out.pos;

        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    clearWalkingQueue() {
        let out = new Packet();
        out.p1(ServerProt.CLEAR_WALKING_QUEUE);

        this.netOut.push(out);
    }

    updateRunWeight(kg) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_RUNWEIGHT);

        out.p2(kg);

        this.netOut.push(out);
    }

    // pseudo-packet
    hintNpc(nid) {
        let out = new Packet();
        out.p1(ServerProt.HINT_ARROW);
        out.p1(0);
        let start = out.pos;

        out.p1(1);
        out.p2(nid);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    // pseudo-packet
    hintTile(x, z, height) {
        let out = new Packet();
        out.p1(ServerProt.HINT_ARROW);
        out.p1(0);
        let start = out.pos;

        // TODO: how to best represent which type to pick
        // 2 - 64, 64 offset
        // 3 - 0, 64 offset
        // 4 - 128, 64 offset
        // 5 - 64, 0 offset
        // 6 - 64, 128 offset

        out.p1(2);
        out.p2(x);
        out.p2(z);
        out.p1(height);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    // pseudo-packet
    hintPlayer(pid) {
        let out = new Packet();
        out.p1(ServerProt.HINT_ARROW);
        out.p1(0);
        let start = out.pos;

        out.p1(pid);
        out.p2(pid);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    updateRebootTimer(ticks) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_REBOOT_TIMER);

        out.p2(ticks);

        this.netOut.push(out);
    }

    updateStat(stat, xp, tempLevel) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_STAT);

        out.p1(stat);
        out.p4(xp / 10);
        out.p1(tempLevel);

        this.netOut.push(out);
    }

    updateRunEnergy(energy) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_RUNENERGY);

        out.p1(Math.floor(energy / 100));

        this.netOut.push(out);
    }

    finishTracking() {
        let out = new Packet();
        out.p1(ServerProt.FINISH_TRACKING);

        this.netOut.push(out);
    }

    resetAnims() {
        let out = new Packet();
        out.p1(ServerProt.RESET_ANIMS);

        this.netOut.push(out);
    }

    updateUid192(pid) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_UID192);

        out.p2(pid);

        this.netOut.push(out);
    }

    lastLoginInfo(pid) {
        let out = new Packet();
        out.p1(ServerProt.LAST_LOGIN_INFO);

        out.p2(pid);

        this.netOut.push(out);
    }

    logout() {
        let out = new Packet();
        out.p1(ServerProt.LOGOUT);

        this.netOut.push(out);
    }

    enableTracking() {
        let out = new Packet();
        out.p1(ServerProt.ENABLE_TRACKING);

        this.netOut.push(out);
    }

    messageGame(str1) {
        let out = new Packet();
        out.p1(ServerProt.MESSAGE_GAME);
        out.p1(0);
        let start = out.pos;

        out.pjstr(str1);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    updateIgnoreList(name37s) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_IGNORELIST);

        for (let i = 0; i < name37s.length; i++) {
            out.p8(name37s[i]);
        }

        this.netOut.push(out);
    }

    chatFilterSettings(int1, int2, int3) {
        let out = new Packet();
        out.p1(ServerProt.CHAT_FILTER_SETTINGS);

        out.p1(int1);
        out.p1(int2);
        out.p1(int3);

        this.netOut.push(out);
    }

    messagePrivate(from37, messageId, fromRights, message) {
        let out = new Packet();
        out.p1(ServerProt.MESSAGE_PRIVATE);
        out.p1(0);
        let start = out.pos;

        out.p8(from37);
        out.p4(messageId);
        out.p1(fromRights);
        out.pdata(message);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    updateFriendList(username37, worldNode) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_FRIENDLIST);

        out.p8(username37);
        out.p1(worldNode);

        this.netOut.push(out);
    }

    dataLocDone(x, z) {
        let out = new Packet();
        out.p1(ServerProt.DATA_LOC_DONE);

        out.p1(x);
        out.p1(z);

        this.netOut.push(out);
    }

    dataLandDone(x, z) {
        let out = new Packet();
        out.p1(ServerProt.DATA_LAND_DONE);

        out.p1(x);
        out.p1(z);

        this.netOut.push(out);
    }

    dataLand(x, z, data, off, length) {
        let out = new Packet();
        out.p1(ServerProt.DATA_LAND);
        out.p2(0);
        let start = out.pos;

        out.p1(x);
        out.p1(z);
        out.p2(off);
        out.p2(length);
        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    dataLoc(x, z, data, off, length) {
        let out = new Packet();
        out.p1(ServerProt.DATA_LOC);
        out.p2(0);
        let start = out.pos;

        out.p1(x);
        out.p1(z);
        out.p2(off);
        out.p2(length);
        out.pdata(data);

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    loadArea(zoneX, zoneZ) {
        let dx = Math.abs(this.x - this.loadedX);
        let dz = Math.abs(this.z - this.loadedZ);
        if (dx < 36 && dz < 36) {
            return;
        }

        let out = new Packet();
        out.p1(ServerProt.LOAD_AREA);
        out.p2(0);
        let start = out.pos;

        out.p2(zoneX);
        out.p2(zoneZ);

        // build area is 13x13 zones (8*13 = 104 tiles), so we need to load 6 zones in each direction
        let areas = [];
        for (let x = zoneX - 6; x <= zoneX + 6; x++) {
            for (let z = zoneZ - 6; z <= zoneZ + 6; z++) {
                let mapsquareX = Position.mapsquare(x << 3);
                let mapsquareZ = Position.mapsquare(z << 3);

                let landExists = fs.existsSync(`data/pack/client/maps/m${mapsquareX}_${mapsquareZ}`);
                let locExists = fs.existsSync(`data/pack/client/maps/l${mapsquareX}_${mapsquareZ}`);

                if ((landExists || locExists) && areas.findIndex(a => a.mapsquareX === mapsquareX && a.mapsquareZ === mapsquareZ) === -1) {
                    areas.push({ mapsquareX, mapsquareZ, landExists, locExists });
                }
            }
        }

        for (let i = 0; i < areas.length; i++) {
            const { mapsquareX, mapsquareZ, landExists, locExists } = areas[i];

            out.p1(mapsquareX);
            out.p1(mapsquareZ);
            out.p4(landExists ? Packet.crc32(Packet.load(`data/pack/client/maps/m${mapsquareX}_${mapsquareZ}`)) : 0);
            out.p4(locExists ? Packet.crc32(Packet.load(`data/pack/client/maps/l${mapsquareX}_${mapsquareZ}`)) : 0);
        }

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    varpSmall(varp, value) {
        let out = new Packet();
        out.p1(ServerProt.VARP_SMALL);

        out.p2(varp);
        out.p1(value);

        this.netOut.push(out);
    }

    varpLarge(varp, value) {
        let out = new Packet();
        out.p1(ServerProt.VARP_LARGE);

        out.p2(varp);
        out.p4(value);

        this.netOut.push(out);
    }

    resetClientVarCache() {
        let out = new Packet();
        out.p1(ServerProt.RESET_CLIENT_VARCACHE);

        this.netOut.push(out);
    }

    synthSound(id, loops, delay) {
        let out = new Packet();
        out.p1(ServerProt.SYNTH_SOUND);

        out.p2(id);
        out.p1(loops);
        out.p2(delay);

        this.netOut.push(out);
    }

    midiSong(name, crc, length) {
        let out = new Packet();
        out.p1(ServerProt.MIDI_SONG);
        out.p1(0);
        let start = out.pos;

        out.pjstr(name);
        out.p4(crc);
        out.p4(length);

        out.psize1(out.pos - start);
        this.netOut.push(out);
    }

    midiJingle() {
        let out = new Packet();
        out.p1(ServerProt.MIDI_JINGLE);
        out.p2(0);
        let start = out.pos;

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    updateZonePartialFollows(baseX, baseZ) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS);

        out.p1(baseX);
        out.p1(baseZ);

        this.netOut.push(out);
    }

    updateZoneFullFollows(baseX, baseZ) {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_ZONE_FULL_FOLLOWS);

        out.p1(baseX);
        out.p1(baseZ);

        this.netOut.push(out);
    }

    updateZonePartialEnclosed() {
        let out = new Packet();
        out.p1(ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED);
        out.p2(0);
        let start = out.pos;

        out.psize2(out.pos - start);
        this.netOut.push(out);
    }

    locAddChange() {
        let out = new Packet();
        out.p1(ServerProt.LOC_ADD_CHANGE);

        this.netOut.push(out);
    }

    locAnim() {
        let out = new Packet();
        out.p1(ServerProt.LOC_ANIM);

        this.netOut.push(out);
    }

    objDel() {
        let out = new Packet();
        out.p1(ServerProt.OBJ_DEL);

        this.netOut.push(out);
    }

    objReveal() {
        let out = new Packet();
        out.p1(ServerProt.OBJ_REVEAL);

        this.netOut.push(out);
    }

    locAdd() {
        let out = new Packet();
        out.p1(ServerProt.LOC_ADD);

        this.netOut.push(out);
    }

    mapProjAnim() {
        let out = new Packet();
        out.p1(ServerProt.MAP_PROJANIM);

        this.netOut.push(out);
    }

    locDel() {
        let out = new Packet();
        out.p1(ServerProt.LOC_DEL);

        this.netOut.push(out);
    }

    objCount() {
        let out = new Packet();
        out.p1(ServerProt.OBJ_COUNT);

        this.netOut.push(out);
    }

    mapAnim() {
        let out = new Packet();
        out.p1(ServerProt.MAP_ANIM);

        this.netOut.push(out);
    }

    objAdd() {
        let out = new Packet();
        out.p1(ServerProt.OBJ_ADD);

        this.netOut.push(out);
    }
}
