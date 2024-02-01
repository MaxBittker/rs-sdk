import fs from 'fs';
import { loadDir, loadPack } from '#lostcity/util/NameMap.js';
import { crawlConfigNames, regenPack } from '#lostcity/util/PackIds.js';
import ParamType from '#lostcity/cache/ParamType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';
import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';
import VarNpcType from '#lostcity/cache/VarNpcType.js';
import VarSharedType from '#lostcity/cache/VarSharedType.js';
import ScriptOpcodePointers from '#lostcity/engine/script/ScriptOpcodePointers.js';
import IfType from '#lostcity/cache/IfType.js';

fs.writeFileSync('data/pack/script.pack', regenPack(loadPack('data/pack/script.pack'), crawlConfigNames('.rs2', true)));

// ----

fs.mkdirSync('data/symbols', { recursive: true });

const constants: Record<string, string> = {};
loadDir('data/src/scripts', '.constant', src => {
    for (let i = 0; i < src.length; i++) {
        if (!src[i] || src[i].startsWith('//')) {
            continue;
        }

        const parts = src[i].split('=');
        let name = parts[0].trim();
        const value = parts[1].trim();

        if (name.startsWith('^')) {
            name = name.substring(1);
        }

        constants[name] = value;
    }
});
let constantSymbols = '';
for (const name in constants) {
    constantSymbols += `${name}\t${constants[name]}\n`;
}
fs.writeFileSync('data/symbols/constant.tsv', constantSymbols);

let npcSymbols = '';
const npcs = loadPack('data/pack/npc.pack');
for (let i = 0; i < npcs.length; i++) {
    npcSymbols += `${i}\t${npcs[i]}\n`;
}
fs.writeFileSync('data/symbols/npc.tsv', npcSymbols);

let objSymbols = '';
const objs = loadPack('data/pack/obj.pack');
for (let i = 0; i < objs.length; i++) {
    objSymbols += `${i}\t${objs[i]}\n`;
}
fs.writeFileSync('data/symbols/obj.tsv', objSymbols);

let invSymbols = '';
const invs = loadPack('data/pack/inv.pack');
for (let i = 0; i < invs.length; i++) {
    if (!invs[i]) {
        continue;
    }

    invSymbols += `${i}\t${invs[i]}\n`;
}
fs.writeFileSync('data/symbols/inv.tsv', invSymbols);

let seqSymbols = '';
const seqs = loadPack('data/pack/seq.pack');
for (let i = 0; i < seqs.length; i++) {
    if (!seqs[i]) {
        continue;
    }

    seqSymbols += `${i}\t${seqs[i]}\n`;
}
fs.writeFileSync('data/symbols/seq.tsv', seqSymbols);

let spotanimSymbols = '';
const spotanims = loadPack('data/pack/spotanim.pack');
for (let i = 0; i < spotanims.length; i++) {
    if (!spotanims[i]) {
        continue;
    }

    spotanimSymbols += `${i}\t${spotanims[i]}\n`;
}
fs.writeFileSync('data/symbols/spotanim.tsv', spotanimSymbols);

let locSymbols = '';
const locs = loadPack('data/pack/loc.pack');
for (let i = 0; i < locs.length; i++) {
    if (!locs[i]) {
        continue;
    }

    locSymbols += `${i}\t${locs[i]}\n`;
}
fs.writeFileSync('data/symbols/loc.tsv', locSymbols);

IfType.load('data/pack/server');
let comSymbols = '';
let interfaceSymbols = '';
let overlaySymbols = '';
const coms = loadPack('data/pack/interface.pack');
for (let i = 0; i < coms.length; i++) {
    if (!coms[i] || coms[i] === 'null:null') {
        continue;
    }

    const com = IfType.get(i);
    if (coms[i].indexOf(':') !== -1) {
        comSymbols += `${i}\t${coms[i]}\n`;
    } else if (com.overlay) {
        overlaySymbols += `${i}\t${coms[i]}\n`;
    } else {
        interfaceSymbols += `${i}\t${coms[i]}\n`;
    }

    // temporary: until compiler updates
    if (com.overlay) {
        interfaceSymbols += `${i}\t${coms[i]}\n`;
    }
}
fs.writeFileSync('data/symbols/component.tsv', comSymbols);
fs.writeFileSync('data/symbols/interface.tsv', interfaceSymbols);
fs.writeFileSync('data/symbols/overlayinterface.tsv', overlaySymbols);

VarPlayerType.load('data/pack/server');
let varpSymbols = '';
const varps = loadPack('data/pack/varp.pack');
for (let i = 0; i < varps.length; i++) {
    if (!varps[i]) {
        continue;
    }

    const varp = VarPlayerType.get(i);
    varpSymbols += `${i}\t${varps[i]}\t${ScriptVarType.getType(varp.type)}\n`;
}
fs.writeFileSync('data/symbols/varp.tsv', varpSymbols);

