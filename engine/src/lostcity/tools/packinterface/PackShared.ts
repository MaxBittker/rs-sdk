import Packet from '#jagex2/io/Packet.js';
import { loadDir, loadOrder } from '#lostcity/util/NameMap.js';
import { InterfacePack, ModelPack, ObjPack, SeqPack, VarpPack } from '#lostcity/util/PackFile.js';

function nameToType(name: string) {
    switch (name) {
        case 'layer':
        case 'overlay':
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

function nameToButtonType(name: string) {
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

function nameToComparator(name: string) {
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

function nameToScript(name: string) {
    switch (name) {
        case 'stat_level':
            return 1;
        case 'stat_base_level':
            return 2;
        case 'stat_xp':
            return 3;
        case 'inv_count':
            return 4;
        case 'pushvar':
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

function nameToStat(name: string) {
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

function nameToFont(name: string) {
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

type Component = {
    root: string | null;
    children: number[];
    src: Record<string, string | number>;
};

export function packInterface(server: boolean) {
    // console.time('Packing .if');

    const component: Record<number, Component> = {};

    const interfaceOrder = loadOrder('data/src/pack/interface.order');
    for (let i = 0; i < interfaceOrder.length; i++) {
        const id = interfaceOrder[i];

        component[id] = {
            root: null,
            children: [],
            src: {}
        };
    }

    loadDir('data/src/scripts', '.if', (src, file) => {
        const ifName = file.replace('.if', '');
        const ifId = InterfacePack.getByName(ifName);

        if (!component[ifId]) {
            console.error('Could not find name <-> ID for interface file, perhaps misnamed?', ifName, ifId);
            process.exit(1);
        }

        component[ifId].src['type'] = 'layer';
        component[ifId].src['width'] = 512;
        component[ifId].src['height'] = 334;

        let comName = '';
        let comId = -1;
        for (let i = 0; i < src.length; i++) {
            const line = src[i];
            if (line.startsWith('[')) {
                comName = line.substring(1, line.length - 1);
                comId = InterfacePack.getByName(`${ifName}:${comName}`);
                if (comId === -1 || typeof component[comId] === 'undefined') {
                    console.error(`Missing component ID ${ifName}:${comName} in data/src/pack/interface.pack`);
                    process.exit(1);
                }

                component[comId].root = ifName;
                component[ifId].children.push(comId);
                continue;
            }

            const key = line.substring(0, line.indexOf('='));
            const value = line.substring(line.indexOf('=') + 1);

            if (key === 'layer') {
                const layerId = InterfacePack.getByName(`${ifName}:${value}`);

                if (component[layerId].children.indexOf(comId) !== -1) {
                    console.error(`ERROR: Layer ${ifName}:${value} already has ${comName} as a child`);
                    process.exit(1);
                }

                component[layerId].children.push(comId);
                component[ifId].children.splice(component[ifId].children.indexOf(comId), 1);
            }

            if (comId !== -1) {
                component[comId].src[key] = value;
            } else {
                component[ifId].src[key] = value;
            }
        }
    });

    // ----

    const data = Packet.alloc(4);

    let lastRoot = null;
    data.p2(InterfacePack.size);
    for (let i = 0; i < interfaceOrder.length; i++) {
        const id = interfaceOrder[i];
        const com = component[id];
        const src = com.src;

        if (com.root === null || lastRoot !== com.root) {
            data.p2(-1);

            if (com.root) {
                data.p2(InterfacePack.getByName(com.root));
                lastRoot = com.root;
            } else {
                data.p2(id);
                lastRoot = InterfacePack.getById(id);
            }
        }

        data.p2(id);

        if (server) {
            data.pjstr(InterfacePack.getById(id));
            data.pbool(src.type === 'overlay');
        }

        const type = nameToType(src.type as string);
        data.p1(type);

        const buttonType = nameToButtonType(src.buttontype as string);
        data.p1(buttonType);

        data.p2(parseInt(src.clientcode as string));
        data.p2(parseInt(src.width as string));
        data.p2(parseInt(src.height as string));

        if (src.overlayer) {
            const layerId = InterfacePack.getByName(`${com.root}:${src.overlayer}`);
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
            const parts = (src[`script${j}`] as string).split(',');
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
                const op = src[`script${j}op${k}`];

                if (typeof op !== 'undefined') {
                    opCount++;

                    const parts = (op as string).split(',');
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
                        case 'pushvar':
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
                // TODO: clean this up, stats:com_0 and 2 others in the same file use this code path
                data.p2(opCount);
            } else {
                data.p2(opCount + 1);
            }
            for (let k = 0; k <= opCount; k++) {
                const op = src[`script${j}op${k}`];

                if (op) {
                    const parts = (op as string).split(',');
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
                            const comLink = InterfacePack.getByName(parts[1]);
                            if (comLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            const objLink = ObjPack.getByName(parts[2]);
                            if (objLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[2]}`);
                            }

                            data.p2(comLink);
                            data.p2(objLink);
                            break;
                        }
                        case 'pushvar': {
                            const varpLink = VarpPack.getByName(parts[1]);
                            if (varpLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            data.p2(varpLink);
                            break;
                        }
                        case 'stat_xp_remaining':
                            data.p2(nameToStat(parts[1]));
                            break;
                        case 'inv_contains': {
                            const comLink = InterfacePack.getByName(parts[1]);
                            if (comLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            const objLink = ObjPack.getByName(parts[2]);
                            if (objLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[2]}`);
                            }

                            data.p2(comLink);
                            data.p2(objLink);
                            break;
                        }
                        case 'testbit': {
                            const varpLink = VarpPack.getByName(parts[1]);
                            if (varpLink === -1) {
                                console.log(`ERROR: ${com.root} invalid lookup ${parts[1]}`);
                            }

                            data.p2(varpLink);
                            data.p2(parseInt(parts[2]));
                            break;
                        }
                    }
                }
            }

            if (opCount) {
                data.p2(0);
            }
        }

        if (type === 0) {
            data.p2(parseInt(src.scroll as string));
            data.pbool(src.hide === 'yes');

            data.p1(com.children.length);
            for (let j = 0; j < com.children.length; j++) {
                const childId = com.children[j];
                data.p2(childId);
                data.p2(parseInt(component[childId].src.x as string));
                data.p2(parseInt(component[childId].src.y as string));
            }
        }

        if (type === 2) {
            data.pbool(src.draggable === 'yes');
            data.pbool(src.interactable === 'yes');
            data.pbool(src.usable === 'yes');

            if (src.margin) {
                data.p1(parseInt((src.margin as string).split(',')[0]));
                data.p1(parseInt((src.margin as string).split(',')[1]));
            } else {
                data.p1(0);
                data.p1(0);
            }

            for (let j = 1; j <= 20; j++) {
                if (typeof src[`slot${j}`] !== 'undefined') {
                    data.pbool(true);

                    const parts = (src[`slot${j}`] as string).split(':');
                    const sprite = parts[0];

                    let x = '0';
                    let y = '0';
                    if (parts[1]) {
                        const offset = parts[1].split(',');
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
                data.pjstr((src[`option${j}`] as string) ?? '');
            }
        }

        if (type === 3) {
            data.pbool(src.fill === 'yes');
        }

        if (type === 4) {
            data.pbool(src.center === 'yes');
            data.p1(nameToFont(src.font as string));
            data.pbool(src.shadowed === 'yes');
            data.pjstr((src.text as string) ?? '');
            data.pjstr((src.activetext as string) ?? '');
        }

        if (type === 3 || type === 4) {
            data.p4(parseInt(src.colour as string));
            data.p4(parseInt(src.activecolour as string));
            data.p4(parseInt(src.overcolour as string));
        }

        if (type === 5) {
            data.pjstr((src.graphic as string) ?? '');
            data.pjstr((src.activegraphic as string) ?? '');
        }

        if (type === 6) {
            if (src.model) {
                const modelId = ModelPack.getByName(src.model as string);
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
                const modelId = ModelPack.getByName(src.activemodel as string);
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
                const seqId = SeqPack.getByName(src.anim as string);
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
                const seqId = SeqPack.getByName(src.activeanim as string);
                if (seqId === -1) {
                    console.error('\nError packing interfaces');
                    console.error(com.root, 'Invalid activeanim:', src.seqId);
                    process.exit(1);
                }
                data.p2(seqId + 0x100);
            } else {
                data.p1(0);
            }

            data.p2(parseInt(src.zoom as string));
            data.p2(parseInt(src.xan as string));
            data.p2(parseInt(src.yan as string));
        }

        if (type === 7) {
            data.pbool(src.center === 'yes');
            data.p1(nameToFont(src.font as string));
            data.pbool(src.shadowed === 'yes');
            data.p4(parseInt(src.colour as string));

            if (src.margin) {
                data.p2(parseInt((src.margin as string).split(',')[0]));
                data.p2(parseInt((src.margin as string).split(',')[1]));
            } else {
                data.p2(0);
                data.p2(0);
            }

            data.pbool(src.interactable === 'yes');

            for (let j = 1; j <= 5; j++) {
                data.pjstr((src[`option${j}`] as string) ?? '');
            }
        }

        if (buttonType === 2 || type === 2) {
            data.pjstr((src.actionverb as string) ?? '');
            data.pjstr((src.action as string) ?? '');

            let flags = 0;
            if (src.actiontarget) {
                const target = (src.actiontarget as string).split(',');
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
            data.pjstr((src.option as string) ?? '');
        }
    }
    // console.timeEnd('Packing .if');

    return data;
}
