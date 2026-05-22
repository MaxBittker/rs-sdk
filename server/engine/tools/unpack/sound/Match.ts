import fs from 'fs';

import { PackFile } from '#tools/pack/PackFileBase.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';

const newSynth = new PackFile('osrs-synth');
const newCrcs = new Map<number, string>();
const newDuplicates = new Set<number>();
const newDuplicateNames = new Map<number, string[]>();

for (let id = 0; id < newSynth.max; id++) {
    const file = `data/pack/osrs-synth/${id}.dat`;

    if (fs.existsSync(file)) {
        const data = fs.readFileSync(file);
        const crc = Packet.getcrc(data, 0, data.length);
        const name = newSynth.getById(id);

        if (newDuplicates.has(crc)) {
            // console.error(`synth: skipping duplicate ${crc}`);
        } else if (newCrcs.has(crc)) {
            // newCrcs.delete(crc);
            newDuplicates.add(crc);
            const names = newDuplicateNames.get(crc) ?? [newCrcs.get(crc)!];
            names.push(name);
            newDuplicateNames.set(crc, names);
            // console.error(`synth: duplicate exists ${name}=${newCrcs.get(crc)}`);
        } else {
            newCrcs.set(crc, name);
        }
    } else {
        // console.error(`synth: missing ${file}`);
    }
}

for (const crc of newDuplicates) {
    newCrcs.delete(crc);
}

const oldSynth = new PackFile('synth');
const oldCrcs = new Map<number, string>();
const oldDuplicates = new Set<number>();
const oldDuplicateNames = new Map<number, string[]>();

for (let id = 0; id < oldSynth.max; id++) {
    const name = oldSynth.getById(id);
    const file = `${Environment.build.srcDir}/synth/${name}.synth`;

    if (fs.existsSync(file)) {
        const data = fs.readFileSync(file);
        const crc = Packet.getcrc(data, 0, data.length);

        if (oldDuplicates.has(crc)) {
            // console.error(`synth: skipping duplicate ${crc}`);
        } else if (oldCrcs.has(crc)) {
            // oldCrcs.delete(crc);
            oldDuplicates.add(crc);
            const names = oldDuplicateNames.get(crc) ?? [oldCrcs.get(crc)!];
            names.push(name);
            oldDuplicateNames.set(crc, names);
            // console.error(`synth: duplicate exists ${name}=${oldCrcs.get(crc)}`);
        } else {
            oldCrcs.set(crc, name);
        }
    } else {
        console.error(`synth: missing ${file}`);
    }
}

for (const crc of oldDuplicates) {
    oldCrcs.delete(crc);
}

for (const [crc, oldName] of oldCrcs) {
    const id = oldSynth.getByName(oldName);

    if (newCrcs.has(crc)) {
        const newName = newCrcs.get(crc)!;

        if (oldName !== newName) {
            console.log(`${oldName}=${newName}`);

            if (fs.existsSync(`${Environment.build.srcDir}/synth/${newName}.synth`)) {
                // console.error(`synth: filesystem conflict ${oldName} ${newName}`);
            } else {
                fs.renameSync(`${Environment.build.srcDir}/synth/${oldName}.synth`, `${Environment.build.srcDir}/synth/${newName}.synth`);
                oldSynth.register(id, newName);
            }
        }
    } else {
        // console.error(`synth: no match ${crc} ${oldName}`);
    }
}

oldSynth.save();

// console.log(newDuplicateNames);
// console.log(oldDuplicateNames);
