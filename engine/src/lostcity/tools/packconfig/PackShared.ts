import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { VarnPack, VarpPack, VarsPack, shouldBuild } from '#lostcity/util/PackFile.js';

import ParamType from '#lostcity/cache/ParamType.js';

import { packParamConfigs, parseParamConfig } from '#lostcity/tools/packconfig/ParamConfig.js';
import { loadDir } from '#lostcity/util/NameMap.js';

import { packFloConfigs, parseFloConfig } from '#lostcity/tools/packconfig/FloConfig.js';
import { packIdkConfigs, parseIdkConfig } from '#lostcity/tools/packconfig/IdkConfig.js';
import { packLocConfigs, parseLocConfig } from '#lostcity/tools/packconfig/LocConfig.js';
import { packNpcConfigs, parseNpcConfig } from '#lostcity/tools/packconfig/NpcConfig.js';
import { packObjConfigs, parseObjConfig } from '#lostcity/tools/packconfig/ObjConfig.js';
import { packSeqConfigs, parseSeqConfig } from '#lostcity/tools/packconfig/SeqConfig.js';
import { packSpotAnimConfigs, parseSpotAnimConfig } from '#lostcity/tools/packconfig/SpotAnimConfig.js';
import { packVarpConfigs, parseVarpConfig } from '#lostcity/tools/packconfig/VarpConfig.js';

import { AnimPack, CategoryPack, shouldBuildFile } from '#lostcity/util/PackFile.js';
import { listFilesExt } from '#lostcity/util/Parse.js';

import DbTableType from '#lostcity/cache/DbTableType.js';

import { packDbRowConfigs, parseDbRowConfig } from '#lostcity/tools/packconfig/DbRowConfig.js';
import { packDbTableConfigs, parseDbTableConfig } from '#lostcity/tools/packconfig/DbTableConfig.js';
import { packEnumConfigs, parseEnumConfig } from '#lostcity/tools/packconfig/EnumConfig.js';
import { packInvConfigs, parseInvConfig } from '#lostcity/tools/packconfig/InvConfig.js';
import { packMesAnimConfigs, parseMesAnimConfig } from '#lostcity/tools/packconfig/MesAnimConfig.js';
import { packStructConfigs, parseStructConfig } from '#lostcity/tools/packconfig/StructConfig.js';
import { packHuntConfigs, parseHuntConfig } from '#lostcity/tools/packconfig/HuntConfig.js';
import { packVarnConfigs, parseVarnConfig } from '#lostcity/tools/packconfig/VarnConfig.js';
import { packVarsConfigs, parseVarsConfig } from '#lostcity/tools/packconfig/VarsConfig.js';
import Jagfile from '#jagex2/io/Jagfile.js';
import Environment from '#lostcity/util/Environment.js';

export function isConfigBoolean(input: string): boolean {
    return input === 'yes' || input === 'no' || input === 'true' || input === 'false' || input === '1' || input === '0';
}

export function getConfigBoolean(input: string): boolean {
    return input === 'yes' || input === 'true' || input === '1';
}

export class PackedData {
    dat: Packet;
    idx: Packet;
    size: number = 0;
    marker: number;

    constructor(size: number) {
        this.dat = Packet.alloc(4);
        this.idx = Packet.alloc(2);
        this.size = size;

        this.dat.p2(size);
        this.idx.p2(size);
        this.marker = 2;
    }

    next() {
        this.dat.p1(0);
        this.idx.p2(this.dat.pos - this.marker);
        this.marker = this.dat.pos;
    }

    p1(value: number) {
        this.dat.p1(value);
    }

    pbool(value: boolean) {
        this.dat.pbool(value);
    }

    p2(value: number) {
        this.dat.p2(value);
    }

    p3(value: number) {
        this.dat.p3(value);
    }

    p4(value: number) {
        this.dat.p4(value);
    }

    pjstr(value: string) {
        this.dat.pjstr(value);
    }
}

export const CONSTANTS = new Map<string, string>();
// console.time('Generating constants');
loadDir('data/src/scripts', '.constant', src => {
    for (let i = 0; i < src.length; i++) {
        if (!src[i] || src[i].startsWith('//')) {
            continue;
        }

        const parts = src[i].split('=');
        let name = parts[0].trim();
        const value = parts[1].trim();

        if (name.startsWith('^')) {
            name = name.substring(1);
        }

        if (CONSTANTS.has(name)) {
            console.error(`Duplicate constant found: ${name}`);
            process.exit(1);
        }

        CONSTANTS.set(name, value);
    }
});
// console.timeEnd('Generating constants');

