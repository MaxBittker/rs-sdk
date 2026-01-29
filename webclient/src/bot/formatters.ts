// formatters.ts - State formatting functions for display and agent consumption

import type { BotState, BotWorldState } from './types.js';

// Format state as text for display
export function formatBotState(state: BotState): string {
    const lines: string[] = [];

    lines.push('=== BOT SDK STATE ===');
    lines.push(`Tick: ${state.tick} | In Game: ${state.inGame}`);
    lines.push('');

    // Player info
    if (state.player) {
        const p = state.player;
        lines.push('--- PLAYER ---');
        lines.push(`${p.name} (Combat ${p.combatLevel})`);
        lines.push(`Position: (${p.worldX}, ${p.worldZ}) Level ${p.level}`);
        lines.push(`Run Energy: ${p.runEnergy}% | Weight: ${p.runWeight}kg`);
        lines.push('');
    }

    // Key stats (Hitpoints, Attack, Strength, Defence)
    lines.push('--- KEY STATS ---');
    const keySkills = ['Hitpoints', 'Attack', 'Strength', 'Defence', 'Magic', 'Ranged', 'Prayer'];
    for (const skillName of keySkills) {
        const skill = state.skills.find(s => s.name === skillName);
        if (skill) {
            const xpStr = skill.experience.toLocaleString();
            lines.push(`${skill.name}: ${skill.level}/${skill.baseLevel} (${xpStr} xp)`);
        }
    }
    lines.push('');

    // Inventory summary
    lines.push('--- INVENTORY ---');
    if (state.inventory.length === 0) {
        lines.push('Empty');
    } else {
        const itemCounts: Map<string, number> = new Map();
        for (const item of state.inventory) {
            const key = item.name;
            itemCounts.set(key, (itemCounts.get(key) || 0) + item.count);
        }
        for (const [name, qty] of itemCounts) {
            lines.push(`${name} x${qty}`);
        }
    }
    lines.push('');

    // Nearby NPCs
    lines.push('--- NEARBY NPCS ---');
    if (state.nearbyNpcs.length === 0) {
        lines.push('None');
    } else {
        for (let i = 0; i < Math.min(5, state.nearbyNpcs.length); i++) {
            const npc = state.nearbyNpcs[i];
            const lvlStr = npc.combatLevel > 0 ? ` (Lvl ${npc.combatLevel})` : '';
            const hpStr = npc.maxHp > 0 ? ` HP: ${npc.hp}/${npc.maxHp}` : '';
            const opts = npc.optionsWithIndex.map(o => o.text);
            const opStr = opts.length > 0 ? ` [${opts.join(', ')}]` : '';
            lines.push(`${npc.name}${lvlStr}${hpStr} - ${npc.distance} tiles${opStr}`);
        }
        if (state.nearbyNpcs.length > 5) {
            lines.push(`... and ${state.nearbyNpcs.length - 5} more`);
        }
    }
    lines.push('');

    // Nearby Players
    lines.push('--- NEARBY PLAYERS ---');
    if (state.nearbyPlayers.length === 0) {
        lines.push('None');
    } else {
        for (let i = 0; i < Math.min(5, state.nearbyPlayers.length); i++) {
            const pl = state.nearbyPlayers[i];
            lines.push(`${pl.name} (Combat ${pl.combatLevel}) - ${pl.distance} tiles`);
        }
        if (state.nearbyPlayers.length > 5) {
            lines.push(`... and ${state.nearbyPlayers.length - 5} more`);
        }
    }
    lines.push('');

    // Nearby Locations (interactable objects) - now on-demand via SDK scan methods
    lines.push('--- NEARBY OBJECTS ---');
    lines.push('(Use sdk.scanNearbyLocs() for on-demand scan)');
    lines.push('');

    // Ground items - now on-demand via SDK scan methods
    lines.push('--- GROUND ITEMS ---');
    lines.push('(Use sdk.scanGroundItems() for on-demand scan)');
    lines.push('');

    // Recent game messages
    lines.push('--- RECENT MESSAGES ---');
    if (state.gameMessages.length === 0) {
        lines.push('None');
    } else {
        for (const msg of state.gameMessages) {
            // Strip color tags
            const cleanText = msg.text.replace(/@\w+@/g, '');
            if (msg.sender) {
                lines.push(`${msg.sender}: ${cleanText}`);
            } else {
                lines.push(cleanText);
            }
        }
    }
    lines.push('');

    // Current menu actions (if menu is visible)
    if (state.menuActions.length > 1) {
        lines.push('--- AVAILABLE ACTIONS ---');
        for (let i = 0; i < Math.min(8, state.menuActions.length); i++) {
            const action = state.menuActions[i];
            // Strip color tags like @whi@, @cya@, etc.
            const cleanOption = action.option.replace(/@\w+@/g, '');
            lines.push(`${i + 1}. ${cleanOption}`);
        }
        if (state.menuActions.length > 8) {
            lines.push(`... and ${state.menuActions.length - 8} more`);
        }
    }

    // Shop state (if open)
    if (state.shop && state.shop.isOpen) {
        lines.push('');
        lines.push('--- SHOP OPEN ---');
        lines.push(`Title: ${state.shop.title}`);
        lines.push('');
        lines.push('Shop Items (Buy):');
        if (state.shop.shopItems.length === 0) {
            lines.push('  None');
        } else {
            for (const item of state.shop.shopItems.slice(0, 10)) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count}`);
            }
            if (state.shop.shopItems.length > 10) {
                lines.push(`  ... and ${state.shop.shopItems.length - 10} more`);
            }
        }
        lines.push('');
        lines.push('Your Items (Sell):');
        if (state.shop.playerItems.length === 0) {
            lines.push('  None');
        } else {
            for (const item of state.shop.playerItems.slice(0, 10)) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count}`);
            }
            if (state.shop.playerItems.length > 10) {
                lines.push(`  ... and ${state.shop.playerItems.length - 10} more`);
            }
        }
    }

    return lines.join('\n');
}

