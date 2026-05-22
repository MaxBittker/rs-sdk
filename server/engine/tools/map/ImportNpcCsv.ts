import fs from 'fs';
import { basename } from 'path';

import Environment from '#/util/Environment.js';
import { printError, printFatalError, printInfo } from '#/util/Logger.js';
import { loadDir } from '#tools/pack/Parse.js';

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
    printFatalError('Usage: ImportNpcCsv.js <npc_csv_file>');
}

const npcList = fs
    .readFileSync(args[0], 'ascii')
    .split(/\r?\n/)
    .slice(1)
    .filter(line => line.length > 0);
npcList.forEach((line, index) => {
    if (line.startsWith('//')) {
        return;
    }

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
        printError(`Invalid id: ${id} (${csv})`);
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

loadDir(`${Environment.build.srcDir}/maps`, (lines: string[], file: string) => {
    if (!file.endsWith('.jm2')) {
        return;
    }

    const safeName = basename(file, '.jm2').slice(1);
    const [mapsquareX, mapsquareZ] = safeName.split('_').map(x => parseInt(x));

    const npcs = allNpcs.filter(npc => npc.mapsquareX === mapsquareX && npc.mapsquareZ === mapsquareZ);
    allNpcs = allNpcs.filter(npc => npc.mapsquareX !== mapsquareX || npc.mapsquareZ !== mapsquareZ); // remove processed npcs
    npcs.sort((a, b) => a.level - b.level || a.localX - b.localX || a.localZ - b.localZ);

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

    if (npcs.length) {
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
    }

    fs.writeFileSync(`${Environment.build.srcDir}/maps/` + file, lines.join('\n'));
});

if (allNpcs.length > 0) {
    printInfo(`${allNpcs.length} leftover NPCs:`);
    console.log(allNpcs);
}
