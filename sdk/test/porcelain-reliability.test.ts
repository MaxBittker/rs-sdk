#!/usr/bin/env bun

import { BotActions } from '../actions';
import {
    captureInteractionBaseline,
    classifyQuantity,
    detectInteractionEvidence,
    resolveInterfaceOption,
} from '../action-reliability';
import { productPosition, resolveFletchProduct, resolveLeatherProduct } from '../crafting-products';
import { formatWorldState } from '../formatter';
import { BotSDK } from '../index';
import type {
    ActionResult,
    BankItem,
    BotWorldState,
    InventoryItem,
    NearbyLoc,
    NearbyNpc,
    ShopItem,
} from '../types';

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
    if (condition) {
        console.log(`  ok  ${label}`);
        return;
    }
    failures++;
    console.log(`  FAIL  ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

function item(id: number, name: string, slot: number, count = 1): InventoryItem {
    return { id, name, slot, count, optionsWithIndex: [] };
}

function loc(name = 'Tree'): NearbyLoc {
    return {
        id: 100,
        name,
        x: 3200,
        z: 3200,
        distance: 1,
        options: ['Chop down'],
        optionsWithIndex: [{ text: 'Chop down', opIndex: 1 }],
    };
}

function npc(name = 'Shop keeper'): NearbyNpc {
    return {
        index: 7,
        name,
        combatLevel: 0,
        x: 3200,
        z: 3200,
        distance: 1,
        hp: 0,
        maxHp: 0,
        healthPercent: null,
        targetIndex: -1,
        inCombat: false,
        combatCycle: 0,
        animId: -1,
        spotanimId: -1,
        options: ['Talk-to', 'Trade'],
        optionsWithIndex: [
            { text: 'Talk-to', opIndex: 1 },
            { text: 'Trade', opIndex: 2 },
        ],
    };
}

function shopItem(count: number): ShopItem {
    return {
        slot: 0,
        id: 1000,
        name: 'Bucket',
        count,
        baseCost: 2,
        buyPrice: 2,
        sellPrice: 1,
    };
}

function bankItem(count: number): BankItem {
    return { slot: 3, id: 2000, name: 'Coal', count };
}

function world(overrides: Partial<BotWorldState> = {}): BotWorldState {
    return {
        tick: 1,
        inGame: true,
        player: {
            x: 3200,
            z: 3200,
            worldX: 3200,
            worldZ: 3200,
            level: 0,
            animId: -1,
            name: 'test',
            combatLevel: 3,
            combat: { inCombat: false, targetIndex: -1 },
        } as BotWorldState['player'],
        skills: [],
        inventory: [],
        equipment: [],
        nearbyNpcs: [],
        nearbyPlayers: [],
        nearbyLocs: [],
        groundItems: [],
        gameMessages: [],
        recentDialogs: [],
        dialog: { isOpen: false, isWaiting: false, options: [] },
        interface: { isOpen: false, interfaceId: -1, options: [] },
        shop: { isOpen: false, title: '', shopItems: [], playerItems: [] },
        bank: { isOpen: false, items: [] },
        modalOpen: false,
        modalInterface: -1,
        combatEvents: [],
        prayers: undefined as unknown as BotWorldState['prayers'],
        ...overrides,
    };
}

function mount(state: BotWorldState): BotSDK {
    const sdk = new BotSDK({ botUsername: 'test' });
    (sdk as unknown as { state: BotWorldState }).state = state;
    return sdk;
}

async function run(): Promise<void> {
    console.log('Porcelain reliability:');

    const options = [
        { index: 1, text: 'Arrow shafts', componentId: 101 },
        { index: 2, text: 'Shortbow', componentId: 202 },
        { index: 3, text: 'Longbow', componentId: 303 },
    ];
    check(
        'option resolver returns component identity, not ordinal-as-position',
        resolveInterfaceOption(options, /long/i)?.componentId === 303,
    );

    {
        const sdk = mount(world({ interface: { isOpen: true, interfaceId: 1, options } }));
        const calls: number[] = [];
        sdk.sendClickComponent = async componentId => {
            calls.push(componentId);
            return { success: true, message: 'clicked' };
        };
        const result = await sdk.clickInterfaceOption(options[2]!);
        check('clickInterfaceOption dispatches the resolved component', result.success && calls[0] === 303, calls);
    }

    {
        const initial = world({
            skills: [{ name: 'Fletching', level: 10, baseLevel: 10, experience: 100 }],
            inventory: [item(1, 'Knife', 0), item(2, 'Logs', 1)],
        });
        const fletchOptions = [
            { index: 1, text: 'Make-10 Arrow shafts', componentId: 110 },
            { index: 2, text: 'Make-5 Arrow shafts', componentId: 105 },
            { index: 3, text: 'Make-1 Arrow shafts', componentId: 101 },
            { index: 4, text: 'Make-10 Shortbow', componentId: 210 },
            { index: 5, text: 'Make-5 Shortbow', componentId: 205 },
            { index: 6, text: 'Make-1 Shortbow', componentId: 201 },
            { index: 7, text: 'Make-10 Longbow', componentId: 310 },
            { index: 8, text: 'Make-5 Longbow', componentId: 305 },
            { index: 9, text: 'Make-1 Longbow', componentId: 301 },
        ];
        const sdk = mount(initial);
        const calls: number[] = [];
        sdk.sendUseItemOnItem = async () => {
            (sdk as any).state = world({
                ...initial,
                interface: { isOpen: true, interfaceId: 1000, options: fletchOptions },
            });
            return { success: true, message: 'opened' };
        };
        sdk.sendClickComponent = async componentId => {
            calls.push(componentId);
            (sdk as any).state = world({
                ...initial,
                skills: [{ name: 'Fletching', level: 10, baseLevel: 10, experience: 110 }],
                inventory: [item(1, 'Knife', 0), item(10, 'Longbow (u)', 1)],
            });
            return { success: true, message: 'clicked' };
        };
        sdk.waitForCondition = async (predicate: (state: BotWorldState) => boolean) => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('predicate not met');
            return current;
        };
        const result = await new BotActions(sdk).fletchLogs('longbow');
        check(
            'fletchLogs selects and verifies the requested product',
            result.success && result.product?.name === 'Longbow (u)' &&
                result.xpGained === 10 && calls[0] === 301,
            result,
        );
    }

    {
        const sdk = mount(world({
            skills: [{ name: 'Fletching', level: 10, baseLevel: 10, experience: 100 }],
            inventory: [item(1, 'Knife', 0), item(2, 'Logs', 1)],
        }));
        let dispatched = false;
        sdk.sendUseItemOnItem = async () => {
            dispatched = true;
            return { success: true, message: 'unexpected' };
        };
        const result = await new BotActions(sdk).fletchLogs('crossbow stock');
        check(
            'unsupported crossbow stock fails cleanly before dispatch',
            !result.success && result.reason === 'no_matching_option' && !dispatched,
            result,
        );
    }

    {
        const initial = world({
            skills: [{ name: 'Crafting', level: 10, baseLevel: 10, experience: 100 }],
            inventory: [
                item(20, 'Needle', 0),
                item(21, 'Thread', 1),
                item(22, 'Leather', 2),
            ],
        });
        const leatherOptions = [
            { index: 1, text: 'Make @lre@Leather body', componentId: 111 },
            { index: 2, text: 'Make 10 pairs of @lre@Leather gloves', componentId: 210 },
            { index: 3, text: 'Make 5 pairs of @lre@Leather gloves', componentId: 205 },
            { index: 4, text: 'Make pair of @lre@Leather gloves', componentId: 222 },
            { index: 5, text: 'Make pair of @lre@Leather boots', componentId: 333 },
            { index: 6, text: 'Make @lre@Leather vambraces', componentId: 444 },
            { index: 7, text: 'Make @lre@Leather chaps', componentId: 555 },
            { index: 8, text: 'Make @lre@Leather coif', componentId: 666 },
            { index: 9, text: 'Make @lre@Leather cowl', componentId: 777 },
        ];
        const sdk = mount(initial);
        const calls: number[] = [];
        sdk.sendUseItemOnItem = async () => {
            (sdk as any).state = world({
                ...initial,
                interface: {
                    isOpen: true,
                    interfaceId: 2311,
                    options: leatherOptions,
                },
            });
            return { success: true, message: 'opened' };
        };
        sdk.sendClickComponent = async componentId => {
            calls.push(componentId);
            (sdk as any).state = world({
                ...initial,
                skills: [{ name: 'Crafting', level: 10, baseLevel: 10, experience: 114 }],
                inventory: [
                    item(20, 'Needle', 0),
                    item(21, 'Thread', 1),
                    item(23, 'Leather gloves', 2),
                ],
            });
            return { success: true, message: 'clicked' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('predicate not met');
            return current;
        };
        const result = await new BotActions(sdk).craftLeather('gloves');
        check(
            'craftLeather treats exact color-coded real Make option as one item',
            result.success && result.product?.name === 'Leather gloves' &&
                result.itemsCrafted === 1 && calls[0] === 222,
            result,
        );
    }

    {
        const tree = loc();
        const sdk = mount(world({ nearbyLocs: [tree] }));
        sdk.sendInteractLoc = async (): Promise<ActionResult> => ({ success: true, message: 'sent' });
        sdk.waitForCondition = async (predicate: (state: BotWorldState) => boolean) => {
            const depleted = world({ tick: 20, nearbyLocs: [] });
            if (!predicate(depleted)) throw new Error('deadline');
            return depleted;
        };
        const result = await new BotActions(sdk).chopTree(tree);
        check(
            'a depleted tree is not attributed to this bot without gained logs',
            !result.success && result.reason === 'timeout',
            result,
        );
    }

    {
        const oldMessage = {
            type: 0,
            text: 'old',
            sender: '',
            tick: 5,
            fromSelf: false,
            observationId: 1,
        };
        const initial = world({
            tick: 5,
            skills: [{ name: 'Firemaking', level: 1, baseLevel: 1, experience: 0 }],
            inventory: [item(30, 'Tinderbox', 0), item(31, 'Logs', 1)],
            gameMessages: [oldMessage],
        });
        const sdk = mount(initial);
        sdk.sendUseItemOnItem = async () => ({ success: true, message: 'sent' });
        sdk.waitForCondition = async predicate => {
            const failed = world({
                ...initial,
                gameMessages: [
                    oldMessage,
                    {
                        type: 0,
                        text: "You can't light a fire here.",
                        sender: '',
                        tick: 5,
                        fromSelf: false,
                        observationId: 2,
                    },
                ],
            });
            if (!predicate(failed)) throw new Error('same-tick message not observed');
            return failed;
        };
        const result = await new BotActions(sdk).burnLogs();
        check(
            'burnLogs sees same-tick failures through optional observationId',
            !result.success && result.reason === 'bad_location',
            result,
        );
    }

    {
        const initial = world({
            skills: [{ name: 'Mining', level: 1, baseLevel: 1, experience: 0 }],
        });
        const baseline = captureInteractionBaseline(initial);
        const idle = detectInteractionEvidence(world({ ...initial, tick: 100 }), baseline);
        const xp = detectInteractionEvidence(world({
            ...initial,
            tick: 100,
            skills: [{ name: 'Mining', level: 1, baseLevel: 1, experience: 5 }],
        }), baseline);
        check('idle ticks are not interaction evidence', idle === null, idle);
        check('XP is interaction evidence', xp === 'xp', xp);
    }

    {
        const rock = loc('Copper rock');
        const initial = world({
            nearbyLocs: [rock],
            skills: [{ name: 'Mining', level: 1, baseLevel: 1, experience: 0 }],
        });
        const sdk = mount(initial);
        let deadline = 0;
        sdk.sendInteractLoc = async () => ({ success: true, message: 'sent' });
        sdk.waitForCondition = async (predicate, timeout) => {
            deadline = timeout ?? 0;
            const idle = world({ ...initial, tick: 100 });
            check('interactLoc does not complete on idle ticks', !predicate(idle));
            const completed = world({
                ...initial,
                tick: 101,
                skills: [{ name: 'Mining', level: 1, baseLevel: 1, experience: 5 }],
            });
            if (!predicate(completed)) throw new Error('XP evidence not accepted');
            return completed;
        };
        const result = await new BotActions(sdk).interactLoc(rock, 1, { timeout: 4321 });
        check(
            'interactLoc waits for effect evidence with caller deadline',
            result.success && result.evidence === 'xp' && deadline === 4321,
            result,
        );
    }

    {
        const target = npc('Man');
        const initial = world({ nearbyNpcs: [target] });
        const sdk = mount(initial);
        sdk.sendInteractNpc = async () => ({ success: true, message: 'sent' });
        sdk.waitForCondition = async (predicate, timeout) => {
            const idle = world({ ...initial, tick: 100 });
            check('interactNpc does not complete on idle ticks', !predicate(idle));
            const completed = world({ ...initial, tick: 101, inventory: [item(10, 'Coins', 0, 3)] });
            if (!predicate(completed) || timeout !== 5000) throw new Error('inventory evidence not accepted');
            return completed;
        };
        const result = await new BotActions(sdk).interactNpc(target, 1);
        check('interactNpc uses default real deadline and inventory evidence', result.success && result.evidence === 'inventory', result);
    }

    {
        const target = npc('Guide');
        const initial = world({ nearbyNpcs: [target] });
        const sdk = mount(initial);
        sdk.sendTalkToNpc = async () => ({ success: true, message: 'sent' });
        sdk.waitForCondition = async (predicate, timeout) => {
            const idle = world({ ...initial, tick: 100 });
            check('talkTo does not fail on idle ticks', !predicate(idle));
            const completed = world({
                ...initial,
                tick: 101,
                dialog: { isOpen: true, isWaiting: false, options: [] },
            });
            if (!predicate(completed) || timeout !== 6789) throw new Error('dialog evidence not accepted');
            return completed;
        };
        const result = await new BotActions(sdk).talkTo(target, { timeout: 6789 });
        check('talkTo waits for dialog until caller deadline', result.success && result.dialog?.isOpen === true, result);
    }

    console.log('');
    console.log('Quantity action methods:');

    {
        const product = shopItem(50);
        const sdk = mount(world({
            shop: { isOpen: true, title: 'General store', shopItems: [product], playerItems: [product] },
        }));
        let buyDispatches = 0;
        let sellDispatches = 0;
        sdk.sendShopBuy = async () => {
            buyDispatches++;
            return { success: true, message: 'unexpected' };
        };
        sdk.sendShopSell = async () => {
            sellDispatches++;
            return { success: true, message: 'unexpected' };
        };
        const invalidAmounts = [Infinity, Number.MAX_SAFE_INTEGER];
        for (const invalid of invalidAmounts) {
            const buy = await new BotActions(sdk).buyFromShop(product, invalid);
            const sell = await new BotActions(sdk).sellToShop(product, invalid);
            check(
                `shop methods reject ${invalid} before dispatch`,
                !buy.success && buy.reason === 'invalid_amount' &&
                    !sell.success && sell.reason === 'invalid_amount',
                { buy, sell },
            );
        }
        check(
            'invalid and huge quantities dispatch no shop packets',
            buyDispatches === 0 && sellDispatches === 0,
            { buyDispatches, sellDispatches },
        );
    }

    {
        const product = shopItem(50);
        const initial = world({
            shop: { isOpen: true, title: 'General store', shopItems: [product], playerItems: [] },
        });
        const sdk = mount(initial);
        sdk.sendShopBuy = async () => {
            (sdk as any).state = world({
                ...initial,
                inventory: [item(product.id, product.name, 0, 4)],
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('buy delta not observed');
            return current;
        };
        const result = await new BotActions(sdk).buyFromShop(product, 10);
        check(
            'buyFromShop reports requested/actual and rejects partial fill',
            !result.success && result.partial === true &&
                result.requestedAmount === 10 && result.amountBought === 4 &&
                result.reason === 'partial_fill',
            result,
        );
    }

    {
        const product = shopItem(4);
        const initial = world({
            shop: { isOpen: true, title: 'General store', shopItems: [], playerItems: [product] },
        });
        const sdk = mount(initial);
        sdk.sendShopSell = async () => {
            (sdk as any).state = world({
                ...initial,
                shop: { ...initial.shop, playerItems: [] },
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('sell delta not observed');
            return current;
        };
        const result = await new BotActions(sdk).sellToShop(product, 10);
        check(
            'sellToShop reports requested/actual and rejects partial fill',
            !result.success && result.partial === true &&
                result.requestedAmount === 10 && result.amountSold === 4 &&
                result.reason === 'partial_fill',
            result,
        );
    }

    {
        const product = shopItem(12);
        const initial = world({
            shop: { isOpen: true, title: 'General store', shopItems: [], playerItems: [product] },
        });
        const sdk = mount(initial);
        sdk.sendShopSell = async (_slot, amount) => {
            const current = sdk.getState()!;
            const remaining = Math.max(0, current.shop.playerItems[0]!.count - (amount ?? 1));
            (sdk as any).state = world({
                ...current,
                shop: {
                    ...current.shop,
                    playerItems: remaining > 0 ? [{ ...product, count: remaining }] : [],
                },
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('sell-all delta not observed');
            return current;
        };
        const result = await new BotActions(sdk).sellToShop(product, 'all');
        check(
            'sellToShop all defines requested amount from starting holdings',
            result.success && result.requestedAmount === 12 && result.amountSold === 12,
            result,
        );
    }

    {
        const product = shopItem(2_000);
        const initial = world({
            shop: { isOpen: true, title: 'General store', shopItems: [], playerItems: [product] },
        });
        const sdk = mount(initial);
        let packets = 0;
        sdk.sendShopSell = async (_slot, amount = 1) => {
            packets++;
            const current = sdk.getState()!;
            const remaining = current.shop.playerItems[0]!.count - amount;
            (sdk as any).state = world({
                ...current,
                shop: {
                    ...current.shop,
                    playerItems: remaining > 0 ? [{ ...product, count: remaining }] : [],
                },
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('bounded sell-all delta not observed');
            return current;
        };
        const result = await new BotActions(sdk).sellToShop(product, 'all');
        check(
            'sellToShop all stops at packet budget with truthful partial fill',
            !result.success && result.reason === 'partial_fill' &&
                result.requestedAmount === 2_000 && result.amountSold === 1_000 &&
                packets === 100,
            { result, packets },
        );
    }

    {
        const template = shopItem(1);
        const holdings = Array.from({ length: 12 }, (_, slot) => ({
            ...template,
            slot,
            count: 1,
        }));
        const initial = world({
            shop: { isOpen: true, title: 'General store', shopItems: [], playerItems: holdings },
        });
        const sdk = mount(initial);
        const dispatchedSlots: number[] = [];
        sdk.sendShopSell = async (slot, amount = 1) => {
            const current = sdk.getState()!;
            const anchor = current.shop.playerItems.find(item => item.slot === slot && item.id === template.id);
            if (!anchor) return { success: false, message: `stale slot ${slot}` };
            dispatchedSlots.push(slot);
            const remove = new Set(
                current.shop.playerItems
                    .filter(item => item.id === template.id)
                    .slice(0, amount)
                    .map(item => item.slot),
            );
            (sdk as any).state = world({
                ...current,
                shop: {
                    ...current.shop,
                    playerItems: current.shop.playerItems.filter(item => !remove.has(item.slot)),
                },
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('numeric sell delta not observed');
            return current;
        };
        const result = await new BotActions(sdk).sellToShop(holdings[0]!, 12);
        check(
            'numeric sell re-resolves a live slot after a non-stackable batch',
            result.success && result.amountSold === 12 &&
                dispatchedSlots.length === 3 &&
                dispatchedSlots[0] === 0 && dispatchedSlots[1] === 10 && dispatchedSlots[2] === 11,
            { result, dispatchedSlots },
        );
    }

    {
        const coal = item(2000, 'Coal', 0, 4);
        const stored = bankItem(4);
        const sdk = mount(world({
            inventory: [coal],
            interface: { isOpen: true, interfaceId: 12, options: [] },
            bank: { isOpen: true, items: [stored] },
        }));
        let deposits = 0;
        let withdrawals = 0;
        sdk.sendBankDeposit = async () => {
            deposits++;
            return { success: true, message: 'unexpected' };
        };
        sdk.sendBankWithdraw = async () => {
            withdrawals++;
            return { success: true, message: 'unexpected' };
        };
        for (const invalid of [0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
            const deposit = await new BotActions(sdk).depositItem(coal, invalid);
            const withdraw = await new BotActions(sdk).withdrawItem(stored, invalid);
            check(
                `bank methods reject invalid amount ${String(invalid)}`,
                !deposit.success && deposit.reason === 'invalid_amount' &&
                    !withdraw.success && withdraw.reason === 'invalid_amount',
                { deposit, withdraw },
            );
        }
        check(
            'invalid bank quantities dispatch no packets',
            deposits === 0 && withdrawals === 0,
            { deposits, withdrawals },
        );
    }

    {
        const coal = item(2000, 'Coal', 0, 4);
        const initial = world({
            inventory: [coal],
            interface: { isOpen: true, interfaceId: 12, options: [] },
            bank: { isOpen: true, items: [] },
        });
        const sdk = mount(initial);
        const dispatchedAmounts: number[] = [];
        sdk.sendBankDeposit = async (_slot, amount) => {
            dispatchedAmounts.push(amount ?? 1);
            (sdk as any).state = world({ ...initial, inventory: [] });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('deposit delta not observed');
            return current;
        };
        const partialResult = await new BotActions(sdk).depositItem(coal, 10);
        check(
            'depositItem rejects partial fill and reports requested/actual',
            !partialResult.success && partialResult.requestedAmount === 10 &&
                partialResult.amountDeposited === 4 && partialResult.reason === 'partial_fill',
            partialResult,
        );

        (sdk as any).state = initial;
        const allResult = await new BotActions(sdk).depositItem(coal, -1);
        check(
            'depositItem all uses starting inventory quantity as requested',
            allResult.success && allResult.requestedAmount === 4 &&
                allResult.amountDeposited === 4 && dispatchedAmounts[1] === -1,
            allResult,
        );
    }

    {
        const coal = bankItem(4);
        const initial = world({
            interface: { isOpen: true, interfaceId: 12, options: [] },
            bank: { isOpen: true, items: [coal] },
        });
        const sdk = mount(initial);
        const dispatchedAmounts: number[] = [];
        sdk.sendBankWithdraw = async (_slot, amount) => {
            dispatchedAmounts.push(amount ?? 1);
            (sdk as any).state = world({
                ...initial,
                inventory: [item(coal.id, coal.name, 0, 4)],
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('withdraw delta not observed');
            return current;
        };
        const partialResult = await new BotActions(sdk).withdrawItem(coal, 10);
        check(
            'withdrawItem rejects partial fill and reports requested/actual',
            !partialResult.success && partialResult.requestedAmount === 10 &&
                partialResult.amountWithdrawn === 4 && partialResult.reason === 'partial_fill',
            partialResult,
        );

        (sdk as any).state = initial;
        const allResult = await new BotActions(sdk).withdrawItem(coal, -1);
        check(
            'withdrawItem all uses bank quantity as requested',
            allResult.success && allResult.requestedAmount === 4 &&
                allResult.amountWithdrawn === 4 && dispatchedAmounts[1] === -1,
            allResult,
        );
    }

    {
        const staleCoal = item(2000, 'Coal', 0, 1);
        const liveCoal = item(2000, 'Coal', 1, 1);
        const initial = world({
            inventory: [item(9999, 'Feather', 0), liveCoal],
            interface: { isOpen: true, interfaceId: 12, options: [] },
            bank: { isOpen: true, items: [] },
        });
        const sdk = mount(initial);
        let dispatchedSlot = -1;
        sdk.sendBankDeposit = async slot => {
            dispatchedSlot = slot;
            (sdk as any).state = world({
                ...initial,
                inventory: [item(9999, 'Feather', 0)],
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('stale deposit delta not observed');
            return current;
        };
        const result = await new BotActions(sdk).depositItem(staleCoal, 1);
        check(
            'depositItem re-resolves stale object identity instead of mutating its occupied slot',
            result.success && dispatchedSlot === 1,
            { result, dispatchedSlot },
        );
    }

    {
        const staleCoal = bankItem(4);
        const liveCoal = { ...staleCoal, slot: 4 };
        const initial = world({
            interface: { isOpen: true, interfaceId: 12, options: [] },
            bank: {
                isOpen: true,
                items: [
                    { slot: 3, id: 9999, name: 'Feather', count: 1 },
                    liveCoal,
                ],
            },
        });
        const sdk = mount(initial);
        let dispatchedSlot = -1;
        sdk.sendBankWithdraw = async slot => {
            dispatchedSlot = slot;
            (sdk as any).state = world({
                ...initial,
                inventory: [item(liveCoal.id, liveCoal.name, 0, 1)],
                bank: { ...initial.bank, items: [{ ...liveCoal, count: 3 }] },
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('stale withdraw delta not observed');
            return current;
        };
        const result = await new BotActions(sdk).withdrawItem(staleCoal, 1);
        check(
            'withdrawItem re-resolves stale bank identity by id',
            result.success && dispatchedSlot === 4,
            { result, dispatchedSlot },
        );
    }

    {
        const coal = { ...bankItem(10), slot: 4 };
        const initial = world({
            interface: { isOpen: true, interfaceId: 12, options: [] },
            bank: { isOpen: true, items: [coal] },
        });
        const sdk = mount(initial);
        sdk.sendBankWithdraw = async () => {
            (sdk as any).state = world({
                ...initial,
                inventory: [item(2001, 'Coal (noted)', 0, 4)],
                bank: { isOpen: true, items: [{ ...coal, count: 6 }] },
            });
            return { success: true, message: 'sent' };
        };
        sdk.waitForCondition = async predicate => {
            const current = sdk.getState()!;
            if (!predicate(current)) throw new Error('noted bank decrease not observed');
            return current;
        };
        const result = await new BotActions(sdk).withdrawItem(coal, 4);
        check(
            'withdrawItem observes bank decrease and locates noted output',
            result.success && result.amountWithdrawn === 4 && result.item?.id === 2001,
            result,
        );
    }

    const partial = classifyQuantity(10, 4);
    check('partial quantities are explicitly incomplete', !partial.complete && partial.partial, partial);
    check(
        'fletching positional fallbacks account for log tier',
        productPosition(resolveFletchProduct('long')!, false) === 2 &&
            productPosition(resolveFletchProduct('long')!, true) === 1 &&
            resolveFletchProduct('crossbow stock') === null,
    );
    check(
        'leather default and fallback are explicit',
        resolveLeatherProduct()?.name === 'leather gloves' &&
            productPosition(resolveLeatherProduct('body')!, false) === 0 &&
            productPosition(resolveLeatherProduct('boots')!, false) === 2 &&
            productPosition(resolveLeatherProduct('vambraces')!, false) === 3 &&
            productPosition(resolveLeatherProduct('chaps')!, false) === 4 &&
            productPosition(resolveLeatherProduct('coif')!, false) === 5 &&
            productPosition(resolveLeatherProduct('cowl')!, false) === 6 &&
            resolveLeatherProduct('vambraces')?.name === 'leather vambraces',
    );

    let configDiagnostic = '';
    try {
        new BotSDK({ botName: 'oops' } as any);
    } catch (error) {
        configDiagnostic = String(error);
    }
    check(
        'botName config mistake explicitly suggests botUsername',
        /botUsername.*botName/.test(configDiagnostic),
        configDiagnostic,
    );

    {
        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = message => warnings.push(String(message));
        try {
            new BotSDK({ botUsername: 'test', surpriseOption: true } as any);
            check(
                'unknown config keys warn without breaking compatibility',
                warnings.some(message => /Unknown config option.*surpriseOption/.test(message)),
                warnings,
            );
            const sdk = mount(world({
                skills: [{ name: 'Hitpoints', level: 10, baseLevel: 10, experience: 1154 }],
            }));
            check('HP aliases Hitpoints', sdk.getSkill('HP')?.name === 'Hitpoints');
            check(
                'skill typo includes nearest-name diagnostic',
                sdk.getSkill('Hitponts') === null && warnings.some(message => /Did you mean "Hitpoints"/.test(message)),
                warnings,
            );
        } finally {
            console.warn = originalWarn;
        }
    }

    const formatted = formatWorldState(world({
        inventory: [
            item(1, 'Logs', 0),
            item(1, 'Logs', 1),
            item(2, 'Coins', 2, 500),
        ],
        equipment: [item(3, 'Bronze arrow', 0, 40)],
    }));
    check(
        'formatter distinguishes aggregate quantities, slots, and equipment counts',
        formatted.includes('Quantities aggregated by name') &&
            formatted.includes('Logs x2 across 2 slots') &&
            formatted.includes('Coins x500 across 1 slot') &&
            formatted.includes('Bronze arrow x40'),
    );

    console.log('');
    if (failures > 0) {
        console.log(`FAILED — ${failures} case(s)`);
        process.exit(1);
    }
    console.log('PASSED — all porcelain reliability cases');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
