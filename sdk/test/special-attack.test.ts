import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';

/** A connected SDK that answers actions with `result` and publishes `states` after dispatch. */
function stubSdk(result: any, states: any[] = [], initial: any = { specialActive: false, specialEnergy: 100 }) {
    const sdk = Object.create(BotSDK.prototype) as BotSDK;
    const sent: any[] = [];
    const listeners = new Set<(state: any) => void>();
    (sdk as any).config = { actionTimeout: 200, botUsername: 'tester' };
    (sdk as any).connectionState = 'connected';
    (sdk as any).pendingActions = new Map();
    (sdk as any).state = initial;
    (sdk as any).ws = { readyState: WebSocket.OPEN };
    (sdk as any).onStateUpdate = (fn: (state: any) => void) => { listeners.add(fn); return () => listeners.delete(fn); };
    (sdk as any).send = (msg: any) => {
        sent.push(msg);
        queueMicrotask(() => {
            const pending = (sdk as any).pendingActions.get(msg.actionId);
            clearTimeout(pending.timeout);
            (sdk as any).pendingActions.delete(msg.actionId);
            pending.resolve(result);
            setTimeout(() => {
                for (const state of states) {
                    (sdk as any).state = state;
                    for (const fn of listeners) fn(state);
                }
            }, 1);
        });
    };
    return { sdk, sent };
}

const clicked = { success: true, message: 'Turning special attack on', phase: 'dispatch', data: { clicked: true, instant: false } };

describe('BotSDK.sendSpecialAttack', () => {
    test('defaults to on and returns once the server has applied it', async () => {
        const { sdk, sent } = stubSdk(clicked, [{ specialActive: true, specialEnergy: 100 }]);
        expect(await sdk.sendSpecialAttack()).toMatchObject({ success: true });
        expect(sent[0].action).toMatchObject({ type: 'setSpecialAttack', on: true });
    });

    test('a no-op or a client failure returns straight away', async () => {
        const noop = stubSdk({ success: true, message: 'already on', data: { clicked: false } });
        expect(await noop.sdk.sendSpecialAttack()).toMatchObject({ success: true, data: { clicked: false } });
        const failed = stubSdk({ success: false, message: 'nope', reason: 'no_special_attack' });
        expect(await failed.sdk.sendSpecialAttack()).toMatchObject({ success: false, reason: 'no_special_attack' });
    });

    test('an instant special is confirmed by the energy it spends', async () => {
        const instant = { ...clicked, data: { clicked: true, instant: true } };
        const { sdk } = stubSdk(instant, [{ specialActive: false, specialEnergy: 0 }]);
        expect(await sdk.sendSpecialAttack()).toMatchObject({ success: true });
    });

    test('rejects a non-boolean without sending', async () => {
        const { sdk, sent } = stubSdk(clicked);
        expect(await sdk.sendSpecialAttack(1 as unknown as boolean)).toMatchObject({ success: false, reason: 'invalid_argument' });
        expect(sent).toHaveLength(0);
    });
});
