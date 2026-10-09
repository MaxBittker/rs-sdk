import fs from 'fs';
import path from 'path';

import { Jimp } from 'jimp';

import FileStream from '#/io/FileStream.js';
import { listFilesExt } from '#tools/pack/Parse.js';
import Environment from '#/util/Environment.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import { convertImage, generatePalette } from '#tools/pack/PixPack.js';
import { shouldBuildFile, shouldBuildFileAny } from '#tools/pack/PackFile.js';

export const BACK_PIECES = [
    ['backbase1', 0, 453, 496, 50],
    ['backbase2', 496, 466, 269, 37],
    ['backhmid1', 516, 160, 249, 45],
    ['backhmid2', 0, 338, 553, 19],
    ['backleft1', 0, 4, 4, 334],
    ['backleft2', 0, 357, 17, 96],
    ['backright1', 722, 4, 43, 156],
    ['backright2', 743, 205, 22, 261],
    ['backtop1', 0, 0, 765, 4],
    ['backvmid1', 516, 4, 34, 156],
    ['backvmid2', 516, 205, 37, 133],
    ['backvmid3', 496, 357, 57, 109]
] as const;

const MEDIA_ORDER = [
    ...BACK_PIECES.map(([name]) => name),
    'mapback',
    'chatback',
    'invback',
    'magicon',
    'magicoff',
    'prayeron',
    'prayeroff',
    'prayerglow',
    'wornicons',
    'sideicons',
    'compass',
    'miscgraphics',
    'miscgraphics2',
    'miscgraphics3',
    'staticons',
    'staticons2',
    'combaticons',
    'combaticons2',
    'combaticons3',
    'combatboxes',
    'tradebacking',
    'headicons',
    'hitmarks',
    'cross',
    'mapdots',
    'sworddecor',
    'redstone1',
    'redstone2',
    'redstone3',
    'leftarrow',
    'rightarrow',
    'steelborder',
    'steelborder2',
    'scrollbar',
    'mapscene',
    'mapfunction',
    'magicon2',
    'magicoff2',
    'gnomeball_buttons',
    'mapmarker',
    'mod_icons',
    'mapedge'
];

export async function packClientMedia(cache: FileStream) {
    const rebuild = shouldBuildFileAny(`${Environment.build.srcDir}/sprites`, 'data/pack/client/media') || shouldBuildFileAny('tools/pack/sprite', 'data/pack/client/media') || shouldBuildFile('tools/pack/PixPack.ts', 'data/pack/client/media');

    if (!rebuild && cache.has(0, 4)) {
        return;
    }

    if (rebuild) {
        const index = Packet.alloc(3);

        const sprites = new Map(
            listFilesExt(`${Environment.build.srcDir}/sprites`, '.png')
                .filter(file => path.basename(file) !== 'back.png')
                .map(file => [path.basename(file, path.extname(file)), file])
        );

        const all = new Map();
        const back = await Jimp.read(`${Environment.build.srcDir}/sprites/back.png`);
        let backColors = generatePalette(back);
        if (backColors.length > 255) {
            back.quantize({ colors: 255 });
            backColors = generatePalette(back);
        }
        for (const name of MEDIA_ORDER) {
            const piece = BACK_PIECES.find(([pieceName]) => pieceName === name);
            if (piece) {
                const [, x, y, w, h] = piece;
                const image = back.clone();
                image.crop({ x, y, w, h });
                all.set(name, await convertImage(index, `${Environment.build.srcDir}/sprites`, name, image, backColors));
            } else if (sprites.has(name)) {
                all.set(name, await convertImage(index, `${Environment.build.srcDir}/sprites`, name));
                sprites.delete(name);
            }
        }
        for (const [name] of sprites) {
            all.set(name, await convertImage(index, `${Environment.build.srcDir}/sprites`, name));
        }

        const media = Jagfile.new();
        for (const [name, sprite] of all) {
            media.write(`${name}.dat`, sprite);
        }
        media.write('index.dat', index);
        media.save('data/pack/client/media');
    }

    const packed = fs.readFileSync('data/pack/client/media');
    if (Environment.build.verify && !Packet.checkcrc(packed, 0, packed.length, -1710005394)) {
        throw new Error('media checksum mismatch!\nYou can disable this safety check by setting BUILD_VERIFY=false');
    }

    cache.write(0, 4, packed);
}
