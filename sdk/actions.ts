// Bot SDK - Porcelain Layer
// High-level domain-aware methods that wrap plumbing with game knowledge
// Actions resolve when the EFFECT is complete (not just acknowledged)

import { BotSDK } from './index';
import type {
    BotWorldState,
    ActionResult,
    SkillState,
    InventoryItem,
    NearbyNpc,
    NearbyLoc,
    GroundItem,
    DialogState,
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
    BankWithdrawResult
} from './types';

export class BotActions {
    constructor(private sdk: BotSDK) {}

    // ============ Private Helpers ============

    private async waitForMovementComplete(
        targetX: number,
        targetZ: number,
        tolerance: number = 3
    ): Promise<{ arrived: boolean; stoppedMoving: boolean; x: number; z: number }> {
        const POLL_INTERVAL = 150;
        const STUCK_THRESHOLD = 600;
        const MIN_TIMEOUT = 2000;
        const TILES_PER_SECOND = 4.5;

        const startState = this.sdk.getState();
        if (!startState?.player) {
            return { arrived: false, stoppedMoving: true, x: 0, z: 0 };
        }

        const startX = startState.player.worldX;
        const startZ = startState.player.worldZ;

        const distance = Math.sqrt(
            Math.pow(targetX - startX, 2) + Math.pow(targetZ - startZ, 2)
        );
        const expectedTime = (distance / TILES_PER_SECOND) * 1000;
        const maxTimeout = Math.max(MIN_TIMEOUT, expectedTime * 1.5);

        let lastX = startX;
        let lastZ = startZ;
        let lastMoveTime = Date.now();
        const startTime = Date.now();

        while (Date.now() - startTime < maxTimeout) {
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

            const state = this.sdk.getState();
            if (!state?.player) {
                return { arrived: false, stoppedMoving: true, x: lastX, z: lastZ };
            }

            const currentX = state.player.worldX;
            const currentZ = state.player.worldZ;

            const distToTarget = Math.sqrt(
                Math.pow(targetX - currentX, 2) + Math.pow(targetZ - currentZ, 2)
            );
            if (distToTarget <= tolerance) {
                return { arrived: true, stoppedMoving: false, x: currentX, z: currentZ };
            }

            if (currentX !== lastX || currentZ !== lastZ) {
                lastMoveTime = Date.now();
                lastX = currentX;
                lastZ = currentZ;
            } else {
                if (Date.now() - lastMoveTime > STUCK_THRESHOLD) {
                    return { arrived: false, stoppedMoving: true, x: currentX, z: currentZ };
                }
            }
        }

        const finalState = this.sdk.getState();
        const finalX = finalState?.player?.worldX ?? lastX;
        const finalZ = finalState?.player?.worldZ ?? lastZ;
        const finalDist = Math.sqrt(
            Math.pow(targetX - finalX, 2) + Math.pow(targetZ - finalZ, 2)
        );

        return {
            arrived: finalDist <= tolerance,
            stoppedMoving: true,
            x: finalX,
            z: finalZ
        };
    }

    // ============ Porcelain: UI Helpers ============

