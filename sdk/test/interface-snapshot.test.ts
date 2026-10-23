import { expect, test } from 'bun:test';
import { BotSDK } from '../index';
import type { InterfaceSnapshotState } from '../types';

test('returns null for missing state or older clients, and distinguishes supported closed interfaces', () => {
    const sdk = new BotSDK({ botUsername: 'offline_fixture', autoLaunchBrowser: false });
    expect(sdk.getInterfaceSnapshot()).toBeNull();
    (sdk as any).state = { interface: { isOpen: true, interfaceId: 1, options: [] } };
    expect(sdk.getInterfaceSnapshot()).toBeNull();
    const closed: InterfaceSnapshotState = { version: 1, rootId: -1, components: [], truncated: false };
    (sdk as any).state.interface = { isOpen: false, interfaceId: -1, options: [], snapshot: closed };
    expect(sdk.getInterfaceSnapshot()).toEqual(closed);
    const open = { ...closed, rootId: 1 };
    (sdk as any).state.interface = { isOpen: true, interfaceId: 1, options: [], snapshot: open };
    expect(sdk.getInterfaceSnapshot()).toEqual(open);
});
