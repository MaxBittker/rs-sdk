# Cooking

## Cooking on a Range

Use `bot.useItemOnLoc(item, loc)` with raw food on a range:

```typescript
const raw = sdk.findInventoryItem(/^raw shrimps$/i);
const range = sdk.findNearbyLoc(/^range$/i);
if (raw && range) {
  await bot.useItemOnLoc(raw, range);
}
```

## Range Locations

| Location | Coordinates | Loc name | Notes |
|----------|-------------|----------|-------|
| **Lumbridge (near Bob's Axes)** | **(3230, 3196)** | `Range` | **USE THIS.** No quest needed. Just south of Bob's Axes (3232, 3203). |
| Lumbridge Castle kitchen | (3212, 3215) | `Cooking range` | **REQUIRES Cook's Assistant quest completion.** The Cook stands next to it at (3209, 3215). |
| Al Kharid (Karim's kebab shop) | (3271, 3180) | `Range` | No quest needed, but 10gp toll gate to get there. |

**COMMON MISTAKE**: The range inside Lumbridge Castle kitchen — **(3212, 3215)**, ground floor, SW corner where the Cook stands — is locked behind the Cook's Assistant quest. Without the quest the Cook says *"Hey! Who said you could use that?"* and nothing cooks. Use the Range at (3230, 3196), south of Bob's Brilliant Axes, instead.

**Name gotcha**: the quest-gated castle range is named `Cooking range`, not `Range`, so `/^range$/i` deliberately skips it. Usable cooking sources are `Range` (loc 2728-2731), `Fireplace` (2724-2726), `Cooking pot` (2727), and `Fire` (2732) — a wider match is:

```typescript
const source = sdk.findNearbyLoc(/^(range|fireplace|fire|cooking pot)$/i);
```

Nearest usable sources elsewhere: Fireplace (3205, 3220) in Lumbridge castle, Cooking pot (3232, 3238), Fire (3245, 3246), Fireplace (3100, 3256) near Draynor.
