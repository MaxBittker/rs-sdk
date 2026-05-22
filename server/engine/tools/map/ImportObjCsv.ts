import fs from 'fs';
import { basename } from 'path';

import Environment from '#/util/Environment.js';
import { printFatalError, printInfo } from '#/util/Logger.js';
import { loadDir } from '#tools/pack/Parse.js';

let allObjs: {
    id: number;
    level: number;
    quantity: number;
    mapsquareX: number;
    mapsquareZ: number;
    localX: number;
    localZ: number;
    source: string;
}[] = [];

const args = process.argv.slice(2);
if (args.length !== 1) {
    printFatalError('Usage: ImportObjCsv.js <obj_csv_file>');
}

const objList = fs
    .readFileSync(args[0], 'ascii')
    .split(/\r?\n/)
    .slice(1)
    .filter(line => line.length > 0);
objList.forEach((line, index) => {
    if (line.startsWith('//')) {
        return;
    }

    const csv = line.split(',');
    if (csv.length < 4) {
        return;
    }

    const [x, z, level, id, quantity] = csv;

    const absX = parseInt(x);
    const absZ = parseInt(z);
    const mapsquareX = absX >>> 6;
    const mapsquareZ = absZ >>> 6;
    const localX = absX % 64;
    const localZ = absZ % 64;

    if (Number.isNaN(parseInt(id))) {
        console.log(`Invalid id: ${id}`, csv);
    }

    allObjs.push({
        id: parseInt(id),
        level: parseInt(level),
        quantity: parseInt(quantity),
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

    const objs = allObjs.filter(obj => obj.mapsquareX === mapsquareX && obj.mapsquareZ === mapsquareZ);
    allObjs = allObjs.filter(obj => obj.mapsquareX !== mapsquareX || obj.mapsquareZ !== mapsquareZ); // remove processed objs
    objs.sort((a, b) => a.level - b.level || a.localX - b.localX || a.localZ - b.localZ);

    const objStartIndex = lines.indexOf('==== OBJ ====');
    if (objStartIndex !== -1) {
        // remove old obj section
        lines = lines.slice(0, objStartIndex);
    }

    // place obj section at the end
    if (objs.length) {
        lines.push('==== OBJ ====');
        // format - level x z: id quantity
        lines.push(...objs.map(obj => `${obj.level} ${obj.localX} ${obj.localZ}: ${obj.id} ${obj.quantity}`));
        lines.push('');
    }

    fs.writeFileSync(`${Environment.build.srcDir}/maps/` + file, lines.join('\n'));
});

if (allObjs.length > 0) {
    printInfo(`${allObjs.length} leftover objs:`);
    console.log(allObjs);
}
