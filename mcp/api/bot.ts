/**
 * High-level Bot Actions API
 *
 * This module provides domain-aware methods that handle game mechanics automatically.
 * Actions wait for effects to complete (not just acknowledgment from server).
 *
 * Import via: const { bot } = await import('./api/index');
 * Or use directly if passed as parameter: bot.chopTree(), bot.walkTo(), etc.
 */

/**
 * Available methods on the bot object:
 *
 * == Movement ==
 * - walkTo(x, z, tolerance?) - Walk to coordinates, returns when arrived or stuck
 *
 * == Woodcutting ==
 * - chopTree(target?) - Chop a tree, wait for logs. target can be location, name pattern, or regex
 *
 * == Firemaking ==
 * - burnLogs(logs?) - Burn logs on ground. If logs specified, drops them first
 *
 * == Mining ==
 * - mineRock(target?) - Mine a rock, wait for ore
 *
 * == Fishing ==
 * - fish(target?) - Fish at a spot, wait for fish
 *
 * == Cooking ==
 * - cookFood(food?, range?) - Cook food on range/fire
 *
 * == Combat ==
 * - attackNpc(target, timeout?) - Attack NPC and wait for combat to complete
 * - eatFood(food) - Eat food item from inventory
 *
 * == Items & Inventory ==
 * - pickupItem(target) - Pick up ground item by name/pattern
 * - equipItem(item) - Equip item from inventory
 * - unequipItem(item) - Unequip item to inventory
 * - dropItem(item) - Drop item from inventory
 * - useItemOnLoc(item, loc) - Use item on location (e.g., logs on fire)
 * - useItemOnNpc(item, npc) - Use item on NPC
 * - useItemOnItem(item1, item2) - Use one item on another
 *
 * == Doors ==
 * - openDoor(target?) - Open door, target can be location or pattern
 *
 * == Shopping ==
 * - openShop(target?) - Open shop by talking to NPC
 * - buyFromShop(item, amount?) - Buy item from open shop
 * - sellToShop(item, amount?) - Sell inventory item to shop
 *
 * == Banking ==
 * - openBank(timeout?) - Open bank (walks to banker if needed)
 * - depositItem(item, amount?) - Deposit item to bank
 * - depositAll() - Deposit entire inventory
 * - withdrawItem(item, amount?) - Withdraw item from bank
 *
 * == Trading ==
 * - requestTrade(target, timeout?) - Request trade with nearby player (walks if needed)
 * - offerItem(target, amount?) - Offer item from inventory in trade window
 * - removeOffer(target, amount?) - Remove item from your trade offer
 * - acceptTrade(timeout?) - Accept trade (first screen, clicks accept button)
 * - confirmTrade(timeout?) - Confirm trade (second screen, finalizes trade)
 * - declineTrade() - Decline/close trade window
 *
 * == Crafting ==
 * - smithAtAnvil(product, options?) - Smith bars at anvil
 * - fletchLogs(product?) - Fletch logs into bows/arrows
 * - craftLeather(product?) - Craft leather at workbench
 * - spinWool() - Spin wool into ball of wool
 * - makePotery(product?) - Create pottery items
 *
 * == Prayer ==
 * - buryBones(bones) - Bury bones from inventory
 *
 * == Magic ==
 * - castSpell(spellName, target?) - Cast spell on target or self
 *
 * == UI ==
 * - dismissBlockingUI() - Close any blocking UI (dialogs, level-ups, etc.)
 * - skipTutorial() - Navigate through tutorial dialogs
 *
 * All methods return result objects with { success: boolean, message?: string, ... }
 * Check result.success before continuing. On failure, result.message explains why.
 *
 * Example usage:
 *   const tree = sdk.findNearbyLoc(/^tree$/i);
 *   const result = await bot.chopTree(tree);
 *   if (result.success) {
 *     console.log('Got logs:', result.logs);
 *   }
 */