// Format world state for agent - includes dialog/modal info
export function formatWorldStateForAgent(state: BotWorldState, goal: string): string {
    const lines: string[] = [];

    lines.push(`## Current Goal: ${goal}`);
    lines.push(`Tick: ${state.tick}`);

    if (state.player) {
        lines.push('');
        lines.push('### Player');
        lines.push(`Name: ${state.player.name}, Combat Level: ${state.player.combatLevel}`);
        lines.push(`Position: (${state.player.worldX}, ${state.player.worldZ}), Level: ${state.player.level}`);
        lines.push(`Run Energy: ${state.player.runEnergy}%`);
    }

    // Modal state
    if (state.modalOpen) {
        lines.push('');
        lines.push(`### Modal Interface Open: ${state.modalInterface}`);
        if (state.modalInterface === 269) {
            lines.push('(This is the character design screen - use acceptCharacterDesign to continue)');
        }
    }

    // Dialog state
    if (state.dialog.isOpen) {
        lines.push('');
        lines.push('### Dialog Open');
        if (state.dialog.isWaiting) {
            lines.push('(Waiting for server response...)');
        } else if (state.dialog.options.length > 0) {
            lines.push('Options:');
            for (const opt of state.dialog.options) {
                lines.push(`  ${opt.index}. ${opt.text}`);
            }
        } else {
            lines.push('(Click to continue available - use optionIndex: 0)');
        }
    }

    // Interface state (crafting menus like fletching)
    if (state.interface && state.interface.isOpen) {
        lines.push('');
        lines.push(`### Interface Open (id: ${state.interface.interfaceId})`);
        if (state.interface.options.length > 0) {
            lines.push('Options (use "rsbot action interface <N>" to select):');
            for (const opt of state.interface.options) {
                lines.push(`  ${opt.index}. ${opt.text}`);
            }
        } else {
            lines.push('(No selectable options detected)');
        }
    }

    // Shop state
    if (state.shop && state.shop.isOpen) {
        lines.push('');
        lines.push('### Shop Open');
        lines.push(`Title: ${state.shop.title}`);
        lines.push('');
        lines.push('**Shop Items (to buy):**');
        if (state.shop.shopItems.length === 0) {
            lines.push('  (Empty)');
        } else {
            for (const item of state.shop.shopItems) {
                lines.push(`  - [slot ${item.slot}] ${item.name} x${item.count} (id: ${item.id})`);
            }
        }
        lines.push('');
        lines.push('**Your Items (to sell):**');
        if (state.shop.playerItems.length === 0) {
            lines.push('  (Empty)');
        } else {
            for (const item of state.shop.playerItems) {
                lines.push(`  - [slot ${item.slot}] ${item.name} x${item.count} (id: ${item.id})`);
            }
        }
        lines.push('');
        lines.push('Actions: Use shopBuy(slot, amount) or shopSell(slot, amount)');
    }

    // Nearby NPCs
    if (state.nearbyNpcs.length > 0) {
        lines.push('');
        lines.push('### Nearby NPCs');
        for (const npc of state.nearbyNpcs.slice(0, 8)) {
            const lvl = npc.combatLevel > 0 ? ` (Lvl ${npc.combatLevel})` : '';
            const hp = npc.maxHp > 0 ? ` HP: ${npc.hp}/${npc.maxHp}` : '';
            const optTexts = npc.optionsWithIndex.map(o => o.text);
            const opts = optTexts.length > 0 ? ` [${optTexts.join(', ')}]` : '';
            lines.push(`- ${npc.name}${lvl}${hp} - ${npc.distance} tiles away, index: ${npc.index}${opts}`);
        }
    }

    // Nearby Objects note - scanning is now on-demand
    // (Removed auto-display since nearbyLocs is empty until scanned)

    // Inventory summary
    if (state.inventory.length > 0) {
        lines.push('');
        lines.push('### Inventory');
        const itemCounts = new Map<string, number>();
        for (const item of state.inventory) {
            itemCounts.set(item.name, (itemCounts.get(item.name) || 0) + item.count);
        }
        for (const [name, qty] of itemCounts) {
            lines.push(`  ${name} x${qty}`);
        }
    }

    // Ground items note - scanning is now on-demand
    // (Removed auto-display since groundItems is empty until scanned)

    // Recent game messages
    if (state.gameMessages && state.gameMessages.length > 0) {
        lines.push('');
        lines.push('### Recent Messages');
        for (const msg of state.gameMessages) {
            const cleanText = msg.text.replace(/@\w+@/g, '');
            if (msg.sender) {
                lines.push(`- ${msg.sender}: ${cleanText}`);
            } else {
                lines.push(`- ${cleanText}`);
            }
        }
    }

    return lines.join('\n');
}
