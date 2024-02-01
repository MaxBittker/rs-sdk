import child_process from 'child_process';
import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

fs.mkdirSync('dump', { recursive: true });

// https://www.ncbi.nlm.nih.gov/IEB/ToolBox/CPP_DOC/lxr/source/src/util/compress/bzip2/crctable.c
const crc32Table = [
    0x00000000, 0x04c11db7, 0x09823b6e, 0x0d4326d9, 0x130476dc, 0x17c56b6b, 0x1a864db2, 0x1e475005, 0x2608edb8, 0x22c9f00f, 0x2f8ad6d6, 0x2b4bcb61, 0x350c9b64, 0x31cd86d3, 0x3c8ea00a, 0x384fbdbd, 0x4c11db70, 0x48d0c6c7, 0x4593e01e, 0x4152fda9,
    0x5f15adac, 0x5bd4b01b, 0x569796c2, 0x52568b75, 0x6a1936c8, 0x6ed82b7f, 0x639b0da6, 0x675a1011, 0x791d4014, 0x7ddc5da3, 0x709f7b7a, 0x745e66cd, 0x9823b6e0, 0x9ce2ab57, 0x91a18d8e, 0x95609039, 0x8b27c03c, 0x8fe6dd8b, 0x82a5fb52, 0x8664e6e5,
    0xbe2b5b58, 0xbaea46ef, 0xb7a96036, 0xb3687d81, 0xad2f2d84, 0xa9ee3033, 0xa4ad16ea, 0xa06c0b5d, 0xd4326d90, 0xd0f37027, 0xddb056fe, 0xd9714b49, 0xc7361b4c, 0xc3f706fb, 0xceb42022, 0xca753d95, 0xf23a8028, 0xf6fb9d9f, 0xfbb8bb46, 0xff79a6f1,
    0xe13ef6f4, 0xe5ffeb43, 0xe8bccd9a, 0xec7dd02d, 0x34867077, 0x30476dc0, 0x3d044b19, 0x39c556ae, 0x278206ab, 0x23431b1c, 0x2e003dc5, 0x2ac12072, 0x128e9dcf, 0x164f8078, 0x1b0ca6a1, 0x1fcdbb16, 0x018aeb13, 0x054bf6a4, 0x0808d07d, 0x0cc9cdca,
    0x7897ab07, 0x7c56b6b0, 0x71159069, 0x75d48dde, 0x6b93dddb, 0x6f52c06c, 0x6211e6b5, 0x66d0fb02, 0x5e9f46bf, 0x5a5e5b08, 0x571d7dd1, 0x53dc6066, 0x4d9b3063, 0x495a2dd4, 0x44190b0d, 0x40d816ba, 0xaca5c697, 0xa864db20, 0xa527fdf9, 0xa1e6e04e,
    0xbfa1b04b, 0xbb60adfc, 0xb6238b25, 0xb2e29692, 0x8aad2b2f, 0x8e6c3698, 0x832f1041, 0x87ee0df6, 0x99a95df3, 0x9d684044, 0x902b669d, 0x94ea7b2a, 0xe0b41de7, 0xe4750050, 0xe9362689, 0xedf73b3e, 0xf3b06b3b, 0xf771768c, 0xfa325055, 0xfef34de2,
    0xc6bcf05f, 0xc27dede8, 0xcf3ecb31, 0xcbffd686, 0xd5b88683, 0xd1799b34, 0xdc3abded, 0xd8fba05a, 0x690ce0ee, 0x6dcdfd59, 0x608edb80, 0x644fc637, 0x7a089632, 0x7ec98b85, 0x738aad5c, 0x774bb0eb, 0x4f040d56, 0x4bc510e1, 0x46863638, 0x42472b8f,
    0x5c007b8a, 0x58c1663d, 0x558240e4, 0x51435d53, 0x251d3b9e, 0x21dc2629, 0x2c9f00f0, 0x285e1d47, 0x36194d42, 0x32d850f5, 0x3f9b762c, 0x3b5a6b9b, 0x0315d626, 0x07d4cb91, 0x0a97ed48, 0x0e56f0ff, 0x1011a0fa, 0x14d0bd4d, 0x19939b94, 0x1d528623,
    0xf12f560e, 0xf5ee4bb9, 0xf8ad6d60, 0xfc6c70d7, 0xe22b20d2, 0xe6ea3d65, 0xeba91bbc, 0xef68060b, 0xd727bbb6, 0xd3e6a601, 0xdea580d8, 0xda649d6f, 0xc423cd6a, 0xc0e2d0dd, 0xcda1f604, 0xc960ebb3, 0xbd3e8d7e, 0xb9ff90c9, 0xb4bcb610, 0xb07daba7,
    0xae3afba2, 0xaafbe615, 0xa7b8c0cc, 0xa379dd7b, 0x9b3660c6, 0x9ff77d71, 0x92b45ba8, 0x9675461f, 0x8832161a, 0x8cf30bad, 0x81b02d74, 0x857130c3, 0x5d8a9099, 0x594b8d2e, 0x5408abf7, 0x50c9b640, 0x4e8ee645, 0x4a4ffbf2, 0x470cdd2b, 0x43cdc09c,
    0x7b827d21, 0x7f436096, 0x7200464f, 0x76c15bf8, 0x68860bfd, 0x6c47164a, 0x61043093, 0x65c52d24, 0x119b4be9, 0x155a565e, 0x18197087, 0x1cd86d30, 0x029f3d35, 0x065e2082, 0x0b1d065b, 0x0fdc1bec, 0x3793a651, 0x3352bbe6, 0x3e119d3f, 0x3ad08088,
    0x2497d08d, 0x2056cd3a, 0x2d15ebe3, 0x29d4f654, 0xc5a92679, 0xc1683bce, 0xcc2b1d17, 0xc8ea00a0, 0xd6ad50a5, 0xd26c4d12, 0xdf2f6bcb, 0xdbee767c, 0xe3a1cbc1, 0xe760d676, 0xea23f0af, 0xeee2ed18, 0xf0a5bd1d, 0xf464a0aa, 0xf9278673, 0xfde69bc4,
    0x89b8fd09, 0x8d79e0be, 0x803ac667, 0x84fbdbd0, 0x9abc8bd5, 0x9e7d9662, 0x933eb0bb, 0x97ffad0c, 0xafb010b1, 0xab710d06, 0xa6322bdf, 0xa2f33668, 0xbcb4666d, 0xb8757bda, 0xb5365d03, 0xb1f740b4
];

