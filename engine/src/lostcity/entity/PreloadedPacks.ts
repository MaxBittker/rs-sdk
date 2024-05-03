import 'dotenv/config';
import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import Environment from '#lostcity/util/Environment.js';

export const PRELOADED = new Map<string, Uint8Array>();
export const PRELOADED_CRC = new Map<string, number>();

if (!Environment.CI_MODE) {
    console.log('Preloading client data');
    console.time('Preloaded client data');
    if (!fs.existsSync('data/pack/client') || !fs.existsSync('data/pack/client/maps')) {
        console.log('Please build the client cache with client:build!');
        process.exit(1);
    }

    const allMaps = fs.readdirSync('data/pack/client/maps');
    for (let i = 0; i < allMaps.length; i++) {
        const name = allMaps[i];

        const map = new Uint8Array(fs.readFileSync(`data/pack/client/maps/${name}`));
        const crc = Packet.getcrc(map, 0, map.length);

        PRELOADED.set(name, map);
        PRELOADED_CRC.set(name, crc);
    }

    const allSongs = fs.readdirSync('data/pack/client/songs');
    for (let i = 0; i < allSongs.length; i++) {
        const name = allSongs[i];

        const song = new Uint8Array(fs.readFileSync(`data/pack/client/songs/${name}`));
        const crc = Packet.getcrc(song, 0, song.length);

        PRELOADED.set(name, song);
        PRELOADED_CRC.set(name, crc);
    }

    const allJingles = fs.readdirSync('data/pack/client/jingles');
    for (let i = 0; i < allJingles.length; i++) {
        const name = allJingles[i];

        // Strip off bzip header.
        const jingle = new Uint8Array(fs.readFileSync(`data/pack/client/jingles/${name}`).subarray(4));
        const crc = Packet.getcrc(jingle, 0, jingle.length);

        PRELOADED.set(name, jingle);
        PRELOADED_CRC.set(name, crc);
    }
    console.timeEnd('Preloaded client data');
}
