import { describe, expect, test } from 'bun:test';
import {
    classifyQuantity,
    countItems,
    nextShopStep,
    resolveInterfaceOption,
    validateActionQuantity,
    MAX_ACTION_QUANTITY,
    MAX_SHOP_ACTION_QUANTITY,
} from '../action-quantity';
import type { InterfaceOption, InventoryItem } from '../types';

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
