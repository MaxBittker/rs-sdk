import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import Component from '#lostcity/cache/Component.js';

describe('Component', () => {
    describe('static load', () => {
        it('should load data from interface.dat', () => {
            const dat = Packet.alloc(0);

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(dat);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/server/interface.dat');
        });

        it('should return early if interface.dat does not exist', () => {
            fs.existsSync = vi.fn().mockReturnValue(false);
            Packet.load = vi.fn().mockReturnValue(undefined);

            expect(Packet.load).not.toHaveBeenCalled();
        });

        it('test get', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/server/interface.dat');
            expect(Component.get(0).comName).toBe('jordan');

            packet.release();
        });

        it('test get id', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/server/interface.dat');
            expect(Component.getId('jordan')).toBe(0);

            packet.release();
        });

        it('test get by name', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/server/interface.dat');
            expect(Component.getByName('jordan')?.comName).toBe('jordan');

            packet.release();
        });

        it.skip('test get by name -1', () => {
            const packet = Packet.alloc(0);

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/server/interface.dat');
            expect(Component.getByName('jordan')).toBeNull();

            packet.release();
        });
    });

    describe('decode', () => {
        it('decoded if type layer', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(0); // type
            packet.p1(0); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.p2(6969); // scroll
            packet.p1(0); // hide

            packet.p1(1); // childCount
            packet.p2(6969); // childId
            packet.p2(6969); // childX
            packet.p2(6969); // childY

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(0);
            expect(com.buttonType).toBe(0);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.scroll).toBe(6969);
            expect(com.hide).toBeFalsy();

            expect(com.childId?.length).toBe(1);
            expect(com.childX?.length).toBe(1);
            expect(com.childY?.length).toBe(1);
            expect(com.childId![0]).toBe(6969);
            expect(com.childX![0]).toBe(6969);
            expect(com.childY![0]).toBe(6969);

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.interactable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.marginX).toBe(0);
            expect(com.marginY).toBe(0);
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.inventoryOptions).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.center).toBeFalsy();
            expect(com.font).toBe(0);
            expect(com.shadowed).toBeFalsy();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.colour).toBe(0);
            expect(com.activeColour).toBe(0);
            expect(com.overColour).toBe(0);
            expect(com.graphic).toBeNull();
            expect(com.activeGraphic).toBeNull();
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.actionVerb).toBeNull();
            expect(com.action).toBeNull();
            expect(com.actionTarget).toBe(-1);
            expect(com.option).toBeNull();

            packet.release();
        });

        it('decoded if type inventory', () => {
            const packet = Packet.alloc(1);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(2); // type
            packet.p1(0); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.p1(1); // draggable
            packet.p1(1); // interactable
            packet.p1(1); // usable
            packet.p1(69); // marginX
            packet.p1(69); // marginX
            for (let index = 0; index < 20; index++) {
                if (index == 0) {
                    packet.p1(1);
                    packet.p2(6969); // inventorySlotOffsetX
                    packet.p2(6969); // inventorySlotOffsetY
                    packet.pjstr('jordan'); // inventorySlotGraphic
                } else {
                    packet.p1(0);
                }
            }

            for (let index = 0; index < 5; index++) {
                packet.pjstr('jordan'); // inventoryOptions
            }

            packet.pjstr('pazaz');
            packet.pjstr('pazaz');
            packet.p2(6969);

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(2);
            expect(com.buttonType).toBe(0);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.draggable).toBeTruthy();
            expect(com.interactable).toBeTruthy();
            expect(com.usable).toBeTruthy();
            expect(com.marginX).toBe(69);
            expect(com.marginY).toBe(69);

            expect(com.inventorySlotOffsetX?.length).toBe(20);
            expect(com.inventorySlotOffsetY?.length).toBe(20);
            expect(com.inventorySlotGraphic?.length).toBe(20);
            expect(com.inventorySlotOffsetX![0]).toBe(6969);
            expect(com.inventorySlotOffsetY![0]).toBe(6969);
            expect(com.inventorySlotGraphic![0]).toBe('jordan');
            for (let index = 1; index < 20; index++) {
                expect(com.inventorySlotOffsetX![index]).toBe(0);
                expect(com.inventorySlotOffsetY![index]).toBe(0);
                expect(com.inventorySlotGraphic![index]).toBeNull();
            }

            expect(com.inventoryOptions?.length).toBe(5);
            for (let index = 0; index < 5; index++) {
                expect(com.inventoryOptions![index]).toBe('jordan');
            }

            expect(com.actionVerb).toBe('pazaz');
            expect(com.action).toBe('pazaz');
            expect(com.actionTarget).toBe(6969);

            // defaults
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.center).toBeFalsy();
            expect(com.font).toBe(0);
            expect(com.shadowed).toBeFalsy();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.colour).toBe(0);
            expect(com.activeColour).toBe(0);
            expect(com.overColour).toBe(0);
            expect(com.graphic).toBeNull();
            expect(com.activeGraphic).toBeNull();
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.option).toBeNull();

            packet.release();
        });

        it('decoded if type rect', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(3); // type
            packet.p1(0); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.p1(1); // fill
            packet.p4(69696969); // colour
            packet.p4(69696969); // activeColour
            packet.p4(420420420); // overColour

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(3);
            expect(com.buttonType).toBe(0);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.fill).toBeTruthy();
            expect(com.colour).toBe(69696969);
            expect(com.activeColour).toBe(69696969);
            expect(com.overColour).toBe(420420420);

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.interactable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.marginX).toBe(0);
            expect(com.marginY).toBe(0);
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.inventoryOptions).toBeNull();
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.center).toBeFalsy();
            expect(com.font).toBe(0);
            expect(com.shadowed).toBeFalsy();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.graphic).toBeNull();
            expect(com.activeGraphic).toBeNull();
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.actionVerb).toBeNull();
            expect(com.action).toBeNull();
            expect(com.actionTarget).toBe(-1);
            expect(com.option).toBeNull();

            packet.release();
        });

        it('decoded if type text', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(4); // type
            packet.p1(0); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.p1(1); // center
            packet.p1(69); // font
            packet.p1(1); // shadowed
            packet.pjstr('jordan'); // text
            packet.pjstr('very tall'); // activeText
            packet.p4(69696969); // colour
            packet.p4(69696969); // activeColour
            packet.p4(420420420); // overColour

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(4);
            expect(com.buttonType).toBe(0);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.center).toBeTruthy();
            expect(com.font).toBe(69);
            expect(com.shadowed).toBeTruthy();
            expect(com.text).toBe('jordan');
            expect(com.activeText).toBe('very tall');
            expect(com.colour).toBe(69696969);
            expect(com.activeColour).toBe(69696969);
            expect(com.overColour).toBe(420420420);

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.interactable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.marginX).toBe(0);
            expect(com.marginY).toBe(0);
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.inventoryOptions).toBeNull();
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.graphic).toBeNull();
            expect(com.activeGraphic).toBeNull();
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.actionVerb).toBeNull();
            expect(com.action).toBeNull();
            expect(com.actionTarget).toBe(-1);
            expect(com.option).toBeNull();

            packet.release();
        });

        it('decoded if type sprite', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(5); // type
            packet.p1(0); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.pjstr('jordan');
            packet.pjstr('jordan');

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(5);
            expect(com.buttonType).toBe(0);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.graphic).toBe('jordan');
            expect(com.activeGraphic).toBe('jordan');

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.interactable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.marginX).toBe(0);
            expect(com.marginY).toBe(0);
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.inventoryOptions).toBeNull();
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.center).toBeFalsy();
            expect(com.font).toBe(0);
            expect(com.shadowed).toBeFalsy();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.colour).toBe(0);
            expect(com.activeColour).toBe(0);
            expect(com.overColour).toBe(0);
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.actionVerb).toBeNull();
            expect(com.action).toBeNull();
            expect(com.actionTarget).toBe(-1);
            expect(com.option).toBeNull();

            packet.release();
        });

        it('decoded if type model', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(6); // type
            packet.p1(0); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.p1(0); // model
            packet.p1(0); // activeModel
            packet.p1(0); // anim
            packet.p1(0); // activeAnim
            packet.p2(42069); // zoom
            packet.p2(42069); // xan
            packet.p2(42069); // yan

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(6);
            expect(com.buttonType).toBe(0);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.model).toBe(0);
            expect(com.activeModel).toBe(0);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(42069);
            expect(com.xan).toBe(42069);
            expect(com.yan).toBe(42069);

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.interactable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.marginX).toBe(0);
            expect(com.marginY).toBe(0);
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.inventoryOptions).toBeNull();
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.graphic).toBeNull();
            expect(com.activeGraphic).toBeNull();
            expect(com.center).toBeFalsy();
            expect(com.font).toBe(0);
            expect(com.shadowed).toBeFalsy();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.colour).toBe(0);
            expect(com.activeColour).toBe(0);
            expect(com.overColour).toBe(0);
            expect(com.actionVerb).toBeNull();
            expect(com.action).toBeNull();
            expect(com.actionTarget).toBe(-1);
            expect(com.option).toBeNull();

            packet.release();
        });

        it('decoded if type inventory text', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(7); // type
            packet.p1(0); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.p1(1); // center
            packet.p1(69); // font
            packet.p1(1); // shadowed
            packet.p4(4206969); // colour
            packet.p2(6969); // marginX
            packet.p2(6969); // marginY
            packet.p1(1); // interactable
            for (let index = 0; index < 5; index++) {
                packet.pjstr('pazaz'); // inventoryOptions
            }

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(7);
            expect(com.buttonType).toBe(0);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.center).toBeTruthy();
            expect(com.font).toBe(69);
            expect(com.shadowed).toBeTruthy();
            expect(com.colour).toBe(4206969);
            expect(com.marginX).toBe(6969);
            expect(com.marginY).toBe(6969);
            expect(com.interactable).toBeTruthy();
            for (let index = 0; index < 5; index++) {
                expect(com.inventoryOptions![index]).toBe('pazaz');
            }

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.graphic).toBeNull();
            expect(com.activeGraphic).toBeNull();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.activeColour).toBe(0);
            expect(com.overColour).toBe(0);
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.actionVerb).toBeNull();
            expect(com.action).toBeNull();
            expect(com.actionTarget).toBe(-1);
            expect(com.option).toBeNull();

            packet.release();
        });

        it('decoded if button option type', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(5); // type
            packet.p1(1); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.pjstr('jordan');
            packet.pjstr('jordan');
            packet.pjstr('subaru');

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(5);
            expect(com.buttonType).toBe(1);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.graphic).toBe('jordan');
            expect(com.activeGraphic).toBe('jordan');
            expect(com.option).toBe('subaru');

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.interactable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.marginX).toBe(0);
            expect(com.marginY).toBe(0);
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.inventoryOptions).toBeNull();
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.center).toBeFalsy();
            expect(com.font).toBe(0);
            expect(com.shadowed).toBeFalsy();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.colour).toBe(0);
            expect(com.activeColour).toBe(0);
            expect(com.overColour).toBe(0);
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.actionVerb).toBeNull();
            expect(com.action).toBeNull();
            expect(com.actionTarget).toBe(-1);

            packet.release();
        });

        it('decoded if button action type', () => {
            const packet = Packet.alloc(0);
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pbool(false); // overlay
            packet.p1(5); // type
            packet.p1(2); // buttonType
            packet.p2(6969); // clientCode
            packet.p2(6969); // width
            packet.p2(6969); // height
            packet.p1(0); // overLayer

            packet.p1(1); // comparatorCount
            packet.p1(69); // scriptComparator
            packet.p2(6969); // scriptOperand

            packet.p1(1); // scriptCount
            packet.p2(1); // opcodeCount
            packet.p2(6969); // script

            packet.pjstr('jordan');
            packet.pjstr('jordan');
            packet.pjstr('subaru');
            packet.pjstr('sti');
            packet.p2(42069);

            packet.pos = 0;

            fs.existsSync = vi.fn().mockReturnValue(true);
            Packet.load = vi.fn().mockReturnValue(packet);

            try {
                Component.load('/path/to/data');
            } catch (e) { /* empty */ }

            const com = Component.get(0);

            expect(com.comName).toBe('jordan');
            expect(com.overlay).toBeFalsy();
            expect(com.type).toBe(5);
            expect(com.buttonType).toBe(2);
            expect(com.clientCode).toBe(6969);
            expect(com.width).toBe(6969);
            expect(com.height).toBe(6969);
            expect(com.overLayer).toBe(-1);

            expect(com.scriptComparator?.length).toBe(1);
            expect(com.scriptOperand?.length).toBe(1);
            expect(com.scriptComparator![0]).toBe(69);
            expect(com.scriptOperand![0]).toBe(6969);

            expect(com.graphic).toBe('jordan');
            expect(com.activeGraphic).toBe('jordan');
            expect(com.actionVerb).toBe('subaru');
            expect(com.action).toBe('sti');
            expect(com.actionTarget).toBe(42069);

            // defaults
            expect(com.draggable).toBeFalsy();
            expect(com.interactable).toBeFalsy();
            expect(com.usable).toBeFalsy();
            expect(com.marginX).toBe(0);
            expect(com.marginY).toBe(0);
            expect(com.inventorySlotOffsetX).toBeNull();
            expect(com.inventorySlotOffsetY).toBeNull();
            expect(com.inventorySlotGraphic).toBeNull();
            expect(com.inventoryOptions).toBeNull();
            expect(com.scroll).toBe(0);
            expect(com.hide).toBeFalsy();
            expect(com.childId).toBeNull();
            expect(com.childX).toBeNull();
            expect(com.childY).toBeNull();
            expect(com.fill).toBeFalsy();
            expect(com.center).toBeFalsy();
            expect(com.font).toBe(0);
            expect(com.shadowed).toBeFalsy();
            expect(com.text).toBeNull();
            expect(com.activeText).toBeNull();
            expect(com.colour).toBe(0);
            expect(com.activeColour).toBe(0);
            expect(com.overColour).toBe(0);
            expect(com.model).toBe(-1);
            expect(com.activeModel).toBe(-1);
            expect(com.anim).toBe(-1);
            expect(com.activeAnim).toBe(-1);
            expect(com.zoom).toBe(0);
            expect(com.xan).toBe(0);
            expect(com.yan).toBe(0);
            expect(com.option).toBeNull();

            packet.release();
        });
    });
});
