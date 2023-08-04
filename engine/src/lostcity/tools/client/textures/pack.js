import fs from 'fs';

import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

import { convertImage } from '#lostcity/util/PixPack.js';

console.log('Packing textures.jag');
//console.time('textures.jag');

let order = [
    '0.dat',  '1.dat',  '2.dat',     '3.dat',
    '4.dat',  '5.dat',  '6.dat',     '7.dat',
    '8.dat',  '9.dat',  'index.dat', '10.dat',
    '11.dat', '12.dat', '13.dat',    '14.dat',
    '15.dat', '16.dat', '17.dat',    '18.dat',
    '19.dat', '20.dat', '21.dat',    '22.dat',
    '23.dat', '24.dat', '25.dat',    '26.dat',
    '27.dat', '28.dat', '29.dat',    '30.dat',
    '31.dat', '32.dat', '33.dat',    '34.dat',
    '35.dat', '36.dat', '37.dat',    '38.dat',
    '39.dat', '40.dat', '41.dat',    '42.dat',
    '43.dat', '44.dat', '45.dat',    '46.dat',
    '47.dat', '48.dat', '49.dat'
];

let files = {};

// ----

let pack = fs.readFileSync('data/pack/texture.pack', 'ascii').replace(/\r/g, '').split('\n').filter(x => x.length).map(x => {
    let parts = x.split('=');
    return { id: parseInt(parts[0]), name: parts[1] };
});

let index = new Packet();

for (let i = 0; i < pack.length; i++) {
    let data = await convertImage(index, 'data/src/textures', pack[i].name);
    files[`${pack[i].id}.dat`] = data;
}

files['index.dat'] = index;

// ----

let jag = new Jagfile();

for (let i = 0; i < order.length; i++) {
    let name = order[i];
    let data = files[name];
    // data.save(`dump/textures/${name}`, data.length);
    jag.write(name, data);
}

jag.save('data/pack/client/textures');
//console.timeEnd('textures.jag');
