import 'dotenv/config';
import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import CategoryType from '#lostcity/cache/CategoryType.js';
import Component from '#lostcity/cache/Component.js';
import InvType from '#lostcity/cache/InvType.js';
import LocType from '#lostcity/cache/LocType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';

import Loc from '#lostcity/entity/Loc.js';
import Obj from '#lostcity/entity/Obj.js';
import { Position } from '#lostcity/entity/Position.js';

import ClientProt from '#lostcity/server/ClientProt.js';
import ServerProt from '#lostcity/server/ServerProt.js';

import World from '#lostcity/engine/World.js';

import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import IdkType from '#lostcity/cache/IdkType.js';

import Environment from '#lostcity/util/Environment.js';
import WordEnc from '#lostcity/cache/WordEnc.js';
import WordPack from '#jagex2/wordenc/WordPack.js';

import {findPath} from '@2004scape/rsmod-pathfinder';
import Player from '#lostcity/entity/Player.js';
import { PRELOADED } from '#lostcity/entity/PreloadedPacks.js';
import ClientSocket from '#lostcity/server/ClientSocket.js';

export class NetworkPlayer extends Player {
    client: ClientSocket | null = null;

    constructor(username: string, username37: bigint, client: ClientSocket) {
        super(username, username37);

        this.client = client;
        this.client.player = this;
    }

