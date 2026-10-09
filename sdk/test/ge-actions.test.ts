import { expect, test } from 'bun:test';
import { BotActions } from '../actions';
import { BotSDK } from '../index';
import type { GEState } from '../ge-types';
const state = (extra: Partial<GEState> = {}): GEState => ({
    isOpen: true,
    session: 1,
    revision: 1,
    actionRevision: 0,
    screen: 'home',
    offers: [],
    controls: { collectAll: 5 },
    draft: null,
    selectedOffer: null,
    search: null,
    input: null,
    error: null,
    notice: '',
    receipt: null,
    ...extra,
});
function setup(ge: GEState | null = state()) {
    const sdk = new BotSDK({ botUsername: 'unused', autoLaunchBrowser: false });
    const world = {
        ge,
        modalOpen: !!ge,
        interface: { isOpen: !!ge, interfaceId: 11942, options: [] },
        dialog: { isOpen: false },
    } as any;
    (sdk as any).state = world;
    sdk.getGEAvailability = async () => ({ enabled: true });
    sdk.isConnected = () => true;
    sdk.getStateAge = () => 0;
    const sent: number[] = [];
    sdk.sendClickComponent = async (id) => {
        sent.push(id);
        return { success: true, message: 'dispatched', phase: 'dispatch' };
    };
    return { sdk, world, sent, bot: new BotActions(sdk) };
}
test('closed and stale sessions fail before dispatch', async () => {
    const closed = setup(null);
    expect((await closed.bot.collectGE()).reason).toBe('no_interface');
    expect(closed.sent).toEqual([]);
    const stale = setup();
    stale.sdk.getStateAge = () => 6000;
    expect((await stale.bot.collectGE()).reason).toBe('stale_state');
    expect(stale.sent).toEqual([]);
});
test('a missing receipt is an unknown outcome and never triggers an automatic retry', async () => {
    const { sdk, bot, sent } = setup();
    sdk.waitForCondition = async () => {
        throw new Error('timeout');
    };
    const result = await bot.collectGE(10);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('unknown');
    expect(sent).toEqual([5]);
});
test('a newer tick repeating a previous collection receipt cannot confirm another collection', async () => {
    const { sdk, world, bot } = setup(state({ receipt: { token: 10, kind: 'collect', items: 3, coins: 4 } }));
    sdk.waitForCondition = async (predicate) => {
        world.ge = { ...world.ge, revision: 2 };
        expect(predicate(world)).toBe(false);
        world.ge = {
            ...world.ge,
            revision: 3,
            actionRevision: 1,
            receipt: { token: 11, kind: 'collect', items: 0, coins: 0 },
        };
        expect(predicate(world)).toBe(true);
        return world;
    };
    const result = await bot.collectGE();
    expect(result.success).toBe(true);
    expect(result.items).toBe(0);
    expect(result.coins).toBe(0);
});
test('session changes after dispatch are uncertain and concurrent actions are rejected', async () => {
    const { sdk, world, bot, sent } = setup();
    let release!: () => void;
    sdk.waitForCondition = async (predicate) => {
        await new Promise<void>((resolve) => {
            release = resolve;
        });
        world.ge = { ...world.ge, session: 2 };
        expect(predicate(world)).toBe(true);
        return world;
    };
    const first = bot.collectGE();
    await Promise.resolve();
    await Promise.resolve();
    expect((await new BotActions(sdk).collectGE()).reason).toBe('busy');
    release();
    expect((await first).outcome).toBe('unknown');
    expect(sent).toEqual([5]);
});
test('incidental UI dismissal preserves the exchange', async () => {
    const { sdk, bot } = setup();
    let closes = 0;
    sdk.sendCloseModal = async () => {
        closes++;
        return { success: true, message: 'closed' };
    };
    await bot.dismissBlockingUI();
    expect(closes).toBe(0);
});

test('passive updates cannot replay an earlier server error as a new command rejection', async () => {
    const { sdk, world, bot } = setup(state({ error: 'Earlier failure' }));
    sdk.waitForCondition = async (predicate) => {
        world.ge = { ...world.ge, revision: 2 };
        expect(predicate(world)).toBe(false);
        world.ge = {
            ...world.ge,
            revision: 3,
            actionRevision: 1,
            error: null,
            receipt: { token: 1, kind: 'collect', items: 0, coins: 0 },
        };
        expect(predicate(world)).toBe(true);
        return world;
    };
    expect((await bot.collectGE()).success).toBe(true);
});

