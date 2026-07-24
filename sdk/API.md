# SDK API Reference

> Auto-generated from TypeScript source. Do not edit directly.
> Run `bun run docs:api` to regenerate or `bun run docs:api:check` to verify it.

## Execution model

- `bot.*` methods are high-level helpers. They attempt to observe method-specific evidence such as movement, inventory, XP, dialog, or state changes. When a method returns a result, inspect its `success` and any `reason` or `message`: the strength of completion evidence varies by method.
- `sdk.send*` methods are low-level browser-client dispatches. A successful `ActionResult` means the enhanced browser client accepted and dispatched the command; it does **not** prove that the game server processed it or that the intended game effect occurred.
- Methods whose signature returns `Promise<...>` are asynchronous and must be awaited. In particular, `scanNearbyLocs()` and `scanGroundItems()` return promises.
- `getInventory().length` is the number of occupied slots. `InventoryItem.count` is the quantity in that one slot, and `findInventoryItem()` returns the first matching slot rather than an aggregate across matching slots.

## BotActions (high-level)

### UI & Dialog

| Signature | Description |
|---|---|
| `async skipTutorial(options: { randomizeAppearance?: boolean } = {}): Promise<ActionResult>` | Skip tutorial by navigating dialogs and talking to tutorial NPCs. This is a porcelain method - domain logic that was moved from bot client. |
| `async dismissBlockingUI(): Promise<void>` | Dismiss any blocking UI like level-up dialogs. |
| `async waitForDialogClose(timeout: number = 30000): Promise<void>` | Wait for dialog to close. |
| `async navigateDialog(choices: (number \| string \| RegExp)[]): Promise<void>` | _No description provided._ |

### Doors

| Signature | Description |
|---|---|
| `async openDoor(target?: NearbyLoc \| string \| RegExp): Promise<OpenDoorResult>` | Open a door or gate, walking to it if needed. |

### Other

| Signature | Description |
|---|---|
| `async useItemOnLoc(item: InventoryItem \| string \| RegExp, loc: NearbyLoc \| string \| RegExp, options: { timeout?: number } = {}): Promise<UseItemOnLocResult>` | Use an inventory item on a nearby location (e.g., fish on range, ore on furnace). Walks to the location first (handling doors), then uses the item. |
| `async useItemOnNpc(item: InventoryItem \| string \| RegExp, npc: NearbyNpc \| string \| RegExp, options: { timeout?: number } = {}): Promise<UseItemOnNpcResult>` | Use an inventory item on a nearby NPC (e.g., bones on altar keeper, item on NPC). Walks to the NPC first (handling doors), then uses the item. |
| `async closeInterface(timeout: number = 5000): Promise<ActionResult>` | Close any open modal interface (bank, book, quest scroll, etc.). |

### Woodcutting & Firemaking

| Signature | Description |
|---|---|
| `async chopTree(target?: NearbyLoc \| string \| RegExp): Promise<ChopTreeResult>` | Chop a tree and wait for logs to appear in inventory. |
| `async burnLogs(logsTarget?: InventoryItem \| string \| RegExp): Promise<BurnLogsResult>` | Burn logs using a tinderbox, wait for firemaking XP. |

### Items & Inventory

| Signature | Description |
|---|---|
| `async pickupItem(target: GroundItem \| string \| RegExp): Promise<PickupResult>` | Pick up an item from the ground. |

### NPC & Object Interaction

| Signature | Description |
|---|---|
| `async talkTo(target: NearbyNpc \| string \| RegExp): Promise<TalkResult>` | Talk to an NPC and wait for dialog to open. Walks to the NPC first (handling doors). |
| `async interactLoc(target: NearbyLoc \| string \| RegExp, option: number \| string \| RegExp = 1): Promise<InteractLocResult>` | Interact with a nearby location object (rock, fishing spot, furnace, etc.). Walks to the target first (handling doors), sends the interaction, then waits for an effect (animation, dialog, interface) or detects failure when the player has been idle for 2 ticks with nothing happening. |
| `async interactNpc(target: NearbyNpc \| string \| RegExp, option: number \| string \| RegExp = 1): Promise<InteractNpcResult>` | Interact with a nearby NPC using a specified option (e.g. "Trade", "Pickpocket", "Fish"). Walks to the NPC first (handling doors), sends the interaction, then waits for an effect (animation, dialog, interface) or detects failure when the player has been idle for 2 ticks with nothing happening. |
| `async pickpocketNpc(target: NearbyNpc \| string \| RegExp): Promise<PickpocketResult>` | Pickpocket an NPC. Handles door retrying if path is blocked. |