// generated from 1 << i, except for 32
const masks = [
    0x00000000, 0x00000001, 0x00000003, 0x00000007, 0x0000000f, 0x0000001f, 0x0000003f, 0x0000007f, 0x000000ff, 0x000001ff, 0x000003ff, 0x000007ff, 0x00000fff, 0x00001fff, 0x00003fff, 0x00007fff, 0x0000ffff, 0x0001ffff, 0x0003ffff, 0x0007ffff,
    0x000fffff, 0x001fffff, 0x003fffff, 0x007fffff, 0x00ffffff, 0x01ffffff, 0x03ffffff, 0x07ffffff, 0x0fffffff, 0x1fffffff, 0x3fffffff, -0x80000000
];

function createOrderedHuffmanTable(lengths) {
    const z = [];
    for (let i = 0; i < lengths.length; i += 1) {
        z.push([i, lengths[i]]);
    }
    z.push([lengths.length, -1]);
    const table = [];
    let start = z[0][0];
    let bits = z[0][1];
    for (let i = 0; i < z.length; i += 1) {
        const finish = z[i][0];
        const endbits = z[i][1];
        if (bits) {
            for (let code = start; code < finish; code += 1) {
                table.push({ code, bits, symbol: undefined });
            }
        }
        start = finish;
        bits = endbits;
        if (endbits === -1) {
            break;
        }
    }
    table.sort((a, b) => a.bits - b.bits || a.code - b.code);
    let tempBits = 0;
    let symbol = -1;
    const fastAccess = [];
    let current;
    for (let i = 0; i < table.length; i += 1) {
        const t = table[i];
        symbol += 1;
        if (t.bits !== tempBits) {
            symbol <<= t.bits - tempBits;
            tempBits = t.bits;
            current = fastAccess[tempBits] = {};
        }
        t.symbol = symbol;
        current[symbol] = t;
    }
    return {
        table,
        fastAccess
    };
}

