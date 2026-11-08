import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';

function stubSdk() {
    const sdk = Object.create(BotSDK.prototype) as BotSDK;
    const sent: any[] = [];
    (sdk as any).config = { actionTimeout: 20, botUsername: 'tester' };
    (sdk as any).connectionState = 'connected';
    (sdk as any).pendingActions = new Map();
    (sdk as any).ws = { readyState: WebSocket.OPEN };
    (sdk as any).send = (msg: any) => sent.push(msg);
    return { sdk, sent };
}

describe('BotSDK.sendUseInterfaceItem', () => {
    test('sends a useInterfaceItem action', async () => {
        const { sdk, sent } = stubSdk();
        // Monkey Madness's sliding puzzle: reinitialisation_puzzle:com_3, iop5=Move.
        await sdk.sendUseInterfaceItem(11130, 7, 5);
        expect(sent[0].action).toMatchObject({ type: 'useInterfaceItem', componentId: 11130, slot: 7, optionIndex: 5 });
    });

    test('rejects bad arguments without sending', async () => {
        const { sdk, sent } = stubSdk();
        const cases: [number, number, number][] = [
            [Number.NaN, 0, 5],
            [11130, -1, 5],
            [11130, 1.5, 5],
            [70000, 0, 5],
            [11130, 0, 0],
            [11130, 0, 6],
            [undefined as unknown as number, 0, 5],
        ];
        for (const [com, slot, option] of cases) {
            expect(await sdk.sendUseInterfaceItem(com, slot, option)).toMatchObject({ success: false, reason: 'invalid_argument', phase: 'validation' });
        }
        expect(sent).toHaveLength(0);
    });
});
