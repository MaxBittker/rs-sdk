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
| `async dropItem(target: InventoryItem \| string \| RegExp, amount: number \| 'all' = 'all'): Promise<DropItemResult>` | Drop inventory items by name, waiting for each drop to land before sending the next. `sendDropItem` on a slot the server has already emptied silently no-ops, so slot loops built on stale state lose most of their sends; this re-resolves the slot from fresh state every time. `amount` counts inventory slots (a whole stack drops as one). Pass `'all'` or `-1` to drop every matching slot. |
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
| `async buyFromShop(target: ShopItem \| string \| RegExp, amount: number = 1): Promise<ShopResult>` | Buy an item from an open shop. `success` is true only when the full requested amount arrived; a short fill (out of stock, out of coins, full inventory) returns `success: false` with `partial: true` and the actual `amountBought`. |
| `async sellToShop(target: InventoryItem \| ShopItem \| string \| RegExp, amount: SellAmount = 1): Promise<ShopSellResult>` | Sell an item to an open shop. `success` is true only when the full requested amount was sold; a short fill returns `success: false` with `partial: true` and `amountSold`. |

### Banking

| Signature | Description |
|---|---|
| `async openBank(timeout: number = 10000): Promise<OpenBankResult>` | Open a bank booth or talk to a banker. |
| `async closeBank(timeout: number = 5000): Promise<ActionResult>` | Close the bank interface. |
| `async depositItem(target: InventoryItem \| string \| RegExp, amount: number = -1): Promise<BankDepositResult>` | Deposit an item into the bank. Use -1 for all. |
| `async withdrawItem(target: BankItem \| string \| RegExp \| number, amount: number = 1, options: { asNote?: boolean } = {}): Promise<BankWithdrawResult>` | Withdraw an item from the bank by slot, name, or BankItem. `asNote: true` withdraws as a banknote: the note/item toggle is synced first (and synced back to items on the next plain withdrawal), and completion is detected on the noted item's arrival. Items the engine cannot note are withdrawn unnoted with a game message; the result then carries the unnoted item. |

### Player Trading

| Signature | Description |
|---|---|
| `async tradeWith(target: NearbyPlayer \| string \| RegExp, timeout: number = 30_000): Promise<ActionResult>` | Open a trade session with another player, walking closer if needed. Requesting a player who already requested you accepts their request; otherwise this waits (re-requesting periodically) until they request back or the timeout expires. |
| `async offerTradeItems(items: TradeItemSpec[], timeout: number = 15_000): Promise<ActionResult>` | Place items into your side of an open trade. Each spec resolves against your inventory; `amount` -1 offers all of that item (default 1). Waits until the offer window reflects each addition. Adding items resets both players' accepts server-side. |
| `async acceptTrade(timeout: number = 10_000): Promise<ActionResult>` | Accept the current trade screen and wait for observable progress: the screen advancing (offer -> confirm), the trade completing, or the acceptance being registered while waiting on the partner. |
| `async declineTrade(timeout: number = 5_000): Promise<ActionResult>` | Decline (close) the open trade and wait for the screen to close. |
| `async trade(target: NearbyPlayer \| string \| RegExp, options: TradeOptions = {}): Promise<TradeResult>` | Full trade happy path with one player: open the session, offer `give`, accept once the partner's offer satisfies `want` (or the `accept` predicate), re-verify on the confirm screen, and report the actual inventory delta. Any offer change resets both accepts server-side, so the offer seen at accept time is the offer that reaches the confirm screen; the confirm re-verification makes offer-switching structurally impossible to slip past this method. |
| `async serveTrades(options: ServeTradesOptions = {}): Promise<ServeTradesResult>` | Serve incoming trades: wait for "wishes to trade with you." requests, accept ones matching the `from` filter, and run each session with the shared give/want/accept policy. The receiving half of a muling setup: ```ts // Worker: bot.trade('mule01', { give: [{ item: /ore/i, amount: -1 }] }) // Mule: bot.serveTrades({ from: /^fleet_/i, until: () => sdk.getInventory().length >= 26 }) ``` This owns the bot while running - it is an explicit serving loop, not a background hook, so it never fights another controller for the session. |

