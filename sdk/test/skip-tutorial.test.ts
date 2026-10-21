/**
 * Logic test for bot.skipTutorial() — no bot required.
 *
 * A fresh login can publish its first in-game state before the character design
 * modal arrives (worse in a throttled background tab), and the first talk to the
 * guide can come back "I can't reach that!". skipTutorial used to check for the
 * modal once and give up after one talk attempt.
 */

import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';
import { BotActions } from '../actions';
import type { ActionResult, BotWorldState } from '../types';
import type { CharacterDesign, CharacterDesignState } from '../character-design';

const design: CharacterDesign = { gender: true, body: { hair: 0, jaw: 10, torso: 18, arms: 26, hands: 33, legs: 36, feet: 42 }, colors: { hair: 0, torso: 0, legs: 0, feet: 0, skin: 0 } };
const appearance = { gender: true, slots: [0, 0, 0, 0, 274, 0, 282, 292, 256, 289, 298, 266], colors: design.colors };

type World = {
    modalOpen: boolean;
    dialogOpen: boolean;
    pages: number;
    messages: string[];
};

function snapshot(w: World): BotWorldState {
    return {
        inGame: true,
        revision: w.modalOpen ? 0 : 1,
        characterDesign: w.modalOpen ? { current: design, options: {} as CharacterDesignState['options'] } : null,
        player: { appearance },
        modalOpen: w.modalOpen,
        modalInterface: w.modalOpen ? 3559 : -1,
        dialog: { isOpen: w.dialogOpen, options: [], isWaiting: false },
        gameMessages: w.messages.map(text => ({ text })),
    } as unknown as BotWorldState;
}

/**
 * `onWait` runs on every waitForCondition call (the moment time passes), and
 * `talkOpens` decides per attempt whether talking to the guide opens a dialog.
 */
function mount(world: World, opts: { onWait?: (w: World) => void; talkOpens: (attempt: number) => boolean; randomizeResult?: ActionResult; acceptResult?: ActionResult; legacy?: boolean }) {
    const sdk = new BotSDK({ botUsername: 'test' });
    const log: string[] = [];
    let talks = 0;

    (sdk as any).getState = () => ({ ...snapshot(world), ...(opts.legacy ? { characterDesign: undefined } : {}) });
    (sdk as any).findNearbyNpc = () => ({
        index: 1,
        name: 'RuneScape Guide',
        optionsWithIndex: [{ text: 'Talk-to', opIndex: 1 }],
    });
    (sdk as any).waitForTicks = async () => {};
    (sdk as any).waitForCondition = async (pred: (s: BotWorldState) => boolean) => {
        opts.onWait?.(world);
        const s = snapshot(world);
        if (pred(s)) return s;
        throw new Error('timeout');
    };
    (sdk as any).sendRandomizeCharacterDesign = async (gender?: boolean): Promise<ActionResult> => {
        log.push('randomize:' + gender);
        return opts.randomizeResult ?? { success: true, message: 'ok', data: { design } };
    };
    (sdk as any).sendAcceptCharacterDesign = async (): Promise<ActionResult> => {
        log.push('accept');
        if (opts.acceptResult) return opts.acceptResult;
        world.modalOpen = false;
        return { success: true, message: 'ok', data: { design } };
    };
    (sdk as any).sendInteractNpc = async (): Promise<ActionResult> => {
        talks++;
        log.push(`talk${talks}`);
        if (opts.talkOpens(talks)) {
            world.dialogOpen = true;
        } else {
            world.messages.push("I can't reach that!");
        }
        return { success: true, message: 'ok' };
    };
    (sdk as any).sendClickDialog = async (): Promise<ActionResult> => {
        world.pages--;
        if (world.pages <= 0) world.dialogOpen = false;
        return { success: true, message: 'ok' };
    };

    return { bot: new BotActions(sdk), log };
}

const fresh = (): World => ({ modalOpen: false, dialogOpen: false, pages: 3, messages: ['Welcome to RuneScape.'] });

describe('skipTutorial()', () => {
    test('accepts a design modal that arrives after the first state, before talking', async () => {
        const world = fresh();
        let waits = 0;
        const { bot, log } = mount(world, {
            onWait: w => { if (++waits === 1) w.modalOpen = true; },
            talkOpens: () => true,
        });

        const result = await bot.skipTutorial({ randomizeAppearance: false });

        expect(result.success).toBe(true);
        expect(log).toEqual(['accept', 'talk1']);
    });

    test('retries the guide talk when the first attempt opens no dialog', async () => {
        const { bot, log } = mount(fresh(), { talkOpens: attempt => attempt === 2 });

        const result = await bot.skipTutorial({ randomizeAppearance: false });

        expect(result.success).toBe(true);
        expect(log).toEqual(['talk1', 'talk2']);
    });

    test('names the last game message after exhausting attempts', async () => {
        const { bot, log } = mount(fresh(), { talkOpens: () => false });

        const result = await bot.skipTutorial({ randomizeAppearance: false });

        expect(result.success).toBe(false);
        expect(log).toEqual(['talk1', 'talk2', 'talk3']);
        expect(result.message).toContain("I can't reach that!");
    });
});


describe('tutorial appearance handling', () => {
    test('keeps automatic randomization as the no-options default', async () => {
        const { bot, log } = mount({ ...fresh(), modalOpen: true }, { talkOpens: () => true });
        expect((await bot.skipTutorial()).success).toBe(true);
        expect(log).toEqual(['randomize:undefined', 'accept', 'talk1']);
    });
    test('randomizes automatically and confirms before talking, preserving gender selection', async () => {
        const { bot, log } = mount({ ...fresh(), modalOpen: true }, { talkOpens: () => true });
        expect((await bot.skipTutorial({ gender: false })).success).toBe(true);
        expect(log).toEqual(['randomize:false', 'accept', 'talk1']);
    });
    test('a failed randomization stops before acceptance or guide interaction', async () => {
        const failure = { success: false, message: 'bad design', reason: 'invalid_design' };
        const { bot, log } = mount({ ...fresh(), modalOpen: true }, { talkOpens: () => true, randomizeResult: failure });
        expect(await bot.skipTutorial()).toEqual(failure);
        expect(log).toEqual(['randomize:undefined']);
    });
    test('a failed confirmation stops before guide interaction', async () => {
        const failure = { success: false, message: 'accept failed', reason: 'client_rejected' };
        const { bot, log } = mount({ ...fresh(), modalOpen: true }, { talkOpens: () => true, acceptResult: failure });
        expect(await bot.skipTutorial({ randomizeAppearance: false })).toEqual(failure);
        expect(log).toEqual(['accept']);
    });
    test('does not randomize an appearance already confirmed before skipping', async () => {
        const { bot, log } = mount(fresh(), { talkOpens: () => true });
        expect((await bot.skipTutorial()).success).toBe(true);
        expect(log).toEqual(['talk1']);
    });
    test('reports an old client before accepting an unverified design', async () => {
        const { bot, log } = mount({ ...fresh(), modalOpen: true }, { talkOpens: () => true, legacy: true });
        expect(await bot.skipTutorial({ randomizeAppearance: false })).toMatchObject({ success: false, reason: 'unsupported_client' });
        expect(log).toEqual([]);
    });
});
