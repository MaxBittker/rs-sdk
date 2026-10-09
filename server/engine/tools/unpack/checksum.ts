import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';

const cache = new FileStream('data/unpack');

function printCrcs(jagName: string, src: Uint8Array) {
    console.log(jagName, Packet.getcrc(src, 0, src.length));

    const jag = new Jagfile(new Packet(src));
    for (const name of jag.fileName) {
        const file = jag.read(name)!;
        console.log(jagName, name, Packet.getcrc(file.data, 0, file.length));

        file.save(`data/unpack/${jagName}/${name}`, file.length);
    }
}

printCrcs('title', cache.read(0, 1)!);
printCrcs('config', cache.read(0, 2)!);
printCrcs('interface', cache.read(0, 3)!);
printCrcs('media', cache.read(0, 4)!);
printCrcs('wordenc', cache.read(0, 7)!);
printCrcs('synth', cache.read(0, 8)!);
