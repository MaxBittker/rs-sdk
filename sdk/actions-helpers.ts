// Bot SDK - Action Helpers
// Private helper methods extracted from BotActions for reusability

import { BotSDK } from './index';
import type {
    NearbyLoc,
    NearbyNpc,
    InventoryItem,
    GroundItem,
    ShopItem,
} from './types';

export class ActionHelpers {
    constructor(private sdk: BotSDK) {}

    // ============ Door Retry Wrapper ============

    /**
     * Wraps an action with automatic door-opening retry logic.
     * If the action fails due to "can't reach", tries to open a nearby door and retries.
     *
     * @param action - Function that performs the action and returns a result
     * @param shouldRetry - Function that checks if the result indicates a "can't reach" failure
     * @param maxRetries - Maximum number of door-open retries (default 2)
     * @returns The action result (either successful or final failure)
     *
     * @example
     * ```ts
     * return this.helpers.withDoorRetry(
     *   () => this._pickupItemOnce(target),
     *   (r) => r.reason === 'cant_reach'
     * );
     * ```
     */
    async withDoorRetry<T extends { success: boolean }>(
        action: () => Promise<T>,
        shouldRetry: (result: T) => boolean,
        maxRetries: number = 2
    ): Promise<T> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const result = await action();

            // Success or non-retryable failure
            if (result.success || !shouldRetry(result)) {
                return result;
            }

            // Try opening a door before retrying
            if (attempt < maxRetries) {
                const doorOpened = await this.tryOpenBlockingDoor();
                if (doorOpened) {
                    await this.sdk.waitForTicks(1);
                    continue;
                }
            }

