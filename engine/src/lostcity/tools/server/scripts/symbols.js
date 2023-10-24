import fs from 'fs';
import {loadDir, loadPack} from '#lostcity/util/NameMap.js';
import {crawlConfigNames, regenPack} from '#lostcity/util/PackIds.js';
import ParamType from '#lostcity/cache/ParamType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';
import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import VarNpcType from '#lostcity/cache/VarNpcType.js';

fs.writeFileSync('data/pack/script.pack', regenPack(loadPack('data/pack/script.pack'), crawlConfigNames('.rs2', true)));

// ----

fs.mkdirSync('data/symbols', {recursive: true});

let constants = {};
loadDir('data/src/scripts', '.constant', (src) => {
    for (let i = 0; i < src.length; i++) {
        let parts = src[i].split('=');
        let name = parts[0].trim();
        let value = parts[1].trim();

        if (name.startsWith('^')) {
            name = name.substring(1);
        }

        constants[name] = value;
    }
});
let constantSymbols = '';
for (let name in constants) {
    constantSymbols += `${name}\t${constants[name]}\n`;
}
fs.writeFileSync('data/symbols/constant.tsv', constantSymbols);

let npcSymbols = '';
let npcs = loadPack('data/pack/npc.pack');
for (let i = 0; i < npcs.length; i++) {
    npcSymbols += `${i}\t${npcs[i]}\n`;
}
fs.writeFileSync('data/symbols/npc.tsv', npcSymbols);

let objSymbols = '';
let objs = loadPack('data/pack/obj.pack');
for (let i = 0; i < objs.length; i++) {
    objSymbols += `${i}\t${objs[i]}\n`;
}
fs.writeFileSync('data/symbols/obj.tsv', objSymbols);

let invSymbols = '';
let invs = loadPack('data/pack/inv.pack');
for (let i = 0; i < invs.length; i++) {
    if (!invs[i]) {
        continue;
    }

    invSymbols += `${i}\t${invs[i]}\n`;
}
fs.writeFileSync('data/symbols/inv.tsv', invSymbols);

let seqSymbols = '';
let seqs = loadPack('data/pack/seq.pack');
for (let i = 0; i < seqs.length; i++) {
    if (!seqs[i]) {
        continue;
    }

    seqSymbols += `${i}\t${seqs[i]}\n`;
}
fs.writeFileSync('data/symbols/seq.tsv', seqSymbols);

let spotanimSymbols = '';
let spotanims = loadPack('data/pack/spotanim.pack');
for (let i = 0; i < spotanims.length; i++) {
    if (!spotanims[i]) {
        continue;
    }

    spotanimSymbols += `${i}\t${spotanims[i]}\n`;
}
fs.writeFileSync('data/symbols/spotanim.tsv', spotanimSymbols);

let locSymbols = '';
let locs = loadPack('data/pack/loc.pack');
for (let i = 0; i < locs.length; i++) {
    if (!locs[i]) {
        continue;
    }

    locSymbols += `${i}\t${locs[i]}\n`;
}
fs.writeFileSync('data/symbols/loc.tsv', locSymbols);

let comSymbols = '';
let interfaceSymbols = '';
let coms = loadPack('data/pack/interface.pack');
for (let i = 0; i < coms.length; i++) {
    if (!coms[i] || coms[i] === 'null:null') {
        continue;
    }

    if (coms[i].indexOf(':') !== -1) {
        comSymbols += `${i}\t${coms[i]}\n`;
    } else {
        interfaceSymbols += `${i}\t${coms[i]}\n`;
    }
}
fs.writeFileSync('data/symbols/component.tsv', comSymbols);
fs.writeFileSync('data/symbols/interface.tsv', interfaceSymbols);

VarPlayerType.load('data/pack/server');
let varpSymbols = '';
let varps = loadPack('data/pack/varp.pack');
for (let i = 0; i < varps.length; i++) {
    if (!varps[i]) {
        continue;
    }

    let varp = VarPlayerType.get(i);
    varpSymbols += `${i}\t${varps[i]}\t${ScriptVarType.getType(varp.type)}\n`;
}
fs.writeFileSync('data/symbols/varp.tsv', varpSymbols);