### Movement

| Signature | Description |
|---|---|
| `async walkTo(x: number, z: number, tolerance: number = 3): Promise<ActionResult>` | Walk to coordinates using pathfinding, auto-opening doors. |

### Shopping

| Signature | Description |
|---|---|
| `async closeShop(timeout: number = 5000): Promise<ActionResult>` | Close the shop interface. |
| `async openShop(target: NearbyNpc \| string \| RegExp = /shop\s*keeper/i): Promise<ActionResult>` | Open a shop by trading with an NPC. |
| `async buyFromShop(target: ShopItem \| string \| RegExp, amount: number = 1): Promise<ShopResult>` | Buy an item from an open shop . |
| `async sellToShop(target: InventoryItem \| ShopItem \| string \| RegExp, amount: SellAmount = 1): Promise<ShopSellResult>` | Sell an item to an open shop. |

### Banking

| Signature | Description |
|---|---|
| `async openBank(timeout: number = 10000): Promise<OpenBankResult>` | Open a bank booth or talk to a banker. |
| `async closeBank(timeout: number = 5000): Promise<ActionResult>` | Close the bank interface. |
| `async depositItem(target: InventoryItem \| string \| RegExp, amount: number = -1): Promise<BankDepositResult>` | Deposit an item into the bank. Use -1 for all. |
| `async withdrawItem(target: BankItem \| string \| RegExp \| number, amount: number = 1): Promise<BankWithdrawResult>` | Withdraw an item from the bank by slot number. |

### Combat & Equipment

| Signature | Description |
|---|---|
| `async equipItem(target: InventoryItem \| string \| RegExp): Promise<EquipResult>` | Equip an item from inventory. |
| `async unequipItem(target: InventoryItem \| string \| RegExp): Promise<UnequipResult>` | Unequip an item to inventory. |
| `getEquipment(): InventoryItem[]` | Get all currently equipped items. |
| `findEquippedItem(pattern: string \| RegExp): InventoryItem \| null` | Find an equipped item by name pattern. |
| `async eatFood(target: InventoryItem \| string \| RegExp): Promise<EatResult>` | Eat food to restore hitpoints. |
| `async attackNpc(target: NearbyNpc \| string \| RegExp, timeout: number = 5000): Promise<AttackResult>` | Attack an NPC, walking to it if needed. |
| `async castSpellOnNpc(target: NearbyNpc \| string \| RegExp, spellComponent: number, timeout: number = 3000): Promise<CastSpellResult>` | Cast a combat spell on an NPC. |

### Condition Waiting

| Signature | Description |
|---|---|
| `async waitForSkillLevel(skillName: string, targetLevel: number, timeout: number = 60000): Promise<SkillState>` | Wait until a skill reaches a target level. |
| `async waitForInventoryItem(pattern: string \| RegExp, timeout: number = 30000): Promise<InventoryItem>` | Wait until an item appears in inventory. |
| `async waitForIdle(timeout: number = 10000): Promise<void>` | Wait for player to stop moving. |

### Crafting & Smithing

| Signature | Description |
|---|---|
| `async fletchLogs(product?: string): Promise<FletchResult>` | Fletch logs into bows or arrow shafts using a knife. |
| `async craftLeather(product?: string): Promise<CraftLeatherResult>` | Craft leather into armour using needle and thread. |
| `async smithAtAnvil(product: string \| number = 'dagger', options: { barPattern?: RegExp; timeout?: number } = {}): Promise<SmithResult>` | Smith a bar into an item at an anvil. |
| `async craftJewelry(options: { barPattern?: RegExp; product?: string; gem?: string; timeout?: number; } = {}): Promise<CraftJewelryResult>` | Craft jewelry at a furnace using a gold/silver bar and optional gem. Requires: bar + mould in inventory (ring mould, necklace mould, or amulet mould). Optionally a gem for gem-set jewelry. |
| `async enchantItem(target: InventoryItem \| string \| RegExp, level: 1 \| 2 \| 3 \| 4 \| 5, options: { timeout?: number } = {}): Promise<EnchantResult>` | Cast an enchantment spell on a jewelry item. |
| `async stringAmulet(target: InventoryItem \| string \| RegExp = /amulet/i, options: { timeout?: number } = {}): Promise<StringAmuletResult>` | String an amulet using a ball of wool. |