// var domains are global, so we need to check for conflicts

for (let id = 0; id < VarpPack.size; id++) {
    const name = VarpPack.getById(id);

    if (VarnPack.getByName(name) !== -1) {
        console.error(`Varp and varn name conflict: ${name}\nPick a different name for one of them!`);
        process.exit(1);
    }

    if (VarsPack.getByName(name) !== -1) {
        console.error(`Varp and vars name conflict: ${name}\nPick a different name for one of them!`);
        process.exit(1);
    }
}

for (let id = 0; id < VarnPack.size; id++) {
    const name = VarnPack.getById(id);

    if (VarsPack.getByName(name) !== -1) {
        console.error(`Varn and vars name conflict: ${name}\nPick a different name for one of them!`);
        process.exit(1);
    }
}

export function findFiles(path: string, extension: string, results: string[] = []): string[] {
    const files = fs.readdirSync(path);

    for (let i = 0; i < files.length; i++) {
        if (fs.statSync(path + '/' + files[i]).isDirectory()) {
            findFiles(path + '/' + files[i], extension, results);
        } else {
            if (files[i].endsWith(extension)) {
                results.push(path + '/' + files[i]);
            }
        }
    }

    return results;
}

export function readFiles(files: string[]): Map<string, string> {
    const contents = new Map<string, string>(); // key: file, value: content

    for (let i = 0; i < files.length; i++) {
        contents.set(files[i], fs.readFileSync(files[i], 'utf8').replace(/\r/g, ''));
    }

    return contents;
}

export function parseStepError(file: string, lineNumber: number, message: string) {
    console.error(`\nError during parsing - see ${file}:${lineNumber + 1}`);
    console.error(message);
    process.exit(1);
}

export function packStepError(debugname: string, message: string) {
    console.error(`\nError during packing - [${debugname}]`);
    console.error(message);
    process.exit(1);
}

export type ParamValue = {
    id: number;
    type: number;
    value: string | number | boolean;
};
export type LocModelShape = { model: number; shape: number };
export type ConfigValue = string | number | boolean | number[] | LocModelShape[] | ParamValue;
export type ConfigLine = { key: string; value: ConfigValue };

// we're using null for invalid values, undefined for invalid keys
export type ConfigParseCallback = (key: string, value: string) => ConfigValue | null | undefined;
export type ConfigDatIdx = { client: PackedData, server: PackedData };
export type ConfigPackCallback = (configs: Map<string, ConfigLine[]>) => ConfigDatIdx;
export type ConfigSaveCallback = (dat: Packet, idx: Packet) => void;

