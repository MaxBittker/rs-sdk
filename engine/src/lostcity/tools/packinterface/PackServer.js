import Packet from '#jagex2/io/Packet.js';
import { loadDir, loadOrder, loadPack } from '#lostcity/util/NameMap.js';
import { shouldBuild } from '#lostcity/util/PackIds.js';

// binary formats
let modelPack = loadPack('data/pack/model.pack');

// config formats
let objPack = loadPack('data/pack/obj.pack');
let seqPack = loadPack('data/pack/seq.pack');
let varpPack = loadPack('data/pack/varp.pack');

let interfacePack = loadPack('data/pack/interface.pack');
let interfaceOrder = loadOrder('data/pack/interface.order');

function nameToType(name) {
    switch (name) {
        case 'layer':
            return 0;
        case 'inv':
            return 2;
        case 'rect':
            return 3;
        case 'text':
            return 4;
        case 'graphic':
            return 5;
        case 'model':
            return 6;
        case 'invtext':
            return 7;
    }

    return -1;
}

function nameToButtonType(name) {
    switch (name) {
        case 'normal':
            return 1;
        case 'target':
            return 2;
        case 'close':
            return 3;
        case 'toggle':
            return 4;
        case 'select':
            return 5;
        case 'pause':
            return 6;
    }

    return 0;
}

function nameToComparator(name) {
    switch (name) {
        case 'eq':
            return 1;
        case 'lt':
            return 2;
        case 'gt':
            return 3;
        case 'neq':
            return 4;
    }

    return 0;
}

function nameToScript(name) {
    switch (name) {
        case 'stat_level':
            return 1;
        case 'stat_base_level':
            return 2;
        case 'stat_xp':
            return 3;
        case 'inv_count':
            return 4;
        case 'testvar':
            return 5;
        case 'stat_xp_remaining':
            return 6;
        case 'op7':
            return 7;
        case 'op8':
            return 8;
        case 'op9':
            return 9;
        case 'inv_contains':
            return 10;
        case 'runenergy':
            return 11;
        case 'runweight':
            return 12;
        case 'testbit':
            return 13;
    }

    return 0;
}

function nameToStat(name) {
    switch (name) {
        case 'attack':
            return 0;
        case 'defence':
            return 1;
        case 'strength':
            return 2;
        case 'hitpoints':
            return 3;
        case 'ranged':
            return 4;
        case 'prayer':
            return 5;
        case 'magic':
            return 6;
        case 'cooking':
            return 7;
        case 'woodcutting':
            return 8;
        case 'fletching':
            return 9;
        case 'fishing':
            return 10;
        case 'firemaking':
            return 11;
        case 'crafting':
            return 12;
        case 'smithing':
            return 13;
        case 'mining':
            return 14;
        case 'herblore':
            return 15;
        case 'agility':
            return 16;
        case 'thieving':
            return 17;
        case 'runecraft':
            return 20;
    }

    return -1;
}

function nameToFont(name) {
    switch (name) {
        case 'p11':
            return 0;
        case 'p12':
            return 1;
        case 'b12':
            return 2;
        case 'q8':
            return 3;
    }

    return -1;
}

