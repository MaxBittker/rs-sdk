// formatter.ts - State formatting for CLI and agent consumption
// Adapted from webclient/src/bot/formatters.ts for SDK use

import type { BotWorldState, PrayerName } from './types';
import { PRAYER_NAMES, isPlayerChat } from './types';

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
 * Format world state as a handful of lines: position, vitals, XP gained,
 * inventory, anything blocking, and the last few messages.
 * Used for the post-script snapshot, where a full dump buries script output.
 * `options.xpBefore` maps skill name -> xp at script start; only skills that
 * moved are listed.
 */
export function formatWorldStateSummary(
    state: BotWorldState,
    stateAgeMs?: number,
    options?: { xpBefore?: Record<string, number> }
): string {
    const lines: string[] = [];
    const stale = stateAgeMs !== undefined && stateAgeMs > 5000 ? ` | state ${formatAge(stateAgeMs)}` : '';

    const p = state.player;
    if (p) {
        const hp = (state.skills || []).find(s => s.name === 'Hitpoints');
        const hpStr = hp ? ` | HP ${hp.level}/${hp.baseLevel}` : '';
        const dead = p.isDead ? ' | DEAD' : '';
        let combat = '';
        if (p.combat.inCombat) {
            const target = state.nearbyNpcs.find(n => n.index === p.combat.targetIndex);
            combat = ` | fighting ${target?.name ?? `idx ${p.combat.targetIndex}`}`;
        }
        lines.push(`Pos (${p.worldX}, ${p.worldZ})${p.level ? ` lvl ${p.level}` : ''}${hpStr}${dead}${combat}${stale}`);
    } else {
        lines.push(`Not in game (tick ${state.tick})${stale}`);
    }

    // XP gained during the script - the usual "did it work?" signal
    if (options?.xpBefore) {
        const gains: string[] = [];
        for (const skill of state.skills || []) {
            const before = options.xpBefore[skill.name];
            if (before === undefined) continue;
            const delta = skill.experience - before;
            if (delta > 0) gains.push(`${skill.name} +${delta.toLocaleString()}`);
        }
        lines.push(gains.length > 0 ? `XP: ${gains.join(', ')}` : 'XP: none gained');
    }

    // Inventory as one line, most-of-the-time short enough to scan
    const inv = state.inventory || [];
    const counts = new Map<string, number>();
    for (const item of inv) counts.set(item.name, (counts.get(item.name) ?? 0) + item.count);
    const entries = [...counts].map(([name, count]) => (count > 1 ? `${name} x${count}` : name));
    const shown = entries.slice(0, 8).join(', ');
    const more = entries.length > 8 ? `, +${entries.length - 8} more` : '';
    lines.push(`Inv ${inv.length}/28: ${entries.length > 0 ? shown + more : '(empty)'}`);

    // Nearby entities, deduped by name (nearest distance wins) and capped -
    // enough to see where you are, not the full scene graph
    const nearbyLine = (
        label: string,
        entries: { name: string; distance: number }[],
        limit = 5
    ): string | null => {
        if (entries.length === 0) return null;
        const byName = new Map<string, { count: number; distance: number }>();
        for (const e of entries) {
            const existing = byName.get(e.name);
            if (existing) {
                existing.count++;
                existing.distance = Math.min(existing.distance, e.distance);
            } else {
                byName.set(e.name, { count: 1, distance: e.distance });
            }
        }
        const sorted = [...byName].sort((a, b) => a[1].distance - b[1].distance);
        const shown = sorted.slice(0, limit)
            .map(([name, d]) => `${name}${d.count > 1 ? ` x${d.count}` : ''} (${d.distance}t)`);
        const more = sorted.length > limit ? ` +${sorted.length - limit} more` : '';
        return `${label}: ${shown.join(', ')}${more}`;
    };

    const nearby = [
        nearbyLine('NPCs', state.nearbyNpcs || []),
        nearbyLine('Objs', state.nearbyLocs || []),
        nearbyLine('Ground', (state.groundItems || []).map(g => ({
            name: g.count > 1 ? `${g.name} x${g.count}` : g.name,
            distance: g.distance
        })), 4),
        nearbyLine('Players', state.nearbyPlayers || [], 3)
    ].filter((line): line is string => line !== null);
    lines.push(...nearby);

    // Anything that would block the next script
    const blockers: string[] = [];
    if (state.dialog?.isOpen) {
        const opts = state.dialog.options.length;
        blockers.push(`dialog open${opts > 0 ? ` (${opts} options)` : ''}`);
    }
    if (state.bank?.isOpen) blockers.push('bank open');
    if (state.shop?.isOpen) blockers.push(`shop open (${state.shop.title})`);
    if (state.trade?.isOpen) {
        // A live two-party session, not a stray modal - closing it declines the trade.
        blockers.push(`trade ${state.trade.screen} screen open with ${state.trade.partner ?? 'unknown'}`);
    } else if (state.interface?.isOpen && !state.bank?.isOpen && !state.shop?.isOpen) {
        blockers.push(`interface ${state.interface.interfaceId} open`);
    } else if (state.modalOpen && !state.dialog?.isOpen) {
        blockers.push(`modal ${state.modalInterface} open`);
    }
    if (blockers.length > 0) lines.push(`[!] ${blockers.join(', ')}`);

    // Last few messages - "I can't reach that" lives here
    const stripCodes = (s: string) => s.replace(/@\w+@/g, '');
    const recent = (state.gameMessages || []).slice(-40).filter(m => !m.fromSelf);
    const collapsed: { text: string; count: number }[] = [];
    for (const msg of recent) {
        const text = (isPlayerChat(msg.type) && msg.sender ? `${msg.sender}: ` : '') + stripCodes(msg.text);
        const last = collapsed[collapsed.length - 1];
        if (last && last.text === text) last.count++;
        else collapsed.push({ text, count: 1 });
    }
    for (const msg of collapsed.slice(-3)) {
        lines.push(`> ${msg.text}${msg.count > 1 ? ` (x${msg.count})` : ''}`);
    }

    return lines.join('\n');
}

