import { describe, expect, test } from 'bun:test';
import { BotActions } from '../actions';
import type { NearbyPlayer, TradeItem, TradeState } from '../types';

const partner: NearbyPlayer = {
    kind: 'player',
    index: 7,
    name: 'MuleBot',
    combatLevel: 3,
    x: 3222,
    z: 3222,
    distance: 1,
    reachable: true,
};

const CLOSED_TRADE: TradeState = {
    isOpen: false,
    screen: null,
    partner: null,
    myOffer: [],
    theirOffer: [],
    myAccepted: false,
    partnerAccepted: false,
};

const item = (slot: number, id: number, name: string, count: number): TradeItem => ({ slot, id, name, count });

interface Frame {
    trade?: Partial<TradeState>;
    inventory?: Array<{ slot: number; id: number; name: string; count: number }>;
    message?: string;
    tick?: number;
}

function state(frame: Frame, tick: number) {
    const trade: TradeState = { ...CLOSED_TRADE, ...(frame.trade ?? {}) };
    return {
        tick,
        revision: tick,
        player: { worldX: 3222, worldZ: 3222, lifeId: 1, isDead: false },
        inventory: frame.inventory ?? [],
        nearbyPlayers: [partner],
        nearbyNpcs: [],
        skills: [],
        gameMessages: frame.message
            ? [{ tick, text: frame.message, type: 0, sender: '', fromSelf: false }]
            : [],
        combatEvents: [],
        dialog: { isOpen: false, options: [], isWaiting: false },
        interface: trade.isOpen
            ? { isOpen: true, interfaceId: trade.screen === 'confirm' ? 3443 : 3323, options: [] }
            : { isOpen: false, interfaceId: -1, options: [] },
        shop: { isOpen: false },
        bank: { isOpen: false },
        trade,
    } as any;
}

/**
 * A bot whose state advances one frame per wait call. Messages accumulate is
 * not simulated - each frame carries its own gameMessages. sendDeclineTrade
 * fast-forwards to the last frame (the trade being closed), mirroring the
 * server closing both screens.
 */
function createHarness(frames: Frame[], opts: { hold?: number[] } = {}) {
    const sequence = frames.map((frame, i) => state(frame, i + 1));
    // Frames the harness refuses to auto-advance past: waits time out there
    // until a decline fast-forwards. Models "nothing happens until we act".
    const hold = new Set(opts.hold ?? []);
    let idx = 0;
    const dispatched: Array<{ call: string; args: unknown[] }> = [];
    const advance = () => {
        if (idx < sequence.length - 1 && !hold.has(idx)) idx++;
        return sequence[idx];
    };
    const record = (call: string, effect?: () => void) => async (...args: unknown[]) => {
        dispatched.push({ call, args });
        effect?.();
        return { success: true, message: 'dispatched' };
    };
    const sdk: any = {
        getState: () => sequence[idx],
        getTradeState: () => sequence[idx].trade ?? CLOSED_TRADE,
        waitForStateChange: async () => advance(),
        waitForTicks: async () => advance(),
        waitForCondition: async (pred: (s: any) => boolean) => {
            for (let guard = 0; guard < sequence.length + 1; guard++) {
                if (pred(sequence[idx])) return sequence[idx];
                if (idx >= sequence.length - 1 || hold.has(idx)) break;
                idx++;
            }
            throw new Error('waitForCondition timed out');
        },
        findNearbyPlayer: (pattern: string | RegExp) => {
            const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
            return regex.test(partner.name) ? partner : null;
        },
        findInventoryItem: (pattern: string | RegExp) => {
            const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
            return sequence[idx].inventory.find((i: any) => regex.test(i.name)) ?? null;
        },
        sendTradeRequest: record('sendTradeRequest'),
        sendOfferItem: record('sendOfferItem'),
        sendAcceptTrade: record('sendAcceptTrade'),
        sendDeclineTrade: record('sendDeclineTrade', () => { idx = sequence.length - 1; }),
        waitForTradeRequest: async () => null,
    };
    return { bot: new BotActions(sdk), sdk, dispatched };
}

const logs = (count: number) => item(0, 1511, 'Logs', count);

