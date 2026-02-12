// Bot SDK - Action Helpers
// Private helper methods extracted from BotActions for reusability

import { BotSDK } from './index';
import { findLongPath } from './pathfinding';
import type { LocGateInfo } from './pathfinding';
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
     *
     * If preferredCoords are provided, tries to open a door at those exact
     * coordinates first (from pathfinding analysis), falling back to the
     * nearest openable loc only if none of the preferred doors are found.
     *
     * @param maxDistance - Maximum distance to search for openable objects (default 15 tiles)
     * @param preferredCoords - Optional list of door coordinates to try first (from path analysis)
     * @returns true if something was successfully opened
     */
    async tryOpenBlockingDoor(
        maxDistance: number = 15,
        preferredCoords?: Array<{ x: number; z: number }>
    ): Promise<boolean> {
        // Look for any loc with an "Open" option - covers doors, gates, fences, pens, etc.
        const openables = this.sdk.getNearbyLocs()
            .filter(l => l.optionsWithIndex.some(o => /^open$/i.test(o.text)))
            .filter(l => l.distance <= maxDistance);

        if (openables.length === 0) {
            return false;
        }

        // If we have preferred coordinates from path analysis, try those first.
        // This avoids opening irrelevant nearby doors (chicken pens, etc.)
        let door = undefined as typeof openables[0] | undefined;
        if (preferredCoords && preferredCoords.length > 0) {
            for (const pref of preferredCoords) {
                door = openables.find(l => l.x === pref.x && l.z === pref.z);
                if (door) break;
            }
        }

        // Fallback: nearest openable door
        if (!door) {
            door = openables.sort((a, b) => a.distance - b.distance)[0]!;
        }

        const doorX = door.x;
        const doorZ = door.z;
        const doorId = door.id;

        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text));
        if (!openOpt) {
            return true; // Already open (has Close option instead)
        }

        // Walk to an adjacent tile first — sendInteractLoc uses server-side
        // pathfinding which enforces closed door collision, so it can't route
        // through the very door we're trying to open.
        await this.walkAdjacentTo(door.x, door.z);

        const startTick = this.sdk.getState()?.tick || 0;
        await this.sdk.sendInteractLoc(door.x, door.z, door.id, openOpt.opIndex);

        // Wait for door to open (with longer timeout to allow for walking)
        try {
            await this.sdk.waitForCondition(state => {
                // Check door state FIRST — if it's gone or changed, that's definitive
                const doorNow = state.nearbyLocs.find(l =>
                    l.x === doorX && l.z === doorZ && l.id === doorId
                );
                if (!doorNow) return true; // Door gone = opened
                if (!doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text))) return true; // No "Open" = opened

                // Only check failure messages if door hasn't changed yet
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("locked")) {
                            return true; // Locked is definitive — exit early
                        }
                    }
                }
                return false;
            }, 8000);

            // Verify: check door state as the primary success signal
            const finalState = this.sdk.getState();
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

    // ============ Walk Adjacent ============

    /**
     * Walk to a tile adjacent to the given coordinates using raw sendWalk.
     * Uses the local pathfinder to pick a tile that is actually reachable
     * from the player's current position — not just the closest by distance.
     *
     * This is critical for doors: a door's wall blocks one side, so the
     * closest adjacent tile might be on the unreachable side of the wall.
     * The pathfinder respects walls (except unmasked doors) so it correctly
     * identifies which side the player can reach.
     *
     * @returns true if already adjacent or successfully walked adjacent
     */
    private async walkAdjacentTo(targetX: number, targetZ: number): Promise<boolean> {
        const playerState = this.sdk.getState()?.player;
        if (!playerState) return false;

        const px = playerState.worldX;
        const pz = playerState.worldZ;
        const level = playerState.level ?? 0;
        const dx = Math.abs(px - targetX);
        const dz = Math.abs(pz - targetZ);
        const isAdjacent = (dx <= 1 && dz <= 1) && (dx + dz > 0);

        if (isAdjacent) return true;

        // Sort candidates by Manhattan distance (prefer closer tiles)
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

        // Use the local pathfinder to find the first candidate that's actually
        // reachable. Without this check, we might pick a tile on the wrong side
        // of a door wall (e.g. inside Lumbridge castle when approaching from outside).
        let target = candidates[0]!;
        for (const candidate of candidates) {
            const path = findLongPath(level, px, pz, candidate.x, candidate.z, 50);
            if (path.length > 0) {
                // Verify the path actually reaches the candidate (not just a partial path)
                const last = path[path.length - 1]!;
                if (Math.abs(last.x - candidate.x) <= 1 && Math.abs(last.z - candidate.z) <= 1) {
                    target = candidate;
                    break;
                }
            }
        }

        await this.sdk.sendWalk(target.x, target.z, true);
        await this.waitForMovementComplete(target.x, target.z, 1);
        return true;
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
     *
     * Walks adjacent to the door FIRST (to ensure it's within rendering range),
     * then looks it up in nearbyLocs. Also checks neighboring tiles since double
     * doors (e.g. Lumbridge castle) may anchor at an adjacent tile.
     *
     * @returns true if the door was opened (or was already open)
     */
    async openDoorAt(doorX: number, doorZ: number): Promise<boolean> {
        // Walk to an adjacent tile FIRST — this ensures the door is within
        // rendering range so it appears in nearbyLocs. Without this, doors
        // at 12-15 tiles distance may not be rendered yet, causing a false
        // "not found" that permanently blocks the door in the pathfinder.
        await this.walkAdjacentTo(doorX, doorZ);

        // Wait a tick for state to update with newly-rendered locs
        await this.sdk.waitForTicks(1);

        // Search for the door at the exact tile and neighboring tiles.
        // Double doors (e.g. Lumbridge castle large doors) span two tiles
        // but may only have a single loc object anchored at one of them.
        const searchTiles = [
            { x: doorX, z: doorZ },
            { x: doorX, z: doorZ + 1 },
            { x: doorX, z: doorZ - 1 },
            { x: doorX + 1, z: doorZ },
            { x: doorX - 1, z: doorZ },
        ];

        const locs = this.sdk.getNearbyLocs();
        let door = null as typeof locs[0] | null;
        for (const tile of searchTiles) {
            const found = locs.find(l =>
                l.x === tile.x && l.z === tile.z &&
                l.optionsWithIndex.some(o => /^open$/i.test(o.text))
            );
            if (found) {
                door = found;
                break;
            }
        }

        if (!door) {
            // Check if the door is already open (has "Close" option or gone entirely)
            const closeable = locs.find(l =>
                searchTiles.some(t => l.x === t.x && l.z === t.z) &&
                l.optionsWithIndex.some(o => /^close$/i.test(o.text))
            );
            if (closeable) {
                return true; // Already open
            }
            return false;
        }

        const openOpt = door.optionsWithIndex.find(o => /^open$/i.test(o.text))!;
        const actualDoorX = door.x;
        const actualDoorZ = door.z;

        // If the door we found is on a different tile than where we walked adjacent to,
        // walk adjacent to the actual door tile
        if (actualDoorX !== doorX || actualDoorZ !== doorZ) {
            await this.walkAdjacentTo(actualDoorX, actualDoorZ);
        }

        const startTick = this.sdk.getState()?.tick || 0;
        await this.sdk.sendInteractLoc(actualDoorX, actualDoorZ, door.id, openOpt.opIndex);

        try {
            await this.sdk.waitForCondition(state => {
                // Check door state FIRST — if it's gone or changed, that's definitive
                const doorNow = state.nearbyLocs.find(l =>
                    l.x === actualDoorX && l.z === actualDoorZ && l.id === door!.id
                );
                if (!doorNow) return true; // Door gone = opened
                if (!doorNow.optionsWithIndex.some(o => /^open$/i.test(o.text))) return true; // No "Open" = opened

                // Only check failure messages if door hasn't changed yet
                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("locked")) {
                            return true; // Locked is definitive — exit early
                        }
                    }
                }
                return false;
            }, 8000);

            // Verify: check door state as the primary success signal
            const finalState = this.sdk.getState();
            const doorAfter = finalState?.nearbyLocs.find(l =>
                l.x === actualDoorX && l.z === actualDoorZ && l.id === door!.id
            );
            const opened = !doorAfter || !doorAfter.optionsWithIndex.some(o => /^open$/i.test(o.text));
            if (opened) {
                // Door opened successfully
            }

            // If door didn't open, check for "locked" message specifically
            if (!opened) {
                for (const msg of finalState?.gameMessages ?? []) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("locked")) {
                            return false;
                        }
                    }
                }
            }

            return opened;
        } catch {
            return false;
        }
    }

    /**
     * Open a multi-tile loc gate (centrepiece locs like Tree Gnome Stronghold gates).
     * These occupy a width×length area and use LOC collision, not wall collision.
     */
    async openLocGateAt(gate: LocGateInfo): Promise<{ opened: boolean; newPos?: { x: number; z: number } }> {
        // Compute occupied tiles based on rotation
        const rw = (gate.angle === 1 || gate.angle === 3) ? gate.length : gate.width;
        const rl = (gate.angle === 1 || gate.angle === 3) ? gate.width : gate.length;

        // Walk to the nearest edge of the gate
        await this.walkAdjacentTo(gate.x + Math.floor(rw / 2), gate.z + Math.floor(rl / 2));
        await this.sdk.waitForTicks(1);

        // Search nearbyLocs for an openable loc at any of the gate's tiles
        const locs = this.sdk.getNearbyLocs();
        let gateLoc = null as typeof locs[0] | null;

        for (let dx = 0; dx < rw && !gateLoc; dx++) {
            for (let dz = 0; dz < rl && !gateLoc; dz++) {
                const found = locs.find(l =>
                    l.x === gate.x + dx && l.z === gate.z + dz &&
                    l.optionsWithIndex.some(o => /^open$/i.test(o.text))
                );
                if (found) gateLoc = found;
            }
        }

        // Also check the anchor tile directly
        if (!gateLoc) {
            gateLoc = locs.find(l =>
                l.x === gate.x && l.z === gate.z &&
                l.optionsWithIndex.some(o => /^open$/i.test(o.text))
            ) ?? null;
        }

        if (!gateLoc) {
            // Check if already open (loc gone or has Close option)
            for (let dx = 0; dx < rw; dx++) {
                for (let dz = 0; dz < rl; dz++) {
                    const closeable = locs.find(l =>
                        l.x === gate.x + dx && l.z === gate.z + dz &&
                        l.optionsWithIndex.some(o => /^close$/i.test(o.text))
                    );
                    if (closeable) return { opened: true }; // Already open
                }
            }
            return { opened: false };
        }

        const openOpt = gateLoc.optionsWithIndex.find(o => /^open$/i.test(o.text))!;

        // Walk adjacent to the actual loc if needed
        await this.walkAdjacentTo(gateLoc.x, gateLoc.z);

        const startTick = this.sdk.getState()?.tick || 0;
        await this.sdk.sendInteractLoc(gateLoc.x, gateLoc.z, gateLoc.id, openOpt.opIndex);

        try {
            await this.sdk.waitForCondition(state => {
                // Check if the gate loc is gone or changed
                const gateNow = state.nearbyLocs.find(l =>
                    l.x === gateLoc!.x && l.z === gateLoc!.z && l.id === gateLoc!.id
                );
                if (!gateNow) return true; // Gate removed = opened
                if (!gateNow.optionsWithIndex.some(o => /^open$/i.test(o.text))) return true;

                for (const msg of state.gameMessages) {
                    if (msg.tick > startTick) {
                        const text = msg.text.toLowerCase();
                        if (text.includes("locked") || text.includes("can't")) return true;
                    }
                }
                return false;
            }, 8000);

            const finalState = this.sdk.getState();
            const gateAfter = finalState?.nearbyLocs.find(l =>
                l.x === gateLoc!.x && l.z === gateLoc!.z && l.id === gateLoc!.id
            );
            const opened = !gateAfter || !gateAfter.optionsWithIndex.some(o => /^open$/i.test(o.text));
            if (opened) {
                // Server force-moves player through loc gates — wait for it to complete
                await this.sdk.waitForTicks(3);
                const p = this.sdk.getState()?.player;
                return { opened: true, newPos: p ? { x: p.worldX, z: p.worldZ } : undefined };
            }
            return { opened: false };
        } catch {
            return { opened: false };
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