if (shouldBuild('data/src/scripts', '.if', 'data/pack/server/interface.dat')) {
    console.log('Packing interfaces');
    // console.time('Packing .if');
    let component = {};

    for (let i = 0; i < interfaceOrder.length; i++) {
        let id = interfaceOrder[i];

        component[id] = {
            root: null,
            children: [],
            src: {},
        };
    }

    loadDir('data/src/scripts', '.if', (src, file) => {
        let ifName = file.replace('.if', '');
        let ifId = interfacePack.indexOf(ifName);

        component[ifId].src['type'] = 'layer';
        component[ifId].src['width'] = 512;
        component[ifId].src['height'] = 334;

        let comId = -1;
        for (let i = 0; i < src.length; i++) {
            let line = src[i];
            if (line.startsWith('[')) {
                let comName = line.substring(1, line.length - 1);
                comId = interfacePack.indexOf(`${ifName}:${comName}`);
                component[comId].root = ifName;
                component[ifId].children.push(comId);
                continue;
            }

            let key = line.substring(0, line.indexOf('='));
            let value = line.substring(line.indexOf('=') + 1);

            if (key === 'layer') {
                let layerId = interfacePack.indexOf(`${ifName}:${value}`);
                component[layerId].children.push(comId);
                component[ifId].children.splice(component[ifId].children.indexOf(comId), 1);
            }

            if (comId !== -1) {
                component[comId].src[key] = value;
            }
        }
    });

    // ----

    let data = new Packet();

    let lastRoot = null;
    data.p2(interfacePack.length);
    for (let i = 0; i < interfaceOrder.length; i++) {
        let id = interfaceOrder[i];
        let com = component[id];
        let src = com.src;

        if (com.root === null || lastRoot !== com.root) {
            data.p2(-1);

            if (com.root) {
                data.p2(interfacePack.indexOf(com.root));
                lastRoot = com.root;
            } else {
                data.p2(id);
                lastRoot = interfacePack[id];
            }
        }

        data.p2(id);
        data.pjstr(interfacePack[id]);

        let type = nameToType(src.type);
        data.p1(type);

        let buttonType = nameToButtonType(src.buttontype);
        data.p1(buttonType);

        data.p2(parseInt(src.clientcode));
        data.p2(parseInt(src.width));
        data.p2(parseInt(src.height));

        if (src.overlayer) {
            let layerId = interfacePack.indexOf(`${com.root}:${src.overlayer}`);
            data.p2(layerId + 0x100);
        } else {
            data.p1(0);
        }

        let comparatorCount = 0;
        for (let j = 1; j <= 5; j++) {
            if (typeof src[`script${j}`] !== 'undefined') {
                comparatorCount++;
            }
        }

        data.p1(comparatorCount);
        for (let j = 1; j <= comparatorCount; j++) {
            let parts = src[`script${j}`].split(',');
            data.p1(nameToComparator(parts[0]));
            data.p2(parseInt(parts[1]));
        }

        let scriptCount = 0;
        for (let j = 1; j <= 5; j++) {
            if (typeof src[`script${j}op1`] !== 'undefined') {
                scriptCount++;
            }
        }

        data.p1(scriptCount);
        for (let j = 1; j <= scriptCount; j++) {
            let opCount = 0;
            for (let k = 0; k <= 5; k++) {
                let op = src[`script${j}op${k}`];

                if (typeof op !== 'undefined') {
                    opCount++;

                    let parts = op.split(',');
                    switch (parts[0]) {
                        case 'stat_level':
                            opCount += 1;
                            break;
                        case 'stat_base_level':
                            opCount += 1;
                            break;
                        case 'stat_xp':
                            opCount += 1;
                            break;
                        case 'inv_count':
                            opCount += 2;
                            break;
                        case 'testvar':
                            opCount += 1;
                            break;
                        case 'stat_xp_remaining':
                            opCount += 1;
                            break;
                        case 'inv_contains':
                            opCount += 2;
                            break;
                        case 'testbit':
                            opCount += 2;
                            break;
                    }
                }
            }

            if (src[`script${j}op1`] === '') {
                // TODO: clean this up, skills:com_0 and 2 others in the same file use this code path
                data.p2(opCount);
            } else {
                data.p2(opCount + 1);
            }
            for (let k = 0; k <= opCount; k++) {
                let op = src[`script${j}op${k}`];

                if (op) {
                    let parts = op.split(',');
                    data.p2(nameToScript(parts[0]));

                    switch (parts[0]) {
                        case 'stat_level':
                            data.p2(nameToStat(parts[1]));
                            break;
                        case 'stat_base_level':
                            data.p2(nameToStat(parts[1]));
                            break;
                        case 'stat_xp':
                            data.p2(nameToStat(parts[1]));
                            break;
                        case 'inv_count': {
                            let comLink = interfacePack.indexOf(parts[1]);
                            if (comLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            let objLink = objPack.indexOf(parts[2]);
                            if (objLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[2]}`);
                            }

                            data.p2(comLink);
                            data.p2(objLink);
                        } break;
                        case 'testvar': {
                            let varpLink = varpPack.indexOf(parts[1]);
                            if (varpLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            data.p2(varpLink);
                        } break;
                        case 'stat_xp_remaining':
                            data.p2(nameToStat(parts[1]));
                            break;
                        case 'inv_contains': {
                            let comLink = interfacePack.indexOf(parts[1]);
                            if (comLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            let objLink = objPack.indexOf(parts[2]);
                            if (objLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[2]}`);
                            }

                            data.p2(comLink);
                            data.p2(objLink);
                        } break;
                        case 'testbit': {
                            let varpLink = varpPack.indexOf(parts[1]);
                            if (varpLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            data.p2(varpLink);
                            data.p2(parseInt(parts[2]));
                        } break;
                    }
                }
            }

            if (opCount) {
                data.p2(0);
            }
        }

        if (type === 0) {
            data.p2(parseInt(src.scroll));
            data.pbool(src.hide === 'yes');

            data.p1(com.children.length);
            for (let j = 0; j < com.children.length; j++) {
                let childId = com.children[j];
                data.p2(childId);
                data.p2(parseInt(component[childId].src.x));
                data.p2(parseInt(component[childId].src.y));
            }
        }

        if (type === 2) {
            data.pbool(src.draggable === 'yes');
            data.pbool(src.interactable === 'yes');
            data.pbool(src.usable === 'yes');

            if (src.margin) {
                data.p1(parseInt(src.margin.split(',')[0]));
                data.p1(parseInt(src.margin.split(',')[1]));
            } else {
                data.p1(0);
                data.p1(0);
            }

            for (let j = 1; j <= 20; j++) {
                if (typeof src[`slot${j}`] !== 'undefined') {
                    data.pbool(true);

                    let parts = src[`slot${j}`].split(':');
                    let sprite = parts[0];

                    let x = 0;
                    let y = 0;
                    if (parts[1]) {
                        let offset = parts[1].split(',');
                        x = offset[0];
                        y = offset[1];
                    }

                    data.p2(parseInt(x));
                    data.p2(parseInt(y));
                    data.pjstr(sprite ?? '');
                } else {
                    data.pbool(false);
                }
            }

            for (let j = 1; j <= 5; j++) {
                data.pjstr(src[`option${j}`] ?? '');
            }
        }

        if (type === 3) {
            data.pbool(src.fill === 'yes');
        }

        if (type === 4) {
            data.pbool(src.center === 'yes');
            data.p1(nameToFont(src.font));
            data.pbool(src.shadowed === 'yes');
            data.pjstr(src.text ?? '');
            data.pjstr(src.activetext ?? '');
        }

        if (type === 3 || type === 4) {
            data.p4(parseInt(src.colour));
            data.p4(parseInt(src.activecolour));
            data.p4(parseInt(src.overcolour));
        }

        if (type === 5) {
            data.pjstr(src.graphic ?? '');
            data.pjstr(src.activegraphic ?? '');
        }

        if (type === 6) {
            if (src.model) {
                let modelId = modelPack.indexOf(src.model);
                if (modelId === -1) {
                    console.error('\nError packing interfaces');
                    console.error(com.root, 'Invalid model:', src.model);
                    process.exit(1);
                }
                data.p2(modelId + 0x100);
            } else {
                data.p1(0);
            }
    
            if (src.activemodel) {
                let modelId = modelPack.indexOf(src.activemodel);
                if (modelId === -1) {
                    console.error('\nError packing interfaces');
                    console.error(com.root, 'Invalid activemodel:', src.model);
                    process.exit(1);
                }
                data.p2(modelId + 0x100);
            } else {
                data.p1(0);
            }
    
            if (src.anim) {
                let seqId = seqPack.indexOf(src.anim);
                if (seqId === -1) {
                    console.error('\nError packing interfaces');
                    console.error(com.root, 'Invalid anim:', src.seqId);
                    process.exit(1);
                }
                data.p2(seqId + 0x100);
            } else {
                data.p1(0);
            }
    
            if (src.activeanim) {
                let seqId = seqPack.indexOf(src.activeanim);
                if (seqId === -1) {
                    console.error('\nError packing interfaces');
                    console.error(com.root, 'Invalid activeanim:', src.seqId);
                    process.exit(1);
                }
                data.p2(seqId + 0x100);
            } else {
                data.p1(0);
            }

            data.p2(parseInt(src.zoom));
            data.p2(parseInt(src.xan));
            data.p2(parseInt(src.yan));
        }

        if (type === 7) {
            data.pbool(src.center === 'yes');
            data.p1(nameToFont(src.font));
            data.pbool(src.shadowed === 'yes');
            data.p4(parseInt(src.colour));

            if (src.margin) {
                data.p2(parseInt(src.margin.split(',')[0]));
                data.p2(parseInt(src.margin.split(',')[1]));
            } else {
                data.p2(0);
                data.p2(0);
            }

            data.pbool(src.interactable === 'yes');

            for (let j = 1; j <= 5; j++) {
                data.pjstr(src[`option${j}`] ?? '');
            }
        }

        if (buttonType === 2 || type === 2) {
            data.pjstr(src.actionverb ?? '');
            data.pjstr(src.action ?? '');

            let flags = 0;
            if (src.actiontarget) {
                let target = src.actiontarget.split(',');
                if (target.indexOf('obj') !== -1) {
                    flags |= 0x1;
                }
                if (target.indexOf('npc') !== -1) {
                    flags |= 0x2;
                }
                if (target.indexOf('loc') !== -1) {
                    flags |= 0x4;
                }
                if (target.indexOf('player') !== -1) {
                    flags |= 0x8;
                }
                if (target.indexOf('heldobj') !== -1) {
                    flags |= 0x10;
                }
            }
            data.p2(flags);
        }

        if (buttonType === 1 || buttonType === 4 || buttonType === 5 || buttonType === 6) {
            data.pjstr(src.option ?? '');
        }
    }

    data.save('data/pack/server/interface.dat');
    // no idx
    // console.timeEnd('Packing .if');
}