/**
 * Format world state as readable plaintext/markdown.
 * `options.sinceTick`: only render gameMessages with tick > sinceTick.
 * The MCP server passes this to suppress chat the bot has already been shown
 * across repeated execute_code calls. Omit for full-state snapshots.
 */
export function formatWorldState(
    state: BotWorldState,
    stateAgeMs?: number,
    options?: { sinceTick?: number }
): string {
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
        if (p.isDead) {
            lines.push(`Status: DEAD (life ${p.lifeId}, death tick ${p.lastDeathTick ?? 'unknown'})`);
        } else if (p.respawnCount > 0) {
            lines.push(`Life: ${p.lifeId} (${p.respawnCount} respawn${p.respawnCount === 1 ? '' : 's'} observed)`);
        }

        // Combat status
        if (p.combat.inCombat) {
            const target = state.nearbyNpcs.find(n => n.index === p.combat.targetIndex);
            if (target) {
                const hpStr = target.hp !== null && target.maxHp !== null ? ` HP: ${target.hp}/${target.maxHp}` : '';
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
    if (state.modalOpen && !state.trade?.isOpen) {
        lines.push('');
        lines.push(`## Modal Open (interface: ${state.modalInterface})`);
        if (state.modalInterface === 3559) {
            lines.push('(Character design screen - use acceptCharacterDesign to continue)');
        }
    }

    if (state.dialog?.isOpen) {
        lines.push('');
        lines.push('## Dialog');
        if (state.dialog.isWaiting) {
            lines.push('(Waiting for server response...)');
        } else if (state.dialog.options.length > 0) {
            lines.push('Options (select with sendClickDialog(N) using the N below, or clickDialogByText("...")):');
            for (const opt of state.dialog.options) {
                lines.push(`  ${opt.index}. ${opt.text}`);
            }
            lines.push('(NOTE: N is the number shown above — NOT a 0-based array position. optionIndex 0 means "continue", not the first option.)');
        } else {
            lines.push('(Click to continue - use sendClickDialog(0))');
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
        if (state.trade?.isOpen) {
            lines.push('(This is the player-trade window - see the Trade section below. Drive it with bot.trade()/offerTradeItems()/acceptTrade(); closing it would DECLINE the trade.)');
        } else if (!state.shop?.isOpen && !state.bank?.isOpen) {
            lines.push('(This modal blocks most actions - close it with bot.closeInterface() or sdk.sendCloseModal())');
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

    // Trade state
    if (state.trade?.isOpen) {
        lines.push('');
        lines.push(`## Trade (${state.trade.screen} screen)`);
        lines.push(`Trading with: ${state.trade.partner ?? 'Unknown'}`);
        if (state.trade.myAccepted) lines.push('You have accepted - waiting for partner.');
        if (state.trade.partnerAccepted) lines.push('Partner has accepted.');
        lines.push('**Your offer:**');
        if (state.trade.myOffer.length === 0) {
            lines.push('  (Nothing)');
        } else {
            for (const item of state.trade.myOffer) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count}`);
            }
        }
        lines.push('**Their offer:**');
        if (state.trade.theirOffer.length === 0) {
            lines.push('  (Nothing)');
        } else {
            for (const item of state.trade.theirOffer) {
                lines.push(`  [${item.slot}] ${item.name} x${item.count}`);
            }
        }
    }

    // Skills (filter out unknown/placeholder skills like Stat18, Stat19)
    lines.push('');
    lines.push('## Skills');
    for (const skill of state.skills || []) {
        if (/^Stat\d+$/i.test(skill.name)) continue;
        const boosted = skill.level !== skill.baseLevel ? `${skill.level}/` : '';
        const displayName = skill.name === 'Hitpoints' ? 'HP' : skill.name;
        lines.push(`${displayName}: ${boosted}${skill.baseLevel} (${skill.experience.toLocaleString()} xp)`);
    }

    // Inventory
    lines.push('');
    const usedSlots = (state.inventory || []).length;
    const maxSlots = 28;
    const emptySlots = maxSlots - usedSlots;
    lines.push(`## Inventory (${emptySlots} empty slots)`);
    if ((state.inventory || []).length === 0) {
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
    if ((state.equipment || []).length > 0) {
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
            const trains = current.trainsSkills.length > 0 ? current.trainsSkills.join('/') : 'unknown';
            lines.push(`Style: ${current.name} (${current.type}, ${current.damageType}) - trains ${trains}`);
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
    if ((state.nearbyNpcs || []).length > 0) {
        lines.push('');
        lines.push('## Nearby NPCs');
        for (const npc of state.nearbyNpcs.slice(0, 10)) {
            const lvl = npc.combatLevel > 0 ? ` (Lvl ${npc.combatLevel})` : '';
            const hp = npc.hp !== null && npc.maxHp !== null ? ` HP: ${npc.hp}/${npc.maxHp}` : '';
            const combat = npc.inCombat ? ' [in combat]' : '';
            const unreachable = npc.reachable === false ? ' [UNREACHABLE]' : '';
            const opts = npc.options?.length > 0 ? ` [${npc.options.join(', ')}]` : '';
            lines.push(`- ${npc.name}${lvl}${hp}${combat}${unreachable} - ${npc.distance} tiles (idx: ${npc.index})${opts}`);
        }
        if (state.nearbyNpcs.length > 10) {
            lines.push(`  ... and ${state.nearbyNpcs.length - 10} more`);
        }
    }

    // Nearby Players
    if ((state.nearbyPlayers || []).length > 0) {
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
    if ((state.nearbyLocs || []).length > 0) {
        lines.push('');
        lines.push('## Nearby Objects');
        for (const loc of state.nearbyLocs.slice(0, 10)) {
            const unreachable = loc.reachable === false ? ' [UNREACHABLE]' : '';
            const opts = loc.options?.length > 0 ? ` [${loc.options.join(', ')}]` : '';
            lines.push(`- ${loc.name} at (${loc.x}, ${loc.z})${unreachable} - ${loc.distance} tiles${opts}`);
        }
        if (state.nearbyLocs.length > 10) {
            lines.push(`  ... and ${state.nearbyLocs.length - 10} more`);
        }
    }

    // Ground Items
    if ((state.groundItems || []).length > 0) {
        lines.push('');
        lines.push('## Ground Items');
        for (const item of state.groundItems.slice(0, 10)) {
            const unreachable = item.reachable === false ? ' [UNREACHABLE]' : '';
            lines.push(`- ${item.name} x${item.count} at (${item.x}, ${item.z})${unreachable} - ${item.distance} tiles`);
        }
        if (state.groundItems.length > 10) {
            lines.push(`  ... and ${state.groundItems.length - 10} more`);
        }
    }

    // Split chat from system messages so player speech is impossible to miss.
    // Type 2 = public chat, Type 3 = received private message. Other types are
    // server-generated text (welcomes, "you can't reach", level-up notices...).
    if (state.gameMessages && state.gameMessages.length > 0) {
        const stripCodes = (s: string) => s.replace(/@\w+@/g, '');
        const sinceTick = options?.sinceTick ?? -1;
        const fresh = state.gameMessages.filter(m => m.tick > sinceTick);

        const playerChat = fresh.filter(m =>
            isPlayerChat(m.type) &&
            m.sender &&
            !m.fromSelf  // suppress own-speech echo
        );
        const systemMessages = fresh.filter(m => !isPlayerChat(m.type));

        if (playerChat.length > 0) {
            lines.push('');
            lines.push('## Player Chat');
            for (const msg of playerChat.slice(-5)) {
                const tag = (msg.type === 3 || msg.type === 7) ? ' [PM]' : '';
                lines.push(`- ${msg.sender}${tag}: ${stripCodes(msg.text)}`);
            }
        }

        if (systemMessages.length > 0) {
            lines.push('');
            lines.push('## Recent Messages');
            for (const msg of systemMessages.slice(-5)) {
                const cleanText = stripCodes(msg.text);
                if (msg.sender) {
                    lines.push(`- ${msg.sender}: ${cleanText}`);
                } else {
                    lines.push(`- ${cleanText}`);
                }
            }
        }
    }

    return lines.join('\n');
}
