import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { printFatalError, printWarning } from '#/util/Logger.js';
import { listFilesExt } from '#tools/pack/Parse.js';
import { InterfacePack, ModelPack, ObjPack, SeqPack, VarbitPack, VarpPack } from '#tools/pack/PackFile.js';

function renameModel(id: number) {
    const existingFiles = listFilesExt(`${Environment.build.srcDir}/models`, '.ob2');

    let model = ModelPack.getById(id);
    if (model.startsWith('model_')) {
        let name = 'com_i1';
        let i = 2;
        while (ModelPack.getByName(name) !== -1) {
            name = `com_i${i}`;
            i++;
        }

        const filePath = existingFiles.find(x => x.endsWith(`/${model}.ob2`));
        if (filePath) {
            fs.renameSync(filePath, `${Environment.build.srcDir}/models/com/${name}.ob2`);
        } else {
            console.error('Model not found on filesystem', 'com', model);
        }

        model = name;
        ModelPack.register(id, model);
    }

    return model;
}

const enum ComponentType {
    TYPE_LAYER = 0,
    TYPE_UNUSED = 1,
    TYPE_INV = 2,
    TYPE_RECT = 3,
    TYPE_TEXT = 4,
    TYPE_GRAPHIC = 5,
    TYPE_MODEL = 6,
    TYPE_INV_TEXT = 7
}

const enum ButtonType {
    BUTTON_OK = 1,
    BUTTON_TARGET = 2,
    BUTTON_CLOSE = 3,
    BUTTON_TOGGLE = 4,
    BUTTON_SELECT = 5,
    BUTTON_CONTINUE = 6
}

const STATS = [
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
    'slayer',
    'farming',
    'runecraft'
];

class IfType {
    static count: number = 0;
    static order: number[] = [];
    static instances: IfType[] = [];

