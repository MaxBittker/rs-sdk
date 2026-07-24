import { describe, expect, test } from 'bun:test';
import { BotSDK } from '../index';
import type { InventoryItem } from '../types';

function item(slot: number, name: string, count: number): InventoryItem {
    return { slot, name, count, id: slot, optionsWithIndex: [] };
}

describe('BotSDK.countInventoryItems', () => {
    test('sums stack sizes across matching occupied slots', () => {
        const sdk = Object.create(BotSDK.prototype) as BotSDK;
        (sdk as any).state = {
            inventory: [
                item(0, 'Logs', 1),
                item(1, 'Logs', 1),
                item(2, 'Coins', 500)
            ]
        };

        expect(sdk.countInventoryItems(/^logs$/i)).toBe(2);
        expect(sdk.countInventoryItems('coins')).toBe(500);
        expect(sdk.getInventory().filter(entry => /^logs$/i.test(entry.name))).toHaveLength(2);
    });

    test('normalizes stateful regular expressions', () => {
        const sdk = Object.create(BotSDK.prototype) as BotSDK;
        (sdk as any).state = {
            inventory: [item(0, 'Bones', 1), item(1, 'Bones', 1)]
        };

        expect(sdk.countInventoryItems(/bones/gi)).toBe(2);
    });
});
