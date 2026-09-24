import { afterAll, describe, expect, mock, test } from 'bun:test';

mock.module('#3rdparty/tinymidipcm.js', () => ({
    stopMidi() {},
    setMidiVolume() {},
    playMidi() {}
}));
mock.module('#/client/MobileKeyboard.js', () => ({
    default: {
        draw() {},
        show() {},
        hide() {},
        isDisplayed: () => false,
        isWithinCanvasKeyboard: () => false,
        captureMouseDown() {},
        captureMouseUp() {},
        notifyTouchMove() {}
    }
}));

(globalThis as any).window = {
    audioContext: {
        currentTime: 0,
        destination: {},
        createGain() {
            return {
                gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
                connect() {}
            };
        },
        createBuffer() {
            return { copyToChannel() {} };
        },
        createBufferSource() {
            return { connect() {}, start() {}, stop() {} };
        }
    }
};
(globalThis as any).navigator = { userAgent: 'bun-test' };
// Later test files in the same process (lite/) need the real fetch to reach
// the game server; leaving this stub installed makes them all skip.
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async () => ({
    arrayBuffer: async () => new ArrayBuffer(0)
});
afterAll(() => {
    (globalThis as any).fetch = realFetch;
});
(globalThis as any).document = {
    hidden: false,
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null; },
    createElement(tag: string) {
        const element = {
            style: {},
            setAttribute() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {},
            focus() {},
            blur() {}
        };
        if (tag === 'canvas') {
            return {
                ...element,
                getContext: () => ({
                    clearRect() {},
                    drawImage() {},
                    getImageData() { return {}; }
                })
            };
        }
        return element;
    }
};

const { Client } = await import('../client/Client.js');
const { default: LocType } = await import('#/config/LocType.js');
const { default: ObjType } = await import('#/config/ObjType.js');
const { default: IfType } = await import('#/config/IfType.js');

const BUTTON_OK = 1;
const BUTTON_CLOSE = 3;

/** Install a component in the shared IfType registry the client reads from. */
function defineComponent(id: number, com: Record<string, unknown>): void {
    IfType.list[id] = { id, ...com } as never;
}

describe('ranged spell dispatch', () => {
    test('dispatches a combat spell when adjacency routing fails', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];
        const client = {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            localPlayer: { routeX: [1], routeZ: [1] },
            npc: { 42: { routeX: [5], routeZ: [6] } },
            tryMove: () => false,
            writePacketOpcode: (opcode: number) => opcodes.push(opcode)
        };

        const result = Client.prototype.spellOnNpc.call(client, 42, 1152);

        expect(result).toEqual({ success: true, routed: false });
        expect(opcodes).toEqual([181]); // ClientProt.OPNPCT
        expect(payload).toEqual([42, 1152]);
    });

    test('dispatches a combat spell at another player (OPPLAYERT)', () => {
        // Without this the only PvP magic was autocast, which needs a staff.
        const opcodes: number[] = [];
        const payload: number[] = [];
        const client = {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            localPlayer: { routeX: [1], routeZ: [1] },
            players: { 3: { routeX: [4], routeZ: [4] } },
            tryMove: () => true,
            writePacketOpcode: (opcode: number) => opcodes.push(opcode)
        };

        const result = Client.prototype.spellOnPlayer.call(client, 3, 1152);

        expect(result).toEqual({ success: true, routed: true });
        expect(opcodes).toEqual([240]); // ClientProt.OPPLAYERT
        expect(payload).toEqual([3, 1152]);
    });

    test('refuses to cast at a player the client cannot see', () => {
        const client = {
            ingame: true,
            out: { p2: () => { throw new Error('should not send'); } },
            localPlayer: { routeX: [1], routeZ: [1] },
            players: {},
            tryMove: () => true,
            writePacketOpcode: () => { throw new Error('should not send'); }
        };

        expect(Client.prototype.spellOnPlayer.call(client, 9, 1152))
            .toEqual({ success: false, reason: 'target_not_found' });
    });

    test('dispatches Telekinetic Grab even when adjacency routing fails', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];
        const client = {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            localPlayer: { routeX: [1], routeZ: [1] },
            mapBuildBaseX: 3200,
            mapBuildBaseZ: 3200,
            tryMove: () => false,
            writePacketOpcode: (opcode: number) => opcodes.push(opcode)
        };

        const result = Client.prototype.spellOnGroundItem.call(
            client,
            3205,
            3206,
            995,
            1151
        );

        expect(result).toEqual({ success: true, routed: false });
        expect(opcodes).toEqual([91]); // ClientProt.OPOBJT
        expect(payload).toEqual([3205, 3206, 995, 1151]);
    });
});

