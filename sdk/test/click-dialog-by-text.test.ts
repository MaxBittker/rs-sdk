#!/usr/bin/env bun
/**
 * Logic test for sdk.clickDialogByText() — no bot required.
 *
 * Verifies the helper resolves dialog options by visible text and dispatches
 * the server-assigned (1-based) index, sidestepping the array-position
 * footgun that exists with raw sendClickDialog().
 */

import { BotSDK } from '../index';
import type { ActionResult, BotWorldState, DialogOption } from '../types';

let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
    if (ok) {
        console.log(`  ok  ${label}`);
    } else {
        failures++;
        console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function makeOption(index: number, text: string): DialogOption {
    return { index, text, componentId: 1000 + index, buttonType: 0 };
}

function makeState(opts: { dialogOpen: boolean; options?: DialogOption[] }): BotWorldState {
    // Only the dialog field matters — cast the rest. clickDialogByText only
    // touches state.dialog.
    return {
        dialog: {
            isOpen: opts.dialogOpen,
            options: opts.options ?? [],
            isWaiting: false,
        },
    } as unknown as BotWorldState;
}

function mountSdk(state: BotWorldState | null): { sdk: BotSDK; calls: number[] } {
    const sdk = new BotSDK({ botUsername: 'test' });
    (sdk as any).state = state;

    // Stub the protocol-level call so we can record what the helper dispatches.
    const calls: number[] = [];
    (sdk as any).sendClickDialog = async (option: number): Promise<ActionResult> => {
        calls.push(option);
        return { success: true, message: 'stub-clicked' };
    };

    return { sdk, calls };
}

async function run(): Promise<void> {
    console.log('clickDialogByText():');

    // 1. No dialog open → returns no_dialog
    {
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: false }));
        const r = await sdk.clickDialogByText(/yes/i);
        check('returns no_dialog when dialog is closed',
            !r.success && r.reason === 'no_dialog' && calls.length === 0,
            JSON.stringify(r));
    }

    // 2. Null state → returns no_dialog
    {
        const { sdk, calls } = mountSdk(null);
        const r = await sdk.clickDialogByText(/yes/i);
        check('returns no_dialog when state is null',
            !r.success && r.reason === 'no_dialog' && calls.length === 0,
            JSON.stringify(r));
    }

    // 3. Pattern matches first option → dispatches its server index (1, NOT 0)
    //    This is the core footgun fix: array position 0 maps to server index 1.
    {
        const options = [
            makeOption(1, 'Yes, ok.'),
            makeOption(2, 'No thanks.'),
        ];
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: true, options }));
        const r = await sdk.clickDialogByText(/yes/i);
        check('dispatches server-assigned index 1 for first option (NOT array position 0)',
            r.success && calls.length === 1 && calls[0] === 1,
            `result=${JSON.stringify(r)} calls=${JSON.stringify(calls)}`);
    }

    // 4. Pattern matches a later option → dispatches that option's index
    {
        const options = [
            makeOption(1, 'Yes, ok.'),
            makeOption(2, 'Is there anything down this alleyway?'),
            makeOption(3, 'No thanks.'),
        ];
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: true, options }));
        const r = await sdk.clickDialogByText('alleyway');
        check('dispatches index 2 for the alleyway option',
            r.success && calls.length === 1 && calls[0] === 2,
            `calls=${JSON.stringify(calls)}`);
    }

    // 5. String patterns are case-insensitive
    {
        const options = [makeOption(1, 'Yes, ok.'), makeOption(2, 'No thanks.')];
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: true, options }));
        const r = await sdk.clickDialogByText('YES');
        check('string pattern is case-insensitive',
            r.success && calls[0] === 1,
            `calls=${JSON.stringify(calls)}`);
    }

    // 6. Caller-supplied RegExp flags are respected (e.g. case-sensitive when
    //    explicitly constructed without /i)
    {
        const options = [makeOption(1, 'Yes, ok.'), makeOption(2, 'No thanks.')];
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: true, options }));
        const r = await sdk.clickDialogByText(/YES/);  // no /i, won't match "Yes"
        check('explicit RegExp without /i is honoured (no match)',
            !r.success && r.reason === 'no_match' && calls.length === 0,
            `result=${JSON.stringify(r)}`);
    }

    // 7. No match → returns no_match with available options listed
    {
        const options = [makeOption(1, 'Yes, ok.'), makeOption(2, 'No thanks.')];
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: true, options }));
        const r = await sdk.clickDialogByText(/maybe/i);
        check('returns no_match when no option matches',
            !r.success && r.reason === 'no_match' && calls.length === 0
                && r.message.includes('Yes, ok.') && r.message.includes('No thanks.'),
            JSON.stringify(r));
    }

    // 8. Empty options list → returns no_match (with "(none)")
    {
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: true, options: [] }));
        const r = await sdk.clickDialogByText(/anything/);
        check('returns no_match when option list is empty',
            !r.success && r.reason === 'no_match' && calls.length === 0
                && r.message.includes('(none)'),
            JSON.stringify(r));
    }

    // 9. Non-contiguous server indices are passed through verbatim. (Real
    //    dialogs always assign 1..N contiguously today, but the SDK should
    //    never assume that — it must trust DialogOption.index.)
    {
        const options = [
            makeOption(7, 'Yes, ok.'),
            makeOption(42, 'Tell me more.'),
        ];
        const { sdk, calls } = mountSdk(makeState({ dialogOpen: true, options }));
        const r = await sdk.clickDialogByText(/tell me/i);
        check('passes through non-contiguous server-assigned indices',
            r.success && calls[0] === 42,
            `calls=${JSON.stringify(calls)}`);
    }

    console.log('');
    if (failures === 0) {
        console.log('PASSED — all 9 cases');
        process.exit(0);
    } else {
        console.log(`FAILED — ${failures} case(s) failed`);
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
