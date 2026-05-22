import fs from 'fs';
import path from 'path';

import Environment from '#/util/Environment.js';

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

const tree = JSON.parse(fs.readFileSync('data/pack/synths.json', 'utf-8')) as SynthDirectory;

function scanDirectory(dir: SynthDirectory, fullPath: string = '') {
    const current = `${fullPath}/${dir.name}`;

    for (const child of dir.childDirectories) {
        scanDirectory(child, current);
    }

    for (const synth of dir.synths) {
        const source = `${Environment.build.srcDir}/synth/${synth.name}.synth`;

        if (fs.existsSync(source)) {
            const target = `${Environment.build.srcDir}${current}/${synth.name}.synth`;

            const parent = path.dirname(target);
            if (!fs.existsSync(parent)) {
                fs.mkdirSync(parent, { recursive: true });
            }

            fs.renameSync(source, target);
            console.log(target);
        }
    }
}

scanDirectory(tree);
