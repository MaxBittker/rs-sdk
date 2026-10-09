import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { packInterface } from '#tools/pack/interface/PackShared.js';
import { shouldBuild, shouldBuildFile, shouldBuildFileAny } from '#tools/pack/PackFile.js';

export function shouldRebuildInterfacePack() {
    return (
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.constant', 'data/pack/client/interface') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.if', 'data/pack/client/interface') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/interface.pack`, 'data/pack/client/interface') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/obj.pack`, 'data/pack/client/interface') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/varp.pack`, 'data/pack/client/interface') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/varbit.pack`, 'data/pack/client/interface') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/seq.pack`, 'data/pack/client/interface') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/model.pack`, 'data/pack/client/interface') ||
        shouldBuildFileAny('tools/pack/interface', 'data/pack/client/interface') ||
        shouldBuildFile('tools/pack/Parse.ts', 'data/pack/client/interface')
    );
}

export function packClientInterface(cache: FileStream, modelFlags: number[]) {
    const rebuild = shouldRebuildInterfacePack();

    if (!rebuild && cache.has(0, 3)) {
        return false;
    }

    if (rebuild) {
        const jag = Jagfile.new(true);
        const { client, server } = packInterface(modelFlags);

        jag.write('data', client);
        jag.save('data/pack/client/interface');
        client.release();

        server.save('data/pack/server/interface.dat');
        server.release();
    }

    const packed = fs.readFileSync('data/pack/client/interface');
    if (Environment.build.verify && !Packet.checkcrc(packed, 0, packed.length, 123011849)) {
        throw new Error('interface checksum mismatch!\nYou can disable this safety check by setting BUILD_VERIFY=false');
    }

    cache.write(0, 3, packed);
    return rebuild;
}
