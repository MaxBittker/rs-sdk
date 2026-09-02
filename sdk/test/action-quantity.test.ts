import { describe, expect, test } from 'bun:test';
import {
    classifyQuantity,
    countItems,
    exactNamePattern,
    nextShopStep,
    resolveInterfaceOption,
    resolveSkillDialogProduct,
    shortestNameMatch,
    skillDialogProductLabels,
    validateActionQuantity,
    MAX_ACTION_QUANTITY,
    MAX_BANK_ACTION_QUANTITY,
    MAX_SHOP_ACTION_QUANTITY,
} from '../action-quantity';
import type { DialogOption, InterfaceOption, InventoryItem } from '../types';

function option(index: number, text: string, componentId: number): InterfaceOption {
    return { index, text, componentId };
}

function item(slot: number, id: number, name: string, count: number): InventoryItem {
    return { slot, id, name, count, optionsWithIndex: [] };
}

// Interface options are published with a 1-based `index` label but consumed by
// sendClickInterfaceOption as a 0-based array position. These cover the gap.
describe('resolveInterfaceOption', () => {
    const options = [
        option(1, 'Leather body', 2311_04),
        option(2, 'Leather gloves', 2311_05),
        option(3, 'Leather chaps', 2311_06),
    ];

    test('matches by text without going through the 1-based index label', () => {
        const resolved = resolveInterfaceOption(options, 'gloves');
        expect(resolved?.componentId).toBe(2311_05);
        // The bug this replaces: options[resolved.index] is the *next* product.
        expect(options[resolved!.index]?.text).toBe('Leather chaps');
    });

    test('matches the first option, which index-as-position skips entirely', () => {
        const resolved = resolveInterfaceOption(options, /body/i);
        expect(resolved?.componentId).toBe(2311_04);
        expect(resolved?.index).toBe(1);
    });

    test('matches a passed-through option object by componentId', () => {
        expect(resolveInterfaceOption(options, options[2]!)?.text).toBe('Leather chaps');
    });

    test('returns null rather than a neighbouring option when nothing matches', () => {
        expect(resolveInterfaceOption(options, 'dragonhide')).toBeNull();
        expect(resolveInterfaceOption([], 'gloves')).toBeNull();
    });

    test('is not confused by a stateful regex reused across calls', () => {
        const sticky = /leather/gi;
        expect(resolveInterfaceOption(options, sticky)?.text).toBe('Leather body');
        expect(resolveInterfaceOption(options, sticky)?.text).toBe('Leather body');
    });
});

// skill_multi3 as the fletching dialog actually publishes it: four buttons per
// product, and only the make-1 button carries the product's name. The labels
// arrive whitespace-normalised (the raw text is "\n\n\n\n15 Arrow Shafts").
const FLETCH_REGULAR_LOGS: DialogOption[] = [
    { index: 1, text: 'Make X' },
    { index: 2, text: 'Make 10' },
    { index: 3, text: 'Make 5' },
    { index: 4, text: '15 Arrow Shafts' },
    { index: 5, text: 'Make X' },
    { index: 6, text: 'Make 10' },
    { index: 7, text: 'Make 5' },
    { index: 8, text: 'Short Bow' },
    { index: 9, text: 'Make X' },
    { index: 10, text: 'Make 10' },
    { index: 11, text: 'Make 5' },
    { index: 12, text: 'Long Bow' },
];

// skill_multi2, used for oak and above: no arrow shafts, and the labels are
// prefixed with the log tier.
const FLETCH_OAK_LOGS: DialogOption[] = [
    { index: 1, text: 'Make X' },
    { index: 2, text: 'Make 10' },
    { index: 3, text: 'Make 5' },
    { index: 4, text: 'Oak Short Bow' },
    { index: 5, text: 'Make X' },
    { index: 6, text: 'Make 10' },
    { index: 7, text: 'Make 5' },
    { index: 8, text: 'Oak Long Bow' },
];