    /**
     * Skip tutorial by navigating dialogs and talking to tutorial NPCs.
     * This is a porcelain method - domain logic that was moved from bot client.
     */
    async skipTutorial(): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.inGame) {
            return { success: false, message: 'Not in game' };
        }

        // If dialog open, navigate it
        if (state.dialog.isOpen) {
            if (state.dialog.isWaiting) {
                return { success: false, message: 'Waiting for dialog' };
            }

            const options = state.dialog.options;
            if (options.length > 0) {
                // Look for affirmative option
                const yesOption = options.find(o =>
                    o.text.toLowerCase().includes('yes')
                );
                const idx = yesOption ? yesOption.index : 0;
                await this.sdk.sendClickDialog(idx);
                return { success: true, message: `Selected option ${idx}` };
            }

            // Click continue
            await this.sdk.sendClickDialog(0);
            return { success: true, message: 'Clicked continue' };
        }

        // Find tutorial NPC
        const guide = this.sdk.findNearbyNpc(/runescape guide|guide|tutorial/i);
        if (guide) {
            await this.sdk.sendInteractNpc(guide.index, 0); // Talk
            return { success: true, message: `Talking to ${guide.name}` };
        }

        return { success: false, message: 'No tutorial NPC found' };
    }

    async dismissBlockingUI(): Promise<void> {
        const maxAttempts = 10;
        for (let i = 0; i < maxAttempts; i++) {
            const state = this.sdk.getState();
            if (!state) break;

            if (state.dialog.isOpen) {
                console.log(`  [dismissBlockingUI] Dismissing dialog (attempt ${i + 1})`);
                await this.sdk.sendClickDialog(0);
                await this.sdk.waitForStateChange(2000).catch(() => {});
                continue;
            }

            break;
        }
    }

    // ============ Porcelain: Smart Actions ============

    async openDoor(target?: NearbyLoc | string | RegExp): Promise<OpenDoorResult> {
        const door = await this.resolveLocation(target, /door|gate/i);
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

            // Re-scan after walking
            const locsNow = await this.sdk.scanNearbyLocs();
            const doorsNow = locsNow.filter(l =>
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

            const finalState = this.sdk.getState();

            for (const msg of finalState?.gameMessages ?? []) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return { success: false, message: `Cannot reach ${door.name} - still blocked`, reason: 'open_failed', door };
                    }
                }
            }

            const doorAfter = finalState?.nearbyLocs.find(l =>
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

    async chopTree(target?: NearbyLoc | string | RegExp): Promise<ChopTreeResult> {
        await this.dismissBlockingUI();

        const tree = await this.resolveLocation(target, /^tree$/i);
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

    async burnLogs(logsTarget?: InventoryItem | string | RegExp): Promise<BurnLogsResult> {
        await this.dismissBlockingUI();

        const tinderbox = this.sdk.findInventoryItem(/tinderbox/i);
        if (!tinderbox) {
            return { success: false, xpGained: 0, message: 'No tinderbox in inventory' };
        }

        const logs = this.resolveInventoryItem(logsTarget, /logs/i);
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

    async pickupItem(target: GroundItem | string | RegExp): Promise<PickupResult> {
        const item = await this.resolveGroundItem(target);
        if (!item) {
            return { success: false, message: 'Item not found on ground', reason: 'item_not_found' };
        }

        const invCountBefore = this.sdk.getInventory().length;
        const startTick = this.sdk.getState()?.tick || 0;
        const result = await this.sdk.sendPickup(item.x, item.z, item.id);

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
                        if (text.includes("inventory") && text.includes("full")) {
                            return true;
                        }
                    }
                }
                return state.inventory.length > invCountBefore;
            }, 10000);

            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return { success: false, message: `Cannot reach ${item.name} at (${item.x}, ${item.z}) - path blocked`, reason: 'cant_reach' };
                    }
                    if (text.includes("inventory") && text.includes("full")) {
                        return { success: false, message: 'Inventory is full', reason: 'inventory_full' };
                    }
                }
            }

            const pickedUp = this.sdk.getInventory().find(i => i.id === item.id);
            return { success: true, item: pickedUp, message: `Picked up ${item.name}` };
        } catch {
            return { success: false, message: 'Timed out waiting for pickup', reason: 'timeout' };
        }
    }

    async talkTo(target: NearbyNpc | string | RegExp): Promise<TalkResult> {
        const npc = this.resolveNpc(target);
        if (!npc) {
            return { success: false, message: 'NPC not found' };
        }

        const result = await this.sdk.sendTalkToNpc(npc.index);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            const state = await this.sdk.waitForCondition(s => s.dialog.isOpen, 10000);
            return { success: true, dialog: state.dialog, message: `Talking to ${npc.name}` };
        } catch {
            return { success: false, message: 'Timed out waiting for dialog' };
        }
    }

    async walkTo(x: number, z: number, tolerance: number = 3): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.player) return { success: false, message: 'No player state' };

        const distanceTo = (p: { worldX: number; worldZ: number } | undefined) =>
            p ? Math.sqrt(Math.pow(x - p.worldX, 2) + Math.pow(z - p.worldZ, 2)) : Infinity;

        if (distanceTo(state.player) <= tolerance) {
            return { success: true, message: 'Already at destination' };
        }

        // With 512x512 search grid, paths can cover ~256 tiles per query
        // For longer walks, we re-query after completing each path segment
        const MAX_QUERIES = 25;
        let stuckCount = 0;
        let lastQueryX = state.player.worldX;
        let lastQueryZ = state.player.worldZ;

        for (let query = 0; query < MAX_QUERIES; query++) {
            const current = this.sdk.getState()?.player;
            if (!current) return { success: false, message: 'Lost player state' };

            const distToGoal = distanceTo(current);
            if (distToGoal <= tolerance) {
                return { success: true, message: `Arrived at (${current.worldX}, ${current.worldZ})` };
            }

            const path = await this.sdk.sendFindPath(x, z, 500);
            if (!path.success || !path.waypoints?.length) {
                // No path - might be blocked, try one more query after a moment
                await new Promise(r => setTimeout(r, 500));
                const retryPath = await this.sdk.sendFindPath(x, z, 500);
                if (!retryPath.success || !retryPath.waypoints?.length) {
                    return { success: false, message: `No path to (${x}, ${z}) from (${current.worldX}, ${current.worldZ})` };
                }
            }

            const waypoints = path.waypoints!;

            // Walk the ENTIRE path before re-querying to avoid oscillation
            // Only break early if we get stuck
            let lastMoveX = current.worldX;
            let lastMoveZ = current.worldZ;
            let noProgressCount = 0;

            for (let i = 0; i < waypoints.length; i++) {
                const wp = waypoints[i]!;
                await this.sdk.sendWalk(wp.x, wp.z, true);

                // Wait for movement, but don't wait too long per waypoint
                const moveResult = await this.waitForMovementComplete(wp.x, wp.z, 2);

                const pos = this.sdk.getState()?.player;
                if (!pos) return { success: false, message: 'Lost player state' };

                // Check if we arrived at final destination
                if (distanceTo(pos) <= tolerance) {
                    return { success: true, message: 'Arrived' };
                }

                // Check if we're making progress along the path
                const moved = Math.sqrt(
                    Math.pow(pos.worldX - lastMoveX, 2) + Math.pow(pos.worldZ - lastMoveZ, 2)
                );

                if (moved < 1 && moveResult.stoppedMoving) {
                    noProgressCount++;
                    if (noProgressCount >= 3) {
                        // Stuck on this path, break to re-query
                        break;
                    }
                } else {
                    noProgressCount = 0;
                    lastMoveX = pos.worldX;
                    lastMoveZ = pos.worldZ;
                }
            }

            // Check progress since last path query
            const after = this.sdk.getState()?.player;
            if (!after) return { success: false, message: 'Lost player state' };

            const newDist = distanceTo(after);
            if (newDist <= tolerance) {
                return { success: true, message: `Arrived at (${after.worldX}, ${after.worldZ})` };
            }

            // Calculate actual distance moved since last query
            const distMoved = Math.sqrt(
                Math.pow(after.worldX - lastQueryX, 2) + Math.pow(after.worldZ - lastQueryZ, 2)
            );

            // Update for next iteration
            lastQueryX = after.worldX;
            lastQueryZ = after.worldZ;

            // Stuck detection: if we moved less than 5 tiles total, increment counter
            if (distMoved < 5) {
                stuckCount++;
                if (stuckCount >= 3) {
                    return { success: false, message: `Stuck at (${after.worldX}, ${after.worldZ})` };
                }
            } else {
                stuckCount = 0; // Reset if we made good progress
            }
        }

        const final = this.sdk.getState()?.player;
        return { success: false, message: `Could not reach (${x}, ${z}) - stopped at (${final?.worldX}, ${final?.worldZ})` };
    }

    // ============ Porcelain: Shop Actions ============

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
            await new Promise(resolve => setTimeout(resolve, 500));
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

    async openShop(target: NearbyNpc | string | RegExp = /shop\s*keeper/i): Promise<ActionResult> {
        const npc = this.resolveNpc(target);
        if (!npc) {
            return { success: false, message: 'Shopkeeper not found' };
        }

        const tradeOpt = npc.optionsWithIndex.find(o => /trade/i.test(o.text));
        if (!tradeOpt) {
            return { success: false, message: 'No trade option on NPC' };
        }

        const result = await this.sdk.sendInteractNpc(npc.index, tradeOpt.opIndex);
        if (!result.success) {
            return result;
        }

        try {
            await this.sdk.waitForCondition(state => state.shop.isOpen, 10000);
            return { success: true, message: `Opened shop: ${this.sdk.getState()?.shop.title}` };
        } catch {
            return { success: false, message: 'Timed out waiting for shop to open' };
        }
    }

    async buyFromShop(target: ShopItem | string | RegExp, amount: number = 1): Promise<ShopResult> {
        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open' };
        }

        const shopItem = this.resolveShopItem(target, shop.shopItems);
        if (!shopItem) {
            return { success: false, message: `Item not found in shop: ${target}` };
        }

        const invBefore = this.sdk.getInventory();
        const hadItemBefore = invBefore.find(i => i.id === shopItem.id);
        const countBefore = hadItemBefore?.count ?? 0;

        const result = await this.sdk.sendShopBuy(shopItem.slot, amount);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            await this.sdk.waitForCondition(state => {
                const item = state.inventory.find(i => i.id === shopItem.id);
                if (!item) return false;
                return item.count > countBefore;
            }, 5000);

            const boughtItem = this.sdk.getInventory().find(i => i.id === shopItem.id);
            return { success: true, item: boughtItem, message: `Bought ${shopItem.name} x${amount}` };
        } catch {
            return { success: false, message: `Failed to buy ${shopItem.name} (no coins or out of stock?)` };
        }
    }

    async sellToShop(target: InventoryItem | ShopItem | string | RegExp, amount: SellAmount = 1): Promise<ShopSellResult> {
        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open' };
        }

        const sellItem = this.resolveShopItem(target, shop.playerItems);
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

    async openBank(timeout: number = 10000): Promise<OpenBankResult> {
        const state = this.sdk.getState();
        if (state?.interface?.isOpen) {
            return { success: true, message: 'Bank already open' };
        }

        await this.dismissBlockingUI();

        const banker = this.sdk.findNearbyNpc(/banker/i);
        const bankBooth = await this.sdk.scanFindNearbyLoc(/bank booth|bank chest/i);

        let interactSuccess = false;

        if (banker) {
            const bankOpt = banker.optionsWithIndex.find(o => /^bank$/i.test(o.text));
            if (bankOpt) {
                await this.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
                interactSuccess = true;
            }
        }

        if (!interactSuccess && bankBooth) {
            const bankOpt = bankBooth.optionsWithIndex.find(o => /^bank$/i.test(o.text)) ||
                           bankBooth.optionsWithIndex.find(o => /use/i.test(o.text));
            if (bankOpt) {
                await this.sdk.sendInteractLoc(bankBooth.x, bankBooth.z, bankBooth.id, bankOpt.opIndex);
                interactSuccess = true;
            }
        }

        if (!interactSuccess) {
            return { success: false, message: 'No banker NPC or bank booth found nearby', reason: 'no_bank_found' };
        }

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                await this.sdk.waitForCondition(s =>
                    s.interface?.isOpen === true || s.dialog?.isOpen === true,
                    Math.min(2000, timeout - (Date.now() - startTime))
                );

                const currentState = this.sdk.getState();

                if (currentState?.interface?.isOpen) {
                    return { success: true, message: `Bank opened (interfaceId: ${currentState.interface.interfaceId})` };
                }

                if (currentState?.dialog?.isOpen) {
                    const opt = currentState.dialog.options?.[0];
                    await this.sdk.sendClickDialog(opt?.index ?? 0);
                    await new Promise(r => setTimeout(r, 300));
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
            await new Promise(resolve => setTimeout(resolve, 500));

            const finalState = this.sdk.getState();
            if (!finalState?.interface?.isOpen) {
                return { success: true, message: 'Bank closed (second attempt)' };
            }

            return { success: false, message: `Bank close timeout - interface.isOpen=${finalState?.interface?.isOpen}` };
        }
    }

    async depositItem(target: InventoryItem | string | RegExp, amount: number = -1): Promise<BankDepositResult> {
        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'Bank is not open', reason: 'bank_not_open' };
        }

        const item = this.resolveInventoryItem(target, /./);
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

    async withdrawItem(bankSlot: number, amount: number = 1): Promise<BankWithdrawResult> {
        const state = this.sdk.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'Bank is not open', reason: 'bank_not_open' };
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

    async equipItem(target: InventoryItem | string | RegExp): Promise<EquipResult> {
        const item = this.resolveInventoryItem(target, /./);
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

    getEquipment(): InventoryItem[] {
        return this.sdk.getEquipment();
    }

    findEquippedItem(pattern: string | RegExp): InventoryItem | null {
        return this.sdk.findEquipmentItem(pattern);
    }

    async eatFood(target: InventoryItem | string | RegExp): Promise<EatResult> {
        const food = this.resolveInventoryItem(target, /./);
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

    async attackNpc(target: NearbyNpc | string | RegExp, timeout: number = 5000): Promise<AttackResult> {
        const npc = this.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        const attackOpt = npc.optionsWithIndex.find(o => /attack/i.test(o.text));
        if (!attackOpt) {
            return { success: false, message: `No attack option on ${npc.name}`, reason: 'no_attack_option' };
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
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true;
                        }
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

            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return { success: false, message: `Cannot reach ${npc.name} - obstacle in the way`, reason: 'out_of_reach' };
                    }
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

    async castSpellOnNpc(target: NearbyNpc | string | RegExp, spellComponent: number, timeout: number = 3000): Promise<CastSpellResult> {
        const npc = this.resolveNpc(target);
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

            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return { success: false, message: `Cannot reach ${npc.name} - obstacle in the way`, reason: 'out_of_reach' };
                    }
                    if (text.includes("do not have enough") || text.includes("don't have enough")) {
                        return { success: false, message: `Not enough runes to cast spell`, reason: 'no_runes' };
                    }
                }
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

    async waitForSkillLevel(skillName: string, targetLevel: number, timeout: number = 60000): Promise<SkillState> {
        const state = await this.sdk.waitForCondition(s => {
            const skill = s.skills.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
            return skill !== undefined && skill.baseLevel >= targetLevel;
        }, timeout);

        return state.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())!;
    }

    async waitForInventoryItem(pattern: string | RegExp, timeout: number = 30000): Promise<InventoryItem> {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

        const state = await this.sdk.waitForCondition(s =>
            s.inventory.some(i => regex.test(i.name)),
            timeout
        );

        return state.inventory.find(i => regex.test(i.name))!;
    }

    async waitForDialogClose(timeout: number = 30000): Promise<void> {
        await this.sdk.waitForCondition(s => !s.dialog.isOpen, timeout);
    }

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
            await new Promise(r => setTimeout(r, 600));
        }
    }

    // ============ Crafting & Fletching ============

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
                await new Promise(r => setTimeout(r, 300));
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
                                await new Promise(r => setTimeout(r, 300));
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
                        await new Promise(r => setTimeout(r, 300));
                        continue;
                    }
                }

                // If we already clicked or don't have enough options, click continue/first
                if (state.dialog.options.length > 0 && state.dialog.options[0]) {
                    await this.sdk.sendClickDialog(state.dialog.options[0].index);
                } else {
                    await this.sdk.sendClickDialog(0);
                }
                await new Promise(r => setTimeout(r, 300));
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

            await new Promise(r => setTimeout(r, 200));
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
                        await new Promise(r => setTimeout(r, 300));
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
                await new Promise(r => setTimeout(r, 300));
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
                await new Promise(r => setTimeout(r, 300));
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

            await new Promise(r => setTimeout(r, 200));
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
     * Smithing interface component IDs for bronze items.
     * The smithing interface (994) uses these component IDs for each item type.
     */
    private static readonly SMITHING_COMPONENTS: Record<string, number> = {
        'dagger': 1119,
        'axe': 1120,
        'mace': 1121,
        'med helm': 1122,
        'medium helm': 1122,
        'bolts': 1123,      // Makes 10
        'sword': 1124,
        'scimitar': 1125,
        'longsword': 1126,
        'long sword': 1126,
        'full helm': 1127,
        'throwing knives': 1128,
        'knives': 1128,
        'sq shield': 1129,
        'square shield': 1129,
        'warhammer': 1130,
        'war hammer': 1130,
        'battleaxe': 1131,
        'battle axe': 1131,
        'chainbody': 1132,
        'chain body': 1132,
        'kiteshield': 1133,
        'kite shield': 1133,
        'claws': 1134,
        '2h sword': 1135,
        'two-handed sword': 1135,
        'plateskirt': 1136,
        'plate skirt': 1136,
        'platelegs': 1137,
        'plate legs': 1137,
        'platebody': 1138,
        'plate body': 1138,
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
        const anvil = await this.sdk.scanFindNearbyLoc(/anvil/i);
        if (!anvil) {
            return { success: false, message: 'No anvil nearby', reason: 'no_anvil' };
        }

        // Determine component ID
        let componentId: number;
        if (typeof product === 'number') {
            componentId = product;
        } else {
            const key = product.toLowerCase();
            const directMatch = BotActions.SMITHING_COMPONENTS[key];
            if (directMatch) {
                componentId = directMatch;
            } else {
                // Try partial match
                const matchingKey = Object.keys(BotActions.SMITHING_COMPONENTS).find(k =>
                    k.includes(key) || key.includes(k)
                );
                const partialMatch = matchingKey ? BotActions.SMITHING_COMPONENTS[matchingKey] : undefined;
                if (partialMatch) {
                    componentId = partialMatch;
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
        const clickResult = await this.sdk.sendClickComponentWithOption(componentId, 1);
        if (!clickResult.success) {
            return { success: false, message: 'Failed to click smithing option', reason: 'interface_not_opened' };
        }

        // Wait for XP gain or timeout
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const state = this.sdk.getState();
            if (!state) {
                await new Promise(r => setTimeout(r, 200));
                continue;
            }

            // Check for XP gain
            const currentXp = state.skills.find(s => s.name === 'Smithing')?.experience || 0;
            if (currentXp > smithingBefore) {
                // Find the smithed item
                const smithedItem = this.sdk.findInventoryItem(/dagger|axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts/i);
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
                    const smithedItem = this.sdk.findInventoryItem(/dagger|axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts/i);
                    return {
                        success: true,
                        message: 'Smithed item successfully',
                        xpGained: finalXp - smithingBefore,
                        itemsSmithed: 1,
                        product: smithedItem || undefined
                    };
                }
            }

            await new Promise(r => setTimeout(r, 200));
        }

        // Final XP check
        const finalXp = this.sdk.getSkill('Smithing')?.experience || 0;
        if (finalXp > smithingBefore) {
            const smithedItem = this.sdk.findInventoryItem(/dagger|axe|mace|helm|sword|shield|body|legs|skirt|claws|knives|bolts/i);
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

    // ============ Resolution Helpers ============

    /**
     * Resolve a location target by scanning if needed.
     * Now async because location scanning is on-demand.
     */
    private async resolveLocation(
        target: NearbyLoc | string | RegExp | undefined,
        defaultPattern: RegExp
    ): Promise<NearbyLoc | null> {
        if (!target) {
            return this.sdk.scanFindNearbyLoc(defaultPattern);
        }
        if (typeof target === 'object' && 'x' in target) {
            return target;
        }
        return this.sdk.scanFindNearbyLoc(target);
    }

    private resolveInventoryItem(
        target: InventoryItem | string | RegExp | undefined,
        defaultPattern: RegExp
    ): InventoryItem | null {
        if (!target) {
            return this.sdk.findInventoryItem(defaultPattern);
        }
        if (typeof target === 'object' && 'slot' in target) {
            return target;
        }
        return this.sdk.findInventoryItem(target);
    }

    /**
     * Resolve a ground item target by scanning if needed.
     * Now async because ground item scanning is on-demand.
     */
    private async resolveGroundItem(target: GroundItem | string | RegExp): Promise<GroundItem | null> {
        if (typeof target === 'object' && 'x' in target) {
            return target;
        }
        return this.sdk.scanFindGroundItem(target);
    }

    private resolveNpc(target: NearbyNpc | string | RegExp): NearbyNpc | null {
        if (typeof target === 'object' && 'index' in target) {
            return target;
        }
        return this.sdk.findNearbyNpc(target);
    }

    private resolveShopItem(
        target: ShopItem | InventoryItem | string | RegExp,
        items: ShopItem[]
    ): ShopItem | null {
        if (typeof target === 'object' && 'id' in target && 'name' in target) {
            return items.find(i => i.id === target.id) ?? null;
        }
        const regex = typeof target === 'string' ? new RegExp(target, 'i') : target;
        return items.find(i => regex.test(i.name)) ?? null;
    }
}

// Re-export for convenience
export { BotSDK } from './index';
export * from './types';
