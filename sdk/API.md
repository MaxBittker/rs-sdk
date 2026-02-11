# SDK API Reference

> Auto-generated from source. Do not edit directly.
> Run `bun scripts/generate-api-docs.ts` to regenerate.

## BotActions (High-Level)

These methods wait for the **effect to complete**, not just server acknowledgment.

### UI & Dialog

| Method | Description |
|--------|-------------|
| `skipTutorial(options)` | Skip tutorial by navigating dialogs and talking to tutorial NPCs. |
| `waitForDialogClose(timeout)` | Wait for dialog to close. |

### Movement

| Method | Description |
|--------|-------------|
| `walkTo(x, z, tolerance)` | Walk to coordinates using pathfinding, auto-opening doors. |

### Combat & Equipment

| Method | Description |
|--------|-------------|
| `equipItem(target)` | Equip an item from inventory. |
| `unequipItem(target)` | Unequip an item to inventory. |
| `findEquippedItem(pattern)` | Find an equipped item by name pattern. |
| `eatFood(target)` | Eat food to restore hitpoints. |
| `attackNpc(target, timeout)` | Attack an NPC, walking to it if needed. |
| `castSpellOnNpc(target, spellComponent, timeout)` | Cast a combat spell on an NPC. |
| `craftLeather(product?)` | Craft leather into armour using needle and thread. |

### Woodcutting & Firemaking

| Method | Description |
|--------|-------------|
| `chopTree(target?)` | Chop a tree and wait for logs to appear in inventory. |
| `burnLogs(logsTarget?)` | Burn logs using a tinderbox, wait for firemaking XP. |

### Items & Inventory

| Method | Description |
|--------|-------------|
| `pickupItem(target)` | Pick up an item from the ground. |

### Doors

| Method | Description |
|--------|-------------|
| `openDoor(target?)` | Open a door or gate, walking to it if needed. |

### NPC Interaction

| Method | Description |
|--------|-------------|
| `talkTo(target)` | Talk to an NPC and wait for dialog to open. |

### Shopping

| Method | Description |
|--------|-------------|
| `closeShop(timeout)` | Close the shop interface. |
| `openShop(target)` | Open a shop by trading with an NPC. |
| `buyFromShop(target, amount)` | Buy an item from an open shop . |
| `sellToShop(target, amount)` | Sell an item to an open shop. |

### Banking

| Method | Description |
|--------|-------------|
| `openBank(timeout)` | Open a bank booth or talk to a banker. |
| `closeBank(timeout)` | Close the bank interface. |
| `depositItem(target, amount)` | Deposit an item into the bank. |
| `withdrawItem(target, amount)` | Withdraw an item from the bank by slot number. |

### Crafting & Smithing

| Method | Description |
|--------|-------------|
| `fletchLogs(product?)` | Fletch logs into bows or arrow shafts using a knife. |
| `smithAtAnvil(product, options)` | Smith a bar into an item at an anvil. |

### Condition Waiting

| Method | Description |
|--------|-------------|
| `waitForSkillLevel(skillName, targetLevel, timeout)` | Wait until a skill reaches a target level. |
| `waitForInventoryItem(pattern, timeout)` | Wait until an item appears in inventory. |
| `waitForIdle(timeout)` | Wait for player to stop moving. |

### Other

