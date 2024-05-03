import fs from 'fs';

import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';
import { shouldBuildFileAny } from '#lostcity/util/PackFile.js';

export function packClientWordenc() {
    if (!shouldBuildFileAny('data/src/wordenc', 'data/pack/client/wordenc')) {
        return;
    }

    console.log('Packing wordenc.jag');
    //console.time('wordenc.jag');

    /* order:
    'badenc.txt', 'fragmentsenc.txt', 'tldlist.txt', 'domainenc.txt'
    */

    const jag = new Jagfile();

    const badenc = fs
        .readFileSync('data/src/wordenc/badenc.txt', 'ascii')
        .replace(/\r/g, '')
        .split('\n')
        .filter(x => x.length);

    const badencout = Packet.alloc(2);
    badencout.p4(badenc.length);
    for (let i = 0; i < badenc.length; i++) {
        const [word, ...combinations] = badenc[i].split(' ');

        badencout.p1(word.length);
        for (let j = 0; j < word.length; j++) {
            badencout.p1(word.charCodeAt(j));
        }

        badencout.p1(combinations.length);
        for (let j = 0; j < combinations.length; j++) {
            const [a, b] = combinations[j].split(':');
            badencout.p1(a as unknown as number);
            badencout.p1(b as unknown as number);
        }
    }

    jag.write('badenc.txt', badencout);

    const fragmentsenc = fs
        .readFileSync('data/src/wordenc/fragmentsenc.txt', 'ascii')
        .replace(/\r/g, '')
        .split('\n')
        .filter(x => x.length);

    const fragmentsencout = Packet.alloc(2);
    fragmentsencout.p4(fragmentsenc.length);
    for (let i = 0; i < fragmentsenc.length; i++) {
        const fragment = Number(fragmentsenc[i]);

        fragmentsencout.p2(fragment);
    }

    jag.write('fragmentsenc.txt', fragmentsencout);

    const tldlist = fs
        .readFileSync('data/src/wordenc/tldlist.txt', 'ascii')
        .replace(/\r/g, '')
        .split('\n')
        .filter(x => x.length);

    const tldlistout = Packet.alloc(2);
    tldlistout.p4(tldlist.length);
    for (let i = 0; i < tldlist.length; i++) {
        const [tld, type] = tldlist[i].split(' ');

        tldlistout.p1(type as unknown as number);

        tldlistout.p1(tld.length);
        for (let j = 0; j < tld.length; j++) {
            tldlistout.p1(tld.charCodeAt(j));
        }
    }

    jag.write('tldlist.txt', tldlistout);

    const domainenc = fs
        .readFileSync('data/src/wordenc/domainenc.txt', 'ascii')
        .replace(/\r/g, '')
        .split('\n')
        .filter(x => x.length);

    const domainencout = Packet.alloc(2);
    domainencout.p4(domainenc.length);
    for (let i = 0; i < domainenc.length; i++) {
        const domain = domainenc[i];

        domainencout.p1(domain.length);
        for (let j = 0; j < domain.length; j++) {
            domainencout.p1(domain.charCodeAt(j));
        }
    }

    jag.write('domainenc.txt', domainencout);

    jag.save('data/pack/client/wordenc');
    badencout.release();
    fragmentsencout.release();
    tldlistout.release();
    domainencout.release();
    //console.timeEnd('wordenc.jag');
}
