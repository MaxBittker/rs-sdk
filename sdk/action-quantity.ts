import type { InterfaceOption, InventoryItem } from './types';

/**
 * Helpers for porcelain actions that take a quantity and expand it into
 * repeated game packets, plus the interface-option resolution those actions
 * need. Kept separate from actions.ts so the logic is unit-testable without a
 * live connection.
 */

export type InterfaceOptionSelector = InterfaceOption | string | RegExp;

function testPattern(pattern: string | RegExp, value: string): boolean {
    if (typeof pattern === 'string') {
        return value.toLowerCase().includes(pattern.toLowerCase());
    }
    // Reset in case the caller handed us a /g or /y regex, whose lastIndex
    // otherwise makes repeated .test() calls alternate between true and false.
    pattern.lastIndex = 0;
    return pattern.test(value);
}

/**
 * Resolve a published interface option by object identity or visible text.
 *
 * `InterfaceOption.index` is a human-facing 1-based label, but
 * `sendClickInterfaceOption` takes a 0-based array position. Callers that fed
 * one into the other clicked the option *after* the one they matched; use this
 * instead and dispatch the returned `componentId`.
 */
export function resolveInterfaceOption(
    options: readonly InterfaceOption[],
    selector: InterfaceOptionSelector,
): InterfaceOption | null {
    if (typeof selector === 'object' && !(selector instanceof RegExp)) {
        return options.find(option => option.componentId === selector.componentId) ?? null;
    }
    return options.find(option => testPattern(selector, option.text)) ?? null;
}

/** Total count of an item across every inventory slot holding it. */
export function countItems(
    items: readonly InventoryItem[],
    target: number | string | RegExp,
): number {
    return items.reduce((total, item) => {
        const matches = typeof target === 'number'
            ? item.id === target
            : testPattern(target, item.name);
        return matches ? total + item.count : total;
    }, 0);
}

/** Upper bound for quantities that expand into repeated shop/bank packets. */
export const MAX_ACTION_QUANTITY = 10_000;
/** Shops accept Buy/Sell-10 at most, so 1000 items is already 100 packets. */
export const MAX_SHOP_ACTION_QUANTITY = 1_000;
/** Hard cap on packets a single shop call may emit, independent of quantity. */
export const MAX_SHOP_ACTION_PACKETS = 120;
/** Wall-clock ceiling for a multi-packet shop call. */
export const SHOP_ACTION_DEADLINE_MS = 60_000;

export type QuantityValidation =
    | { valid: true; amount: number }
    | { valid: false; message: string };

/**
 * Validate a quantity before it controls a loop or is serialized into a packet.
 * The -1 "all" sentinel is only accepted when `allowAll` is set.
 */
export function validateActionQuantity(
    amount: number,
    options: { allowAll?: boolean; max?: number } = {},
): QuantityValidation {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        return { valid: false, message: 'Amount must be a finite number' };
    }
    if (options.allowAll && amount === -1) return { valid: true, amount };
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        return { valid: false, message: `Amount must be a positive integer, got ${amount}` };
    }
    const max = options.max ?? MAX_ACTION_QUANTITY;
    if (amount > max) {
        return { valid: false, message: `Amount ${amount} exceeds the maximum ${max}` };
    }
    return { valid: true, amount };
}

/** Largest shop step (10/5/1) that fits in `remaining`. */
export function nextShopStep(remaining: number): number {
    return remaining >= 10 ? 10 : remaining >= 5 ? 5 : 1;
}

export interface QuantityOutcome {
    requested: number;
    actual: number;
    /** True only when the full requested amount landed. */
    complete: boolean;
    /** True when some — but not all — of the requested amount landed. */
    partial: boolean;
}

/**
 * Quantity success is exact. A partial fill is reported as unsuccessful so a
 * caller that asked for 28 ore never proceeds believing it has 28.
 */
export function classifyQuantity(requested: number, actual: number): QuantityOutcome {
    const normalizedRequested = Math.max(0, Math.floor(requested));
    const normalizedActual = Math.max(0, Math.floor(actual));
    return {
        requested: normalizedRequested,
        actual: normalizedActual,
        complete: normalizedActual === normalizedRequested,
        partial: normalizedActual > 0 && normalizedActual < normalizedRequested,
    };
}