### Prayer

| Signature | Description |
|---|---|
| `async activatePrayer(prayer: PrayerName \| number): Promise<PrayerResult>` | Activate a prayer by name or index. Checks preconditions (level, prayer points, not already active) before toggling. |
| `async deactivatePrayer(prayer: PrayerName \| number): Promise<PrayerResult>` | Deactivate a prayer by name or index. Checks if the prayer is actually active before toggling. |
| `async deactivateAllPrayers(): Promise<PrayerResult>` | Deactivate all currently active prayers. Toggles each active prayer off one by one. |

---

## BotSDK (low-level)

### Connection & Subscriptions

| Signature | Description |
|---|---|
| `async connect(): Promise<void>` | Connect to the gateway WebSocket. |
| `async disconnect(): Promise<void>` | Disconnect from the gateway. |
| `onConnectionStateChange(listener: (state: ConnectionState, attempt?: number) => void): () => void` | _No description provided._ |
| `onStateUpdate(listener: (state: BotWorldState) => void): () => void` | _No description provided._ |

### State Access

| Signature | Description |
|---|---|
| `isConnected(): boolean` | Check if WebSocket is connected. |
| `isAuthenticated(): boolean` | Check if the gateway has accepted our credentials. True means the transport and auth are both fine - if state is still missing after this, the problem is that no game client is logged in, not the connection. |
| `getConnectionState(): ConnectionState` | Get current connection state (connecting, connected, reconnecting, disconnected). |
| `getReconnectAttempt(): number` | Get current reconnection attempt number. |
| `getConnectionMode(): SDKConnectionMode` | Get connection mode (control or observe). |
| `async isBotConnected(): Promise<boolean>` | Check if bot is currently connected to gateway. |
| `getState(): BotWorldState \| null` | Get current game state snapshot. |
| `getStateReceivedAt(): number` | Get timestamp when state was last received (ms since epoch) |
| `getStateAge(): number` | Get age of current state in milliseconds |
| `getChat(opts: { limit?: number; types?: readonly number[]; includeSelf?: boolean } = {}): GameMessage[]` | Read recent chat messages. Returns player chat (public + PMs) by default, newest last. Reads from the SDK's accumulated history — up to 500 messages retained since connect — so old lines survive both system spam (level-ups, combat) and the client's own 100-deep ring eviction. |
| `getNewChat(opts: { types?: readonly number[]; includeSelf?: boolean } = {}): GameMessage[]` | Read only chat messages that have arrived since the last call (cursor-based, newest last). Repeat polls never re-show the same message — no need to hand-roll a baseline. The first call returns everything seen since connect. Excludes your own messages by default. |
| `getChatFrom(name: string, opts: { limit?: number } = {}): GameMessage[]` | Read recent chat from a specific sender (case-insensitive, substring match on name), newest last, from the accumulated history. Handy for "what did my partner say?" without regex-matching the sender field yourself. |
| `getSkill(name: string): SkillState \| null` | Get a skill by name (case-insensitive). |
| `getSkillXp(name: string): number \| null` | Get XP for a skill by name. |
| `getSkills(): SkillState[]` | Get all skills. |
| `getInventoryItem(slot: number): InventoryItem \| null` | Get inventory item by slot number. |
| `findInventoryItem(pattern: string \| RegExp): InventoryItem \| null` | Find inventory item by name pattern. |
| `getInventory(): InventoryItem[]` | Get all inventory items. |
| `getEquipmentItem(slot: number): InventoryItem \| null` | Get equipment item by slot number. |
| `findEquipmentItem(pattern: string \| RegExp): InventoryItem \| null` | Find equipment item by name pattern. |
| `getEquipment(): InventoryItem[]` | Get all equipped items. |
| `getBankItem(slot: number): BankItem \| null` | Get bank item by slot number (bank must be open). |
| `findBankItem(pattern: string \| RegExp): BankItem \| null` | Find bank item by name pattern (bank must be open). |
| `getBankItems(): BankItem[]` | Get all bank items (bank must be open). |
| `isBankOpen(): boolean` | Check if bank interface is open. |
| `getNearbyNpc(index: number): NearbyNpc \| null` | Get NPC by index. |
| `findNearbyNpc(pattern: string \| RegExp): NearbyNpc \| null` | Find NPC by name pattern. |
| `getNearbyNpcs(): NearbyNpc[]` | Get all nearby NPCs. |
| `getNearbyLoc(x: number, z: number, id: number): NearbyLoc \| null` | Get location (object) by coordinates and ID. |
| `findNearbyLoc(pattern: string \| RegExp): NearbyLoc \| null` | Find location by name pattern. |
| `getNearbyLocs(): NearbyLoc[]` | Get all nearby locations (trees, rocks, etc). |
| `findGroundItem(pattern: string \| RegExp): GroundItem \| null` | Find ground item by name pattern. |
| `getGroundItems(): GroundItem[]` | Get all ground items. |
| `getDialog(): DialogState \| null` | Get current dialog state. |
| `getPrayerState(): PrayerState \| null` | Get current prayer state from world state. |
| `isPrayerActive(prayer: PrayerName \| number): boolean` | Check if a specific prayer is currently active. |
| `getActivePrayers(): PrayerName[]` | Get list of all currently active prayer names. |

