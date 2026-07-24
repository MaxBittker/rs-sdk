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
        const sdk = mount(initial);
        const calls: number[] = [];
        sdk.sendUseItemOnItem = async () => {
            (sdk as any).state = world({
                ...initial,
                interface: { isOpen: true, interfaceId: 1000, options },
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
            result.success && result.product?.name === 'Longbow (u)' && calls[0] === 303,
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
        const sdk = mount(initial);
        const calls: number[] = [];
        sdk.sendUseItemOnItem = async () => {
            (sdk as any).state = world({
                ...initial,
                interface: {
                    isOpen: true,
                    interfaceId: 2311,
                    options: [
                        { index: 1, text: 'Leather body', componentId: 111 },
                        { index: 2, text: 'Leather gloves', componentId: 222 },
                        { index: 3, text: 'Leather chaps', componentId: 333 },
                    ],
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
            'craftLeather does not confuse option.index 2 with array position 2',
            result.success && result.product?.name === 'Leather gloves' && calls[0] === 222,
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
        const coal = item(2000, 'Coal', 0, 4);
        const initial = world({
            inventory: [coal],
            interface: { isOpen: true, interfaceId: 12, options: [] },
            bank: { isOpen: true, items: [] },
        });
        const sdk = mount(initial);
        sdk.sendBankDeposit = async () => {
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
            allResult.success && allResult.requestedAmount === 4 && allResult.amountDeposited === 4,
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
        sdk.sendBankWithdraw = async () => {
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
            allResult.success && allResult.requestedAmount === 4 && allResult.amountWithdrawn === 4,
            allResult,
        );
    }

    const partial = classifyQuantity(10, 4);
    check('partial quantities are explicitly incomplete', !partial.complete && partial.partial, partial);
    check(
        'fletching positional fallbacks account for log tier',
        productPosition(resolveFletchProduct('long')!, false) === 2 &&
            productPosition(resolveFletchProduct('long')!, true) === 1,
    );
    check(
        'leather default and fallback are explicit',
        resolveLeatherProduct()?.name === 'leather gloves' &&
            productPosition(resolveLeatherProduct('body')!, false) === 0,
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
