import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import IdkType from '#lostcity/cache/IdkType.js';

describe('IdkType', () => {
    describe('static load', () => {
        it('should load data from idk.dat', () => {
            const dat = new Packet();

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(dat);

            IdkType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/idk.dat');
        });

        it('should return early if idk.dat does not exist', () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            Packet.load = jest.fn().mockReturnValue(undefined);

            expect(Packet.load).not.toHaveBeenCalled();
        });

        it('test get', () => {
            const packet = new Packet();
            packet.p2(1);
            packet.p1(250); // opcode
            packet.pjstr('jordan'); //debugname
            packet.p1(0); // break
            packet.pos = 0;

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IdkType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/idk.dat');
            expect(IdkType.get(0).debugname).toBe('jordan');
        });

        it('test get id', () => {
            const packet = new Packet();
            packet.p2(1);
            packet.p1(250); // opcode
            packet.pjstr('jordan'); //debugname
            packet.p1(0); // break
            packet.pos = 0;

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IdkType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/idk.dat');
            expect(IdkType.getId('jordan')).toBe(0);
        });

        it('test get by name', () => {
            const packet = new Packet();
            packet.p2(1);
            packet.p1(250); // opcode
            packet.pjstr('jordan'); //debugname
            packet.p1(0); // break
            packet.pos = 0;

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IdkType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/idk.dat');
            expect(IdkType.getByName('jordan')?.debugname).toBe('jordan');
        });

        it('test get by name -1', () => {
            const packet = new Packet();

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IdkType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/idk.dat');
            expect(IdkType.getByName('jordan')).toBeNull();
        });
    });

    describe('decode', () => {
        it('decoded idk matches input packet data', () => {
            const packet = new Packet();
            packet.p1(1); // opcode
            packet.p1(69); // type

            packet.p1(2); // opcode
            packet.p1(1); // count
            packet.p2(69); // model

            packet.p1(3); // opcode

            packet.p1(40); // opcode
            packet.p2(69); // recol_s

            packet.p1(50); // opcode
            packet.p2(69); // recol_d

            packet.p1(60); // opcode
            packet.p2(69); // heads

            packet.p1(250); // opcode
            packet.pjstr('jordan'); //debugname

            packet.p1(0); // break
            packet.pos = 0;

            const idk = new IdkType(69);
            idk.decodeType(packet);

            expect(idk.id).toBe(69);
            expect(idk.type).toBe(69);
            expect(idk.models.length).toBe(1);
            expect(idk.models[0]).toBe(69);
            expect(idk.disable).toBe(true);
            expect(idk.recol_s.length).toBe(10);
            expect(idk.recol_s[0]).toBe(69);
            expect(idk.recol_d.length).toBe(10);
            expect(idk.recol_d[0]).toBe(69);
            expect(idk.heads.length).toBe(10);
            expect(idk.heads[0]).toBe(69);
            expect(idk.debugname).toBe('jordan');
        });
    });
});
