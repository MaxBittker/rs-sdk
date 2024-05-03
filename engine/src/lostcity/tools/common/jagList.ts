import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('Usage: ts-loader jagList.ts <path/to/file.jag>');
    process.exit(1);
}

const jag = Jagfile.load(args[0]);

for (let i = 0; i < jag.fileCount; i++) {
    const name = jag.fileName[i] ?? jag.fileHash[i];

    const data = jag.get(i);
    if (data === null) {
        console.log('Failed to read', name);
        continue;
    }

    const checksum = Packet.getcrc(data.data, 0, data.data.length);
    console.log(name, checksum);
}