    static unpack(jag: Jagfile) {
        const dat: Packet | null = jag.read('data');
        if (!dat) {
            return;
        }

        IfType.count = dat.g2();
        IfType.order = [];

        let layer: number = -1;
        while (dat.pos < dat.length) {
            let id: number = dat.g2();
            if (id === 65535) {
                layer = dat.g2();
                id = dat.g2();
            }

            IfType.order.push(id);

            const com = (IfType.instances[id] = new IfType());
            com.id = id;
            com.rootLayer = layer;
            com.comType = dat.g1();
            com.buttonType = dat.g1();
            com.clientCode = dat.g2();
            com.width = dat.g2();
            com.height = dat.g2();
            com.trans = dat.g1();

            com.overLayer = dat.g1();
            if (com.overLayer === 0) {
                com.overLayer = -1;
            } else {
                com.overLayer = ((com.overLayer - 1) << 8) + dat.g1();
            }

            const comparatorCount: number = dat.g1();
            if (comparatorCount > 0) {
                com.scriptComparator = new Uint8Array(comparatorCount);
                com.scriptOperand = new Uint16Array(comparatorCount);

                for (let i: number = 0; i < comparatorCount; i++) {
                    com.scriptComparator[i] = dat.g1();
                    com.scriptOperand[i] = dat.g2();
                }
            }

            const scriptCount: number = dat.g1();
            if (scriptCount > 0) {
                com.script = new Array(scriptCount);

                for (let i: number = 0; i < scriptCount; i++) {
                    const opcodeCount: number = dat.g2();

                    const script: Uint16Array = new Uint16Array(opcodeCount);
                    com.script[i] = script;
                    for (let j: number = 0; j < opcodeCount; j++) {
                        script[j] = dat.g2();
                    }
                }
            }

            if (com.comType === ComponentType.TYPE_LAYER) {
                com.scroll = dat.g2();
                com.hide = dat.gbool();

                const childCount: number = dat.g2();
                com.childId = new Array(childCount);
                com.childX = new Array(childCount);
                com.childY = new Array(childCount);

                for (let i: number = 0; i < childCount; i++) {
                    com.childId[i] = dat.g2();
                    com.childX[i] = dat.g2s();
                    com.childY[i] = dat.g2s();
                }
            }

            if (com.comType === ComponentType.TYPE_UNUSED) {
                dat.pos += 3;
            }

            if (com.comType === ComponentType.TYPE_INV) {
                com.draggable = dat.gbool();
                com.interactable = dat.gbool();
                com.usable = dat.gbool();
                com.swappable = dat.gbool();
                com.marginX = dat.g1();
                com.marginY = dat.g1();

                com.invSlotOffsetX = new Int16Array(20);
                com.invSlotOffsetY = new Int16Array(20);
                com.invSlotSprite = new Array(20);

                for (let i: number = 0; i < 20; i++) {
                    if (dat.gbool()) {
                        com.invSlotOffsetX[i] = dat.g2s();
                        com.invSlotOffsetY[i] = dat.g2s();
                        com.invSlotSprite[i] = dat.gjstr();
                    }
                }

                com.iops = new Array(5);
                for (let i: number = 0; i < 5; i++) {
                    const iop: string = dat.gjstr();
                    com.iops[i] = iop;

                    if (iop.length === 0) {
                        com.iops[i] = null;
                    }
                }
            }

            if (com.comType === ComponentType.TYPE_RECT) {
                com.fill = dat.gbool();
            }

            if (com.comType === ComponentType.TYPE_TEXT || com.comType === ComponentType.TYPE_UNUSED) {
                com.center = dat.gbool();
                com.font = dat.g1();
                com.shadowed = dat.gbool();
            }

            if (com.comType === ComponentType.TYPE_TEXT) {
                com.text = dat.gjstr();
                com.activeText = dat.gjstr();
            }

            if (com.comType === ComponentType.TYPE_UNUSED || com.comType === ComponentType.TYPE_RECT || com.comType === ComponentType.TYPE_TEXT) {
                com.colour = dat.g4s();
            }

            if (com.comType === ComponentType.TYPE_RECT || com.comType === ComponentType.TYPE_TEXT) {
                com.activeColour = dat.g4s();
                com.overColour = dat.g4s();
                com.activeOverColour = dat.g4s();
            }

            if (com.comType === ComponentType.TYPE_GRAPHIC) {
                com.graphic = dat.gjstr();
                com.activeGraphic = dat.gjstr();
            }

            if (com.comType === ComponentType.TYPE_MODEL) {
                com.model = dat.g1();
                if (com.model !== 0) {
                    com.model = ((com.model - 1) << 8) + dat.g1();
                }

                com.activeModel = dat.g1();
                if (com.activeModel !== 0) {
                    com.activeModel = ((com.activeModel - 1) << 8) + dat.g1();
                }

                com.anim = dat.g1();
                if (com.anim === 0) {
                    com.anim = -1;
                } else {
                    com.anim = ((com.anim - 1) << 8) + dat.g1();
                }

                com.activeAnim = dat.g1();
                if (com.activeAnim === 0) {
                    com.activeAnim = -1;
                } else {
                    com.activeAnim = ((com.activeAnim - 1) << 8) + dat.g1();
                }

                com.zoom = dat.g2();
                com.xan = dat.g2();
                com.yan = dat.g2();
            }

            if (com.comType === ComponentType.TYPE_INV_TEXT) {
                com.center = dat.gbool();
                com.font = dat.g1();

                com.shadowed = dat.gbool();
                com.colour = dat.g4s();
                com.marginX = dat.g2s();
                com.marginY = dat.g2s();
                com.interactable = dat.gbool();

                com.iops = new Array(5);
                for (let i: number = 0; i < 5; i++) {
                    const iop: string = dat.gjstr();
                    com.iops[i] = iop;

                    if (iop.length === 0) {
                        com.iops[i] = null;
                    }
                }
            }

            if (com.buttonType === ButtonType.BUTTON_TARGET || com.comType === ComponentType.TYPE_INV) {
                com.actionVerb = dat.gjstr();
                com.action = dat.gjstr();
                com.actionTarget = dat.g2();
            }

            if (com.buttonType === ButtonType.BUTTON_OK || com.buttonType === ButtonType.BUTTON_TOGGLE || com.buttonType === ButtonType.BUTTON_SELECT || com.buttonType === ButtonType.BUTTON_CONTINUE) {
                com.option = dat.gjstr();
            }
        }
    }