### Other

| Signature | Description |
|---|---|
| `async checkBotStatus(): Promise<BotStatus>` | Check bot status via gateway HTTP endpoint. Returns info about whether bot is connected and who else is controlling/observing. |
| `async launchBrowser(): Promise<void>` | Launch native browser to client URL. Uses the `open` package for cross-platform support (macOS, Windows, Linux, WSL). Falls back to printing the URL if no browser can be opened. |

### Condition Waiting

| Signature | Description |
|---|---|
| `async waitForBotConnection(timeout?: number): Promise<void>` | Wait for bot to connect to gateway after browser launch. |
| `async waitForConnection(timeout: number = 60000): Promise<void>` | Wait for WebSocket connection to be established. |
| `async waitForChat(opts: { from?: string; matching?: RegExp \| string; types?: readonly number[]; includeSelf?: boolean; timeout?: number; } = {}): Promise<GameMessage \| null>` | Wait for the next chat message matching the given filters (messages arriving after this call; your own messages are excluded by default). The easy way to coordinate two bots: `sdk.say('ready'); const reply = await sdk.waitForChat({ from: 'partner', timeout: 60000 });` |
| `async waitForReady(timeout: number = 15000): Promise<BotWorldState>` | Wait for game state to be fully loaded and ready. Ensures player position is valid (not 0,0), bot is in-game, and state is recent. |
| `async waitForCondition(predicate: (state: BotWorldState) => boolean, timeout: number = 30000): Promise<BotWorldState>` | _No description provided._ |
| `async waitForStateChange(timeout: number = 30000): Promise<BotWorldState>` | Wait for next state update from server. |
| `async waitForTicks(ticks: number = 1): Promise<BotWorldState>` | Wait for a specific number of server ticks (~300ms each). |
| `async waitForStateUpdate(): Promise<BotWorldState>` | Wait for the next state update from the server. This is the most common waiting pattern - ensures fresh data after an action. State updates arrive once per server tick (~300ms) when PLAYER_INFO is received. |

### On-Demand Scanning

| Signature | Description |
|---|---|
| `async scanNearbyLocs(radius?: number): Promise<NearbyLoc[]>` | Scan for nearby locations with custom radius. |
| `async scanGroundItems(radius?: number): Promise<GroundItem[]>` | Scan for ground items on-demand. This is more efficient than constantly pushing this data in state updates. |
| `async scanFindNearbyLoc(pattern: string \| RegExp, radius?: number): Promise<NearbyLoc \| null>` | Find a nearby location by name pattern (on-demand scan). |
| `async scanFindGroundItem(pattern: string \| RegExp, radius?: number): Promise<GroundItem \| null>` | Find a ground item by name pattern (on-demand scan). |