describe('bot.trade gift flow', () => {
    test('offers, double-accepts, and reports the inventory delta', async () => {
        const inventoryBefore = [{ slot: 0, id: 1511, name: 'Logs', count: 1 }];
        const harness = createHarness([
            // 0: no trade yet, partner nearby
            { inventory: inventoryBefore },
            // 1: request answered, offer screen open
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' }, inventory: inventoryBefore },
            // 2: our logs are in the offer window
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', myOffer: [logs(1)] }, inventory: [] },
            // 3: both accepted -> confirm screen
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', myOffer: [logs(1)] }, inventory: [] },
            // 4: trade completed
            { message: 'Accepted trade.', inventory: [] },
        ]);

        const result = await harness.bot.trade(partner, {
            give: [{ item: 'logs', amount: -1 }],
            timeout: 3_000,
        });

        expect(result.success).toBe(true);
        expect(result.reason).toBeUndefined();
        expect(result.partner).toBe('MuleBot');
        expect(result.gave).toEqual([{ slot: -1, id: 1511, name: 'Logs', count: 1, amount: 1 }]);
        expect(result.received).toEqual([]);
        expect(harness.dispatched.map(d => d.call)).toEqual([
            'sendTradeRequest',
            'sendOfferItem',
            'sendAcceptTrade', // offer screen
            'sendAcceptTrade', // confirm screen
        ]);
        expect(harness.dispatched[1]).toEqual({ call: 'sendOfferItem', args: [0, -1] });
        expect(harness.dispatched[0]).toEqual({ call: 'sendTradeRequest', args: [partner.index] });
    });
});

describe('bot.trade want enforcement', () => {
    test('declines on the confirm screen when the final offer shrank', async () => {
        const lobsters = (n: number) => item(0, 379, 'Lobster', n);
        const harness = createHarness([
            { },
            // Offer screen shows 5 lobsters - passes the want check.
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', theirOffer: [lobsters(5)] } },
            // Confirm screen shows only 4 - the re-verification must catch this.
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', theirOffer: [lobsters(4)] } },
            // Frame declineTrade jumps to: closed with the decline message.
            { message: 'Other player declined trade.' },
        ]);

        const result = await harness.bot.trade(partner, {
            want: [{ item: 'lobster', amount: 5 }],
            timeout: 3_000,
        });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('want_not_met');
        expect(harness.dispatched.map(d => d.call)).toEqual([
            'sendTradeRequest',
            'sendAcceptTrade',   // offer screen accept (offer looked fine there)
            'sendDeclineTrade',  // confirm screen re-check refused
        ]);
    });

    test('does not accept the offer screen until want is met', async () => {
        const harness = createHarness([
            { },
            // Offer screen with nothing offered - must NOT accept.
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' } },
            // Partner closes the trade.
            { message: 'Other player declined trade.' },
        ]);

        const result = await harness.bot.trade(partner, {
            want: [{ item: 'coins', amount: 100 }],
            timeout: 3_000,
        });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('declined');
        expect(harness.dispatched.map(d => d.call)).toEqual(['sendTradeRequest']);
    });
});

describe('bot.tradeWith failure modes', () => {
    test('reports a busy partner instead of waiting out the clock', async () => {
        const harness = createHarness([
            { },
            { message: 'MuleBot is busy at the moment.' },
        ]);

        const result = await harness.bot.tradeWith(partner, 3_000);
        expect(result).toMatchObject({ success: false, reason: 'busy' });
    });

    test('fails fast when the player is not nearby', async () => {
        const harness = createHarness([{ }]);
        const result = await harness.bot.tradeWith('NoSuchPlayer', 500);
        expect(result).toMatchObject({ success: false, reason: 'player_not_found' });
        expect(harness.dispatched).toEqual([]);
    });

    test('declines a session that is already open with a DIFFERENT player', async () => {
        // A pending request from Impostor raced this call; the open screen
        // must not be silently adopted as a trade with MuleBot.
        const harness = createHarness([
            { trade: { isOpen: true, screen: 'offer', partner: 'Impostor' } },
            { }, // closed after the decline; MuleBot never answers
        ]);

        const result = await harness.bot.tradeWith(partner, 600);
        const calls = harness.dispatched.map(d => d.call);
        expect(calls).toContain('sendDeclineTrade');
        expect(calls).toContain('sendTradeRequest');
        expect(result).toMatchObject({ success: false, reason: 'no_response' });
    });

    test('adopts an already-open session when the partner matches', async () => {
        const harness = createHarness([
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' } },
        ]);

        const result = await harness.bot.tradeWith(partner, 600);
        expect(result.success).toBe(true);
        expect(result.message).toContain('MuleBot');
        expect(harness.dispatched).toEqual([]);
    });
});