    static exportOrder() {
        fs.writeFileSync(`${Environment.build.srcDir}/pack/interface.order`, IfType.order.join('\n') + '\n');
    }

    static exportSrc() {
        // generate names
        let ifId = 0;
        const comCount = [];
        for (let id = 0; id < IfType.count; id++) {
            const com = IfType.instances[id];
            if (!com) {
                continue;
            }

            if (com.id !== com.rootLayer) {
                continue;
            }

            const name = InterfacePack.getById(com.id);
            if (!name || name.startsWith('inter_')) {
                InterfacePack.register(com.id, `inter_${ifId}`);
            }
            ifId++;
            comCount[com.id] = 0;
        }

        for (let i = 0; i < IfType.order.length; i++) {
            const id = IfType.order[i];
            const com = IfType.instances[id];
            if (!com || com.id === com.rootLayer) {
                continue;
            }

            const name = InterfacePack.getById(com.id);
            const [_parentName, comName] = name.split(':');
            if (name && typeof comName === 'undefined') {
                printFatalError(`Issue with component ${com.id} must be manually resolved`);
            }
            if (!name || (typeof comName !== 'undefined' && comName.startsWith('com_'))) {
                InterfacePack.register(com.id, `${InterfacePack.getById(com.rootLayer)}:com_${comCount[com.rootLayer]}`);
            }
            comCount[com.rootLayer]++;
        }

        // save names
        InterfacePack.save();

        // export source files
        if (!fs.existsSync(`${Environment.build.srcDir}/scripts/interfaces`)) {
            fs.mkdirSync(`${Environment.build.srcDir}/scripts/interfaces`);
        }

        const existingFiles = listFilesExt(`${Environment.build.srcDir}/scripts`, '.if');

        for (let id = 0; id < IfType.count; id++) {
            const com = IfType.instances[id];
            if (!com || com.id !== com.rootLayer) {
                continue;
            }

            const name = InterfacePack.getById(com.id);
            const src = com.export();

            const existingFile = existingFiles.find(x => x.endsWith(`/${name}.if`));
            const destFile = existingFile ?? `${Environment.build.srcDir}/scripts/interfaces/${name}.if`;
            fs.writeFileSync(destFile, src.join('\n') + '\n');
        }
    }