describe('resolveSkillDialogProduct', () => {
    test('picks the product button, not the option at the product\'s ordinal', () => {
        // Arrow shafts are the first product but the *fourth* button; clicking
        // option 1 opens the Make X count prompt and the script hangs.
        expect(resolveSkillDialogProduct(FLETCH_REGULAR_LOGS, 'arrow shaft')?.index).toBe(4);
        expect(resolveSkillDialogProduct(FLETCH_REGULAR_LOGS, 'short')?.index).toBe(8);
        expect(resolveSkillDialogProduct(FLETCH_REGULAR_LOGS, 'long')?.index).toBe(12);
    });

    test('matches run-together product names against spaced labels', () => {
        expect(resolveSkillDialogProduct(FLETCH_REGULAR_LOGS, 'shortbow')?.index).toBe(8);
        expect(resolveSkillDialogProduct(FLETCH_OAK_LOGS, 'longbow')?.index).toBe(8);
    });

    test('matches every word in any order', () => {
        expect(resolveSkillDialogProduct(FLETCH_OAK_LOGS, 'oak short')?.text).toBe('Oak Short Bow');
        expect(resolveSkillDialogProduct(FLETCH_OAK_LOGS, 'oak long')?.text).toBe('Oak Long Bow');
    });

    test('defaults to the first product rather than the first button', () => {
        expect(resolveSkillDialogProduct(FLETCH_REGULAR_LOGS)?.index).toBe(4);
        expect(resolveSkillDialogProduct(FLETCH_OAK_LOGS)?.index).toBe(4);
    });

    test('returns null instead of fletching the wrong product', () => {
        // 'stock' only exists on crossbow dialogs; silently making a longbow
        // here is worse than reporting no match.
        expect(resolveSkillDialogProduct(FLETCH_REGULAR_LOGS, 'stock')).toBeNull();
        expect(resolveSkillDialogProduct([], 'arrow shaft')).toBeNull();
    });

    test('lists the products it can offer, for the no-match message', () => {
        expect(skillDialogProductLabels(FLETCH_REGULAR_LOGS)).toEqual([
            '15 Arrow Shafts',
            'Short Bow',
            'Long Bow',
        ]);
    });

    test('never mistakes a level-up chatbox for a product menu', () => {
        // A level-up dialog mid-fletch used to surface as
        // 'No fletching product matched "arrow shaft". Available: "Click here to continue"'.
        const levelUp: DialogOption[] = [{ index: 0, text: 'Click here to continue' }];
        expect(resolveSkillDialogProduct(levelUp)).toBeNull();
        expect(resolveSkillDialogProduct(levelUp, 'arrow shaft')).toBeNull();
        expect(skillDialogProductLabels(levelUp)).toEqual([]);
    });
});

describe('shortestNameMatch', () => {
    const locs = [
        { name: 'Hopper controls' },
        { name: 'Hopper' },
        { name: 'Hopper controls' },
    ];

    test('prefers the shortest matching name over a nearer, longer one', () => {
        expect(shortestNameMatch(locs, /hopper/i)).toBe(locs[1]!);
        expect(shortestNameMatch(locs, 'hopper')).toBe(locs[1]!);
    });

    test('keeps list order (nearest first) among equal-length names', () => {
        expect(shortestNameMatch(locs, /controls/i)).toBe(locs[0]!);
    });

    test('still honors anchors and reports no match', () => {
        expect(shortestNameMatch(locs, /^hopper$/i)?.name).toBe('Hopper');
        expect(shortestNameMatch(locs, /furnace/i)).toBeNull();
    });

    test('a literal name with regex metacharacters still matches as a string', () => {
        const items = [{ name: 'Serum 207 (1)' }, { name: 'Cake (1/3)' }, { name: 'Serum 207 (4)' }];
        expect(shortestNameMatch(items, 'Serum 207 (1)')).toBe(items[0]!);
        expect(shortestNameMatch(items, 'cake (1/3)')).toBe(items[1]!);
        // A string that is a working regex keeps regex semantics.
        expect(shortestNameMatch(items, '^cake')).toBe(items[1]!);
        expect(shortestNameMatch(items, 'Serum 207 (9)')).toBeNull();
    });
});

describe('exactNamePattern', () => {
    test('matches the whole name only, with regex syntax escaped', () => {
        const pattern = exactNamePattern('Hopper');
        expect(pattern.test('Hopper')).toBe(true);
        expect(pattern.test('hopper')).toBe(true);
        expect(pattern.test('Hopper controls')).toBe(false);
        expect(exactNamePattern('Rock (pile)').test('Rock (pile)')).toBe(true);
    });
});

