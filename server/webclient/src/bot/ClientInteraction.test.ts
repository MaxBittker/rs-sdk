import { describe, expect, mock, test } from 'bun:test';

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
