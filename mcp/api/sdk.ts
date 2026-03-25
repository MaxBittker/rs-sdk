/**
 * Low-level Bot SDK API
 *
 * This module provides direct access to the bot protocol and state queries.
 * Methods resolve when server ACKNOWLEDGES them (not when effects complete).
 * For most use cases, prefer the high-level `bot` API instead.
 *
 * Import via: const { sdk } = await import('./api/index');
 * Or use directly if passed as parameter: sdk.getState(), sdk.sendWalk(), etc.
 */

/**
 * Available methods on the sdk object:
 *
 * == Connection ==
 * - isConnected() - Check if connected to gateway
 * - getConnectionState() - Get connection state ('connected', 'connecting', 'disconnected', 'reconnecting')
 *
 * == State Access (Synchronous) ==
 * - getState(): BotWorldState - Full state snapshot. Shape: { tick, inGame, player: PlayerState | null, skills: SkillState[], inventory: InventoryItem[], equipment: InventoryItem[], nearbyNpcs: NearbyNpc[], nearbyPlayers: NearbyPlayer[], nearbyLocs: NearbyLoc[], groundItems: GroundItem[], gameMessages: GameMessage[], dialog: DialogState, shop: ShopState, bank: BankState, trade: TradeState, combatEvents: CombatEvent[] }
 * - getStateAge(): number - Milliseconds since last state update
 *
 * == State Queries (all return directly, NOT wrapped in objects) ==
 * - getInventory(): InventoryItem[] - Returns array directly. Each item: { slot, id, name, count, optionsWithIndex }
 * - findInventoryItem(pattern): InventoryItem | undefined - Find item by name/id/regex
 * - getNearbyNpcs(): NearbyNpc[] - Returns array directly. Each NPC: { index, name, combatLevel, x, z, distance, hp, maxHp, healthPercent, inCombat, options }
 * - findNearbyNpc(pattern): NearbyNpc | undefined - Find NPC by name/id/regex
 * - getNearbyLocs(): NearbyLoc[] - Returns array directly. Each loc: { id, name, x, z, distance, options }
 * - findNearbyLoc(pattern): NearbyLoc | undefined - Find location by name/regex
 * - getGroundItems(): GroundItem[] - Returns array directly. Each: { id, name, count, x, z, distance }
 * - findGroundItem(pattern): GroundItem | undefined - Find ground item by name/regex
 * - getNearbyPlayer(index): NearbyPlayer | null - Get player by index
 * - findNearbyPlayer(pattern): NearbyPlayer | null - Find player by name/regex
 * - getNearbyPlayers(): NearbyPlayer[] - All nearby players
 * - getSkill(name): SkillState | undefined - Returns { name, level, baseLevel, experience }
 * - getAllSkills(): SkillState[] - All skills
 * - getEquippedItems(): InventoryItem[] - Worn equipment as array
 *
 * == Trade State Queries ==
 * - isTradeOpen(): boolean - Check if trade window is open
 * - isTradeConfirmOpen(): boolean - Check if trade confirm screen is open
 * - getTradePartnerName(): string - Get trade partner's name
 * - getTradeStatusText(): string - Get trade status text
 * - getTradeMyOffer(): TradeItem[] - Items in your trade offer
 * - getTradeTheirOffer(): TradeItem[] - Items in partner's trade offer
 * - getTradeMyInventory(): TradeItem[] - Your inventory items in trade side panel
 * - findTradeItem(pattern, items): TradeItem | null - Find item in trade item list
 *
 * == Key Types ==
 * PlayerState: { name, combatLevel, x, z, worldX, worldZ, level (floor 0-3), runEnergy, animId, combat: { inCombat, targetIndex, lastDamageTick } }
 * NOTE: PlayerState has NO hp/health field. Use sdk.getSkill('hitpoints') for current HP.
 *
 * == Raw Actions (Promise-based, resolve on acknowledgment) ==
 * - sendWalk(x, z, running?) - Walk to coordinates
 * - sendInteractLoc(x, z, locId, option) - Interact with location (chop tree, mine rock, etc.)
 * - sendInteractNpc(npcIndex, option) - Interact with NPC (talk, attack, trade, etc.)
 * - sendTakeGroundItem(x, z, itemId) - Pick up ground item
 * - sendUseItem(slot, option) - Use/equip/drop item
 * - sendUseItemOnLoc(slot, x, z, locId) - Use item on location
 * - sendUseItemOnNpc(slot, npcIndex) - Use item on NPC
 * - sendUseItemOnItem(slot1, slot2) - Use item on another item
 * - sendUseItemOnGroundItem(slot, x, z, itemId) - Use item on ground item
 * - sendClickDialog(option) - Click dialog option
 * - sendOpenBank() - Request to open bank
 * - sendBankDeposit(slot, amount) - Deposit item to bank
 * - sendBankWithdraw(bankSlot, amount) - Withdraw item from bank
 * - sendShopBuy(shopSlot, amount) - Buy from shop
 * - sendShopSell(invSlot, amount) - Sell to shop
 * - sendTradeOffer(slot, amount) - Offer item in trade (1/5/10/-1 for all/custom)
 * - sendTradeRemove(slot, amount) - Remove item from trade offer
 * - sendClickComponent(3420) - Accept trade (first screen)
 * - sendClickComponent(3546) - Confirm trade (second screen)
 * - sendCloseModal() - Decline/close trade
 * - sendCastSpell(spellName) - Cast spell
 * - sendCastSpellOnNpc(spellName, npcIndex) - Cast spell on NPC
 * - sendCastSpellOnItem(spellName, slot) - Cast spell on item
 * - sendCastSpellOnGroundItem(spellName, x, z, itemId) - Cast spell on ground item
 *
 * == Utility ==
 * - findPath(startX, startZ, endX, endZ) - Find walkable path between two points
 * - sendScreenshot() - Request screenshot from bot client (returns base64 data URL)
 * - checkBotStatus() - Check if bot client is connected to gateway
 * - waitForCondition(predicate, timeout?) - Wait for state to match predicate
 * - waitForStateChange(timeout?) - Wait for any state update
 *
 * == Listeners ==
 * - onStateUpdate(callback) - Register listener for state updates (returns unsubscribe function)
 * - onConnectionStateChange(callback) - Register listener for connection changes
 *
 * All send* methods return Promise<ActionResult> with { success: boolean, message?: string }
 * State query methods return data synchronously from cached state.
 *
 * Example usage:
 *   const state = sdk.getState();
 *   console.log('Position:', state.player.worldX, state.player.worldZ);
 *
 *   const tree = sdk.findNearbyLoc(/^tree$/i);
 *   if (tree) {
 *     const result = await sdk.sendInteractLoc(tree.x, tree.z, tree.id, 0);
 *     console.log('Chop result:', result);
 *   }
 */