            // No door to open or max retries reached
            return result;
        }

        // TypeScript needs this, but it's unreachable
        return action();
    }

    // ============ Door Handling ============

    /**
     * Try to find and open a nearby blocking door/gate/fence.
     * Walks to the door using raw sendWalk (not walkTo) to avoid recursion.
     * @param maxDistance - Maximum distance to search for openable objects (default 15 tiles)
     * @returns true if something was successfully opened
     */
    async tryOpenBlockingDoor(maxDistance: number = 15): Promise<boolean> {
        // Look for any loc with an "Open" option - covers doors, gates, fences, pens, etc.
        const openables = this.sdk.getNearbyLocs()
            .filter(l => l.optionsWithIndex.some(o => /^open$/i.test(o.text)))
            .filter(l => l.distance <= maxDistance)
            .sort((a, b) => a.distance - b.distance);

        if (openables.length === 0) {
            return false;
        }

        const door = openables[0]!;
        const doorX = door.x;
        const doorZ = door.z;
        const doorId = door.id;

        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (!openOpt) {
            return true; // Already open (has Close option instead)
        }

        // If we're not adjacent to the door, walk to an adjacent tile first.
        // sendInteractLoc relies on server-side pathfinding which enforces closed
        // door collision — it can't route through the very door we're trying to open.
        // Raw sendWalk to an adjacent tile avoids this since we stay on our side.
        const playerState = this.sdk.getState()?.player;
        if (playerState) {
            const px = playerState.worldX;
            const pz = playerState.worldZ;
            const dx = Math.abs(px - door.x);
            const dz = Math.abs(pz - door.z);
            const isAdjacent = (dx <= 1 && dz <= 1) && (dx + dz > 0);

            if (!isAdjacent) {
                // Walk toward the door — pick the adjacent tile closest to us
                const candidates = [
                    { x: door.x, z: door.z - 1 },
                    { x: door.x, z: door.z + 1 },
                    { x: door.x - 1, z: door.z },
                    { x: door.x + 1, z: door.z },
                ].sort((a, b) => {
                    const da = Math.abs(a.x - px) + Math.abs(a.z - pz);
                    const db = Math.abs(b.x - px) + Math.abs(b.z - pz);
                    return da - db;
                });

                // Try the closest adjacent tile
                const target = candidates[0]!;
                await this.sdk.sendWalk(target.x, target.z, true);
                await this.waitForMovementComplete(target.x, target.z, 1);
            }
        }

        const startTick = this.sdk.getState()?.tick || 0;
        await this.sdk.sendInteractLoc(door.x, door.z, door.id, openOpt.opIndex);

        // Wait for door to open (with longer timeout to allow for walking)
        try {
            await this.sdk.waitForCondition(state => {
                // Check for "can't reach" messages - means we truly can't get there
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("can't reach") || text.includes("cannot reach")) {
                            return true; // Exit early on can't reach
                        }
                    }
                }

                const doorNow = state.nearbyLocs.find(l =>
                    l.x === doorX && l.z === doorZ && l.id === doorId
                );
                if (!doorNow) return true; // Door gone = opened
                return !doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text)); // No "Open" option = opened
            }, 8000); // Longer timeout to allow walking + opening

            // Check if we got a "can't reach" message
            const finalState = this.sdk.getState();
            for (const msg of finalState?.gameMessages ?? []) {
                if (msg.tick > startTick) {
                    const text = msg.text.toLowerCase();
                    if (text.includes("can't reach") || text.includes("cannot reach")) {
                        return false;
                    }
                }
            }

            // Verify door actually opened
            const doorAfter = finalState?.nearbyLocs.find(l =>
                l.x === doorX && l.z === doorZ && l.id === doorId
            );
            if (!doorAfter || !doorAfter.optionsWithIndex.some(o => /^open$/i.test(o.text))) {
                return true;
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * Check recent game messages for "can't reach" indicators.
     * @param startTick - Only check messages after this tick
     */
    checkCantReachMessage(startTick: number): boolean {
        const state = this.sdk.getState();
        if (!state) return false;

        for (const msg of state.gameMessages) {
            if (msg.tick > startTick) {
                const text = msg.text.toLowerCase();
                if (text.includes("can't reach") || text.includes("cannot reach") || text.includes("i can't reach")) {
                    return true;
                }
            }
        }
        return false;
    }

    // ============ Movement Helpers ============

    async waitForMovementComplete(
        targetX: number,
        targetZ: number,
        tolerance: number = 3
    ): Promise<{ arrived: boolean; stoppedMoving: boolean; x: number; z: number }> {
        // All logic is tick-based so it scales with any server tick rate.
        // Running = 2 tiles/tick. Walking = 1 tile/tick.
        const TILES_PER_TICK = 2;
        const STUCK_TICKS = 2;       // 2 ticks of no movement = stuck
        const MIN_TICKS = 3;         // minimum ticks to wait
        const SAFETY_MS = 15_000;    // hard ms failsafe if state updates stop entirely

        const startState = this.sdk.getState();
        if (!startState?.player) {
            return { arrived: false, stoppedMoving: true, x: 0, z: 0 };
        }

        const startX = startState.player.worldX;
        const startZ = startState.player.worldZ;
        const startTick = startState.tick;

        const distance = Math.sqrt(
            Math.pow(targetX - startX, 2) + Math.pow(targetZ - startZ, 2)
        );
        const expectedTicks = Math.ceil(distance / TILES_PER_TICK);
        const maxTicks = Math.max(MIN_TICKS, Math.ceil(expectedTicks * 1.5));

        let lastX = startX;
        let lastZ = startZ;
        let lastMoveTick = startTick;

        return new Promise((resolve) => {
            let resolved = false;
            const done = (result: { arrived: boolean; stoppedMoving: boolean; x: number; z: number }) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(safetyTimer);
                unsub();
                resolve(result);
            };

            // Hard ms failsafe in case state updates stop arriving
            const safetyTimer = setTimeout(() => {
                const s = this.sdk.getState()?.player;
                const fx = s?.worldX ?? lastX;
                const fz = s?.worldZ ?? lastZ;
                const fd = Math.sqrt(Math.pow(targetX - fx, 2) + Math.pow(targetZ - fz, 2));
                done({ arrived: fd <= tolerance, stoppedMoving: true, x: fx, z: fz });
            }, SAFETY_MS);

            const unsub = this.sdk.onStateUpdate((state) => {
                if (!state?.player) return;

                const currentX = state.player.worldX;
                const currentZ = state.player.worldZ;
                const currentTick = state.tick;

                // Check arrival
                const distToTarget = Math.sqrt(
                    Math.pow(targetX - currentX, 2) + Math.pow(targetZ - currentZ, 2)
                );
                if (distToTarget <= tolerance) {
                    done({ arrived: true, stoppedMoving: false, x: currentX, z: currentZ });
                    return;
                }

                // Track movement by tick
                if (currentX !== lastX || currentZ !== lastZ) {
                    lastMoveTick = currentTick;
                    lastX = currentX;
                    lastZ = currentZ;
                }

                // Stuck: no movement for STUCK_TICKS
                if (currentTick - lastMoveTick >= STUCK_TICKS) {
                    done({ arrived: false, stoppedMoving: true, x: currentX, z: currentZ });
                    return;
                }

                // Tick budget exceeded
                if (currentTick - startTick >= maxTicks) {
                    done({ arrived: distToTarget <= tolerance, stoppedMoving: true, x: currentX, z: currentZ });
                }
            });
        });
    }

    // ============ Walk Step Helper ============

    /**
     * Take a single walk step toward a target and report the result.
     * Used by walkTo to avoid duplicating walk-and-check logic.
     */
    async walkStepToward(
        targetX: number,
        targetZ: number,
        tolerance: number,
        lastPos: { x: number; z: number }
    ): Promise<{ status: 'arrived' | 'progress' | 'stuck'; pos: { x: number; z: number } }> {
        await this.sdk.sendWalk(targetX, targetZ, true);
        const moveResult = await this.waitForMovementComplete(targetX, targetZ, tolerance);

        const pos = this.sdk.getState()?.player;
        if (!pos) {
            return { status: 'stuck', pos: lastPos };
        }

        const currentPos = { x: pos.worldX, z: pos.worldZ };

        // Check if arrived
        const distToTarget = Math.sqrt(
            Math.pow(targetX - currentPos.x, 2) + Math.pow(targetZ - currentPos.z, 2)
        );
        if (distToTarget <= tolerance) {
            return { status: 'arrived', pos: currentPos };
        }

        // Check if stuck (didn't move much and stopped)
        const moved = Math.sqrt(
            Math.pow(currentPos.x - lastPos.x, 2) + Math.pow(currentPos.z - lastPos.z, 2)
        );
        if (moved < 2 && moveResult.stoppedMoving) {
            return { status: 'stuck', pos: currentPos };
        }

        return { status: 'progress', pos: currentPos };
    }

    /**
     * Calculate distance between two points.
     */
    distance(x1: number, z1: number, x2: number, z2: number): number {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
    }

    // ============ Specific Door Opening ============

    /**
     * Open a specific door at exact coordinates.
     * Used by proactive door-opening when the pathfinder identifies doors along the route.
     * @returns true if the door was opened (or was already open)
     */
    async openDoorAt(doorX: number, doorZ: number): Promise<boolean> {
        const locs = this.sdk.getNearbyLocs();
        const door = locs.find(l => l.x === doorX && l.z === doorZ);
        if (!door) return false;

        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (!openOpt) return true; // Already open (has Close option instead)

        // Walk to an adjacent tile using raw sendWalk to avoid recursion
        const playerState = this.sdk.getState()?.player;
        if (playerState) {
            const px = playerState.worldX;
            const pz = playerState.worldZ;
            const dx = Math.abs(px - doorX);
            const dz = Math.abs(pz - doorZ);
            const isAdjacent = (dx <= 1 && dz <= 1) && (dx + dz > 0);

            if (!isAdjacent) {
                const candidates = [
                    { x: doorX, z: doorZ - 1 },
                    { x: doorX, z: doorZ + 1 },
                    { x: doorX - 1, z: doorZ },
                    { x: doorX + 1, z: doorZ },
                ].sort((a, b) => {
                    const da = Math.abs(a.x - px) + Math.abs(a.z - pz);
                    const db = Math.abs(b.x - px) + Math.abs(b.z - pz);
                    return da - db;
                });

                const target = candidates[0]!;
                await this.sdk.sendWalk(target.x, target.z, true);
                await this.waitForMovementComplete(target.x, target.z, 1);
            }
        }

        const startTick = this.sdk.getState()?.tick || 0;
        await this.sdk.sendInteractLoc(doorX, doorZ, door.id, openOpt.opIndex);

        try {
            await this.sdk.waitForCondition(state => {
                const doorNow = state.nearbyLocs.find(l =>
                    l.x === doorX && l.z === doorZ && l.id === door.id
                );
                if (!doorNow) return true; // Door gone = opened
                return !doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text));
            }, 8000);

            // Verify door actually opened
            const doorAfter = this.sdk.getState()?.nearbyLocs.find(l =>
                l.x === doorX && l.z === doorZ && l.id === door.id
            );
            return !doorAfter || !doorAfter.optionsWithIndex.some(o => /^open$/i.test(o.text));
        } catch {
            return false;
        }
    }

    // ============ Resolution Helpers ============

    resolveLocation(
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

    resolveInventoryItem(
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

    resolveGroundItem(target: GroundItem | string | RegExp): GroundItem | null {
        if (typeof target === 'object' && 'x' in target) {
            return target;
        }
        return this.sdk.findGroundItem(target);
    }

    resolveNpc(target: NearbyNpc | string | RegExp): NearbyNpc | null {
        if (typeof target === 'object' && 'index' in target) {
            return target;
        }
        return this.sdk.findNearbyNpc(target);
    }

    resolveShopItem(
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
