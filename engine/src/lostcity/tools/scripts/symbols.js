import fs from 'fs';
import { loadPack } from '#lostcity/tools/pack/NameMap.js';

fs.mkdirSync('data/symbols', { recursive: true });
fs.writeFileSync('data/symbols/constants.tsv', '');

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

let comSymbols = '';
let coms = loadPack('data/pack/interface.pack');
for (let i = 0; i < coms.length; i++) {
    if (!coms[i] || coms[i] === 'null:null') {
        continue;
    }

    comSymbols += `${i}\t${coms[i]}\n`;
}
fs.writeFileSync('data/symbols/component.tsv', comSymbols);

let scriptSymbols = '';
let scripts = loadPack('data/pack/script.pack');
for (let i = 0; i < scripts.length; i++) {
    if (!scripts[i]) {
        continue;
    }

    scriptSymbols += `${i}\t${scripts[i]}\n`;
}
fs.writeFileSync('data/symbols/runescript.tsv', scriptSymbols);

let stats = [
    'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer',
    'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking',
    'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving',
    'stat18', 'stat19', 'runecraft'
];

fs.writeFileSync('data/symbols/stat.tsv', stats.map((name, index) => `${index}\t${name}`).join('\n') + '\n');
