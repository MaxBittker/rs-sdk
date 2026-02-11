// formatter.ts - State formatting for CLI and agent consumption
// Adapted from webclient/src/bot/formatters.ts for SDK use

import type { BotWorldState, PrayerName } from './types';
import { PRAYER_NAMES } from './types';

/**
 * Format a duration in ms to human readable string
 */
function formatAge(ms: number): string {
    if (ms < 1000) return 'just now';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
}

/**
 * Format world state as readable plaintext/markdown
 */
export function formatWorldState(state: BotWorldState, stateAgeMs?: number): string {
    const lines: string[] = [];

    lines.push('# World State');
    const ageStr = stateAgeMs !== undefined ? ` | Updated: ${formatAge(stateAgeMs)}` : '';
    lines.push(`Tick: ${state.tick} | In Game: ${state.inGame}${ageStr}`);

    // Player info
    if (state.player) {
        const p = state.player;
        lines.push('');
        lines.push('## Player');
        lines.push(`Name: ${p.name} (Combat ${p.combatLevel})`);
        lines.push(`Position: (${p.worldX}, ${p.worldZ}) Level ${p.level}`);

        // Combat status
        if (p.combat.inCombat) {
            const target = state.nearbyNpcs.find(n => n.index === p.combat.targetIndex);
            if (target) {
                const hpStr = target.maxHp > 0 ? ` HP: ${target.hp}/${target.maxHp}` : '';
                lines.push(`In Combat: ${target.name}${hpStr}`);
            } else {
                lines.push(`In Combat: target index ${p.combat.targetIndex}`);
            }
        }

        // Recent combat events
        if (state.combatEvents && state.combatEvents.length > 0) {
            const recentEvents = state.combatEvents.slice(-5);
            for (const evt of recentEvents) {
                const ticksAgo = state.tick - evt.tick;
                const ago = ticksAgo > 0 ? ` (${ticksAgo} ticks ago)` : '';
                if (evt.type === 'damage_taken') {
                    lines.push(`  <- Took ${evt.damage} damage${ago}`);
                } else if (evt.type === 'damage_dealt') {
                    lines.push(`  -> Dealt ${evt.damage} damage${ago}`);
                } else if (evt.type === 'kill') {
                    lines.push(`  ** Kill${ago}`);
                }
            }
        }
    }

    // Modal/dialog state (important for understanding game state)
    if (state.modalOpen) {
        lines.push('');
        lines.push(`## Modal Open (interface: ${state.modalInterface})`);
        if (state.modalInterface === 269) {
            lines.push('(Character design screen - use acceptCharacterDesign to continue)');
        }
    }

    if (state.dialog.isOpen) {
        lines.push('');
        lines.push('## Dialog');
        if (state.dialog.isWaiting) {
            lines.push('(Waiting for server response...)');
        } else if (state.dialog.options.length > 0) {
            lines.push('Options:');
            for (const opt of state.dialog.options) {
                lines.push(`  ${opt.index}. ${opt.text}`);
            }
        } else {
            lines.push('(Click to continue - use optionIndex: 0)');
        }
    }

    // Interface state (crafting menus, etc.)
    if (state.interface && state.interface.isOpen) {
        lines.push('');
        lines.push(`## Interface (id: ${state.interface.interfaceId})`);
        if (state.interface.options.length > 0) {
            lines.push('Options:');
            for (const opt of state.interface.options) {
                lines.push(`  ${opt.index}. ${opt.text}`);
            }
        }
    }

    // Shop state
    if (state.shop && state.shop.isOpen) {
        lines.push('');
        lines.push('## Shop');
        lines.push(`Title: ${state.shop.title}`);
        lines.push('');
        lines.push('**Items for sale:**');
        if (state.shop.shopItems.length === 0) {
            lines.push('  (Empty)');
        } else {
            for (const item of state.shop.shopItems) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count} - buy: ${item.buyPrice}gp`);
            }
        }
        lines.push('');
        lines.push('**Your items (to sell):**');
        if (state.shop.playerItems.length === 0) {
            lines.push('  (Empty)');
        } else {
            for (const item of state.shop.playerItems) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count} - sell: ${item.sellPrice}gp`);
            }
        }
    }

    // Skills
    lines.push('');
    lines.push('## Skills');
    for (const skill of state.skills) {
        const boosted = skill.level !== skill.baseLevel ? `${skill.level}/` : '';
        lines.push(`${skill.name}: ${boosted}${skill.baseLevel} (${skill.experience.toLocaleString()} xp)`);
    }

    // Inventory
    lines.push('');
    const usedSlots = state.inventory.length;
    const maxSlots = 28;
    const emptySlots = maxSlots - usedSlots;
    lines.push(`## Inventory (${emptySlots} empty slots)`);
    if (state.inventory.length === 0) {
        lines.push('(Empty)');
    } else {
        const itemCounts = new Map<string, { count: number; options: string[] }>();
        for (const item of state.inventory) {
            const existing = itemCounts.get(item.name);
            if (existing) {
                existing.count += item.count;
            } else {
                itemCounts.set(item.name, {
                    count: item.count,
                    options: item.optionsWithIndex?.map(o => o.text) ?? []
                });
            }
        }
        for (const [name, data] of itemCounts) {
            const opts = data.options.length > 0 ? ` [${data.options.join(', ')}]` : '';
            lines.push(`- ${name} x${data.count}${opts}`);
        }
    }

    // Equipment
    if (state.equipment.length > 0) {
        lines.push('');
        lines.push('## Equipment');
        for (const item of state.equipment) {
            lines.push(`- ${item.name}`);
        }
    }

    // Combat style
    if (state.combatStyle) {
        lines.push('');
        lines.push('## Combat Style');
        lines.push(`Weapon: ${state.combatStyle.weaponName}`);
        const current = state.combatStyle.styles[state.combatStyle.currentStyle];
        if (current) {
            lines.push(`Style: ${current.name} (${current.type}) - trains ${current.trainedSkill}`);
        }
    }

    // Prayers
    if (state.prayers) {
        const activePrayers = state.prayers.activePrayers
            .map((active, i) => active ? PRAYER_NAMES[i] : null)
            .filter((name): name is PrayerName => name !== null);
        if (activePrayers.length > 0) {
            lines.push('');
            lines.push('## Active Prayers');
            lines.push(`Points: ${state.prayers.prayerPoints}/${state.prayers.prayerLevel}`);
            lines.push(`Active: ${activePrayers.join(', ')}`);
        }
    }

    // Nearby NPCs
    if (state.nearbyNpcs.length > 0) {
        lines.push('');
        lines.push('## Nearby NPCs');
        for (const npc of state.nearbyNpcs.slice(0, 10)) {
            const lvl = npc.combatLevel > 0 ? ` (Lvl ${npc.combatLevel})` : '';
            const hp = npc.maxHp > 0 ? ` HP: ${npc.hp}/${npc.maxHp}` : '';
            const combat = npc.inCombat ? ' [in combat]' : '';
            const opts = npc.options?.length > 0 ? ` [${npc.options.join(', ')}]` : '';
            lines.push(`- ${npc.name}${lvl}${hp}${combat} - ${npc.distance} tiles (idx: ${npc.index})${opts}`);
        }
        if (state.nearbyNpcs.length > 10) {
            lines.push(`  ... and ${state.nearbyNpcs.length - 10} more`);
        }
    }

    // Nearby Players
    if (state.nearbyPlayers.length > 0) {
        lines.push('');
        lines.push('## Nearby Players');
        for (const pl of state.nearbyPlayers.slice(0, 5)) {
            lines.push(`- ${pl.name} (Combat ${pl.combatLevel}) - ${pl.distance} tiles`);
        }
        if (state.nearbyPlayers.length > 5) {
            lines.push(`  ... and ${state.nearbyPlayers.length - 5} more`);
        }
    }

    // Nearby Locs
    if (state.nearbyLocs.length > 0) {
        lines.push('');
        lines.push('## Nearby Objects');
        for (const loc of state.nearbyLocs.slice(0, 10)) {
            const opts = loc.options?.length > 0 ? ` [${loc.options.join(', ')}]` : '';
            lines.push(`- ${loc.name} at (${loc.x}, ${loc.z}) - ${loc.distance} tiles${opts}`);
        }
        if (state.nearbyLocs.length > 10) {
            lines.push(`  ... and ${state.nearbyLocs.length - 10} more`);
        }
    }

    // Ground Items
    if (state.groundItems.length > 0) {
        lines.push('');
        lines.push('## Ground Items');
        for (const item of state.groundItems.slice(0, 10)) {
            lines.push(`- ${item.name} x${item.count} at (${item.x}, ${item.z}) - ${item.distance} tiles`);
        }
        if (state.groundItems.length > 10) {
            lines.push(`  ... and ${state.groundItems.length - 10} more`);
        }
    }

    // Recent messages
    if (state.gameMessages && state.gameMessages.length > 0) {
        lines.push('');
        lines.push('## Recent Messages');
        for (const msg of state.gameMessages.slice(-5)) {
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