test('disabled GE actions explain unavailability before walking or dispatching', async () => {
    const { sdk, bot, sent } = setup(null);
    sdk.getGEAvailability = async () => ({ enabled: false });
    let walks = 0;
    bot.walkTo = async () => { walks++; throw new Error('Must not walk'); };
    for (const action of [
        () => bot.openGE(),
        () => bot.searchGE('logs'),
        () => bot.placeGEOffer({ item: 1511, side: 'buy', quantity: 1, price: 1 }),
        () => bot.cancelGEOffer(1),
        () => bot.collectGE(),
    ]) {
        const result = await action();
        expect(result.success).toBe(false);
        expect(result.reason).toBe('ge_unavailable');
        expect(result.message).toBe('Grand Exchange is not available on this server.');
        expect(result.outcome).toBeUndefined();
    }
    expect(walks).toBe(0);
    expect(sent).toEqual([]);
});

const table = { id: 1, name: 'Grand Exchange table', x: 3180, z: 3443 } as any;
const teller = { id: 2, name: 'Grand Exchange teller', x: 3181, z: 3445 } as any;

test('open() tries every reachable target and skips travel when one is already in reach', async () => {
    const { sdk, world, bot } = setup(null);
    let walks = 0;
    bot.walkTo = async () => {
        walks++;
        return { success: true, message: 'Arrived' };
    };
    sdk.findNearbyLoc = (() => table) as any;
    sdk.findNearbyNpc = (() => teller) as any;
    // A table that will not open must not rule out the teller: both open the same exchange.
    bot.interactLoc = async () => ({ success: false, message: "I can't reach that!", reason: 'cant_reach' });
    bot.interactNpc = async () => {
        world.ge = state();
        world.modalOpen = true;
        return { success: true, message: 'Interacted' };
    };
    sdk.waitForCondition = (async (predicate: any) => {
        if (!predicate(world)) throw new Error('timeout');
        return world;
    }) as any;
    const result = await bot.openGE();
    expect(result.success).toBe(true);
    expect(result.message).toContain('teller');
    expect(walks).toBe(0);
});

test('a contested stand tile does not fail open()', async () => {
    const { sdk, world, bot } = setup(null);
    let walked = false;
    // The exact-tile walk open() used to depend on: it fails whenever another player
    // stands on the stand tile, even though the bot lands beside the table anyway.
    bot.walkTo = async () => {
        walked = true;
        return { success: false, message: 'Stuck at (3182, 3438)' };
    };
    sdk.findNearbyLoc = (() => (walked ? table : null)) as any;
    sdk.findNearbyNpc = (() => null) as any;
    bot.interactLoc = async () => {
        world.ge = state();
        world.modalOpen = true;
        return { success: true, message: 'Interacted' };
    };
    sdk.waitForCondition = (async (predicate: any) => {
        if (!predicate(world)) throw new Error('timeout');
        return world;
    }) as any;
    const result = await bot.openGE();
    expect(result.success).toBe(true);
    expect(result.message).toContain('table');
});

test('open() reports why it could not reach the exchange', async () => {
    const { sdk, bot } = setup(null);
    sdk.findNearbyLoc = (() => null) as any;
    sdk.findNearbyNpc = (() => null) as any;
    bot.walkTo = async () => ({ success: false, message: 'Stuck at (3191, 3436)' });
    const result = await bot.openGE();
    expect(result.success).toBe(false);
    expect(result.reason).toBe('cant_reach');
    expect(result.message).toContain('Stuck at (3191, 3436)');
});

test('other actions reopen a closed exchange from a target in reach, but never travel for it', async () => {
    const { sdk, world, bot, sent } = setup(null);
    let walks = 0;
    bot.walkTo = async () => {
        walks++;
        throw new Error('Must not travel to reopen');
    };
    sdk.findNearbyLoc = (() => table) as any;
    sdk.findNearbyNpc = (() => null) as any;
    bot.interactLoc = async () => {
        world.ge = state();
        world.modalOpen = true;
        return { success: true, message: 'Interacted' };
    };
    sdk.waitForCondition = (async (predicate: any) => {
        if (predicate(world)) return world;
        world.ge = {
            ...world.ge,
            revision: world.ge.revision + 2,
            actionRevision: world.ge.actionRevision + 1,
            receipt: { token: 99, kind: 'collect', items: 0, coins: 0 },
        };
        if (!predicate(world)) throw new Error('timeout');
        return world;
    }) as any;
    const result = await bot.collectGE();
    expect(result.success).toBe(true);
    expect(walks).toBe(0);
    expect(sent).toEqual([5]);
});

test('reopening is best effort and never masks the caller own failure', async () => {
    const { sdk, bot, sent } = setup(null);
    sdk.findNearbyLoc = (() => {
        throw new Error('scene not loaded');
    }) as any;
    const result = await bot.collectGE();
    expect(result.reason).toBe('no_interface');
    expect(sent).toEqual([]);
});
