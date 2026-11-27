import { describe, expect, mock, test } from 'bun:test';
import { BotActions } from '../actions';
import type { BotSDK } from '../index';
import type { ActionResult, BotWorldState } from '../types';

function state(magicTabInterfaceId?: number) {
    return { inGame: true, magicTabInterfaceId } as BotWorldState;
}

function setup(initial: BotWorldState, received: BotWorldState) {
    const waitForCondition = mock(async (matches: (state: BotWorldState) => boolean) => {
        if (!matches(received)) throw new Error('waitForCondition timed out');
        return received;
    });
    const sdk = { getState: () => initial, waitForCondition } as unknown as BotSDK;
    const select = mock(async (): Promise<ActionResult> => ({ success: true, message: 'Sent' }));
    return { bot: new BotActions(sdk), select, waitForCondition };
}

describe('BotActions.switchSpellbook', () => {
    test('sends one server selection and waits for the requested Magic tab', async () => {
        const { bot, select, waitForCondition } = setup(state(10), state(20));
        expect(await bot.switchSpellbook(20, select)).toMatchObject({ success: true, phase: 'completion' });
        expect(select).toHaveBeenCalledTimes(1);
        expect(waitForCondition).toHaveBeenCalledTimes(1);
    });

    test('leaves an already selected book untouched', async () => {
        const { bot, select, waitForCondition } = setup(state(20), state(20));
        expect(await bot.switchSpellbook(20, select)).toMatchObject({ success: true });
        expect(select).not.toHaveBeenCalled();
        expect(waitForCondition).not.toHaveBeenCalled();
    });

    test('refuses to select when the current book is unknown', async () => {
        const { bot, select } = setup(state(), state(20));
        expect(await bot.switchSpellbook(20, select)).toMatchObject({ success: false, reason: 'unknown_spellbook' });
        expect(select).not.toHaveBeenCalled();
    });

    test('rejects a removed or invalid interface before selecting', async () => {
        const { bot, select } = setup(state(10), state(20));
        for (const id of [-1, 0xffff, 1.5]) {
            expect(await bot.switchSpellbook(id, select)).toMatchObject({ success: false, reason: 'invalid_interface' });
        }
        expect(select).not.toHaveBeenCalled();
    });

    test('refuses to select while logged out', async () => {
        const { bot, select } = setup({ ...state(10), inGame: false }, state(20));
        expect(await bot.switchSpellbook(20, select)).toMatchObject({ success: false, reason: 'not_in_game' });
        expect(select).not.toHaveBeenCalled();
    });

    test('returns the selection failure without waiting', async () => {
        const { bot, waitForCondition } = setup(state(10), state(20));
        const refusal = { success: false, reason: 'out_of_reach', message: 'Cannot reach the switch' };
        expect(await bot.switchSpellbook(20, async () => refusal)).toEqual(refusal);
        expect(waitForCondition).not.toHaveBeenCalled();
    });

    test('reports a timeout if dispatch does not change the book', async () => {
        const { bot, select } = setup(state(10), state(10));
        expect(await bot.switchSpellbook(20, select)).toMatchObject({ success: false, phase: 'observation', reason: 'timeout' });
        expect(select).toHaveBeenCalledTimes(1);
    });
});