describe('interactPlayer', () => {
    function playerClient(opcodes: number[], payload: number[]) {
        return {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            localPlayer: { routeX: [1], routeZ: [1] },
            players: { 5: { routeX: [2], routeZ: [2] } },
            tryMove: () => true,
            writePacketOpcode: (opcode: number) => opcodes.push(opcode)
        };
    }

    test('sends OPPLAYER2 for the attack option', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.interactPlayer.call(playerClient(opcodes, payload), 5, 2))
            .toEqual({ success: true, routed: true });
        expect(opcodes).toEqual([166]); // ClientProt.OPPLAYER2
        expect(payload).toEqual([5]);
    });

    test('sends OPPLAYER5, which the engine binds but the client used to reject', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.interactPlayer.call(playerClient(opcodes, payload), 5, 5))
            .toEqual({ success: true, routed: true });
        expect(opcodes).toEqual([174]); // ClientProt.OPPLAYER5
    });
});

describe('npc ap-range dispatch', () => {
    function npcClient(opcodes: number[], payload: number[], routable: boolean) {
        return {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            localPlayer: { routeX: [1], routeZ: [1] },
            npc: { 42: { routeX: [5], routeZ: [6], type: { size: 1 } } },
            tryMove: () => routable,
            writePacketOpcode: (opcode: number) => opcodes.push(opcode)
        };
    }

    test('interactNpc dispatches OPNPC even when routing fails', () => {
        // Wormbrain behind the Port Sarim jail bars: apnpc1 + p_aprange(3) is
        // the intended talk-through-the-bars mechanic, but the tile is never
        // routable. Aborting on the failed route made the interaction
        // impossible from the SDK while a human click worked.
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.interactNpc.call(npcClient(opcodes, payload, false), 42, 1))
            .toEqual({ success: true, routed: false });
        expect(opcodes).toEqual([236]); // ClientProt.OPNPC1
        expect(payload).toEqual([42]);
    });

    test('talkToNpc dispatches OPNPC1 even when routing fails', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.talkToNpc.call(npcClient(opcodes, payload, false), 42))
            .toEqual({ success: true, routed: false });
        expect(opcodes).toEqual([236]); // ClientProt.OPNPC1
    });

    test('routed stays true when the route succeeds', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.interactNpc.call(npcClient(opcodes, payload, true), 42, 2))
            .toEqual({ success: true, routed: true });
        expect(opcodes).toEqual([233]); // ClientProt.OPNPC2
    });
});

describe('clickComponent', () => {
    test('closes the modal for a close-type button instead of sending IF_BUTTON', () => {
        // shop_template:com_77 ("Close Window"). The server has no if_button
        // trigger for it and answers "No trigger for [if_button,...]", leaving
        // the modal open and silently swallowing every following action.
        defineComponent(3902, { buttonType: BUTTON_CLOSE, text: 'Close Window' });

        const opcodes: number[] = [];
        let closed = 0;
        const client = {
            ingame: true,
            out: { p2: () => {} },
            writePacketOpcode: (opcode: number) => opcodes.push(opcode),
            closeModal: () => { closed++; }
        };

        expect(Client.prototype.clickComponent.call(client, 3902)).toBe(true);
        expect(closed).toBe(1);
        expect(opcodes).toEqual([]);
    });

    test('still sends IF_BUTTON for ordinary buttons', () => {
        defineComponent(3903, { buttonType: BUTTON_OK, buttonText: 'Buy 10' });

        const opcodes: number[] = [];
        const payload: number[] = [];
        const client = {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            writePacketOpcode: (opcode: number) => opcodes.push(opcode),
            closeModal: () => { throw new Error('should not close the modal'); }
        };

        expect(Client.prototype.clickComponent.call(client, 3903)).toBe(true);
        expect(opcodes).toEqual([9]); // ClientProt.IF_BUTTON
        expect(payload).toEqual([3903]);
    });
});

