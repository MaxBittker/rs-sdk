import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';
import { PackFile } from '#tools/pack/PackFileBase.js';
import { AnimSetPack } from '#tools/pack/PackFile.js';
import { listFilesExt } from '#tools/pack/Parse.js';

export const BasePack = new PackFile('base');
export const FramePack = new PackFile('anim');

const cache = new FileStream('data/unpack');

const existingBases = listFilesExt(`${Environment.build.srcDir}/models`, '.base');
const existingFrames = listFilesExt(`${Environment.build.srcDir}/models`, '.frame');

const baseCount = cache.count(2);
for (let baseId = 0; baseId < baseCount; baseId++) {
    const set = cache.read(2, baseId, true);
    if (!set) {
        printWarning(`Missing anim set ${baseId}`);
        continue;
    }

    const setName = `anim_${baseId}`;
    AnimSetPack.register(baseId, setName);
    fs.writeFileSync(`${Environment.build.srcDir}/models/${setName}.anim`, set);

    const offsets = new Packet(set);
    offsets.pos = set.length - 8;

    const head = new Packet(set);
    const tran1 = new Packet(set);
    const tran2 = new Packet(set);
    const del = new Packet(set);
    const base = new Packet(set);

    let offset = 0;
    head.pos = offset;
    offset += offsets.g2() + 2;

    tran1.pos = offset;
    offset += offsets.g2();

    tran2.pos = offset;
    offset += offsets.g2();

    del.pos = offset;
    offset += offsets.g2();

    base.pos = offset;

    const length = base.g1();

    for (let j = 0; j < length; j++) {
        base.g1();
    }

    for (let j = 0; j < length; j++) {
        const labelCount = base.g1();
        for (let k = 0; k < labelCount; k++) {
            base.g1();
        }
    }

    if (!BasePack.getById(baseId)) {
        BasePack.register(baseId, `base_${baseId}`);
    }
    const baseName = BasePack.getById(baseId);

    const existingBase = existingBases.find(x => x.endsWith(`/${baseName}.base`));
    if (existingBase) {
        fs.unlinkSync(existingBase);
    }

    const frameCount = head.g2();
    for (let i = 0; i < frameCount; i++) {
        const frameId = head.g2();
        del.g1();

        if (!FramePack.getById(frameId)) {
            FramePack.register(frameId, `anim_${frameId}`);
        }
        const frameName = FramePack.getById(frameId);

        const existingFrame = existingFrames.find(x => x.endsWith(`/${frameName}.frame`));
        if (existingFrame) {
            fs.unlinkSync(existingFrame);
        }

        const labelCount = head.g1();
        for (let j = 0; j < labelCount; j++) {
            const flags = tran1.g1();
            if (flags === 0) {
                continue;
            }

            if ((flags & 0x1) != 0) {
                tran2.gsmart();
            }

            if ((flags & 0x2) != 0) {
                tran2.gsmart();
            }

            if ((flags & 0x4) != 0) {
                tran2.gsmart();
            }
        }
    }
}

AnimSetPack.save();
BasePack.save();
FramePack.save();
