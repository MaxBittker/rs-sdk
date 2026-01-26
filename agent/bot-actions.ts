// Bot SDK - Porcelain Layer
// High-level domain-aware methods that wrap plumbing with game knowledge
// Actions resolve when the EFFECT is complete (not just acknowledged)
// This layer evolves through testing as we learn domain edge cases

import { BotSDK } from './sdk';
import type {
    BotWorldState,
    ActionResult,
    SkillState,
    InventoryItem,
    NearbyNpc,
    NearbyLoc,
    GroundItem,
    DialogState,
    ShopItem
} from './types';

export interface ChopTreeResult {
    success: boolean;
    logs?: InventoryItem;
    message: string;
}

export interface BurnLogsResult {
    success: boolean;
    xpGained: number;
    message: string;
}

export interface PickupResult {
    success: boolean;
    item?: InventoryItem;
    message: string;
    reason?: 'item_not_found' | 'cant_reach' | 'inventory_full' | 'timeout';
}

export interface TalkResult {
    success: boolean;
    dialog?: DialogState;
    message: string;
}

export interface ShopResult {
    success: boolean;
    item?: InventoryItem;
    message: string;
}

export interface ShopSellResult {
    success: boolean;
    message: string;
    amountSold?: number;
    rejected?: boolean;  // True if shop refused to buy this item
}

// Valid sell amounts - maps to shop interface buttons
export type SellAmount = 1 | 5 | 10 | 'all';

export interface EquipResult {
    success: boolean;
    message: string;
}

export interface UnequipResult {
    success: boolean;
    message: string;
    item?: InventoryItem;  // The unequipped item now in inventory
}

export interface EatResult {
    success: boolean;
    hpGained: number;
    message: string;
}

export interface AttackResult {
    success: boolean;
    message: string;
    reason?: 'npc_not_found' | 'no_attack_option' | 'out_of_reach' | 'already_in_combat' | 'timeout';
}

export interface OpenDoorResult {
    success: boolean;
    message: string;
    reason?: 'door_not_found' | 'no_open_option' | 'already_open' | 'walk_failed' | 'open_failed' | 'timeout';
    door?: NearbyLoc;
}

export interface FletchResult {
    success: boolean;
    message: string;
    xpGained?: number;
    product?: InventoryItem;
}

export class BotActions {
    constructor(private sdk: BotSDK) {}

    // ============ Private Helpers ============

    /**
     * Intelligently waits for movement to complete.
     * Instead of a fixed timeout, this:
     * 1. Calculates expected time based on distance
     * 2. Detects when player stops moving (stuck detection)
     * 3. Returns early when arrived OR stopped moving
     *
     * @param targetX - Target X coordinate
     * @param targetZ - Target Z coordinate
     * @param tolerance - How close is "arrived" (default 3 tiles)
     * @returns Object with arrived status and final position
     */
    private async waitForMovementComplete(
        targetX: number,
        targetZ: number,
        tolerance: number = 3
    ): Promise<{ arrived: boolean; stoppedMoving: boolean; x: number; z: number }> {
        const POLL_INTERVAL = 150;        // Check position every 150ms
        const STUCK_THRESHOLD = 600;      // Consider stuck if no movement for 600ms
        const MIN_TIMEOUT = 2000;         // Minimum wait time
        const TILES_PER_SECOND = 4.5;     // Conservative running speed estimate

        const startState = this.sdk.getState();
        if (!startState?.player) {
            return { arrived: false, stoppedMoving: true, x: 0, z: 0 };
        }

        const startX = startState.player.worldX;
        const startZ = startState.player.worldZ;

        // Calculate distance-based timeout
        const distance = Math.sqrt(
            Math.pow(targetX - startX, 2) + Math.pow(targetZ - startZ, 2)
        );
        const expectedTime = (distance / TILES_PER_SECOND) * 1000;
        const maxTimeout = Math.max(MIN_TIMEOUT, expectedTime * 1.5); // 50% buffer

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

            // Check if arrived
            const distToTarget = Math.sqrt(
                Math.pow(targetX - currentX, 2) + Math.pow(targetZ - currentZ, 2)
            );
            if (distToTarget <= tolerance) {
                return { arrived: true, stoppedMoving: false, x: currentX, z: currentZ };
            }

            // Check if moved since last poll
            if (currentX !== lastX || currentZ !== lastZ) {
                lastMoveTime = Date.now();
                lastX = currentX;
                lastZ = currentZ;
            } else {
                // No movement - check if stuck
                if (Date.now() - lastMoveTime > STUCK_THRESHOLD) {
                    return { arrived: false, stoppedMoving: true, x: currentX, z: currentZ };
                }
            }
        }

        // Timeout reached
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
     * Dismisses any blocking UI (level-up dialogs, modals, etc.)
     * Many actions can't proceed while dialogs are open, so this
     * should be called before starting actions.
     */
    async dismissBlockingUI(): Promise<void> {
        const maxAttempts = 10;
        for (let i = 0; i < maxAttempts; i++) {
            const state = this.sdk.getState();
            if (!state) break;

            // Check for open dialog (click to continue)
            if (state.dialog.isOpen) {
                console.log(`  [dismissBlockingUI] Dismissing dialog (attempt ${i + 1})`);
                await this.sdk.sendClickDialog(0);
                await this.sdk.waitForStateChange(2000).catch(() => {});
                continue;
            }

            // No blocking UI found
            break;
        }
    }

    // ============ Porcelain: Smart Actions ============
    // These encode domain knowledge about "when is this done?"

