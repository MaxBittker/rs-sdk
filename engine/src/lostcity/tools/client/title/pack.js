import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

import { convertImage } from '#lostcity/util/PixPack.js';

console.log('Packing title.jag');
//console.time('title.jag');

let order = [
    'p11.dat',
    'p12.dat',
    'titlebox.dat',
    'title.dat',
    'runes.dat',
    'q8.dat',
    'index.dat',
    'titlebutton.dat',
    'logo.dat',
    'b12.dat'
];

let files = {};

let title = Packet.load('data/src/binary/title.jpg');
title.pos = title.length;

files['title.dat'] = title;

// ----

let index = new Packet();

let p11 = await convertImage(index, 'data/src/fonts', 'p11');
files['p11.dat'] = p11;

let p12 = await convertImage(index, 'data/src/fonts', 'p12');
files['p12.dat'] = p12;

let b12 = await convertImage(index, 'data/src/fonts', 'b12');
files['b12.dat'] = b12;

let q8 = await convertImage(index, 'data/src/fonts', 'q8');
files['q8.dat'] = q8;

let logo = await convertImage(index, 'data/src/title', 'logo');
files['logo.dat'] = logo;

let titlebox = await convertImage(index, 'data/src/title', 'titlebox');
files['titlebox.dat'] = titlebox;

let titlebutton = await convertImage(index, 'data/src/title', 'titlebutton');
files['titlebutton.dat'] = titlebutton;

let runes = await convertImage(index, 'data/src/title', 'runes');
files['runes.dat'] = runes;

files['index.dat'] = index;

// ----

let jag = new Jagfile();

for (let i = 0; i < order.length; i++) {
    let name = order[i];
    let data = files[name];
    // data.save(`dump/title/${name}`, data.length);
    jag.write(name, data);
}

jag.save('data/pack/client/title');
//console.timeEnd('title.jag');