function bwtReverse(src, primary) {
    if (primary < 0 || primary >= src.length) {
        throw RangeError('Out of bound');
    }
    const unsorted = src.slice();
    src.sort((a, b) => a - b);
    const start = {};
    for (let i = src.length - 1; i >= 0; i -= 1) {
        start[src[i]] = i;
    }
    const links = [];
    for (let i = 0; i < src.length; i += 1) {
        links.push(start[unsorted[i]]++); // eslint-disable-line no-plusplus
    }
    let i;
    const first = src[(i = primary)];
    const ret = [];
    for (let j = 1; j < src.length; j += 1) {
        const x = src[(i = links[i])];
        if (x === undefined) {
            ret.push(255);
        } else {
            ret.push(x);
        }
    }
    ret.push(first);
    ret.reverse();
    return ret;
}

export default class BZip2 {
    static decompress(bytes, checkCRC = false) {
        let index = 0;
        let bitfield = 0;
        let bits = 0;
        const read = n => {
            if (n >= 32) {
                const nd = n >> 1;
                return read(nd) * (1 << nd) + read(n - nd);
            }
            while (bits < n) {
                bitfield = (bitfield << 8) + bytes[index];
                index += 1;
                bits += 8;
            }
            const m = masks[n];
            const r = (bitfield >> (bits - n)) & m;
            bits -= n;
            bitfield &= ~(m << bits);
            return r;
        };

        // const magic = read(16);
        // if (magic !== 0x425A) { // 'BZ'
        //     throw new Error('Invalid magic');
        // }
        // const method = read(8);
        // if (method !== 0x68) { // h for huffman
        //     throw new Error('Invalid method');
        // }

        // let blocksize = read(8);
        // if (blocksize >= 49 && blocksize <= 57) { // 1..9
        //     blocksize -= 48;
        // } else {
        //     throw new Error('Invalid blocksize');
        // }

        let out = new Uint8Array(bytes.length * 1.5);
        let outIndex = 0;
        let newCRC = -1;
        while (true) {
            const blocktype = read(48);
            const crc = read(32) | 0;
            if (blocktype === 0x314159265359) {
                if (read(1)) {
                    throw new Error('do not support randomised');
                }
                const pointer = read(24);
                const used = [];
                const usedGroups = read(16);
                for (let i = 1 << 15; i > 0; i >>= 1) {
                    if (!(usedGroups & i)) {
                        for (let j = 0; j < 16; j += 1) {
                            used.push(false);
                        }
                        continue; // eslint-disable-line no-continue
                    }
                    const usedChars = read(16);
                    for (let j = 1 << 15; j > 0; j >>= 1) {
                        used.push(!!(usedChars & j));
                    }
                }
                const groups = read(3);
                if (groups < 2 || groups > 6) {
                    throw new Error('Invalid number of huffman groups');
                }
                const selectorsUsed = read(15);
                const selectors = [];
                const mtf = Array.from({ length: groups }, (_, i) => i);
                for (let i = 0; i < selectorsUsed; i += 1) {
                    let c = 0;
                    while (read(1)) {
                        c += 1;
                        if (c >= groups) {
                            throw new Error('MTF table out of range');
                        }
                    }
                    const v = mtf[c];
                    for (let j = c; j > 0; mtf[j] = mtf[--j]) {
                        // eslint-disable-line no-plusplus
                        // nothing
                    }
                    selectors.push(v);
                    mtf[0] = v;
                }
                const symbolsInUse = used.reduce((a, b) => a + b, 0) + 2;
                const tables = [];
                for (let i = 0; i < groups; i += 1) {
                    let length = read(5);
                    const lengths = [];
                    for (let j = 0; j < symbolsInUse; j += 1) {
                        if (length < 0 || length > 20) {
                            throw new Error('Huffman group length outside range');
                        }
                        while (read(1)) {
                            length -= read(1) * 2 - 1;
                        }
                        lengths.push(length);
                    }
                    tables.push(createOrderedHuffmanTable(lengths));
                }
                const favourites = [];
                for (let i = 0; i < used.length - 1; i += 1) {
                    if (used[i]) {
                        favourites.push(i);
                    }
                }
                let decoded = 0;
                let selectorPointer = 0;
                let t;
                let r;
                let repeat = 0;
                let repeatPower = 0;
                const buffer = [];
                while (true) {
                    decoded -= 1;
                    if (decoded <= 0) {
                        decoded = 50;
                        if (selectorPointer <= selectors.length) {
                            t = tables[selectors[selectorPointer]];
                            selectorPointer += 1;
                        }
                    }
                    for (const b in t.fastAccess) {
                        if (!Object.prototype.hasOwnProperty.call(t.fastAccess, b)) {
                            continue; // eslint-disable-line no-continue
                        }
                        if (bits < b) {
                            bitfield = (bitfield << 8) + bytes[index];
                            index += 1;
                            bits += 8;
                        }
                        r = t.fastAccess[b][bitfield >> (bits - b)];
                        if (r) {
                            bitfield &= masks[(bits -= b)];
                            r = r.code;
                            break;
                        }
                    }
                    if (r >= 0 && r <= 1) {
                        if (repeat === 0) {
                            repeatPower = 1;
                        }
                        repeat += repeatPower << r;
                        repeatPower <<= 1;
                        continue; // eslint-disable-line no-continue
                    } else {
                        const v = favourites[0];
                        for (; repeat > 0; repeat -= 1) {
                            buffer.push(v);
                        }
                    }
                    if (r === symbolsInUse - 1) {
                        break;
                    } else {
                        const v = favourites[r - 1];
                        // eslint-disable-next-line no-plusplus
                        for (let j = r - 1; j > 0; favourites[j] = favourites[--j]) {
                            // nothing
                        }
                        favourites[0] = v;
                        buffer.push(v);
                    }
                }
                const nt = bwtReverse(buffer, pointer);
                let i = 0;
                while (i < nt.length) {
                    const c = nt[i];
                    let count = 1;
                    if (i < nt.length - 4 && nt[i + 1] === c && nt[i + 2] === c && nt[i + 3] === c) {
                        count = nt[i + 4] + 4;
                        i += 5;
                    } else {
                        i += 1;
                    }
                    if (outIndex + count >= out.length) {
                        const old = out;
                        out = new Uint8Array(old.length * 2);
                        out.set(old);
                    }
                    for (let j = 0; j < count; j += 1) {
                        if (checkCRC) {
                            newCRC = (newCRC << 8) ^ crc32Table[((newCRC >> 24) ^ c) & 0xff];
                        }
                        out[outIndex] = c;
                        outIndex += 1;
                    }
                }
                if (checkCRC) {
                    const calculatedCRC = newCRC ^ -1;
                    if (calculatedCRC !== crc) {
                        throw new Error(`CRC mismatch: ${calculatedCRC} !== ${crc}`);
                    }
                    newCRC = -1;
                }
            } else if (blocktype === 0x177245385090) {
                read(bits & 0x07); // pad align
                break;
            } else {
                throw new Error('Invalid bz2 blocktype');
            }
        }
        return out.subarray(0, outIndex);
    }