| Method | Description |
|--------|-------------|
| `useItemOnLoc(item, loc, options)` | Use an inventory item on a nearby location (e. |
| `useItemOnNpc(item, npc, options)` | Use an inventory item on a nearby NPC (e. |
| `interactLoc(target, option)` | Interact with a nearby location object (rock, fishing spot, furnace, etc. |
| `interactNpc(target, option)` | Interact with a nearby NPC using a specified option (e. |
| `pickpocketNpc(target)` | Pickpocket an NPC. |
| `activatePrayer(prayer)` | Activate a prayer by name or index. |
| `deactivatePrayer(prayer)` | Deactivate a prayer by name or index. |

---

## BotSDK (Low-Level)

These methods resolve when server **acknowledges** them (not when effects complete).

### State Access

| Method | Description |
|--------|-------------|
| `getSkill(name)` | Get a skill by name (case-insensitive). |
| `getSkillXp(name)` | Get XP for a skill by name. |
| `getInventoryItem(slot)` | Get inventory item by slot number. |
| `findInventoryItem(pattern)` | Find inventory item by name pattern. |
| `getEquipmentItem(slot)` | Get equipment item by slot number. |
| `findEquipmentItem(pattern)` | Find equipment item by name pattern. |
| `getBankItem(slot)` | Get bank item by slot number (bank must be open). |
| `findBankItem(pattern)` | Find bank item by name pattern (bank must be open). |
| `getNearbyNpc(index)` | Get NPC by index. |
| `findNearbyNpc(pattern)` | Find NPC by name pattern. |
| `getNearbyLoc(x, z, id)` | Get location (object) by coordinates and ID. |
| `findNearbyLoc(pattern)` | Find location by name pattern. |
| `findGroundItem(pattern)` | Find ground item by name pattern. |

### On-Demand Scanning

| Method | Description |
|--------|-------------|
| `scanNearbyLocs(radius?)` | Scan for nearby locations with custom radius. |
| `scanGroundItems(radius?)` | Scan for ground items on-demand. |
| `scanFindNearbyLoc(pattern, radius?)` | Find a nearby location by name pattern (on-demand scan). |
| `scanFindGroundItem(pattern, radius?)` | Find a ground item by name pattern (on-demand scan). |

### Raw Actions

| Method | Description |
|--------|-------------|
| `sendWalk(x, z, running)` | Send walk command to coordinates. |
| `sendInteractLoc(x, z, locId, option)` | Interact with a location (tree, rock, door, etc). |
| `sendInteractNpc(npcIndex, option)` | Interact with an NPC by index and option. |
| `sendInteractPlayer(playerIndex, option)` | Interact with a player by index and option. |
| `sendTalkToNpc(npcIndex)` | Talk to an NPC by index. |
| `sendPickup(x, z, itemId)` | Pick up a ground item. |
| `sendUseItem(slot, option)` | Use an inventory item (eat, equip, etc). |
| `sendUseEquipmentItem(slot, option)` | Use an equipped item (remove, operate, etc). |
| `sendDropItem(slot)` | Drop an inventory item. |
| `sendUseItemOnItem(sourceSlot, targetSlot)` | Use one inventory item on another. |
| `sendUseItemOnLoc(itemSlot, x, z, locId)` | Use an inventory item on a location. |
| `sendUseItemOnNpc(itemSlot, npcIndex)` | Use an inventory item on an NPC. |
| `sendClickDialog(option)` | Click a dialog option by index. |
| `sendClickComponent(componentId)` | Click a component using IF_BUTTON packet - for simple buttons, spellcasting, etc. |
| `sendClickComponentWithOption(componentId, optionIndex, slot)` | Click a component using INV_BUTTON packet - for components with inventory operations (smithing, c... |
| `sendClickInterfaceOption(optionIndex)` | Click an interface option by index. |
| `sendShopBuy(slot, amount)` | Buy from shop by slot and amount. |
| `sendShopSell(slot, amount)` | Sell to shop by slot and amount. |
| `sendSetCombatStyle(style)` | Set combat style (0-3). |
| `sendTogglePrayer(prayer)` | Toggle a prayer on or off by name or index (0-14). |
| `sendSpellOnNpc(npcIndex, spellComponent)` | Cast spell on NPC using spell component ID. |
| `sendSpellOnItem(slot, spellComponent)` | Cast spell on inventory item. |
| `sendSetTab(tabIndex)` | Switch to a UI tab by index. |
| `sendSay(message)` | Send a chat message. |
| `sendWait(ticks)` | Wait for specified number of game ticks. |
| `sendBankDeposit(slot, amount)` | Deposit item to bank by slot. |
| `sendBankWithdraw(slot, amount)` | Withdraw item from bank by slot. |
| `sendScreenshot(timeout)` | Request a screenshot from the bot client. |
| `sendFindPath(destX, destZ, maxWaypoints)` | Find path to destination (async alias for findPath). |

### Pathfinding

| Method | Description |
|--------|-------------|
| `findPath(destX, destZ, maxWaypoints)` | Find path to destination using local collision data. |

### Condition Waiting

| Method | Description |
|--------|-------------|
| `waitForBotConnection(timeout?)` | Wait for bot to connect to gateway after browser launch. |
| `waitForConnection(timeout)` | Wait for WebSocket connection to be established. |
| `waitForReady(timeout)` | Wait for game state to be fully loaded and ready. |
| `waitForStateChange(timeout)` | Wait for next state update from server. |
| `waitForTicks(ticks)` | Wait for a specific number of server ticks (~300ms each). |

### Other

| Method | Description |
|--------|-------------|
| `isPrayerActive(prayer)` | Check if a specific prayer is currently active. |

---

## Result Types

### PlayerCombatState

```typescript
interface PlayerCombatState {
  inCombat: boolean; // Currently engaged in combat (has a target)
  targetIndex: number; // Index of NPC/player we're targeting (-1 if none)
  lastDamageTick: number; // Tick when we last took damage (-1 if never)
}
```

### PlayerState

```typescript
interface PlayerState {
  name: string;
  combatLevel: number;
  x: number;
  z: number;
  worldX: number;
  worldZ: number;
  level: number; // Map plane/floor: 0=ground, 1=first floor (upstairs), 2=second floor, 3=third floor
  runEnergy: number;
  runWeight: number;
  animId: number; // Current animation ID (-1 = idle/none)
  spotanimId: number; // Current spot animation ID (-1 = none)
  combat: PlayerCombatState; // Combat state tracking
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
  options: Array<{ index: number; text: string; componentId: number;
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
