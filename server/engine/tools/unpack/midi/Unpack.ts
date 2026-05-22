import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';
import { MidiPack } from '#tools/pack/PackFile.js';
import Packet from '#/io/Packet.js';
import Jagfile from '#/io/Jagfile.js';

if (!fs.existsSync(`${Environment.build.srcDir}/songs`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/songs`, { recursive: true });
}

if (!fs.existsSync(`${Environment.build.srcDir}/jingles`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/jingles`, { recursive: true });
}

const cache = new FileStream('data/unpack', false, true);
const versionlist = new Jagfile(new Packet(cache.read(0, 5)!));
const index = versionlist.read('midi_index')!;

console.time('midis');
const midiCount = cache.count(3);
for (let i = 0; i < midiCount; i++) {
    const data = cache.read(3, i, true);

    let name = MidiPack.getById(i);
    if (!name) {
        name = `midi_${i}`;
    }
    MidiPack.register(i, name);

    const jingle = index.g1();

    if (data) {
        fs.writeFileSync(`${Environment.build.srcDir}/${jingle ? 'jingles' : 'songs'}/${name}.mid`, data);
    } else {
        printWarning(`Missing midi id=${i}`);
    }
}
console.timeEnd('midis');

MidiPack.save();
