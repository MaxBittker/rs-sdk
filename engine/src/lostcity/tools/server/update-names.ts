import { loadDir } from '#lostcity/util/NameMap.js';
import fs from 'fs';

const older: string[] = [];
fs.readFileSync('data/pack/obj.pack', 'ascii')
    .replace(/\r/g, '')
    .split('\n')
    .filter(x => x)
    .map(line => line.split('='))
    .forEach(([id, name]) => (older[id as unknown as number] = name));

const newer: string[] = [];
fs.readFileSync('D:/Downloads/item-debugnames-guesses.txt', 'ascii')
    .replace(/\r/g, '')
    .split('\n')
    .filter(x => x)
    .map(line => line.split('='))
    .forEach(([name, id]) => (newer[id as unknown as number] = name));

// update objs

loadDir('data/src/scripts', '.obj', (src, file, path) => {
    let joinedSrc = src.join('\n') + '\n';

    for (let i = 0; i < newer.length; i++) {
        if (typeof newer[i] === 'undefined') {
            continue;
        }

        if (joinedSrc.indexOf(older[i]) !== -1) {
            // replace all instances of the old name with the new name (make sure to check for the whole word)
            joinedSrc = joinedSrc.replace(new RegExp(`\\b${older[i]}\\b`, 'g'), newer[i]);
        }
    }

    // add a new line before every instance of []
    joinedSrc = joinedSrc.replace(/\[/g, '\n[');

    // remove the first line
    if (joinedSrc[1] === '[') {
        joinedSrc = joinedSrc.slice(1);
    }

    fs.writeFileSync(`${path}/${file}`, joinedSrc);
});

// then update pack

for (let i = 0; i < newer.length; i++) {
    if (typeof newer[i] === 'undefined') {
        continue;
    }

    const certlink = older.indexOf('cert_' + older[i]);
    if (certlink !== -1) {
        older[certlink] = 'cert_' + newer[i];
    }
    older[i] = newer[i];
}
fs.writeFileSync('data/pack/obj.pack', older.map((name, id) => `${id}=${name}`).join('\n') + '\n');
