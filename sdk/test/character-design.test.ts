import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';
import { BotActions } from '../actions';
import { executionContext } from '../execution-context';
import { CHARACTER_BODY_PARTS, CHARACTER_COLOR_PARTS, CHARACTER_DESIGN_INTERFACE, appearanceMatchesDesign, type CharacterDesign, type CharacterDesignState, type PlayerAppearance } from '../character-design';
import type { ActionResult, BotAction, BotWorldState } from '../types';

const design: CharacterDesign = {
    gender: false,
    body: { hair: 45, jaw: -1, torso: 56, arms: 61, hands: 67, legs: 70, feet: 79 },
    colors: { hair: 11, torso: 15, legs: 15, feet: 5, skin: 7 }
};
const slots = [8, 11, 4, 6, 9, 7, 10];
function appearance(d: CharacterDesign): PlayerAppearance {
    const encoded = new Array(12).fill(0);
    CHARACTER_BODY_PARTS.forEach((part, i) => { encoded[slots[i]!] = d.body[part] === -1 ? 0 : 256 + d.body[part]; });
    return { gender: d.gender, slots: encoded, colors: { ...d.colors } };
}

function harness(options: {
    open?: boolean;
    legacy?: boolean;
    set?: () => Promise<ActionResult> | ActionResult;
    accept?: () => ActionResult | void | Promise<ActionResult>;
} = {}) {
    const sdk = new BotSDK({ botUsername: 'design-test', autoLaunchBrowser: false });
    const internal = sdk as any;
    const actions: BotAction[] = [];
    const screen = (): CharacterDesignState => ({ current: structuredClone(design), options: {} as CharacterDesignState['options'] });
    internal.state = {
        inGame: true, tick: 1, revision: 1,
        modalOpen: options.open !== false,
        modalInterface: options.open === false ? -1 : CHARACTER_DESIGN_INTERFACE,
        characterDesign: options.legacy ? undefined : options.open === false ? null : screen(),
        player: { appearance: null }
    } as unknown as BotWorldState;
    function publish(patch: Partial<BotWorldState>) {
        internal.state = { ...internal.state, ...patch, revision: internal.state.revision + 1 };
        for (const listener of internal.stateListeners) listener(internal.state);
    }
    internal.sendAction = async (action: BotAction) => {
        actions.push(action);
        if (action.type === 'setCharacterDesign') {
            return options.set ? await options.set() : { success: true, message: 'edited', data: { design } };
        }
        if (action.type === 'acceptCharacterDesign') {
            const result = await options.accept?.();
            return result ?? { success: true, message: 'dispatched', data: { design } };
        }
        throw new Error('Unexpected action ' + action.type);
    };
    return { sdk, bot: new BotActions(sdk), actions, publish, screen, internal };
}

