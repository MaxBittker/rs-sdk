/**
 * Logic test for bot.dismissBlockingUI() — no bot required.
 *
 * Regression for the harvested report msqgybjn: the helper used to hardcode
 * sendClickDialog(0), but "Click here to continue" is published at the
 * server-assigned index 1, so every dismiss attempt was rejected and any
 * continue-dialog silently wedged all subsequent BotActions calls.
 */

import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';
import { BotActions } from '../actions';
import type { ActionResult, BotWorldState, DialogOption } from '../types';

function makeOption(index: number, text: string): DialogOption {
    return { index, text, componentId: 6224, buttonType: 6 };
}

function makeState(opts: { dialogOpen: boolean; options?: DialogOption[] }): BotWorldState {
    // Only the dialog field matters — dismissBlockingUI reads dialog first and
    // the stub closes it after one click, so interface/shop/bank never gate.
    return {
        dialog: {
            isOpen: opts.dialogOpen,
            options: opts.options ?? [],
            isWaiting: false,
        },
    } as unknown as BotWorldState;
}

function mount(states: BotWorldState[]): { bot: BotActions; calls: number[] } {
    const sdk = new BotSDK({ botUsername: 'test' });

    // Each getState() call consumes the next snapshot; the last one repeats.
    let i = 0;
    (sdk as any).getState = () => states[Math.min(i, states.length - 1)];

    const calls: number[] = [];
    (sdk as any).sendClickDialog = async (option: number): Promise<ActionResult> => {
        calls.push(option);
        i++; // clicking advances to the next snapshot
        return { success: true, message: 'stub-clicked' };
    };
    (sdk as any).waitForStateChange = async () => states[Math.min(i, states.length - 1)];

    return { bot: new BotActions(sdk), calls };
}

describe('dismissBlockingUI()', () => {
    test('clicks the server-assigned index, not array position 0', async () => {
        const { bot, calls } = mount([
            makeState({ dialogOpen: true, options: [makeOption(1, 'Click here to continue')] }),
            makeState({ dialogOpen: false }),
        ]);
        await bot.dismissBlockingUI();

        expect(calls).toEqual([1]);
    });

    test('falls back to 0 for an optionless dialog mid-transition', async () => {
        const { bot, calls } = mount([
            makeState({ dialogOpen: true, options: [] }),
            makeState({ dialogOpen: false }),
        ]);
        await bot.dismissBlockingUI();

        expect(calls).toEqual([0]);
    });

    test('does not click when no dialog is open', async () => {
        const { bot, calls } = mount([makeState({ dialogOpen: false })]);
        await bot.dismissBlockingUI();

        expect(calls).toEqual([]);
    });

    test('clicks each page of a multi-page dialog at its published index', async () => {
        const { bot, calls } = mount([
            makeState({ dialogOpen: true, options: [makeOption(1, 'Click here to continue')] }),
            makeState({ dialogOpen: true, options: [makeOption(2, 'Click here to continue')] }),
            makeState({ dialogOpen: false }),
        ]);
        await bot.dismissBlockingUI();

        expect(calls).toEqual([1, 2]);
    });

    // Regression for the harvested reports msw80ivq/mswmz7f3/mswa5fca/mswjr44j:
    // dismissBlockingUI runs before every BotActions call, and clicking the
    // first option of a p_choice menu ANSWERS the choice as option 1 on the
    // server — the caller's intended click then silently no-ops and the wrong
    // quest branch runs. A multi-option dialog is a decision, not blocking UI.
    test('never clicks a multi-option choice dialog', async () => {
        const { bot, calls } = mount([
            makeState({
                dialogOpen: true,
                options: [
                    makeOption(1, "Who's Saradomin?"),
                    makeOption(2, 'Nice place you have here.'),
                    makeOption(3, "I'm looking for a quest!"),
                ],
            }),
        ]);
        await bot.dismissBlockingUI();

        expect(calls).toEqual([]);
    });

    test('still clears a continue page that precedes a choice, then stops', async () => {
        const { bot, calls } = mount([
            makeState({ dialogOpen: true, options: [makeOption(1, 'Click here to continue')] }),
            makeState({
                dialogOpen: true,
                options: [
                    makeOption(1, "No thank you, I'll walk around."),
                    makeOption(2, 'Who does my money go to?'),
                    makeOption(3, 'Yes, ok.'),
                ],
            }),
        ]);
        await bot.dismissBlockingUI();

        expect(calls).toEqual([1]);
    });
});