    /**
     * Opens a door or gate. Automatically walks to the door if too far.
     *
     * @param target - Door to open (can be NearbyLoc, name string, or RegExp pattern)
     *                 Defaults to finding nearest door with "Open" option
     *
     * Success signals:
     * - Door now has "Close" option (was "Open" before)
     * - Door no longer visible at same location (some doors disappear when opened)
     *
     * Failure modes:
     * - door_not_found: No door matching the pattern was found
     * - no_open_option: Door exists but has no "Open" option (might already be open)
     * - already_open: Door has "Close" option (already open)
     * - walk_failed: Could not walk to the door
     * - open_failed: Clicked open but door didn't change state
     * - timeout: Waited too long for door to open
     */
    async openDoor(target?: NearbyLoc | string | RegExp): Promise<OpenDoorResult> {
        // Find door
        const door = this.resolveLocation(target, /door|gate/i);
        if (!door) {
            return {
                success: false,
                message: 'No door found nearby',
                reason: 'door_not_found'
            };
        }

        // Check if door has "Open" option
        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (!openOpt) {
            // Check if it's already open (has "Close" option)
            const closeOpt = door.optionsWithIndex.find(o => /^close$/i.test(o.text));
            if (closeOpt) {
                return {
                    success: true,
                    message: `${door.name} is already open`,
                    reason: 'already_open',
                    door
                };
            }
            return {
                success: false,
                message: `${door.name} has no Open option (options: ${door.options.join(', ')})`,
                reason: 'no_open_option',
                door
            };
        }

        // If door is too far, walk to it first
        // Most doors require being within 1-2 tiles to interact
        if (door.distance > 2) {
            const walkResult = await this.walkTo(door.x, door.z);
            if (!walkResult.success) {
                return {
                    success: false,
                    message: `Could not walk to ${door.name}: ${walkResult.message}`,
                    reason: 'walk_failed',
                    door
                };
            }

            // Re-find the door after walking (our NearbyLoc might be stale)
            const doorsNow = this.sdk.getNearbyLocs().filter(l =>
                l.x === door.x && l.z === door.z && /door|gate/i.test(l.name)
            );
            const refreshedDoor = doorsNow[0];
            if (!refreshedDoor) {
                // Door not visible anymore - might have been opened by someone else
                return {
                    success: true,
                    message: `${door.name} is no longer visible (may have been opened)`,
                    door
                };
            }

            // Check if still has Open option
            const refreshedOpenOpt = refreshedDoor.optionsWithIndex.find(o => /^open$/i.test(o.text));
            if (!refreshedOpenOpt) {
                const hasClose = refreshedDoor.optionsWithIndex.some(o => /^close$/i.test(o.text));
                if (hasClose) {
                    return {
                        success: true,
                        message: `${door.name} is already open`,
                        reason: 'already_open',
                        door: refreshedDoor
                    };
                }
                return {
                    success: false,
                    message: `${door.name} no longer has Open option`,
                    reason: 'no_open_option',
                    door: refreshedDoor
                };
            }

            // Use refreshed door for interaction
            await this.sdk.sendInteractLoc(refreshedDoor.x, refreshedDoor.z, refreshedDoor.id, refreshedOpenOpt.opIndex);
        } else {
            // Door is close enough, open it directly
            await this.sdk.sendInteractLoc(door.x, door.z, door.id, openOpt.opIndex);
        }

        // Wait for door to change state
        const doorX = door.x;
        const doorZ = door.z;
        const startTick = this.sdk.getState()?.tick || 0;

        try {
            await this.sdk.waitForCondition(state => {
                // Check for failure messages
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true; // Will check below
                        }
                    }
                }

                // Check if door at same location now has "Close" option (opened)
                const doorNow = state.nearbyLocs.find(l =>
                    l.x === doorX && l.z === doorZ && /door|gate/i.test(l.name)
                );
                if (!doorNow) {
                    return true; // Door gone (some doors disappear when opened)
                }
                // Check if it now has Close option instead of Open
                const hasClose = doorNow.optionsWithIndex.some(o => /^close$/i.test(o.text));
                const hasOpen = doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text));
                return hasClose && !hasOpen;
            }, 5000);

            // Check what happened
            const finalState = this.sdk.getState();

            // Check for "can't reach" message
            for (const msg of finalState?.gameMessages ?? []) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return {
                            success: false,
                            message: `Cannot reach ${door.name} - still blocked`,
                            reason: 'open_failed',
                            door
                        };
                    }
                }
            }

            // Verify door is open
            const doorAfter = finalState?.nearbyLocs.find(l =>
                l.x === doorX && l.z === doorZ && /door|gate/i.test(l.name)
            );

            if (!doorAfter) {
                return {
                    success: true,
                    message: `Opened ${door.name}`,
                    door
                };
            }

            const hasCloseNow = doorAfter.optionsWithIndex.some(o => /^close$/i.test(o.text));
            if (hasCloseNow) {
                return {
                    success: true,
                    message: `Opened ${door.name}`,
                    door: doorAfter
                };
            }

            return {
                success: false,
                message: `${door.name} did not open`,
                reason: 'open_failed',
                door: doorAfter
            };

        } catch {
            return {
                success: false,
                message: `Timeout waiting for ${door.name} to open`,
                reason: 'timeout',
                door
            };
        }
    }

    /**
     * Chops a tree and waits for logs to appear in inventory.
     * Finds the nearest tree matching the pattern if not specified.
     */
    async chopTree(target?: NearbyLoc | string | RegExp): Promise<ChopTreeResult> {
        // Dismiss any blocking UI before starting
        await this.dismissBlockingUI();

        const tree = this.resolveLocation(target, /^tree$/i);
        if (!tree) {
            return { success: false, message: 'No tree found' };
        }

        const invCountBefore = this.sdk.getInventory().length;
        const result = await this.sdk.sendInteractLoc(tree.x, tree.z, tree.id, 1);

        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            // Wait for: new item in inventory OR tree disappears
            await this.sdk.waitForCondition(state => {
                const newItem = state.inventory.length > invCountBefore;
                const treeGone = !state.nearbyLocs.find(l =>
                    l.x === tree.x && l.z === tree.z && l.id === tree.id
                );
                return newItem || treeGone;
            }, 30000);

            const logs = this.sdk.findInventoryItem(/logs/i);
            return {
                success: true,
                logs: logs || undefined,
                message: 'Chopped tree'
            };
        } catch {
            return { success: false, message: 'Timed out waiting for tree chop' };
        }
    }

    /**
     * Burns logs with a tinderbox and waits for firemaking to complete.
     * Automatically finds tinderbox and logs if not specified.
     *
     * This function will NOT return until:
     * - SUCCESS: Firemaking XP increases (fire was lit)
     * - FAILURE: Timeout expires, or failure message detected
     */
    async burnLogs(logsTarget?: InventoryItem | string | RegExp): Promise<BurnLogsResult> {
        // Dismiss any blocking UI (level-up dialogs, etc.) before starting
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
        const logsCountBefore = this.sdk.getInventory().filter(i => /logs/i.test(i.name)).length;

        const result = await this.sdk.sendUseItemOnItem(tinderbox.slot, logs.slot);
        if (!result.success) {
            return { success: false, xpGained: 0, message: result.message };
        }

        // Record the current tick so we can filter for NEW messages only
        const startTick = this.sdk.getState()?.tick || 0;

        // Wait for firemaking to complete - this is the key domain knowledge:
        // - XP gain is the ONLY reliable success indicator
        // - Logs disappearing alone doesn't mean success (could be dropped, etc.)
        // - Failure messages are checked, but ONLY if they arrived after we started (using tick)
        // - Timeout of 30s allows for walking + animation
        // - Level-up dialogs can appear mid-action and must be dismissed
        let lastDialogClickTick = 0;
        try {
            await this.sdk.waitForCondition(state => {
                // Check for XP gain - this is SUCCESS
                const fmXp = state.skills.find(s => s.name === 'Firemaking')?.experience || 0;
                if (fmXp > fmBefore) {
                    return true;  // Fire was lit!
                }

                // If a dialog opened during the action (e.g., level-up), dismiss it
                // Level-up dialogs can have multiple pages, so keep clicking every few ticks
                // We do this AFTER checking XP so we don't miss the success
                if (state.dialog.isOpen && (state.tick - lastDialogClickTick) >= 3) {
                    lastDialogClickTick = state.tick;
                    // Fire and forget - the next state update will show if it closed
                    this.sdk.sendClickDialog(0).catch(() => {});
                }

                // Check for failure messages that arrived AFTER we started
                // (filtering by tick prevents old messages from causing false failures)
                const failureMessages = [
                    "can't light a fire",
                    "you need to move",
                    "can't do that here"
                ];
                for (const msg of state.gameMessages) {
                    // Only check messages that arrived after we started
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (failureMessages.some(f => text.includes(f))) {
                            return true;  // Will check XP below to determine success/failure
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

    /**
     * Picks up a ground item and waits for it to appear in inventory.
     *
     * Failure modes:
     * - item_not_found: No item matching the pattern was found on ground
     * - cant_reach: Path to item is blocked (door, wall, obstacle)
     * - inventory_full: Inventory is full
     * - timeout: Waited too long for item to appear in inventory
     */
    async pickupItem(target: GroundItem | string | RegExp): Promise<PickupResult> {
        const item = this.resolveGroundItem(target);
        if (!item) {
            return {
                success: false,
                message: 'Item not found on ground',
                reason: 'item_not_found'
            };
        }

        const invCountBefore = this.sdk.getInventory().length;
        const startTick = this.sdk.getState()?.tick || 0;
        const result = await this.sdk.sendPickup(item.x, item.z, item.id);

        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            // Wait for: inventory count increases OR failure message
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for failure messages (arrived after we started)
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true; // Will check below
                        }
                        if (text.includes("inventory") && text.includes("full")) {
                            return true; // Will check below
                        }
                    }
                }

                // Check for success - item in inventory
                return state.inventory.length > invCountBefore;
            }, 10000);

            // Check what caused us to exit
            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return {
                            success: false,
                            message: `Cannot reach ${item.name} at (${item.x}, ${item.z}) - path blocked`,
                            reason: 'cant_reach'
                        };
                    }
                    if (text.includes("inventory") && text.includes("full")) {
                        return {
                            success: false,
                            message: 'Inventory is full',
                            reason: 'inventory_full'
                        };
                    }
                }
            }

            // Success - find the item that was just picked up
            const pickedUp = this.sdk.getInventory().find(i =>
                i.id === item.id
            );

            return {
                success: true,
                item: pickedUp,
                message: `Picked up ${item.name}`
            };
        } catch {
            return {
                success: false,
                message: 'Timed out waiting for pickup',
                reason: 'timeout'
            };
        }
    }

    /**
     * Talks to an NPC and waits for dialog to open.
     */
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
            // Wait for dialog to open
            const state = await this.sdk.waitForCondition(s =>
                s.dialog.isOpen,
                10000
            );

            return {
                success: true,
                dialog: state.dialog,
                message: `Talking to ${npc.name}`
            };
        } catch {
            return { success: false, message: 'Timed out waiting for dialog' };
        }
    }

    /**
     * Walks to a location using server-side pathfinding.
     * Uses the rsmod WASM pathfinder which has access to the full collision map,
     * so it automatically navigates around obstacles like walls and buildings.
     *
     * Works for any distance - short walks and long city-to-city journeys.
     * For very long distances beyond the pathfinder's search radius (~100 tiles),
     * it will re-query after making progress.
     *
     * @param x - Destination world X coordinate
     * @param z - Destination world Z coordinate
     *
     * Note: This does NOT handle doors, stairs, or teleports. If the path
     * is blocked by a closed door, use openDoor() first. For multi-level
     * navigation, call this separately for each floor.
     */
    async walkTo(x: number, z: number, tolerance: number = 3): Promise<ActionResult> {
        const startState = this.sdk.getState();
        if (!startState?.player) {
            return { success: false, message: 'No player state' };
        }

        const startX = startState.player.worldX;
        const startZ = startState.player.worldZ;

        // Check if already at destination
        const startDist = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(z - startZ, 2));
        if (startDist <= tolerance) {
            return { success: true, message: `Already at (${x}, ${z})` };
        }

        const MAX_PATH_QUERIES = 80;
        let stuckCount = 0;

        for (let query = 0; query < MAX_PATH_QUERIES; query++) {
            const currentState = this.sdk.getState();
            if (!currentState?.player) {
                return { success: false, message: 'Lost player state' };
            }

            const currentX = currentState.player.worldX;
            const currentZ = currentState.player.worldZ;

            // Check if we've arrived
            const distToGoal = Math.sqrt(Math.pow(x - currentX, 2) + Math.pow(z - currentZ, 2));
            if (distToGoal <= tolerance) {
                return { success: true, message: `Arrived at (${currentX}, ${currentZ})` };
            }

            // Ask pathfinder for path to destination
            let pathResult = await this.sdk.sendFindPath(x, z, 500);

            // If destination is too far, try progressively closer intermediate targets
            // Also try perpendicular offsets in case straight line hits obstacles
            if ((!pathResult.waypoints || pathResult.waypoints.length === 0) && distToGoal > 40) {
                const INTERMEDIATE_DISTANCES = [60, 40, 25];
                const PERPENDICULAR_OFFSETS = [0, 15, -15, 30, -30];

                // Direction vector to goal (normalized)
                const dirX = (x - currentX) / distToGoal;
                const dirZ = (z - currentZ) / distToGoal;
                // Perpendicular vector (rotate 90 degrees)
                const perpX = -dirZ;
                const perpZ = dirX;

                intermediateSearch:
                for (const dist of INTERMEDIATE_DISTANCES) {
                    if (dist >= distToGoal) continue; // Don't overshoot

                    for (const offset of PERPENDICULAR_OFFSETS) {
                        const intermediateX = Math.round(currentX + dirX * dist + perpX * offset);
                        const intermediateZ = Math.round(currentZ + dirZ * dist + perpZ * offset);

                        pathResult = await this.sdk.sendFindPath(intermediateX, intermediateZ, 500);
                        if (pathResult.waypoints && pathResult.waypoints.length > 0) {
                            break intermediateSearch; // Found valid path
                        }
                    }
                }
            }

            if (!pathResult.success || !pathResult.waypoints || pathResult.waypoints.length === 0) {
                // No path found - try a direct walk command as last resort
                await this.sdk.sendWalk(x, z, true);
                try {
                    await this.sdk.waitForCondition(s => {
                        if (!s.player) return false;
                        const d = Math.sqrt(Math.pow(x - s.player.worldX, 2) + Math.pow(z - s.player.worldZ, 2));
                        return d <= tolerance;
                    }, 10000);
                    return { success: true, message: `Arrived at (${x}, ${z})` };
                } catch {
                    return { success: false, message: `No path found to (${x}, ${z})` };
                }
            }

            const waypoints = pathResult.waypoints;

            // Follow waypoints from the path
            // Walk to every 5th waypoint (~5 tiles) for efficiency while staying on path
            const WAYPOINT_STEP = 5;
            for (let wpIndex = Math.min(WAYPOINT_STEP - 1, waypoints.length - 1); wpIndex < waypoints.length; wpIndex += WAYPOINT_STEP) {
                const wp = waypoints[wpIndex];
                if (!wp) continue;
                await this.sdk.sendWalk(wp.x, wp.z, true);

                // Use intelligent wait - exits early if stopped moving
                const moveResult = await this.waitForMovementComplete(wp.x, wp.z, 3);

                if (!this.sdk.getState()?.player) {
                    return { success: false, message: 'Lost connection during walk' };
                }

                // Check if we've arrived at final destination
                const newDist = Math.sqrt(Math.pow(x - moveResult.x, 2) + Math.pow(z - moveResult.z, 2));
                if (newDist <= tolerance) {
                    return { success: true, message: `Arrived at (${moveResult.x}, ${moveResult.z})` };
                }

                // If stopped moving but not at waypoint, might need to re-path
                if (moveResult.stoppedMoving && !moveResult.arrived) {
                    break; // Exit inner loop to re-query pathfinder
                }
            }

            // Walk to the last waypoint
            const lastWp = waypoints[waypoints.length - 1];
            if (lastWp) {
                await this.sdk.sendWalk(lastWp.x, lastWp.z, true);
                await this.waitForMovementComplete(lastWp.x, lastWp.z, 3);
            }

            // Check progress
            const afterState = this.sdk.getState();
            const afterX = afterState?.player?.worldX ?? currentX;
            const afterZ = afterState?.player?.worldZ ?? currentZ;
            const newDistToGoal = Math.sqrt(Math.pow(x - afterX, 2) + Math.pow(z - afterZ, 2));

            if (newDistToGoal <= tolerance) {
                return { success: true, message: `Arrived at (${afterX}, ${afterZ})` };
            }

            // Check if we made progress
            const progressMade = distToGoal - newDistToGoal;
            if (progressMade < 5) {
                stuckCount++;
                if (stuckCount >= 3) {
                    return { success: false, message: `Stuck at (${afterX}, ${afterZ}) - cannot reach (${x}, ${z})` };
                }
            } else {
                stuckCount = 0;
            }
        }

        const finalState = this.sdk.getState();
        const finalX = finalState?.player?.worldX ?? startX;
        const finalZ = finalState?.player?.worldZ ?? startZ;
        const finalDist = Math.sqrt(Math.pow(x - finalX, 2) + Math.pow(z - finalZ, 2));

        return {
            success: finalDist <= tolerance,
            message: finalDist <= tolerance
                ? `Arrived at (${finalX}, ${finalZ})`
                : `Could not reach (${x}, ${z}) - stopped at (${finalX}, ${finalZ})`
        };
    }

    // ============ Porcelain: Shop Actions ============

    /**
     * Closes the shop interface and waits for BOTH shop.isOpen AND interface.isOpen
     * to become false.
     *
     * This fixes the issue where sendCloseShop() returns immediately after clicking
     * the close button, but the interface state may not have updated yet, causing
     * subsequent interactions to fail.
     *
     * @param timeout - Maximum time to wait for close confirmation (default: 5000ms)
     */
    async closeShop(timeout: number = 5000): Promise<ActionResult> {
        const state = this.sdk.getState();
        if (!state?.shop.isOpen && !state?.interface?.isOpen) {
            return { success: true, message: 'Shop already closed' };
        }

        // Send the close command
        await this.sdk.sendCloseShop();

        try {
            // Wait for BOTH shop.isOpen AND interface.isOpen to become false
            await this.sdk.waitForCondition(s => {
                const shopClosed = !s.shop.isOpen;
                const interfaceClosed = !s.interface?.isOpen;
                return shopClosed && interfaceClosed;
            }, timeout);

            return { success: true, message: 'Shop closed' };
        } catch {
            // If timeout, try a second close attempt
            await this.sdk.sendCloseShop();

            // Wait a bit and check again
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

    /**
     * Opens a shop by trading with a shopkeeper NPC.
     * Waits for the shop interface to open.
     */
    async openShop(target: NearbyNpc | string | RegExp = /shop\s*keeper/i): Promise<ActionResult> {
        const npc = this.resolveNpc(target);
        if (!npc) {
            return { success: false, message: 'Shopkeeper not found' };
        }

        // Find "Trade" option
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

    /**
     * Buys an item from an open shop.
     * Waits for the item to appear in inventory.
     * Fails if item doesn't appear (e.g., no coins, shop out of stock).
     */
    async buyFromShop(target: ShopItem | string | RegExp, amount: number = 1): Promise<ShopResult> {
        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open' };
        }

        const shopItem = this.resolveShopItem(target, shop.shopItems);
        if (!shopItem) {
            return { success: false, message: `Item not found in shop: ${target}` };
        }

        // Track inventory before purchase
        const invBefore = this.sdk.getInventory();
        const hadItemBefore = invBefore.find(i => i.id === shopItem.id);
        const countBefore = hadItemBefore?.count ?? 0;

        const result = await this.sdk.sendShopBuy(shopItem.slot, amount);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            // Wait for item to appear or count to increase
            await this.sdk.waitForCondition(state => {
                const item = state.inventory.find(i => i.id === shopItem.id);
                if (!item) return false;
                return item.count > countBefore;
            }, 5000);

            const boughtItem = this.sdk.getInventory().find(i => i.id === shopItem.id);
            return {
                success: true,
                item: boughtItem,
                message: `Bought ${shopItem.name} x${amount}`
            };
        } catch {
            return { success: false, message: `Failed to buy ${shopItem.name} (no coins or out of stock?)` };
        }
    }

    /**
     * Sells an item to an open shop.
     * Waits for the item to leave inventory (or count to decrease).
     * Accepts InventoryItem, ShopItem (from shop.playerItems), or a pattern.
     *
     * @param target - Item to sell (InventoryItem, ShopItem, string pattern, or RegExp)
     * @param amount - Amount to sell: 1, 5, 10, or 'all' (default: 1)
     *
     * Error detection:
     * - "You can't sell this item to a shop." - item is coins
     * - "You can't sell this item." - item is untradeable
     * - "You can't sell this item to this shop." - shop doesn't buy this item type
     */
    async sellToShop(target: InventoryItem | ShopItem | string | RegExp, amount: SellAmount = 1): Promise<ShopSellResult> {
        const shop = this.sdk.getState()?.shop;
        if (!shop?.isOpen) {
            return { success: false, message: 'Shop is not open' };
        }

        // Find item in player's shop inventory (items available to sell)
        const sellItem = this.resolveShopItem(target, shop.playerItems);
        if (!sellItem) {
            return { success: false, message: `Item not found to sell: ${target}` };
        }

        const countBefore = sellItem.count;
        const startTick = this.sdk.getState()?.tick || 0;

        // For 'all', we need to sell in batches of 10 until done
        if (amount === 'all') {
            return this.sellAllToShop(sellItem, startTick);
        }

        // Valid amounts are 1, 5, 10
        const validAmount = [1, 5, 10].includes(amount) ? amount : 1;

        const result = await this.sdk.sendShopSell(sellItem.slot, validAmount);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Check for rejection messages or successful sale
        // Use TOTAL COUNT of items with this ID to handle:
        // 1. Unstackable items (like shortbows) with count=1 each
        // 2. Slot shifting after items are sold
        const getTotalCount = (playerItems: typeof shop.playerItems) =>
            playerItems.filter(i => i.id === sellItem.id).reduce((sum, i) => sum + i.count, 0);
        const totalCountBefore = getTotalCount(shop.playerItems);

        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for rejection messages (arrived after we started)
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't sell this item")) {
                            return true; // Rejected - exit early
                        }
                    }
                }

                // Check for successful sale - total count of this item type decreased
                const totalCountNow = getTotalCount(state.shop.playerItems);
                return totalCountNow < totalCountBefore;
            }, 5000);

            // Check if it was a rejection
            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't sell this item to this shop")) {
                        return {
                            success: false,
                            message: `Shop doesn't buy ${sellItem.name}`,
                            rejected: true
                        };
                    }
                    if (text.includes("can't sell this item to a shop")) {
                        return {
                            success: false,
                            message: `Cannot sell ${sellItem.name} to any shop`,
                            rejected: true
                        };
                    }
                    if (text.includes("can't sell this item")) {
                        return {
                            success: false,
                            message: `${sellItem.name} is not tradeable`,
                            rejected: true
                        };
                    }
                }
            }

            // Calculate actual amount sold using total count
            const totalCountAfter = getTotalCount(finalState.shop.playerItems);
            const amountSold = totalCountBefore - totalCountAfter;

            return {
                success: true,
                message: `Sold ${sellItem.name} x${amountSold}`,
                amountSold
            };
        } catch {
            return { success: false, message: `Failed to sell ${sellItem.name} (timeout)` };
        }
    }

    /**
     * Sells all of an item to the shop by repeatedly selling 10 at a time.
     * Stops if the shop rejects the item or we run out.
     */
    private async sellAllToShop(sellItem: ShopItem, startTick: number): Promise<ShopSellResult> {
        let totalSold = 0;

        // Helper to get total count of items with this ID (handles unstackable items)
        const getTotalCount = (playerItems: ShopItem[]) => {
            return playerItems
                .filter(i => i.id === sellItem.id)
                .reduce((sum, i) => sum + i.count, 0);
        };

        while (true) {
            const state = this.sdk.getState();
            if (!state?.shop.isOpen) {
                break;
            }

            // Find any item with this ID to sell
            const currentItem = state.shop.playerItems.find(i => i.id === sellItem.id);
            if (!currentItem || currentItem.count === 0) {
                break; // All sold
            }

            // Track total count before (handles unstackable items like shortbows)
            const totalCountBefore = getTotalCount(state.shop.playerItems);
            const sellAmount = Math.min(10, currentItem.count);
            const currentSlot = currentItem.slot;

            const result = await this.sdk.sendShopSell(currentSlot, sellAmount);
            if (!result.success) {
                break;
            }

            // Wait for sale to complete or rejection
            try {
                const finalState = await this.sdk.waitForCondition(s => {
                    // Check for rejection
                    for (const msg of s.gameMessages) {
                        if (msg.tick > startTick) {
                            if (msg.text.toLowerCase().includes("can't sell this item")) {
                                return true;
                            }
                        }
                    }

                    // Check for total count decrease (works for both stackable and unstackable)
                    const totalCountNow = getTotalCount(s.shop.playerItems);
                    return totalCountNow < totalCountBefore;
                }, 3000);

                // Check for rejection
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

                // Count what was sold using total count
                const totalCountAfter = getTotalCount(finalState.shop.playerItems);
                const soldThisRound = totalCountBefore - totalCountAfter;
                totalSold += soldThisRound;

                // If nothing sold, exit
                if (soldThisRound === 0) {
                    break;
                }

            } catch {
                break; // Timeout
            }
        }

        if (totalSold === 0) {
            return {
                success: false,
                message: `Failed to sell any ${sellItem.name}`
            };
        }

        return {
            success: true,
            message: `Sold ${sellItem.name} x${totalSold}`,
            amountSold: totalSold
        };
    }

    // ============ Porcelain: Crafting Actions ============

    /**
     * Fletches logs into a product.
     *
     * @param product - Product to make: 'arrow shafts', 'short bow', 'long bow', or RegExp
     * @param timeout - Maximum time to wait for crafting to complete (default: 10000ms)
     *
     * Prerequisites:
     * - Knife and logs must be in inventory
     * - Fletching level must be high enough for the product:
     *   - Arrow Shafts: level 1
     *   - Short Bow: level 5
     *   - Long Bow: level 10
     */
    async fletchLogs(
        product: string | RegExp = /arrow\s*shaft/i,
        timeout: number = 10000
    ): Promise<FletchResult> {
        // Find knife and logs
        const knife = this.sdk.findInventoryItem(/knife/i);
        if (!knife) {
            return { success: false, message: 'No knife in inventory' };
        }

        // Find any type of logs (logs, oak logs, willow logs, etc.)
        const logs = this.sdk.findInventoryItem(/logs$/i);
        if (!logs) {
            return { success: false, message: 'No logs in inventory' };
        }

        const fletchingXpBefore = this.sdk.getSkill('Fletching')?.experience ?? 0;
        const productPattern = typeof product === 'string'
            ? new RegExp(product.replace(/\s+/g, '\\s*'), 'i')
            : product;

        // Dismiss any leftover dialog (e.g. "Click here to continue" from previous crafting)
        const existingDialog = this.sdk.getState()?.dialog;
        if (existingDialog?.isOpen) {
            const isContinueDialog = existingDialog.options?.some(o => /continue/i.test(o.text));
            if (isContinueDialog) {
                // Click to dismiss
                await this.sdk.sendClickDialog(0);
                // Give the server time to process and dialog to close
                await new Promise(r => setTimeout(r, 500));
                // Wait for dialog to close or change
                try {
                    await this.sdk.waitForCondition(s => {
                        if (!s.dialog.isOpen) return true;
                        // Also accept if dialog changed (no longer has continue)
                        const stillContinue = s.dialog.options?.some(o => /continue/i.test(o.text));
                        return !stillContinue;
                    }, 3000);
                } catch {
                    // Dialog didn't close, continue anyway
                }
            }
        }

        // Use knife on logs to open the fletching dialog
        await this.sdk.sendUseItemOnItem(knife.slot, logs.slot);

        // Wait for dialog to open
        try {
            await this.sdk.waitForCondition(s => s.dialog.isOpen, 5000);
        } catch {
            return { success: false, message: 'Fletching dialog did not open' };
        }

        const fullState = this.sdk.getState();
        const dialogState = fullState?.dialog;
        const interfaceState = fullState?.interface;

        if (!dialogState?.isOpen) {
            return { success: false, message: 'Fletching dialog closed unexpectedly' };
        }

        // The fletching dialog has this structure:
        // - 3 "Ok" buttons (components 2800, 2801, 2802) - one for EACH product
        // - 3 product labels (components 2803, 2804, 2805) - "Arrow Shafts.", "Short Bow.", "Long Bow."
        //
        // To make a specific product, click its corresponding Ok button:
        // - Component 2800 → Arrow Shafts
        // - Component 2801 → Short Bow
        // - Component 2802 → Long Bow
        //
        // The product label componentId - 3 = the corresponding Ok button componentId

        // Find the product text option to determine which Ok button to click
        const productOption = dialogState.options.find(o => productPattern.test(o.text));

        // Get all Ok buttons sorted by component ID
        const okButtons = dialogState.options
            .filter(o => /^ok$/i.test(o.text))
            .sort((a, b) => (a.componentId ?? 0) - (b.componentId ?? 0));

        if (productOption && okButtons.length > 0) {
            // Map product to corresponding Ok button by position
            // Different fletching interfaces have different component IDs but consistent ordering:
            // - Regular logs: Ok buttons 2800,2801,2802 → Products 2803,2804,2805
            // - Oak logs: Ok buttons 142,143 → Products 144,145
            // The pattern is: products and Ok buttons are in parallel order (sorted by componentId)

            const productLabels = dialogState.options
                .filter(o => !/^ok$/i.test(o.text) && !/close/i.test(o.text))
                .sort((a, b) => (a.componentId ?? 0) - (b.componentId ?? 0));

            const productIndex = productLabels.findIndex(o => o.componentId === productOption.componentId);

            if (productIndex >= 0 && productIndex < okButtons.length) {
                await this.sdk.sendClickDialog(okButtons[productIndex]!.index);
            } else {
                // Fallback: click first Ok
                await this.sdk.sendClickDialog(okButtons[0]!.index);
            }
        } else if (okButtons.length > 0) {
            // No product found, click first Ok (default product)
            await this.sdk.sendClickDialog(okButtons[0]!.index);
        } else {
            // No Ok buttons found, try clicking continue
            await this.sdk.sendClickDialog(0);
        }

        // Wait for fletching to complete
        // Success: XP gained
        // Failure: Dialog closed without XP gain, or timeout
        let lastDialogClickTick = 0;
        let dialogWasOpen = true;
        let ticksWithDialogClosed = 0;

        try {
            await this.sdk.waitForCondition(state => {
                // Check for XP gain - SUCCESS
                const fletchingXp = state.skills.find(s => s.name === 'Fletching')?.experience ?? 0;
                if (fletchingXp > fletchingXpBefore) {
                    return true;
                }

                // Track dialog state
                const dialogOpen = state.dialog.isOpen;

                // If dialog was open but now closed, start counting ticks
                if (dialogWasOpen && !dialogOpen) {
                    dialogWasOpen = false;
                    ticksWithDialogClosed = 0;
                }

                // If dialog is closed, count how long
                if (!dialogOpen) {
                    ticksWithDialogClosed++;

                    // If dialog has been closed for 5+ ticks without XP gain, it failed
                    if (ticksWithDialogClosed >= 5) {
                        throw new Error('Dialog closed without fletching');
                    }
                }

                // If a level-up dialog appears, dismiss it
                if (dialogOpen && (state.tick - lastDialogClickTick) >= 3) {
                    // Check if this looks like a level-up dialog (different from fletching)
                    const options = state.dialog.options;
                    const isLevelUp = options.some(o => /continue|congratulations/i.test(o.text));
                    if (isLevelUp) {
                        lastDialogClickTick = state.tick;
                        this.sdk.sendClickDialog(0).catch(() => {});
                    }
                }

                return false;
            }, timeout);

            const fletchingXpAfter = this.sdk.getSkill('Fletching')?.experience ?? 0;
            const xpGained = fletchingXpAfter - fletchingXpBefore;

            // Find the created product
            const createdProduct = this.sdk.findInventoryItem(productPattern) ||
                                   this.sdk.findInventoryItem(/bow/i) ||
                                   this.sdk.findInventoryItem(/arrow\s*shaft/i);

            return {
                success: true,
                message: `Fletched ${createdProduct?.name ?? 'product'}`,
                xpGained,
                product: createdProduct || undefined
            };
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error';
            if (errorMsg.includes('Dialog closed')) {
                return { success: false, message: 'Fletching dialog closed without crafting' };
            }
            return { success: false, message: 'Timeout waiting for fletching to complete' };
        }
    }

    // ============ Porcelain: Equipment & Combat ============

    /**
     * Equips an item from inventory.
     * Waits for the item to move to equipment slot.
     */
    async equipItem(target: InventoryItem | string | RegExp): Promise<EquipResult> {
        const item = this.resolveInventoryItem(target, /./);
        if (!item) {
            return { success: false, message: `Item not found: ${target}` };
        }

        // Find "Wield" or "Wear" option
        const equipOpt = item.optionsWithIndex.find(o => /wield|wear|equip/i.test(o.text));
        if (!equipOpt) {
            return { success: false, message: `No equip option on ${item.name}` };
        }

        const invCountBefore = this.sdk.getInventory().length;
        const result = await this.sdk.sendUseItem(item.slot, equipOpt.opIndex);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            // Wait for item to leave inventory (moved to equipment)
            await this.sdk.waitForCondition(state =>
                !state.inventory.find(i => i.slot === item.slot && i.id === item.id),
                5000
            );
            return { success: true, message: `Equipped ${item.name}` };
        } catch {
            return { success: false, message: `Failed to equip ${item.name}` };
        }
    }

    /**
     * Unequips an item from equipment slots.
     * Waits for the item to appear in inventory.
     *
     * @param target - Equipment item to unequip (can be InventoryItem, name string, or RegExp pattern)
     *
     * Equipment slot indices:
     * - 0: Head (helmet)
     * - 1: Cape
     * - 2: Amulet
     * - 3: Weapon (right hand)
     * - 4: Body (torso)
     * - 5: Shield (left hand)
     * - 6: Legs
     * - 7: Gloves
     * - 8: Boots
     * - 9: Ring
     * - 10: Ammo
     */
    async unequipItem(target: InventoryItem | string | RegExp): Promise<UnequipResult> {
        // Find the item in equipment
        let item: InventoryItem | null = null;
        if (typeof target === 'object' && 'slot' in target) {
            item = target;
        } else {
            item = this.sdk.findEquipmentItem(target);
        }

        if (!item) {
            return { success: false, message: `Item not found in equipment: ${target}` };
        }

        // Equipment items use option 1 to unequip (clicking the item removes it)
        // The displayed options (like "Wield") are inventory options, not equipment options
        const invCountBefore = this.sdk.getInventory().length;
        const result = await this.sdk.sendUseEquipmentItem(item.slot, 1);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        try {
            // Wait for item to appear in inventory
            await this.sdk.waitForCondition(state =>
                state.inventory.length > invCountBefore ||
                state.inventory.some(i => i.id === item!.id),
                5000
            );

            const unequippedItem = this.sdk.findInventoryItem(new RegExp(item.name, 'i'));
            return {
                success: true,
                message: `Unequipped ${item.name}`,
                item: unequippedItem || undefined
            };
        } catch {
            return { success: false, message: `Failed to unequip ${item.name}` };
        }
    }

    /**
     * Gets all currently equipped items.
     */
    getEquipment(): InventoryItem[] {
        return this.sdk.getEquipment();
    }

    /**
     * Finds an equipped item by name pattern.
     */
    findEquippedItem(pattern: string | RegExp): InventoryItem | null {
        return this.sdk.findEquipmentItem(pattern);
    }

    /**
     * Eats food from inventory.
     * Waits for HP to increase or food to be consumed.
     */
    async eatFood(target: InventoryItem | string | RegExp): Promise<EatResult> {
        const food = this.resolveInventoryItem(target, /./);
        if (!food) {
            return { success: false, hpGained: 0, message: `Food not found: ${target}` };
        }

        // Find "Eat" option
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
            // Wait for HP to increase OR food count to decrease
            await this.sdk.waitForCondition(state => {
                const hp = state.skills.find(s => s.name === 'Hitpoints')?.level ?? 10;
                const foodCount = state.inventory.filter(i => i.id === food.id).length;
                return hp > hpBefore || foodCount < foodCountBefore;
            }, 5000);

            const hpAfter = this.sdk.getSkill('Hitpoints')?.level ?? 10;
            return {
                success: true,
                hpGained: hpAfter - hpBefore,
                message: `Ate ${food.name}`
            };
        } catch {
            return { success: false, hpGained: 0, message: `Failed to eat ${food.name}` };
        }
    }

    /**
     * Attacks an NPC and waits for combat to start or failure to be detected.
     *
     * @param target - NPC to attack (can be NearbyNpc object, name string, or RegExp pattern)
     * @param timeout - How long to wait for combat confirmation in ms (default: 5000)
     *
     * Detects these failure modes:
     * - "I can't reach that!" - obstacle between player and NPC (e.g., fence, gate, wall)
     * - "Someone else is fighting that" - NPC already in combat with another player
     *
     * When blocked by an obstacle, use bot.openDoor() to open the gate/door, then retry.
     */
    async attackNpc(
        target: NearbyNpc | string | RegExp,
        timeout: number = 5000
    ): Promise<AttackResult> {

        const npc = this.resolveNpc(target);
        if (!npc) {
            return { success: false, message: `NPC not found: ${target}`, reason: 'npc_not_found' };
        }

        // Find "Attack" option
        const attackOpt = npc.optionsWithIndex.find(o => /attack/i.test(o.text));
        if (!attackOpt) {
            return { success: false, message: `No attack option on ${npc.name}`, reason: 'no_attack_option' };
        }

        const startTick = this.sdk.getState()?.tick || 0;
        const result = await this.sdk.sendInteractNpc(npc.index, attackOpt.opIndex);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        // Wait for combat to start or failure message
        try {
            const finalState = await this.sdk.waitForCondition(state => {
                // Check for failure messages (arrived after we sent the attack command)
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true; // Out of reach - exit early
                        }
                        if (text.includes("someone else is fighting") || text.includes("already under attack")) {
                            return true; // Already in combat - exit early
                        }
                    }
                }

                // Check if NPC has disappeared (likely we're fighting it or it died)
                const targetNpc = state.nearbyNpcs.find(n => n.index === npc.index);
                if (!targetNpc) {
                    return true; // NPC gone - combat likely started or it died
                }

                // Check if we've moved closer to the NPC (walking to attack)
                // and NPC distance is very close (within melee range)
                if (targetNpc.distance <= 2) {
                    return true; // Close enough - combat should be starting
                }

                return false;
            }, timeout);

            // Check what caused us to exit the wait
            for (const msg of finalState.gameMessages) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return {
                            success: false,
                            message: `Cannot reach ${npc.name} - obstacle in the way`,
                            reason: 'out_of_reach'
                        };
                    }
                    if (text.includes("someone else is fighting") || text.includes("already under attack")) {
                        return {
                            success: false,
                            message: `${npc.name} is already in combat`,
                            reason: 'already_in_combat'
                        };
                    }
                }
            }

            // No failure message found - combat likely started
            return { success: true, message: `Attacking ${npc.name}` };
        } catch {
            return {
                success: false,
                message: `Timeout waiting to attack ${npc.name}`,
                reason: 'timeout'
            };
        }
    }

    // ============ Porcelain: Condition Helpers ============

    /**
     * Waits until a skill reaches the target level.
     */
    async waitForSkillLevel(skillName: string, targetLevel: number, timeout: number = 60000): Promise<SkillState> {
        const state = await this.sdk.waitForCondition(s => {
            const skill = s.skills.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
            return skill !== undefined && skill.baseLevel >= targetLevel;
        }, timeout);

        return state.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())!;
    }

    /**
     * Waits until an item appears in inventory.
     */
    async waitForInventoryItem(pattern: string | RegExp, timeout: number = 30000): Promise<InventoryItem> {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

        const state = await this.sdk.waitForCondition(s =>
            s.inventory.some(i => regex.test(i.name)),
            timeout
        );

        return state.inventory.find(i => regex.test(i.name))!;
    }

    /**
     * Waits until dialog closes.
     */
    async waitForDialogClose(timeout: number = 30000): Promise<void> {
        await this.sdk.waitForCondition(s => !s.dialog.isOpen, timeout);
    }

    /**
     * Waits until the player is idle (not moving, no pending actions).
     * This is a heuristic - checks if player position hasn't changed.
     */
    async waitForIdle(timeout: number = 10000): Promise<void> {
        // Get initial position
        const initialState = this.sdk.getState();
        if (!initialState?.player) {
            throw new Error('No player state');
        }

        const initialX = initialState.player.x;
        const initialZ = initialState.player.z;

        // Wait for next state update
        await this.sdk.waitForStateChange(timeout);

        // Check if position is the same
        await this.sdk.waitForCondition(state => {
            if (!state.player) return false;
            return state.player.x === initialX && state.player.z === initialZ;
        }, timeout);
    }

    // ============ Porcelain: Sequences ============

    /**
     * Navigates through a dialog by selecting options in sequence.
     * Options can be indices (1-based) or text patterns to match.
     */
    async navigateDialog(choices: (number | string | RegExp)[]): Promise<void> {
        for (const choice of choices) {
            // Wait for dialog to be ready
            await this.sdk.waitForCondition(s =>
                s.dialog.isOpen && !s.dialog.isWaiting,
                10000
            );

            const dialog = this.sdk.getDialog();
            if (!dialog) {
                throw new Error('Dialog closed unexpectedly');
            }

            let optionIndex: number;

            if (typeof choice === 'number') {
                optionIndex = choice;
            } else {
                // Find option matching the pattern
                const regex = typeof choice === 'string'
                    ? new RegExp(choice, 'i')
                    : choice;

                const match = dialog.options.find(o => regex.test(o.text));
                if (!match) {
                    // No options means "click to continue" (option 0)
                    if (dialog.options.length === 0) {
                        optionIndex = 0;
                    } else {
                        throw new Error(`No dialog option matching: ${choice}`);
                    }
                } else {
                    optionIndex = match.index;
                }
            }

            await this.sdk.sendClickDialog(optionIndex);

            // Small delay for dialog to process
            await this.sdk.waitForStateChange(5000).catch(() => {});
        }
    }

    // ============ Resolution Helpers ============

    private resolveLocation(
        target: NearbyLoc | string | RegExp | undefined,
        defaultPattern: RegExp
    ): NearbyLoc | null {
        if (!target) {
            return this.sdk.findNearbyLoc(defaultPattern);
        }
        if (typeof target === 'object' && 'x' in target) {
            return target;
        }
        return this.sdk.findNearbyLoc(target);
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

    private resolveGroundItem(target: GroundItem | string | RegExp): GroundItem | null {
        if (typeof target === 'object' && 'x' in target) {
            return target;
        }
        return this.sdk.findGroundItem(target);
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
        // If it's an object with id/name, find matching item in the shop's item list
        if (typeof target === 'object' && 'id' in target && 'name' in target) {
            return items.find(i => i.id === target.id) ?? null;
        }
        // Otherwise it's a pattern - search by name
        const regex = typeof target === 'string' ? new RegExp(target, 'i') : target;
        return items.find(i => regex.test(i.name)) ?? null;
    }
}
