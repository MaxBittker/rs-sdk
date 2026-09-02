// Bot SDK - Action Helpers
// Private helper methods extracted from BotActions for reusability

import { BotSDK } from './index';
import { shortestNameMatch } from './action-quantity';
import type {
    NearbyLoc,
    NearbyNpc,
    NearbyPlayer,
    CombatTarget,
    InventoryItem,
    GroundItem,
    ShopItem,
    BotWorldState,
} from './types';

/**
 * Server refusals that stop a PvP attack or spell before it happens, lowercased.
 * From `~pvp_is_attackable` and friends in
 * server/content/scripts/skill_combat/scripts/pvp/pvp_combat.rs2.
 */
export const PVP_REFUSALS = [
    "you can't attack players who aren't in the wilderness",
    'your level difference is too great',
    "i'm already under attack",
    'someone else is already fighting your opponent',
    'kolodion allows only magical combat'
] as const;

/**
 * Refusals that clear on their own: single-way combat locks a fight to two
 * participants for 8 ticks after the last hit, so retrying later can work. The
 * other {@link PVP_REFUSALS} need you to move or pick a different opponent.
 *
 * Both entity spaces are here - the npc wording comes from player_combat.rs2
 * ("I'm already under attack!", "Someone else is fighting that.") and the pvp
 * wording from pvp_combat.rs2.
 */
export const ALREADY_FIGHTING_REFUSALS = [
    'already under attack',
    'someone else is fighting',
    'someone else is already fighting your opponent'
] as const;

/** "You do not have enough..." / "You don't have enough...", the missing-rune refusal. */
export const NO_RUNES_REFUSALS = [
    'do not have enough',
    "don't have enough"
] as const;

export class ActionHelpers {
    constructor(private sdk: BotSDK) {}

    /**
     * The first message published since a getMessageTick() cursor that contains
     * one of `phrases` (lowercase), or null. Refusals are the reason a combat
     * action silently does nothing: the packet lands, the server checks its
     * rules, and answers with a game message instead of an effect.
     */
    findRefusal(sinceMessageTick: number, phrases: readonly string[]): string | null {
        const state = this.sdk.getState();
        if (!state) return null;

        for (const msg of state.gameMessages) {
            if (this.isMessageAfter(msg, sinceMessageTick)) {
                const text = msg.text.toLowerCase();
                if (phrases.some(phrase => text.includes(phrase))) {
                    return msg.text;
                }
            }
        }
        return null;
    }

    /** The first PvP refusal since a getMessageTick() cursor, or null. */
    findPvpRefusal(sinceMessageTick: number): string | null {
        return this.findRefusal(sinceMessageTick, PVP_REFUSALS);
    }

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

    // ============ Op Rejection ============

    /**
     * Snapshot the op-rejection counter. Take this immediately before sending an
     * op, hand it to wasOpRejectedSince() afterwards.
     *
     * Returns -1 when the connected client is too old to publish opFeedback,
     * which wasOpRejectedSince() then reports as "no rejection" - the signal is
     * an optimisation, never a precondition.
     */
    opRejectionCursor(): number {
        return this.sdk.getState()?.opFeedback?.opRejectedCount ?? -1;
    }

