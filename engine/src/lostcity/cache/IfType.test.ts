import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import IfType from '#lostcity/cache/IfType.js';

describe('IfType', () => {
    describe('static load', () => {
        it('should load data from interface.dat', () => {
            const dat = new Packet();

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(dat);

            IfType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/interface.dat');
        });

        it('should return early if interface.dat does not exist', () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            Packet.load = jest.fn().mockReturnValue(undefined);

            expect(Packet.load).not.toHaveBeenCalled();
        });

        it('test get', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pos = 0;

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/interface.dat');
            expect(IfType.get(0).comName).toBe('jordan');
        });

        it('test get id', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pos = 0;

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/interface.dat');
            expect(IfType.getId('jordan')).toBe(0);
        });

        it('test get by name', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
            packet.pos = 0;

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/interface.dat');
            expect(IfType.getByName('jordan')?.comName).toBe('jordan');
        });

        it('test get by name -1', () => {
            const packet = new Packet();

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            expect(Packet.load).toHaveBeenCalledWith('/path/to/data/interface.dat');
            expect(IfType.getByName('jordan')).toBeNull();
        });
    });

    describe('decode', () => {
        it('decoded if type layer', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(0);
            expect(ifType.buttonType).toBe(0);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.scroll).toBe(6969);
            expect(ifType.hide).toBeFalsy();

            expect(ifType.childId?.length).toBe(1);
            expect(ifType.childX?.length).toBe(1);
            expect(ifType.childY?.length).toBe(1);
            expect(ifType.childId![0]).toBe(6969);
            expect(ifType.childX![0]).toBe(6969);
            expect(ifType.childY![0]).toBe(6969);

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.interactable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.marginX).toBe(0);
            expect(ifType.marginY).toBe(0);
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.inventoryOptions).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.center).toBeFalsy();
            expect(ifType.font).toBe(0);
            expect(ifType.shadowed).toBeFalsy();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.colour).toBe(0);
            expect(ifType.activeColour).toBe(0);
            expect(ifType.overColour).toBe(0);
            expect(ifType.graphic).toBeNull();
            expect(ifType.activeGraphic).toBeNull();
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.actionVerb).toBeNull();
            expect(ifType.action).toBeNull();
            expect(ifType.actionTarget).toBe(-1);
            expect(ifType.option).toBeNull();
        });

        it('decoded if type inventory', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(2);
            expect(ifType.buttonType).toBe(0);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.draggable).toBeTruthy();
            expect(ifType.interactable).toBeTruthy();
            expect(ifType.usable).toBeTruthy();
            expect(ifType.marginX).toBe(69);
            expect(ifType.marginY).toBe(69);

            expect(ifType.inventorySlotOffsetX?.length).toBe(20);
            expect(ifType.inventorySlotOffsetY?.length).toBe(20);
            expect(ifType.inventorySlotGraphic?.length).toBe(20);
            expect(ifType.inventorySlotOffsetX![0]).toBe(6969);
            expect(ifType.inventorySlotOffsetY![0]).toBe(6969);
            expect(ifType.inventorySlotGraphic![0]).toBe('jordan');
            for (let index = 1; index < 20; index++) {
                expect(ifType.inventorySlotOffsetX![index]).toBe(0);
                expect(ifType.inventorySlotOffsetY![index]).toBe(0);
                expect(ifType.inventorySlotGraphic![index]).toBeNull();
            }

            expect(ifType.inventoryOptions?.length).toBe(5);
            for (let index = 0; index < 5; index++) {
                expect(ifType.inventoryOptions![index]).toBe('jordan');
            }

            expect(ifType.actionVerb).toBe('pazaz');
            expect(ifType.action).toBe('pazaz');
            expect(ifType.actionTarget).toBe(6969);

            // defaults
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.center).toBeFalsy();
            expect(ifType.font).toBe(0);
            expect(ifType.shadowed).toBeFalsy();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.colour).toBe(0);
            expect(ifType.activeColour).toBe(0);
            expect(ifType.overColour).toBe(0);
            expect(ifType.graphic).toBeNull();
            expect(ifType.activeGraphic).toBeNull();
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.option).toBeNull();
        });

        it('decoded if type rect', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(3);
            expect(ifType.buttonType).toBe(0);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.fill).toBeTruthy();
            expect(ifType.colour).toBe(69696969);
            expect(ifType.activeColour).toBe(69696969);
            expect(ifType.overColour).toBe(420420420);

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.interactable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.marginX).toBe(0);
            expect(ifType.marginY).toBe(0);
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.inventoryOptions).toBeNull();
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.center).toBeFalsy();
            expect(ifType.font).toBe(0);
            expect(ifType.shadowed).toBeFalsy();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.graphic).toBeNull();
            expect(ifType.activeGraphic).toBeNull();
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.actionVerb).toBeNull();
            expect(ifType.action).toBeNull();
            expect(ifType.actionTarget).toBe(-1);
            expect(ifType.option).toBeNull();
        });

        it('decoded if type text', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(4);
            expect(ifType.buttonType).toBe(0);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.center).toBeTruthy();
            expect(ifType.font).toBe(69);
            expect(ifType.shadowed).toBeTruthy();
            expect(ifType.text).toBe('jordan');
            expect(ifType.activeText).toBe('very tall');
            expect(ifType.colour).toBe(69696969);
            expect(ifType.activeColour).toBe(69696969);
            expect(ifType.overColour).toBe(420420420);

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.interactable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.marginX).toBe(0);
            expect(ifType.marginY).toBe(0);
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.inventoryOptions).toBeNull();
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.graphic).toBeNull();
            expect(ifType.activeGraphic).toBeNull();
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.actionVerb).toBeNull();
            expect(ifType.action).toBeNull();
            expect(ifType.actionTarget).toBe(-1);
            expect(ifType.option).toBeNull();
        });

        it('decoded if type sprite', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(5);
            expect(ifType.buttonType).toBe(0);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.graphic).toBe('jordan');
            expect(ifType.activeGraphic).toBe('jordan');

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.interactable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.marginX).toBe(0);
            expect(ifType.marginY).toBe(0);
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.inventoryOptions).toBeNull();
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.center).toBeFalsy();
            expect(ifType.font).toBe(0);
            expect(ifType.shadowed).toBeFalsy();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.colour).toBe(0);
            expect(ifType.activeColour).toBe(0);
            expect(ifType.overColour).toBe(0);
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.actionVerb).toBeNull();
            expect(ifType.action).toBeNull();
            expect(ifType.actionTarget).toBe(-1);
            expect(ifType.option).toBeNull();
        });

        it('decoded if type model', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(6);
            expect(ifType.buttonType).toBe(0);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.model).toBe(0);
            expect(ifType.activeModel).toBe(0);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(42069);
            expect(ifType.xan).toBe(42069);
            expect(ifType.yan).toBe(42069);

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.interactable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.marginX).toBe(0);
            expect(ifType.marginY).toBe(0);
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.inventoryOptions).toBeNull();
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.graphic).toBeNull();
            expect(ifType.activeGraphic).toBeNull();
            expect(ifType.center).toBeFalsy();
            expect(ifType.font).toBe(0);
            expect(ifType.shadowed).toBeFalsy();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.colour).toBe(0);
            expect(ifType.activeColour).toBe(0);
            expect(ifType.overColour).toBe(0);
            expect(ifType.actionVerb).toBeNull();
            expect(ifType.action).toBeNull();
            expect(ifType.actionTarget).toBe(-1);
            expect(ifType.option).toBeNull();
        });

        it('decoded if type inventory text', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(7);
            expect(ifType.buttonType).toBe(0);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.center).toBeTruthy();
            expect(ifType.font).toBe(69);
            expect(ifType.shadowed).toBeTruthy();
            expect(ifType.colour).toBe(4206969);
            expect(ifType.marginX).toBe(6969);
            expect(ifType.marginY).toBe(6969);
            expect(ifType.interactable).toBeTruthy();
            for (let index = 0; index < 5; index++) {
                expect(ifType.inventoryOptions![index]).toBe('pazaz');
            }

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.graphic).toBeNull();
            expect(ifType.activeGraphic).toBeNull();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.activeColour).toBe(0);
            expect(ifType.overColour).toBe(0);
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.actionVerb).toBeNull();
            expect(ifType.action).toBeNull();
            expect(ifType.actionTarget).toBe(-1);
            expect(ifType.option).toBeNull();
        });

        it('decoded if button option type', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(5);
            expect(ifType.buttonType).toBe(1);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.graphic).toBe('jordan');
            expect(ifType.activeGraphic).toBe('jordan');
            expect(ifType.option).toBe('subaru');

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.interactable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.marginX).toBe(0);
            expect(ifType.marginY).toBe(0);
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.inventoryOptions).toBeNull();
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.center).toBeFalsy();
            expect(ifType.font).toBe(0);
            expect(ifType.shadowed).toBeFalsy();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.colour).toBe(0);
            expect(ifType.activeColour).toBe(0);
            expect(ifType.overColour).toBe(0);
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.actionVerb).toBeNull();
            expect(ifType.action).toBeNull();
            expect(ifType.actionTarget).toBe(-1);
        });

        it('decoded if button action type', () => {
            const packet = new Packet();
            packet.p2(1); // count
            packet.p2(0); // id
            packet.pjstr('jordan'); //comName
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

            fs.existsSync = jest.fn().mockReturnValue(true);
            Packet.load = jest.fn().mockReturnValue(packet);

            IfType.load('/path/to/data');

            const ifType = IfType.get(0);

            expect(ifType.comName).toBe('jordan');
            expect(ifType.type).toBe(5);
            expect(ifType.buttonType).toBe(2);
            expect(ifType.clientCode).toBe(6969);
            expect(ifType.width).toBe(6969);
            expect(ifType.height).toBe(6969);
            expect(ifType.overLayer).toBe(-1);

            expect(ifType.scriptComparator?.length).toBe(1);
            expect(ifType.scriptOperand?.length).toBe(1);
            expect(ifType.scriptComparator![0]).toBe(69);
            expect(ifType.scriptOperand![0]).toBe(6969);

            expect(ifType.graphic).toBe('jordan');
            expect(ifType.activeGraphic).toBe('jordan');
            expect(ifType.actionVerb).toBe('subaru');
            expect(ifType.action).toBe('sti');
            expect(ifType.actionTarget).toBe(42069);

            // defaults
            expect(ifType.draggable).toBeFalsy();
            expect(ifType.interactable).toBeFalsy();
            expect(ifType.usable).toBeFalsy();
            expect(ifType.marginX).toBe(0);
            expect(ifType.marginY).toBe(0);
            expect(ifType.inventorySlotOffsetX).toBeNull();
            expect(ifType.inventorySlotOffsetY).toBeNull();
            expect(ifType.inventorySlotGraphic).toBeNull();
            expect(ifType.inventoryOptions).toBeNull();
            expect(ifType.scroll).toBe(0);
            expect(ifType.hide).toBeFalsy();
            expect(ifType.childId).toBeNull();
            expect(ifType.childX).toBeNull();
            expect(ifType.childY).toBeNull();
            expect(ifType.fill).toBeFalsy();
            expect(ifType.center).toBeFalsy();
            expect(ifType.font).toBe(0);
            expect(ifType.shadowed).toBeFalsy();
            expect(ifType.text).toBeNull();
            expect(ifType.activeText).toBeNull();
            expect(ifType.colour).toBe(0);
            expect(ifType.activeColour).toBe(0);
            expect(ifType.overColour).toBe(0);
            expect(ifType.model).toBe(-1);
            expect(ifType.activeModel).toBe(-1);
            expect(ifType.anim).toBe(-1);
            expect(ifType.activeAnim).toBe(-1);
            expect(ifType.zoom).toBe(0);
            expect(ifType.xan).toBe(0);
            expect(ifType.yan).toBe(0);
            expect(ifType.option).toBeNull();
        });
    });
});
