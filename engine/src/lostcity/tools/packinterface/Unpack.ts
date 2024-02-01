import fs from 'fs';

import Jagfile from '#jagex2/io/Jagfile.js';
import { loadPack } from '#lostcity/util/NameMap.js';

const pack = loadPack('dump/pack/interface.pack');
const objPack = loadPack('dump/pack/obj.pack');
const seqPack = loadPack('dump/pack/seq.pack');
const varpPack = loadPack('dump/pack/varp.pack');
const modelPack = loadPack('dump/pack/model.pack');

const jag = Jagfile.load('dump/client/interface');
const dat = jag.read('data');

if (!dat) {
    throw new Error('no data in dump/client/interface');
}

type Component = Record<string, any> & {
    id: number;
    rootLayer: number;
};

let order = '';
const count = dat.g2();
const interfaces: (Component | null)[] = [];
for (let i = 0; i < count; i++) {
    interfaces[i] = null;

    if (!pack[i]) {
        pack[i] = 'null:null';
    }
}

// decode
let rootLayer = -1;
while (dat.available > 0) {
    let id = dat.g2();
    if (id === 65535) {
        rootLayer = dat.g2();
        id = dat.g2();
        // order += `${rootLayer}\n`; // preserve only the order of root interfaces
    }
    order += `${id}\n`;

    const com: Component = {
        id,
        rootLayer
    };
    com.type = dat.g1();
    com.buttonType = dat.g1();
    com.clientCode = dat.g2();
    com.width = dat.g2();
    com.height = dat.g2();
    // com.alpha = dat.g1(); // 317

    com.overLayer = dat.g1();
    if (com.overLayer == 0) {
        com.overLayer = -1;
    } else {
        com.overLayer = ((com.overLayer - 1) << 8) + dat.g1();
    }

    const comparatorCount = dat.g1();
    if (comparatorCount > 0) {
        com.scriptComparator = [];
        com.scriptOperand = [];

        for (let i = 0; i < comparatorCount; i++) {
            com.scriptComparator[i] = dat.g1();
            com.scriptOperand[i] = dat.g2();
        }
    }

    const scriptCount = dat.g1();
    if (scriptCount > 0) {
        com.scripts = [];

        for (let i = 0; i < scriptCount; i++) {
            const opcodeCount = dat.g2();
            com.scripts[i] = [];

            for (let j = 0; j < opcodeCount; j++) {
                com.scripts[i][j] = dat.g2();
            }
        }
    }

    if (com.type == 0) {
        com.scroll = dat.g2();
        com.hide = dat.gbool();

        const childCount = dat.g1();
        // let childCount = dat.g2(); // 317
        com.childId = [];
        com.childX = [];
        com.childY = [];

        for (let i = 0; i < childCount; i++) {
            com.childId[i] = dat.g2();
            com.childX[i] = dat.g2s();
            com.childY[i] = dat.g2s();
        }
    }

    if (com.type == 2) {
        com.inventorySlotObjId = [];
        com.inventorySlotObjCount = [];

        com.draggable = dat.gbool();
        com.interactable = dat.gbool();
        com.usable = dat.gbool();
        // com.replaces = dat.gbool(); // 317
        com.marginX = dat.g1();
        com.marginY = dat.g1();

        com.inventorySlotOffsetX = [];
        com.inventorySlotOffsetY = [];
        com.inventorySlotGraphic = [];

        for (let i = 0; i < 20; i++) {
            if (dat.gbool()) {
                com.inventorySlotOffsetX[i] = dat.g2s();
                com.inventorySlotOffsetY[i] = dat.g2s();
                com.inventorySlotGraphic[i] = dat.gjstr();
            }
        }

        com.inventoryOptions = [];
        for (let i = 0; i < 5; i++) {
            com.inventoryOptions[i] = dat.gjstr();
        }
    }

    if (com.type == 3) {
        com.fill = dat.gbool();
    }

    if (com.type == 4 || com.type == 1) {
        com.center = dat.gbool();
        com.font = dat.g1();
        com.shadowed = dat.gbool();
    }

    if (com.type == 4) {
        com.text = dat.gjstr();
        com.activeText = dat.gjstr();
    }

    if (com.type == 1 || com.type == 3 || com.type == 4) {
        com.colour = dat.g4();
    }

    if (com.type == 3 || com.type == 4) {
        com.activeColour = dat.g4();
        com.overColour = dat.g4();
        // com.activeOverColour = dat.g4(); // 317
    }

    if (com.type == 5) {
        com.graphic = dat.gjstr();
        com.activeGraphic = dat.gjstr();
    }

    if (com.type == 6) {
        com.model = dat.g1();
        if (com.model != 0) {
            com.model = ((com.model - 1) << 8) + dat.g1();
        }

        com.activeModel = dat.g1();
        if (com.activeModel != 0) {
            com.activeModel = ((com.activeModel - 1) << 8) + dat.g1();
        }

        com.anim = dat.g1();
        if (com.anim == 0) {
            com.anim = -1;
        } else {
            com.anim = ((com.anim - 1) << 8) + dat.g1();
        }

        com.activeAnim = dat.g1();
        if (com.activeAnim == 0) {
            com.activeAnim = -1;
        } else {
            com.activeAnim = ((com.activeAnim - 1) << 8) + dat.g1();
        }

        com.zoom = dat.g2();
        com.xan = dat.g2();
        com.yan = dat.g2();
    }

    if (com.type == 7) {
        com.inventorySlotObjId = [];
        com.inventorySlotObjCount = [];

        com.center = dat.gbool();
        com.font = dat.g1();
        com.shadowed = dat.gbool();
        com.colour = dat.g4();
        com.marginX = dat.g2s();
        com.marginY = dat.g2s();
        com.interactable = dat.gbool();

        com.inventoryOptions = [];
        for (let i = 0; i < 5; i++) {
            com.inventoryOptions[i] = dat.gjstr();
        }
    }

    // 377
    // if (com.type === 8) {
    //     com.text = dat.gjstr();
    // }

    if (com.buttonType == 2 || com.type == 2) {
        com.actionVerb = dat.gjstr();
        com.action = dat.gjstr();
        com.actionTarget = dat.g2();
    }

    if (com.buttonType == 1 || com.buttonType == 4 || com.buttonType == 5 || com.buttonType == 6) {
        com.option = dat.gjstr();
    }

    interfaces[id] = com;
}