    decodeIn() {
        // this.lastResponse = World.currentTick; // use to keep headless players in the world
        if (this.client === null || this.client.inOffset < 1) {
            return;
        }

        let offset = 0;
        this.lastResponse = World.currentTick;

        let pathfindRequest = false;
        let pathfindX = 0;
        let pathfindZ = 0;

        while (this.client.inOffset > offset) {
            const packetType = ClientProt.byId[this.client.in[offset++]];
            let length = packetType.length;
            if (length == -1) {
                length = this.client.in[offset++];
            } else if (length == -2) {
                length = (this.client.in[offset++] << 8) | this.client.in[offset++];
            }
            const data = new Packet(this.client.in.slice(offset, offset + length));
            offset += length;

            if (packetType === ClientProt.REBUILD_GETMAPS) {
                const requested = [];

                for (let i = 0; i < data.data.length / 3; i++) {
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
            } else if (packetType === ClientProt.MOVE_GAMECLICK || packetType === ClientProt.MOVE_MINIMAPCLICK) {
                const running = data.g1();
                const startX = data.g2();
                const startZ = data.g2();
                const offset = packetType === ClientProt.MOVE_MINIMAPCLICK ? 14 : 0;
                const checkpoints = (data.available - offset) >> 1;

                pathfindX = startX;
                pathfindZ = startZ;
                if (checkpoints != 0) {
                    // Just grab the last one we need skip the rest.
                    data.pos += (checkpoints - 1) << 1;
                    pathfindX = data.g1b() + startX;
                    pathfindZ = data.g1b() + startZ;
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
                    this.setVar(VarPlayerType.getId('temp_run'), 0);
                } else {
                    this.setVar(VarPlayerType.getId('temp_run'), running);
                }
                pathfindRequest = true;
            } else if (packetType === ClientProt.MOVE_OPCLICK) {
                const running = data.g1();

                if (running < 0 || running > 1) {
                    continue;
                }

                if (this.runenergy < 100) {
                    this.setVar(VarPlayerType.getId('temp_run'), 0);
                } else {
                    this.setVar(VarPlayerType.getId('temp_run'), running);
                }
            } else if (packetType === ClientProt.CLIENT_CHEAT) {
                const cheat = data.gjstr();

                if (cheat.length > 80) {
                    continue;
                }

                this.onCheat(cheat);
            } else if (packetType === ClientProt.MESSAGE_PUBLIC) {
                const colour = data.g1();
                const effect = data.g1();
                const message = WordPack.unpack(data, data.data.length - 2);

                if (colour < 0 || colour > 11 || effect < 0 || effect > 2 || message.length > 100) {
                    continue;
                }

                this.messageColor = colour;
                this.messageEffect = effect;
                this.messageType = 0;

                const out = Packet.alloc(0);
                WordPack.pack(out, WordEnc.filter(message));
                this.message = new Uint8Array(out.pos);
                out.pos = 0;
                out.gdata(this.message, 0, this.message.length);
                out.release();
                this.mask |= Player.CHAT;

                World.socialPublicMessage(this.username37, message);
            } else if (packetType === ClientProt.IF_PLAYERDESIGN) {
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
            } else if (packetType === ClientProt.TUTORIAL_CLICKSIDE) {
                const tab = data.g1();

                if (tab < 0 || tab > 13) {
                    continue;
                }

                const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.TUTORIAL_CLICKSIDE, -1, -1);
                if (script) {
                    this.executeScript(ScriptRunner.init(script, this), true);
                }
            } else if (packetType === ClientProt.CLOSE_MODAL) {
                this.closeModal();
            } else if (packetType === ClientProt.RESUME_PAUSEBUTTON) {
                if (!this.activeScript || this.activeScript.execution !== ScriptState.PAUSEBUTTON) {
                    continue;
                }

                this.executeScript(this.activeScript, true);
            } else if (packetType === ClientProt.RESUME_P_COUNTDIALOG) {
                const input = data.g4();
                if (!this.activeScript || this.activeScript.execution !== ScriptState.COUNTDIALOG) {
                    continue;
                }

                this.lastInt = input;
                this.executeScript(this.activeScript, true);
            } else if (packetType === ClientProt.IF_BUTTON) {
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
            } else if (packetType === ClientProt.INV_BUTTON1 || packetType === ClientProt.INV_BUTTON2 || packetType === ClientProt.INV_BUTTON3 || packetType === ClientProt.INV_BUTTON4 || packetType === ClientProt.INV_BUTTON5) {
                // jagex has if_button1-5
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !com.inventoryOptions || !com.inventoryOptions.length || !this.isComponentVisible(com)) {
                    continue;
                }

                if (
                    (packetType === ClientProt.INV_BUTTON1 && !com.inventoryOptions[0]) ||
                    (packetType === ClientProt.INV_BUTTON2 && !com.inventoryOptions[1]) ||
                    (packetType === ClientProt.INV_BUTTON3 && !com.inventoryOptions[2]) ||
                    (packetType === ClientProt.INV_BUTTON4 && !com.inventoryOptions[3]) ||
                    (packetType === ClientProt.INV_BUTTON5 && !com.inventoryOptions[4])
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
                if (packetType === ClientProt.INV_BUTTON1) {
                    trigger = ServerTriggerType.INV_BUTTON1;
                } else if (packetType === ClientProt.INV_BUTTON2) {
                    trigger = ServerTriggerType.INV_BUTTON2;
                } else if (packetType === ClientProt.INV_BUTTON3) {
                    trigger = ServerTriggerType.INV_BUTTON3;
                } else if (packetType === ClientProt.INV_BUTTON4) {
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
            } else if (packetType === ClientProt.INV_BUTTOND) {
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
            } else if (packetType === ClientProt.OPHELD1 || packetType === ClientProt.OPHELD2 || packetType === ClientProt.OPHELD3 || packetType === ClientProt.OPHELD4 || packetType === ClientProt.OPHELD5) {
                const item = data.g2();
                const slot = data.g2();
                const comId = data.g2();

                const com = Component.get(comId);
                if (typeof com === 'undefined' || !this.isComponentVisible(com)) {
                    continue;
                }

                const type = ObjType.get(item);
                if ((packetType === ClientProt.OPHELD1 && !type.iops[0]) || (packetType === ClientProt.OPHELD2 && !type.iops[1]) || (packetType === ClientProt.OPHELD3 && !type.iops[2]) || (packetType === ClientProt.OPHELD4 && !type.iops[3])) {
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
                if (packetType === ClientProt.OPHELD1) {
                    trigger = ServerTriggerType.OPHELD1;
                } else if (packetType === ClientProt.OPHELD2) {
                    trigger = ServerTriggerType.OPHELD2;
                } else if (packetType === ClientProt.OPHELD3) {
                    trigger = ServerTriggerType.OPHELD3;
                } else if (packetType === ClientProt.OPHELD4) {
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
            } else if (packetType === ClientProt.OPHELDU) {
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
            } else if (packetType === ClientProt.OPHELDT) {
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
            } else if (packetType === ClientProt.OPLOC1 || packetType === ClientProt.OPLOC2 || packetType === ClientProt.OPLOC3 || packetType === ClientProt.OPLOC4 || packetType === ClientProt.OPLOC5) {
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
                    this.unsetMapFlag();
                    continue;
                }

                const locType = LocType.get(loc.type);
                if (
                    (packetType === ClientProt.OPLOC1 && !locType.ops[0]) ||
                    (packetType === ClientProt.OPLOC2 && !locType.ops[1]) ||
                    (packetType === ClientProt.OPLOC3 && !locType.ops[2]) ||
                    (packetType === ClientProt.OPLOC4 && !locType.ops[3]) ||
                    (packetType === ClientProt.OPLOC5 && !locType.ops[4])
                ) {
                    continue;
                }

                let mode: ServerTriggerType;
                if (packetType === ClientProt.OPLOC1) {
                    mode = ServerTriggerType.APLOC1;
                } else if (packetType === ClientProt.OPLOC2) {
                    mode = ServerTriggerType.APLOC2;
                } else if (packetType === ClientProt.OPLOC3) {
                    mode = ServerTriggerType.APLOC3;
                } else if (packetType === ClientProt.OPLOC4) {
                    mode = ServerTriggerType.APLOC4;
                } else {
                    mode = ServerTriggerType.APLOC5;
                }

                this.setInteraction(loc, mode);
                pathfindX = loc.x;
                pathfindZ = loc.z;
                pathfindRequest = true;
            } else if (packetType === ClientProt.OPLOCU) {
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
            } else if (packetType === ClientProt.OPLOCT) {
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
            } else if (packetType === ClientProt.OPNPC1 || packetType === ClientProt.OPNPC2 || packetType === ClientProt.OPNPC3 || packetType === ClientProt.OPNPC4 || packetType === ClientProt.OPNPC5) {
                const nid = data.g2();

                const npc = World.getNpc(nid);
                if (!npc || npc.delayed()) {
                    this.unsetMapFlag();
                    continue;
                }

                if (!this.npcs.has(npc.nid)) {
                    continue;
                }

                const npcType = NpcType.get(npc.type);
                if (
                    (packetType === ClientProt.OPNPC1 && !npcType.ops[0]) ||
                    (packetType === ClientProt.OPNPC2 && !npcType.ops[1]) ||
                    (packetType === ClientProt.OPNPC3 && !npcType.ops[2]) ||
                    (packetType === ClientProt.OPNPC4 && !npcType.ops[3]) ||
                    (packetType === ClientProt.OPNPC5 && !npcType.ops[4])
                ) {
                    continue;
                }

                let mode: ServerTriggerType;
                if (packetType === ClientProt.OPNPC1) {
                    mode = ServerTriggerType.APNPC1;
                } else if (packetType === ClientProt.OPNPC2) {
                    mode = ServerTriggerType.APNPC2;
                } else if (packetType === ClientProt.OPNPC3) {
                    mode = ServerTriggerType.APNPC3;
                } else if (packetType === ClientProt.OPNPC4) {
                    mode = ServerTriggerType.APNPC4;
                } else {
                    mode = ServerTriggerType.APNPC5;
                }

                this.setInteraction(npc, mode);
                pathfindX = npc.x;
                pathfindZ = npc.z;
                pathfindRequest = true;
            } else if (packetType === ClientProt.OPNPCU) {
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
            } else if (packetType === ClientProt.OPNPCT) {
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
            } else if (packetType === ClientProt.OPOBJ1 || packetType === ClientProt.OPOBJ2 || packetType === ClientProt.OPOBJ3 || packetType === ClientProt.OPOBJ4 || packetType === ClientProt.OPOBJ5) {
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
                    this.unsetMapFlag();
                    continue;
                }

                const objType = ObjType.get(obj.type);
                // todo: validate all options
                if ((packetType === ClientProt.OPOBJ1 && !objType.ops[0]) || (packetType === ClientProt.OPOBJ4 && !objType.ops[3])) {
                    continue;
                }

                let mode: ServerTriggerType;
                if (packetType === ClientProt.OPOBJ1) {
                    mode = ServerTriggerType.APOBJ1;
                } else if (packetType === ClientProt.OPOBJ2) {
                    mode = ServerTriggerType.APOBJ2;
                } else if (packetType === ClientProt.OPOBJ3) {
                    mode = ServerTriggerType.APOBJ3;
                } else if (packetType === ClientProt.OPOBJ4) {
                    mode = ServerTriggerType.APOBJ4;
                } else {
                    mode = ServerTriggerType.APOBJ5;
                }

                this.setInteraction(obj, mode);
                pathfindX = obj.x;
                pathfindZ = obj.z;
                pathfindRequest = true;
            } else if (packetType === ClientProt.OPOBJU) {
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
            } else if (packetType === ClientProt.OPOBJT) {
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
            } else if (packetType === ClientProt.OPPLAYER1 || packetType === ClientProt.OPPLAYER2 || packetType === ClientProt.OPPLAYER3 || packetType === ClientProt.OPPLAYER4) {
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
                if (packetType === ClientProt.OPPLAYER1) {
                    mode = ServerTriggerType.APPLAYER1;
                } else if (packetType === ClientProt.OPPLAYER2) {
                    mode = ServerTriggerType.APPLAYER2;
                } else if (packetType === ClientProt.OPPLAYER3) {
                    mode = ServerTriggerType.APPLAYER3;
                } else {
                    mode = ServerTriggerType.APPLAYER4;
                }

                this.setInteraction(player, mode);
                pathfindX = player.x;
                pathfindZ = player.z;
                pathfindRequest = true;
            } else if (packetType === ClientProt.OPPLAYERU) {
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
            } else if (packetType === ClientProt.OPPLAYERT) {
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
            } else if (packetType === ClientProt.FRIENDLIST_ADD) {
                const other = data.g8();

                World.socialAddFriend(this.username37, other);
            } else if (packetType === ClientProt.FRIENDLIST_DEL) {
                const other = data.g8();

                World.socialRemoveFriend(this.username37, other);
            } else if (packetType === ClientProt.IGNORELIST_ADD) {
                const other = data.g8();

                World.socialAddIgnore(this.username37, other);
            } else if (packetType === ClientProt.IGNORELIST_DEL) {
                const other = data.g8();

                World.socialRemoveIgnore(this.username37, other);
            } else if (packetType === ClientProt.IDLE_TIMER) {
                if (!Environment.LOCAL_DEV) {
                    this.logout();
                    this.logoutRequested = true;
                }
            } else if (packetType === ClientProt.MESSAGE_PRIVATE) {
                const other = data.g8();
                const message = WordPack.unpack(data, data.data.length - 8);

                World.socialPrivateMessage(this.username37, other, message);
            }
        }

        if (this.delayed()) {
            this.unsetMapFlag();
            pathfindRequest = false;
            pathfindX = -1;
            pathfindZ = -1;
        }

        this.client?.reset();

        // process any pathfinder requests now
        if (pathfindRequest && pathfindX !== -1 && pathfindZ !== -1) {
            if (!this.target || this.target instanceof Loc || this.target instanceof Obj) {
                this.faceEntity = -1;
                this.mask |= Player.FACE_ENTITY;
            }

            if (this.target) {
                this.pathToTarget();
            } else {
                this.queueWaypoints(findPath(this.level, this.x, this.z, pathfindX, pathfindZ));
            }
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

        const out: Packet[] = this.netOut;
        const length: number = out.length;
        for (let index: number = 0; index < length; index++) {
            const packet: Packet = out[index];

            if (this.client.encryptor) {
                packet.data[0] = (packet.data[0] + this.client.encryptor.nextInt()) & 0xff;
            }

            World.lastCycleBandwidth[1] += packet.pos;
            this.client.write(packet);
        }

        this.client.flush();

        // release the packets after flushing.
        for (let index: number = 0; index < length; index++) {
            out[index].release();
        }

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

    override logout() {
        const out = new Packet(new Uint8Array(1));
        out.p1(ServerProt.LOGOUT.id);

        this.writeImmediately(out);
    }

    override terminate() {
        this.client?.terminate();
        this.client = null;
    }

    override playerLog(message: string, ...args: string[]): void {
        if (args.length > 0) {
            fs.appendFileSync(`data/players/${this.username}.log`, `[${new Date().toISOString().split('T')[0]} ${this.client?.remoteAddress}]: ${message} ${args.join(' ')}\n`);
        } else {
            fs.appendFileSync(`data/players/${this.username}.log`, `[${new Date().toISOString().split('T')[0]} ${this.client?.remoteAddress}]: ${message}\n`);
        }
    }
}

export function isNetworkPlayer(player: Player): player is NetworkPlayer {
    return (player as NetworkPlayer).client !== null;
}