VarNpcType.load('data/pack/server');
let varnSymbols = '';
const varns = loadPack('data/pack/varn.pack');
for (let i = 0; i < varns.length; i++) {
    if (!varns[i]) {
        continue;
    }

    const varn = VarNpcType.get(i);
    varnSymbols += `${i}\t${varns[i]}\t${ScriptVarType.getType(varn.type)}\n`;
}
fs.writeFileSync('data/symbols/varn.tsv', varnSymbols);

VarSharedType.load('data/pack/server');
let varsSymbols = '';
const varss = loadPack('data/pack/vars.pack');
for (let i = 0; i < varss.length; i++) {
    if (!varss[i]) {
        continue;
    }

    const vars = VarSharedType.get(i);
    varsSymbols += `${i}\t${varss[i]}\t${ScriptVarType.getType(vars.type)}\n`;
}
fs.writeFileSync('data/symbols/vars.tsv', varsSymbols);

console.time('Loading param.dat');
ParamType.load('data/pack/server');
console.timeEnd('Loading param.dat');

let paramSymbols = '';
const params = loadPack('data/pack/param.pack');
for (let i = 0; i < params.length; i++) {
    if (!params[i]) {
        continue;
    }

    const config = ParamType.get(i);
    paramSymbols += `${i}\t${params[i]}\t${config.getType()}\n`;
}
fs.writeFileSync('data/symbols/param.tsv', paramSymbols);

let structSymbols = '';
const structs = loadPack('data/pack/struct.pack');
for (let i = 0; i < structs.length; i++) {
    structSymbols += `${i}\t${structs[i]}\n`;
}
fs.writeFileSync('data/symbols/struct.tsv', structSymbols);

let enumSymbols = '';
const enums = loadPack('data/pack/enum.pack');
for (let i = 0; i < enums.length; i++) {
    enumSymbols += `${i}\t${enums[i]}\n`;
}
fs.writeFileSync('data/symbols/enum.tsv', enumSymbols);

let huntSymbols = '';
const hunts = loadPack('data/pack/hunt.pack');
for (let i = 0; i < hunts.length; i++) {
    huntSymbols += `${i}\t${hunts[i]}\n`;
}
fs.writeFileSync('data/symbols/hunt.tsv', huntSymbols);

let mesanimSymbols = '';
const mesanims = loadPack('data/pack/mesanim.pack');
for (let i = 0; i < mesanims.length; i++) {
    mesanimSymbols += `${i}\t${mesanims[i]}\n`;
}
fs.writeFileSync('data/symbols/mesanim.tsv', mesanimSymbols);

let synthSymbols = '';
const synths = loadPack('data/pack/sound.pack');
for (let i = 0; i < synths.length; i++) {
    synthSymbols += `${i}\t${synths[i]}\n`;
}
fs.writeFileSync('data/symbols/synth.tsv', synthSymbols);

let categorySymbols = '';
const categories = loadPack('data/pack/category.pack');
for (let i = 0; i < categories.length; i++) {
    if (!categories[i]) {
        continue;
    }

    categorySymbols += `${i}\t${categories[i]}\n`;
}
fs.writeFileSync('data/symbols/category.tsv', categorySymbols);

let scriptSymbols = '';
const scripts = loadPack('data/pack/script.pack');
for (let i = 0; i < scripts.length; i++) {
    if (!scripts[i]) {
        continue;
    }

    scriptSymbols += `${i}\t${scripts[i]}\n`;
}
fs.writeFileSync('data/symbols/runescript.tsv', scriptSymbols);

let commandSymbols = '';
const commands = Object.keys(ScriptOpcode);
for (let i = 0; i < commands.length / 2; i++) {
    const command = ScriptOpcode[commands[i] as any];
    const pointers = ScriptOpcodePointers[commands[i]];

    // format:
    // opcode<tab>command<tab>require<tab>corrupt<tab>set<tab>conditional<tab>secondary<tab>secondaryRequire

    const opcode = commands[i];
    if (pointers) {
        commandSymbols += `${opcode}\t${command.toLowerCase()}`;
    } else {
        commandSymbols += `${opcode}\t${command.toLowerCase()}\n`;
    }

    if (!pointers) {
        continue;
    }

    commandSymbols += '\t';

    if (pointers && pointers.require) {
        commandSymbols += pointers.require.join(',');
    } else {
        commandSymbols += 'none';
    }

    if (!pointers.corrupt && !pointers.set && !pointers.conditional && !pointers.secondary) {
        commandSymbols += '\n';
        continue;
    }

    commandSymbols += '\t';

    if (pointers && pointers.corrupt) {
        commandSymbols += pointers.corrupt.join(',');
    } else {
        commandSymbols += 'none';
    }

    if (!pointers.set && !pointers.conditional && !pointers.secondary) {
        commandSymbols += '\n';
        continue;
    }

    commandSymbols += '\t';

    if (pointers && pointers.set) {
        commandSymbols += pointers.set.join(',');
    } else {
        commandSymbols += 'none';
    }

    if (!pointers.conditional && !pointers.secondary) {
        commandSymbols += '\n';
        continue;
    }

    commandSymbols += '\t';

    if (pointers && pointers.conditional) {
        commandSymbols += pointers.conditional;
    } else {
        commandSymbols += 'false';
    }

    if (!pointers.secondary) {
        commandSymbols += '\n';
        continue;
    }

    commandSymbols += '\t';

    if (pointers && pointers.secondary) {
        commandSymbols += pointers.secondary + '';
    } else {
        commandSymbols += 'false';
    }

    if (!pointers.secondaryRequire) {
        commandSymbols += '\n';
        continue;
    }

    commandSymbols += '\t';

    if (pointers && pointers.secondaryRequire) {
        commandSymbols += pointers.secondaryRequire.join(',') + '\n';
    } else {
        commandSymbols += 'none\n';
    }
}
fs.writeFileSync('data/symbols/commands.tsv', commandSymbols);

