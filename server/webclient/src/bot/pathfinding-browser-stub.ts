// Browser stub for sdk/pathfinding.ts.
//
// The real module loads a 273KB rsmod WASM binary + a 22MB collision-data.json
// snapshot to pathfind in Node, where there is no game client to ask. In the
// browser the game client already has a live collision map and native
// pathfinding, so none of that is needed - and bundling it bloats the client to
// ~29MB and breaks wasm-bindgen init. We alias `./pathfinding` to this stub for
// the webclient build (see bundle.ts) and route bot.walkTo through the client's
// native walk instead (see ScriptRunnerUI).
//
// Must export every symbol sdk/index.ts and sdk/actions.ts import from
// './pathfinding'. Currently: isZoneAllocated, findLongPath, findDoorsAlongPath,
// blockDoor. The rest are exported for completeness so any future import resolves.

export interface DoorInfo {
    level: number;
    x: number;
    z: number;
    angle: number;
    shape: number;
    blockrange: boolean;
}

type Waypoint = { x: number; z: number; level: number };

export function initPathfinding(): void {
    // no-op: native client pathfinding needs no init
}

// Returning false makes sdk.findPath() fail fast with a clear message rather than
// spin, steering callers toward the client's native walk (bot.walkTo override).
export function isZoneAllocated(_level: number, _x: number, _z: number): boolean {
    return false;
}

export function findLongPath(
    _level: number,
    _srcX: number,
    _srcZ: number,
    _destX: number,
    _destZ: number,
    _maxWaypoints?: number
): Waypoint[] {
    return [];
}

export function isTileWalkable(_level: number, _x: number, _z: number): boolean {
    return true;
}

export function isFlagged(_x: number, _z: number, _level: number, _masks: number): boolean {
    return false;
}

export function isZoneLikelyLand(_level: number, _x: number, _z: number): boolean {
    return true;
}

export function findDoorsAlongPath(_waypoints: Array<{ x: number; z: number }>): DoorInfo[] {
    return [];
}

export function getDoorAt(_level: number, _x: number, _z: number): DoorInfo | undefined {
    return undefined;
}

export function blockDoor(_level: number, _x: number, _z: number): boolean {
    return false;
}