describe('getDialogOptions', () => {
    test('flattens the layout newlines skill dialogs pad product labels with', () => {
        // skill_multi3, as fletching opens it: Make X / Make 10 / Make 5 /
        // <product>, and only the make-1 button carries a name.
        defineComponent(9000, { children: [9001, 9002, 9003, 9004] });
        defineComponent(9001, { buttonType: BUTTON_OK, buttonText: 'Make X', text: '' });
        defineComponent(9002, { buttonType: BUTTON_OK, buttonText: 'Make 10', text: '' });
        defineComponent(9003, { buttonType: BUTTON_OK, buttonText: 'Make 5', text: '' });
        defineComponent(9004, { buttonType: BUTTON_OK, buttonText: 'Make 1', text: '\n\n\n\n15 Arrow Shafts' });

        const options = Client.prototype.getDialogOptions.call({ chatModalId: 9000 });

        expect(options.map(o => o.text)).toEqual(['Make X', 'Make 10', 'Make 5', '15 Arrow Shafts']);
        expect(options[3].index).toBe(4);
    });

    test('falls back to the button text when the label is only padding', () => {
        defineComponent(9100, { children: [9101] });
        defineComponent(9101, { buttonType: BUTTON_OK, buttonText: 'Make 5', text: '\n\n\n\n' });

        const options = Client.prototype.getDialogOptions.call({ chatModalId: 9100 });

        expect(options.map(o => o.text)).toEqual(['Make 5']);
    });
});

