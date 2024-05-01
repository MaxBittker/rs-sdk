import Packet2 from '#jagex2/io/Packet2.js';

import fs from 'fs';

import WordEnc from '#lostcity/cache/WordEnc.js';
import WordPack from '#jagex2/wordenc/WordPack.js';
import { packClientWordenc } from '#lostcity/tools/client/wordenc/pack.js';

/**
 * TODO: Remove race condition in how files are written to data/pack/client/wordenc
 * that requires this to be called at the top level of this test
 */
packClientWordenc();
describe('WordEnc', () => {
    describe('static load', () => {
        // TODO: This started failing once we switched to Packet2
        it.skip('should load data from wordenc', () => {
            const dat = new Packet2(new Uint8Array());

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet2.load = vi.fn().mockReturnValue(dat);

            WordEnc.load('/path/to/data');

            expect(Packet2.load).toHaveBeenCalledWith('/path/to/data/client/wordenc');
        });

        it('should return early if wordenc does not exist', () => {
            fs.existsSync = vi.fn().mockReturnValue(false);
            Packet2.load = vi.fn().mockReturnValue(undefined);

            expect(Packet2.load).not.toHaveBeenCalled();
        });
    });

    describe('filtering', () => {
        WordEnc.load('data/pack');
        // decoding from the client automatically parses toSentenceCase.
        // the test has to do it manually here for it to emulate from the client.

        it('should filter words', () => {
            expect(WordEnc.filter(WordPack.toSentenceCase('runescape dot com'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('runescape(dot)com'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('runescape.com'))).toBe('*************');
            expect(WordEnc.filter(WordPack.toSentenceCase('well fuck man'))).toBe('Well **** man');
            expect(WordEnc.filter(WordPack.toSentenceCase('google.com\\chrome'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('g00gle (dot) c0m \\ chrome'))).toBe('*************************');
            expect(WordEnc.filter(WordPack.toSentenceCase('g00gle hey (d0t) (c0m) (slash) chr0me'))).toBe('G00gle ******************************');
            expect(WordEnc.filter(WordPack.toSentenceCase('test(at)gmail(dot)com'))).toBe('Test(at)*************');
            expect(WordEnc.filter(WordPack.toSentenceCase('EF^&N*DGTFbnds7fyt8a^NEAFTBfdasBTFNB(*DS&YT'))).toBe('Ef^&n*dgtfbnds7fyt8a^neaftbfdasbtfnb(*ds&yt');
            expect(WordEnc.filter(WordPack.toSentenceCase('well, anyways. what is up homie? lol fuck i didnt mean to!!!!! ? uhhhh :)'))).toBe('Well, anyways. What is up homie? lol **** i didnt mean to!!!!! ? Uhhhh :)');
            expect(WordEnc.filter(WordPack.toSentenceCase('im so fucking bored'))).toBe('Im so ****ing bored');
            expect(WordEnc.filter(WordPack.toSentenceCase('i focking hate this sh!t'))).toBe('I ****ing hate thi******');
            expect(WordEnc.filter(WordPack.toSentenceCase('fuckign bit ch'))).toBe('****ign ******');

            expect(WordEnc.filter(WordPack.toSentenceCase('this is a badword.com'))).toBe('This is a ***********');
            expect(WordEnc.filter(WordPack.toSentenceCase('this is a badword.org'))).toBe('This is a ***********');
            expect(WordEnc.filter(WordPack.toSentenceCase('this is a badword.net'))).toBe('This is a ***********');
            expect(WordEnc.filter(WordPack.toSentenceCase('this is a badword.xyz'))).toBe('This is a badword.Xyz');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword.com is good'))).toBe('*********** is good');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword.org is good'))).toBe('*********** is good');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword.net is good'))).toBe('*********** is good');
            expect(WordEnc.filter(WordPack.toSentenceCase('fragment.xyz is good'))).toBe('Fragment.Xyz is good');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword (dot) com'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword (d0t) c0m'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword [dot] com'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword [d0t] c0m'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword {dot} com'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword {d0t} c0m'))).toBe('*****************');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword slash com'))).toBe('Badword slash ***');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword sl4sh c0m'))).toBe('Badword sl4sh ***');
            expect(WordEnc.filter(WordPack.toSentenceCase('badword slash c0m'))).toBe('Badword slash ***');
            expect(WordEnc.filter(WordPack.toSentenceCase('com dot badword'))).toBe('*** dot badword');
            expect(WordEnc.filter(WordPack.toSentenceCase('c0m d0t badword'))).toBe('*** d0t badword');
            expect(WordEnc.filter(WordPack.toSentenceCase('com, badword'))).toBe('***, badword');
            expect(WordEnc.filter(WordPack.toSentenceCase('c0m, badword'))).toBe('***, badword');

            expect(WordEnc.filter(WordPack.toSentenceCase('----vv vv vv rswalmart  c - 0 - nn sell cheap gold 1000k "="2.1(.u.s\'d)'))).toBe('----******** rswalmart c - 0 - nn sell cheap gold 1000k "="2.1(.*****)');
            expect(WordEnc.filter(WordPack.toSentenceCase('Web:---4 r s_gold_c"..0..""\'|\\/|""cheap rs gold -20 \'m\'=18.3\'$'))).toBe("Web:---4 r s_gold_********************* rs gold -20 'm'=18.3'$");
            expect(WordEnc.filter(WordPack.toSentenceCase('Cheap sell gold>google open:___\'fzf\'__c"..0..\'|\\/|"">20m=17.23$'))).toBe("Cheap sell gold>google open:___'fzf'__******************=17.23$");
            expect(WordEnc.filter(WordPack.toSentenceCase('..:::.4 r s g 0 l d..:::c:::0:::/y\\>>>20""m = 18.3----usd.'))).toBe('..:::.4 R s g 0 l ****************\\>>>***** = 18.3----Usd.');
        });

        it('should not filter words', () => {
            expect(WordEnc.filter(WordPack.toSentenceCase('runescape'))).toBe('Runescape');
            expect(WordEnc.filter(WordPack.toSentenceCase('hello@man'))).toBe('Hello@man');
            expect(WordEnc.filter(WordPack.toSentenceCase('(dot)'))).toBe('(Dot)');
            expect(WordEnc.filter(WordPack.toSentenceCase('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))).toBe('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
            expect(WordEnc.filter(WordPack.toSentenceCase('#######################'))).toBe('#######################');
            expect(WordEnc.filter(WordPack.toSentenceCase('hello world'))).toBe('Hello world');
        });
    });
});
