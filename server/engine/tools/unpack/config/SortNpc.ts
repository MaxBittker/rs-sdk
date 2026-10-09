import path from 'path';
import { pathToFileURL } from 'url';

import Environment from '#/util/Environment.js';
import { writeFileIfChanged } from '#tools/pack/FsCache.js';
import { listFilesExt, loadFileFull } from '#tools/pack/Parse.js';

const SERVER_OPCODES: Record<string, number> = {
    category: 18,
    wanderrange: 26,
    maxrange: 27,
    attack: 74,
    defence: 75,
    strength: 76,
    hitpoints: 77,
    ranged: 78,
    magic: 79,
    huntrange: 202,
    timer: 203,
    respawnrate: 204,
    moverestrict: 206,
    attackrange: 207,
    blockwalk: 208,
    huntmode: 209,
    defaultmode: 210,
    members: 211,
    givechase: 213,
    regenrate: 214,
    param: 249
};

function serverOpcode(key: string): number | undefined {
    if (/^patrol\d+$/.test(key)) {
        return 212;
    }

    return SERVER_OPCODES[key];
}

function orderClientProperties(properties: string[]): string[] {
    const modelOrHead = properties.filter(line => /^(?:model|head)\d+=/.test(line));
    const recol = properties.filter(line => /^recol\d+[sd]=/.test(line));
    let ordered = properties.filter(line => !/^(?:(?:model|head)\d+|recol\d+[sd])=/.test(line));

    const name = ordered.filter(line => line.startsWith('name='));
    const desc = ordered.findIndex(line => line.startsWith('desc='));
    if (name.length > 0 && desc !== -1) {
        ordered = ordered.filter(line => !line.startsWith('name='));
        ordered.splice(
            ordered.findIndex(line => line.startsWith('desc=')),
            0,
            ...name
        );
    }

    return [...ordered, ...modelOrHead, ...recol];
}

export function sortNpcLines(lines: string[]): string {
    const configs: string[][] = [];
    let config: string[] = [];

    for (const line of lines) {
        if (line.startsWith('[')) {
            if (config.length > 0) {
                configs.push(config);
            }
            config = [line];
        } else if (config.length > 0) {
            config.push(line);
        }
    }

    if (config.length > 0) {
        configs.push(config);
    }

    return (
        configs
            .map(([header, ...properties]) => {
                const client: string[] = [];
                const server: { line: string; opcode: number; index: number }[] = [];

                properties.forEach((line, index) => {
                    const equals = line.indexOf('=');
                    if (equals === -1) {
                        throw new Error(`Invalid NPC property: ${line}`);
                    }

                    const opcode = serverOpcode(line.substring(0, equals));
                    if (typeof opcode === 'undefined') {
                        client.push(line);
                    } else {
                        server.push({ line, opcode, index });
                    }
                });

                server.sort((a, b) => a.opcode - b.opcode || a.index - b.index);
                return [header, ...orderClientProperties(client), ...server.map(property => property.line)].join('\n');
            })
            .join('\n\n') + '\n'
    );
}

export function sortNpcFiles() {
    const files = listFilesExt(`${Environment.build.srcDir}/scripts`, '.npc');
    for (const file of files) {
        writeFileIfChanged(file, sortNpcLines(loadFileFull(file)));
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    sortNpcFiles();
}
