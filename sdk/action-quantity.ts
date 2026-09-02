import type { DialogOption, InterfaceOption, InventoryItem } from './types';

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

/**
 * Pick the match with the shortest name, so `/hopper/i` resolves to "Hopper"
 * rather than a nearer "Hopper controls". Ties keep the list's own order
 * (nearest-first for world entities, slot order for inventories).
 *
 * World entities carrying `reachable: false` are considered last: interacting
 * with one fails with a silent `cant_reach`, so a reachable match always beats
 * an unreachable one (the "nearest man is inside the castle" trap). If every
 * match is unreachable the best of them is still returned - callers can check
 * `.reachable` and decide to walk, wait, or skip.
 */
export function shortestNameMatch<T extends { name: string; reachable?: boolean }>(
    items: readonly T[],
    pattern: string | RegExp,
): T | null {
    if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
        // A numeric id (or undefined) used to surface as a cryptic
        // "pattern.test is not a function" TypeError deep in the match loop.
        throw new TypeError(
            `name pattern must be a string or RegExp, got ${pattern === null ? 'null' : typeof pattern} (${String(pattern)}). ` +
            'To look up by numeric id, filter a get*() list by .id, e.g. sdk.getNearbyLocs().find(l => l.id === 1234)'
        );
    }
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    const pick = (matches: (name: string) => boolean): T | null => {
        let best: T | null = null;
        let bestReachable: T | null = null;
        for (const item of items) {
            if (!matches(item.name)) continue;
            if (!best || item.name.length < best.name.length) best = item;
            if (item.reachable !== false && (!bestReachable || item.name.length < bestReachable.name.length)) {
                bestReachable = item;
            }
        }
        return bestReachable ?? best;
    };
    const found = pick(name => testPattern(regex, name));
    if (found || typeof pattern !== 'string' || !/[.*+?^${}()|[\]\\]/.test(pattern)) return found;
    // A literal item name with regex metacharacters ("Serum 207 (1)",
    // "Cake (1/3)") compiles to a pattern that matches nothing - fall back to a
    // plain case-insensitive substring match before giving up.
    return pick(name => testPattern(pattern, name));
}

/** Anchored, escaped pattern matching exactly `name` (case-insensitive). */
export function exactNamePattern(name: string): RegExp {
    return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

/** "Make X", "Make 10", "Make 5", "Make 1" — quantity buttons, not products. */
const QUANTITY_BUTTON = /^make\s+(x|\d+)$/i;

/** A level-up chatbox's only button. Never a product, whatever dialog it's in. */
const CONTINUE_BUTTON = /^click here to continue$/i;

function isProductButton(text: string | undefined): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    return !QUANTITY_BUTTON.test(trimmed) && !CONTINUE_BUTTON.test(trimmed);
}

/**
 * Resolve a product in a skill dialog (`skill_multi2`..`skill_multi5`).
 *
 * These dialogs interleave four buttons per product — Make X, Make 10, Make 5,
 * and a fourth whose label is the product name — so the product you want is
 * never at the index its position in the menu suggests. Arrow shafts are
 * option 4 of 12, not option 1. Only the make-1 button carries a name, so the
 * named options *are* the products, in order.
 *
 * Matching is by visible label: every word of `product` must appear (so
 * 'oak short' hits "Oak Short Bow"), falling back to a punctuation-insensitive
 * contains (so 'shortbow' hits it too). Omit `product` for the first one.
 */
export function resolveSkillDialogProduct(
    options: readonly DialogOption[],
    product?: string,
): DialogOption | null {
    const named = options.filter(option => isProductButton(option.text));
    if (named.length === 0) return null;
    if (!product) return named[0] ?? null;

    const wanted = product.toLowerCase().trim();
    const words = wanted.split(/\s+/).filter(Boolean);
    const byWords = named.find(option => {
        const label = option.text.toLowerCase();
        return words.every(word => label.includes(word));
    });
    if (byWords) return byWords;

    const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return named.find(option => squash(option.text).includes(squash(wanted))) ?? null;
}

/** The product labels a skill dialog is offering, for error messages. */
export function skillDialogProductLabels(options: readonly DialogOption[]): string[] {
    return options
        .filter(option => isProductButton(option.text))
        .map(option => option.text);
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
/**
 * Bank withdrawals/deposits serialize the whole amount into one Withdraw-X /
 * Deposit-X count-dialog packet — nothing expands per item — so the only real
 * bound is the wire's: the client encodes amounts >= 2^31-1 as the "All"
 * button. Capping these at MAX_ACTION_QUANTITY silently no-opped ordinary
 * stackable withdrawals (e.g. 20k coins from a 125M stack).
 */
export const MAX_BANK_ACTION_QUANTITY = 2_147_483_646;
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
