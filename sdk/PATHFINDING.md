# Pathfinding System

The RuneScape SDK uses a zero-dependency, client-side pathfinding system powered by the `rsmod-pathfinder` WebAssembly module and a packed binary collision cache.

## Architecture

The system is split into three layers:

1.  **Collision Layer (`rsmod-pathfinder`)**: A high-performance WASM module that manages the collision matrix and performs A* pathfinding.
2.  **Spatial Cache (`collision-data.bin`)**: A packed binary format containing world collision flags, allocated zones, and door metadata.
3.  **Routing Layer (`sdk/pathfinding.ts`)**: Handles long-distance multi-segment routing, door masking, and one-way directional logic (e.g., Draynor Manor).

## High-Performance Binary Cache

To ensure near-instant bot startup, the world collision data is stored in a packed binary format (`.bin`) rather than JSON.

- **Initialization Speed**: ~20ms (vs ~260ms for JSON).
- **Format**: 8-byte packed tiles.
  - **Packed Coords (4 bytes)**: `Level (2 bits) | X (15 bits) | Z (15 bits)`
  - **Collision Flags (4 bytes)**: Raw `CollisionFlag` bitmask.

To re-pack the data after server map changes, use:
```bash
bun scripts/pack-collision.ts
```

## Multi-Segment Routing

Standard A* pathfinding is limited to a 512x512 grid. For cross-continent travel (e.g., Lumbridge to Yanille), the SDK uses a recursive segmentation algorithm:

- **Split Points**: Calculates midpoints and 1/3 points along the path.
- **Perpendicular Offsets**: If a direct path is blocked by large geography (like White Wolf Mountain), the router attempts to move perpendicularly to "swing" around the obstacle before recalculating.

## Handling Special Areas

### Draynor Manor
The Manor's front door is "one-way" (it only opens from the outside). 
- **One-Way Masking**: The front door tiles are omitted from the door masking index, preventing the pathfinder from attempting to exit through them.
- **Escape Routing**: If a bot is detected inside the Manor (`isInsideDraynorManor`), the `walkTo` action automatically forced an escape via the East Wing courtyard before proceeding to the final destination.

### Doors and Gates
Most doors and gates are automatically "masked" during initialization. This removes their wall collision flags in the local matrix, allowing the pathfinder to route *through* them. The `walkTo` action then handles the actual interaction to open the door if it blocks movement.

## Verification

Continuous verification is handled by the local test suite:
```bash
bun scripts/test-pathfinding-local.ts
```
This suite covers 30+ scenarios including wall collision, door traversal, multi-segment routing, and water avoidance.
