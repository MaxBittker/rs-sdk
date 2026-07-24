import type { InventoryItem } from './types';
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
    {
        aliases: /stock/i,
        product: {
            name: 'crossbow stock',
            optionPattern: /stock/i,
            inventoryPattern: /stock/i,
            regularPosition: 3,
            higherTierPosition: 3,
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
        aliases: /glove|vamb/i,
        product: {
            name: 'leather gloves',
            optionPattern: /glove|vamb/i,
            inventoryPattern: /^leather gloves$/i,
            regularPosition: 1,
        },
    },
    {
        aliases: /chap|leg/i,
        product: {
            name: 'leather chaps',
            optionPattern: /chap|leg/i,
            inventoryPattern: /^leather chaps$/i,
            regularPosition: 2,
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
