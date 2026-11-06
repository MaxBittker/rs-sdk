import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';
import { Spells } from '../spells';

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

describe('BotSDK.sendSpellOnLoc', () => {
    test('sends a spellOnLoc action', async () => {
        const { sdk, sent } = stubSdk();
        // Legends' Quest: Charge Water Orb (magic:water_orb) on the Ancient Gate (lgmagictrialgateclosed).
        await sdk.sendSpellOnLoc(2762, 9313, 2930, Spells.CHARGE_WATER_ORB);
        expect(sent).toHaveLength(1);
        expect(sent[0].action).toMatchObject({ type: 'spellOnLoc', x: 2762, z: 9313, locId: 2930, spellComponent: 1179 });
    });

    test('rejects fields that are not 16-bit unsigned integers without sending', async () => {
        const { sdk, sent } = stubSdk();
        const cases: [number, number, number, number][] = [
            [Number.NaN, 9313, 2930, 1179],
            [2762, -1, 2930, 1179],
            [2762, 9313, 2930.5, 1179],
            [2762, 9313, 2930, 70000],
            [2762, 9313, undefined as unknown as number, 1179],
        ];
        for (const [x, z, locId, spell] of cases) {
            const result = await sdk.sendSpellOnLoc(x, z, locId, spell);
            expect(result).toMatchObject({ success: false, reason: 'invalid_argument', phase: 'validation' });
        }
        expect(sent).toHaveLength(0);
    });
});
