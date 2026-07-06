#!/usr/bin/env bun
import { runTest, sleep } from './utils/test-runner';
import type { BotSDK } from '..';

/**
 * Regression test for the toll-gate choice-dialog bug that stranded team-run
 * bots at the Al Kharid gate.
 *
 * A bare continue click (RESUME_PAUSEBUTTON) sent while a p_choice menu was
 * open used to resume the script immediately, and the choice resolved from
 * the player's stale `last_com` — silently answering with whatever option
 * the player last clicked. Agents that advance dialogs with
 * `sendClickDialog(0)` loops race the state stream and hit this constantly:
 * once a bot clicked "No thank you" a single time, every later toll attempt
 * auto-declined no matter which option it clicked.
 *
 * Flow:
 * 1. decline the toll once ("No thank you") to seed a stale last_com
 * 2. reopen the guard dialog and advance to the 3-option choice
 * 3. fire a bare continue at the open choice — it must NOT answer it
 * 4. answer "Yes, ok." for real and verify passage + 10gp deducted
 */

const CHOICE_YES = /yes, ok/i;
const CHOICE_NO = /no thank you/i;

function coinCount(sdk: BotSDK): number {
    return sdk.findInventoryItem(/^coins$/i)?.count ?? 0;
}

function choiceOpen(sdk: BotSDK): boolean {
    const dialog = sdk.getDialog();
    return !!dialog?.isOpen && dialog.options.some(o => CHOICE_YES.test(o.text));
}

/** Talk to a border guard and click through narration until the toll choice shows. */
async function openTollChoice(sdk: BotSDK): Promise<boolean> {
    for (let i = 0; i < 30; i++) {
        if (choiceOpen(sdk)) return true;

        const dialog = sdk.getDialog();
        if (dialog?.isOpen) {
            // Narration page ("Click here to continue") — safe to continue.
            if (dialog.options.length <= 1) {
                await sdk.sendClickDialog(0);
            }
        } else {
            const guard = sdk
                .getNearbyNpcs()
                .filter(n => /border guard/i.test(n.name))
                .sort((a, b) => a.distance - b.distance)[0];
            if (guard) {
                await sdk.sendInteractNpc(guard.index, 1);
            }
        }

        await sleep(700);
    }
    return false;
}

/** Click through remaining narration pages until the dialog fully closes. */
async function closeOutDialog(sdk: BotSDK): Promise<void> {
    for (let i = 0; i < 10 && sdk.getDialog()?.isOpen; i++) {
        await sdk.sendClickDialog(0);
        await sleep(700);
    }
}

runTest({
    name: 'Al Kharid Gate Choice Resume',
    saveConfig: { position: { x: 3267, z: 3228 }, coins: 20 },
}, async ({ sdk }) => {
    await sdk.waitForCondition(s => (s.player?.worldX ?? 0) > 0, 10000);

    // --- 1. Seed a stale last_com by declining the toll once ---------------
    if (!await openTollChoice(sdk)) {
        console.log('ERROR: could not reach the toll choice menu (1st visit)');
        return false;
    }
    const declined = await sdk.clickDialogByText(CHOICE_NO);
    if (!declined.success) {
        console.log(`ERROR: could not decline toll: ${declined.message}`);
        return false;
    }
    await closeOutDialog(sdk);
    console.log('Declined toll once (last_com now points at "No thank you")');

    // --- 2. Reopen the dialog up to the choice -----------------------------
    if (!await openTollChoice(sdk)) {
        console.log('ERROR: could not reach the toll choice menu (2nd visit)');
        return false;
    }

    // --- 3. Bug probe: a bare continue must not answer the choice ----------
    await sdk.sendClickDialog(0);
    await sleep(2000);

    if (!choiceOpen(sdk)) {
        const dialog = sdk.getDialog();
        const now = dialog?.isOpen
            ? `dialog moved on to: ${dialog.options.map(o => `"${o.text}"`).join(', ')} — ${dialog.text ?? ''}`
            : 'dialog closed';
        console.log(`BUG: bare continue consumed the choice via stale last_com (${now})`);
        return false;
    }
    console.log('Bare continue at the choice was ignored (choice still open)');

    // --- 4. Happy path: pay the toll and walk through ----------------------
    const coinsBefore = coinCount(sdk);
    const paid = await sdk.clickDialogByText(CHOICE_YES);
    if (!paid.success) {
        console.log(`ERROR: could not click "Yes, ok.": ${paid.message}`);
        return false;
    }
    await closeOutDialog(sdk);
    await sleep(1500);

    const coinsAfter = coinCount(sdk);
    const x = sdk.getState()?.player?.worldX ?? 0;
    console.log(`coins ${coinsBefore} -> ${coinsAfter}, x=${x}`);

    if (coinsAfter !== coinsBefore - 10) {
        console.log('ERROR: toll was not paid');
        return false;
    }
    if (x < 3268) {
        console.log('ERROR: did not pass through the gate');
        return false;
    }

    console.log('Paid the toll and passed through the gate');
    return true;
});
