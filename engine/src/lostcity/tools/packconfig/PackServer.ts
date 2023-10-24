import Packet from '#jagex2/io/Packet.js';

import { shouldBuild, shouldBuildFile } from '#lostcity/util/PackFile.js';
import { listFilesExt } from '#lostcity/util/Parse.js';

import DbTableType from '#lostcity/cache/DbTableType.js';

import { PACKFILE, readConfigs } from '#lostcity/tools/packconfig/PackShared.js';
import { packFloServer, parseFloConfig } from '#lostcity/tools/packconfig/FloConfig.js';
import { packIdkServer, parseIdkConfig } from '#lostcity/tools/packconfig/IdkConfig.js';
import { packLocServer, parseLocConfig } from '#lostcity/tools/packconfig/LocConfig.js';
import { packNpcServer, parseNpcConfig } from '#lostcity/tools/packconfig/NpcConfig.js';
import { packObjServer, parseObjConfig } from '#lostcity/tools/packconfig/ObjConfig.js';
import { packSeqServer, parseSeqConfig } from '#lostcity/tools/packconfig/SeqConfig.js';
import { packSpotAnimServer, parseSpotAnimConfig } from '#lostcity/tools/packconfig/SpotAnimConfig.js';
import { packVarpServer, parseVarpConfig } from '#lostcity/tools/packconfig/VarpConfig.js';
import { packDbRowConfigs, parseDbRowConfig } from '#lostcity/tools/packconfig/DbRowConfig.js';
import { packDbTableConfigs, parseDbTableConfig } from '#lostcity/tools/packconfig/DbTableConfig.js';
import { packEnumConfigs, parseEnumConfig } from '#lostcity/tools/packconfig/EnumConfig.js';
import { packInvConfigs, parseInvConfig } from '#lostcity/tools/packconfig/InvConfig.js';
import { packMesAnimConfigs, parseMesAnimConfig } from '#lostcity/tools/packconfig/MesAnimConfig.js';
import { packStructConfigs, parseStructConfig } from '#lostcity/tools/packconfig/StructConfig.js';
import { packHuntConfigs, parseHuntConfig } from '#lostcity/tools/packconfig/HuntConfig.js';
import { packVarnConfigs, parseVarnConfig } from '#lostcity/tools/packconfig/VarnConfig.js';

// not a config but we want the server to know all the possible categories
if (shouldBuildFile('data/pack/category.pack', 'data/pack/server/category.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/category.dat')) {
    console.log('Packing categories');
    //console.time('Packed categories');
    const categories = PACKFILE.get('category')!;
    const dat = new Packet();
    dat.p2(categories.length);
    for (let i = 0; i < categories.length; i++) {
        dat.pjstr(categories[i]);
    }
    dat.save('data/pack/server/category.dat');
    //console.timeEnd('Packed categories');
}

// want the server to access frame lengths without loading data from models
if (shouldBuild('data/src/models', '.frame', 'data/pack/server/frame_del.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/frame_del.dat')) {
    console.log('Packing frame_del');
    //console.time('Packed frame_del');
    const frames = PACKFILE.get('anim')!;
    const files = listFilesExt('data/src/models', '.frame');
    const frame_del = new Packet();
    for (let i = 0; i < frames.length; i++) {
        const name = frames[i];
        if (!name) {
            frame_del.p1(0);
            continue;
        }

        const file = files.find(file => file.endsWith(`${name}.frame`));
        if (!file) {
            frame_del.p1(0);
            continue;
        }

        const data = Packet.load(file);

        data.pos = data.length - 8;
        const headLength = data.g2();
        const tran1Length = data.g2();
        const tran2Length = data.g2();
        // const delLength = data.g2();

        data.pos = 0;
        data.pos += headLength;
        data.pos += tran1Length;
        data.pos += tran2Length;
        frame_del.p1(data.g1());
    }

    frame_del.save('data/pack/server/frame_del.dat');
    //console.timeEnd('Packed frame_del');
}

// ----

if (shouldBuild('data/src/scripts', '.dbtable', 'data/pack/server/dbtable.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/dbtable.dat')) {
    console.log('Packing .dbtable');
    //console.time('Packed .dbtable');
    readConfigs('.dbtable', [], parseDbTableConfig, packDbTableConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/dbtable.dat');
        idx.save('data/pack/server/dbtable.idx');
    });
    //console.timeEnd('Packed .dbtable');
}

DbTableType.load('data/pack/server'); // dbrow needs to access it

if (shouldBuild('data/src/scripts', '.dbrow', 'data/pack/server/dbrow.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/dbrow.dat')) {
    console.log('Packing .dbrow');
    //console.time('Packed .dbrow');
    readConfigs('.dbrow', [], parseDbRowConfig, packDbRowConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/dbrow.dat');
        idx.save('data/pack/server/dbrow.idx');
    });
    //console.timeEnd('Packed .dbrow');
}

if (shouldBuild('data/src/scripts', '.enum', 'data/pack/server/enum.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/enum.dat')) {
    console.log('Packing .enum');
    //console.time('Packed .enum');
    readConfigs('.enum', [], parseEnumConfig, packEnumConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/enum.dat');
        idx.save('data/pack/server/enum.idx');
    });
    //console.timeEnd('Packed .enum');
}