fs.writeFileSync('dump/pack/interface.order', order);

const packChildren: Record<number, number> = {};

// generate new names first
function generateNames(com: Component, rootIfName: string) {
    if (com.id !== com.rootLayer) {
        if (!pack[com.id] || pack[com.id] === 'null:null') {
            pack[com.id] = `${rootIfName}:com_${packChildren[com.rootLayer]++}`;
        }
    }

    if (com.childId) {
        for (let i = 0; i < com.childId.length; i++) {
            const childId = com.childId[i];
            const child = interfaces[childId];
            if (!child) {
                continue;
            }

            generateNames(child, rootIfName);
        }
    }
}

let ifId = 0;
for (let i = 0; i < interfaces.length; i++) {
    const com = interfaces[i];
    if (!com || com.id !== com.rootLayer) {
        // only want to iterate over root layers
        continue;
    }

    const name = `inter_${ifId++}`;
    if (!pack[com.id] || pack[com.id] === 'null:null') {
        pack[com.id] = name;
    }

    packChildren[com.id] = 0;
    generateNames(com, name);
}

let packStr = '';
for (let i = 0; i < pack.length; i++) {
    if (!pack[i]) {
        continue;
    }

    packStr += `${i}=${pack[i]}\n`;
}
fs.writeFileSync('dump/pack/interface.pack', packStr);

function statToName(stat: number) {
    switch (stat) {
        case 0:
            return 'attack';
        case 1:
            return 'defence';
        case 2:
            return 'strength';
        case 3:
            return 'hitpoints';
        case 4:
            return 'ranged';
        case 5:
            return 'prayer';
        case 6:
            return 'magic';
        case 7:
            return 'cooking';
        case 8:
            return 'woodcutting';
        case 9:
            return 'fletching';
        case 10:
            return 'fishing';
        case 11:
            return 'firemaking';
        case 12:
            return 'crafting';
        case 13:
            return 'smithing';
        case 14:
            return 'mining';
        case 15:
            return 'herblore';
        case 16:
            return 'agility';
        case 17:
            return 'thieving';
        case 20:
            return 'runecraft';
        default:
            return stat;
    }
}