describe('validateActionQuantity', () => {
    test('accepts ordinary positive quantities', () => {
        expect(validateActionQuantity(1)).toEqual({ valid: true, amount: 1 });
        expect(validateActionQuantity(28)).toEqual({ valid: true, amount: 28 });
    });

    test('rejects quantities that would expand into an unbounded packet loop', () => {
        expect(validateActionQuantity(1e9).valid).toBe(false);
        expect(validateActionQuantity(MAX_ACTION_QUANTITY + 1).valid).toBe(false);
        expect(validateActionQuantity(MAX_ACTION_QUANTITY).valid).toBe(true);
        expect(validateActionQuantity(2000, { max: MAX_SHOP_ACTION_QUANTITY }).valid).toBe(false);
    });

    test('rejects non-integers, zero, negatives, and non-finite input', () => {
        for (const bad of [0, -5, 2.5, NaN, Infinity, -Infinity]) {
            expect(validateActionQuantity(bad).valid).toBe(false);
        }
    });

    test('accepts the -1 "all" sentinel only when the caller opts in', () => {
        expect(validateActionQuantity(-1, { allowAll: true })).toEqual({ valid: true, amount: -1 });
        expect(validateActionQuantity(-1).valid).toBe(false);
    });

    // Bank withdraw/deposit send ONE count-dialog packet whatever the amount,
    // so the 10k anti-packet-loop cap must not apply: capping there silently
    // no-opped 20k-coin withdrawals from large stacks.
    test('bank quantities above 10k are valid up to the wire limit', () => {
        expect(validateActionQuantity(20_000, { allowAll: true, max: MAX_BANK_ACTION_QUANTITY }))
            .toEqual({ valid: true, amount: 20_000 });
        expect(validateActionQuantity(120_000_000, { allowAll: true, max: MAX_BANK_ACTION_QUANTITY }).valid)
            .toBe(true);
        // 2^31-1 is the client's "All" button encoding, not a countable amount.
        expect(validateActionQuantity(MAX_BANK_ACTION_QUANTITY + 1, { allowAll: true, max: MAX_BANK_ACTION_QUANTITY }).valid)
            .toBe(false);
    });
});

describe('nextShopStep', () => {
    test('picks the largest shop step that fits', () => {
        expect(nextShopStep(1)).toBe(1);
        expect(nextShopStep(4)).toBe(1);
        expect(nextShopStep(5)).toBe(5);
        expect(nextShopStep(9)).toBe(5);
        expect(nextShopStep(10)).toBe(10);
        expect(nextShopStep(37)).toBe(10);
    });

    test('drains any quantity in a bounded number of steps', () => {
        let remaining = MAX_SHOP_ACTION_QUANTITY;
        let steps = 0;
        while (remaining > 0) {
            remaining -= nextShopStep(remaining);
            steps++;
        }
        expect(remaining).toBe(0);
        expect(steps).toBeLessThanOrEqual(120);
    });
});

describe('classifyQuantity', () => {
    test('treats a short fill as unsuccessful, not as success', () => {
        const outcome = classifyQuantity(28, 12);
        expect(outcome.complete).toBe(false);
        expect(outcome.partial).toBe(true);
        expect(outcome.actual).toBe(12);
    });

    test('an exact fill is complete and not partial', () => {
        expect(classifyQuantity(28, 28)).toMatchObject({ complete: true, partial: false });
    });

    test('a zero fill is neither complete nor partial', () => {
        expect(classifyQuantity(5, 0)).toMatchObject({ complete: false, partial: false });
    });

    test('clamps nonsense observations instead of reporting negative amounts', () => {
        expect(classifyQuantity(5, -3)).toMatchObject({ actual: 0, complete: false, partial: false });
        expect(classifyQuantity(0, 0).complete).toBe(true);
    });
});

describe('countItems', () => {
    const inventory = [
        item(0, 1511, 'Logs', 1),
        item(1, 1511, 'Logs', 1),
        item(2, 995, 'Coins', 500),
        item(3, 1521, 'Oak logs', 1),
    ];

    test('sums a non-stackable item across every occupied slot', () => {
        expect(countItems(inventory, 1511)).toBe(2);
    });

    test('sums stack sizes by id', () => {
        expect(countItems(inventory, 995)).toBe(500);
    });

    test('matches by name pattern, anchored regexes included', () => {
        expect(countItems(inventory, /logs/i)).toBe(3);
        expect(countItems(inventory, /^logs$/i)).toBe(2);
        expect(countItems(inventory, 'coins')).toBe(500);
    });

    test('returns 0 for an absent item', () => {
        expect(countItems(inventory, 4151)).toBe(0);
        expect(countItems([], /logs/i)).toBe(0);
    });
});