    /**
     * True when the server has probably discarded an op since the cursor. Read
     * it as "that click did nothing, try again", not as a diagnosis - nothing
     * observable separates the possible causes (blocking modal, active stun or
     * action delay, target out of view, option the target no longer has).
     */
    wasOpRejectedSince(cursor: number, state?: BotWorldState): boolean {
        if (cursor < 0) return false;
        const feedback = (state ?? this.sdk.getState())?.opFeedback;
        if (!feedback) return false;
        return feedback.opRejectedCount > cursor;
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

    /**
     * Compact signature of the inventory for change detection. Some server
     * scripts (cow milking, flour bin) produce no animation, dialog, or
     * distinctive message — the item swap is the only observable evidence.
     */
    inventorySignature(state: { inventory?: { slot: number; id: number; count: number }[] } | null): string {
        if (!state?.inventory) return '';
        return state.inventory.map(i => `${i.slot}:${i.id}:${i.count}`).join(',');
    }

    /**
     * Re-find a previously resolved loc by identity (id + tile) in current
     * state. Name-based re-resolution picks the nearest same-named loc, which
     * is the wrong one when duplicates sit within a few tiles (Varrock cart
     * crates). Returns null if that exact loc is no longer visible.
     */
    refindLocation(original: { id: number; x: number; z: number }): NearbyLoc | null {
        return this.sdk.getState()?.nearbyLocs.find(
            l => l.id === original.id && l.x === original.x && l.z === original.z
        ) ?? null;
    }

    resolveLocation(
        target: NearbyLoc | string | RegExp | undefined,
        defaultPattern: RegExp,
        withOption?: string | RegExp
    ): NearbyLoc | null {
        if (typeof target === 'object' && target !== null && 'x' in target) {
            // A loc reference carried across a climb/descend is stale: the
            // click would resolve against whatever occupies these coordinates
            // on the wrong floor. Re-resolve from current state instead, and
            // fail loudly (null -> loc_not_found) if it isn't on this plane.
            const playerLevel = this.sdk.getState()?.player?.level;
            if (playerLevel === undefined || target.level === undefined || target.level === playerLevel) {
                return target;
            }
            return this.sdk.getState()?.nearbyLocs.find(
                l => l.id === target.id && l.x === target.x && l.z === target.z
            ) ?? null;
        }
        const pattern = target ?? defaultPattern;
        if (withOption !== undefined) {
            // Prefer a loc that actually offers the requested option -
            // overlapping option-less duplicates (Lumbridge furnace) otherwise
            // win on distance and dead-end the interaction. Fall back to plain
            // name matching so the "no matching option" error can still name
            // the loc it found.
            const withOptionMatch = this.sdk.findNearbyLoc(pattern, { withOption });
            if (withOptionMatch) return withOptionMatch;
        }
        return this.sdk.findNearbyLoc(pattern);
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

    /**
     * Re-find an NPC the caller already chose, by its server slot `index`.
     *
     * The index is the entity handle interact packets address and it survives
     * the npc walking (or a fishing spot relocating). Re-resolving by name
     * instead hands the action to whichever same-named neighbour is nearest on
     * arrival - the wrong fishing spot, the wrong "Man". Returns null when the
     * slot is no longer in view.
     */
    refindNpc(original: { index: number }): NearbyNpc | null {
        return this.sdk.getState()?.nearbyNpcs.find(n => n.index === original.index) ?? null;
    }

    /**
     * After walking, re-resolve an npc target: a pattern re-finds by pattern
     * (keeping the caller's anchors), an entity re-finds by identity.
     */
    refindNpcTarget(target: NearbyNpc | string | RegExp, resolved: NearbyNpc): NearbyNpc | null {
        if (typeof target === 'object' && 'index' in target) {
            return this.refindNpc(resolved);
        }
        return this.resolveNpc(target);
    }

    /**
     * Resolve a combat target that may be an npc or another player.
     *
     * A passed-in entity is used as-is (its `kind` says which it is). A name or
     * pattern is matched against nearby NPCs first and players second, so a
     * player called "Goblin" standing next to a goblin does not steal the fight;
     * pass the entity from `sdk.findNearbyPlayer(...)` when you mean the player.
     */
    resolveCombatTarget(target: CombatTarget): NearbyNpc | NearbyPlayer | null {
        if (typeof target === 'object' && 'index' in target) {
            if (Array.isArray((target as { optionsWithIndex?: unknown }).optionsWithIndex)) {
                return target;
            }
            // A bare {index, name} handle (kept across ticks by a re-attack
            // loop) is not a live entry: reading .optionsWithIndex off it used
            // to throw and silently stop the fight loop. Re-find the live entry
            // by its server slot instead.
            const state = this.sdk.getState();
            const kind = (target as { kind?: string }).kind;
            const npc = kind === 'player' ? null : state?.nearbyNpcs.find(n => n.index === target.index) ?? null;
            const player = kind === 'npc' ? null : state?.nearbyPlayers.find(p => p.index === target.index) ?? null;
            return npc ?? player ?? null;
        }
        return this.sdk.findNearbyNpc(target) ?? this.sdk.findNearbyPlayer(target);
    }

    resolveShopItem(
        target: ShopItem | InventoryItem | string | RegExp,
        items: ShopItem[]
    ): ShopItem | null {
        if (typeof target === 'object' && 'id' in target && 'name' in target) {
            return items.find(i => i.id === target.id) ?? null;
        }
        return shortestNameMatch(items, target);
    }
}
