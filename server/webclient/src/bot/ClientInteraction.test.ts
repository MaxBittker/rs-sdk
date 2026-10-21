import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { CHARACTER_BODY_PARTS, CHARACTER_COLOR_PARTS, CHARACTER_DESIGN_INTERFACE } from '../../../../sdk/character-design.js';
import { ClientCode } from '#/client/ClientCode.js';

import { ClientProt } from '#/io/ClientProt.js';
import { ServerProt } from '#/io/ServerProt.js';

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
(globalThis as any).fetch = async () => ({
    arrayBuffer: async () => new ArrayBuffer(0)
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
const { default: IdkType } = await import('#/config/IdkType.js');
const { default: LocType } = await import('#/config/LocType.js');
const { default: ObjType } = await import('#/config/ObjType.js');
const { default: IfType } = await import('#/config/IfType.js');
const { default: Packet } = await import('#/io/Packet.js');
const { default: ClientPlayer, PlayerUpdate } = await import('#/dash3d/ClientPlayer.js');
const { ActionExecutor } = await import('./ActionExecutor.js');
const { BotStateCollector } = await import('./StateCollector.js');
const { LiteClient } = await import('../lite/LiteClient.js');
const { dispatch } = await import('../lite/protocol/incoming.js');
const { captureBaseInterfaces, resetBaseInterfaces } = await import('../lite/interfaces.js');
const { BotSDK } = await import('../../../../sdk/index.js');

const BUTTON_OK = 1;
const BUTTON_CLOSE = 3;

/** Install a component in the shared IfType registry the client reads from. */
function defineComponent(id: number, com: Record<string, unknown>): void {
    IfType.list[id] = { id, ...com } as never;
}

// Drive real incoming decoders, state collection, SDK selection and outgoing
// packet writers without a game connection or downloaded interface archive.
for (const kind of ['browser', 'lite'] as const) {
    describe(`${kind} guarded dialogue clicks`, () => {
        function fixture() {
            defineComponent(9200, { children: [9201, 9202], text: 'First question' });
            defineComponent(9201, { buttonType: BUTTON_OK, buttonText: 'Select', text: 'Yes' });
            defineComponent(9202, { buttonType: BUTTON_OK, buttonText: 'Select', text: 'No' });
            defineComponent(9210, { children: [9211], text: 'Second question' });
            defineComponent(9211, { buttonType: BUTTON_OK, buttonText: 'Select', text: 'Destroy item' });
            defineComponent(9220, { text: 'Unrelated sidebar text', layerId: -1 });
            const out = new Packet(new Uint8Array(64));
            let client: any;
            if (kind === 'lite') {
                resetBaseInterfaces();
                captureBaseInterfaces();
                client = new LiteClient({
                    connection: { out, isClosed: false } as never,
                    locIndex: {} as never, username: 'dialog-test', password: 'x'
                });
            } else {
                client = Object.assign(Object.create(Client.prototype), {
                    out, ingame: true, chatModalId: -1, sideModalId: -1,
                    mainModalId: -1, resumedPauseButton: false,
                    sideIcon: [], activeIcon: 0, randomIn: null,
                    captureDialogToHistory() {}
                });
            }
            const executor = new ActionExecutor(client);
            const collector = new BotStateCollector(client);
            const snapshot = () => {
                if (kind === 'lite') client.activate();
                return (collector as any).collectDialogState();
            };
            const receive = async (opcode: number, id: number, text?: string | boolean) => {
                const body = new Packet(new Uint8Array(128));
                body.p2(id);
                if (typeof text === 'string') body.pjstr(text);
                else if (typeof text === 'boolean') body.p1(text ? 1 : 0);
                const size = body.pos;
                body.pos = 0;
                if (kind === 'lite') {
                    dispatch(client, opcode, body, size);
                } else {
                    client.ptype = opcode;
                    client.psize = size;
                    client.in = new Packet(new Uint8Array(128));
                    client.stream = {
                        available: size,
                        async readBytes(dst: Uint8Array, offset: number, length: number) {
                            dst.set(body.data.subarray(0, length), offset);
                        }
                    };
                    expect(await client.tcpIn()).toBe(true);
                }
            };
            const choose = async (inFlight?: () => Promise<void>) => {
                const sdk = new BotSDK({ botUsername: 'dialog-test' });
                (sdk as any).state = { dialog: snapshot() };
                (sdk as any).sendAction = async (action: any) => {
                    await inFlight?.();
                    return executor.execute(action);
                };
                return sdk.clickDialogByText(/^Yes$/);
            };
            return { client, out, receive, snapshot, choose, executor };
        }

        test('unchanged page sends the selected IF_BUTTON component', async () => {
            const f = fixture();
            await f.receive(ServerProt.IF_OPENCHAT, 9200);
            const first = f.snapshot();
            expect(first.pageId).toBeDefined();
            expect(f.snapshot().pageId).toBe(first.pageId);
            expect(first.options[0].componentId).toBe(9201);
            expect((await f.choose()).success).toBe(true);
            expect(Array.from(f.out.data.subarray(0, f.out.pos))).toEqual([ClientProt.IF_BUTTON, 9201 >> 8, 9201 & 255]);
        });

        for (const change of ['different interface', 'reopened identical page', 'same buttons, new question', 'unsampled text round trip'] as const) {
            test(`rejects ${change} without writing any game packet`, async () => {
                const f = fixture();
                await f.receive(ServerProt.IF_OPENCHAT, 9200);
                const result = await f.choose(async () => {
                    if (change === 'different interface') await f.receive(ServerProt.IF_OPENCHAT, 9210);
                    else if (change === 'reopened identical page') await f.receive(ServerProt.IF_OPENCHAT, 9200);
                    else {
                        await f.receive(ServerProt.IF_SETTEXT, 9200, 'Second question');
                        if (change === 'unsampled text round trip') await f.receive(ServerProt.IF_SETTEXT, 9200, 'First question');
                    }
                });
                expect(result).toMatchObject({ success: false, phase: 'validation', reason: 'stale_dialog' });
                expect(f.out.pos).toBe(0);
            });
        }

        for (const id of [9200, 9220]) {
            test(`does not reject unchanged dialogue after text packet for ${id}`, async () => {
                const f = fixture();
                await f.receive(ServerProt.IF_OPENCHAT, 9200);
                const result = await f.choose(() => f.receive(ServerProt.IF_SETTEXT, id,
                    id === 9200 ? 'First question' : 'Updated sidebar'));
                expect(result.success).toBe(true);
                expect(f.out.pos).toBe(3);
            });
        }

        test('rejects a component ID that does not match the selected option', async () => {
            const f = fixture();
            await f.receive(ServerProt.IF_OPENCHAT, 9200);
            expect(f.executor.execute({
                type: 'clickDialogOption', optionIndex: 1, reason: 'test',
                guard: { pageId: f.snapshot().pageId, componentId: 9202 }
            })).toMatchObject({ success: false, reason: 'stale_dialog' });
            expect(f.out.pos).toBe(0);
        });

        test('rejects an unsampled hide/unhide round trip', async () => {
            const f = fixture();
            await f.receive(ServerProt.IF_OPENCHAT, 9200);
            // Establish the original boolean value rather than undefined.
            await f.receive(ServerProt.IF_SETHIDE, 9201, false);
            expect(await f.choose(async () => {
                await f.receive(ServerProt.IF_SETHIDE, 9201, true);
                await f.receive(ServerProt.IF_SETHIDE, 9201, false);
            })).toMatchObject({ success: false, reason: 'stale_dialog' });
            expect(f.out.pos).toBe(0);
        });

        test('guarded Continue sends RESUME once and rejects its waiting snapshot', async () => {
            const f = fixture();
            defineComponent(9230, { children: [9231] });
            defineComponent(9231, { buttonType: 6, buttonText: 'Continue', text: '' });
            if (kind === 'lite') {
                f.client.interfaces.list[9230] = IfType.list[9230];
                f.client.interfaces.list[9231] = IfType.list[9231];
            }
            await f.receive(ServerProt.IF_OPENCHAT, 9230);
            const action = {
                type: 'clickDialogOption' as const, optionIndex: 1, reason: 'test',
                guard: { pageId: f.snapshot().pageId, componentId: 9231 }
            };
            expect(f.executor.execute(action)).toMatchObject({ success: true });
            expect(Array.from(f.out.data.subarray(0, f.out.pos))).toEqual([ClientProt.RESUME_PAUSEBUTTON, 9231 >> 8, 9231 & 255]);
            expect(f.executor.execute(action)).toMatchObject({ success: false, reason: 'stale_dialog' });
            expect(f.out.pos).toBe(3);
        });

        if (kind === 'lite') {
            test('a token from a different client cannot select an identical page', async () => {
                const a = fixture();
                await a.receive(ServerProt.IF_OPENCHAT, 9200);
                const pageId = a.snapshot().pageId;
                const b = fixture();
                await b.receive(ServerProt.IF_OPENCHAT, 9200);
                expect(b.client.executeBotAction({
                    type: 'clickDialogOption', optionIndex: 1, reason: 'test',
                    guard: { pageId, componentId: 9201 }
                })).toMatchObject({ success: false, reason: 'stale_dialog' });
                expect(b.out.pos).toBe(0);
                // This also reactivates a's component table after b's packet.
                expect(a.client.executeBotAction({
                    type: 'clickDialogOption', optionIndex: 1, reason: 'test',
                    guard: { pageId, componentId: 9201 }
                })).toMatchObject({ success: true });
                expect(a.out.pos).toBe(3);
            });
        }

        test('preserves explicitly unguarded low-level index clicks', async () => {
            const f = fixture();
            await f.receive(ServerProt.IF_OPENCHAT, 9200);
            expect(f.executor.execute({ type: 'clickDialogOption', optionIndex: 2, reason: 'test' })).toMatchObject({ success: true });
            expect(Array.from(f.out.data.subarray(0, f.out.pos))).toEqual([ClientProt.IF_BUTTON, 9202 >> 8, 9202 & 255]);
        });
    });
}

describe('browser game tick publication', () => {
    test('publishes decoded player state after PLAYER_INFO completes', async () => {
        // Teleport the local player to plane 1, tile (55, 56), with a hitmark.
        // No old/new visible players; 2047 terminates the new-player bit list.
        const bits = '1' + '11' + '01' + '0110111' + '0111000' + '1' + '1'
            + '00000000' + '11111111111';
        const payload = Uint8Array.from([
            ...bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)),
            PlayerUpdate.HITMARK, 7, 1, 23, 30
        ]);
        const wire = Uint8Array.from([ServerProt.PLAYER_INFO, 0, payload.length, ...payload]);
        let readPos = 0;
        const player = new ClientPlayer();
        player.teleport(true, 50, 50);
        player.health = 30;
        player.totalHealth = 30;

        // Retain the real packet framing and player decoders; only the socket
        // is replaced so this regression needs no game server or browser.
        const client = Object.assign(Object.create(Client.prototype), {
            stream: {
                get available() { return wire.length - readPos; },
                async readBytes(dst: Uint8Array, offset: number, length: number) {
                    dst.set(wire.subarray(readPos, readPos + length), offset);
                    readPos += length;
                }
            },
            in: new Packet(new Uint8Array(64)),
            ptype: -1,
            ptype0: -1,
            ptype1: -1,
            ptype2: -1,
            randomIn: null,
            localPlayer: player,
            players: { 2047: player },
            playerCount: 0,
            playerIds: new Int32Array(2048),
            entityRemovalIds: new Int32Array(2048),
            entityUpdateIds: new Int32Array(2048),
            minusedlevel: 0,
            awaitingPlayerInfo: true,
            lastTickTime: 0
        });
        const published: unknown[] = [];
        client.setOnGameTickCallback(() => published.push({
            health: player.health,
            x: player.routeX[0],
            z: player.routeZ[0],
            level: client.minusedlevel,
            awaitingPlayerInfo: client.awaitingPlayerInfo,
            packetPosition: client.in.pos
        }));

        expect(await client.tcpIn()).toBe(true);
        expect(published).toEqual([{
            health: 23, x: 55, z: 56, level: 1,
            awaitingPlayerInfo: false, packetPosition: payload.length
        }]);
        expect(readPos).toBe(wire.length);
        expect(client.ptype).toBe(-1);
        expect(await client.tcpIn()).toBe(false);
        expect(published).toHaveLength(1);
    });
});

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
        expect(opcodes).toEqual([ClientProt.OPNPCT]);
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
        expect(opcodes).toEqual([ClientProt.OPPLAYERT]);
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
        expect(opcodes).toEqual([ClientProt.OPOBJT]);
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
        expect(opcodes).toEqual([ClientProt.OPPLAYER2]);
        expect(payload).toEqual([5]);
    });

    test('sends OPPLAYER5, which the engine binds but the client used to reject', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.interactPlayer.call(playerClient(opcodes, payload), 5, 5))
            .toEqual({ success: true, routed: true });
        expect(opcodes).toEqual([ClientProt.OPPLAYER5]);
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
        expect(opcodes).toEqual([ClientProt.OPNPC1]);
        expect(payload).toEqual([42]);
    });

    test('talkToNpc dispatches OPNPC1 even when routing fails', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.talkToNpc.call(npcClient(opcodes, payload, false), 42))
            .toEqual({ success: true, routed: false });
        expect(opcodes).toEqual([ClientProt.OPNPC1]);
    });

    test('routed stays true when the route succeeds', () => {
        const opcodes: number[] = [];
        const payload: number[] = [];

        expect(Client.prototype.interactNpc.call(npcClient(opcodes, payload, true), 42, 2))
            .toEqual({ success: true, routed: true });
        expect(opcodes).toEqual([ClientProt.OPNPC2]);
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
        expect(opcodes).toEqual([ClientProt.IF_BUTTON]);
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
        expect(opcodes).toEqual([ClientProt.OPLOC1]);
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
        expect(opcodes).toEqual([ClientProt.OPLOCU]);
        expect(payload).toEqual([2512, 3468, 1996, 954, 0, 3214]);
    });
});


