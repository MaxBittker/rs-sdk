import fs from 'fs';
import { basename } from 'path';

import { loadDir } from '#lostcity/util/Parse.js';

let allNpcs: {
    id: number;
    level: number;
    mapsquareX: number;
    mapsquareZ: number;
    localX: number;
    localZ: number;
    source: string;
}[] = [];

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.log('Usage: ImportNpcCsv.js <npc_csv_file>');
    process.exit(1);
}

const npcList = fs
    .readFileSync(args[0], 'ascii')
    .replace(/\r/g, '')
    .split('\n')
    .slice(1)
    .filter(line => line.length > 0);
npcList.forEach((line, index) => {
    const csv = line.split(',');
    if (csv.length < 4) {
        return;
    }

    const [x, z, level, id] = csv;

    const absX = parseInt(x);
    const absZ = parseInt(z);
    const mapsquareX = absX >>> 6;
    const mapsquareZ = absZ >>> 6;
    const localX = absX % 64;
    const localZ = absZ % 64;

    if (Number.isNaN(parseInt(id))) {
        console.log(`Invalid id: ${id}`, csv);
    }

    allNpcs.push({
        id: parseInt(id),
        level: parseInt(level),
        mapsquareX,
        mapsquareZ,
        localX,
        localZ,
        source: line + '|' + index
    });
});

loadDir('data/src/maps', (lines: string[], file: string) => {
    const safeName = basename(file, '.jm2').slice(1);
    const [mapsquareX, mapsquareZ] = safeName.split('_').map(x => parseInt(x));

    const npcs = allNpcs.filter(npc => npc.mapsquareX === mapsquareX && npc.mapsquareZ === mapsquareZ);
    if (npcs.length === 0) {
        return;
    }

    allNpcs = allNpcs.filter(npc => npc.mapsquareX !== mapsquareX || npc.mapsquareZ !== mapsquareZ); // remove processed npcs

    const npcStartIndex = lines.indexOf('==== NPC ====');
    if (npcStartIndex !== -1) {
        // remove existing npc section
        const npcEndIndex = lines.indexOf('==== OBJ ====', npcStartIndex);
        if (npcEndIndex !== -1) {
            lines.splice(npcStartIndex, npcEndIndex - npcStartIndex);
        } else {
            lines.splice(npcStartIndex);
        }
    }

    const objStartIndex = lines.indexOf('==== OBJ ====');
    if (objStartIndex !== -1) {
        // place npc section before obj section
        const objs = lines.splice(objStartIndex);
        lines.push('==== NPC ====');
        // format - level x z: id
        lines.push(...npcs.map(npc => `${npc.level} ${npc.localX} ${npc.localZ}: ${npc.id}`));
        lines.push('');
        lines.push(...objs);
    } else {
        // place npc section at the end
        lines.push('==== NPC ====');
        // format - level x z: id
        lines.push(...npcs.map(npc => `${npc.level} ${npc.localX} ${npc.localZ}: ${npc.id}`));
        lines.push('');
    }

    fs.writeFileSync(file, lines.join('\n'));
});

if (allNpcs.length > 0) {
    console.log(`Leftover NPCs: ${allNpcs.length}`);
    console.log(allNpcs);
}