### Combat & Equipment

| Signature | Description |
|---|---|
| `async equipItem(target: InventoryItem \| string \| RegExp): Promise<EquipResult>` | Equip an item from inventory. |
| `async unequipItem(target: InventoryItem \| string \| RegExp): Promise<UnequipResult>` | Unequip an item to inventory. |
| `getEquipment(): InventoryItem[]` | Get all currently equipped items. |
| `findEquippedItem(pattern: string \| RegExp): InventoryItem \| null` | Find an equipped item by name pattern. |
| `async eatFood(target: InventoryItem \| string \| RegExp): Promise<EatResult>` | Eat food to restore hitpoints. |
| `async attack(target: CombatTarget, timeout: number = 5000): Promise<AttackResult>` | Attack an NPC or another player, walking to the target if needed. Takes either an entity (from `sdk.findNearbyNpc`/`sdk.findNearbyPlayer`) or a name/pattern, matched against NPCs first and players second - so pass the entity when a player shares a name with a monster. ```ts await bot.attack(/^chicken$/i); await bot.attack(sdk.findNearbyPlayer('Zezima')!); ``` PvP attacks are refused outside the wilderness and across too big a level gap; those come back as `reason: 'not_attackable'` with the server's own wording in `message`. |
| `async attackPlayer(target: NearbyPlayer \| string \| RegExp, timeout: number = 5000): Promise<AttackResult>` | Attack another player (OPPLAYER2). Prefer {@link attack}, which also takes NPCs. |
| `async castSpell(target: CombatTarget, spellComponent: number, timeout: number = 3000): Promise<CastSpellResult>` | Cast a combat spell on an NPC or another player. The two are the same action to the server (OPNPCT vs OPPLAYERT), so this takes either: an entity from `sdk.findNearbyNpc`/`sdk.findNearbyPlayer`, or a name/pattern matched against NPCs first and players second. ```ts await bot.castSpell('goblin', Spells.WIND_STRIKE); await bot.castSpell(sdk.findNearbyPlayer('Zezima')!, Spells.FIRE_STRIKE); ``` Magic XP is the evidence of a cast landing, so a splash still counts as success with `hit: false`. |
| `async castSpellOnPlayer(target: NearbyPlayer \| string \| RegExp, spellComponent: number, timeout: number = 3000): Promise<CastSpellResult>` | Cast a combat spell on another player (OPPLAYERT). Prefer {@link castSpell}. |

### Condition Waiting

| Signature | Description |
|---|---|
| `async waitForSkillLevel(skillName: string, targetLevel: number, timeout: number = 60000): Promise<SkillState>` | Wait until a skill reaches a target level. |
| `async waitForInventoryItem(pattern: string \| RegExp, timeout: number = 30000): Promise<InventoryItem>` | Wait until an item appears in inventory. |
| `async waitForIdle(timeout: number = 10000): Promise<void>` | Wait for player to stop moving. |

### Crafting & Smithing