    export(temp: string[] = [], x: number = 0, y: number = 0, parent: string = ''): string[] {
        const comName = InterfacePack.getById(this.id);

        if (this.id !== this.rootLayer) {
            temp.push(`[${comName.split(':')[1]}]`);

            if (parent) {
                temp.push(`layer=${parent}`);
            }

            switch (this.comType) {
                case 0:
                    temp.push('type=layer');
                    break;
                case 2:
                    temp.push('type=inv');
                    break;
                case 3:
                    temp.push('type=rect');
                    break;
                case 4:
                    temp.push('type=text');
                    break;
                case 5:
                    temp.push('type=graphic');
                    break;
                case 6:
                    temp.push('type=model');
                    break;
                case 7:
                    temp.push('type=invtext');
                    break;
                case 8:
                    temp.push('type=8');
                    break;
                default:
                    printWarning(`Unknown comType: ${this.comType} when packing ${this.id} ${InterfacePack.getById(this.id)}`);
                    break;
            }

            temp.push(`x=${x}`);
            temp.push(`y=${y}`);

            switch (this.buttonType) {
                case 1:
                    temp.push('buttontype=normal');
                    break;
                case 2:
                    temp.push('buttontype=target');
                    break;
                case 3:
                    temp.push('buttontype=close');
                    break;
                case 4:
                    temp.push('buttontype=toggle');
                    break;
                case 5:
                    temp.push('buttontype=select');
                    break;
                case 6:
                    temp.push('buttontype=pause');
                    break;
            }

            if (this.clientCode) {
                temp.push(`clientcode=${this.clientCode}`);
            }

            if (this.width) {
                temp.push(`width=${this.width}`);
            }

            if (this.height) {
                temp.push(`height=${this.height}`);
            }

            if (this.trans) {
                temp.push(`trans=${this.trans}`);
            }

            if (this.overLayer !== -1) {
                temp.push(`overlayer=${InterfacePack.getById(this.overLayer).split(':')[1]}`);
            }
        }

        if (this.script) {
            for (let i = 0; i < this.script.length; i++) {
                if (!this.script[i]) {
                    continue;
                }

                let opcount = 1;

                if (this.script[i]!.length === 1) {
                    // empty script
                    temp.push(`script${i + i}op1=`);
                }

                for (let j = 0; j < this.script[i]!.length - 1; j++) {
                    let str = `script${i + 1}op${opcount++}=`;

                    const popStack = (): number => {
                        if (!this.script || !this.script[i]) {
                            return 0;
                        }

                        return this.script[i]![++j];
                    };

                    const op = this.script[i]![j];
                    switch (op) {
                        case 1: {
                            const stat = popStack();
                            str += `stat_level,${STATS[stat]}`;
                            break;
                        }
                        case 2: {
                            const stat = popStack();
                            str += `stat_base_level,${STATS[stat]}`;
                            break;
                        }
                        case 3: {
                            const stat = popStack();
                            str += `stat_xp,${STATS[stat]}`;
                            break;
                        }
                        case 4: {
                            const inv = popStack();
                            const obj = popStack();
                            str += `inv_count,${InterfacePack.getById(inv) || inv},${ObjPack.getById(obj) || 'obj_' + obj}`;
                            break;
                        }
                        case 5: {
                            const varp = popStack();
                            str += `pushvar,${VarpPack.getById(varp) || 'varp_' + varp}`;
                            break;
                        }
                        case 6: {
                            const stat = popStack();
                            str += `stat_xp_remaining,${STATS[stat]}`;
                            break;
                        }
                        case 7:
                            str += 'op7';
                            break;
                        case 8: // combat level
                            str += 'op8';
                            break;
                        case 9: // total level
                            str += 'op9';
                            break;
                        case 10: {
                            const inv = popStack();
                            const obj = popStack();
                            str += `inv_contains,${InterfacePack.getById(inv) || inv},${ObjPack.getById(obj) || 'obj_' + obj}`;
                            break;
                        }
                        case 11:
                            str += 'runenergy';
                            break;
                        case 12:
                            str += 'runweight';
                            break;
                        case 13: {
                            const varp = popStack();
                            const bit = popStack();
                            str += `testbit,${VarpPack.getById(varp) || 'varp_' + varp},${bit}`;
                            break;
                        }
                        case 14: {
                            const varbit = popStack();
                            str += `push_varbit,${VarbitPack.getById(varbit) || 'varbit_' + varbit}`;
                            break;
                        }
                        case 15:
                            str += 'subtract';
                            break;
                        case 16:
                            str += 'divide';
                            break;
                        case 17:
                            str += 'multiply';
                            break;
                        case 18:
                            str += 'coordx';
                            break;
                        case 19:
                            str += 'coordz';
                            break;
                        case 20: {
                            const value = popStack();
                            str += `push_constant,${value}`;
                            break;
                        }
                        default:
                            printFatalError('Unknown script opcode: ' + op);
                            break;
                    }

                    temp.push(str);
                }
            }
        }

        if (this.scriptComparator && this.scriptOperand) {
            // script can be absent if the comparator was left in
            for (let i = 0; i < this.scriptComparator.length; i++) {
                let str = `script${i + 1}=`;

                switch (this.scriptComparator[i]) {
                    case 1:
                        str += 'eq';
                        break;
                    case 2:
                        str += 'lt';
                        break;
                    case 3:
                        str += 'gt';
                        break;
                    case 4:
                        str += 'neq';
                        break;
                }

                str += `,${this.scriptOperand[i]}`;
                temp.push(str);
            }
        }

        if (this.comType === 0) {
            if (this.scroll) {
                temp.push(`scroll=${this.scroll}`);
            }

            if (this.hide) {
                temp.push('hide=yes');
            }
        }

        if (this.comType === 2) {
            if (this.draggable) {
                temp.push('draggable=yes');
            }

            if (this.interactable) {
                temp.push('interactable=yes');
            }

            if (this.usable) {
                temp.push('usable=yes');
            }

            if (this.swappable) {
                temp.push('swappable=yes');
            }

            if (this.marginX || this.marginY) {
                temp.push(`margin=${this.marginX},${this.marginY}`);
            }

            if (this.invSlotSprite && this.invSlotOffsetX && this.invSlotOffsetY) {
                for (let i = 0; i < 20; i++) {
                    if (typeof this.invSlotSprite[i] !== 'undefined') {
                        if (this.invSlotOffsetX[i] || this.invSlotOffsetY[i]) {
                            temp.push(`slot${i + 1}=${this.invSlotSprite[i]}:${this.invSlotOffsetX[i]},${this.invSlotOffsetY[i]}`);
                        } else {
                            temp.push(`slot${i + 1}=${this.invSlotSprite[i]}`);
                        }
                    }
                }
            }

            if (this.iops) {
                for (let i = 0; i < this.iops.length; i++) {
                    if (this.iops[i]) {
                        temp.push(`option${i + 1}=${this.iops[i]}`);
                    }
                }
            }
        }

        if (this.comType === 3) {
            if (this.fill) {
                temp.push('fill=yes');
            }
        }

        if (this.comType === 4) {
            if (this.center) {
                temp.push('center=yes');
            }

            switch (this.font) {
                case 0:
                    temp.push('font=p11_full');
                    break;
                case 1:
                    temp.push('font=p12_full');
                    break;
                case 2:
                    temp.push('font=b12_full');
                    break;
                case 3:
                    temp.push('font=q8_full');
                    break;
            }

            if (this.shadowed) {
                temp.push('shadowed=yes');
            }
        }

        if (this.comType === 4) {
            if (this.text) {
                temp.push(`text=${this.text}`);
            }

            if (this.activeText) {
                temp.push(`activetext=${this.activeText}`);
            }
        }

        if (this.comType === 3 || this.comType === 4) {
            if (this.colour) {
                temp.push(`colour=0x${this.colour.toString(16).toUpperCase().padStart(6, '0')}`);
            }
        }

        if (this.comType === 3 || this.comType === 4) {
            if (this.activeColour) {
                temp.push(`activecolour=0x${this.activeColour.toString(16).toUpperCase().padStart(6, '0')}`);
            }

            if (this.overColour) {
                temp.push(`overcolour=0x${this.overColour.toString(16).toUpperCase().padStart(6, '0')}`);
            }

            if (this.activeOverColour) {
                temp.push(`activeovercolour=0x${this.activeOverColour.toString(16).toUpperCase().padStart(6, '0')}`);
            }
        }

        if (this.comType === 5) {
            if (this.graphic) {
                temp.push(`graphic=${this.graphic}`);
            }

            if (this.activeGraphic) {
                temp.push(`activegraphic=${this.activeGraphic}`);
            }
        }

        if (this.comType === 6) {
            if (this.model) {
                temp.push(`model=${renameModel(this.model)}`);
            }

            if (this.activeModel) {
                temp.push(`activemodel=${renameModel(this.activeModel)}`);
            }

            if (this.anim !== -1) {
                temp.push(`anim=${SeqPack.getById(this.anim) || 'seq_' + this.anim}`);
            }

            if (this.activeAnim !== -1) {
                temp.push(`activeanim=${SeqPack.getById(this.activeAnim) || 'seq_' + this.activeAnim}`);
            }

            if (this.zoom) {
                temp.push(`zoom=${this.zoom}`);
            }

            if (this.xan) {
                temp.push(`xan=${this.xan}`);
            }

            if (this.yan) {
                temp.push(`yan=${this.yan}`);
            }
        }

        if (this.comType === 7) {
            if (this.center) {
                temp.push('center=yes');
            }

            switch (this.font) {
                case 0:
                    temp.push('font=p11_full');
                    break;
                case 1:
                    temp.push('font=p12_full');
                    break;
                case 2:
                    temp.push('font=b12_full');
                    break;
                case 3:
                    temp.push('font=q8_full');
                    break;
            }

            if (this.shadowed) {
                temp.push('shadowed=yes');
            }

            if (this.colour) {
                temp.push(`colour=0x${this.colour.toString(16).toUpperCase().padStart(6, '0')}`);
            }

            if (this.marginX || this.marginY) {
                temp.push(`margin=${this.marginX},${this.marginY}`);
            }

            if (this.invSlotSprite && this.invSlotOffsetX && this.invSlotOffsetY) {
                for (let i = 0; i < 20; i++) {
                    if (typeof this.invSlotSprite[i] !== 'undefined') {
                        if (this.invSlotOffsetX[i] || this.invSlotOffsetY[i]) {
                            temp.push(`slot${i + 1}=${this.invSlotSprite[i]}:${this.invSlotOffsetX[i]},${this.invSlotOffsetY[i]}`);
                        } else {
                            temp.push(`slot${i + 1}=${this.invSlotSprite[i]}`);
                        }
                    }
                }
            }

            if (this.iops) {
                for (let i = 0; i < this.iops.length; i++) {
                    if (this.iops[i]) {
                        temp.push(`option${i + 1}=${this.iops[i]}`);
                    }
                }
            }
        }

        if (this.buttonType === 2 || this.comType === 2) {
            if (this.actionVerb) {
                temp.push(`actionverb=${this.actionVerb}`);
            }

            if (this.actionTarget) {
                const target = [];
                if (this.actionTarget & 0x1) {
                    target.push('obj');
                }
                if (this.actionTarget & 0x2) {
                    target.push('npc');
                }
                if (this.actionTarget & 0x4) {
                    target.push('loc');
                }
                if (this.actionTarget & 0x8) {
                    target.push('player');
                }
                if (this.actionTarget & 0x10) {
                    target.push('heldobj');
                }

                temp.push(`actiontarget=${target.join(',')}`);
            }

            if (this.action) {
                temp.push(`action=${this.action}`);
            }
        }

        if (this.buttonType === 1 || this.buttonType === 4 || this.buttonType === 5 || this.buttonType === 6) {
            if (this.option) {
                temp.push(`option=${this.option}`);
            }
        }

        if (this.comType === 0 && this.childId && this.childX && this.childY) {
            for (let i = 0; i < this.childId.length; i++) {
                if (this.id !== this.rootLayer || i > 0) {
                    temp.push('');
                }

                const com = IfType.instances[this.childId[i]];
                const parentName = this.id !== this.rootLayer ? comName.split(':')[1] : '';
                com.export(temp, this.childX[i], this.childY[i], parentName);
            }
        }

        return temp;
    }

