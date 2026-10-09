import fs from 'fs';

import { Jimp } from 'jimp';

import Environment from '#/util/Environment.js';
import { parseBMFont } from '#tools/unpack/sprite/bmfont-parser.js';

async function convert(input: string, output: string) {
    const bmfont = parseBMFont(fs.readFileSync(`data/unpack/font/${input}.fnt`, 'utf8'));
    const bmfontPage = await Jimp.read(`data/unpack/font/${bmfont.pages[0].file}`);

    const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"£$%^&*()-_=+[{]};:\'@#~,<.>/?\\| ';

    const glyphs = new Map();
    for (const [_i, ch] of bmfont.chars) {
        const index = CHARSET.indexOf(String.fromCharCode(ch.id));
        if (index === -1) {
            continue;
        }

        glyphs.set(index, ch);
    }

    const cellSize = bmfont.common.lineHeight + 7;
    const columns = 12;
    const rows = Math.ceil(CHARSET.length / columns) + 2;

    const sheet = new Jimp({
        width: columns * cellSize,
        height: rows * cellSize,
        color: 0xff00ffff
    });

    let minYOffset = Infinity;
    for (const [_i, glyph] of glyphs) {
        if (glyph.width === 0 || glyph.height === 0) {
            continue;
        }

        if (glyph.yoffset < minYOffset) {
            minYOffset = glyph.yoffset;
        }
    }

    for (const [index, glyph] of glyphs) {
        if (glyph.width === 0 || glyph.height === 0) {
            continue;
        }

        const dx = (index % columns) * cellSize;
        const dy = Math.floor(index / columns) * cellSize;

        sheet.blit({
            src: bmfontPage,
            x: dx,
            y: dy + glyph.yoffset,
            srcX: glyph.x,
            srcY: glyph.y,
            srcW: glyph.width,
            srcH: glyph.height
        });
    }

    for (let i = 0; i < sheet.bitmap.width * sheet.bitmap.height; i++) {
        const data = sheet.bitmap.data;
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        // const a = data[i * 4 + 3];

        if (r === 0 && g === 0 && b === 0) {
            data[i * 4 + 0] = 0xff;
            data[i * 4 + 1] = 0;
            data[i * 4 + 2] = 0xff;
        }

        data[i * 4 + 3] = 0xff;
    }

    await sheet.write(`${Environment.build.srcDir}/fonts/${output}.png`);
    fs.writeFileSync(`${Environment.build.srcDir}/fonts/meta/${output}.opt`, `${cellSize}x${cellSize}\n`);
}

await convert('sansserif11', 'f11');
await convert('sansserif12', 'f12');
await convert('sansserif14', 'f14');
await convert('sansserif17', 'f17');
await convert('sansserif19', 'f19');
await convert('sansserif22', 'f22');
await convert('sansserif26', 'f26');
await convert('sansserif30', 'f30');

process.exit(0);
