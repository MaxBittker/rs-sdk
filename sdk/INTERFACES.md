# Viewport interface observations

`const snapshot = sdk.getInterfaceSnapshot()` reads the latest typed viewport
interface observation from either an updated lite client or an updated browser
client. The same value is available at `sdk.getState()?.interface.snapshot`.
It uses existing client/cache metadata: no screenshots, rendering, mesh downloads,
new game-server packets or game-server changes are required.

## Capability and completeness

- `null`: no state yet, or the connected client predates this feature.
- `version: 1, rootId: -1`: the client supports snapshots but no viewport modal is open.
- `rootId >= 0`: a bounded snapshot of the open viewport interface.
- `truncated: true`: resource limits, missing/malformed component layout or an
  unsupported component type prevented complete collection. Do not assume that
  omitted components do not exist.
- A component's `contentResolved: false` means its displayed content was not
  resolved. `unresolvedReason` explains why; text/model alternatives are not
  exposed as a shortcut.

Existing interface options and click methods are unchanged. Buttons' `tooltip`
is separate from displayed text. For example, an image button may have tooltip
`Ok` while a neighbouring text component contains its actual answer label.
The snapshot preserves IDs, parent IDs and nominal bounds; it does not guess
label-to-button associations.

## Text, models and layout

Static text is copied, preserving client formatting codes. Model components
report their source namespace (`raw`, `object`, `npc_head` or `player_head`) and
source ID. For object models:

- `objectId` is the displayed object ID, **not** a mesh ID.
- `definitionObjectId` is the effective object definition after selecting the
  same count-50 variant used by `IfType.getModel(type=4)`.
- `meshId` and recolour source/destination pairs come from that public object
  definition; model geometry is never fetched.
- `zoom`, `rotationX`, `rotationY` and `animationId` describe the component's
  configured presentation, not the animated vertices for a rendered frame.

For raw models `meshId` is the source ID. For NPC/player heads it is `null`;
head geometry/appearance is not expanded. Missing object definitions set
`contentResolved: false`; missing recolour metadata is `null`, whereas a resolved
object without recolours has an empty array. Returned arrays/objects are copied
from the cache, so later packet updates do not mutate older snapshots.

Bounds use pixels relative to the root and include component offsets and layer
scrolling. Collection follows the nominal layout rectangles intersecting the
parent's clip; this is **not pixel-perfect visibility**. Rotating meshes, sprites
or text can draw beyond their nominal rectangles. Hidden layers are omitted
conservatively, including hover-only layers. Inventory grids use slot dimensions,
so they are omitted with `truncated: true`; use the existing inventory/bank/shop
APIs for their contents.

Conditional content, `%1`–`%5` text substitution and client-generated widgets
(including Continue buttons whose text can change to `Please wait...`) are
explicitly unresolved in version 1, consistently in both clients. The collector
does not execute widget scripts or publish hidden alternate model/text values,
script operands, game varps, full item definitions or the entire interface cache.
It handles layers, rectangles, static text, image-button layout and model metadata.
It does not describe image pixels.

## Bounds

Collection is synchronous against the correct bot's interface table, with at
most 256 emitted components, 512 visits, depth 16, 1,024 characters per text/tooltip
and 64 recolour pairs per object. Cycles, repeated component references and missing
layout entries fail conservatively. No promise/await may be added inside traversal:
lite clients share config registries but have per-bot copy-on-write interface tables.

## Safe use

Snapshots are **observations, not guarded-click tokens**. Version 1 does not add
open-instance/content revision identities or atomic snapshot-guarded clicks.
Before dispatching through existing SDK methods:

1. Require recent SDK state, a complete snapshot and resolved required components.
2. Wait for post-open updates and re-read the full question/model/label identity;
   opening a modal is not acknowledgement that every UI update has arrived.
3. Abort on changed/closed UI, unexpected dialogs, death or damage.
4. Verify the game's actual completion/reward. A successful send is not proof of
   completion, and inventory loss alone could be death.

A game-specific solver should keep its visual calibration outside the generic
SDK, validate known object/mesh/recolour signatures against deployment/cache
provenance, and stop on unknown assets. This feature does not interpret a puzzle
or infer answers. Cache provenance negotiation and guarded-click lifecycle
identities remain separate follow-ups.

## Tests

- `bun test sdk/test/interface-snapshot.test.ts`
- `bun test server/webclient/src/bot/interface-snapshot.test.ts server/webclient/src/lite/interface-snapshot.test.ts`

Tests cover optional support in old clients, bounded/static metadata, object
variants, hidden/conditional/unavailable content, copying, scrolling, malformed
trees, packet updates, per-bot isolation and preservation through both state
publication wrappers. Live puzzle solves require a compatible deployed client;
offline fixtures alone are not claimed as a live solve.
