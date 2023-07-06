import { loadDir, loadOrder, loadPack } from '#lostcity/tools/pack/NameMap.js';

let modelPack = loadPack('data/pack/model.pack');
let seqPack = loadPack('data/pack/seq.pack');
let varpPack = loadPack('data/pack/varp.pack');
let objPack = loadPack('data/pack/obj.pack');

let interfacePack = loadPack('data/pack/interface.pack');
let interfaceOrder = loadOrder('data/pack/interface.order');

// ----

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

// ----

export default class IfType {
    static configs = [];

    static {
        for (let i = 0; i < interfaceOrder.length; i++) {
            let id = interfaceOrder[i];

            IfType.configs[id] = {
                root: null,
                config: interfacePack[id],
                children: [],
                src: {},
            };
        }
    }

    static init() {
        // reading
        loadDir('data/src/scripts', '.if', (src, file) => {
            let ifName = file.replace('.if', '');
            let ifId = interfacePack.indexOf(ifName);

            IfType.configs[ifId].src['type'] = 'layer';
            IfType.configs[ifId].src['width'] = 512;
            IfType.configs[ifId].src['height'] = 334;

            let comId = -1;
            for (let i = 0; i < src.length; i++) {
                let line = src[i];
                if (line.startsWith('[')) {
                    let comName = line.substring(1, line.length - 1);
                    comId = interfacePack.indexOf(`${ifName}:${comName}`);
                    IfType.configs[comId].root = ifName;
                    IfType.configs[ifId].children.push(comId);
                    continue;
                }

                let key = line.substring(0, line.indexOf('='));
                let value = line.substring(line.indexOf('=') + 1);

                if (key === 'layer') {
                    let layerId = interfacePack.indexOf(`${ifName}:${value}`);
                    IfType.configs[layerId].children.push(comId);
                    IfType.configs[ifId].children.splice(IfType.configs[ifId].children.indexOf(comId), 1);
                }

                if (comId !== -1) {
                    IfType.configs[comId].src[key] = value;
                }
            }
        });
    }

    static get(id) {
        return IfType.configs[id];
    }

    static getId(name) {
        return interfacePack.indexOf(name);
    }

    static getByName(name) {
        let id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }
}

console.time('IfType.init()');
IfType.init();
console.timeEnd('IfType.init()');