describe('bot.serveTrades', () => {
    test('serves an incoming gift and stops on the until condition', async () => {
        const coins = (n: number) => item(0, 995, 'Coins', n);
        const harness = createHarness([
            { },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', theirOffer: [coins(250)] } },
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', theirOffer: [coins(250)] } },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 995, name: 'Coins', count: 250 }] },
        ]);
        harness.sdk.waitForTradeRequest = async () => 'MuleBot';

        let served = false;
        const result = await harness.bot.serveTrades({
            from: /mule/i,
            onTrade: r => { served = r.success; },
            until: () => served,
            timeout: 5_000,
        });

        expect(result.success).toBe(true);
        expect(result.reason).toBe('until');
        expect(result.trades).toHaveLength(1);
        expect(result.trades[0]!.received).toEqual([{ slot: -1, id: 995, name: 'Coins', count: 250, amount: 250 }]);
        expect(harness.dispatched.map(d => d.call)).toEqual([
            'sendTradeRequest',  // requesting back = accepting
            'sendAcceptTrade',
            'sendAcceptTrade',
        ]);
    });

    test('ignores requesters that fail the from filter', async () => {
        const harness = createHarness([{ }]);
        let calls = 0;
        harness.sdk.waitForTradeRequest = async () => {
            calls++;
            return calls === 1 ? 'Stranger' : null;
        };

        const result = await harness.bot.serveTrades({ from: /^fleet_/i, timeout: 300 });
        expect(result.trades).toHaveLength(0);
        expect(harness.dispatched).toEqual([]);
    });

    test('a declined session does not consume maxTrades', async () => {
        const coins = (n: number) => item(0, 995, 'Coins', n);
        const harness = createHarness([
            { },
            // Session 1: a lowballer offers nothing and then declines.
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' } },
            { message: 'Other player declined trade.' },
            { },
            { },
            // Session 2: a real buyer's session (already open when the loop looks).
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', theirOffer: [coins(250)] } },
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', theirOffer: [coins(250)] } },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 995, name: 'Coins', count: 250 }] },
        ]);
        harness.sdk.waitForTradeRequest = async () => 'MuleBot';

        const result = await harness.bot.serveTrades({
            from: /mule/i,
            want: [{ item: 'coins', amount: 100 }],
            maxTrades: 1,
            timeout: 5_000,
        });

        // The declined session is recorded but only the completed one counts.
        expect(result.reason).toBe('max_trades');
        expect(result.trades).toHaveLength(2);
        expect(result.trades[0]!.success).toBe(false);
        expect(result.trades[1]!.success).toBe(true);
        expect(result.trades[1]!.received).toEqual([{ slot: -1, id: 995, name: 'Coins', count: 250, amount: 250 }]);
    });

    test('rejectAfterMs declines an offer that stays unacceptable', async () => {
        const harness = createHarness([
            { },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' } },
            { }, // decline lands here
        ], { hold: [1] });
        harness.sdk.waitForTradeRequest = async () => 'MuleBot';

        const result = await harness.bot.serveTrades({
            from: /mule/i,
            want: [{ item: 'coins', amount: 100 }],
            rejectAfterMs: 50,
            timeout: 3_000,
            until: () => harness.dispatched.some(d => d.call === 'sendDeclineTrade'),
        });

        expect(harness.dispatched.map(d => d.call)).toContain('sendDeclineTrade');
        expect(result.trades[0]!.success).toBe(false);
        expect(result.trades[0]!.reason).toBe('want_not_met');
    });
});