VarNpcType.load('data/pack/server');
let varnSymbols = '';
let varns = loadPack('data/pack/varn.pack');
for (let i = 0; i < varns.length; i++) {
    if (!varns[i]) {
        continue;
    }

    let varn = VarNpcType.get(i);
    varnSymbols += `${i}\t${varns[i]}\t${ScriptVarType.getType(varn.type)}\n`;
}
fs.writeFileSync('data/symbols/varn.tsv', varnSymbols);

console.time('Loading param.dat');
ParamType.load('data/pack/server');
console.timeEnd('Loading param.dat');

let paramSymbols = '';
let params = loadPack('data/pack/param.pack');
for (let i = 0; i < params.length; i++) {
    if (!params[i]) {
        continue;
    }

    let config = ParamType.get(i);
    paramSymbols += `${i}\t${params[i]}\t${config.getType()}\n`;
}
fs.writeFileSync('data/symbols/param.tsv', paramSymbols);

let structSymbols = '';
let structs = loadPack('data/pack/struct.pack');
for (let i = 0; i < structs.length; i++) {
    structSymbols += `${i}\t${structs[i]}\n`;
}
fs.writeFileSync('data/symbols/struct.tsv', structSymbols);

let enumSymbols = '';
let enums = loadPack('data/pack/enum.pack');
for (let i = 0; i < enums.length; i++) {
    enumSymbols += `${i}\t${enums[i]}\n`;
}
fs.writeFileSync('data/symbols/enum.tsv', enumSymbols);

let huntSymbols = '';
let hunts = loadPack('data/pack/hunt.pack');
for (let i = 0; i < hunts.length; i++) {
    huntSymbols += `${i}\t${hunts[i]}\n`;
}
fs.writeFileSync('data/symbols/hunt.tsv', huntSymbols);

let mesanimSymbols = '';
let mesanims = loadPack('data/pack/mesanim.pack');
for (let i = 0; i < mesanims.length; i++) {
    mesanimSymbols += `${i}\t${mesanims[i]}\n`;
}
fs.writeFileSync('data/symbols/mesanim.tsv', mesanimSymbols);

let synthSymbols = '';
let synths = loadPack('data/pack/sound.pack');
for (let i = 0; i < synths.length; i++) {
    synthSymbols += `${i}\t${synths[i]}\n`;
}
fs.writeFileSync('data/symbols/synth.tsv', synthSymbols);

let categorySymbols = '';
let categories = loadPack('data/pack/category.pack');
for (let i = 0; i < categories.length; i++) {
    if (!categories[i]) {
        continue;
    }

    categorySymbols += `${i}\t${categories[i]}\n`;
}
fs.writeFileSync('data/symbols/category.tsv', categorySymbols);

let scriptSymbols = '';
let scripts = loadPack('data/pack/script.pack');
for (let i = 0; i < scripts.length; i++) {
    if (!scripts[i]) {
        continue;
    }

    scriptSymbols += `${i}\t${scripts[i]}\n`;
}
fs.writeFileSync('data/symbols/runescript.tsv', scriptSymbols);

let commandSymbols = '';
let commands = Object.entries(ScriptOpcode);
for (let i = 0; i < commands.length; i++) {
    commandSymbols += `${commands[i][1]}\t${commands[i][0].toLowerCase()}\n`;
}
fs.writeFileSync('data/symbols/commands.tsv', commandSymbols);

DbTableType.load('data/pack/server');

