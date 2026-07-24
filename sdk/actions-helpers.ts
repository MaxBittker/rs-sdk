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
     * Wraps an action with automatic door-opening and side-repositioning retry logic.
     * If the action fails due to "can't reach", tries to open a nearby door and retries.
     * If no door is found and adjacentTarget is provided, tries approaching from different
     * cardinal sides (N/S/E/W) before retrying — useful for wall-adjacent locations like
     * fireplaces, ranges, and furnaces.
     *
     * @param action - Function that performs the action and returns a result
     * @param shouldRetry - Function that checks if the result indicates a "can't reach" failure
     * @param maxRetries - Maximum number of retries (default 2)
     * @param adjacentTarget - Optional coords to try approaching from different sides
     * @returns The action result (either successful or final failure)
     *
     * @example
     * ```ts
     * return this.helpers.withDoorRetry(
     *   () => this._pickupItemOnce(target),
     *   (r) => r.reason === 'cant_reach',
     *   2,
     *   { x: loc.x, z: loc.z }
     * );
     * ```
     */
    async withDoorRetry<T extends { success: boolean }>(
        action: () => Promise<T>,
        shouldRetry: (result: T) => boolean,
        maxRetries: number = 2,
        adjacentTarget?: { x: number; z: number }
    ): Promise<T> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const result = await action();

            // Success or non-retryable failure
            if (result.success || !shouldRetry(result)) {
                return result;
            }

            if (attempt < maxRetries) {
                // Try approaching from a different side (common case for
                // wall-adjacent locs like fireplaces, bank booths, furnaces)
                if (adjacentTarget) {
                    const repositioned = await this.walkAdjacentTo(adjacentTarget.x, adjacentTarget.z);
                    if (repositioned) {
                        await this.sdk.waitForTicks(1);
                        continue;
                    }
                }

                // Only try doors if repositioning didn't help, with a tight radius
                // to avoid walking to random distant doors
                const doorOpened = await this.tryOpenBlockingDoor(5);
                if (doorOpened) {
                    await this.sdk.waitForTicks(1);
                    continue;
                }
            }

            // Nothing worked or max retries reached
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
        const result = await this.openDoorAt(door.x, door.z);
        return result === 'opened' || result === 'already_open';
    }

    /**
     * Get the public tick of the most recent game message. Use this before an
     * action to establish a baseline for checkCantReachMessage.
     */
    getMessageTick(): number {
        const state = this.sdk.getState();
        if (!state?.gameMessages?.length) return 0;
        // Take the max rather than indexing an end: StateCollector emits messages
        // chronologically (oldest-first), but don't depend on that ordering here —
        // reading the wrong end silently hands back a stale baseline, which makes
        // every "since this tick" check match ancient messages.
        let maxTick = 0;
        for (const msg of state.gameMessages) {
            const cursor = msg.observationId ?? msg.tick;
            if (cursor > maxTick) maxTick = cursor;
        }
        return maxTick;
    }

    /** True when a message was published after a cursor from getMessageTick(). */
    isMessageAfter(message: { tick: number; observationId?: number }, cursor: number): boolean {
        return (message.observationId ?? message.tick) > cursor;
    }

    /**
     * Check recent game messages for "can't reach" indicators.
     * @param sinceMessageTick - Only check messages with tick > this value.
     */
    checkCantReachMessage(sinceMessageTick: number): boolean {
        const state = this.sdk.getState();
        if (!state) return false;

        for (const msg of state.gameMessages) {
            if (this.isMessageAfter(msg, sinceMessageTick)) {
                const text = msg.text.toLowerCase();
                if (text.includes("can't reach") || text.includes("cannot reach") || text.includes("i can't reach")) {
                    return true;
                }
            }
        }
        return false;
    }

    // ============ Walk Adjacent ============

    /**
     * Walk to a tile adjacent to the given coordinates using raw sendWalk.
     * Picks the closest cardinal-adjacent tile to the player.
     * Used before interacting with doors/gates to avoid server-side pathfinding
     * through the very door we're trying to open.
     * @returns true if already adjacent or successfully walked adjacent
     */
    async walkAdjacentTo(targetX: number, targetZ: number): Promise<boolean> {
        const playerState = this.sdk.getState()?.player;
        if (!playerState) return false;

        const px = playerState.worldX;
        const pz = playerState.worldZ;
        const dx = Math.abs(px - targetX);
        const dz = Math.abs(pz - targetZ);
        const isAdjacent = (dx <= 1 && dz <= 1) && (dx + dz > 0);

        if (isAdjacent) return true;

        // Sort candidates by distance from player (closest first)
        const candidates = [
            { x: targetX, z: targetZ - 1 },
            { x: targetX, z: targetZ + 1 },
            { x: targetX - 1, z: targetZ },
            { x: targetX + 1, z: targetZ },
        ].sort((a, b) => {
            const da = Math.abs(a.x - px) + Math.abs(a.z - pz);
            const db = Math.abs(b.x - px) + Math.abs(b.z - pz);
            return da - db;
        });

        // Try each candidate — the closest one may be on the other side of a wall
        for (const target of candidates) {
            await this.sdk.sendWalk(target.x, target.z, true);
            const result = await this.waitForMovementComplete(target.x, target.z, 1);
            if (result.arrived) return true;

            // Check if we ended up adjacent to the target even if not at the candidate tile
            const nowX = result.x;
            const nowZ = result.z;
            const adjDx = Math.abs(nowX - targetX);
            const adjDz = Math.abs(nowZ - targetZ);
            if ((adjDx <= 1 && adjDz <= 1) && (adjDx + adjDz > 0)) return true;
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
    /**
     * Try to open a door at the given coordinates.
     * Returns: 'opened' | 'already_open' | 'locked' | 'cant_reach' | 'not_found'
     */
    async openDoorAt(doorX: number, doorZ: number): Promise<'opened' | 'already_open' | 'locked' | 'cant_reach' | 'not_found'> {
        const locs = this.sdk.getNearbyLocs();
        const door = locs.find(l => l.x === doorX && l.z === doorZ);
        if (!door) return 'not_found';

        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (!openOpt) return 'already_open'; // Already open (has Close option instead)

        // Helper: attempt interact and wait for result
        const tryInteract = async (): Promise<'opened' | 'locked' | 'cant_reach' | 'timeout'> => {
            const msgBaseline = this.getMessageTick();
            await this.sdk.sendInteractLoc(doorX, doorZ, door.id, openOpt.opIndex);

            try {
                let failReason: 'locked' | 'cant_reach' | null = null;
                await this.sdk.waitForCondition(state => {
                    for (const msg of state.gameMessages) {
                        if (this.isMessageAfter(msg, msgBaseline)) {
                            const text = msg.text.toLowerCase();
                            if (text.includes("locked")) { failReason = 'locked'; return true; }
                            if (text.includes("can't reach") || text.includes("cannot reach")) { failReason = 'cant_reach'; return true; }
                        }
                    }
                    const doorNow = state.nearbyLocs.find(l =>
                        l.x === doorX && l.z === doorZ && l.id === door.id
                    );
                    if (!doorNow) return true; // Door gone = opened
                    return !doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text));
                }, 8000);

                if (failReason) return failReason;

                // Verify door actually opened
                const doorAfter = this.sdk.getState()?.nearbyLocs.find(l =>
                    l.x === doorX && l.z === doorZ && l.id === door.id
                );
                if (!doorAfter || !doorAfter.optionsWithIndex.some(o => /^open$/i.test(o.text))) {
                    return 'opened';
                }
                return 'timeout';
            } catch {
                return 'timeout';
            }
        };

        // Attempt 1: interact directly — let the game server walk us to the door
        const result1 = await tryInteract();
        if (result1 === 'opened') return 'opened';
        if (result1 === 'locked') return 'locked';

        // Attempt 2: walk adjacent manually then retry interact
        // This handles cases where server-side pathfinding can't route through the closed door
        const adjacent = await this.walkAdjacentTo(doorX, doorZ);
        if (!adjacent) return 'cant_reach';

        const result2 = await tryInteract();
        if (result2 === 'opened') return 'opened';
        if (result2 === 'locked') return 'locked';
        return 'cant_reach';
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
