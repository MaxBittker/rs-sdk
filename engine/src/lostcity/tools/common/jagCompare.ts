import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Usage: ts-loader jagCompare.ts <path/to/file1.jag> <path/to/file2.jag>');
    process.exit(1);
}

const jag1 = Jagfile.load(args[0]);
const jag2 = Jagfile.load(args[1]);

for (let i = 0; i < jag1.fileCount; i++) {
    try {
        const file1 = jag1.get(i)!;
        const file2 = jag2.get(i)!;

        const crc1 = Packet.getcrc(file1.data, 0, file1.data.length);
        const crc2 = Packet.getcrc(file2.data, 0, file2.data.length);

        if (crc1 !== crc2) {
            console.log(`File ${jag1.fileName[i]} is different`);

            if (jag1.fileName[i] === jag2.fileName[i] && jag1.fileName[i].endsWith('.dat')) {
                const diff1 = jag1.deconstruct(jag1.fileName[i].replace('.dat', ''));
                const diff2 = jag2.deconstruct(jag2.fileName[i].replace('.dat', ''));

                if (diff1.count !== diff2.count) {
                    console.log('Count is different', diff1.count, diff2.count);
                } else {
                    for (let j = 0; j < diff1.count; j++) {
                        if (diff1.checksums[j] !== diff2.checksums[j]) {
                            console.log(`Checksum for ${j} is different`, diff1.checksums[j], diff2.checksums[j]);
                        } else if (diff1.sizes[j] !== diff2.sizes[j]) {
                            console.log(`Size for ${j} is different`, diff1.sizes[j], diff2.sizes[j]);
                        } else if (diff1.offsets[j] !== diff2.offsets[j]) {
                            console.log(`Offset for ${j} is different`, diff1.offsets[j], diff2.offsets[j]);
                        }
                    }
                }
            }

            console.log(Buffer.from(file1.data).subarray(0, 25), file1.data.length, Packet.getcrc(file1.data, 0, file1.data.length));
            console.log(Buffer.from(file2.data).subarray(0, 25), file2.data.length, Packet.getcrc(file2.data, 0, file2.data.length));

            console.log();

            file1.save(`dump/1.${jag1.fileName[i]}`, file1.data.length);
            file2.save(`dump/2.${jag2.fileName[i]}`, file2.data.length);
        }
    } catch (err) {
        console.log(`File ${jag1.fileName[i]} is missing`);
    }
}
