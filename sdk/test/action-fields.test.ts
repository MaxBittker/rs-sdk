import { describe, expect, test } from 'bun:test';
import { ACTION_NUMERIC_FIELDS, invalidActionFields } from '../action-fields';
import { BotSDK } from '../index';

/** A connected-looking SDK that records what it would send and never answers. */
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

describe('action field validation', () => {
    test('a missing locId never leaves the SDK', async () => {
        const { sdk, sent } = stubSdk();
        const result = await (sdk.sendUseItemOnLoc as (...args: unknown[]) => ReturnType<BotSDK['sendUseItemOnLoc']>)(0, 3200, 3200);
        expect(result).toMatchObject({ success: false, reason: 'invalid_action', phase: 'validation' });
        expect(result.message).toContain('locId=missing');
        expect(sent).toHaveLength(0);
    });

    test('rejects non-integers and accepts sound actions', () => {
        expect(invalidActionFields({ type: 'walkTo', x: Number.NaN, z: 3200, reason: '' })).toContain('x=null');
        expect(invalidActionFields({ type: 'shopBuy', slot: '1', amount: 1, reason: '' })).toContain('slot="1"');
        expect(invalidActionFields({ type: 'scanNearbyLocs', radius: 2.5, reason: '' })).toContain('radius=2.5');
        expect(invalidActionFields({ type: 'nope', reason: '' })).toContain('unknown action type');
        expect(invalidActionFields({ type: 'bankWithdraw', slot: 0, amount: -1, reason: '' })).toBeNull();
        expect(invalidActionFields({ type: 'scanNearbyLocs', reason: '' })).toBeNull();
        expect(invalidActionFields({ type: 'say', message: 'hi', reason: '' })).toBeNull();
    });

    test('the SDK and game client field tables match', async () => {
        // Imported at runtime: the client source is outside the SDK's tsconfig.
        const clientTable = '../../server/webclient/src/bot/actionFields.ts';
        const { ACTION_NUMERIC_FIELDS: client } = await import(clientTable);
        expect(client).toEqual(ACTION_NUMERIC_FIELDS);
    });
});