let dbTableSymbols = '';
let dbColumnSymbols = '';
let dbtables = loadPack('data/pack/dbtable.pack');
for (let i = 0; i < dbtables.length; i++) {
    if (!dbtables[i]) {
        continue;
    }

    dbTableSymbols += `${i}\t${dbtables[i]}\n`;

    let table = DbTableType.get(i);
    for (let j = 0; j < table.columnNames.length; j++) {
        let columnIndex = (table.id << 12) | (j << 4);
        let types = table.types[j].map(t => ScriptVarType.getType(t)).join(',');

        dbColumnSymbols += `${columnIndex}\t${table.debugname}:${table.columnNames[j]}\t${types}\n`;
    }
}
fs.writeFileSync('data/symbols/dbtable.tsv', dbTableSymbols);
fs.writeFileSync('data/symbols/dbcolumn.tsv', dbColumnSymbols);

let dbRowSymbols = '';
let dbrows = loadPack('data/pack/dbrow.pack');
for (let i = 0; i < dbrows.length; i++) {
    if (!dbrows[i]) {
        continue;
    }

    dbRowSymbols += `${i}\t${dbrows[i]}\n`;
}
fs.writeFileSync('data/symbols/dbrow.tsv', dbRowSymbols);

let stats = [
    'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer',
    'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking',
    'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving',
    'stat18', 'stat19', 'runecraft'
];

fs.writeFileSync('data/symbols/stat.tsv', stats.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

let npcStats = ['hitpoints', 'attack', 'strength', 'defence', 'magic', 'ranged'];

fs.writeFileSync('data/symbols/npc_stat.tsv', npcStats.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

let locshapes = [
    'wall_straight',
    'wall_diagonalcorner',
    'wall_l',
    'wall_squarecorner',
    'walldecor_straight_nooffset',
    'walldecor_straight_offset',
    'walldecor_diagonal_offset',
    'walldecor_diagonal_nooffset',
    'walldecor_diagonal_both',
    'wall_diagonal',
    'centrepiece_straight',
    'centrepiece_diagonal',
    'roof_straight',
    'roof_diagonal_with_roofedge',
    'roof_diagonal',
    'roof_l_concave',
    'roof_l_convex',
    'roof_flat',
    'roofedge_straight',
    'roofedge_diagonalcorner',
    'roofedge_l',
    'roofedge_squarecorner',
    'grounddecor',
];

fs.writeFileSync('data/symbols/locshape.tsv', locshapes.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

let fonts = ['p11', 'p12', 'b12', 'q8'];
fs.writeFileSync('data/symbols/fontmetrics.tsv', fonts.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

let npcmodes = [
    '-1\tnone',
    '0\twander',
    '1\tpatrol',
    '2\tplayerescape',
    '3\tplayerfollow',
    '4\tplayerface',
    '5\tplayerfaceclose',
    '6\topplayer1',
    '7\topplayer2',
    '8\topplayer3',
    '9\topplayer4',
    '10\topplayer5',
    '11\tapplayer1',
    '12\tapplayer2',
    '13\tapplayer3',
    '14\tapplayer4',
    '15\tapplayer5',
    '16\toploc1',
    '17\toploc2',
    '18\toploc3',
    '19\toploc4',
    '20\toploc5',
    '21\taploc1',
    '22\taploc2',
    '23\taploc3',
    '24\taploc4',
    '25\taploc5',
    '26\topobj1',
    '27\topobj2',
    '28\topobj3',
    '29\topobj4',
    '30\topobj5',
    '31\tapobj1',
    '32\tapobj2',
    '33\tapobj3',
    '34\tapobj4',
    '35\tapobj5',
    '36\topnpc1',
    '37\topnpc2',
    '38\topnpc3',
    '39\topnpc4',
    '40\topnpc5',
    '41\tapnpc1',
    '42\tapnpc2',
    '43\tapnpc3',
    '44\tapnpc4',
    '45\tapnpc5',
];
fs.writeFileSync('data/symbols/npc_mode.tsv', npcmodes.join('\n') + '\n');

// ----

if (fs.existsSync('data/pack/server/scripts')) {
    fs.readdirSync('data/pack/server/scripts').forEach(file => {
        fs.unlinkSync(`data/pack/server/scripts/${file}`);
    });
}