export function readConfigs(extension: string, requiredProperties: string[], parse: ConfigParseCallback, pack: ConfigPackCallback, saveClient: ConfigSaveCallback, saveServer: ConfigSaveCallback) {
    const files = readFiles(findFiles('data/src/scripts', extension));

    const configs = new Map<string, ConfigLine[]>();
    files.forEach((value, file) => {
        const lines = value.split('\n');

        let debugname: string | null = null;
        let config: ConfigLine[] = [];

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (line.length === 0 || line.startsWith('//')) {
                continue;
            }

            if (line.startsWith('[')) {
                if (!line.endsWith(']')) {
                    throw parseStepError(file, lineNumber, `Missing closing bracket: ${line}`);
                }

                if (debugname !== null) {
                    if (requiredProperties.length > 0) {
                        // check config keys against requiredProperties
                        for (let i = 0; i < requiredProperties.length; i++) {
                            if (!config.some(value => value.key === requiredProperties[i])) {
                                throw parseStepError(file, -1, `Missing required property: ${requiredProperties[i]}`);
                            }
                        }
                    }

                    configs.set(debugname, config);
                }

                debugname = line.substring(1, line.length - 1); // TODO: .toLowerCase();
                if (!debugname.length) {
                    throw parseStepError(file, lineNumber, 'No config name');
                }

                if (configs.has(debugname)) {
                    throw parseStepError(file, lineNumber, `Duplicate config found: ${debugname}`);
                }

                config = [];
                continue;
            }

            const separator = line.indexOf('=');
            if (separator === -1) {
                throw parseStepError(file, lineNumber, `Missing property separator: ${line}`);
            }

            const key = line.substring(0, separator);
            let value = line.substring(separator + 1);

            for (let i = 0; i < value.length; i++) {
                // check the value for a constant starting with ^ and ending with a \r, \n, comma, or otherwise end of string
                // then replace just that substring with CONSTANTS.get(value) if CONSTANTS.has(value) returns true

                if (value[i] === '^') {
                    const start = i;
                    let end = i + 1;

                    while (end < value.length) {
                        if (value[end] === '\r' || value[end] === '\n' || value[end] === ',' || value[end] === ' ') {
                            break;
                        }

                        end++;
                    }

                    const constant = value.substring(start + 1, end);
                    if (CONSTANTS.has(constant)) {
                        value = value.substring(0, start) + CONSTANTS.get(constant) + value.substring(end);
                    }

                    i = end;
                }
            }

            const parsed = parse(key, value);
            if (parsed === null) {
                throw parseStepError(file, lineNumber, `Invalid property value: ${line}`);
            } else if (typeof parsed === 'undefined') {
                throw parseStepError(file, lineNumber, `Invalid property key: ${line}`);
            }

            config.push({ key, value: parsed });
        }

        if (debugname !== null) {
            if (requiredProperties.length > 0) {
                // check config keys against requiredProperties
                for (let i = 0; i < requiredProperties.length; i++) {
                    if (!config.some(value => value.key === requiredProperties[i])) {
                        throw parseStepError(file, -1, `Missing required property: ${requiredProperties[i]}`);
                    }
                }
            }

            configs.set(debugname, config);
        }
    });

    const { client, server } = pack(configs);
    saveClient(client.dat, client.idx);
    saveServer(server.dat, server.idx);
}

// We have to pack params for other configs to parse correctly
if (shouldBuild('data/src/scripts', '.param', 'data/pack/server/param.dat')) {
    readConfigs('.param', ['type'], parseParamConfig, packParamConfigs, () => {}, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/param.dat');
        idx.save('data/pack/server/param.idx');
        dat.release();
        idx.release();
    });
}

// Now that they're up to date, load them for us to use elsewhere during this process
ParamType.load('data/pack');

function noOp() {}

