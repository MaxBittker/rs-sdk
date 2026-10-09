import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';

export function packClientWordenc(cache: FileStream) {
    const packed = fs.readFileSync('data/raw/wordenc');
    if (Environment.build.verify && !Packet.checkcrc(packed, 0, packed.length, 455063218)) {
        throw new Error('wordenc checksum mismatch!\nYou can disable this safety check by setting BUILD_VERIFY=false');
    }

    cache.write(0, 7, packed);
}
