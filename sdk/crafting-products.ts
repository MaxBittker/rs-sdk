import type { InterfaceOption, InventoryItem } from './types';
import { countInventoryItem } from './action-reliability';

export interface CraftProduct {
    name: string;
    optionPattern: RegExp;
    inventoryPattern: RegExp;
    regularPosition: number;
    higherTierPosition?: number;
}

const FLETCH_PRODUCTS: Array<{ aliases: RegExp; product: CraftProduct }> = [
    {
        aliases: /arrow|shaft/i,
        product: {
            name: 'arrow shafts',
            optionPattern: /arrow|shaft/i,
            inventoryPattern: /arrow shaft/i,
            regularPosition: 0,
        },
    },
    {
        aliases: /short/i,
        product: {
            name: 'shortbow',
            optionPattern: /short\s*bow/i,
            inventoryPattern: /short\s*bow/i,
            regularPosition: 1,
            higherTierPosition: 0,
        },
    },
    {
        aliases: /long/i,
        product: {
            name: 'longbow',
            optionPattern: /long\s*bow/i,
            inventoryPattern: /long\s*bow/i,
            regularPosition: 2,
            higherTierPosition: 1,
        },
    },
];

const LEATHER_PRODUCTS: Array<{ aliases: RegExp; product: CraftProduct }> = [
    {
        aliases: /body|armou?r/i,
        product: {
            name: 'leather body',
            optionPattern: /body|armou?r/i,
            inventoryPattern: /^leather body$/i,
            regularPosition: 0,
        },
    },
    {
        aliases: /glove/i,
        product: {
            name: 'leather gloves',
            optionPattern: /glove/i,
            inventoryPattern: /^leather gloves$/i,
            regularPosition: 1,
        },
    },
    {
        aliases: /boot/i,
        product: {
            name: 'leather boots',
            optionPattern: /boot/i,
            inventoryPattern: /^leather boots$/i,
            regularPosition: 2,
        },
    },
    {
        aliases: /chap|leg/i,
        product: {
            name: 'leather chaps',
            optionPattern: /chap|leg/i,
            inventoryPattern: /^leather chaps$/i,
            regularPosition: 4,
        },
    },
    {
        aliases: /vamb/i,
        product: {
            name: 'leather vambraces',
            optionPattern: /vamb/i,
            inventoryPattern: /^leather (?:vambraces|vambs)$/i,
            regularPosition: 3,
        },
    },
    {
        aliases: /coif/i,
        product: {
            name: 'leather coif',
            optionPattern: /coif/i,
            inventoryPattern: /^leather coif$/i,
            regularPosition: 5,
        },
    },
    {
        aliases: /cowl/i,
        product: {
            name: 'leather cowl',
            optionPattern: /cowl/i,
            inventoryPattern: /^leather cowl$/i,
            regularPosition: 6,
        },
    },
];

export function resolveFletchProduct(product?: string): CraftProduct | null {
    if (!product) return FLETCH_PRODUCTS[0]!.product;
    return FLETCH_PRODUCTS.find(entry => entry.aliases.test(product))?.product ?? null;
}

export function resolveLeatherProduct(product?: string): CraftProduct | null {
    if (!product) return LEATHER_PRODUCTS[1]!.product;
    return LEATHER_PRODUCTS.find(entry => entry.aliases.test(product))?.product ?? null;
}

export function productPosition(product: CraftProduct, higherTierLogs: boolean): number {
    return higherTierLogs
        ? product.higherTierPosition ?? product.regularPosition
        : product.regularPosition;
}

function matches(pattern: RegExp, text: string): boolean {
    pattern.lastIndex = 0;
    return pattern.test(text);
}

export function matchingProductOptions(
    options: readonly InterfaceOption[],
    product: CraftProduct,
): InterfaceOption[] {
    return options.filter(option => matches(product.optionPattern, option.text));
}

/**
 * Prefer exactly one item when an interface exposes Make-10/Make-5/Make-1
 * components for the same product. A sole product option remains compatible
 * with interfaces that do not expose a quantity in their text.
 */
export function resolveMakeOneOption(
    options: readonly InterfaceOption[],
    product: CraftProduct,
): InterfaceOption | null {
    const productOptions = matchingProductOptions(options, product);
    const makeOne = productOptions.find(option =>
        /\bmake\s*[-x]?\s*(?:1|one)\b/i.test(option.text)
    );
    if (makeOne) return makeOne;
    const implicitSingle = productOptions.find(option =>
        !/\bmake\s*[-x]?\s*(?:5|10)\b/i.test(option.text)
    );
    if (implicitSingle) return implicitSingle;
    return productOptions.length === 1 ? productOptions[0]! : null;
}

export function findProducedItem(
    before: readonly InventoryItem[],
    after: readonly InventoryItem[],
    product: CraftProduct,
): InventoryItem | null {
    const oldCount = countInventoryItem(before, product.inventoryPattern);
    if (countInventoryItem(after, product.inventoryPattern) <= oldCount) return null;
    return after.find(item => {
        product.inventoryPattern.lastIndex = 0;
        return product.inventoryPattern.test(item.name);
    }) ?? null;
}