// convert to com format
function convert(com: Component, x = 0, y = 0, lastCom = -1) {
    let str = '';

    if (com.id === com.rootLayer) {
        for (let i = 0; i < com.childId.length; i++) {
            if (i > 0) {
                str += '\n';
            }

            // TODO (jkm) is it safe to use `!` here?
            str += convert(interfaces[com.childId[i]]!, com.childX[i], com.childY[i]);
        }

        return str;
    }

    str += `[${pack[com.id].split(':')[1]}]\n`;

    if (lastCom !== -1) {
        str += `layer=${pack[lastCom].split(':')[1]}\n`;
    }

    switch (com.type) {
        case 0:
            str += 'type=layer\n';
            break;
        case 1:
            str += 'type=unused\n';
            break;
        case 2:
            str += 'type=inv\n';
            break;
        case 3:
            str += 'type=rect\n';
            break;
        case 4:
            str += 'type=text\n';
            break;
        case 5:
            str += 'type=graphic\n';
            break;
        case 6:
            str += 'type=model\n';
            break;
        case 7:
            str += 'type=invtext\n';
            break;
    }

    str += `x=${x}\n`;
    str += `y=${y}\n`;

    switch (com.buttonType) {
        case 1:
            str += 'buttontype=normal\n';
            break;
        case 2:
            str += 'buttontype=target\n';
            break;
        case 3:
            str += 'buttontype=close\n';
            break;
        case 4:
            str += 'buttontype=toggle\n';
            break;
        case 5:
            str += 'buttontype=select\n';
            break;
        case 6:
            str += 'buttontype=pause\n';
            break;
    }

    if (com.clientCode) {
        str += `clientcode=${com.clientCode}\n`;
    }

    if (com.width) {
        str += `width=${com.width}\n`;
    }

    if (com.height) {
        str += `height=${com.height}\n`;
    }

    if (com.overLayer !== -1) {
        str += `overlayer=${pack[com.overLayer].split(':')[1]}\n`;
    }

    if (com.scripts) {
        for (let i = 0; i < com.scripts.length; i++) {
            let opcount = 1;

            if (com.scripts[i].length === 1) {
                // empty script
                str += `script${i + 1}op1=\n`;
            }

            for (let j = 0; j < com.scripts[i].length - 1; j++) {
                str += `script${i + 1}op${opcount++}=`;

                switch (com.scripts[i][j]) {
                    case 1:
                        str += `stat_level,${statToName(com.scripts[i][++j])}`;
                        break;
                    case 2:
                        str += `stat_base_level,${statToName(com.scripts[i][++j])}`;
                        break;
                    case 3:
                        str += `stat_xp,${statToName(com.scripts[i][++j])}`;
                        break;
                    case 4: {
                        const obj = com.scripts[i][++j];
                        str += `inv_count,${pack[com.scripts[i][++j]]},${obj ?? 'obj_' + obj}`;
                        break;
                    }
                    case 5: {
                        const varp = com.scripts[i][++j];
                        str += `testvar,${varpPack[varp] ?? 'varp_' + varp}`;
                        break;
                    }
                    case 6:
                        str += `stat_xp_remaining,${statToName(com.scripts[i][++j])}`;
                        break;
                    case 7:
                        str += 'op7';
                        break;
                    case 8:
                        str += 'op8';
                        break;
                    case 9:
                        str += 'op9';
                        break;
                    case 10: {
                        const obj = com.scripts[i][++j];
                        str += `inv_contains,${pack[com.scripts[i][++j]]},${objPack[obj] ?? 'obj_' + obj}`;
                        break;
                    }
                    case 11:
                        str += 'runenergy';
                        break;
                    case 12:
                        str += 'runweight';
                        break;
                    case 13: {
                        const varp = com.scripts[i][++j];
                        str += `testbit,${varpPack[varp] ?? 'varp_' + varp},${com.scripts[i][++j]}`;
                        break;
                    }
                }

                str += '\n';
            }

            if (com.scriptComparator && com.scriptComparator[i]) {
                str += `script${i + 1}=`;
                switch (com.scriptComparator[i]) {
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

                str += `,${com.scriptOperand[i]}\n`;
            }
        }
    }

    if (com.type === 0) {
        if (com.scroll) {
            str += `scroll=${com.scroll}\n`;
        }

        if (com.hide) {
            str += 'hide=yes\n';
        }
    }

    if (com.type === 2) {
        if (com.draggable) {
            str += 'draggable=yes\n';
        }

        if (com.interactable) {
            str += 'interactable=yes\n';
        }

        if (com.usable) {
            str += 'usable=yes\n';
        }

        if (com.marginX || com.marginY) {
            str += `margin=${com.marginX},${com.marginY}\n`;
        }

        for (let i = 0; i < 20; i++) {
            if (typeof com.inventorySlotGraphic[i] !== 'undefined') {
                if (com.inventorySlotOffsetX[i] || com.inventorySlotOffsetY[i]) {
                    str += `slot${i + 1}=${com.inventorySlotGraphic[i]}:${com.inventorySlotOffsetX[i]},${com.inventorySlotOffsetY[i]}\n`;
                } else {
                    str += `slot${i + 1}=${com.inventorySlotGraphic[i]}\n`;
                }
            }
        }

        if (com.inventoryOptions) {
            for (let i = 0; i < com.inventoryOptions.length; i++) {
                if (com.inventoryOptions[i]) {
                    str += `option${i + 1}=${com.inventoryOptions[i]}\n`;
                }
            }
        }
    }

    if (com.type === 3) {
        if (com.fill) {
            str += 'fill=yes\n';
        }
    }

    if (com.type == 4 || com.type == 1) {
        if (com.center) {
            str += 'center=yes\n';
        }

        switch (com.font) {
            case 0:
                str += 'font=p11\n';
                break;
            case 1:
                str += 'font=p12\n';
                break;
            case 2:
                str += 'font=b12\n';
                break;
            case 3:
                str += 'font=q8\n';
                break;
        }

        if (com.shadowed) {
            str += 'shadowed=yes\n';
        }
    }

    if (com.type == 4) {
        if (com.text) {
            str += `text=${com.text}\n`;
        }

        if (com.activeText) {
            str += `activetext=${com.activeText}\n`;
        }
    }

    if (com.type == 1 || com.type == 3 || com.type == 4) {
        if (com.colour) {
            str += `colour=0x${com.colour.toString(16).toUpperCase().padStart(6, '0')}\n`;
        }
    }

    if (com.type == 3 || com.type == 4) {
        if (com.activeColour) {
            str += `activecolour=0x${com.activeColour.toString(16).toUpperCase().padStart(6, '0')}\n`;
        }

        if (com.overColour) {
            str += `overcolour=0x${com.overColour.toString(16).toUpperCase().padStart(6, '0')}\n`;
        }
    }

    if (com.type === 5) {
        if (com.graphic) {
            str += `graphic=${com.graphic}\n`;
        }

        if (com.activeGraphic) {
            str += `activegraphic=${com.activeGraphic}\n`;
        }
    }

    if (com.type === 6) {
        if (com.model) {
            str += `model=${modelPack[com.model]}\n`;
        }

        if (com.activeModel) {
            str += `activemodel=${modelPack[com.activeModel]}\n`;
        }

        if (com.anim !== -1) {
            str += `anim=${seqPack[com.anim]}\n`;
        }

        if (com.activeAnim !== -1) {
            str += `activeanim=${seqPack[com.activeAnim]}\n`;
        }

        if (com.zoom) {
            str += `zoom=${com.zoom}\n`;
        }

        if (com.xan) {
            str += `xan=${com.xan}\n`;
        }

        if (com.yan) {
            str += `yan=${com.yan}\n`;
        }
    }

    if (com.type === 7) {
        if (com.center) {
            str += 'center=yes\n';
        }

        switch (com.font) {
            case 0:
                str += 'font=p11\n';
                break;
            case 1:
                str += 'font=p12\n';
                break;
            case 2:
                str += 'font=b12\n';
                break;
            case 3:
                str += 'font=q8\n';
                break;
        }

        if (com.shadowed) {
            str += 'shadowed=yes\n';
        }

        str += `colour=0x${com.colour.toString(16).toUpperCase().padStart(6, '0')}\n`;

        if (com.marginX || com.marginY) {
            str += `margin=${com.marginX},${com.marginY}\n`;
        }

        if (com.interactable) {
            str += 'interactable=yes\n';
        }

        if (com.inventoryOptions) {
            for (let i = 0; i < com.inventoryOptions.length; i++) {
                if (com.inventoryOptions[i]) {
                    str += `option${i + 1}=${com.inventoryOptions[i]}\n`;
                }
            }
        }
    }

    if (com.buttonType == 2 || com.type == 2) {
        if (com.actionVerb) {
            str += `actionverb=${com.actionVerb}\n`;
        }

        if (com.actionTarget) {
            const target = [];
            if (com.actionTarget & 0x1) {
                target.push('obj');
            }
            if (com.actionTarget & 0x2) {
                target.push('npc');
            }
            if (com.actionTarget & 0x4) {
                target.push('loc');
            }
            if (com.actionTarget & 0x8) {
                target.push('player');
            }
            if (com.actionTarget & 0x10) {
                target.push('heldobj');
            }

            str += `actiontarget=${target.join(',')}\n`;
        }

        if (com.action) {
            str += `action=${com.action}\n`;
        }
    }

    if (com.buttonType == 1 || com.buttonType == 4 || com.buttonType == 5 || com.buttonType == 6) {
        if (com.option) {
            str += `option=${com.option}\n`;
        }
    }

    if (com.type === 0 && com.childId.length) {
        for (let i = 0; i < com.childId.length; i++) {
            str += '\n';

            // TODO (jkm) is it safe to use `!` here?
            str += convert(interfaces[com.childId[i]]!, com.childX[i], com.childY[i], com.id);
        }
    }

    return str;
}

fs.mkdirSync('dump/src/scripts/interfaces', { recursive: true });
for (let i = 0; i < interfaces.length; i++) {
    const com = interfaces[i];
    if (!com || com.id !== com.rootLayer) {
        // only want to iterate over root layers
        continue;
    }

    const name = pack[com.id];
    fs.writeFileSync(`dump/src/scripts/interfaces/${name}.if`, convert(com));
}
