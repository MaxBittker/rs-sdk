import Jagfile, {genHash} from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

describe('Jagfile', (): void => {
    describe('genHash', (): void => {
        it('result after gnomeball_buttons.dat', (): void => {
            expect(genHash('gnomeball_buttons.dat')).toBe(22834782);
        });

        it('result after headicons.dat', (): void => {
            expect(genHash('headicons.dat')).toBe(-288954319);
        });

        it('result after hitmarks.dat', (): void => {
            expect(genHash('hitmarks.dat')).toBe(-1502153170);
        });
    });

    describe('constructor', (): void => {
        it('result after creation', (): void => {
            const packet: Packet = new Packet(new Uint8Array(18));
            packet.p3(1); // unpackedSize
            packet.p3(1); // packedSize
            packet.p2(1); // fileCount
            packet.p4(-1502153170); // hitmarks.dat
            packet.p3(1); // fileUnpackedSize[0]
            packet.p3(1); // filePackedSize[0]
            packet.pos = 0;
            const jagfile: Jagfile = new Jagfile(packet);

            expect(jagfile.data?.length).toBe(18);
            expect(jagfile.fileCount).toBe(1);
            expect(jagfile.fileHash[0]).toBe(-1502153170);
            expect(jagfile.fileName[0]).toBe('hitmarks.dat');
            expect(jagfile.fileUnpackedSize[0]).toBe(1);
            expect(jagfile.filePackedSize[0]).toBe(1);
            expect(jagfile.filePos[0]).toBe(18);

            // force it unpacked bcos bzip cba
            jagfile.unpacked = true;

            expect(jagfile.read('kekw')).toBeNull();
            expect(jagfile.read('hitmarks.dat')).not.toBeNull();
        });

        it('result after delete', (): void => {
            const packet: Packet = new Packet(new Uint8Array(18));
            packet.p3(1); // unpackedSize
            packet.p3(1); // packedSize
            packet.p2(1); // fileCount
            packet.p4(-1502153170); // hitmarks.dat
            packet.p3(1); // fileUnpackedSize[0]
            packet.p3(1); // filePackedSize[0]
            packet.pos = 0;
            const jagfile: Jagfile = new Jagfile(packet);

            expect(jagfile.data?.length).toBe(18);
            expect(jagfile.fileCount).toBe(1);
            expect(jagfile.fileHash[0]).toBe(-1502153170);
            expect(jagfile.fileName[0]).toBe('hitmarks.dat');
            expect(jagfile.fileUnpackedSize[0]).toBe(1);
            expect(jagfile.filePackedSize[0]).toBe(1);
            expect(jagfile.filePos[0]).toBe(18);

            jagfile.delete('hitmarks.dat');
            expect(jagfile.fileQueue.length).toBe(1);
            expect(jagfile.fileQueue[0].delete).toBeTruthy();
            expect(jagfile.fileQueue[0].write).toBeFalsy();
            expect(jagfile.fileQueue[0].rename).toBeFalsy();
            expect(jagfile.fileQueue[0].hash).toBe(-1502153170);
            expect(jagfile.fileQueue[0].name).toBe('hitmarks.dat');
        });

        it('result after write', (): void => {
            const packet: Packet = new Packet(new Uint8Array(18));
            packet.p3(1); // unpackedSize
            packet.p3(1); // packedSize
            packet.p2(1); // fileCount
            packet.p4(-1502153170); // hitmarks.dat
            packet.p3(1); // fileUnpackedSize[0]
            packet.p3(1); // filePackedSize[0]
            packet.pos = 0;
            const jagfile: Jagfile = new Jagfile(packet);

            expect(jagfile.data?.length).toBe(18);
            expect(jagfile.fileCount).toBe(1);
            expect(jagfile.fileHash[0]).toBe(-1502153170);
            expect(jagfile.fileName[0]).toBe('hitmarks.dat');
            expect(jagfile.fileUnpackedSize[0]).toBe(1);
            expect(jagfile.filePackedSize[0]).toBe(1);
            expect(jagfile.filePos[0]).toBe(18);

            jagfile.write('gnomeball_buttons.dat', new Packet(Uint8Array.of(0)));
            expect(jagfile.fileQueue.length).toBe(1);
            expect(jagfile.fileQueue[0].write).toBeTruthy();
            expect(jagfile.fileQueue[0].delete).toBeFalsy();
            expect(jagfile.fileQueue[0].rename).toBeFalsy();
            expect(jagfile.fileQueue[0].hash).toBe(22834782);
            expect(jagfile.fileQueue[0].name).toBe('gnomeball_buttons.dat');
        });

        it('result after rename', (): void => {
            const packet: Packet = new Packet(new Uint8Array(18));
            packet.p3(1); // unpackedSize
            packet.p3(1); // packedSize
            packet.p2(1); // fileCount
            packet.p4(-1502153170); // hitmarks.dat
            packet.p3(1); // fileUnpackedSize[0]
            packet.p3(1); // filePackedSize[0]
            packet.pos = 0;
            const jagfile: Jagfile = new Jagfile(packet);

            expect(jagfile.data?.length).toBe(18);
            expect(jagfile.fileCount).toBe(1);
            expect(jagfile.fileHash[0]).toBe(-1502153170);
            expect(jagfile.fileName[0]).toBe('hitmarks.dat');
            expect(jagfile.fileUnpackedSize[0]).toBe(1);
            expect(jagfile.filePackedSize[0]).toBe(1);
            expect(jagfile.filePos[0]).toBe(18);

            jagfile.rename('hitmarks.dat', 'gnomeball_buttons.dat');
            expect(jagfile.fileQueue.length).toBe(1);
            expect(jagfile.fileQueue[0].rename).toBeTruthy();
            expect(jagfile.fileQueue[0].write).toBeFalsy();
            expect(jagfile.fileQueue[0].delete).toBeFalsy();
            expect(jagfile.fileQueue[0].hash).toBe(-1502153170);
            expect(jagfile.fileQueue[0].name).toBe('hitmarks.dat');
            expect(jagfile.fileQueue[0].newHash).toBe(22834782);
            expect(jagfile.fileQueue[0].newName).toBe('gnomeball_buttons.dat');
        });
    });
});
