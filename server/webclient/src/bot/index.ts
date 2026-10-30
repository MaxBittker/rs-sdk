// Bot SDK - Re-exports for public API
// This module provides the main entry points for bot development

// Types and constants
export {
    SKILL_NAMES,
    INVENTORY_INTERFACE_ID,
    EQUIPMENT_INTERFACE_ID,
    SHOP_TEMPLATE_SIDE_ID,
    SHOP_TEMPLATE_SIDE_INV_ID,
    SHOP_TEMPLATE_ID,
    SHOP_TEMPLATE_INV_ID,
    type SkillState,
    type InventoryItemOption,
    type InventoryItem,
    type NpcOption,
    type NearbyNpc,
    type NearbyPlayer,
    type GroundItem,
    type LocOption,
    type NearbyLoc,
    type MenuAction,
    type GameMessage,
    type ShopItem,
    type ShopConfig,
    type ShopState,
    type PlayerCombatState,
    type PlayerState,
    type CombatStyleOption,
    type CombatStyleState,
    type CombatEvent,
    type DialogState,
    type InterfaceState,
    type BotState,
    type BotWorldState,
    type PacketLogEntry,
    type BotAction
} from './types.js';

export type { CharacterDesign, CharacterDesignPatch, CharacterDesignState, CharacterDesignActionResult, CharacterBodyPart, CharacterColorPart, PlayerAppearance } from '../../../../sdk/character-design.js';

// State collection
export { BotStateCollector } from './StateCollector.js';

// Formatting
export { formatBotState, formatWorldStateForAgent } from './formatters.js';

// Action execution
export { ActionExecutor, formatAction, type ActionResult, type ActionResultOrPromise } from './ActionExecutor.js';

// Gateway connection
export { GatewayConnection, type GatewayMessageHandler, getBotUsername, getBotPassword } from './GatewayConnection.js';

// UI
export { OverlayUI, type OverlayUICallbacks } from './OverlayUI.js';

// Main overlay
export { BotOverlay, getBotOverlay } from './BotOverlay.js';
