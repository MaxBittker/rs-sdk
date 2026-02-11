// Bot SDK - Porcelain Layer
// High-level domain-aware methods that wrap plumbing with game knowledge
// Actions resolve when the EFFECT is complete (not just acknowledged)

import { BotSDK } from './index';
import { ActionHelpers } from './actions-helpers';
import { isInsideDraynorManor, getDraynorManorEscape, findDoorsAlongPath } from './pathfinding';
import type {
    ActionResult,
    SkillState,
    InventoryItem,
    BankItem,
    NearbyNpc,
    NearbyLoc,
    GroundItem,
    ShopItem,
    ChopTreeResult,
    BurnLogsResult,
    PickupResult,
    TalkResult,
    ShopResult,
    ShopSellResult,
    SellAmount,
    EquipResult,
    UnequipResult,
    EatResult,
    AttackResult,
    CastSpellResult,
    OpenDoorResult,
    FletchResult,
    CraftLeatherResult,
    SmithResult,
    OpenBankResult,
    BankDepositResult,
    BankWithdrawResult,
    UseItemOnLocResult,
    UseItemOnNpcResult,
    InteractLocResult,
    InteractNpcResult,
    PickpocketResult,
    PrayerResult,
    PrayerName
} from './types';
import { PRAYER_INDICES, PRAYER_NAMES, PRAYER_LEVELS } from './types';

export class BotActions {
    private helpers: ActionHelpers;

    constructor(private sdk: BotSDK) {
        this.helpers = new ActionHelpers(sdk);
    }

    // ============ Porcelain: UI Helpers ============

    /**
     * Skip tutorial by navigating dialogs and talking to tutorial NPCs.
     * This is a porcelain method - domain logic that was moved from bot client.
     * @param options.randomizeAppearance - If true, randomizes character appearance when the design screen appears. Default: true.
     */
    async skipTutorial(options: { randomizeAppearance?: boolean } = {}): Promise<ActionResult> {
        const { randomizeAppearance = true } = options;
        const state = this.sdk.getState();
        if (!state?.inGame) {
            return { success: false, message: 'Not in game' };
        }

        // Helper to check and handle character design modal
        const checkAndHandleDesignModal = async (): Promise<boolean> => {
            const s = this.sdk.getState();
            if (s?.modalOpen && s?.modalInterface === 3559) {
                if (randomizeAppearance) {
                    await this.sdk.sendRandomizeCharacterDesign();
                    await this.sdk.waitForTicks(1);
                }
                await this.sdk.sendAcceptCharacterDesign();
                await this.sdk.waitForTicks(1);
                return true;
            }
            return false;
        };

        // Check for character design modal (interface 3559) and handle it
        await checkAndHandleDesignModal();

        // If dialog open, navigate through it (may take multiple clicks)
        if (state.dialog.isOpen) {
            let clickCount = 0;
            const MAX_CLICKS = 10;

            while (clickCount < MAX_CLICKS) {
                // Check for design modal each iteration
                await checkAndHandleDesignModal();

                const currentState = this.sdk.getState();
                if (!currentState?.dialog.isOpen) {
                    return { success: true, message: `Dialog completed after ${clickCount} clicks` };
                }

                if (currentState.dialog.isWaiting) {
                    await this.sdk.waitForTicks(1);
                    continue;
                }

                const options = currentState.dialog.options;
                if (options.length > 0) {
                    // Smart option selection: skip > yes > confirm > first option
                    const skipOption = options.find(o => /skip|complete|finish/i.test(o.text));
                    const yesOption = options.find(o => /yes|continue|proceed/i.test(o.text));
                    const confirmOption = options.find(o => /confirm|accept|agree|ok/i.test(o.text));

                    const selectedOption = skipOption || yesOption || confirmOption || options[0];
                    await this.sdk.sendClickDialog(selectedOption!.index);
                } else {
                    await this.sdk.sendClickDialog(0);
                }

                clickCount++;
                await this.sdk.waitForTicks(1);
            }

            return { success: true, message: `Clicked through ${clickCount} dialogs` };
        }

        // Find tutorial NPC
        const guide = this.sdk.findNearbyNpc(/runescape guide|guide|tutorial/i);
        if (guide) {
            const talkOpt = guide.optionsWithIndex.find(o => /talk/i.test(o.text));
            if (!talkOpt) {
                return { success: false, message: 'No Talk option on tutorial NPC' };
            }

            const result = await this.sdk.sendInteractNpc(guide.index, talkOpt.opIndex);
            if (!result.success) {
                return { success: false, message: result.message };
            }

            // Wait for dialog to open
            try {
                await this.sdk.waitForCondition(s => s.dialog.isOpen, 5000);
                await this.sdk.waitForTicks(1);

                // Loop through all dialog pages until closed
                let clickCount = 0;
                const MAX_CLICKS = 10;

                while (clickCount < MAX_CLICKS) {
                    // Check for design modal each iteration
                    await checkAndHandleDesignModal();

                    const currentState = this.sdk.getState();
                    if (!currentState?.dialog.isOpen) {
                        return { success: true, message: `Tutorial skipped after ${clickCount} dialog clicks` };
                    }

                    if (currentState.dialog.isWaiting) {
                        await this.sdk.waitForTicks(1);
                        continue;
                    }

                    const options = currentState.dialog.options;
                    if (options.length > 0) {
                        // Smart option selection: skip > yes > confirm > first option
                        const skipOption = options.find(o => /skip|complete|finish/i.test(o.text));
                        const yesOption = options.find(o => /yes|continue|proceed/i.test(o.text));
                        const confirmOption = options.find(o => /confirm|accept|agree|ok/i.test(o.text));

                        const selectedOption = skipOption || yesOption || confirmOption || options[0];
                        await this.sdk.sendClickDialog(selectedOption!.index);
                    } else {
                        await this.sdk.sendClickDialog(0);
                    }

                    clickCount++;
                    await this.sdk.waitForTicks(1);
                }

                return { success: true, message: `Clicked through ${clickCount} dialogs` };
            } catch {
                return { success: false, message: 'Timed out waiting for dialog to open' };
            }
        }

        return { success: false, message: 'No tutorial NPC found' };
    }

    /** Dismiss any blocking UI like level-up dialogs. */
    async dismissBlockingUI(): Promise<void> {
        const maxAttempts = 10;
        for (let i = 0; i < maxAttempts; i++) {
            const state = this.sdk.getState();
            if (!state) break;

            if (state.dialog.isOpen) {
                await this.sdk.sendClickDialog(0);
                await this.sdk.waitForStateChange(2000).catch(() => {});
                continue;
            }

            break;
        }
    }

    // ============ Porcelain: Smart Actions ============