    static compress(src, prependLength = false) {
        if (src instanceof Packet) {
            src = src.data;
        }

        let time = Date.now();
        let path = `dump/${time}.tmp`;

        fs.writeFileSync(path, src);
        child_process.execSync(`java -jar JagCompress.jar bz2 "${path}"`);
        fs.unlinkSync(path);

        let compressed = fs.readFileSync(path + '.bz2');
        fs.unlinkSync(path + '.bz2');
        if (prependLength) {
            compressed[0] = src.length >> 24;
            compressed[1] = src.length >> 16;
            compressed[2] = src.length >> 8;
            compressed[3] = src.length;
        }
        return compressed;
    }

    static compressMany(files, prependLength = false) {
        if (!files.length) {
            return;
        }

        let cmd = 'java -jar JagCompress.jar bz2';
        for (let i = 0; i < files.length; i++) {
            // enforce a limit of 2047 chars per command
            if (cmd.length + (files[i].length + 3) > 2047) {
                child_process.execSync(cmd);
                cmd = 'java -jar JagCompress.jar bz2';
            }

            cmd += ` "${files[i]}"`;
        }

        if (cmd.length > 20) {
            child_process.execSync(cmd);
        }

        if (prependLength) {
            for (let i = 0; i < files.length; i++) {
                let length = fs.statSync(files[i]).size;
                let compressed = fs.readFileSync(files[i] + '.bz2');

                compressed[0] = length >> 24;
                compressed[1] = length >> 16;
                compressed[2] = length >> 8;
                compressed[3] = length;

                fs.writeFileSync(files[i] + '.bz2', compressed);
            }
        }
    }
}