| Signature | Description |
|---|---|
| `async fletchLogs(product?: string): Promise<FletchResult>` | Fletch logs into bows or arrow shafts using a knife. `product` is matched against the dialog's visible product labels ("15 Arrow Shafts", "Oak Short Bow", ...), so 'arrow shaft', 'shortbow' and 'oak long' all resolve. Omit it to take the first product offered. One call makes one batch — 15 shafts, or one bow. |
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
| `getSkill(name: string): SkillState \| null` | Get a skill by name (case-insensitive; "hp"/"hitpoint" alias Hitpoints). |
| `getSkillXp(name: string): number \| null` | Get XP for a skill by name. |
| `getSkills(): SkillState[]` | Get all skills. |
| `getInventoryItem(slot: number): InventoryItem \| null` | Get inventory item by slot number. |
| `findInventoryItem(pattern: string \| RegExp): InventoryItem \| null` | Find inventory item by name pattern (shortest matching name wins). |
| `getInventory(): InventoryItem[]` | Get all inventory items. |
| `getEquipmentItem(slot: number): InventoryItem \| null` | Get equipment item by slot number. |
| `findEquipmentItem(pattern: string \| RegExp): InventoryItem \| null` | Find equipment item by name pattern (shortest matching name wins). |
| `getEquipment(): InventoryItem[]` | Get all equipped items. |
| `getBankItem(slot: number): BankItem \| null` | Get bank item by slot number (bank must be open). |
| `findBankItem(pattern: string \| RegExp): BankItem \| null` | Find bank item by name pattern (bank must be open; shortest matching name wins). |
| `getBankItems(): BankItem[]` | Get all bank items (bank must be open). |
| `isBankOpen(): boolean` | Check if bank interface is open. |
| `getNearbyNpc(index: number): NearbyNpc \| null` | Get NPC by index. |
| `findNearbyNpc(pattern: string \| RegExp, options?: FindOptions): NearbyNpc \| null` | Find NPC by name pattern (shortest matching name wins, then nearest; reachable preferred). |
| `getNearbyNpcs(): NearbyNpc[]` | Get all nearby NPCs. |
| `findNearbyPlayer(pattern: string \| RegExp, options?: FindOptions): NearbyPlayer \| null` | Find a nearby player by name pattern (shortest matching name wins, then nearest; reachable preferred). |
| `getNearbyPlayers(): NearbyPlayer[]` | Get all nearby players, nearest first. |
| `getNearbyLoc(x: number, z: number, id: number): NearbyLoc \| null` | Get location (object) by coordinates and ID. |
| `findNearbyLoc(pattern: string \| RegExp, options?: FindOptions): NearbyLoc \| null` | Find location by name pattern (shortest matching name wins, then nearest; reachable preferred). |
| `getNearbyLocs(): NearbyLoc[]` | Get all nearby locations (trees, rocks, etc). |
| `findGroundItem(pattern: string \| RegExp, options?: FindOptions): GroundItem \| null` | Find ground item by name pattern (shortest matching name wins, then nearest; reachable preferred). |
| `getGroundItems(): GroundItem[]` | Get all ground items. |
| `getDialog(): DialogState \| null` | Get current dialog state. |
| `getTradeState(): TradeState` | Current player-to-player trade session state. Returns a closed-trade default when no state has arrived or the connected client predates trade support. |
| `getPrayerState(): PrayerState \| null` | Get current prayer state from world state. |
| `isPrayerActive(prayer: PrayerName \| number): boolean` | Check if a specific prayer is currently active. |
| `getActivePrayers(): PrayerName[]` | Get list of all currently active prayer names. |
| `isDoorTemporarilyBlocked(level: number, x: number, z: number): boolean` | Check this SDK session's non-expired temporary door evidence. |

### Other

| Signature | Description |
|---|---|
| `async checkBotStatus(): Promise<BotStatus>` | Check bot status via gateway HTTP endpoint. Returns info about whether bot is connected and who else is controlling/observing. |
| `async launchBrowser(): Promise<void>` | Launch native browser to client URL. Uses the `open` package for cross-platform support (macOS, Windows, Linux, WSL). Falls back to printing the URL if no browser can be opened. |
| `countInventoryItems(pattern: string \| RegExp): number` | Count total item quantity matching a name pattern. This sums stack sizes across every matching slot. Use `getInventory().filter(...)` when the number of occupied slots is needed. |
| `async clickInterfaceOption(selector: InterfaceOptionSelector): Promise<ActionResult>` | Click exactly one interface option, selected by its state object or by visible text (substring for strings, match for regexes). This dispatches the option's `componentId` and never interprets `InterfaceOption.index` as an array position. |
| `blockDoorTemporarily(level: number, x: number, z: number, ttlMs: number = 30_000): boolean` | Temporarily exclude a known door from this SDK instance's path queries. The shared collision map is never mutated beyond the synchronous query. |