// Exercise the SDK, executor, actual client methods, and appearance decoder.
// No browser process, game connection, or downloaded archives are needed.
for (const kind of ['browser', 'lite'] as const) {
    describe(kind + ' character design', () => {
        const ACCEPT = 3651;
        let savedKits: typeof IdkType.list;
        let savedCount: number;
        let savedInterfaces: typeof IfType.list;
        beforeEach(() => {
            savedKits = IdkType.list;
            savedCount = IdkType.numDefinitions;
            savedInterfaces = IfType.list;
            IdkType.list = [];
            for (let part = 0; part < 14; part++) {
                if (part === 8) continue; // female jaw is -1
                IdkType.list.push(
                    Object.assign(new IdkType(), { part }),
                    Object.assign(new IdkType(), { part }),
                    Object.assign(new IdkType(), { part, disable: true })
                );
            }
            IdkType.numDefinitions = IdkType.list.length;
            IfType.list = [];
            // An unrelated accept button comes first: the active modal owns selection.
            defineComponent(12, { layerId: 10, clientCode: ClientCode.CC_ACCEPT_DESIGN });
            defineComponent(CHARACTER_DESIGN_INTERFACE, { layerId: -1 });
            defineComponent(ACCEPT, { layerId: CHARACTER_DESIGN_INTERFACE, clientCode: ClientCode.CC_ACCEPT_DESIGN });
            resetBaseInterfaces();
            captureBaseInterfaces();
        });
        afterEach(() => {
            IdkType.list = savedKits;
            IdkType.numDefinitions = savedCount;
            IfType.list = savedInterfaces;
            resetBaseInterfaces();
        });

        function fixture() {
            const out = new Packet(new Uint8Array(128));
            let client: any;
            if (kind === 'lite') {
                client = new LiteClient({ connection: { out, isClosed: false } as never, locIndex: {} as never, username: 'design-test', password: 'x' });
                client.mainModalId = CHARACTER_DESIGN_INTERFACE;
            } else {
                client = Object.assign(Object.create(Client.prototype), {
                    out, ingame: true, mainModalId: CHARACTER_DESIGN_INTERFACE,
                    idkDesignGender: true, idkDesignPart: new Int32Array(7), idkDesignColour: new Int32Array(5),
                    statEffectiveLevel: [1, 1, 1, 10], statBaseLevel: [1, 1, 1, 10],
                    localPlayer: new ClientPlayer(), npc: [], mapBuildBaseX: 0, mapBuildBaseZ: 0
                });
                client.validateIdkDesign();
            }
            const executor = new ActionExecutor(client);
            const sdk = new BotSDK({ botUsername: 'design-test' });
            (sdk as any).state = { characterDesign: client.getCharacterDesign() };
            (sdk as any).sendAction = async (action: any) => {
                if (kind === 'lite') client.activate();
                const result = await executor.execute(action);
                (sdk as any).state = { characterDesign: client.getCharacterDesign() };
                return result;
            };
            return { client, executor, sdk, out };
        }

        test('discovers valid choices and preserves previous styles across separate edits', async () => {
            const { sdk, out } = fixture();
            const initial = sdk.getCharacterDesign()!;
            expect(initial.options.body.female.jaw).toEqual([-1]);
            expect(initial.options.body.male.hair).toHaveLength(2);
            expect(initial.options.colors.feet).toHaveLength(6);
            const hair = initial.options.body.male.hair[1];
            expect((await sdk.sendSetCharacterDesign({ body: { hair } })).success).toBe(true);
            expect((await sdk.sendSetCharacterDesign({ colors: { hair: 11, feet: 5, skin: 7 } })).success).toBe(true);
            const current = sdk.getCharacterDesign()!.current;
            expect(current.body.hair).toBe(hair);
            expect(current.body.torso).toBe(initial.current.body.torso);
            expect(current.colors).toMatchObject({ hair: 11, feet: 5, skin: 7 });
            expect(out.pos).toBe(0);
        });

        test('changing gender resets omitted body styles and preserves colours', async () => {
            const { sdk } = fixture();
            await sdk.sendSetCharacterDesign({ colors: { hair: 11 } });
            const options = sdk.getCharacterDesign()!.options;
            const hair = options.body.female.hair[1];
            expect((await sdk.sendSetCharacterDesign({ gender: false, body: { hair } })).success).toBe(true);
            const current = sdk.getCharacterDesign()!.current;
            expect(current.gender).toBe(false);
            expect(current.body.hair).toBe(hair);
            expect(current.body.jaw).toBe(-1);
            expect(current.colors.hair).toBe(11);
            for (const part of CHARACTER_BODY_PARTS) expect(options.body.female[part]).toContain(current.body[part]);
        });

        test('invalid patches do not partially change the draft or write packets', async () => {
            const { sdk, out } = fixture();
            const initial = sdk.getCharacterDesign()!.current;
            const invalid = [
                { gender: false, body: { hair: initial.body.hair } }, // male kit on a female
                { body: { hair: initial.body.hair + 2 } }, // disabled kit
                { body: { hair: initial.body.torso } }, // wrong body part
                { body: { hair: 1.5 } },
                { colors: { feet: 6 } }, { colors: { skin: 8 } }, { colors: { hair: -1 } },
                { gender: 1 }, { body: { unknown: 0 } }, { colors: [] }, { body: null }, null
            ];
            for (const patch of invalid) {
                const result = await sdk.sendSetCharacterDesign(patch as any);
                expect(result).toMatchObject({ success: false, phase: 'validation', reason: 'invalid_design' });
                expect(sdk.getCharacterDesign()!.current).toEqual(initial);
                expect(out.pos).toBe(0);
            }
        });

        test('randomization chooses legal gender-specific kits and actual palette bounds', async () => {
            const { sdk } = fixture();
            const random = spyOn(Math, 'random').mockReturnValue(0.999999);
            try {
                for (const gender of [true, false]) {
                    const result = await sdk.sendRandomizeCharacterDesign(gender);
                    expect(result.success).toBe(true);
                    const { current, options } = sdk.getCharacterDesign()!;
                    expect(current.gender).toBe(gender);
                    for (const part of CHARACTER_BODY_PARTS) expect(current.body[part]).toBe(options.body[gender ? 'male' : 'female'][part].at(-1)!);
                    for (const part of CHARACTER_COLOR_PARTS) expect(current.colors[part]).toBe(options.colors[part].at(-1)!);
                }
            } finally { random.mockRestore(); }
        });

        test('accept writes the chosen design and the active accept button in order', async () => {
            const { sdk, out, client } = fixture();
            await sdk.sendSetCharacterDesign({ gender: false, colors: { hair: 11, torso: 15, legs: 15, feet: 5, skin: 7 } });
            const expected = sdk.getCharacterDesign()!.current;
            const result = await sdk.sendAcceptCharacterDesign();
            expect(result).toMatchObject({ success: true, phase: 'dispatch', data: { design: expected } });
            expect(Array.from(out.data.subarray(0, out.pos))).toEqual([
                ClientProt.IDK_SAVEDESIGN, 1,
                ...CHARACTER_BODY_PARTS.map(part => expected.body[part] & 255),
                ...CHARACTER_COLOR_PARTS.map(part => expected.colors[part]),
                ClientProt.IF_BUTTON, ACCEPT >> 8, ACCEPT & 255
            ]);
            expect(client.mainModalId).toBe(CHARACTER_DESIGN_INTERFACE); // dispatch does not fake server closure
        });

        test('an untouched fresh default is valid even without randomization', async () => {
            const { sdk } = fixture();
            expect((await sdk.sendAcceptCharacterDesign()).success).toBe(true);
        });

        test('wrong screens, missing buttons, and invalid drafts fail before either packet', async () => {
            const { client, executor, out } = fixture();
            client.mainModalId = 10;
            expect(await executor.execute({ type: 'setCharacterDesign', patch: { colors: { hair: 1 } }, reason: 'test' })).toMatchObject({ success: false, reason: 'design_not_open' });
            expect(await executor.execute({ type: 'acceptCharacterDesign', reason: 'test' })).toMatchObject({ success: false, reason: 'design_not_open' });
            client.mainModalId = CHARACTER_DESIGN_INTERFACE;
            client.getCharacterDesign();
            const kits = kind === 'lite' ? client.designKits : client.idkDesignPart;
            const valid = kits[0];
            kits[0] = 999;
            expect(await executor.execute({ type: 'acceptCharacterDesign', reason: 'test' })).toMatchObject({ success: false, reason: 'invalid_design' });
            kits[0] = valid;
            if (kind === 'lite') client.activate();
            delete IfType.list[ACCEPT];
            expect(await executor.execute({ type: 'acceptCharacterDesign', reason: 'test' })).toMatchObject({ success: false, reason: 'accept_button_not_found' });
            expect(out.pos).toBe(0);
        });

        test('server-decoded appearance is separate from the editable draft', async () => {
            const { client, sdk } = fixture();
            await sdk.sendSetCharacterDesign({ gender: false, colors: { hair: 11 } });
            const expected = sdk.getCharacterDesign()!.current;
            const packet = new Packet(new Uint8Array(128));
            const visible = new Array(12).fill(0);
            const bodySlots = [8, 11, 4, 6, 9, 7, 10];
            CHARACTER_BODY_PARTS.forEach((part, i) => { visible[bodySlots[i]] = expected.body[part] === -1 ? 0 : 256 + expected.body[part]; });
            packet.p1(1); packet.p1(0);
            for (const slot of visible) { if (slot === 0) packet.p1(0); else packet.p2(slot); }
            for (const part of CHARACTER_COLOR_PARTS) packet.p1(expected.colors[part]);
            for (let i = 0; i < 7; i++) packet.p2(-1);
            packet.p8(1n); packet.p1(3); packet.p2(0);
            client.localPlayer.setAppearance(packet);
            const collector = new BotStateCollector(client);
            const observed = (collector as any).collectPlayerState(2, 2).appearance;
            expect(observed).toEqual({ gender: false, slots: visible, colors: expected.colors });
            await sdk.sendSetCharacterDesign({ colors: { hair: 0 } });
            expect((collector as any).collectPlayerState(3, 3).appearance).toEqual(observed);
            expect(sdk.getCharacterDesign()!.current.colors.hair).toBe(0);
        });

        test('two clients retain separate pending designs', async () => {
            const a = fixture();
            const b = fixture();
            const original = b.sdk.getCharacterDesign()!.current;
            await a.sdk.sendSetCharacterDesign({ gender: false, colors: { skin: 7 } });
            expect(b.client.getCharacterDesign().current).toEqual(original);
            expect(a.client.getCharacterDesign().current.gender).toBe(false);
        });
    });
}