if (shouldBuild('data/src/scripts', '.inv', 'data/pack/server/inv.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/inv.dat')) {
    console.log('Packing .inv');
    //console.time('Packed .inv');
    readConfigs('.inv', [], parseInvConfig, packInvConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/inv.dat');
        idx.save('data/pack/server/inv.idx');
    });
    //console.timeEnd('Packed .inv');
}

if (shouldBuild('data/src/scripts', '.mesanim', 'data/pack/server/mesanim.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/mesanim.dat')) {
    console.log('Packing .mesanim');
    //console.time('Packed .mesanim');
    readConfigs('.mesanim', [], parseMesAnimConfig, packMesAnimConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/mesanim.dat');
        idx.save('data/pack/server/mesanim.idx');
    });
    //console.timeEnd('Packed .mesanim');
}

if (shouldBuild('data/src/scripts', '.struct', 'data/pack/server/struct.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/struct.dat')) {
    console.log('Packing .struct');
    //console.time('Packed .struct');
    readConfigs('.struct', [], parseStructConfig, packStructConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/struct.dat');
        idx.save('data/pack/server/struct.idx');
    });
    //console.timeEnd('Packed .struct');
}

// ----

if (shouldBuild('data/src/scripts', '.seq', 'data/pack/server/seq.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/seq.dat')) {
    console.log('Packing .seq');
    //console.time('Packed .seq');
    readConfigs('.seq', [], parseSeqConfig, packSeqServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/seq.dat');
        idx.save('data/pack/server/seq.idx');
    });
    //console.timeEnd('Packed .seq');
}

if (shouldBuild('data/src/scripts', '.loc', 'data/pack/server/loc.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/loc.dat')) {
    console.log('Packing .loc');
    //console.time('Packed .loc');
    readConfigs('.loc', [], parseLocConfig, packLocServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/loc.dat');
        idx.save('data/pack/server/loc.idx');
    });
    //console.timeEnd('Packed .loc');
}

if (shouldBuild('data/src/scripts', '.flo', 'data/pack/server/flo.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/flo.dat')) {
    console.log('Packing .flo');
    //console.time('Packed .flo');
    readConfigs('.flo', [], parseFloConfig, packFloServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/flo.dat');
        idx.save('data/pack/server/flo.idx');
    });
    //console.timeEnd('Packed .flo');
}

if (shouldBuild('data/src/scripts', '.spotanim', 'data/pack/server/spotanim.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/spotanim.dat')) {
    console.log('Packing .spotanim');
    //console.time('Packed .spotanim');
    readConfigs('.spotanim', [], parseSpotAnimConfig, packSpotAnimServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/spotanim.dat');
        idx.save('data/pack/server/spotanim.idx');
    });
    //console.timeEnd('Packed .spotanim');
}

if (shouldBuild('data/src/scripts', '.npc', 'data/pack/server/npc.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/npc.dat')) {
    console.log('Packing .npc');
    //console.time('Packed .npc');
    readConfigs('.npc', [], parseNpcConfig, packNpcServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/npc.dat');
        idx.save('data/pack/server/npc.idx');
    });
    //console.timeEnd('Packed .npc');
}

if (shouldBuild('data/src/scripts', '.obj', 'data/pack/server/obj.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/obj.dat')) {
    console.log('Packing .obj');
    //console.time('Packed .obj');
    readConfigs('.obj', [], parseObjConfig, packObjServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/obj.dat');
        idx.save('data/pack/server/obj.idx');
    });
    //console.timeEnd('Packed .obj');
}

if (shouldBuild('data/src/scripts', '.idk', 'data/pack/server/idk.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/idk.dat')) {
    console.log('Packing .idk');
    //console.time('Packed .idk');
    readConfigs('.idk', [], parseIdkConfig, packIdkServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/idk.dat');
        idx.save('data/pack/server/idk.idx');
    });
    //console.timeEnd('Packed .idk');
}

if (shouldBuild('data/src/scripts', '.varp', 'data/pack/server/varp.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/varp.dat')) {
    console.log('Packing .varp');
    //console.time('Packed .varp');
    readConfigs('.varp', [], parseVarpConfig, packVarpServer, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/varp.dat');
        idx.save('data/pack/server/varp.idx');
    });
    //console.timeEnd('Packed .varp');
}

if (shouldBuild('data/src/scripts', '.hunt', 'data/pack/server/hunt.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/hunt.dat')) {
    console.log('Packing .hunt');
    //console.time('Packed .hunt');
    readConfigs('.hunt', [], parseHuntConfig, packHuntConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/hunt.dat');
        idx.save('data/pack/server/hunt.idx');
    });
    //console.timeEnd('Packed .hunt');
}

if (shouldBuild('data/src/scripts', '.varn', 'data/pack/server/varn.dat') ||
    shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/varn.dat')) {
    console.log('Packing .varn');
    //console.time('Packed .varn');
    readConfigs('.varn', [], parseVarnConfig, packVarnConfigs, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/varn.dat');
        idx.save('data/pack/server/varn.idx');
    });
    //console.timeEnd('Packed .varn');
}