    /** Open a door or gate, walking to it if needed. */
    async openDoor(target?: NearbyLoc | string | RegExp): Promise<OpenDoorResult> {
        const door = this.helpers.resolveLocation(target, /door|gate/i);
        if (!door) {
            return { success: false, message: 'No door found nearby', reason: 'door_not_found' };
        }

        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (!openOpt) {
            const closeOpt = door.optionsWithIndex.find(o => /^close$/i.test(o.text));
            if (closeOpt) {
                return { success: true, message: `${door.name} is already open`, reason: 'already_open', door };
            }
            const optTexts = door.optionsWithIndex.map(o => o.text);
            return { success: false, message: `${door.name} has no Open option (options: ${optTexts.join(', ')})`, reason: 'no_open_option', door };
        }

        if (door.distance > 2) {
            const walkResult = await this.walkTo(door.x, door.z);
            if (!walkResult.success) {
                return { success: false, message: `Could not walk to ${door.name}: ${walkResult.message}`, reason: 'walk_failed', door };
            }

            const doorsNow = this.sdk.getNearbyLocs().filter(l =>
                l.x === door.x && l.z === door.z && /door|gate/i.test(l.name)
            );
            const refreshedDoor = doorsNow[0];
            if (!refreshedDoor) {
                return { success: true, message: `${door.name} is no longer visible (may have been opened)`, door };
            }

            const refreshedOpenOpt = refreshedDoor.optionsWithIndex.find(o => /^open$/i.test(o.text));
            if (!refreshedOpenOpt) {
                const hasClose = refreshedDoor.optionsWithIndex.some(o => /^close$/i.test(o.text));
                if (hasClose) {
                    return { success: true, message: `${door.name} is already open`, reason: 'already_open', door: refreshedDoor };
                }
                return { success: false, message: `${door.name} no longer has Open option`, reason: 'no_open_option', door: refreshedDoor };
            }

            await this.sdk.sendInteractLoc(refreshedDoor.x, refreshedDoor.z, refreshedDoor.id, refreshedOpenOpt.opIndex);
        } else {
            await this.sdk.sendInteractLoc(door.x, door.z, door.id, openOpt.opIndex);
        }

        const doorX = door.x;
        const doorZ = door.z;
        const startTick = this.sdk.getState()?.tick || 0;

        try {
            await this.sdk.waitForCondition(state => {
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                    }
                }

                const doorNow = state.nearbyLocs.find(l =>
                    l.x === doorX && l.z === doorZ && /door|gate/i.test(l.name)
                );
                if (!doorNow) {
                    return true;
                }
                const hasClose = doorNow.optionsWithIndex.some(o => /^close$/i.test(o.text));
                const hasOpen = doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text));
                return hasClose && !hasOpen;
            }, 5000);

            if (this.helpers.checkCantReachMessage(startTick)) {
                return { success: false, message: `Cannot reach ${door.name} - still blocked`, reason: 'open_failed', door };
            }

            const doorAfter = this.sdk.getState()?.nearbyLocs.find(l =>
                l.x === doorX && l.z === doorZ && /door|gate/i.test(l.name)
            );

            if (!doorAfter) {
                return { success: true, message: `Opened ${door.name}`, door };
            }

            const hasCloseNow = doorAfter.optionsWithIndex.some(o => /^close$/i.test(o.text));
            if (hasCloseNow) {
                return { success: true, message: `Opened ${door.name}`, door: doorAfter };
            }

            return { success: false, message: `${door.name} did not open`, reason: 'open_failed', door: doorAfter };

        } catch {
            return { success: false, message: `Timeout waiting for ${door.name} to open`, reason: 'timeout', door };
        }
    }

    /**
     * Use an inventory item on a nearby location (e.g., fish on range, ore on furnace).
     * Walks to the location first (handling doors), then uses the item.
     */
    async useItemOnLoc(
        item: InventoryItem | string | RegExp,
        loc: NearbyLoc | string | RegExp,
        options: { timeout?: number } = {}
    ): Promise<UseItemOnLocResult> {
        const { timeout = 10000 } = options;

        await this.dismissBlockingUI();

        // Resolve item
        const resolvedItem = this.helpers.resolveInventoryItem(item, /./);
        if (!resolvedItem) {
            return { success: false, message: `Item not found in inventory: ${item}`, reason: 'item_not_found' };
        }

        // Resolve location
        const resolvedLoc = this.helpers.resolveLocation(loc, /./);
        if (!resolvedLoc) {
            return { success: false, message: `Location not found nearby: ${loc}`, reason: 'loc_not_found' };
        }

        // Walk to the location first (handles doors)
        if (resolvedLoc.distance > 2) {
            const walkResult = await this.walkTo(resolvedLoc.x, resolvedLoc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${resolvedLoc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the location after walking (it may have moved in view)
        const locPattern = typeof loc === 'object' ? new RegExp(resolvedLoc.name, 'i') : loc;
        const locNow = this.helpers.resolveLocation(locPattern, /./);
        if (!locNow) {
            return { success: false, message: `${resolvedLoc.name} no longer visible`, reason: 'loc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;

        // Use the item on the location
        const result = await this.sdk.sendUseItemOnLoc(resolvedItem.slot, locNow.x, locNow.z, locNow.id);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for interaction to complete or fail
        try {
            await this.sdk.waitForCondition(state => {
                // Check for "can't reach" messages
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                    }
                }

                // Check if dialog/interface opened (crafting menu, etc.)
                if (state.dialog.isOpen || state.interface?.isOpen) {
                    return true;
                }

                // Check if player started animating (cooking, smelting, etc.)
                if (state.player && state.player.animId !== -1) {
                    return true;
                }

                return false;
            }, timeout);

            // Check for failure
            if (this.helpers.checkCantReachMessage(startTick)) {
                return { success: false, message: `Cannot reach ${locNow.name}`, reason: 'cant_reach' };
            }

            return { success: true, message: `Used ${resolvedItem.name} on ${locNow.name}` };
        } catch {
            return { success: false, message: `Timeout using ${resolvedItem.name} on ${locNow.name}`, reason: 'timeout' };
        }
    }

    /**
     * Use an inventory item on a nearby NPC (e.g., bones on altar keeper, item on NPC).
     * Walks to the NPC first (handling doors), then uses the item.
     */
    async useItemOnNpc(
        item: InventoryItem | string | RegExp,
        npc: NearbyNpc | string | RegExp,
        options: { timeout?: number } = {}
    ): Promise<UseItemOnNpcResult> {
        const { timeout = 10000 } = options;

        await this.dismissBlockingUI();

        // Resolve item
        const resolvedItem = this.helpers.resolveInventoryItem(item, /./);
        if (!resolvedItem) {
            return { success: false, message: `Item not found in inventory: ${item}`, reason: 'item_not_found' };
        }

        // Resolve NPC
        const resolvedNpc = this.helpers.resolveNpc(npc);
        if (!resolvedNpc) {
            return { success: false, message: `NPC not found nearby: ${npc}`, reason: 'npc_not_found' };
        }

        // Walk to the NPC first (handles doors)
        if (resolvedNpc.distance > 2) {
            const walkResult = await this.walkTo(resolvedNpc.x, resolvedNpc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${resolvedNpc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the NPC after walking (it may have moved)
        const npcPattern = typeof npc === 'object' && 'index' in npc ? new RegExp(resolvedNpc.name, 'i') : npc;
        const npcNow = this.helpers.resolveNpc(npcPattern);
        if (!npcNow) {
            return { success: false, message: `${resolvedNpc.name} no longer visible`, reason: 'npc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;

        // Use the item on the NPC
        const result = await this.sdk.sendUseItemOnNpc(resolvedItem.slot, npcNow.index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for interaction to complete or fail
        try {
            await this.sdk.waitForCondition(state => {
                // Check for "can't reach" messages
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                    }
                }

                // Check if dialog/interface opened
                if (state.dialog.isOpen || state.interface?.isOpen) {
                    return true;
                }

                // Check if player started animating
                if (state.player && state.player.animId !== -1) {
                    return true;
                }

                return false;
            }, timeout);

            // Check for failure
            if (this.helpers.checkCantReachMessage(startTick)) {
                return { success: false, message: `Cannot reach ${npcNow.name}`, reason: 'cant_reach' };
            }

            return { success: true, message: `Used ${resolvedItem.name} on ${npcNow.name}` };
        } catch {
            return { success: false, message: `Timeout using ${resolvedItem.name} on ${npcNow.name}`, reason: 'timeout' };
        }
    }

    /** Chop a tree and wait for logs to appear in inventory. */
    async chopTree(target?: NearbyLoc | string | RegExp): Promise<ChopTreeResult> {
        await this.dismissBlockingUI();

        const tree = this.helpers.resolveLocation(target, /^tree$/i);
        if (!tree) {
            return { success: false, message: 'No tree found' };
        }

        const invCountBefore = this.sdk.getInventory().length;
        const result = await this.sdk.sendInteractLoc(tree.x, tree.z, tree.id, 1);

        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state => {
                const newItem = state.inventory.length > invCountBefore;
                const treeGone = !state.nearbyLocs.find(l =>
                    l.x === tree.x && l.z === tree.z && l.id === tree.id
                );
                return newItem || treeGone;
            }, 30000);

            const logs = this.sdk.findInventoryItem(/logs/i);
            return { success: true, logs: logs || undefined, message: 'Chopped tree' };
        } catch {
            return { success: false, message: 'Timed out waiting for tree chop' };
        }
    }

    /** Burn logs using a tinderbox, wait for firemaking XP. */
    async burnLogs(logsTarget?: InventoryItem | string | RegExp): Promise<BurnLogsResult> {
        await this.dismissBlockingUI();

        const tinderbox = this.sdk.findInventoryItem(/tinderbox/i);
        if (!tinderbox) {
            return { success: false, xpGained: 0, message: 'No tinderbox in inventory' };
        }

        const logs = this.helpers.resolveInventoryItem(logsTarget, /logs/i);
        if (!logs) {
            return { success: false, xpGained: 0, message: 'No logs in inventory' };
        }

        const fmBefore = this.sdk.getSkill('Firemaking')?.experience || 0;

        const result = await this.sdk.sendUseItemOnItem(tinderbox.slot, logs.slot);
        if (!result.success) {
            return { success: false, xpGained: 0, message: result.message };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        let lastDialogClickTick = 0;

        try {
            await this.sdk.waitForCondition(state => {
                const fmXp = state.skills.find(s => s.name === 'Firemaking')?.experience || 0;
                if (fmXp > fmBefore) {
                    return true;
                }

                if (state.dialog.isOpen && (state.tick - lastDialogClickTick) >= 3) {
                    lastDialogClickTick = state.tick;
                    this.sdk.sendClickDialog(0).catch(() => {});
                }

                const failureMessages = ["can't light a fire", "you need to move", "can't do that here"];
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (failureMessages.some(f => text.includes(f))) {
                            return true;
                        }
                    }
                }

                return false;
            }, 30000);

            const fmAfter = this.sdk.getSkill('Firemaking')?.experience || 0;
            const xpGained = fmAfter - fmBefore;

            return {
                success: xpGained > 0,
                xpGained,
                message: xpGained > 0 ? 'Burned logs' : 'Failed to light fire (possibly bad location)'
            };
        } catch {
            return { success: false, xpGained: 0, message: 'Timed out waiting for fire' };
        }
    }

    /** Pick up an item from the ground. */
    async pickupItem(target: GroundItem | string | RegExp): Promise<PickupResult> {
        return this.helpers.withDoorRetry(
            () => this._pickupItemOnce(target),
            (r) => r.reason === 'cant_reach'
        );
    }

    private async _pickupItemOnce(target: GroundItem | string | RegExp): Promise<PickupResult> {
        const item = this.helpers.resolveGroundItem(target);
        if (!item) {
            return { success: false, message: 'Item not found on ground', reason: 'item_not_found' };
        }

        const invCountBefore = this.sdk.getInventory().length;

        // Walk close to the item first (server handles final positioning via sendPickup)
        if (item.distance > 2) {
            const walkResult = await this.walkTo(item.x, item.z, 2);
            if (!walkResult.success) {
                return { success: false, message: walkResult.message, reason: 'cant_reach' };
            }
        }

        // Wait one tick before picking up
        await this.sdk.waitForTicks(1);

        // Capture startTick AFTER walk so we only check messages from the pickup, not the walk
        const startTick = this.sdk.getState()?.tick || 0;

        // Now send the pickup command
        const result = await this.sdk.sendPickup(item.x, item.z, item.id);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Track total inventory item count (handles stackables)
        const invTotalBefore = this.sdk.getInventory().reduce((sum, i) => sum + i.count, 0);

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for failure messages
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                        if (text.includes("inventory") && text.includes("full")) {
                            return true;
                        }
                    }
                }
                // Item disappeared from ground (picked up by us or someone else)
                const stillOnGround = state.groundItems.some(g => g.x === item.x && g.z === item.z && g.id === item.id);
                if (!stillOnGround) return true;
                // New inventory slot appeared (non-stackable)
                if (state.inventory.length > invCountBefore) return true;
                // Existing stack grew (stackable)
                const invTotalNow = state.inventory.reduce((sum, i) => sum + i.count, 0);
                if (invTotalNow > invTotalBefore) return true;
                return false;
            }, 10000);

            // Check for failure reasons
            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return { success: false, message: `Cannot reach ${item.name} - path blocked`, reason: 'cant_reach' };
                    }
                    if (text.includes("inventory") && text.includes("full")) {
                        return { success: false, message: 'Inventory is full', reason: 'inventory_full' };
                    }
                }
            }

            const pickedUp = this.sdk.getInventory().find(i => i.id === item.id);

            // Wait one tick after picking up
            await this.sdk.waitForTicks(1);

            return { success: true, item: pickedUp, message: `Picked up ${item.name}` };
        } catch {
            return { success: false, message: 'Timed out waiting for pickup', reason: 'timeout' };
        }
    }

    /** Talk to an NPC and wait for dialog to open. Walks to the NPC first (handling doors). */
    async talkTo(target: NearbyNpc | string | RegExp): Promise<TalkResult> {
        await this.dismissBlockingUI();

        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: 'NPC not found' };
        }

        // Walk to the NPC first (handles doors)
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}` };
            }
        }

        // Re-find the NPC after walking (it may have moved)
        const npcPattern = typeof target === 'object' ? new RegExp(npc.name, 'i') : target;
        const npcNow = this.helpers.resolveNpc(npcPattern);
        if (!npcNow) {
            return { success: false, message: `${npc.name} no longer visible` };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        let lastMoveTick = startTick;
        let lastX = this.sdk.getState()?.player?.x ?? 0;
        let lastZ = this.sdk.getState()?.player?.z ?? 0;

        const result = await this.sdk.sendTalkToNpc(npcNow.index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for can't-reach messages
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) return true;
                    }
                }

                // Dialog opened — success
                if (state.dialog.isOpen) return true;

                // Track movement
                if (state.player && (state.player.x !== lastX || state.player.z !== lastZ)) {
                    lastX = state.player.x;
                    lastZ = state.player.z;
                    lastMoveTick = state.tick;
                }

                // Player idle for 2+ ticks with no dialog → give up
                if (state.tick - lastMoveTick >= 2) return true;

                return false;
            }, 30000); // safety net only

            if (this.helpers.checkCantReachMessage(startTick)) {
                return { success: false, message: `Cannot reach ${npcNow.name}` };
            }

            if (finalState.dialog.isOpen) {
                return { success: true, dialog: finalState.dialog, message: `Talking to ${npcNow.name}` };
            }

            return { success: false, message: 'Dialog did not open' };
        } catch {
            return { success: false, message: 'Timed out waiting for dialog' };
        }
    }

    /** Walk to coordinates using pathfinding, auto-opening doors. */
    async walkTo(x: number, z: number, tolerance: number = 3): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.player) return { success: false, message: 'No player state' };

        let pos = { x: state.player.worldX, z: state.player.worldZ };
        const distTo = (p: { x: number; z: number }) => this.helpers.distance(p.x, p.z, x, z);

        if (distTo(pos) <= tolerance) {
            return { success: true, message: 'Already at destination' };
        }

        // Draynor Manor trap: the front door only opens from outside.
        // If we're inside the manor and the destination is outside, escape
        // via the east wing doors first, then continue to the real destination.
        if (isInsideDraynorManor(pos.x, pos.z, state.player.level) &&
            !isInsideDraynorManor(x, z)) {
            const escape = getDraynorManorEscape();
            console.log(`[walkTo] Inside Draynor Manor — escaping via east wing to (${escape.x}, ${escape.z})`);
            const escapeResult = await this._walkToInternal(escape.x, escape.z, 3);
            if (!escapeResult.success) {
                return { success: false, message: `Trapped in Draynor Manor: ${escapeResult.message}` };
            }
            const afterEscape = this.sdk.getState()?.player;
            if (afterEscape) pos = { x: afterEscape.worldX, z: afterEscape.worldZ };
            if (distTo(pos) <= tolerance) {
                return { success: true, message: 'Arrived' };
            }
        }

        return this._walkToInternal(x, z, tolerance);
    }

    /** Core walk loop — used by walkTo and Draynor Manor escape. */
    private async _walkToInternal(x: number, z: number, tolerance: number = 3): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.player) return { success: false, message: 'No player state' };

        const distTo = (pos: { x: number; z: number }) => this.helpers.distance(pos.x, pos.z, x, z);
        let pos = { x: state.player.worldX, z: state.player.worldZ };

        if (distTo(pos) <= tolerance) {
            return { success: true, message: 'Already at destination' };
        }

        const MAX_ITERATIONS = 50;
        const MAX_DOOR_RETRIES = 3;
        let doorRetryCount = 0;
        let poorProgressCount = 0;

        // Try to open a blocking door. Returns true if door was opened.
        const tryOpenDoor = async (): Promise<boolean> => {
            if (doorRetryCount >= MAX_DOOR_RETRIES) return false;
            if (await this.helpers.tryOpenBlockingDoor()) {
                doorRetryCount++;
                await this.sdk.waitForTicks(1);
                return true;
            }
            return false;
        };

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            // Try pathfinding (with one retry)
            let path = await this.sdk.sendFindPath(x, z, 500);
            if (!path.success || !path.waypoints?.length) {
                await this.sdk.waitForTicks(1);
                path = await this.sdk.sendFindPath(x, z, 500);
                if (!path.success || !path.waypoints?.length) {
                    // If destination is far, try an intermediate point within pathfinder range
                    const dist = this.helpers.distance(pos.x, pos.z, x, z);
                    if (dist > 200) {
                        const ratio = 200 / dist;
                        const midX = Math.round(pos.x + (x - pos.x) * ratio);
                        const midZ = Math.round(pos.z + (z - pos.z) * ratio);
                        path = await this.sdk.sendFindPath(midX, midZ, 500);
                    }
                    if (!path.success || !path.waypoints?.length) {
                        console.error(`[walkTo] PATHFINDING FAILED: ${path.error ?? 'no waypoints'} - from (${pos.x}, ${pos.z}) to (${x}, ${z})`);
                        return { success: false, message: `No path to (${x}, ${z}) from (${pos.x}, ${pos.z}): ${path.error ?? 'no waypoints'}` };
                    }
                }
            }

            // Identify doors the path crosses through so we can open them proactively
            const requiredDoors = findDoorsAlongPath(path.waypoints);
            const requiredDoorKeys = new Set(requiredDoors.map(d => `${d.x},${d.z}`));

            // Walk waypoints
            const startPos = { ...pos };
            let consecutiveStuck = 0;

            for (const wp of path.waypoints) {
                // Proactively open doors the path requires — only when we're close enough to see them
                if (requiredDoorKeys.size > 0) {
                    const wpDoorKey = `${wp.x},${wp.z}`;
                    const isNearDoor = requiredDoorKeys.has(wpDoorKey) ||
                        requiredDoorKeys.has(`${wp.x + 1},${wp.z}`) ||
                        requiredDoorKeys.has(`${wp.x - 1},${wp.z}`) ||
                        requiredDoorKeys.has(`${wp.x},${wp.z + 1}`) ||
                        requiredDoorKeys.has(`${wp.x},${wp.z - 1}`);

                    if (isNearDoor) {
                        const dist = this.helpers.distance(pos.x, pos.z, wp.x, wp.z);
                        if (dist <= 15) {
                            // Find which required door is closest to this waypoint
                            for (const door of requiredDoors) {
                                const doorDist = Math.abs(door.x - wp.x) + Math.abs(door.z - wp.z);
                                if (doorDist <= 1) {
                                    const opened = await this.helpers.openDoorAt(door.x, door.z);
                                    if (opened) {
                                        requiredDoorKeys.delete(`${door.x},${door.z}`);
                                        await this.sdk.waitForTicks(1);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }

                const result = await this.helpers.walkStepToward(wp.x, wp.z, 2, pos);
                if (distTo(result.pos) <= tolerance) return { success: true, message: 'Arrived' };

                if (result.status === 'stuck') {
                    if (++consecutiveStuck >= 3) {
                        await tryOpenDoor();
                        break; // Re-query path
                    }
                } else {
                    consecutiveStuck = 0;
                    pos = result.pos;
                }
            }

            // Check progress since path query started
            const distMoved = this.helpers.distance(startPos.x, startPos.z, pos.x, pos.z);

            // Good progress - continue walking directly without re-querying (prevents oscillation)
            if (distMoved >= 5) {
                poorProgressCount = 0;
                for (let j = 0; j < 10; j++) {
                    const result = await this.helpers.walkStepToward(x, z, tolerance, pos);
                    if (result.status === 'arrived') return { success: true, message: 'Arrived' };
                    if (result.status === 'stuck') break;
                    pos = result.pos;
                }
                continue;
            }

            // Poor progress - might be stuck
            if (++poorProgressCount >= 3) {
                if (!await tryOpenDoor()) {
                    return { success: false, message: `Stuck at (${pos.x}, ${pos.z})` };
                }
                poorProgressCount = 0;
            }
        }

        return { success: false, message: `Could not reach (${x}, ${z}) - stopped at (${pos.x}, ${pos.z})` };
    }

    // ============ Porcelain: Shop Actions ============

    /** Close the shop interface. */
    async closeShop(timeout: number = 5000): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.shop.isOpen && !state?.interface?.isOpen) {
            return { success: true, message: 'Shop already closed' };
        }

        await this.sdk.sendCloseShop();

        try {
            await this.sdk.waitForCondition(s => {
                const shopClosed = !s.shop.isOpen;
                const interfaceClosed = !s.interface?.isOpen;
                return shopClosed && interfaceClosed;
            }, timeout);

            return { success: true, message: 'Shop closed' };
        } catch {
            await this.sdk.sendCloseShop();
            await this.sdk.waitForTicks(1);
            const finalState = this.sdk.getState();

            if (!finalState?.shop.isOpen && !finalState?.interface?.isOpen) {
                return { success: true, message: 'Shop closed (second attempt)' };
            }

            return {
                success: false,
                message: `Shop close timeout - shop.isOpen=${finalState?.shop.isOpen}, interface.isOpen=${finalState?.interface?.isOpen}`
            };
        }
    }

    /** Open a shop by trading with an NPC. */
    async openShop(target: NearbyNpc | string | RegExp = /shop\s*keeper/i): Promise<ActionResult> {
        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: 'Shopkeeper not found' };
        }

        const tradeOpt = npc.optionsWithIndex.find(o => /trade/i.test(o.text));
        if (!tradeOpt) {
            return { success: false, message: 'No trade option on NPC' };
        }

        // Walk near NPC first - this handles doors
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}` };
            }
        }

        const result = await this.sdk.sendInteractNpc(npc.index, tradeOpt.opIndex);
        if (!result.success) {
            return result;
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                if (state.shop.isOpen) return true;
                return false;
            }, 10000);

            if (finalState.shop.isOpen) {
                return { success: true, message: `Opened shop: ${this.sdk.getState()?.shop.title}` };
            }

            return { success: false, message: 'Shop did not open' };
        } catch {
            return { success: false, message: 'Timed out waiting for shop to open' };
        }
    }

    /** Buy an item from an open shop .*/
    async buyFromShop(target: ShopItem | string | RegExp, amount: number = 1): Promise<ShopResult> {
        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open' };
        }

        const shopItem = this.helpers.resolveShopItem(target, shop.shopItems);
        if (!shopItem) {
            return { success: false, message: `Item not found in shop: ${target}` };
        }

        // Count total items across all inventory slots (handles non-stackable items)
        const countInvItems = () =>
            this.sdk.getInventory()
                .filter(i => i.id === shopItem.id)
                .reduce((sum, i) => sum + i.count, 0);

        const totalBefore = countInvItems();

        // Decompose amount into valid buy commands (10, 5, 1)
        let remaining = Math.max(1, Math.floor(amount));
        const buySteps: number[] = [];
        while (remaining > 0) {
            if (remaining >= 10) { buySteps.push(10); remaining -= 10; }
            else if (remaining >= 5) { buySteps.push(5); remaining -= 5; }
            else { buySteps.push(1); remaining -= 1; }
        }

        for (const stepAmount of buySteps) {
            const countBefore = countInvItems();

            const result = await this.sdk.sendShopBuy(shopItem.slot, stepAmount);
            if (!result.success) {
                const totalBought = countInvItems() - totalBefore;
                if (totalBought > 0) {
                    const boughtItem = this.sdk.getInventory().find(i => i.id === shopItem.id);
                    return { success: true, item: boughtItem, message: `Bought ${shopItem.name} x${totalBought} (wanted ${amount})` };
                }
                return { success: false, message: result.message };
            }

            try {
                await this.sdk.waitForCondition(state => {
                    const total = state.inventory
                        .filter(i => i.id === shopItem.id)
                        .reduce((sum, i) => sum + i.count, 0);
                    return total > countBefore;
                }, 5000);
            } catch {
                const totalBought = countInvItems() - totalBefore;
                if (totalBought > 0) {
                    const boughtItem = this.sdk.getInventory().find(i => i.id === shopItem.id);
                    return { success: true, item: boughtItem, message: `Bought ${shopItem.name} x${totalBought} (wanted ${amount})` };
                }
                return { success: false, message: `Failed to buy ${shopItem.name} (no coins or out of stock?)` };
            }
        }

        const totalBought = countInvItems() - totalBefore;
        const boughtItem = this.sdk.getInventory().find(i => i.id === shopItem.id);
        return { success: true, item: boughtItem, message: `Bought ${shopItem.name} x${totalBought}` };
    }

    /** Sell an item to an open shop. */
    async sellToShop(target: InventoryItem | ShopItem | string | RegExp, amount: SellAmount = 1): Promise<ShopSellResult> {
        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open' };
        }

        const sellItem = this.helpers.resolveShopItem(target, shop.playerItems);
        if (!sellItem) {
            return { success: false, message: `Item not found to sell: ${target}` };
        }

        const startTick = this.sdk.getState()?.tick || 0;

        if (amount === 'all') {
            return this.sellAllToShop(sellItem, startTick);
        }

        const validAmount = [1, 5, 10].includes(amount) ? amount : 1;

        const result = await this.sdk.sendShopSell(sellItem.slot, validAmount);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        const getTotalCount = (playerItems: typeof shop.playerItems) =>
            playerItems.filter(i => i.id === sellItem.id).reduce((sum, i) => sum + i.count, 0);
        const totalCountBefore = getTotalCount(shop.playerItems);

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't sell this item")) {
                            return true;
                        }
                    }
                }

                const totalCountNow = getTotalCount(state.shop.playerItems);
                return totalCountNow < totalCountBefore;
            }, 5000);

            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't sell this item to this shop")) {
                        return { success: false, message: `Shop doesn't buy ${sellItem.name}`, rejected: true };
                    }
                    if (text.includes("can't sell this item to a shop")) {
                        return { success: false, message: `Cannot sell ${sellItem.name} to any shop`, rejected: true };
                    }
                    if (text.includes("can't sell this item")) {
                        return { success: false, message: `${sellItem.name} is not tradeable`, rejected: true };
                    }
                }
            }

            const totalCountAfter = getTotalCount(finalState.shop.playerItems);
            const amountSold = totalCountBefore - totalCountAfter;

            return { success: true, message: `Sold ${sellItem.name} x${amountSold}`, amountSold };
        } catch {
            return { success: false, message: `Failed to sell ${sellItem.name} (timeout)` };
        }
    }

    private async sellAllToShop(sellItem: ShopItem, startTick: number): Promise<ShopSellResult> {
        let totalSold = 0;

        const getTotalCount = (playerItems: ShopItem[]) => {
            return playerItems.filter(i => i.id === sellItem.id).reduce((sum, i) => sum + i.count, 0);
        };

        while (true) {
            const state = this.sdk.getState();
            if (!state?.shop.isOpen) {
                break;
            }

            const currentItem = state.shop.playerItems.find(i => i.id === sellItem.id);
            if (!currentItem || currentItem.count === 0) {
                break;
            }

            const totalCountBefore = getTotalCount(state.shop.playerItems);
            const sellAmount = Math.min(10, currentItem.count);
            const currentSlot = currentItem.slot;

            const result = await this.sdk.sendShopSell(currentSlot, sellAmount);
            if (!result.success) {
                break;
            }

            try {
                const finalState = await this.sdk.waitForCondition(s => {
                    for (const msg of s.gameMessages) {
                        if (msg.tick > startTick) {
                            if (msg.text.toLowerCase().includes("can't sell this item")) {
                                return true;
                            }
                        }
                    }

                    const totalCountNow = getTotalCount(s.shop.playerItems);
                    return totalCountNow < totalCountBefore;
                }, 3000);

                for (const msg of finalState.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't sell this item to this shop")) {
                            return {
                                success: totalSold > 0,
                                message: totalSold > 0
                                    ? `Sold ${sellItem.name} x${totalSold}, then shop stopped buying`
                                    : `Shop doesn't buy ${sellItem.name}`,
                                amountSold: totalSold,
                                rejected: true
                            };
                        }
                        if (text.includes("can't sell this item")) {
                            return {
                                success: false,
                                message: `${sellItem.name} cannot be sold`,
                                amountSold: totalSold,
                                rejected: true
                            };
                        }
                    }
                }

                const totalCountAfter = getTotalCount(finalState.shop.playerItems);
                const soldThisRound = totalCountBefore - totalCountAfter;
                totalSold += soldThisRound;

                if (soldThisRound === 0) {
                    break;
                }

            } catch {
                break;
            }
        }

        if (totalSold === 0) {
            return { success: false, message: `Failed to sell any ${sellItem.name}` };
        }

        return { success: true, message: `Sold ${sellItem.name} x${totalSold}`, amountSold: totalSold };
    }

    // ============ Porcelain: Bank Actions ============

    /** Open a bank booth or talk to a banker. */
    async openBank(timeout: number = 10000): Promise<OpenBankResult> {
        const state = this.sdk.getState();
        if (state?.interface?.isOpen) {
            return { success: true, message: 'Bank already open' };
        }

        await this.dismissBlockingUI();

        const banker = this.sdk.findNearbyNpc(/banker/i);
        const bankBooth = this.sdk.findNearbyLoc(/bank booth|bank chest/i);

        if (!banker && !bankBooth) {
            return { success: false, message: 'No banker NPC or bank booth found nearby', reason: 'no_bank_found' };
        }

        // Walk near the bank target first - this handles doors
        const target = banker || bankBooth!;
        if (target.distance > 2) {
            const walkResult = await this.walkTo(target.x, target.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach bank: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find targets after walking (they may have changed)
        const bankerNow = this.sdk.findNearbyNpc(/banker/i);
        const bankBoothNow = this.sdk.findNearbyLoc(/bank booth|bank chest/i);

        let interactSuccess = false;

        if (bankerNow) {
            const bankOpt = bankerNow.optionsWithIndex.find(o => /^bank$/i.test(o.text));
            if (bankOpt) {
                await this.sdk.sendInteractNpc(bankerNow.index, bankOpt.opIndex);
                interactSuccess = true;
            }
        }

        if (!interactSuccess && bankBoothNow) {
            const bankOpt = bankBoothNow.optionsWithIndex.find(o => /^bank$/i.test(o.text)) ||
                           bankBoothNow.optionsWithIndex.find(o => /use/i.test(o.text));
            if (bankOpt) {
                await this.sdk.sendInteractLoc(bankBoothNow.x, bankBoothNow.z, bankBoothNow.id, bankOpt.opIndex);
                interactSuccess = true;
            }
        }

        if (!interactSuccess) {
            return { success: false, message: 'No banker NPC or bank booth found nearby', reason: 'no_bank_found' };
        }

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const finalState = await this.sdk.waitForCondition(s => {
                    if (s.interface?.isOpen === true || s.dialog?.isOpen === true) return true;
                    return false;
                }, Math.min(2000, timeout - (Date.now() - startTime)));

                const currentState = this.sdk.getState();

                if (currentState?.interface?.isOpen) {
                    return { success: true, message: `Bank opened (interfaceId: ${currentState.interface.interfaceId})` };
                }

                if (currentState?.dialog?.isOpen) {
                    const opt = currentState.dialog.options?.[0];
                    await this.sdk.sendClickDialog(opt?.index ?? 0);
                    await this.sdk.waitForTicks(1);
                    continue;
                }
            } catch {
                // Timeout on waitForCondition, loop will continue or exit
            }
        }

        const finalState = this.sdk.getState();
        if (finalState?.interface?.isOpen) {
            return { success: true, message: `Bank opened (interfaceId: ${finalState.interface.interfaceId})` };
        }

        return { success: false, message: 'Timeout waiting for bank interface to open', reason: 'timeout' };
    }

    /** Close the bank interface. */
    async closeBank(timeout: number = 5000): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: true, message: 'Bank already closed' };
        }

        await this.sdk.sendCloseModal();

        try {
            await this.sdk.waitForCondition(s => !s.interface?.isOpen, timeout);
            return { success: true, message: 'Bank closed' };
        } catch {
            await this.sdk.sendCloseModal();
            await this.sdk.waitForTicks(1);

            const finalState = this.sdk.getState();
            if (!finalState?.interface?.isOpen) {
                return { success: true, message: 'Bank closed (second attempt)' };
            }

            return { success: false, message: `Bank close timeout - interface.isOpen=${finalState?.interface?.isOpen}` };
        }
    }

    /** Deposit an item into the bank. Use -1 for all. */
    async depositItem(target: InventoryItem | string | RegExp, amount: number = -1): Promise<BankDepositResult> {
        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'Bank is not open', reason: 'bank_not_open' };
        }

        const item = this.helpers.resolveInventoryItem(target, /./);
        if (!item) {
            return { success: false, message: `Item not found in inventory: ${target}`, reason: 'item_not_found' };
        }

        const countBefore = state.inventory.filter(i => i.id === item.id).reduce((sum, i) => sum + i.count, 0);

        await this.sdk.sendBankDeposit(item.slot, amount);

        try {
            await this.sdk.waitForCondition(s => {
                const countNow = s.inventory.filter(i => i.id === item.id).reduce((sum, i) => sum + i.count, 0);
                return countNow < countBefore;
            }, 5000);

            const finalState = this.sdk.getState();
            const countAfter = finalState?.inventory.filter(i => i.id === item.id).reduce((sum, i) => sum + i.count, 0) ?? 0;
            const amountDeposited = countBefore - countAfter;

            return { success: true, message: `Deposited ${item.name} x${amountDeposited}`, amountDeposited };
        } catch {
            return { success: false, message: `Timeout waiting for ${item.name} to be deposited`, reason: 'timeout' };
        }
    }

    /** Withdraw an item from the bank by slot number. */
    async withdrawItem(target: BankItem | string | RegExp | number, amount: number = 1): Promise<BankWithdrawResult> {
        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'Bank is not open', reason: 'bank_not_open' };
        }

        let bankSlot: number;
        if (typeof target === 'number') {
            bankSlot = target;
        } else if (typeof target === 'object' && 'slot' in target) {
            bankSlot = target.slot;
        } else {
            const found = this.sdk.findBankItem(target);
            if (!found) {
                return { success: false, message: `Bank item not found: ${target}`, reason: 'item_not_found' };
            }
            bankSlot = found.slot;
        }

        const invCountBefore = state.inventory.length;

        await this.sdk.sendBankWithdraw(bankSlot, amount);

        try {
            await this.sdk.waitForCondition(s => {
                return s.inventory.length > invCountBefore ||
                       s.inventory.some(i => {
                           const before = state.inventory.find(bi => bi.slot === i.slot);
                           return before && i.count > before.count;
                       });
            }, 5000);

            const finalInv = this.sdk.getInventory();
            const newItem = finalInv.find(i => {
                const before = state.inventory.find(bi => bi.slot === i.slot);
                return !before || i.count > before.count;
            });

            return { success: true, message: `Withdrew item from bank slot ${bankSlot}`, item: newItem };
        } catch {
            return { success: false, message: `Timeout waiting for item to be withdrawn`, reason: 'timeout' };
        }
    }

    // ============ Porcelain: Equipment & Combat ============

    /** Equip an item from inventory. */
    async equipItem(target: InventoryItem | string | RegExp): Promise<EquipResult> {
        const item = this.helpers.resolveInventoryItem(target, /./);
        if (!item) {
            return { success: false, message: `Item not found: ${target}` };
        }

        const equipOpt = item.optionsWithIndex.find(o => /wield|wear|equip/i.test(o.text));
        if (!equipOpt) {
            return { success: false, message: `No equip option on ${item.name}` };
        }

        const result = await this.sdk.sendUseItem(item.slot, equipOpt.opIndex);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state =>
                !state.inventory.find(i => i.slot === item.slot && i.id === item.id),
                5000
            );
            return { success: true, message: `Equipped ${item.name}` };
        } catch {
            return { success: false, message: `Failed to equip ${item.name}` };
        }
    }

    /** Unequip an item to inventory. */
    async unequipItem(target: InventoryItem | string | RegExp): Promise<UnequipResult> {
        let item: InventoryItem | null = null;
        if (typeof target === 'object' && 'slot' in target) {
            item = target;
        } else {
            item = this.sdk.findEquipmentItem(target);
        }

        if (!item) {
            return { success: false, message: `Item not found in equipment: ${target}` };
        }

        const invCountBefore = this.sdk.getInventory().length;
        const result = await this.sdk.sendUseEquipmentItem(item.slot, 1);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state =>
                state.inventory.length > invCountBefore ||
                state.inventory.some(i => i.id === item!.id),
                5000
            );

            const unequippedItem = this.sdk.findInventoryItem(new RegExp(item.name, 'i'));
            return { success: true, message: `Unequipped ${item.name}`, item: unequippedItem || undefined };
        } catch {
            return { success: false, message: `Failed to unequip ${item.name}` };
        }
    }

    /** Get all currently equipped items. */
    getEquipment(): InventoryItem[] {
        return this.sdk.getEquipment();
    }

    /** Find an equipped item by name pattern. */
    findEquippedItem(pattern: string | RegExp): InventoryItem | null {
        return this.sdk.findEquipmentItem(pattern);
    }

    /** Eat food to restore hitpoints. */
    async eatFood(target: InventoryItem | string | RegExp): Promise<EatResult> {
        const food = this.helpers.resolveInventoryItem(target, /./);
        if (!food) {
            return { success: false, hpGained: 0, message: `Food not found: ${target}` };
        }

        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (!eatOpt) {
            return { success: false, hpGained: 0, message: `No eat option on ${food.name}` };
        }

        const hpBefore = this.sdk.getSkill('Hitpoints')?.level ?? 10;
        const foodCountBefore = this.sdk.getInventory().filter(i => i.id === food.id).length;

        const result = await this.sdk.sendUseItem(food.slot, eatOpt.opIndex);
        if (!result.success) {
            return { success: false, hpGained: 0, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state => {
                const hp = state.skills.find(s => s.name === 'Hitpoints')?.level ?? 10;
                const foodCount = state.inventory.filter(i => i.id === food.id).length;
                return hp > hpBefore || foodCount < foodCountBefore;
            }, 5000);

            const hpAfter = this.sdk.getSkill('Hitpoints')?.level ?? 10;
            return { success: true, hpGained: hpAfter - hpBefore, message: `Ate ${food.name}` };
        } catch {
            return { success: false, hpGained: 0, message: `Failed to eat ${food.name}` };
        }
    }

    /** Attack an NPC, walking to it if needed. */
    async attackNpc(target: NearbyNpc | string | RegExp, timeout: number = 5000): Promise<AttackResult> {
        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        // Sanity check: NPC coordinates should be within reasonable distance of player
        // If coords are wildly off, the NPC data is corrupted
        const state = this.sdk.getState();
        if (state?.player) {
            const coordDist = Math.sqrt(
                Math.pow(npc.x - state.player.worldX, 2) + Math.pow(npc.z - state.player.worldZ, 2)
            );
            // If calculated coord distance is way more than reported distance, coords are bad
            // Allow tolerance of 5 tiles for small distances (handles distance=0 edge case)
            if (coordDist > 200 || (npc.distance > 0 && npc.distance < 50 && coordDist > Math.max(5, npc.distance * 3))) {
                return { success: false, message: `NPC "${npc.name}" has invalid coordinates`, reason: 'npc_not_found' };
            }
        }

        const attackOpt = npc.optionsWithIndex.find(o => /attack/i.test(o.text));
        if (!attackOpt) {
            return { success: false, message: `No attack option on ${npc.name}`, reason: 'no_attack_option' };
        }

        // Walk near NPC first - this handles doors
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}`, reason: 'out_of_reach' };
            }
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const result = await this.sdk.sendInteractNpc(npc.index, attackOpt.opIndex);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("someone else is fighting") || text.includes("already under attack")) {
                            return true;
                        }
                    }
                }

                const targetNpc = state.nearbyNpcs.find(n => n.index === npc.index);
                if (!targetNpc) {
                    return true;
                }

                if (targetNpc.distance <= 2) {
                    return true;
                }

                return false;
            }, timeout);

            // Check for "already in combat"
            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("someone else is fighting") || text.includes("already under attack")) {
                        return { success: false, message: `${npc.name} is already in combat`, reason: 'already_in_combat' };
                    }
                }
            }

            return { success: true, message: `Attacking ${npc.name}` };
        } catch {
            return { success: false, message: `Timeout waiting to attack ${npc.name}`, reason: 'timeout' };
        }
    }

    /** Cast a combat spell on an NPC. */
    async castSpellOnNpc(target: NearbyNpc | string | RegExp, spellComponent: number, timeout: number = 3000): Promise<CastSpellResult> {
        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        const startState = this.sdk.getState();
        if (!startState) {
            return { success: false, message: 'No game state available' };
        }
        const startTick = startState.tick;
        const startMagicXp = startState.skills.find(s => s.name === 'Magic')?.experience ?? 0;

        const result = await this.sdk.sendSpellOnNpc(npc.index, spellComponent);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
                        if (text.includes("do not have enough") || text.includes("don't have enough")) {
                            return true;
                        }
                    }
                }

                const currentMagicXp = state.skills.find(s => s.name === 'Magic')?.experience ?? 0;
                if (currentMagicXp > startMagicXp) {
                    return true;
                }

                return false;
            }, timeout);

            // Check for "not enough runes" first
            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("do not have enough") || text.includes("don't have enough")) {
                        return { success: false, message: `Not enough runes to cast spell`, reason: 'no_runes' };
                    }
                }
            }

            if (this.helpers.checkCantReachMessage(startTick)) {
                return { success: false, message: `Cannot reach ${npc.name} - obstacle in the way`, reason: 'out_of_reach' };
            }

            const finalMagicXp = finalState.skills.find(s => s.name === 'Magic')?.experience ?? 0;
            const xpGained = finalMagicXp - startMagicXp;
            if (xpGained > 0) {
                return { success: true, message: `Hit ${npc.name} for ${xpGained} Magic XP`, hit: true, xpGained };
            }

            return { success: true, message: `Splashed on ${npc.name}`, hit: false, xpGained: 0 };
        } catch {
            return { success: true, message: `Splashed on ${npc.name} (timeout)`, hit: false, xpGained: 0 };
        }
    }

    // ============ Porcelain: Condition Helpers ============

    /** Wait until a skill reaches a target level. */
    async waitForSkillLevel(skillName: string, targetLevel: number, timeout: number = 60000): Promise<SkillState> {
        const state = await this.sdk.waitForCondition(s => {
            const skill = s.skills.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
            return skill !== undefined && skill.baseLevel >= targetLevel;
        }, timeout);

        return state.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())!;
    }

    /** Wait until an item appears in inventory. */
    async waitForInventoryItem(pattern: string | RegExp, timeout: number = 30000): Promise<InventoryItem> {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

        const state = await this.sdk.waitForCondition(s =>
            s.inventory.some(i => regex.test(i.name)),
            timeout
        );

        return state.inventory.find(i => regex.test(i.name))!;
    }

    /** Wait for dialog to close. */
    async waitForDialogClose(timeout: number = 30000): Promise<void> {
        await this.sdk.waitForCondition(s => !s.dialog.isOpen, timeout);
    }

    /** Wait for player to stop moving. */
    async waitForIdle(timeout: number = 10000): Promise<void> {
        const initialState = this.sdk.getState();
        if (!initialState?.player) {
            throw new Error('No player state');
        }

        const initialX = initialState.player.x;
        const initialZ = initialState.player.z;

        await this.sdk.waitForStateChange(timeout);

        await this.sdk.waitForCondition(state => {
            if (!state.player) return false;
            return state.player.x === initialX && state.player.z === initialZ;
        }, timeout);
    }

    // ============ Porcelain: Sequences ============

    async navigateDialog(choices: (number | string | RegExp)[]): Promise<void> {
        for (const choice of choices) {
            const dialog = this.sdk.getDialog();
            let optionIndex: number;

            if (typeof choice === 'number') {
                optionIndex = choice;
            } else {
                const regex = typeof choice === 'string' ? new RegExp(choice, 'i') : choice;
                const match = dialog?.options.find(o => regex.test(o.text));
                optionIndex = match?.index ?? 0;
            }

            await this.sdk.sendClickDialog(optionIndex);
            await this.sdk.waitForTicks(1);
        }
    }

    // ============ Crafting & Fletching ============

    /** Fletch logs into bows or arrow shafts using a knife. */
    async fletchLogs(product?: string): Promise<FletchResult> {
        await this.dismissBlockingUI();

        const knife = this.sdk.findInventoryItem(/knife/i);
        if (!knife) {
            return { success: false, message: 'No knife in inventory' };
        }

        const logs = this.sdk.findInventoryItem(/logs/i);
        if (!logs) {
            return { success: false, message: 'No logs in inventory' };
        }

        // Check if we're using oak or higher-tier logs (affects button order)
        const isOakOrHigherLogs = /oak|willow|maple|yew|magic/i.test(logs.name);

        const fletchingBefore = this.sdk.getSkill('Fletching')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;

        // Use knife on logs to open fletching dialog
        const result = await this.sdk.sendUseItemOnItem(knife.slot, logs.slot);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for dialog/interface to open
        try {
            await this.sdk.waitForCondition(
                s => s.dialog.isOpen || s.interface?.isOpen,
                5000
            );
        } catch {
            return { success: false, message: 'Fletching dialog did not open' };
        }

        // Handle product selection and crafting
        const MAX_ATTEMPTS = 30;
        let buttonClicked = false;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const state = this.sdk.getState();
            if (!state) {
                return { success: false, message: 'Lost game state' };
            }

            // Check if XP was gained (success!)
            const currentXp = state.skills.find(s => s.name === 'Fletching')?.experience || 0;
            if (currentXp > fletchingBefore) {
                const craftedProduct = this.sdk.findInventoryItem(/shortbow|longbow|arrow shaft|stock/i);
                return {
                    success: true,
                    message: 'Fletched logs successfully',
                    xpGained: currentXp - fletchingBefore,
                    product: craftedProduct || undefined
                };
            }

            // Handle interface (make-x style)
            if (state.interface?.isOpen) {
                // Try to find product by text in options
                let targetIndex = 1;
                if (product) {
                    const productLower = product.toLowerCase();
                    const matchingOption = state.interface.options.find(o =>
                        o.text.toLowerCase().includes(productLower)
                    );
                    if (matchingOption) {
                        targetIndex = matchingOption.index;
                    }
                }

                if (!buttonClicked) {
                    await this.sdk.sendClickInterfaceOption(targetIndex);
                    buttonClicked = true;
                } else if (state.interface.options.length > 0 && state.interface.options[0]) {
                    await this.sdk.sendClickInterfaceOption(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Handle dialog - use allComponents to find the right button
            if (state.dialog.isOpen) {
                if (!buttonClicked && product && state.dialog.allComponents) {
                    // Find the button that matches our product by looking at allComponents text
                    const productLower = product.toLowerCase();

                    // Build a mapping of product text to button index
                    // allComponents contains both text labels and "Ok" buttons
                    // We need to find which "Ok" button corresponds to our product

                    // Look for a component whose text matches the product
                    const matchingComponents = state.dialog.allComponents.filter(c => {
                        const text = c.text.toLowerCase();
                        // Match patterns like "shortbow", "longbow", "arrow shaft"
                        if (productLower.includes('short') && text.includes('shortbow')) return true;
                        if (productLower.includes('long') && text.includes('longbow')) return true;
                        if (productLower.includes('arrow') && text.includes('arrow')) return true;
                        if (productLower.includes('shaft') && text.includes('shaft')) return true;
                        if (productLower.includes('stock') && text.includes('stock')) return true;
                        // Generic match
                        return text.includes(productLower);
                    });

                    if (matchingComponents.length > 0) {
                        // Found a matching text component - now find the associated Ok button
                        // The Ok buttons in dialog.options should correspond to the products
                        // Try to find the index by matching component IDs or order

                        // Get all Ok buttons from options
                        const okButtons = state.dialog.options.filter(o =>
                            o.text.toLowerCase() === 'ok'
                        );

                        if (okButtons.length > 0) {
                            // Try to determine which Ok button to click based on product type
                            // Button order depends on log type:
                            // - Regular logs: [Arrow shafts, Shortbow, Longbow] - 3 main products
                            // - Oak/higher logs: [Shortbow, Longbow] - 2 main products (no arrow shafts option)
                            let okIndex = 0; // Default to first

                            if (productLower.includes('short')) {
                                if (isOakOrHigherLogs) {
                                    // Oak/higher logs: Shortbow is first (index 0)
                                    okIndex = 0;
                                } else {
                                    // Regular logs: Shortbow is second (index 1, after arrow shafts)
                                    okIndex = Math.min(1, okButtons.length - 1);
                                }
                            } else if (productLower.includes('long')) {
                                if (isOakOrHigherLogs) {
                                    // Oak/higher logs: Longbow is second (index 1)
                                    okIndex = Math.min(1, okButtons.length - 1);
                                } else {
                                    // Regular logs: Longbow is third (index 2)
                                    okIndex = Math.min(2, okButtons.length - 1);
                                }
                            } else if (productLower.includes('stock')) {
                                okIndex = Math.min(3, okButtons.length - 1);
                            }
                            // arrow/shaft stays at 0

                            const targetButton = okButtons[okIndex];
                            if (targetButton) {
                                await this.sdk.sendClickDialog(targetButton.index);
                                buttonClicked = true;
                                await this.sdk.waitForTicks(1);
                                continue;
                            }
                        }
                    }
                }

                // Fallback: use index-based approach if we couldn't match by text
                if (!buttonClicked) {
                    // Determine fallback index based on product keyword and log type
                    let targetButtonIndex = 1; // Default: first option
                    if (product) {
                        const productLower = product.toLowerCase();
                        if (productLower.includes('short')) {
                            // Oak/higher: shortbow is button 1; Regular: button 2
                            targetButtonIndex = isOakOrHigherLogs ? 1 : 2;
                        } else if (productLower.includes('long')) {
                            // Oak/higher: longbow is button 2; Regular: button 3
                            targetButtonIndex = isOakOrHigherLogs ? 2 : 3;
                        } else if (productLower.includes('stock')) {
                            targetButtonIndex = 4;
                        }
                        // arrow/shaft stays at 1
                    }

                    if (state.dialog.options.length >= targetButtonIndex) {
                        await this.sdk.sendClickDialog(targetButtonIndex);
                        buttonClicked = true;
                        await this.sdk.waitForTicks(1);
                        continue;
                    }
                }

                // If we already clicked or don't have enough options, click continue/first
                if (state.dialog.options.length > 0 && state.dialog.options[0]) {
                    await this.sdk.sendClickDialog(state.dialog.options[0].index);
                } else {
                    await this.sdk.sendClickDialog(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a higher") || text.includes("level to")) {
                        return { success: false, message: 'Fletching level too low' };
                    }
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Fletching')?.experience || 0;
        if (finalXp > fletchingBefore) {
            const craftedProduct = this.sdk.findInventoryItem(/shortbow|longbow|arrow shaft|stock/i);
            return {
                success: true,
                message: 'Fletched logs successfully',
                xpGained: finalXp - fletchingBefore,
                product: craftedProduct || undefined
            };
        }

        return { success: false, message: 'Fletching timed out' };
    }

    /** Craft leather into armour using needle and thread. */
    async craftLeather(product?: string): Promise<CraftLeatherResult> {
        await this.dismissBlockingUI();

        const needle = this.sdk.findInventoryItem(/needle/i);
        if (!needle) {
            return { success: false, message: 'No needle in inventory', reason: 'no_needle' };
        }

        const leather = this.sdk.findInventoryItem(/^leather$/i);
        if (!leather) {
            return { success: false, message: 'No leather in inventory', reason: 'no_leather' };
        }

        const thread = this.sdk.findInventoryItem(/thread/i);
        if (!thread) {
            return { success: false, message: 'No thread in inventory', reason: 'no_thread' };
        }

        const craftingBefore = this.sdk.getSkill('Crafting')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;

        // Use needle on leather to open crafting interface
        const result = await this.sdk.sendUseItemOnItem(needle.slot, leather.slot);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for interface/dialog to open
        try {
            await this.sdk.waitForCondition(
                s => s.dialog.isOpen || s.interface?.isOpen,
                10000
            );
        } catch {
            return { success: false, message: 'Crafting interface did not open', reason: 'interface_not_opened' };
        }

        // Handle product selection and crafting
        const MAX_ATTEMPTS = 50;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const state = this.sdk.getState();
            if (!state) {
                return { success: false, message: 'Lost game state' };
            }

            // Check if XP was gained (success!)
            const currentXp = state.skills.find(s => s.name === 'Crafting')?.experience || 0;
            if (currentXp > craftingBefore) {
                return {
                    success: true,
                    message: 'Crafted leather item successfully',
                    xpGained: currentXp - craftingBefore,
                    itemsCrafted: 1
                };
            }

            // Handle interface (leather crafting interface id=2311)
            if (state.interface?.isOpen) {
                if (product) {
                    // Try to find matching option by text
                    const productOption = state.interface.options.find(o =>
                        o.text.toLowerCase().includes(product.toLowerCase())
                    );
                    if (productOption) {
                        await this.sdk.sendClickInterfaceOption(productOption.index);
                        await this.sdk.waitForTicks(1);
                        continue;
                    }
                }

                // Leather crafting interface (2311) - options are 1-indexed in state but
                // sendClickInterfaceOption uses 0-based array indices.
                // option.index 1 = leather body (lvl 14), array idx 0
                // option.index 2 = leather gloves (lvl 1), array idx 1
                // option.index 3 = leather chaps (lvl 18), array idx 2
                if (state.interface.interfaceId === 2311) {
                    // Map product names to array indices (0-based)
                    let optionIndex = 1; // Default: gloves (array idx 1, lowest level requirement)
                    if (product) {
                        const productLower = product.toLowerCase();
                        if (productLower.includes('body') || productLower.includes('armour')) {
                            optionIndex = 0; // array idx 0 -> option.index 1 = body
                        } else if (productLower.includes('chaps') || productLower.includes('legs')) {
                            optionIndex = 2; // array idx 2 -> option.index 3 = chaps
                        } else if (productLower.includes('glove') || productLower.includes('vamb')) {
                            optionIndex = 1; // array idx 1 -> option.index 2 = gloves
                        }
                    }
                    await this.sdk.sendClickInterfaceOption(optionIndex);
                } else if (state.interface.options.length > 0 && state.interface.options[0]) {
                    await this.sdk.sendClickInterfaceOption(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Handle dialog
            if (state.dialog.isOpen) {
                const craftOption = state.dialog.options.find(o =>
                    /glove|make|craft|leather|body|chaps/i.test(o.text)
                );
                if (craftOption) {
                    await this.sdk.sendClickDialog(craftOption.index);
                } else if (state.dialog.options.length > 0 && state.dialog.options[0]) {
                    await this.sdk.sendClickDialog(state.dialog.options[0].index);
                } else {
                    await this.sdk.sendClickDialog(0);
                }
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a crafting level") || text.includes("level to")) {
                        return { success: false, message: 'Crafting level too low', reason: 'level_too_low' };
                    }
                    if (text.includes("don't have") && text.includes("thread")) {
                        return { success: false, message: 'Out of thread', reason: 'no_thread' };
                    }
                }
            }

            // Check if leather is gone (possibly consumed)
            const currentLeather = this.sdk.findInventoryItem(/^leather$/i);
            if (!currentLeather) {
                // Check XP one more time
                const finalXp = this.sdk.getSkill('Crafting')?.experience || 0;
                if (finalXp > craftingBefore) {
                    return {
                        success: true,
                        message: 'Crafted leather item successfully',
                        xpGained: finalXp - craftingBefore,
                        itemsCrafted: 1
                    };
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Crafting')?.experience || 0;
        if (finalXp > craftingBefore) {
            return {
                success: true,
                message: 'Crafted leather item successfully',
                xpGained: finalXp - craftingBefore,
                itemsCrafted: 1
            };
        }

        return { success: false, message: 'Crafting timed out', reason: 'timeout' };
    }

    // ============ Smithing ============

    /**
     * Smithing interface layout: 5 columns (pack IDs 1119-1123), each with up to 5 slots.
     * Maps product name -> { component (column pack ID), slot (row within column) }.
     *
     * Column 1 (1119): Dagger, Sword, Scimitar, Longsword, 2H Sword
     * Column 2 (1120): Axe, Mace, Warhammer, Battleaxe
     * Column 3 (1121): Chainbody, Platelegs, Plateskirt, Platebody
     * Column 4 (1122): Med Helm, Full Helm, Sq Shield, Kiteshield
     * Column 5 (1123): Dart Tips, Arrowheads, Throwing Knives, Wire/Studs
     */
    private static readonly SMITHING_COMPONENTS: Record<string, { component: number; slot: number }> = {
        // Column 1 - Bladed weapons
        'dagger': { component: 1119, slot: 0 },
        'sword': { component: 1119, slot: 1 },
        'scimitar': { component: 1119, slot: 2 },
        'longsword': { component: 1119, slot: 3 },
        'long sword': { component: 1119, slot: 3 },
        '2h sword': { component: 1119, slot: 4 },
        'two-handed sword': { component: 1119, slot: 4 },
        // Column 2 - Blunt/axe weapons
        'axe': { component: 1120, slot: 0 },
        'mace': { component: 1120, slot: 1 },
        'warhammer': { component: 1120, slot: 2 },
        'war hammer': { component: 1120, slot: 2 },
        'battleaxe': { component: 1120, slot: 3 },
        'battle axe': { component: 1120, slot: 3 },
        // Column 3 - Armour
        'chainbody': { component: 1121, slot: 0 },
        'chain body': { component: 1121, slot: 0 },
        'platelegs': { component: 1121, slot: 1 },
        'plate legs': { component: 1121, slot: 1 },
        'plateskirt': { component: 1121, slot: 2 },
        'plate skirt': { component: 1121, slot: 2 },
        'platebody': { component: 1121, slot: 3 },
        'plate body': { component: 1121, slot: 3 },
        // Column 4 - Helms/shields
        'med helm': { component: 1122, slot: 0 },
        'medium helm': { component: 1122, slot: 0 },
        'full helm': { component: 1122, slot: 1 },
        'sq shield': { component: 1122, slot: 2 },
        'square shield': { component: 1122, slot: 2 },
        'kiteshield': { component: 1122, slot: 3 },
        'kite shield': { component: 1122, slot: 3 },
        // Column 5 - Projectiles/misc
        'dart tips': { component: 1123, slot: 0 },
        'arrowheads': { component: 1123, slot: 1 },
        'arrow tips': { component: 1123, slot: 1 },
        'throwing knives': { component: 1123, slot: 2 },
        'knives': { component: 1123, slot: 2 },
    };

    /**
     * Smith a bar into an item at an anvil.
     *
     * @param product - The item to smith (e.g., 'dagger', 'axe', 'platebody') or component ID
     * @param options - Optional configuration
     * @returns Result with XP gained and item created
     *
     * @example
     * ```ts
     * // Smith a bronze dagger
     * const result = await bot.smithAtAnvil('dagger');
     *
     * // Smith using component ID directly
     * const result = await bot.smithAtAnvil(1119);
     * ```
     */
    async smithAtAnvil(
        product: string | number = 'dagger',
        options: { barPattern?: RegExp; timeout?: number } = {}
    ): Promise<SmithResult> {
        const { barPattern = /bar$/i, timeout = 10000 } = options;

        await this.dismissBlockingUI();

        // Check for hammer
        const hammer = this.sdk.findInventoryItem(/hammer/i);
        if (!hammer) {
            return { success: false, message: 'No hammer in inventory', reason: 'no_hammer' };
        }

        // Check for bars
        const bar = this.sdk.findInventoryItem(barPattern);
        if (!bar) {
            return { success: false, message: 'No bars in inventory', reason: 'no_bars' };
        }

        // Find anvil
        const anvil = this.sdk.findNearbyLoc(/anvil/i);
        if (!anvil) {
            return { success: false, message: 'No anvil nearby', reason: 'no_anvil' };
        }

        // Determine component ID and slot
        let componentId: number;
        let componentSlot: number = 0;
        if (typeof product === 'number') {
            componentId = product;
        } else {
            const key = product.toLowerCase();
            const directMatch = BotActions.SMITHING_COMPONENTS[key];
            if (directMatch) {
                componentId = directMatch.component;
                componentSlot = directMatch.slot;
            } else {
                // Try partial match
                const matchingKey = Object.keys(BotActions.SMITHING_COMPONENTS).find(k =>
                    k.includes(key) || key.includes(k)
                );
                const partialMatch = matchingKey ? BotActions.SMITHING_COMPONENTS[matchingKey] : undefined;
                if (partialMatch) {
                    componentId = partialMatch.component;
                    componentSlot = partialMatch.slot;
                } else {
                    return { success: false, message: `Unknown smithing product: ${product}`, reason: 'level_too_low' };
                }
            }
        }

        const smithingBefore = this.sdk.getSkill('Smithing')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;

        // Use bar on anvil
        const useResult = await this.sdk.sendUseItemOnLoc(bar.slot, anvil.x, anvil.z, anvil.id);
        if (!useResult.success) {
            return { success: false, message: useResult.message, reason: 'no_anvil' };
        }

        // Wait for smithing interface to open
        try {
            await this.sdk.waitForCondition(
                s => s.interface?.isOpen && s.interface.interfaceId === 994,
                5000
            );
            
        } catch {
            return { success: false, message: 'Smithing interface did not open', reason: 'interface_not_opened' };
        }

        // Click the smithing component (uses INV_BUTTON)
        const clickResult = await this.sdk.sendClickComponentWithOption(componentId, 1, componentSlot);
        if (!clickResult.success) {
            return { success: false, message: 'Failed to click smithing option', reason: 'interface_not_opened' };
        }

        // Wait for XP gain or timeout
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const state = this.sdk.getState();
            if (!state) {
                await this.sdk.waitForTicks(1);
                continue;
            }

            // Check for XP gain
            const currentXp = state.skills.find(s => s.name === 'Smithing')?.experience || 0;
            if (currentXp > smithingBefore) {
                // Find the smithed item
                const smithedItem = this.sdk.findInventoryItem(/dagger|axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts|arrowtips|arrowheads|arrow|dart/i);
                return {
                    success: true,
                    message: 'Smithed item successfully',
                    xpGained: currentXp - smithingBefore,
                    itemsSmithed: 1,
                    product: smithedItem || undefined
                };
            }

            // Check for failure messages
            for (const msg of state.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("need a smithing level") || text.includes("level to")) {
                        return { success: false, message: 'Smithing level too low', reason: 'level_too_low' };
                    }
                    if (text.includes("don't have enough")) {
                        return { success: false, message: 'Not enough bars', reason: 'no_bars' };
                    }
                }
            }

            // If interface closed without XP, might need to retry
            if (!state.interface?.isOpen) {
                const finalXp = this.sdk.getSkill('Smithing')?.experience || 0;
                if (finalXp > smithingBefore) {
                    const smithedItem = this.sdk.findInventoryItem(/dagger|axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts|arrowtips|arrowheads|arrow|dart/i);
                    return {
                        success: true,
                        message: 'Smithed item successfully',
                        xpGained: finalXp - smithingBefore,
                        itemsSmithed: 1,
                        product: smithedItem || undefined
                    };
                }
            }

            await this.sdk.waitForTicks(1);
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Smithing')?.experience || 0;
        if (finalXp > smithingBefore) {
            const smithedItem = this.sdk.findInventoryItem(/dagger|axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts|arrowtips|arrowheads|arrow|dart/i);
            return {
                success: true,
                message: 'Smithed item successfully',
                xpGained: finalXp - smithingBefore,
                itemsSmithed: 1,
                product: smithedItem || undefined
            };
        }

        return { success: false, message: 'Smithing timed out', reason: 'timeout' };
    }

    // ============ Porcelain: Generic Interactions ============

    /**
     * Interact with a nearby location object (rock, fishing spot, furnace, etc.).
     * Walks to the target first (handling doors), sends the interaction, then waits
     * for an effect (animation, dialog, interface) or detects failure when the player
     * has been idle for 2 ticks with nothing happening.
     * @param target - NearbyLoc object or name string/regex to find
     * @param option - Option index or name regex to match (default: 1, the first option)
     */
    async interactLoc(
        target: NearbyLoc | string | RegExp,
        option: number | string | RegExp = 1,
    ): Promise<InteractLocResult> {
        await this.dismissBlockingUI();

        const loc = this.helpers.resolveLocation(target, /./);
        if (!loc) {
            return { success: false, message: `Location not found: ${target}`, reason: 'loc_not_found' };
        }

        // Resolve option index
        let opIndex: number;
        if (typeof option === 'number') {
            opIndex = option;
        } else {
            const regex = typeof option === 'string' ? new RegExp(option, 'i') : option;
            const match = loc.optionsWithIndex.find(o => regex.test(o.text));
            if (!match) {
                return { success: false, message: `No matching option on ${loc.name}`, reason: 'no_matching_option' };
            }
            opIndex = match.opIndex;
        }

        // Walk to the location first (handles doors)
        if (loc.distance > 2) {
            const walkResult = await this.walkTo(loc.x, loc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${loc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the location after walking (it may have changed)
        const locPattern = typeof target === 'object' ? new RegExp(loc.name, 'i') : target;
        const locNow = this.helpers.resolveLocation(locPattern, /./);
        if (!locNow) {
            return { success: false, message: `${loc.name} no longer visible`, reason: 'loc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        let lastMoveTick = startTick;
        let lastX = this.sdk.getState()?.player?.x ?? 0;
        let lastZ = this.sdk.getState()?.player?.z ?? 0;

        const result = await this.sdk.sendInteractLoc(locNow.x, locNow.z, locNow.id, opIndex);
        if (!result.success) {
            return { success: false, message: result.message, reason: 'timeout' };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for can't-reach messages
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) return true;
                    }
                }

                // Success indicators
                if (state.dialog.isOpen || state.interface?.isOpen) return true;
                if (state.player && state.player.animId !== -1) return true;

                // Track movement — if player moved, update last move tick
                if (state.player && (state.player.x !== lastX || state.player.z !== lastZ)) {
                    lastX = state.player.x;
                    lastZ = state.player.z;
                    lastMoveTick = state.tick;
                }

                // Player idle for 2+ ticks with nothing happening → give up
                if (state.tick - lastMoveTick >= 2) return true;

                return false;
            }, 30000); // safety net only

            if (this.helpers.checkCantReachMessage(startTick)) {
                return { success: false, message: `Can't reach ${locNow.name}`, reason: 'cant_reach' };
            }

            if (finalState.dialog.isOpen || finalState.interface?.isOpen ||
                (finalState.player && finalState.player.animId !== -1)) {
                return { success: true, message: `Interacted with ${locNow.name}` };
            }

            return { success: false, message: `Nothing happened interacting with ${locNow.name}`, reason: 'timeout' };
        } catch {
            return { success: false, message: `Timed out interacting with ${locNow.name}`, reason: 'timeout' };
        }
    }

    /**
     * Interact with a nearby NPC using a specified option (e.g. "Trade", "Pickpocket", "Fish").
     * Walks to the NPC first (handling doors), sends the interaction, then waits
     * for an effect (animation, dialog, interface) or detects failure when the player
     * has been idle for 2 ticks with nothing happening.
     * @param target - NearbyNpc object or name string/regex to find
     * @param option - Option index or name regex to match (default: 1, the first option)
     */
    async interactNpc(
        target: NearbyNpc | string | RegExp,
        option: number | string | RegExp = 1,
    ): Promise<InteractNpcResult> {
        await this.dismissBlockingUI();

        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        // Resolve option index
        let opIndex: number;
        if (typeof option === 'number') {
            opIndex = option;
        } else {
            const regex = typeof option === 'string' ? new RegExp(option, 'i') : option;
            const match = npc.optionsWithIndex.find(o => regex.test(o.text));
            if (!match) {
                return { success: false, message: `No matching option on ${npc.name}`, reason: 'no_matching_option' };
            }
            opIndex = match.opIndex;
        }

        // Walk to the NPC first (handles doors)
        if (npc.distance > 2) {
            const walkResult = await this.walkTo(npc.x, npc.z, 2);
            if (!walkResult.success) {
                return { success: false, message: `Cannot reach ${npc.name}: ${walkResult.message}`, reason: 'cant_reach' };
            }
        }

        // Re-find the NPC after walking (it may have moved)
        const npcPattern = typeof target === 'object' ? new RegExp(npc.name, 'i') : target;
        const npcNow = this.helpers.resolveNpc(npcPattern);
        if (!npcNow) {
            return { success: false, message: `${npc.name} no longer visible`, reason: 'npc_not_found' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        let lastMoveTick = startTick;
        let lastX = this.sdk.getState()?.player?.x ?? 0;
        let lastZ = this.sdk.getState()?.player?.z ?? 0;

        const result = await this.sdk.sendInteractNpc(npcNow.index, opIndex);
        if (!result.success) {
            return { success: false, message: result.message, reason: 'timeout' };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for can't-reach messages
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) return true;
                    }
                }

                // Success indicators
                if (state.dialog.isOpen || state.interface?.isOpen) return true;
                if (state.player && state.player.animId !== -1) return true;

                // Track movement — if player moved, update last move tick
                if (state.player && (state.player.x !== lastX || state.player.z !== lastZ)) {
                    lastX = state.player.x;
                    lastZ = state.player.z;
                    lastMoveTick = state.tick;
                }

                // Player idle for 2+ ticks with nothing happening → give up
                if (state.tick - lastMoveTick >= 2) return true;

                return false;
            }, 30000); // safety net only

            if (this.helpers.checkCantReachMessage(startTick)) {
                return { success: false, message: `Can't reach ${npcNow.name}`, reason: 'cant_reach' };
            }

            if (finalState.dialog.isOpen || finalState.interface?.isOpen ||
                (finalState.player && finalState.player.animId !== -1)) {
                return { success: true, message: `Interacted with ${npcNow.name}` };
            }

            return { success: false, message: `Nothing happened interacting with ${npcNow.name}`, reason: 'timeout' };
        } catch {
            return { success: false, message: `Timed out interacting with ${npcNow.name}`, reason: 'timeout' };
        }
    }

    // ============ Porcelain: Thieving ============

    /** Pickpocket an NPC. Handles door retrying if path is blocked. */
    async pickpocketNpc(target: NearbyNpc | string | RegExp): Promise<PickpocketResult> {
        return this.helpers.withDoorRetry(
            () => this._pickpocketNpcOnce(target),
            (r) => r.reason === 'cant_reach' || r.reason === 'timeout'
        );
    }

    private async _pickpocketNpcOnce(target: NearbyNpc | string | RegExp): Promise<PickpocketResult> {
        const npc = this.helpers.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        const pickOpt = npc.optionsWithIndex.find(o => /pickpocket/i.test(o.text));
        if (!pickOpt) {
            return { success: false, message: `No pickpocket option on ${npc.name}`, reason: 'no_pickpocket_option' };
        }

        const thievingBefore = this.sdk.getSkill('Thieving')?.experience || 0;
        const startTick = this.sdk.getState()?.tick || 0;

        const result = await this.sdk.sendInteractNpc(npc.index, pickOpt.opIndex);
        if (!result.success) {
            return { success: false, message: result.message, reason: 'timeout' };
        }

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for XP gain
                const thievingNow = state.skills.find(s => s.name === 'Thieving')?.experience || 0;
                if (thievingNow > thievingBefore) return true;

                // Check game messages for stun/catch or can't reach
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes('stunned') || text.includes('caught') || text.includes('stun')) return true;
                        if (text.includes("can't reach") || text.includes('cannot reach')) return true;
                    }
                }

                return false;
            }, 10000);

            // Check what happened
            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes('cannot reach')) {
                        return { success: false, message: `Can't reach ${npc.name}`, reason: 'cant_reach' };
                    }
                    if (text.includes('stunned') || text.includes('caught') || text.includes('stun')) {
                        return { success: false, message: `Stunned while pickpocketing ${npc.name}`, reason: 'stunned' };
                    }
                }
            }

            const thievingAfter = this.sdk.getSkill('Thieving')?.experience || 0;
            const xpGained = thievingAfter - thievingBefore;
            if (xpGained > 0) {
                return { success: true, message: `Pickpocketed ${npc.name}`, xpGained };
            }

            return { success: false, message: `Pickpocket failed on ${npc.name}`, reason: 'timeout' };
        } catch {
            return { success: false, message: `Timed out pickpocketing ${npc.name}`, reason: 'timeout' };
        }
    }

    // ============ Porcelain: Prayer Actions ============

    /**
     * Activate a prayer by name or index.
     * Checks preconditions (level, prayer points, not already active) before toggling.
     */
    async activatePrayer(prayer: PrayerName | number): Promise<PrayerResult> {
        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index > 14) {
            return { success: false, message: `Invalid prayer: ${prayer}`, reason: 'invalid_prayer' };
        }

        const prayerName = PRAYER_NAMES[index];
        const prayerState = this.sdk.getPrayerState();
        if (!prayerState) {
            return { success: false, message: 'No prayer state available' };
        }

        // Check if already active
        if (prayerState.activePrayers[index]) {
            return { success: true, message: `${prayerName} is already active`, reason: 'already_active' };
        }

        // Check prayer points
        if (prayerState.prayerPoints <= 0) {
            return { success: false, message: 'No prayer points remaining', reason: 'no_prayer_points' };
        }

        // Check prayer level
        const requiredLevel = PRAYER_LEVELS[index] ?? 1;
        if (prayerState.prayerLevel < requiredLevel) {
            return { success: false, message: `Need prayer level ${requiredLevel} for ${prayerName} (have ${prayerState.prayerLevel})`, reason: 'level_too_low' };
        }

        // Send toggle
        const result = await this.sdk.sendTogglePrayer(index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for prayer to become active
        try {
            await this.sdk.waitForCondition(state => {
                return state.prayers.activePrayers[index] === true;
            }, 5000);
            return { success: true, message: `Activated ${prayerName}` };
        } catch {
            return { success: false, message: `Timeout waiting for ${prayerName} to activate`, reason: 'timeout' };
        }
    }

    /**
     * Deactivate a prayer by name or index.
     * Checks if the prayer is actually active before toggling.
     */
    async deactivatePrayer(prayer: PrayerName | number): Promise<PrayerResult> {
        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index > 14) {
            return { success: false, message: `Invalid prayer: ${prayer}`, reason: 'invalid_prayer' };
        }

        const prayerName = PRAYER_NAMES[index];
        const prayerState = this.sdk.getPrayerState();
        if (!prayerState) {
            return { success: false, message: 'No prayer state available' };
        }

        // Check if already inactive
        if (!prayerState.activePrayers[index]) {
            return { success: true, message: `${prayerName} is already inactive`, reason: 'already_inactive' };
        }

        // Send toggle
        const result = await this.sdk.sendTogglePrayer(index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for prayer to become inactive
        try {
            await this.sdk.waitForCondition(state => {
                return state.prayers.activePrayers[index] === false;
            }, 5000);
            return { success: true, message: `Deactivated ${prayerName}` };
        } catch {
            return { success: false, message: `Timeout waiting for ${prayerName} to deactivate`, reason: 'timeout' };
        }
    }

    /**
     * Deactivate all currently active prayers.
     * Toggles each active prayer off one by one.
     */
    async deactivateAllPrayers(): Promise<PrayerResult> {
        const prayerState = this.sdk.getPrayerState();
        if (!prayerState) {
            return { success: false, message: 'No prayer state available' };
        }

        const activePrayers = prayerState.activePrayers
            .map((active, i) => active ? i : -1)
            .filter(i => i !== -1);

        if (activePrayers.length === 0) {
            return { success: true, message: 'No prayers are active' };
        }

        for (const index of activePrayers) {
            const result = await this.deactivatePrayer(index);
            if (!result.success && result.reason !== 'already_inactive') {
                return { success: false, message: `Failed to deactivate ${PRAYER_NAMES[index]}: ${result.message}` };
            }
        }

        return { success: true, message: `Deactivated ${activePrayers.length} prayer(s)` };
    }
}

// Re-export for convenience
export { BotSDK } from './index';
export * from './types';