DbTableType.load('data/pack/server');

let dbTableSymbols = '';
let dbColumnSymbols = '';
const dbtables = loadPack('data/pack/dbtable.pack');
for (let i = 0; i < dbtables.length; i++) {
    if (!dbtables[i]) {
        continue;
    }

    dbTableSymbols += `${i}\t${dbtables[i]}\n`;

    const table = DbTableType.get(i);
    for (let j = 0; j < table.columnNames.length; j++) {
        const columnIndex = (table.id << 12) | (j << 4);
        const types = table.types[j].map((t: number) => ScriptVarType.getType(t)).join(',');

        dbColumnSymbols += `${columnIndex}\t${table.debugname}:${table.columnNames[j]}\t${types}\n`;
    }
}
fs.writeFileSync('data/symbols/dbtable.tsv', dbTableSymbols);
fs.writeFileSync('data/symbols/dbcolumn.tsv', dbColumnSymbols);

let dbRowSymbols = '';
const dbrows = loadPack('data/pack/dbrow.pack');
for (let i = 0; i < dbrows.length; i++) {
    if (!dbrows[i]) {
        continue;
    }

    dbRowSymbols += `${i}\t${dbrows[i]}\n`;
}
fs.writeFileSync('data/symbols/dbrow.tsv', dbRowSymbols);

const stats = [
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
    'stat18',
    'stat19',
    'runecraft'
];

fs.writeFileSync('data/symbols/stat.tsv', stats.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

const npcStats = ['hitpoints', 'attack', 'strength', 'defence', 'magic', 'ranged'];

fs.writeFileSync('data/symbols/npc_stat.tsv', npcStats.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

const locshapes = [
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
    'grounddecor'
];

fs.writeFileSync('data/symbols/locshape.tsv', locshapes.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

const fonts = ['p11', 'p12', 'b12', 'q8'];
fs.writeFileSync('data/symbols/fontmetrics.tsv', fonts.map((name, index) => `${index}\t${name}`).join('\n') + '\n');

const npcmodes = [
    '-1\tnull',
    '0\tnone',
    '1\twander',
    '2\tpatrol',
    '3\tplayerescape',
    '4\tplayerfollow',
    '5\tplayerface',
    '6\tplayerfaceclose',
    '7\topplayer1',
    '8\topplayer2',
    '9\topplayer3',
    '10\topplayer4',
    '11\topplayer5',
    '12\tapplayer1',
    '13\tapplayer2',
    '14\tapplayer3',
    '15\tapplayer4',
    '16\tapplayer5',
    '17\toploc1',
    '18\toploc2',
    '19\toploc3',
    '20\toploc4',
    '21\toploc5',
    '22\taploc1',
    '23\taploc2',
    '24\taploc3',
    '25\taploc4',
    '26\taploc5',
    '27\topobj1',
    '28\topobj2',
    '29\topobj3',
    '30\topobj4',
    '31\topobj5',
    '32\tapobj1',
    '33\tapobj2',
    '34\tapobj3',
    '35\tapobj4',
    '36\tapobj5',
    '37\topnpc1',
    '38\topnpc2',
    '39\topnpc3',
    '40\topnpc4',
    '41\topnpc5',
    '42\tapnpc1',
    '43\tapnpc2',
    '44\tapnpc3',
    '45\tapnpc4',
    '46\tapnpc5'
];
fs.writeFileSync('data/symbols/npc_mode.tsv', npcmodes.join('\n') + '\n');

// ----

if (fs.existsSync('data/pack/server/scripts')) {
    fs.readdirSync('data/pack/server/scripts').forEach(file => {
        fs.unlinkSync(`data/pack/server/scripts/${file}`);
    });
}