describe('character design confirmation', () => {
    test('waits for server appearance after the screen closes and submits exactly once', async () => {
        const sent = Promise.withResolvers<void>();
        const h = harness({ accept: () => {
            h.publish({ modalOpen: false, modalInterface: -1, characterDesign: null });
            sent.resolve();
        } });
        let completed = false;
        const result = h.bot.acceptCharacterDesign({ colors: { hair: 11 } }).then(r => { completed = true; return r; });
        await sent.promise;
        await Promise.resolve();
        expect(completed).toBe(false);
        h.publish({ player: { appearance: appearance(design) } as any });
        expect(await result).toMatchObject({ success: true, phase: 'completion', data: { design } });
        expect(h.actions.map(a => a.type)).toEqual(['setCharacterDesign', 'acceptCharacterDesign']);
        expect(h.actions[0]).toMatchObject({ patch: { colors: { hair: 11 } } });
        expect(h.internal.stateListeners.size).toBe(0);
    });

    test('waits for the design screen when the first in-game state precedes it', async () => {
        const h = harness({ open: false, accept: () => {
            h.publish({ modalOpen: false, modalInterface: -1, characterDesign: null, player: { appearance: appearance(design) } as any });
        } });
        const result = h.bot.acceptCharacterDesign();
        expect(h.actions).toHaveLength(0);
        h.publish({ modalOpen: true, modalInterface: CHARACTER_DESIGN_INTERFACE, characterDesign: h.screen() });
        expect((await result).success).toBe(true);
    });

    test('does not treat screen closure and a different server appearance as success', async () => {
        const h = harness({ accept: () => {
            const wrong = appearance(design);
            wrong.colors.skin = 0;
            h.publish({ modalOpen: false, modalInterface: -1, characterDesign: null, player: { appearance: wrong } as any });
        } });
        expect(await h.bot.acceptCharacterDesign(undefined, 25)).toMatchObject({ success: false, phase: 'observation', reason: 'timeout' });
        expect(h.actions).toHaveLength(1);
        expect(h.internal.stateListeners.size).toBe(0);
    });

    test('returns edit and accept failures without attempting another action', async () => {
        const failure = { success: false, message: 'bad kit', reason: 'invalid_design', phase: 'validation' } as const;
        const edited = harness({ set: () => failure });
        expect(await edited.bot.acceptCharacterDesign({ body: { hair: -999 } })).toEqual(failure);
        expect(edited.actions.map(a => a.type)).toEqual(['setCharacterDesign']);
        const accepted = harness({ accept: () => failure });
        expect(await accepted.bot.acceptCharacterDesign()).toEqual(failure);
        expect(accepted.actions).toHaveLength(1);
    });

    test('old clients fail before submitting and the primitive stays available', async () => {
        const h = harness({ legacy: true });
        expect(await h.bot.acceptCharacterDesign()).toMatchObject({ success: false, reason: 'unsupported_client' });
        expect(h.actions).toHaveLength(0);
        expect((await h.sdk.sendAcceptCharacterDesign()).success).toBe(true);
    });

    test('missing server appearance telemetry fails before editing or accepting', async () => {
        const h = harness();
        h.internal.state.player = {};
        expect(await h.bot.acceptCharacterDesign({ gender: false })).toMatchObject({ success: false, reason: 'unsupported_client' });
        expect(h.actions).toHaveLength(0);
    });

    test('waits for the local player before submitting a late design screen', async () => {
        const h = harness({ accept: () => {
            h.publish({ modalOpen: false, modalInterface: -1, characterDesign: null, player: { appearance: appearance(design) } as any });
        } });
        h.internal.state.player = null;
        const result = h.bot.acceptCharacterDesign();
        expect(h.actions).toHaveLength(0);
        h.publish({ player: { appearance: null } as any });
        expect((await result).success).toBe(true);
    });

    test('bounds waiting for a late modal without dispatching', async () => {
        const h = harness({ open: false });
        expect(await h.bot.acceptCharacterDesign(undefined, 20)).toMatchObject({ success: false, reason: 'timeout' });
        expect(h.actions).toHaveLength(0);
        expect(h.internal.stateListeners.size).toBe(0);
    });

    test('cancellation after editing prevents acceptance', async () => {
        const controller = new AbortController();
        const h = harness({ set: () => {
            controller.abort(new Error('selection cancelled'));
            return { success: true, message: 'edited', data: { design } };
        } });
        await expect(executionContext.run({ signal: controller.signal }, () => h.bot.acceptCharacterDesign({ gender: false }))).rejects.toThrow('selection cancelled');
        expect(h.actions.map(a => a.type)).toEqual(['setCharacterDesign']);
    });

    test('the deadline includes editing and a late edit cannot accept afterward', async () => {
        const release = Promise.withResolvers<ActionResult>();
        const h = harness({ set: () => release.promise });
        expect(await h.bot.acceptCharacterDesign({ gender: false }, 20)).toMatchObject({ success: false, reason: 'timeout' });
        release.resolve({ success: true, message: 'late edit' });
        await Bun.sleep(1);
        expect(h.actions.map(a => a.type)).toEqual(['setCharacterDesign']);
    });

    test('a deadline during the accept dispatch reports an uncertain outcome without retrying', async () => {
        const release = Promise.withResolvers<ActionResult>();
        const h = harness({ accept: () => release.promise });
        expect(await h.bot.acceptCharacterDesign(undefined, 20)).toMatchObject({ success: false, reason: 'timeout', phase: 'observation' });
        release.resolve({ success: true, message: 'late acceptance', data: { design } });
        await Bun.sleep(1);
        expect(h.actions.map(a => a.type)).toEqual(['acceptCharacterDesign']);
        expect(h.internal.stateListeners.size).toBe(0);
    });
});

describe('observed appearance comparison', () => {
    test('recognizes all seven body slots, colour channels, gender, and an absent female jaw', () => {
        expect(appearanceMatchesDesign(appearance(design), design)).toBe(true);
        for (const part of CHARACTER_COLOR_PARTS) {
            const changed = appearance(design);
            changed.colors[part]--;
            expect(appearanceMatchesDesign(changed, design)).toBe(false);
        }
        expect(appearanceMatchesDesign({ ...appearance(design), gender: true }, design)).toBe(false);
        expect(appearanceMatchesDesign(null, design)).toBe(false);
    });

    test('equipment and hidden body slots cannot masquerade as the selected kits', () => {
        const equipped = appearance(design);
        equipped.slots[4] = 512 + design.body.torso;
        expect(appearanceMatchesDesign(equipped, design)).toBe(false);
        equipped.slots[4] = 0;
        expect(appearanceMatchesDesign(equipped, design)).toBe(false);
    });

    test('an NPC transformation cannot match body slots retained from a previous player appearance', () => {
        const transformed = appearance(design);
        transformed.slots[0] = 65535;
        expect(appearanceMatchesDesign(transformed, design)).toBe(false);
    });
});