### Raw Actions

| Signature | Description |
|---|---|
| `async sendWalk(x: number, z: number, running: boolean = true): Promise<ActionResult>` | Send walk command to coordinates. |
| `async sendInteractLoc(x: number, z: number, locId: number, option: number = 1): Promise<ActionResult>` | Interact with a location (tree, rock, door, etc). |
| `async sendInteractNpc(npcIndex: number, option: number = 1): Promise<ActionResult>` | Interact with an NPC by index and option. |
| `async sendInteractPlayer(playerIndex: number, option: number = 2): Promise<ActionResult>` | Interact with a player by index and option. Option 2 = Attack (wilderness), 3 = Follow, 4 = Trade. |
| `async sendTalkToNpc(npcIndex: number): Promise<ActionResult>` | Talk to an NPC by index. |
| `async sendPickup(x: number, z: number, itemId: number): Promise<ActionResult>` | Pick up a ground item. |
| `async sendUseItem(slot: number, option: number = 1): Promise<ActionResult>` | Use an inventory item (eat, equip, etc). |
| `async sendUseEquipmentItem(slot: number, option: number = 1): Promise<ActionResult>` | Use an equipped item (remove, operate, etc). |
| `async sendDropItem(slot: number): Promise<ActionResult>` | Drop an inventory item. |
| `async sendUseItemOnItem(sourceSlot: number, targetSlot: number): Promise<ActionResult>` | Use one inventory item on another. |
| `async sendUseItemOnLoc(itemSlot: number, x: number, z: number, locId: number): Promise<ActionResult>` | Use an inventory item on a location. |
| `async sendUseItemOnNpc(itemSlot: number, npcIndex: number): Promise<ActionResult>` | Use an inventory item on an NPC. |
| `async sendClickDialog(option: number = 0): Promise<ActionResult>` | Click a dialog option by its server-assigned index. IMPORTANT: `option` is the **server-assigned index** stored on each `DialogOption.index` field — NOT the array position in `dialog.options`. Server-assigned indices are 1-based: `dialog.options[0].index === 1`. Pass `0` only as the implicit "continue" click for dialogs with no selectable options (the common pattern: pass through narration pages). To click an option by its visible text, prefer `clickDialogByText()`, which avoids the index-vs-position footgun entirely. |
| `async clickDialogByText(pattern: string \| RegExp): Promise<ActionResult>` | Click a dialog option whose visible text matches `pattern`. Convenience wrapper that resolves the server-assigned index for you, sidestepping the 1-based vs 0-based array-position confusion of `sendClickDialog()`. Matches against `DialogOption.text` (case-insensitive by default for string patterns). |
| `async sendClickComponent(componentId: number): Promise<ActionResult>` | Click a component using IF_BUTTON packet - for simple buttons, spellcasting, etc. |
| `async sendClickComponentWithOption(componentId: number, optionIndex: number = 1, slot: number = 0): Promise<ActionResult>` | Click a component using INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.) |
| `async sendClickInterfaceOption(optionIndex: number): Promise<ActionResult>` | Click an interface option by index. Convenience wrapper that looks up componentId from state. |
| `async sendAcceptCharacterDesign(): Promise<ActionResult>` | Accept character design in tutorial. |
| `async sendRandomizeCharacterDesign(): Promise<ActionResult>` | Randomize character appearance in tutorial. |
| `async sendShopBuy(slot: number, amount: number = 1): Promise<ActionResult>` | Buy from shop by slot and amount. |
| `async sendShopSell(slot: number, amount: number = 1): Promise<ActionResult>` | Sell to shop by slot and amount. |
| `async sendCloseShop(): Promise<ActionResult>` | Close shop interface. |
| `async sendCloseModal(): Promise<ActionResult>` | Close any modal interface. |
| `async sendCountDialog(value: number): Promise<ActionResult>` | Submit a numeric value to an open p_countdialog (Enter Amount) prompt. |
| `async sendSetCombatStyle(style: number): Promise<ActionResult>` | Set combat style (0-3). |
| `async sendTogglePrayer(prayer: PrayerName \| number): Promise<ActionResult>` | Toggle a prayer on or off by name or index (0-14). |
| `async sendSpellOnNpc(npcIndex: number, spellComponent: number): Promise<ActionResult>` | Cast spell on NPC using spell component ID. |
| `async sendSpellOnItem(slot: number, spellComponent: number): Promise<ActionResult>` | Cast spell on inventory item. |
| `async sendSpellOnGroundItem(x: number, z: number, itemId: number, spellComponent: number): Promise<ActionResult>` | Cast spell on ground item (e.g., Telekinetic Grab). |
| `async sendSetTab(tabIndex: number): Promise<ActionResult>` | Switch to a UI tab by index. |
| `async sendSay(message: string): Promise<ActionResult>` | Send a single chat message. The server caps public chat at {@link maxMessageLength} chars (80 by default) and runs a word filter; `result.data` reports `{ sent, truncated, filtered, finalText }` so you know if your message was clipped or censored. For longer text that shouldn't be silently truncated, use {@link say}. |
| `async say(text: string, opts: { maxLen?: number; delayTicks?: number } = {}): Promise<ActionResult[]>` | Send a message of any length, auto-split into chunks on word boundaries and sent in order (so a multi-sentence plan isn't lost to the chat-length cap). Waits a tick between chunks so they don't collide. Returns one ActionResult per chunk. |
| `async sendWait(ticks: number = 1): Promise<ActionResult>` | Wait for specified number of game ticks. |
| `async sendBankDeposit(slot: number, amount: number = 1): Promise<ActionResult>` | Deposit item to bank by slot. |
| `async sendBankWithdraw(slot: number, amount: number = 1): Promise<ActionResult>` | Withdraw item from bank by slot. |
| `async sendScreenshot(timeout: number = 10000): Promise<string>` | Request a screenshot from the bot client. Returns the screenshot as a data URL (data:image/png;base64,...). |
| `async sendFindPath(destX: number, destZ: number, maxWaypoints: number = 500): Promise<{ success: boolean; waypoints: Array<{ x: number; z: number; level: number }>; reachedDestination?: boolean; error?: string }>` | Find path to destination (async alias for findPath). |

### Pathfinding

| Signature | Description |
|---|---|
| `findPath(destX: number, destZ: number, maxWaypoints: number = 500): { success: boolean; waypoints: Array<{ x: number; z: number; level: number }>; reachedDestination?: boolean; error?: string }` | Find path to destination using local collision data. |

---

## Result and state types

### PlayerCombatState

Combat state tracking for player

```typescript
interface PlayerCombatState {
  /** Currently engaged in combat (has a target) */
  inCombat: boolean;
  /** Index of NPC/player we're targeting (-1 if none) */
  targetIndex: number;
  /** Tick when we last took damage (-1 if never) */
  lastDamageTick: number;
}
```

### PlayerState

```typescript
interface PlayerState {
  name: string;
  combatLevel: number;
  /** Current hitpoints level (boosted/drained) */
  hp: number;
  /** Base hitpoints level (max HP) */
  maxHp: number;
  x: number;
  z: number;
  worldX: number;
  worldZ: number;
  /** Map plane/floor: 0=ground, 1=first floor (upstairs), 2=second floor, 3=third floor */
  level: number;
  runEnergy: number;
  runWeight: number;
  /** Current animation ID (-1 = idle/none) */
  animId: number;
  /** Current spot animation ID (-1 = none) */
  spotanimId: number;
  /** Combat state tracking */
  combat: PlayerCombatState;
}
```

### SkillState

```typescript
interface SkillState {
  name: string;
  level: number;
  baseLevel: number;
  experience: number;
}
```

### DialogState

```typescript
interface DialogState {
  isOpen: boolean;
  options: DialogOption[];
  isWaiting: boolean;
  text?: string;
  allComponents?: DialogComponent[];
}
```

### InterfaceState

```typescript
interface InterfaceState {
  isOpen: boolean;
  interfaceId: number;
  options: Array<{ index: number; text: string; componentId: number }>;
}
```

### ShopState

```typescript
interface ShopState {
  isOpen: boolean;
  title: string;
  shopItems: ShopItem[];
  playerItems: ShopItem[];
  shopConfig?: ShopConfig;
}
```

### BankState

```typescript
interface BankState {
  isOpen: boolean;
  items: BankItem[];
}
```

### CombatStyleState

```typescript
interface CombatStyleState {
  currentStyle: number;
  weaponName: string;
  styles: CombatStyleOption[];
}
```

### PrayerState

```typescript
interface PrayerState {
  /** Active state of each prayer (indexed 0-14, matching PRAYER_NAMES order) */
  activePrayers: boolean[];
  /** Current prayer points (current skill level - drains while prayers active) */
  prayerPoints: number;
  /** Base prayer level */
  prayerLevel: number;
}
```

### PrayerResult

```typescript
interface PrayerResult {
  success: boolean;
  message: string;
  reason?: 'invalid_prayer' | 'no_prayer_points' | 'level_too_low' | 'already_active' | 'already_inactive' | 'timeout';
}
```

### BotWorldState

```typescript
interface BotWorldState {
  tick: number;
  inGame: boolean;
  player: PlayerState | null;
  skills: SkillState[];
  inventory: InventoryItem[];
  equipment: InventoryItem[];
  nearbyNpcs: NearbyNpc[];
  nearbyPlayers: NearbyPlayer[];
  nearbyLocs: NearbyLoc[];
  groundItems: GroundItem[];
  gameMessages: GameMessage[];
  recentDialogs: DialogEntry[];
  dialog: DialogState;
  interface: InterfaceState;
  shop: ShopState;
  bank: BankState;
  modalOpen: boolean;
  modalInterface: number;
  combatStyle?: CombatStyleState;
  combatEvents: CombatEvent[];
  prayers: PrayerState;
}
```

### ActionResult

```typescript
interface ActionResult {
  success: boolean;
  message: string;
  /** Optional data payload (used by scan actions to return results) */
  data?: any;
  /** Machine-readable failure category (e.g. 'cant_reach', 'no_match', 'timeout') */
  reason?: string;
}
```

### SayResult

Outcome of sending a chat message. RS silently caps public chat at 80 chars and runs a word filter, so `sendSay` surfaces both via the `data` field (shape below) and `say()` returns these per chunk.

```typescript
interface SayResult {
  /** Whether the message was sent (false only if not in game). */
  sent: boolean;
  /** True if the message exceeded 80 chars and was clipped. */
  truncated: boolean;
  /** True if the word filter altered the text (likely censorship). */
  filtered: boolean;
  /** The text as actually broadcast (post-truncation, post-filter). */
  finalText: string;
}
```

### ChopTreeResult

```typescript
interface ChopTreeResult {
  success: boolean;
  logs?: InventoryItem;
  message: string;
}
```

### BurnLogsResult

```typescript
interface BurnLogsResult {
  success: boolean;
  xpGained: number;
  message: string;
}
```

### PickupResult

```typescript
interface PickupResult {
  success: boolean;
  item?: InventoryItem;
  message: string;
  reason?: 'item_not_found' | 'cant_reach' | 'inventory_full' | 'timeout';
}
```

### TalkResult

```typescript
interface TalkResult {
  success: boolean;
  dialog?: DialogState;
  message: string;
}
```

### ShopResult

```typescript
interface ShopResult {
  success: boolean;
  item?: InventoryItem;
  message: string;
}
```

### ShopSellResult

```typescript
interface ShopSellResult {
  success: boolean;
  message: string;
  amountSold?: number;
  rejected?: boolean;
}
```

### EquipResult

```typescript
interface EquipResult {
  success: boolean;
  message: string;
}
```

### UnequipResult

```typescript
interface UnequipResult {
  success: boolean;
  message: string;
  item?: InventoryItem;
}
```

### EatResult

```typescript
interface EatResult {
  success: boolean;
  hpGained: number;
  message: string;
}
```

### AttackResult

```typescript
interface AttackResult {
  success: boolean;
  message: string;
  reason?: 'npc_not_found' | 'no_attack_option' | 'out_of_reach' | 'already_in_combat' | 'timeout';
}
```

### CastSpellResult

```typescript
interface CastSpellResult {
  success: boolean;
  message: string;
  hit?: boolean;
  xpGained?: number;
  reason?: 'npc_not_found' | 'out_of_reach' | 'no_runes' | 'timeout';
}
```

### OpenDoorResult

```typescript
interface OpenDoorResult {
  success: boolean;
  message: string;
  reason?: 'door_not_found' | 'no_open_option' | 'already_open' | 'walk_failed' | 'open_failed' | 'timeout';
  door?: NearbyLoc;
}
```

### FletchResult

```typescript
interface FletchResult {
  success: boolean;
  message: string;
  xpGained?: number;
  product?: InventoryItem;
}
```

### CraftLeatherResult

```typescript
interface CraftLeatherResult {
  success: boolean;
  message: string;
  xpGained?: number;
  itemsCrafted?: number;
  reason?: 'no_needle' | 'no_leather' | 'no_thread' | 'interface_not_opened' | 'level_too_low' | 'timeout' | 'no_xp_gained';
}
```

### SmithResult

```typescript
interface SmithResult {
  success: boolean;
  message: string;
  xpGained?: number;
  itemsSmithed?: number;
  product?: InventoryItem;
  reason?: 'no_hammer' | 'no_bars' | 'no_anvil' | 'interface_not_opened' | 'level_too_low' | 'timeout' | 'no_xp_gained';
}
```

### OpenBankResult

```typescript
interface OpenBankResult {
  success: boolean;
  message: string;
  reason?: 'no_bank_found' | 'no_bank_option' | 'timeout' | 'dialog_stuck' | 'cant_reach';
}
```

### BankDepositResult

```typescript
interface BankDepositResult {
  success: boolean;
  message: string;
  amountDeposited?: number;
  reason?: 'bank_not_open' | 'item_not_found' | 'timeout';
}
```

### BankWithdrawResult

```typescript
interface BankWithdrawResult {
  success: boolean;
  message: string;
  item?: InventoryItem;
  reason?: 'bank_not_open' | 'item_not_found' | 'timeout';
}
```

### UseItemOnLocResult

```typescript
interface UseItemOnLocResult {
  success: boolean;
  message: string;
  reason?: 'item_not_found' | 'loc_not_found' | 'cant_reach' | 'timeout';
}
```

### UseItemOnNpcResult

```typescript
interface UseItemOnNpcResult {
  success: boolean;
  message: string;
  reason?: 'item_not_found' | 'npc_not_found' | 'cant_reach' | 'timeout';
}
```

### InteractLocResult

```typescript
interface InteractLocResult {
  success: boolean;
  message: string;
  reason?: 'loc_not_found' | 'no_matching_option' | 'cant_reach' | 'timeout';
}
```

### InteractNpcResult

```typescript
interface InteractNpcResult {
  success: boolean;
  message: string;
  reason?: 'npc_not_found' | 'no_matching_option' | 'cant_reach' | 'timeout';
}
```

### PickpocketResult

```typescript
interface PickpocketResult {
  success: boolean;
  message: string;
  xpGained?: number;
  reason?: 'npc_not_found' | 'no_pickpocket_option' | 'cant_reach' | 'stunned' | 'timeout';
}
```

### CraftJewelryResult

```typescript
interface CraftJewelryResult {
  success: boolean;
  message: string;
  xpGained?: number;
  product?: InventoryItem;
  reason?: 'no_bar' | 'no_mould' | 'no_furnace' | 'no_gem' | 'interface_not_opened' | 'level_too_low' | 'timeout';
}
```

### EnchantResult

```typescript
interface EnchantResult {
  success: boolean;
  message: string;
  xpGained?: number;
  product?: InventoryItem;
  reason?: 'item_not_found' | 'no_runes' | 'level_too_low' | 'timeout';
}
```

### StringAmuletResult

```typescript
interface StringAmuletResult {
  success: boolean;
  message: string;
  xpGained?: number;
  product?: InventoryItem;
  reason?: 'no_amulet' | 'no_string' | 'level_too_low' | 'timeout';
}
```
