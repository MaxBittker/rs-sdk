import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

import { convertImage } from '#lostcity/util/PixPack.js';

console.log('Packing media.jag');
//console.time('media.jag');

let jagOrder = [
    'combatboxes.dat',   'staticons.dat',     'gnomeball_buttons.dat',
    'miscgraphics2.dat', 'miscgraphics3.dat', 'backleft1.dat',
    'backleft2.dat',     'tradebacking.dat',  'steelborder.dat',
    'prayeron.dat',      'mapflag.dat',       'compass.dat',
    'mapback.dat',       'headicons.dat',     'mapscene.dat',
    'staticons2.dat',    'cross.dat',         'magicoff.dat',
    'magicon2.dat',      'miscgraphics.dat',  'index.dat',
    'magicon.dat',       'combaticons.dat',   'mapdots.dat',
    'backtop1.dat',      'backtop2.dat',      'chatback.dat',
    'backbase1.dat',     'backbase2.dat',     'hitmarks.dat',
    'sideicons.dat',     'scrollbar.dat',     'prayerglow.dat',
    'redstone1.dat',     'redstone2.dat',     'redstone3.dat',
    'backhmid1.dat',     'backhmid2.dat',     'combaticons2.dat',
    'combaticons3.dat',  'backvmid1.dat',     'backvmid2.dat',
    'backvmid3.dat',     'wornicons.dat',     'sworddecor.dat',
    'invback.dat',       'leftarrow.dat',     'magicoff2.dat',
    'mapfunction.dat',   'prayeroff.dat',     'steelborder2.dat',
    'rightarrow.dat',    'backright1.dat',    'backright2.dat'
];

let indexOrder = [
    'backbase1.dat', // 0
    'backbase2.dat', // 54
    'backhmid1.dat', // 108
    'backhmid2.dat', // 162
    'backleft1.dat', // 216
    'backleft2.dat', // 270
    'backright1.dat', // 324
    'backright2.dat', // 378
    'backtop1.dat', // 432
    'backtop2.dat', // 486
    'backvmid1.dat', // 540
    'backvmid2.dat', // 594
    'backvmid3.dat', // 648
    'mapback.dat', // 702
    'chatback.dat', // 741
    'invback.dat', // 765
    'magicon.dat', // 792
    'magicoff.dat', // 1288
    'prayeron.dat', // 1769
    'prayeroff.dat', // 2048
    'prayerglow.dat', // 2204
    'wornicons.dat', // 2228
    'sideicons.dat', // 2320
    'compass.dat', // 2509
    'miscgraphics.dat', // 2554
    'miscgraphics2.dat', // 2757
    'miscgraphics3.dat', // 2889
    'staticons.dat', // 2965
    'staticons2.dat', // 3153
    'combaticons.dat', // 3302
    'combaticons2.dat', // 3504
    'combaticons3.dat', // 3706
    'combatboxes.dat', // 3887
    'tradebacking.dat', // 3963
    'headicons.dat', // 3984
    'hitmarks.dat', // 4079
    'cross.dat', // 4132
    'mapdots.dat', // 4202
    'sworddecor.dat', // 4316
    'redstone1.dat', // 4502
    'redstone2.dat', // 4541
    'redstone3.dat', // 4580
    'leftarrow.dat', // 4619
    'rightarrow.dat', // 4796
    'steelborder.dat', // 4973
    'steelborder2.dat', // 5057
    'scrollbar.dat', // 5127
    'mapscene.dat', // 5158
    'mapfunction.dat', // 5648
    'magicon2.dat', // 6377
    'magicoff2.dat', // 6750
    'gnomeball_buttons.dat', // 7117
    'mapflag.dat', // 7440
];

let files = {};

// ----

let index = new Packet();
for (let i = 0; i < indexOrder.length; i++) {
    let safeName = indexOrder[i].replace('.dat', '');
    let data = await convertImage(index, 'data/src/sprites', safeName);
    files[`${safeName}.dat`] = data;
}

files['index.dat'] = index;

// ----

let jag = new Jagfile();

for (let i = 0; i < jagOrder.length; i++) {
    let name = jagOrder[i];
    let data = files[name];
    // data.save(`dump/media/${name}`, data.length);
    jag.write(`${name}`, data);
}

jag.save('data/pack/client/media');
//console.timeEnd('media.jag');
