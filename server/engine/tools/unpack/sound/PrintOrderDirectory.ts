import Environment from '#/util/Environment.js';
import { loadOrder, loadPack } from '#tools/pack/NameMap.js';
import fs from 'fs';

type Synth = {
    id: number;
    name: string;
};

type SynthDirectory = {
    name: string;
    parentDirectory: string | null;
    synths: Synth[];
    childDirectories: SynthDirectory[];
};

const lookup = new Map<string, string>();
function scanDirectory(dir: SynthDirectory, fullPath: string = '') {
    const current = `${fullPath}/${dir.name}`;

    for (const child of dir.childDirectories) {
        scanDirectory(child, current);
    }

    for (const synth of dir.synths) {
        lookup.set(synth.name, current);
    }
}

const tree = JSON.parse(fs.readFileSync('data/pack/synths.json', 'utf-8')) as SynthDirectory;
scanDirectory(tree);

const order = loadOrder(`${Environment.build.srcDir}/pack/synth.order`);
const pack = loadPack(`${Environment.build.srcDir}/pack/synth.pack`);

fs.writeFileSync('data/pack/dir2.txt', '');
for (const id of order) {
    const name = pack[id];
    if (lookup.has(name)) {
        fs.appendFileSync('data/pack/dir2.txt', `${id}=${lookup.get(name)!.substring(7)}/${name}.synth\n`);
    } else {
        fs.appendFileSync('data/pack/dir2.txt', `${id}=${name}.synth\n`);
    }
}
