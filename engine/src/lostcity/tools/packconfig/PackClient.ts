import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

import { shouldBuild } from '#lostcity/util/PackFile.js';

import { readConfigs } from '#lostcity/tools/packconfig/PackShared.js';
import { packFloClient, parseFloConfig } from '#lostcity/tools/packconfig/FloConfig.js';
import { packIdkClient, parseIdkConfig } from '#lostcity/tools/packconfig/IdkConfig.js';
import { packLocClient, parseLocConfig } from '#lostcity/tools/packconfig/LocConfig.js';
import { packNpcClient, parseNpcConfig } from '#lostcity/tools/packconfig/NpcConfig.js';
import { packObjClient, parseObjConfig } from '#lostcity/tools/packconfig/ObjConfig.js';
import { packSeqClient, parseSeqConfig } from '#lostcity/tools/packconfig/SeqConfig.js';
import { packSpotAnimClient, parseSpotAnimConfig } from '#lostcity/tools/packconfig/SpotAnimConfig.js';
import { packVarpClient, parseVarpConfig } from '#lostcity/tools/packconfig/VarpConfig.js';

const jag = new Jagfile();

/* order:
  'seq.dat',      'seq.idx',
  'loc.dat',      'loc.idx',
  'flo.dat',      'flo.idx',
  'spotanim.dat', 'spotanim.idx',
  'obj.dat',      'obj.idx',
  'npc.dat',      'npc.idx',
  'idk.dat',      'idk.idx',
  'varp.dat',     'varp.idx'
*/

if (
    shouldBuild('data/src/scripts', '.seq', 'data/pack/client/config') ||
    shouldBuild('data/src/scripts', '.loc', 'data/pack/client/config') ||
    shouldBuild('data/src/scripts', '.flo', 'data/pack/client/config') ||
    shouldBuild('data/src/scripts', '.spotanim', 'data/pack/client/config') ||
    shouldBuild('data/src/scripts', '.npc', 'data/pack/client/config') ||
    shouldBuild('data/src/scripts', '.obj', 'data/pack/client/config') ||
    shouldBuild('data/src/scripts', '.idk', 'data/pack/client/config') ||
    shouldBuild('data/src/scripts', '.varp', 'data/pack/client/config') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/client/config')
) {
    console.log('Packing .seq');
    //console.time('Packed .seq');
    readConfigs('.seq', [], parseSeqConfig, packSeqClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/seq.dat');
        // idx.save('dump/seq.idx');
        jag.write('seq.dat', dat);
        jag.write('seq.idx', idx);
    });
    //console.timeEnd('Packed .seq');

    console.log('Packing .loc');
    //console.time('Packed .loc');
    readConfigs('.loc', [], parseLocConfig, packLocClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/loc.dat');
        // idx.save('dump/loc.idx');
        jag.write('loc.dat', dat);
        jag.write('loc.idx', idx);
    });
    //console.timeEnd('Packed .loc');

    console.log('Packing .flo');
    //console.time('Packed .flo');
    readConfigs('.flo', [], parseFloConfig, packFloClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/flo.dat');
        // idx.save('dump/flo.idx');
        jag.write('flo.dat', dat);
        jag.write('flo.idx', idx);
    });
    //console.timeEnd('Packed .flo');

    console.log('Packing .spotanim');
    //console.time('Packed .spotanim');
    readConfigs('.spotanim', [], parseSpotAnimConfig, packSpotAnimClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/spotanim.dat');
        // idx.save('dump/spotanim.idx');
        jag.write('spotanim.dat', dat);
        jag.write('spotanim.idx', idx);
    });
    //console.timeEnd('Packed .spotanim');

    console.log('Packing .obj');
    //console.time('Packed .obj');
    readConfigs('.obj', [], parseObjConfig, packObjClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/obj.dat');
        // idx.save('dump/obj.idx');
        jag.write('obj.dat', dat);
        jag.write('obj.idx', idx);
    });
    //console.timeEnd('Packed .obj');

    console.log('Packing .npc');
    //console.time('Packed .npc');
    readConfigs('.npc', [], parseNpcConfig, packNpcClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/npc.dat');
        // idx.save('dump/npc.idx');
        jag.write('npc.dat', dat);
        jag.write('npc.idx', idx);
    });
    //console.timeEnd('Packed .npc');

    console.log('Packing .idk');
    //console.time('Packed .idk');
    readConfigs('.idk', [], parseIdkConfig, packIdkClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/idk.dat');
        // idx.save('dump/idk.idx');
        jag.write('idk.dat', dat);
        jag.write('idk.idx', idx);
    });
    //console.timeEnd('Packed .idk');

    console.log('Packing .varp');
    //console.time('Packed .varp');
    readConfigs('.varp', [], parseVarpConfig, packVarpClient, (dat: Packet, idx: Packet) => {
        // dat.save('dump/varp.dat');
        // idx.save('dump/varp.idx');
        jag.write('varp.dat', dat);
        jag.write('varp.idx', idx);
    });
    //console.timeEnd('Packed .varp');

    console.log('Writing config.jag');
    // console.time('Wrote config.jag');
    jag.save('data/pack/client/config');
    // console.timeEnd('Wrote config.jag');
}