    id: number = -1;
    rootLayer: number = -1;
    comType: number = -1;
    buttonType: number = -1;
    clientCode: number = 0;
    width: number = 0;
    height: number = 0;
    trans: number = 0;
    overLayer: number = -1;
    scriptComparator: Uint8Array | null = null;
    scriptOperand: Uint16Array | null = null;
    script: (Uint16Array | null)[] | null = null;
    scroll: number = 0;
    hide: boolean = false;
    draggable: boolean = false;
    interactable: boolean = false;
    usable: boolean = false;
    swappable: boolean = false;
    marginX: number = 0;
    marginY: number = 0;
    invSlotOffsetX: Int16Array | null = null;
    invSlotOffsetY: Int16Array | null = null;
    invSlotSprite: string[] | null = null;
    iops: (string | null)[] | null = null;
    fill: boolean = false;
    center: boolean = false;
    font: number | null = null;
    shadowed: boolean = false;
    text: string | null = null;
    activeText: string | null = null;
    colour: number = 0;
    activeColour: number = 0;
    overColour: number = 0;
    activeOverColour: number = 0;
    graphic: string | null = null;
    activeGraphic: string | null = null;
    model: number = -1;
    activeModel: number | null = null;
    anim: number = -1;
    activeAnim: number = -1;
    zoom: number = 0;
    xan: number = 0;
    yan: number = 0;
    actionVerb: string | null = null;
    action: string | null = null;
    actionTarget: number = -1;
    option: string | null = null;
    childId: number[] | null = null;
    childX: number[] | null = null;
    childY: number[] | null = null;
}

const cache = new FileStream('data/unpack');
const interfaceData = cache.read(0, 3);

if (!interfaceData) {
    printFatalError('No interface data in cache');
    process.exit(1);
}

if (!fs.existsSync(`${Environment.build.srcDir}/models/com`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/models/com`, { recursive: true });
}

IfType.unpack(new Jagfile(new Packet(interfaceData)));
IfType.exportOrder();
IfType.exportSrc();

ModelPack.save();
