import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { printError } from '#/util/Logger.js';
import { loadDir, loadOrder } from '#tools/pack/NameMap.js';
import { InterfacePack, ModelPack, ObjPack, SeqPack, VarbitPack, VarpPack } from '#tools/pack/PackFile.js';

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
        case 'push_varbit':
            return 14;
        case 'subtract':
            return 15;
        case 'divide':
            return 16;
        case 'multiply':
            return 17;
        case 'coordx':
            return 18;
        case 'coordz':
            return 19;
        case 'push_constant':
            return 20;
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
        case 'p11_full':
            return 0;
        case 'p12_full':
            return 1;
        case 'b12_full':
            return 2;
        case 'q8_full':
            return 3;
    }

    return -1;
}

type Component = {
    root: string | null;
    children: number[];
    src: Record<string, string | number>;
};

export function packInterface(modelFlags: number[]) {
    const component: Record<number, Component> = {};

    const interfaceOrder = loadOrder(`${Environment.build.srcDir}/pack/interface.order`);
    for (let i = 0; i < interfaceOrder.length; i++) {
        const id = interfaceOrder[i];

        component[id] = {
            root: null,
            children: [],
            src: {}
        };
    }

    loadDir(`${Environment.build.srcDir}/scripts`, '.if', (src, file) => {
        const ifName = file.replace('.if', '');
        const ifId = InterfacePack.getByName(ifName);

        if (!component[ifId]) {
            throw new Error(`Could not find name <-> ID for interface file, perhaps misnamed? ${ifName} ${ifId}`);
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
                    throw new Error(`Missing component ID ${ifName}:${comName} in ${Environment.build.srcDir}/pack/interface.order`);
                }

                component[comId].root = ifName;
                component[ifId].children.push(comId);
                continue;
            }

            const key = line.substring(0, line.indexOf('='));
            const value = line.substring(line.indexOf('=') + 1);

            if (key === 'layer') {
                const layerId = InterfacePack.getByName(`${ifName}:${value}`);
                if (layerId === -1) {
                    throw new Error(`ERROR: Layer ${ifName}:${value} does not exist`);
                }

                if (component[layerId].children.indexOf(comId) !== -1) {
                    throw new Error(`ERROR: Layer ${ifName}:${value} already has ${comName} as a child`);
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

    const client = Packet.alloc(5);
    const server = Packet.alloc(5);

    let lastRoot = null;
    client.p2(InterfacePack.max);
    server.p2(InterfacePack.max);
    for (let i = 0; i < interfaceOrder.length; i++) {
        const id = interfaceOrder[i];
        const com = component[id];
        const src = com.src;

        if (com.root === null || lastRoot !== com.root) {
            client.p2(-1);

            if (com.root) {
                client.p2(InterfacePack.getByName(com.root));
                lastRoot = com.root;
            } else {
                client.p2(id);
                lastRoot = InterfacePack.getById(id);
            }
        }

        client.p2(id);

        server.p2(id);
        server.pjstr(InterfacePack.getById(id));
        server.pbool(src.type === 'overlay');

        const comType = nameToType(src.type as string);
        client.p1(comType);

        const buttonType = nameToButtonType(src.buttontype as string);
        client.p1(buttonType);

        client.p2(parseInt(src.clientcode as string));
        client.p2(parseInt(src.width as string));
        client.p2(parseInt(src.height as string));

        if (src.trans) {
            client.p1(parseInt(src.trans as string));
        } else {
            client.p1(0);
        }

        if (src.overlayer) {
            const layerId = InterfacePack.getByName(`${com.root}:${src.overlayer}`);
            client.p2(layerId + 0x100);
        } else {
            client.p1(0);
        }

        let comparatorCount = 0;
        for (let j = 1; j <= 5; j++) {
            if (typeof src[`script${j}`] !== 'undefined') {
                comparatorCount++;
            }
        }

        client.p1(comparatorCount);
        for (let j = 1; j <= comparatorCount; j++) {
            const parts = (src[`script${j}`] as string).split(',');
            client.p1(nameToComparator(parts[0]));
            client.p2(parseInt(parts[1]));
        }

        let scriptCount = 0;
        for (let j = 1; j <= 5; j++) {
            if (typeof src[`script${j}op1`] !== 'undefined') {
                scriptCount++;
            }
        }

        client.p1(scriptCount);
        for (let j = 1; j <= scriptCount; j++) {
            let opCount = 0;
            for (let k = 1; k <= 20; k++) {
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
                        case 'push_varbit':
                            opCount += 1;
                            break;
                        case 'push_constant':
                            opCount += 1;
                            break;
                    }
                }
            }

            if (src[`script${j}op1`] === '') {
                // TODO: clean this up, stats:com_0 and 2 others in the same file use this code path
                client.p2(opCount);
            } else {
                client.p2(opCount + 1);
            }
            for (let k = 1; k <= opCount; k++) {
                const op = src[`script${j}op${k}`];

                if (op) {
                    const parts = (op as string).split(',');
                    client.p2(nameToScript(parts[0]));

                    switch (parts[0]) {
                        case 'stat_level':
                            client.p2(nameToStat(parts[1]));
                            break;
                        case 'stat_base_level':
                            client.p2(nameToStat(parts[1]));
                            break;
                        case 'stat_xp':
                            client.p2(nameToStat(parts[1]));
                            break;
                        case 'inv_count': {
                            const comLink = InterfacePack.getByName(parts[1]);
                            if (comLink === -1) {
                                printError(`${com.root} invalid lookup ${parts[1]}`);
                            }

                            const objLink = ObjPack.getByName(parts[2]);
                            if (objLink === -1) {
                                printError(`${com.root} invalid lookup ${parts[2]}`);
                            }

                            client.p2(comLink);
                            client.p2(objLink);
                            break;
                        }
                        case 'pushvar': {
                            const varpLink = VarpPack.getByName(parts[1]);
                            if (varpLink === -1) {
                                printError(`${com.root} invalid lookup ${parts[1]}`);
                            }

                            client.p2(varpLink);
                            break;
                        }
                        case 'stat_xp_remaining':
                            client.p2(nameToStat(parts[1]));
                            break;
                        case 'inv_contains': {
                            const comLink = InterfacePack.getByName(parts[1]);
                            if (comLink === -1) {
                                printError(`${com.root} invalid lookup ${parts[1]}`);
                            }

                            const objLink = ObjPack.getByName(parts[2]);
                            if (objLink === -1) {
                                printError(`${com.root} invalid lookup ${parts[2]}`);
                            }

                            client.p2(comLink);
                            client.p2(objLink);
                            break;
                        }
                        case 'testbit': {
                            const varpLink = VarpPack.getByName(parts[1]);
                            if (varpLink === -1) {
                                printError(`${com.root} invalid lookup ${parts[1]}`);
                            }

                            client.p2(varpLink);
                            client.p2(parseInt(parts[2]));
                            break;
                        }
                        case 'push_varbit': {
                            const varbitLink = VarbitPack.getByName(parts[1]);
                            if (varbitLink === -1) {
                                printError(`${com.root} invalid lookup ${parts[1]}`);
                            }

                            client.p2(varbitLink);
                            break;
                        }
                        case 'push_constant': {
                            client.p2(parseInt(parts[1]));
                            break;
                        }
                    }
                }
            }

            if (opCount) {
                client.p2(0);
            }
        }

        if (comType === 0) {
            client.p2(parseInt(src.scroll as string));
            client.pbool(src.hide === 'yes');

            client.p2(com.children.length);
            for (let j = 0; j < com.children.length; j++) {
                const childId = com.children[j];
                client.p2(childId);
                client.p2(parseInt(component[childId].src.x as string));
                client.p2(parseInt(component[childId].src.y as string));
            }
        }

        if (comType === 2) {
            client.pbool(src.draggable === 'yes');
            client.pbool(src.interactable === 'yes');
            client.pbool(src.usable === 'yes');
            client.pbool(src.swappable === 'yes');

            if (src.margin) {
                client.p1(parseInt((src.margin as string).split(',')[0]));
                client.p1(parseInt((src.margin as string).split(',')[1]));
            } else {
                client.p1(0);
                client.p1(0);
            }

            for (let j = 1; j <= 20; j++) {
                if (typeof src[`slot${j}`] !== 'undefined') {
                    client.pbool(true);

                    const parts = (src[`slot${j}`] as string).split(':');
                    const sprite = parts[0];

                    let x = '0';
                    let y = '0';
                    if (parts[1]) {
                        const offset = parts[1].split(',');
                        x = offset[0];
                        y = offset[1];
                    }

                    client.p2(parseInt(x));
                    client.p2(parseInt(y));
                    client.pjstr(sprite ?? '');
                } else {
                    client.pbool(false);
                }
            }

            for (let j = 1; j <= 5; j++) {
                client.pjstr((src[`option${j}`] as string) ?? '');
            }
        }

        if (comType === 3) {
            client.pbool(src.fill === 'yes');
        }

        if (comType === 4) {
            client.pbool(src.center === 'yes');
            client.p1(nameToFont(src.font as string));
            client.pbool(src.shadowed === 'yes');
            client.pjstr((src.text as string) ?? '');
            client.pjstr((src.activetext as string) ?? '');
        }

        if (comType === 3 || comType === 4) {
            client.p4(parseInt(src.colour as string));
            client.p4(parseInt(src.activecolour as string));
            client.p4(parseInt(src.overcolour as string));
            client.p4(parseInt(src.activeovercolour as string));
        }

        if (comType === 5) {
            client.pjstr((src.graphic as string) ?? '');
            client.pjstr((src.activegraphic as string) ?? '');
        }

        if (comType === 6) {
            if (src.model) {
                const modelId = ModelPack.getByName(src.model as string);
                if (modelId === -1) {
                    throw new Error(`\nError packing interfaces\n${com.root} Invalid model: ${src.model}`);
                }
                client.p2(modelId + 0x100);
                modelFlags[modelId] |= 0x2;
            } else {
                client.p1(0);
            }

            if (src.activemodel) {
                const modelId = ModelPack.getByName(src.activemodel as string);
                if (modelId === -1) {
                    throw new Error(`\nError packing interfaces\n${com.root} Invalid activemodel: ${src.activemodel}`);
                }
                client.p2(modelId + 0x100);
                modelFlags[modelId] |= 0x2;
            } else {
                client.p1(0);
            }

            if (src.anim) {
                const seqId = SeqPack.getByName(src.anim as string);
                if (seqId === -1) {
                    throw new Error(`\nError packing interfaces\n${com.root} Invalid anim: ${src.anim}`);
                }
                client.p2(seqId + 0x100);
            } else {
                client.p1(0);
            }

            if (src.activeanim) {
                const seqId = SeqPack.getByName(src.activeanim as string);
                if (seqId === -1) {
                    throw new Error(`\nError packing interfaces\n${com.root} Invalid activeanim: ${src.activeanim}`);
                }
                client.p2(seqId + 0x100);
            } else {
                client.p1(0);
            }

            client.p2(parseInt(src.zoom as string));
            client.p2(parseInt(src.xan as string));
            client.p2(parseInt(src.yan as string));
        }

        if (comType === 7) {
            client.pbool(src.center === 'yes');
            client.p1(nameToFont(src.font as string));
            client.pbool(src.shadowed === 'yes');
            client.p4(parseInt(src.colour as string));

            if (src.margin) {
                client.p2(parseInt((src.margin as string).split(',')[0]));
                client.p2(parseInt((src.margin as string).split(',')[1]));
            } else {
                client.p2(0);
                client.p2(0);
            }

            client.pbool(src.interactable === 'yes');

            for (let j = 1; j <= 5; j++) {
                client.pjstr((src[`option${j}`] as string) ?? '');
            }
        }

        if (buttonType === 2 || comType === 2) {
            client.pjstr((src.actionverb as string) ?? '');
            client.pjstr((src.action as string) ?? '');

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
            client.p2(flags);
        }

        if (buttonType === 1 || buttonType === 4 || buttonType === 5 || buttonType === 6) {
            client.pjstr((src.option as string) ?? '');
        }
    }

    return { client, server };
}