export function packConfigs() {
    const jag = new Jagfile();

    /* client order:
    'seq.dat',      'seq.idx',
    'loc.dat',      'loc.idx',
    'flo.dat',      'flo.idx',
    'spotanim.dat', 'spotanim.idx',
    'obj.dat',      'obj.idx',
    'npc.dat',      'npc.idx',
    'idk.dat',      'idk.idx',
    'varp.dat',     'varp.idx'
    */

    const rebuildClient =
        shouldBuild('data/src/scripts', '.seq', 'data/pack/client/config') ||
        shouldBuild('data/src/scripts', '.loc', 'data/pack/client/config') ||
        shouldBuild('data/src/scripts', '.flo', 'data/pack/client/config') ||
        shouldBuild('data/src/scripts', '.spotanim', 'data/pack/client/config') ||
        shouldBuild('data/src/scripts', '.npc', 'data/pack/client/config') ||
        shouldBuild('data/src/scripts', '.obj', 'data/pack/client/config') ||
        shouldBuild('data/src/scripts', '.idk', 'data/pack/client/config') ||
        shouldBuild('data/src/scripts', '.varp', 'data/pack/client/config') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/client/config');

    // not a config but we want the server to know all the possible categories
    if (
        shouldBuildFile('data/src/pack/category.pack', 'data/pack/server/category.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/category.dat')
    ) {
        console.log('Packing categories');
        //console.time('Packed categories');
        const dat = Packet.alloc(1);
        dat.p2(CategoryPack.size);
        for (let i = 0; i < CategoryPack.size; i++) {
            dat.pjstr(CategoryPack.getById(i));
        }
        dat.save('data/pack/server/category.dat');
        dat.release();
        //console.timeEnd('Packed categories');
    }

    // want the server to access frame lengths without loading data from models
    if (
        shouldBuild('data/src/models', '.frame', 'data/pack/server/frame_del.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/frame_del.dat')
    ) {
        console.log('Packing frame_del');
        //console.time('Packed frame_del');
        const files = listFilesExt('data/src/models', '.frame');
        const frame_del = Packet.alloc(2);
        for (let i = 0; i < AnimPack.max; i++) {
            const name = AnimPack.getById(i);
            if (!name.length) {
                frame_del.p1(0);
                continue;
            }

            const file = files.find(file => file.endsWith(`${name}.frame`));
            if (!file) {
                frame_del.p1(0);
                continue;
            }

            const data = Packet.load(file);

            data.pos = data.data.length - 8;
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
        frame_del.release();
        //console.timeEnd('Packed frame_del');
    }

    // ----

    if (
        shouldBuild('data/src/scripts', '.dbtable', 'data/pack/server/dbtable.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/dbtable.dat')
    ) {
        console.log('Packing .dbtable');
        //console.time('Packed .dbtable');
        readConfigs('.dbtable', [], parseDbTableConfig, packDbTableConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/dbtable.dat');
            idx.save('data/pack/server/dbtable.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .dbtable');
    }

    DbTableType.load('data/pack'); // dbrow needs to access it

    // todo: rebuild when any data type changes
    if (
        shouldBuild('data/src/scripts', '.dbrow', 'data/pack/server/dbrow.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/dbrow.dat') ||
        shouldBuild('data/src/scripts', '.dbtable', 'data/pack/server/dbtable.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/dbtable.dat')
    ) {
        console.log('Packing .dbrow');
        //console.time('Packed .dbrow');
        readConfigs('.dbrow', [], parseDbRowConfig, packDbRowConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/dbrow.dat');
            idx.save('data/pack/server/dbrow.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .dbrow');
    }

    if (
        shouldBuild('data/src/scripts', '.enum', 'data/pack/server/enum.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/enum.dat')
    ) {
        console.log('Packing .enum');
        //console.time('Packed .enum');
        readConfigs('.enum', [], parseEnumConfig, packEnumConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/enum.dat');
            idx.save('data/pack/server/enum.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .enum');
    }

    if (
        shouldBuild('data/src/scripts', '.inv', 'data/pack/server/inv.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/inv.dat')
    ) {
        console.log('Packing .inv');
        //console.time('Packed .inv');
        readConfigs('.inv', [], parseInvConfig, packInvConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/inv.dat');
            idx.save('data/pack/server/inv.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .inv');
    }

    if (
        shouldBuild('data/src/scripts', '.mesanim', 'data/pack/server/mesanim.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/mesanim.dat')
    ) {
        console.log('Packing .mesanim');
        //console.time('Packed .mesanim');
        readConfigs('.mesanim', [], parseMesAnimConfig, packMesAnimConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/mesanim.dat');
            idx.save('data/pack/server/mesanim.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .mesanim');
    }

    if (
        shouldBuild('data/src/scripts', '.struct', 'data/pack/server/struct.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/struct.dat')
    ) {
        console.log('Packing .struct');
        //console.time('Packed .struct');
        readConfigs('.struct', [], parseStructConfig, packStructConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/struct.dat');
            idx.save('data/pack/server/struct.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .struct');
    }

    // ----

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.seq', 'data/pack/server/seq.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/seq.dat')
    ) {
        console.log('Packing .seq');
        //console.time('Packed .seq');
        readConfigs('.seq', [], parseSeqConfig, packSeqConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, 1638136604) || !Packet.checkcrc(idx.data, 0, idx.pos, 969051566))) {
                console.error('.seq CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('seq.dat', dat);
            jag.write('seq.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/seq.dat');
            idx.save('data/pack/server/seq.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .seq');
    }

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.loc', 'data/pack/server/loc.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/loc.dat')
    ) {
        console.log('Packing .loc');
        //console.time('Packed .loc');
        readConfigs('.loc', [], parseLocConfig, packLocConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, 891497087) || !Packet.checkcrc(idx.data, 0, idx.pos, -941401128))) {
                console.error('.loc CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('loc.dat', dat);
            jag.write('loc.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/loc.dat');
            idx.save('data/pack/server/loc.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .loc');
    }

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.flo', 'data/pack/server/flo.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/flo.dat')
    ) {
        console.log('Packing .flo');
        //console.time('Packed .flo');
        readConfigs('.flo', [], parseFloConfig, packFloConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, 1976597026) || !Packet.checkcrc(idx.data, 0, idx.pos, 561308705))) {
                console.error('.flo CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('flo.dat', dat);
            jag.write('flo.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/flo.dat');
            idx.save('data/pack/server/flo.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .flo');
    }

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.spotanim', 'data/pack/server/spotanim.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/spotanim.dat')
    ) {
        console.log('Packing .spotanim');
        //console.time('Packed .spotanim');
        readConfigs('.spotanim', [], parseSpotAnimConfig, packSpotAnimConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, -1279835623) || !Packet.checkcrc(idx.data, 0, idx.pos, -1696140322))) {
                console.error('.spotanim CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('spotanim.dat', dat);
            jag.write('spotanim.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/spotanim.dat');
            idx.save('data/pack/server/spotanim.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .spotanim');
    }

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.npc', 'data/pack/server/npc.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/npc.dat')
    ) {
        console.log('Packing .npc');
        //console.time('Packed .npc');
        readConfigs('.npc', [], parseNpcConfig, packNpcConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, -2140681882) || !Packet.checkcrc(idx.data, 0, idx.pos, -1986014643))) {
                console.error('.npc CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('npc.dat', dat);
            jag.write('npc.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/npc.dat');
            idx.save('data/pack/server/npc.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .npc');
    }

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.obj', 'data/pack/server/obj.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/obj.dat')
    ) {
        console.log('Packing .obj');
        //console.time('Packed .obj');
        readConfigs('.obj', [], parseObjConfig, packObjConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, -840233510) || !Packet.checkcrc(idx.data, 0, idx.pos, 669212954))) {
                console.error('.obj CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('obj.dat', dat);
            jag.write('obj.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/obj.dat');
            idx.save('data/pack/server/obj.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .obj');
    }

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.idk', 'data/pack/server/idk.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/idk.dat')
    ) {
        console.log('Packing .idk');
        //console.time('Packed .idk');
        readConfigs('.idk', [], parseIdkConfig, packIdkConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, -359342366) || !Packet.checkcrc(idx.data, 0, idx.pos, 667216411))) {
                console.error('.idk CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('idk.dat', dat);
            jag.write('idk.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/idk.dat');
            idx.save('data/pack/server/idk.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .idk');
    }

    if (rebuildClient ||
        shouldBuild('data/src/scripts', '.varp', 'data/pack/server/varp.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/varp.dat')
    ) {
        console.log('Packing .varp');
        //console.time('Packed .varp');
        readConfigs('.varp', [], parseVarpConfig, packVarpConfigs, (dat: Packet, idx: Packet) => {
            if (!Environment.SKIP_CRC && (!Packet.checkcrc(dat.data, 0, dat.pos, 705633567) || !Packet.checkcrc(idx.data, 0, idx.pos, -1843167599))) {
                console.error('.varp CRC check failed! Custom data detected.');
                process.exit(1);
            }

            jag.write('varp.dat', dat);
            jag.write('varp.idx', idx);
        }, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/varp.dat');
            idx.save('data/pack/server/varp.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .varp');
    }

    if (
        shouldBuild('data/src/scripts', '.hunt', 'data/pack/server/hunt.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/hunt.dat')
    ) {
        console.log('Packing .hunt');
        //console.time('Packed .hunt');
        readConfigs('.hunt', [], parseHuntConfig, packHuntConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/hunt.dat');
            idx.save('data/pack/server/hunt.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .hunt');
    }

    if (
        shouldBuild('data/src/scripts', '.varn', 'data/pack/server/varn.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/varn.dat')
    ) {
        console.log('Packing .varn');
        //console.time('Packed .varn');
        readConfigs('.varn', [], parseVarnConfig, packVarnConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/varn.dat');
            idx.save('data/pack/server/varn.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .varn');
    }

    if (
        shouldBuild('data/src/scripts', '.vars', 'data/pack/server/vars.dat') ||
        shouldBuild('src/lostcity/tools/packconfig', '.ts', 'data/pack/server/vars.dat')
    ) {
        console.log('Packing .vars');
        //console.time('Packed .vars');
        readConfigs('.vars', [], parseVarsConfig, packVarsConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/vars.dat');
            idx.save('data/pack/server/vars.idx');
            dat.release();
            idx.release();
        });
        //console.timeEnd('Packed .vars');
    }

    if (rebuildClient) {
        console.log('Writing config.jag');
        // we would check the CRC of the config.jag file too, but bz2 can differ on Windows...
        jag.save('data/pack/client/config');
    }
}