describe('loc routing', () => {
    type MoveArgs = {
        destX: number; destZ: number;
        locWidth: number; locLength: number;
        locAngle: number; locShape: number;
        forceapproach: number;
    };

    /** Back a stub with the real prototype so routeToLoc's private helpers resolve. */
    function asClient(stub: Record<string, unknown>): { routeToLoc(x: number, z: number, locId: number): boolean } {
        return Object.assign(Object.create(Client.prototype), stub);
    }

    /** Register a loc definition LocType.list() will hand back untouched. */
    function defineLoc(id: number, props: Partial<{ width: number; length: number; forceapproach: number }>): void {
        const loc = Object.assign(Object.create(LocType.prototype), {
            id, width: 1, length: 1, forceapproach: 0, ...props
        });
        LocType.recent = [loc];
        LocType.idx = new Int32Array(1) as never;
        LocType.dat = {} as never;
    }

    /**
     * Route to a loc sitting on one tile, reporting the args tryMove received.
     * `typecode2` packs shape in the low 5 bits and angle at bit 6, as the scene does.
     */
    function route(locId: number, shape: number, angle: number): MoveArgs {
        let args: MoveArgs | null = null;
        const client = asClient({
            localPlayer: { routeX: [10], routeZ: [10] },
            minusedlevel: 0,
            world: {
                wallType: () => (shape <= 3 || shape === 9 ? (locId << 14) : 0),
                decorType: () => (shape >= 4 && shape <= 8 ? (locId << 14) : 0),
                sceneType: () => (shape >= 10 && shape <= 21 ? (locId << 14) : 0),
                gdType: () => (shape === 22 ? (locId << 14) : 0),
                typeCode2: () => shape | (angle << 6)
            },
            tryMove: (
                _srcX: number, _srcZ: number, destX: number, destZ: number, _tryNearest: boolean,
                locWidth: number, locLength: number, locAngle: number, locShape: number,
                forceapproach: number
            ) => {
                args = { destX, destZ, locWidth, locLength, locAngle, locShape, forceapproach };
                return true;
            }
        });

        client.routeToLoc(20, 30, locId);
        expect(args).not.toBeNull();
        return args!;
    }

    test('routes to a gate with the wall reach rule, not the rectangle one', () => {
        // Lumbridge chicken coop gate: shape 0 (WALL_STRAIGHT), angle 2 (EAST).
        // The rectangle rule accepts the tile west of the gate, which the server
        // rejects with "I can't reach that!" — the wall rule does not.
        defineLoc(1553, { width: 1, length: 1 });

        expect(route(1553, 0, 2)).toEqual({
            destX: 20, destZ: 30,
            locWidth: 0, locLength: 0,
            locAngle: 2, locShape: 1, // shape + 1, as tryMove expects
            forceapproach: 0
        });
    });

    test('routes to a wall decoration with the decor reach rule', () => {
        defineLoc(1234, { width: 1, length: 1 });

        expect(route(1234, 6, 3)).toMatchObject({ locWidth: 0, locLength: 0, locAngle: 3, locShape: 7 });
    });

    test('keeps the rotated rectangle footprint for centrepieces', () => {
        // A 3x1 loc rotated north swaps its footprint, and forceapproach rotates with it.
        defineLoc(4321, { width: 3, length: 1, forceapproach: 1 });

        expect(route(4321, 10, 1)).toEqual({
            destX: 20, destZ: 30,
            locWidth: 1, locLength: 3,
            locAngle: 0, locShape: 0,
            forceapproach: 2
        });
    });

    test('falls back to the rectangle footprint when the tile holds no such loc', () => {
        defineLoc(999, { width: 2, length: 2 });

        let args: MoveArgs | null = null;
        const client = asClient({
            localPlayer: { routeX: [1], routeZ: [1] },
            minusedlevel: 0,
            world: {
                wallType: () => 0, decorType: () => 0, sceneType: () => 0, gdType: () => 0,
                typeCode2: () => -1
            },
            tryMove: (
                _sx: number, _sz: number, destX: number, destZ: number, _tn: boolean,
                locWidth: number, locLength: number, locAngle: number, locShape: number, forceapproach: number
            ) => {
                args = { destX, destZ, locWidth, locLength, locAngle, locShape, forceapproach };
                return true;
            }
        });

        client.routeToLoc(5, 6, 999);

        expect(args).toMatchObject({ locWidth: 2, locLength: 2, locAngle: 0, locShape: 0 });
    });

    /** Register an item definition ObjType.list() will hand back untouched. */
    function defineObj(id: number, name: string): void {
        const obj = Object.assign(Object.create(ObjType.prototype), { id, name });
        ObjType.recent = [obj];
        ObjType.idx = new Int32Array(1) as never;
        ObjType.dat = {} as never;
    }

    test('interactLoc dispatches OPLOC even when routing fails', () => {
        // Waterfall's "Swim to" rock is an aploc op: the trigger tile is never
        // routable, so aborting on a failed route strands the bot with no packet
        // sent and no game message. The server owns the reach check.
        defineLoc(1996, {});
        const opcodes: number[] = [];
        const payload: number[] = [];
        const client = {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            localPlayer: { routeX: [12], routeZ: [8] },
            mapBuildBaseX: 2500,
            mapBuildBaseZ: 3400,
            routeToLoc: () => false,
            writePacketOpcode: (opcode: number) => opcodes.push(opcode)
        };

        const result = Client.prototype.interactLoc.call(client as never, 2512, 3468, 1996, 1);

        expect(result).toEqual({ success: true, routed: false });
        expect(opcodes).toEqual([215]); // ClientProt.OPLOC1
        expect(payload).toEqual([2512, 3468, 1996]);
    });

    test('useItemOnLoc dispatches OPLOCU even when routing fails', () => {
        // Rope-on-rock, same aplocu shape as above.
        defineLoc(1996, {});
        defineObj(954, 'Rope');
        defineComponent(3214, { linkObjType: [955] });
        const opcodes: number[] = [];
        const payload: number[] = [];
        const client = {
            ingame: true,
            out: { p2: (value: number) => payload.push(value) },
            localPlayer: { routeX: [12], routeZ: [8] },
            mapBuildBaseX: 2500,
            mapBuildBaseZ: 3400,
            routeToLoc: () => false,
            writePacketOpcode: (opcode: number) => opcodes.push(opcode)
        };

        const result = Client.prototype.useItemOnLoc.call(client as never, 0, 2512, 3468, 1996, 3214);

        expect(result).toEqual({ success: true, routed: false });
        expect(opcodes).toEqual([60]); // ClientProt.OPLOCU
        expect(payload).toEqual([2512, 3468, 1996, 954, 0, 3214]);
    });
});