### Condition Waiting

| Signature | Description |
|---|---|
| `async waitForBotConnection(timeout?: number): Promise<void>` | Wait for bot to connect to gateway after browser launch. |
| `async waitForConnection(timeout: number = 60000): Promise<void>` | Wait for WebSocket connection to be established. |
| `async waitForChat(opts: { from?: string; matching?: RegExp \| string; types?: readonly number[]; includeSelf?: boolean; timeout?: number; } = {}): Promise<GameMessage \| null>` | Wait for the next chat message matching the given filters (messages arriving after this call; your own messages are excluded by default). The easy way to coordinate two bots: `sdk.say('ready'); const reply = await sdk.waitForChat({ from: 'partner', timeout: 60000 });` |
| `async waitForTradeRequest(opts: { from?: string; timeout?: number } = {}): Promise<string \| null>` | Wait for an incoming trade request ("X wishes to trade with you."). Requests arrive as chat type {@link TRADE_REQUEST_CHAT_TYPE}, which the default chat readers filter out. Returns the requester's name, or null on timeout. |
| `async waitForReady(timeout: number = 15000): Promise<BotWorldState>` | Wait for game state to be fully loaded and ready. Ensures player position is valid (not 0,0), bot is in-game, and state is recent. |
| `async waitForCondition(predicate: (state: BotWorldState) => boolean, timeout: number = 30000): Promise<BotWorldState>` | _No description provided._ |
| `async waitForStateChange(timeout: number = 30000): Promise<BotWorldState>` | Wait for next state update from server. |
| `async waitForTicks(ticks: number = 1): Promise<BotWorldState>` | Wait for a specific number of server ticks (~300ms each). |
| `async waitForStateUpdate(): Promise<BotWorldState>` | Wait for the next state update from the server. This is the most common waiting pattern - ensures fresh data after an action. State updates arrive once per server tick (~300ms) when PLAYER_INFO is received. |

### On-Demand Scanning

| Signature | Description |
|---|---|
| `async scanNearbyLocs(radius?: number): Promise<NearbyLoc[]>` | Scan for nearby locations with custom radius. Results are scoped to the player's current plane (each carries `level`); re-scan after climbing or descending rather than reusing old references. |
| `async scanGroundItems(radius?: number): Promise<GroundItem[]>` | Scan for ground items on-demand. This is more efficient than constantly pushing this data in state updates. |
| `async scanFindNearbyLoc(pattern: string \| RegExp, radius?: number): Promise<NearbyLoc \| null>` | Find a nearby location by name pattern (on-demand scan). |
| `async scanFindGroundItem(pattern: string \| RegExp, radius?: number): Promise<GroundItem \| null>` | Find a ground item by name pattern (on-demand scan). |

### Raw Actions

