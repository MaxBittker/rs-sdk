import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { shouldBuild } from '#/util/PackFile.js';
import { packInterface } from '#tools/pack/interface/PackShared.js';

export function packClientInterface() {
    if (!shouldBuild(`${Environment.BUILD_SRC_DIR}/scripts`, '.if', 'data/pack/client/interface')) {
        return;
    }

    const jag = new Jagfile();
    const data = packInterface(false);

    if (Environment.BUILD_VERIFY && !Packet.checkcrc(data.data, 0, data.pos, -2146838800)) {
        console.error('.if CRC check failed! Custom data detected.');
        process.exit(1);
    }

    // data.save('dump/interface/data');
    jag.write('data', data);
    jag.save('data/pack/client/interface');
    data.release();
}
