import Packet from '#jagex2/io/Packet.js';

import fs from 'fs';

import WordEnc from '#lostcity/cache/WordEnc.js';
import TextEncoder from '#jagex2/jstring/TextEncoder.js';

const RUN_TEST = false;

describe('WordEnc', () => {
    describe('static load', () => {
        it('should load data from wordenc', () => {
            const dat = new Packet();

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(dat);

            WordEnc.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/wordenc');
        });

        it('should return early if wordenc does not exist', () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            Packet.load = jest.fn().mockReturnValue(undefined);

            expect(Packet.load).not.toHaveBeenCalled();
        });
    });

    describe('filtering', () => {
        if (!RUN_TEST) {
            return;
        }
        WordEnc.load('data/pack/client');
        // decoding from the client automatically parses toSentenceCase.
        // the test has to do it manually here for it to emulate from the client.

        it('should filter words', () => {
            expect(WordEnc.filter(TextEncoder.toSentenceCase('runescape dot com'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('runescape(dot)com'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('runescape.com'))).toBe('*************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('well fuck man'))).toBe('Well **** man');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('google.com\\chrome'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('g00gle (dot) c0m \\ chrome'))).toBe('*************************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('g00gle hey (d0t) (c0m) (slash) chr0me'))).toBe('G00gle ******************************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('test(at)gmail(dot)com'))).toBe('Test(at)*************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('EF^&N*DGTFbnds7fyt8a^NEAFTBfdasBTFNB(*DS&YT'))).toBe('Ef^&n*dgtfbnds7fyt8a^neaftbfdasbtfnb(*ds&yt');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('well, anyways. what is up homie? lol fuck i didnt mean to!!!!! ? uhhhh :)'))).toBe('Well, anyways. What is up homie? lol **** i didnt mean to!!!!! ? Uhhhh :)');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('im so fucking bored'))).toBe('Im so ****ing bored');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('i focking hate this sh!t'))).toBe('I ****ing hate thi******');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('fuckign bit ch'))).toBe('****ign ******');

            expect(WordEnc.filter(TextEncoder.toSentenceCase('this is a badword.com'))).toBe('This is a ***********');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('this is a badword.org'))).toBe('This is a ***********');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('this is a badword.net'))).toBe('This is a ***********');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('this is a badword.xyz'))).toBe('This is a badword.Xyz');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword.com is good'))).toBe('*********** is good');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword.org is good'))).toBe('*********** is good');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword.net is good'))).toBe('*********** is good');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('fragment.xyz is good'))).toBe('Fragment.Xyz is good');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword (dot) com'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword (d0t) c0m'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword [dot] com'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword [d0t] c0m'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword {dot} com'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword {d0t} c0m'))).toBe('*****************');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword slash com'))).toBe('Badword slash ***');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword sl4sh c0m'))).toBe('Badword sl4sh ***');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('badword slash c0m'))).toBe('Badword slash ***');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('com dot badword'))).toBe('*** dot badword');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('c0m d0t badword'))).toBe('*** d0t badword');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('com, badword'))).toBe('***, badword');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('c0m, badword'))).toBe('***, badword');

            expect(WordEnc.filter(TextEncoder.toSentenceCase('----vv vv vv rswalmart  c - 0 - nn sell cheap gold 1000k "="2.1(.u.s\'d)'))).toBe('----******** rswalmart c - 0 - nn sell cheap gold 1000k "="2.1(.*****)');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('Web:---4 r s_gold_c"..0..""\'|\\/|""cheap rs gold -20 \'m\'=18.3\'$'))).toBe("Web:---4 r s_gold_********************* rs gold -20 'm'=18.3'$");
            expect(WordEnc.filter(TextEncoder.toSentenceCase('Cheap sell gold>google open:___\'fzf\'__c"..0..\'|\\/|"">20m=17.23$'))).toBe("Cheap sell gold>google open:___'fzf'__******************=17.23$");
            expect(WordEnc.filter(TextEncoder.toSentenceCase('..:::.4 r s g 0 l d..:::c:::0:::/y\\>>>20""m = 18.3----usd.'))).toBe('..:::.4 R s g 0 l ****************\\>>>***** = 18.3----Usd.');
        });

        it('should not filter words', () => {
            if (!RUN_TEST) {
                return;
            }
            expect(WordEnc.filter(TextEncoder.toSentenceCase('runescape'))).toBe('Runescape');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('hello@man'))).toBe('Hello@man');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('(dot)'))).toBe('(Dot)');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))).toBe('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('#######################'))).toBe('#######################');
            expect(WordEnc.filter(TextEncoder.toSentenceCase('hello world'))).toBe('Hello world');
        });
    });
});