| Signature | Description |
|---|---|
| `async sendWalk(x: number, z: number, running: boolean = true): Promise<ActionResult>` | Send walk command to coordinates. |
| `async sendInteractLoc(x: number, z: number, locId: number, option: number = 1): Promise<ActionResult>` | Interact with a location (tree, rock, door, etc). |
| `async sendInteractNpc(npcIndex: number, option: number = 1): Promise<ActionResult>` | Interact with an NPC by index and option. |
| `async sendInteractPlayer(playerIndex: number, option: number = 2): Promise<ActionResult>` | Interact with a player by index and option (1-5). Option 2 = Attack (wilderness), 3 = Follow, 4 = Trade. |
| `async sendTalkToNpc(npcIndex: number): Promise<ActionResult>` | Talk to an NPC by index. |
| `async sendPickup(x: number, z: number, itemId: number): Promise<ActionResult>` | Pick up a ground item. |
| `async sendUseItem(slot: number, option: number = 1, interfaceId?: number): Promise<ActionResult>` | Use an inventory item (eat, equip, etc). `interfaceId` selects which inventory component holds the item. The main inventory (3214, the default) dispatches OPHELD1-5; any other component (trade offer, bank side inventory, ...) dispatches INV_BUTTON1-5, which is the packet family the engine actually handles for interface-defined item options - OPHELD with a foreign component id is silently dropped. |
| `async sendUseEquipmentItem(slot: number, option: number = 1): Promise<ActionResult>` | Use an equipped item (remove, operate, etc). |
| `async sendDropItem(slot: number): Promise<ActionResult>` | Drop an inventory item. |
| `async sendUseItemOnItem(sourceSlot: number, targetSlot: number): Promise<ActionResult>` | Use one inventory item on another. Rejected up front while a shop or bank modal is open: those replace the inventory tab, so the server drops the packet as "component not visible" and sends no message at all. Close the modal first — `bot.closeShop()`, `bot.closeInterface()`, or `sendCloseModal()`. |
| `async sendUseItemOnLoc(itemSlot: number, x: number, z: number, locId: number): Promise<ActionResult>` | Use an inventory item on a location. |
| `async sendUseItemOnNpc(itemSlot: number, npcIndex: number): Promise<ActionResult>` | Use an inventory item on an NPC. |
| `async sendClickDialog(option: number = 0): Promise<ActionResult>` | Click a dialog option by its server-assigned index. IMPORTANT: `option` is the **server-assigned index** stored on each `DialogOption.index` field — NOT the array position in `dialog.options`. Server-assigned indices are 1-based: `dialog.options[0].index === 1`. Pass `0` only as the implicit "continue" click for dialogs with no selectable options (the common pattern: pass through narration pages). To click an option by its visible text, prefer `clickDialogByText()`, which avoids the index-vs-position footgun entirely. |
| `async clickDialogByText(pattern: string \| RegExp): Promise<ActionResult>` | Click a dialog option whose visible text matches `pattern`. Convenience wrapper that resolves the server-assigned index for you, sidestepping the 1-based vs 0-based array-position confusion of `sendClickDialog()`. Matches against `DialogOption.text` (case-insensitive by default for string patterns). |
| `async sendClickComponent(componentId: number): Promise<ActionResult>` | Click a component using IF_BUTTON packet - for simple buttons, spellcasting, etc. |
| `async sendClickComponentWithOption(componentId: number, optionIndex: number = 1, slot: number = 0): Promise<ActionResult>` | Click a component using INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.) |
| `async sendClickInterfaceOption(arrayPosition: number): Promise<ActionResult>` | Click an interface option by **0-based array position**. Note the mismatch: `InterfaceOption.index` is a 1-based display label, so passing one straight through clicks the option after the one you matched. Prefer `clickInterfaceOption()` when selecting from published state. |
| `async sendAcceptCharacterDesign(): Promise<ActionResult>` | Accept character design in tutorial. |
| `async sendRandomizeCharacterDesign(): Promise<ActionResult>` | Randomize character appearance in tutorial. |
| `async sendShopBuy(slot: number, amount: number = 1): Promise<ActionResult>` | Buy from shop by slot and amount. |
| `async sendShopSell(slot: number, amount: number = 1): Promise<ActionResult>` | Sell to shop by slot and amount. |
| `async sendCloseShop(): Promise<ActionResult>` | Close shop interface. |
| `async sendCloseModal(): Promise<ActionResult>` | Close any modal interface. |
| `async sendCountDialog(value: number): Promise<ActionResult>` | Submit a numeric value to an open p_countdialog (Enter Amount) prompt. |
| `async sendTradeRequest(playerIndex: number): Promise<ActionResult>` | Send (or accept) a trade request to another player. There is no separate "accept" packet: requesting a player who already requested you is the acceptance, and opens the trade screen for both. Otherwise the partner sees "<you> wishes to trade with you." and the trade opens when they request back. |
| `async sendOfferItem(slot: number, amount: number = 1): Promise<ActionResult>` | Move items from your (trade-screen) side inventory into your offer. `slot` is the inventory slot. Amounts 1/5/10 and -1 (All) map to the game's offer buttons; any other amount uses Offer-X plus the count dialog. Only valid while the offer screen is open. |
| `async sendRetractItem(slot: number, amount: number = 1): Promise<ActionResult>` | Remove items from your offer back to your inventory. Same amount semantics as {@link sendOfferItem}. Note: removing (or adding) items resets both players' accepts server-side. |
| `async sendAcceptTrade(): Promise<ActionResult>` | Accept the currently open trade screen (first or confirm). The trade only advances when both players accept; an offer change resets accepts. |
| `async sendDeclineTrade(): Promise<ActionResult>` | Decline the open trade (closes the screen; both sides get their items back and the partner sees "Other player declined trade."). |
| `async sendSetCombatStyle(style: number): Promise<ActionResult>` | Set combat style (0-3). |
| `async sendTogglePrayer(prayer: PrayerName \| number): Promise<ActionResult>` | Toggle a prayer on or off by name or index (0-14). |
| `async sendSpellOnNpc(npcIndex: number, spellComponent: number): Promise<ActionResult>` | Cast spell on NPC using spell component ID (OPNPCT). |
| `async sendSpellOnPlayer(playerIndex: number, spellComponent: number): Promise<ActionResult>` | Cast spell on another player using spell component ID (OPPLAYERT). `playerIndex` is a world slot from `nearbyPlayers`, a different space from npc indices - use {@link sendSpellOnTarget} to avoid mixing them up. |
| `async sendSpellOnTarget(target: NearbyNpc \| NearbyPlayer, spellComponent: number): Promise<ActionResult>` | Cast a spell on whatever the target is - npc or player - picking the right packet from `target.kind`. This is the one to reach for in code that fights both, e.g. `sdk.sendSpellOnTarget(sdk.findNearbyPlayer('Zezima'), Spells.WIND_STRIKE)`. |
| `async sendSpellOnItem(slot: number, spellComponent: number): Promise<ActionResult>` | Cast spell on inventory item. |
| `async sendSpellOnGroundItem(x: number, z: number, itemId: number, spellComponent: number): Promise<ActionResult>` | Cast spell on ground item (e.g., Telekinetic Grab). |
| `async sendSetTab(tabIndex: number): Promise<ActionResult>` | Switch to a UI tab by index. |
| `async sendSay(message: string): Promise<ActionResult>` | Send a single chat message. The server caps public chat at {@link maxMessageLength} chars (400 on rs-sdk servers) and runs a word filter; `result.data` reports `{ sent, truncated, filtered, finalText }` so you know if your message was clipped or censored. For longer text that shouldn't be silently truncated, use {@link say}. |
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
  /** Index of the NPC/player we're targeting (-1 if none), already decoded: the client packs player targets as index + 32768, this does not. Read alongside `targetType` - index 7 is a different entity in each space. */
  targetIndex: number;
  /** What `targetIndex` refers to. */
  targetType: 'npc' | 'player' | 'none';
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
  /** True while the player's hitpoints are zero. */
  isDead: boolean;
  /** Changes after each observed death/respawn cycle. */
  lifeId: number;
  /** Number of respawns observed during this client session. */
  respawnCount: number;
  /** Public game tick when death was last observed, or null if none was observed. */
  lastDeathTick: number | null;
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
  options: InterfaceOption[];
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
  /** Whether withdrawals arrive as banknotes - the bank_main note/item toggle, mirrored from varp 115 (%bankcert). Meaningless while the bank is closed. */
  noteMode: boolean;
}
```

### TradeState

Player-to-player trade session state, read from the trademain/tradeconfirm interfaces. Accept flags are parsed from the server-set status text — on each screen at most one of myAccepted/partnerAccepted is ever true, because the second accept advances (or completes) the trade. Any offer change on the offer screen resets both accepts server-side, which is the built-in anti-scam property: the confirm screen always shows the final offers.

```typescript
interface TradeState {
  isOpen: boolean;
  /** 'offer' = first screen (offers editable), 'confirm' = final screen. */
  screen: 'offer' | 'confirm' | null;
  /** Partner display name, from "Trading With: <name>". */
  partner: string | null;
  myOffer: TradeItem[];
  theirOffer: TradeItem[];
  /** True when this client accepted the current screen and is waiting on the partner. */
  myAccepted: boolean;
  /** True when the partner accepted the current screen. */
  partnerAccepted: boolean;
}
```

### TradeResult

```typescript
interface TradeResult {
  success: boolean;
  message: string;
  /** Partner display name, when known. */
  partner?: string;
  /** Items removed from your inventory (by the completed trade). */
  gave: TradeItem[];
  /** Items added to your inventory (by the completed trade). */
  received: TradeItem[];
  reason?: 'player_not_found' | 'no_response' | 'declined' | 'busy' | 'offer_failed' | 'want_not_met' | 'no_space' | 'not_open' | 'timeout' | 'error';
}
```

### ServeTradesResult

```typescript
interface ServeTradesResult {
  success: boolean;
  message: string;
  /** Completed trades, in order. */
  trades: TradeResult[];
  reason?: 'until' | 'max_trades' | 'timeout' | 'error';
}
```

### CombatStyleState

```typescript
interface CombatStyleState {
  currentStyle: number;
  weaponName: string;
  styles: CombatStyleOption[];
  /** Interface id of the combat tab the server installed - the weapon category, effectively. */
  tabInterfaceId: number;
  /** False when the combat tab is unrecognised and style metadata is unknown rather than guessed. */
  known: boolean;
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

### OpFeedbackState

Evidence that the server discarded an op instead of running it, which it otherwise does completely silently. A strong hint, not a proof: the server also unsets the map flag when a walk finishes normally.

```typescript
interface OpFeedbackState {
  /** UNSET_MAP_FLAG packets received this client session. */
  mapFlagUnsetCount: number;
  /** Tick of the most recent UNSET_MAP_FLAG, -1 if never. */
  lastMapFlagUnsetTick: number;
  /** Unsets that arrived while the player was standing still, i.e. probable rejections. Monotonic: snapshot it before sending an op, compare after. Counts refused packets, not refused interactions. */
  opRejectedCount: number;
  /** Tick of the most recent counted rejection, -1 if never. For logging. */
  lastOpRejectedTick: number;
}
```

### BotWorldState

```typescript
interface BotWorldState {
  tick: number;
  /** Tick on which an updated Lite runner already emitted policy-gated KBD op2. */
  fastKbdAttackTick?: number;
  /** Prayer-on packets emitted in-process immediately before first-spawn KBD op2. */
  fastKbdPrayerOn?: { tick: number; prayerIndices: number[] };
  /** Prayer-off packets emitted in-process on the KBD-removal publication. */
  fastKbdPrayerOff?: { tick: number; prayerIndices: number[] };
  /** Monotonic state publication cursor; advances even for multiple publications in one game tick. */
  revision?: number;
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
  /** Absent when the connected client predates trade support. */
  trade?: TradeState;
  modalOpen: boolean;
  modalInterface: number;
  combatStyle?: CombatStyleState;
  combatEvents: CombatEvent[];
  prayers: PrayerState;
  /** Absent when the connected client predates authoritative PK-skull telemetry. */
  isSkulled?: boolean;
  /** Absent when the connected client predates authoritative auto-retaliate telemetry. */
  autoRetaliateEnabled?: boolean;
  /** Absent when the connected client predates the signal. */
  opFeedback?: OpFeedbackState;
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
  /** Primitive actions report dispatch; porcelain actions may report observation/completion. */
  phase?: 'validation' | 'routing' | 'dispatch' | 'observation' | 'completion';
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
  reason?: 'item_not_found' | 'cant_reach' | 'inventory_full' | 'taken_by_other' | 'timeout';
}
```

### DropItemResult

```typescript
interface DropItemResult {
  /** True only when every requested slot was observed leaving the inventory. */
  success: boolean;
  message: string;
  /** Inventory slots emptied (a dropped stack counts as one). */
  slotsDropped: number;
  reason?: 'item_not_found' | 'invalid_amount' | 'timeout';
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
  /** True only when the full requested amount was bought. */
  success: boolean;
  item?: InventoryItem;
  message: string;
  requestedAmount?: number;
  amountBought?: number;
  /** Some but not all of the requested amount was bought. */
  partial?: boolean;
  reason?: 'invalid_amount' | 'shop_not_open' | 'item_not_found' | 'partial_fill' | 'timeout';
}
```

### ShopSellResult

```typescript
interface ShopSellResult {
  /** True only when the full requested amount was sold. */
  success: boolean;
  message: string;
  requestedAmount?: number;
  amountSold?: number;
  /** Some but not all of the requested amount was sold. */
  partial?: boolean;
  rejected?: boolean;
  reason?: 'invalid_amount' | 'shop_not_open' | 'item_not_found' | 'rejected' | 'partial_fill' | 'timeout';
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
  /** `npc_not_found` also covers players: no target matched. */
  reason?: 'npc_not_found' | 'no_attack_option' | 'out_of_reach' | 'already_in_combat' | 'not_attackable' | 'died' | 'timeout';
  /** What the resolved target was, when one was found. */
  targetType?: 'npc' | 'player';
}
```

### CastSpellResult

```typescript
interface CastSpellResult {
  success: boolean;
  message: string;
  hit?: boolean;
  xpGained?: number;
  /** `npc_not_found` also covers players: no target matched. */
  reason?: 'npc_not_found' | 'out_of_reach' | 'no_runes' | 'not_attackable' | 'timeout';
  /** What the resolved target was, when one was found. */
  targetType?: 'npc' | 'player';
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
  reason?: 'no_hammer' | 'no_bars' | 'no_anvil' | 'cant_reach' | 'interface_not_opened' | 'level_too_low' | 'timeout' | 'no_xp_gained';
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
  /** True only when the full requested amount was deposited. */
  success: boolean;
  message: string;
  requestedAmount?: number;
  amountDeposited?: number;
  /** Some but not all of the requested amount was deposited. */
  partial?: boolean;
  reason?: 'invalid_amount' | 'bank_not_open' | 'item_not_found' | 'partial_fill' | 'timeout';
}
```

### BankWithdrawResult

```typescript
interface BankWithdrawResult {
  /** True only when the full requested amount was withdrawn. */
  success: boolean;
  message: string;
  item?: InventoryItem;
  requestedAmount?: number;
  amountWithdrawn?: number;
  /** Some but not all of the requested amount was withdrawn. */
  partial?: boolean;
  reason?: 'invalid_amount' | 'bank_not_open' | 'item_not_found' | 'partial_fill' | 'timeout';
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
  /** 'rejected' = the packet reached the server and the server discarded it. */
  reason?: 'npc_not_found' | 'no_matching_option' | 'cant_reach' | 'timeout' | 'rejected';
}
```

### PickpocketResult

```typescript
interface PickpocketResult {
  success: boolean;
  message: string;
  xpGained?: number;
  /** 'dispatch_failed' = never reached the game (client stalled or dropped it). 'rejected' = the server discarded the op. Retryable, cheaply. 'not_started' = no attempt message and no rejection either; unaccounted for. 'timeout' = the attempt did start, then never resolved. */
  reason?: 'npc_not_found' | 'no_pickpocket_option' | 'cant_reach' | 'stunned' | 'timeout' | 'dispatch_failed' | 'rejected' | 'not_started';
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