describe('bot.trade completion detection', () => {
    const logsInv = [{ slot: 0, id: 1511, name: 'Logs', count: 1 }];

    test('infers completion from the inventory when "Accepted trade." was never seen', async () => {
        const harness = createHarness([
            { inventory: logsInv },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' }, inventory: logsInv },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', myOffer: [logs(1)] }, inventory: [] },
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', myOffer: [logs(1)] }, inventory: [] },
            // Closed, no message (scrolled out of the client window), logs still gone.
            { inventory: [] },
            { inventory: [] },
            { inventory: [] },
        ]);

        const result = await harness.bot.trade(partner, { give: [{ item: 'logs', amount: -1 }], timeout: 3_000 });

        expect(result.success).toBe(true);
        expect(result.gave).toEqual([{ slot: -1, id: 1511, name: 'Logs', count: 1, amount: 1 }]);
        expect(result.message).toContain('inferred from inventory');
    });

    test('a decline whose item return lands a tick late is still a decline', async () => {
        const harness = createHarness([
            { inventory: logsInv },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' }, inventory: logsInv },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', myOffer: [logs(1)] }, inventory: [] },
            // Closed with no message; inventory update lags one tick.
            { inventory: [] },
            { inventory: [] },
            { inventory: logsInv },
            { inventory: logsInv },
        ]);

        const result = await harness.bot.trade(partner, { give: [{ item: 'logs', amount: -1 }], timeout: 3_000 });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('declined');
        expect(result.gave).toEqual([]);
    });

    test('a timeout whose decline races the partner accept reports the completed trade', async () => {
        const coins = (n: number) => item(0, 995, 'Coins', n);
        const harness = createHarness([
            { inventory: logsInv },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', theirOffer: [coins(50)] }, inventory: logsInv },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', myOffer: [logs(1)], theirOffer: [coins(50)] }, inventory: [] },
            // Confirm screen: we accept, partner never does (held) -> deadline expires.
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', myOffer: [logs(1)], theirOffer: [coins(50)], myAccepted: true }, inventory: [] },
            // The decline arrives after the partner's accept: trade completed.
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 995, name: 'Coins', count: 50 }] },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 995, name: 'Coins', count: 50 }] },
        ], { hold: [3] });

        const result = await harness.bot.trade(partner, {
            give: [{ item: 'logs', amount: -1 }],
            want: [{ item: 'coins', amount: 50 }],
            timeout: 300,
        });

        expect(harness.dispatched.map(d => d.call)).toContain('sendDeclineTrade');
        expect(result.success).toBe(true);
        expect(result.received).toEqual([{ slot: -1, id: 995, name: 'Coins', count: 50, amount: 50 }]);
        expect(result.gave).toEqual([{ slot: -1, id: 1511, name: 'Logs', count: 1, amount: 1 }]);
        expect(result.message).toContain('completed as the decline landed');
    });

    test('flags items from the final offer that never reached the inventory', async () => {
        const coins = (n: number) => item(0, 995, 'Coins', n);
        const lobster = item(1, 379, 'Lobster', 1);
        const harness = createHarness([
            { },
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot', theirOffer: [coins(250), lobster] } },
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', theirOffer: [coins(250), lobster] } },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 995, name: 'Coins', count: 250 }] },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 995, name: 'Coins', count: 250 }] },
        ]);

        const result = await harness.bot.trade(partner, { timeout: 3_000 });

        expect(result.success).toBe(true);
        expect(result.possiblyDropped).toEqual([{ slot: -1, id: 379, name: 'Lobster', count: 1, amount: 1 }]);
        expect(result.message).toContain('check the ground');
    });
});

describe('bot.acceptTrade', () => {
    test('reports a decline as failure, not "Trade screen closed"', async () => {
        const harness = createHarness([
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' } },
            { message: 'Other player declined trade.' },
            { message: 'Other player declined trade.' },
            { message: 'Other player declined trade.' },
        ]);

        const result = await harness.bot.acceptTrade(2_000);
        expect(result.success).toBe(false);
        expect(result.reason).toBe('declined');
    });

    test('reports the delta when the confirm accept completes the trade', async () => {
        const sword = item(0, 1285, 'Mithril sword', 1);
        const harness = createHarness([
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot', myOffer: [item(0, 995, 'Coins', 229)], theirOffer: [sword] }, inventory: [] },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 1285, name: 'Mithril sword', count: 1 }] },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 1285, name: 'Mithril sword', count: 1 }] },
            { message: 'Accepted trade.', inventory: [{ slot: 0, id: 1285, name: 'Mithril sword', count: 1 }] },
        ]);

        const result = await harness.bot.acceptTrade(2_000);
        expect(result.success).toBe(true);
        expect(result.message).toContain('Trade completed');
        expect(result.data.received).toEqual([{ slot: -1, id: 1285, name: 'Mithril sword', count: 1, amount: 1 }]);
    });

    test('treats the offer->confirm blip as progress, not a close', async () => {
        const harness = createHarness([
            { trade: { isOpen: true, screen: 'offer', partner: 'MuleBot' } },
            { }, // side modal closed, confirm not yet open
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot' } },
            { trade: { isOpen: true, screen: 'confirm', partner: 'MuleBot' } },
        ]);

        const result = await harness.bot.acceptTrade(2_000);
        expect(result).toMatchObject({ success: true, message: 'Advanced to confirm screen' });
    });
});
