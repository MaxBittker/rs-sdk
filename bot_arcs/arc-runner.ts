/**
 * Arc Runner - Script runner for persistent Bot Arcs
 *
 * Unlike script-runner.ts which resets character state each run,
 * this runner maintains character persistence across runs.
 *
 * Key difference: Does NOT regenerate save files between runs.
 */

import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { launchBotWithSDK, sleep, type SDKSession } from '../test/utils/browser';
import { generateSave, type SaveConfig, TestPresets } from '../test/utils/save-generator';
import { RunRecorder } from '../agent/run-recorder';
import { BotSDK } from '../agent/sdk';
import { BotActions } from '../agent/bot-actions';
import type { BotWorldState } from '../agent/types';

// ============ State Delta Types ============

interface StateDelta {
    skillLevelUps: Array<{ skill: string; oldLevel: number; newLevel: number }>;
    skillXpGains: Array<{ skill: string; xpGained: number }>;
    itemsGained: Array<{ name: string; count: number }>;
    itemsLost: Array<{ name: string; count: number }>;
    equipmentChanged: Array<{ slot: string; from?: string; to?: string }>;
    hpChanged?: { from: number; to: number };
    positionChanged?: { distance: number; to: { x: number; z: number } };
    dialogOpened: boolean;
    dialogClosed: boolean;
    shopOpened: boolean;
    shopClosed: boolean;
    newMessages: string[];
    npcsNearby: Array<{ name: string; distance: number; combatLevel: number; options: string[] }>;
    locsNearby: Array<{ name: string; distance: number; options: string[] }>;
    groundItems: Array<{ name: string; count: number; distance: number }>;
    npcKills: string[];
}

// ============ State Delta Computation ============

function computeStateDelta(prev: BotWorldState, curr: BotWorldState): StateDelta {
    const delta: StateDelta = {
        skillLevelUps: [],
        skillXpGains: [],
        itemsGained: [],
        itemsLost: [],
        equipmentChanged: [],
        dialogOpened: false,
        dialogClosed: false,
        shopOpened: false,
        shopClosed: false,
        newMessages: [],
        npcsNearby: [],
        locsNearby: [],
        groundItems: [],
        npcKills: []
    };

    // Skill level-ups and XP gains
    for (const currSkill of curr.skills) {
        const prevSkill = prev.skills.find(s => s.name === currSkill.name);
        if (prevSkill) {
            if (currSkill.baseLevel > prevSkill.baseLevel) {
                delta.skillLevelUps.push({
                    skill: currSkill.name,
                    oldLevel: prevSkill.baseLevel,
                    newLevel: currSkill.baseLevel
                });
            }
            const xpGained = currSkill.experience - prevSkill.experience;
            if (xpGained >= 10) {
                delta.skillXpGains.push({ skill: currSkill.name, xpGained });
            }
        }
    }

    // Inventory changes - aggregate by item name
    const prevInvCounts = new Map<string, number>();
    const currInvCounts = new Map<string, number>();
    for (const item of prev.inventory) {
        prevInvCounts.set(item.name, (prevInvCounts.get(item.name) || 0) + item.count);
    }
    for (const item of curr.inventory) {
        currInvCounts.set(item.name, (currInvCounts.get(item.name) || 0) + item.count);
    }

    // Items gained
    currInvCounts.forEach((currCount, name) => {
        const prevCount = prevInvCounts.get(name) || 0;
        if (currCount > prevCount) {
            delta.itemsGained.push({ name, count: currCount - prevCount });
        }
    });
    // Items lost
    prevInvCounts.forEach((prevCount, name) => {
        const currCount = currInvCounts.get(name) || 0;
        if (prevCount > currCount) {
            delta.itemsLost.push({ name, count: prevCount - currCount });
        }
    });

    // Equipment changes - compare by slot
    const equipSlots = ['Head', 'Cape', 'Neck', 'Weapon', 'Body', 'Shield', 'Legs', 'Hands', 'Feet', 'Ring', 'Ammo'];
    for (let i = 0; i < equipSlots.length; i++) {
        const slotName = equipSlots[i];
        if (!slotName) continue;
        const prevItem = prev.equipment[i];
        const currItem = curr.equipment[i];
        const prevName = prevItem?.name || null;
        const currName = currItem?.name || null;
        if (prevName !== currName) {
            delta.equipmentChanged.push({
                slot: slotName,
                from: prevName || undefined,
                to: currName || undefined
            });
        }
    }

    // HP changes
    const prevHp = prev.skills.find(s => s.name === 'Hitpoints');
    const currHp = curr.skills.find(s => s.name === 'Hitpoints');
    if (prevHp && currHp && prevHp.level !== currHp.level) {
        delta.hpChanged = { from: prevHp.level, to: currHp.level };
    }

    // Position changes (threshold: > 2 tiles)
    if (prev.player && curr.player) {
        const dx = curr.player.worldX - prev.player.worldX;
        const dz = curr.player.worldZ - prev.player.worldZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2) {
            delta.positionChanged = {
                distance: Math.round(dist),
                to: { x: curr.player.worldX, z: curr.player.worldZ }
            };
        }
    }

    // UI state changes
    if (!prev.dialog.isOpen && curr.dialog.isOpen) delta.dialogOpened = true;
    if (prev.dialog.isOpen && !curr.dialog.isOpen) delta.dialogClosed = true;
    if (!prev.shop.isOpen && curr.shop.isOpen) delta.shopOpened = true;
    if (prev.shop.isOpen && !curr.shop.isOpen) delta.shopClosed = true;

    // New game messages (filter by tick, skip noise)
    const prevMaxTick = Math.max(0, ...prev.gameMessages.map(m => m.tick));
    const noisePatterns = [/^Welcome to RuneScape/i, /^You can access/i];
    delta.newMessages = curr.gameMessages
        .filter(m => m.tick > prevMaxTick)
        .filter(m => !noisePatterns.some(p => p.test(m.text)))
        .slice(0, 3)
        .map(m => m.text);

    // Track NPCs that were killed
    const currNpcIndices = new Set(curr.nearbyNpcs.map(n => n.index));
    const recentDamageTargets = new Set<number>();
    for (const event of curr.combatEvents) {
        if (event.type === 'damage_dealt' && event.targetType === 'npc') {
            recentDamageTargets.add(event.targetIndex);
        }
    }

    for (const prevNpc of prev.nearbyNpcs) {
        if (prevNpc.distance <= 10 && !currNpcIndices.has(prevNpc.index)) {
            const wasInCombatWithZeroHp = prevNpc.inCombat && prevNpc.hp === 0 && prevNpc.healthPercent !== null;
            const hadLowHealth = prevNpc.healthPercent !== null && prevNpc.healthPercent <= 5;
            const weDealtDamage = recentDamageTargets.has(prevNpc.index);

            if (wasInCombatWithZeroHp || (hadLowHealth && weDealtDamage)) {
                delta.npcKills.push(prevNpc.name);
            }
        }
    }

    return delta;
}

function formatDelta(delta: StateDelta): string | null {
    const lines: string[] = [];

    // Level-ups (most important)
    if (delta.skillLevelUps.length > 0) {
        const ups = delta.skillLevelUps.map(s => `${s.skill} ${s.oldLevel} -> ${s.newLevel}`).join(', ');
        lines.push(`LEVEL UP: ${ups}`);
    }

    // HP changes
    if (delta.hpChanged) {
        const diff = delta.hpChanged.to - delta.hpChanged.from;
        const sign = diff > 0 ? '+' : '';
        lines.push(`HP: ${delta.hpChanged.from} -> ${delta.hpChanged.to} (${sign}${diff})`);
    }

    // Equipment changes
    for (const eq of delta.equipmentChanged) {
        if (eq.to && eq.from) {
            lines.push(`EQUIPPED: ${eq.to} (was ${eq.from})`);
        } else if (eq.to) {
            lines.push(`EQUIPPED: ${eq.to}`);
        } else if (eq.from) {
            lines.push(`UNEQUIPPED: ${eq.from}`);
        }
    }

    // Inventory changes
    if (delta.itemsGained.length > 0) {
        const gained = delta.itemsGained.map(i => i.count > 1 ? `${i.name} x${i.count}` : i.name).join(', ');
        lines.push(`+INV: ${gained}`);
    }
    if (delta.itemsLost.length > 0) {
        const lost = delta.itemsLost.map(i => i.count > 1 ? `${i.name} x${i.count}` : i.name).join(', ');
        lines.push(`-INV: ${lost}`);
    }

    // XP gains (summarize)
    if (delta.skillXpGains.length > 0) {
        const xp = delta.skillXpGains.map(s => `${s.skill} +${s.xpGained}xp`).join(', ');
        lines.push(`XP: ${xp}`);
    }

    // Position
    if (delta.positionChanged) {
        lines.push(`MOVED: ${delta.positionChanged.distance} tiles to (${delta.positionChanged.to.x}, ${delta.positionChanged.to.z})`);
    }

    // UI changes
    if (delta.dialogOpened) lines.push('Dialog opened');
    if (delta.dialogClosed) lines.push('Dialog closed');
    if (delta.shopOpened) lines.push('Shop opened');
    if (delta.shopClosed) lines.push('Shop closed');

    // Messages
    if (delta.newMessages.length > 0) {
        const msgs = delta.newMessages.map(m => `"${m}"`).join('; ');
        lines.push(`MSG: ${msgs}`);
    }

    // NPC kills
    if (delta.npcKills.length > 0) {
        lines.push(`KILLED: ${delta.npcKills.join(', ')}`);
    }

    if (lines.length === 0) return null;
    return lines.join(' | ');
}

// Re-export for convenience
export { StallError, TimeoutError, type ScriptContext } from '../scripts/script-runner';
import { StallError, TimeoutError, type ScriptContext } from '../scripts/script-runner';

export interface ArcConfig {
    /** Character name (must match save file) */
    characterName: string;
    /** Arc name - creates arcs/<name>/ directory */
    arcName: string;
    /** Goal description */
    goal: string;
    /** Max runtime in ms (default: 5 minutes) */
    timeLimit?: number;
    /** No-progress timeout in ms (default: 30 seconds) */
    stallTimeout?: number;
    /** Screenshot interval in ms (default: 30 seconds) */
    screenshotInterval?: number;
    /** State snapshot interval in ms (default: 10 seconds) */
    stateSnapshotInterval?: number;
    /** If true, generate initial save from preset (first run only) */
    initializeFromPreset?: SaveConfig;
    /** Launch options */
    launchOptions?: {
        headless?: boolean;
        background?: boolean;
        useSharedBrowser?: boolean;
    };
}

export type ArcFn = (ctx: ScriptContext) => Promise<void>;

/**
 * Creates a proxy around BotActions that logs all method calls with state deltas
 */
function createInstrumentedBot(
    bot: BotActions,
    sdk: BotSDK,
    recorder: RunRecorder,
    onProgress: () => void
): BotActions {
    return new Proxy(bot, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);

            if (typeof value === 'function' && prop !== 'constructor') {
                return async (...args: unknown[]) => {
                    const startTime = Date.now();
                    const stateBefore = sdk.getState();

                    try {
                        const result = await value.apply(target, args);
                        const durationMs = Date.now() - startTime;
                        const stateAfter = sdk.getState();

                        // Compute state delta
                        let deltaStr: string | undefined;
                        if (stateBefore && stateAfter) {
                            const delta = computeStateDelta(stateBefore, stateAfter);
                            deltaStr = formatDelta(delta) || undefined;
                        }

                        recorder.logAction(
                            String(prop),
                            formatArgs(args),
                            result,
                            durationMs,
                            deltaStr
                        );

                        // Log delta to console if present
                        if (deltaStr) {
                            console.log(`  [delta] ${deltaStr}`);
                        }

                        onProgress();
                        return result;
                    } catch (err) {
                        const durationMs = Date.now() - startTime;
                        const stateAfter = sdk.getState();

                        // Still compute delta on error (partial progress may have occurred)
                        let deltaStr: string | undefined;
                        if (stateBefore && stateAfter) {
                            const delta = computeStateDelta(stateBefore, stateAfter);
                            deltaStr = formatDelta(delta) || undefined;
                        }

                        recorder.logAction(
                            String(prop),
                            formatArgs(args),
                            { error: err instanceof Error ? err.message : String(err) },
                            durationMs,
                            deltaStr
                        );

                        if (deltaStr) {
                            console.log(`  [delta] ${deltaStr}`);
                        }

                        throw err;
                    }
                };
            }

            return value;
        }
    });
}

function formatArgs(args: unknown[]): unknown[] {
    return args.map(arg => {
        if (arg === null || arg === undefined) return arg;
        if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
            return arg;
        }
        if (arg instanceof RegExp) {
            return arg.toString();
        }
        if (typeof arg === 'object') {
            const obj = arg as Record<string, unknown>;
            if ('name' in obj && 'index' in obj) {
                return { name: obj.name, index: obj.index };
            }
            if ('name' in obj && 'id' in obj && 'x' in obj) {
                return { name: obj.name, id: obj.id, x: obj.x, z: obj.z };
            }
            if ('name' in obj && 'slot' in obj) {
                return { name: obj.name, slot: obj.slot };
            }
            try {
                return JSON.parse(JSON.stringify(obj));
            } catch {
                return String(obj);
            }
        }
        return String(arg);
    });
}

interface ConsoleCapture {
    restore: () => void;
    flush: () => void;
}

/**
 * Debounced console capture - suppresses successive identical messages
 * and shows them as "message [x4]" instead of repeating
 */
function captureConsole(recorder: RunRecorder): ConsoleCapture {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Debounce state
    let lastMessage = '';
    let lastLevel: 'log' | 'warn' | 'error' = 'log';
    let repeatCount = 0;

    const flushRepeated = () => {
        if (repeatCount > 1) {
            originalLog.apply(console, [`  [x${repeatCount}]`]);
            recorder.logConsole(`${lastMessage} [x${repeatCount}]`, lastLevel);
        }
        repeatCount = 0;
        lastMessage = '';
    };

    const handleMessage = (level: 'log' | 'warn' | 'error', args: unknown[]) => {
        const message = args.map(String).join(' ');

        if (message === lastMessage && level === lastLevel) {
            // Same message repeated - just increment counter
            repeatCount++;
            return;
        }

        // Different message - flush any pending repeats first
        flushRepeated();

        // Output this new message
        const originalFn = level === 'log' ? originalLog : level === 'warn' ? originalWarn : originalError;
        originalFn.apply(console, args);
        recorder.logConsole(message, level);

        // Track for deduplication
        lastMessage = message;
        lastLevel = level;
        repeatCount = 1;
    };

    console.log = (...args: unknown[]) => handleMessage('log', args);
    console.warn = (...args: unknown[]) => handleMessage('warn', args);
    console.error = (...args: unknown[]) => handleMessage('error', args);

    return {
        flush: flushRepeated,
        restore: () => {
            flushRepeated();
            console.log = originalLog;
            console.warn = originalWarn;
            console.error = originalError;
        }
    };
}

class ProgressTracker {
    private lastProgressTime = Date.now();
    private stallTimeout: number;
    private checkInterval: ReturnType<typeof setInterval> | null = null;

    constructor(stallTimeoutMs: number) {
        this.stallTimeout = stallTimeoutMs;
    }

    markProgress(): void {
        this.lastProgressTime = Date.now();
    }

    startChecking(onStall: () => void): void {
        this.checkInterval = setInterval(() => {
            if (Date.now() - this.lastProgressTime > this.stallTimeout) {
                onStall();
            }
        }, 1000);
    }

    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}

function compactState(state: BotWorldState): object {
    const hpSkill = state.skills.find(s => s.name === 'Hitpoints');
    return {
        tick: state.tick,
        player: state.player ? {
            x: state.player.worldX,
            z: state.player.worldZ,
            hp: hpSkill?.level ?? 10,
            maxHp: hpSkill?.baseLevel ?? 10,
            combatLevel: state.player.combatLevel
        } : null,
        skills: state.skills
            .filter(s => s.baseLevel > 1)
            .map(s => ({ name: s.name, level: s.baseLevel, xp: s.experience })),
        inventory: state.inventory.map(i => ({ name: i.name, count: i.count })),
        equipment: state.equipment.map(e => ({ slot: e.slot, name: e.name })),
        nearbyNpcs: state.nearbyNpcs.slice(0, 5).map(n => ({ name: n.name, dist: n.distance })),
        nearbyLocs: state.nearbyLocs.slice(0, 5).map(l => ({ name: l.name, dist: l.distance })),
        dialog: state.dialog.isOpen ? { open: true, options: state.dialog.options.length } : { open: false }
    };
}

/**
 * Write state.md to the character folder with full game state
 * This file is auto-updated after each run for AI awareness
 */
function writeStateMd(characterDir: string, state: BotWorldState, characterName: string): void {
    const lines: string[] = [];
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    lines.push(`# ${characterName} - Current State`);
    lines.push(`> Auto-updated after each arc run. Last update: ${now}`);
    lines.push('');

    // Player summary
    const hp = state.skills.find(s => s.name === 'Hitpoints');
    const player = state.player;
    if (player) {
        lines.push(`## Location`);
        lines.push(`- Position: (${player.worldX}, ${player.worldZ})`);
        lines.push(`- Combat Level: ${player.combatLevel}`);
        lines.push(`- HP: ${hp?.level ?? '?'}/${hp?.baseLevel ?? '?'}`);
        lines.push('');
    }

    // Skills
    lines.push(`## Skills`);
    const totalLevel = state.skills.reduce((sum, s) => sum + s.baseLevel, 0);
    lines.push(`**Total Level: ${totalLevel}**`);
    lines.push('');
    const trainedSkills = state.skills.filter(s => s.baseLevel > 1);
    if (trainedSkills.length > 0) {
        lines.push('| Skill | Level | XP |');
        lines.push('|-------|-------|-----|');
        for (const skill of trainedSkills.sort((a, b) => b.baseLevel - a.baseLevel)) {
            lines.push(`| ${skill.name} | ${skill.baseLevel} | ${skill.experience.toLocaleString()} |`);
        }
    } else {
        lines.push('No skills trained yet (all level 1)');
    }
    lines.push('');

    // Equipment
    lines.push(`## Equipment`);
    const slotNames = ['Head', 'Cape', 'Neck', 'Weapon', 'Body', 'Shield', 'Legs', 'Hands', 'Feet', 'Ring', 'Ammo'];
    const equipped = state.equipment.filter(e => e && e.name);
    if (equipped.length > 0) {
        for (const item of equipped) {
            const slotName = slotNames[item.slot] ?? `Slot ${item.slot}`;
            lines.push(`- **${slotName}**: ${item.name}`);
        }
    } else {
        lines.push('Nothing equipped');
    }
    lines.push('');

    // Inventory
    lines.push(`## Inventory (${state.inventory.length}/28)`);
    if (state.inventory.length > 0) {
        for (const item of state.inventory) {
            lines.push(`- ${item.name}${item.count > 1 ? ` x${item.count}` : ''}`);
        }
    } else {
        lines.push('Empty');
    }
    lines.push('');

    // Nearby (for context)
    lines.push(`## Nearby`);
    const npcs = state.nearbyNpcs.slice(0, 8);
    if (npcs.length > 0) {
        lines.push('**NPCs:**');
        for (const npc of npcs) {
            const combat = npc.combatLevel > 0 ? ` (lvl ${npc.combatLevel})` : '';
            lines.push(`- ${npc.name}${combat} - ${npc.distance.toFixed(0)} tiles`);
        }
    }
    const locs = state.nearbyLocs.slice(0, 5);
    if (locs.length > 0) {
        lines.push('');
        lines.push('**Objects:**');
        for (const loc of locs) {
            lines.push(`- ${loc.name} - ${loc.distance.toFixed(0)} tiles`);
        }
    }
    lines.push('');

    const statePath = join(characterDir, 'state.md');
    writeFileSync(statePath, lines.join('\n'));
}

/**
 * Run an arc with persistent character state.
 *
 * @example
 * ```ts
 * runArc({
 *   characterName: 'adam_1',
 *   arcName: 'fishing-basics',
 *   goal: 'Fish at Draynor until level 10',
 *   timeLimit: 5 * 60 * 1000,  // 5 minutes
 * }, async (ctx) => {
 *   // ... arc logic
 * });
 * ```
 */
export function runArc(config: ArcConfig, arcFn: ArcFn): void {
    const execute = async () => {
        const characterDir = join(__dirname, config.characterName);
        const arcDir = join(characterDir, 'arcs', config.arcName);
        const runsDir = join(arcDir, 'runs');

        // Ensure directories exist
        for (const dir of [characterDir, arcDir, runsDir]) {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        }

        const timeLimit = config.timeLimit ?? 5 * 60 * 1000;
        const stallTimeout = config.stallTimeout ?? 30_000;
        const screenshotInterval = config.screenshotInterval ?? 30_000;
        const stateSnapshotInterval = config.stateSnapshotInterval ?? 10_000;

        console.log(`\n=== Bot Arc: ${config.characterName} / ${config.arcName} ===`);
        console.log(`Goal: ${config.goal}`);
        console.log(`Time limit: ${timeLimit / 1000}s, Stall timeout: ${stallTimeout / 1000}s`);

        // Only generate save if explicitly requested (first run initialization)
        if (config.initializeFromPreset) {
            console.log(`Initializing character '${config.characterName}' from preset...`);
            await generateSave(config.characterName, config.initializeFromPreset);
        } else {
            console.log(`Using existing save for '${config.characterName}' (persistent character)`);
        }

        let session: SDKSession | null = null;
        let recorder: RunRecorder | null = null;
        let consoleCapture: ConsoleCapture | null = null;
        let progressTracker: ProgressTracker | null = null;
        let stateInterval: ReturnType<typeof setInterval> | null = null;
        let stateMdInterval: ReturnType<typeof setInterval> | null = null;
        let timeLimitTimeout: ReturnType<typeof setTimeout> | null = null;
        let stallDetected = false;
        let timeLimitReached = false;

        try {
            recorder = new RunRecorder({
                runsDir,
                screenshotIntervalMs: screenshotInterval
            });

            session = await launchBotWithSDK(config.characterName, {
                ...config.launchOptions,
                useSharedBrowser: config.launchOptions?.useSharedBrowser ?? true
            });
            const { sdk, bot, page } = session;

            // Wait for proper state with player position (polling approach for reliability)
            console.log('Waiting for game state to settle...');
            let stateReady = false;
            for (let i = 0; i < 60; i++) {  // Up to 30 seconds
                const s = sdk.getState();
                if ((s?.player?.worldX ?? 0) > 0 && (s?.player?.worldZ ?? 0) > 0) {
                    stateReady = true;
                    break;
                }
                await sleep(500);
            }
            if (!stateReady) {
                console.warn('Warning: Timed out waiting for player position');
            }

            // Small delay for state to fully populate
            await sleep(500);

            const state = sdk.getState();
            console.log(`Character '${config.characterName}' ready at (${state?.player?.worldX}, ${state?.player?.worldZ})`);

            // Log initial stats
            if (state) {
                const totalLevel = state.skills.reduce((sum, s) => sum + s.baseLevel, 0);
                console.log(`Total Level: ${totalLevel}`);
            }

            recorder.startRun(config.characterName, config.goal, async () => {
                try {
                    const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
                    recorder?.saveScreenshot(`data:image/png;base64,${screenshot}`);
                } catch (err) {
                    // Ignore
                }
            });

            consoleCapture = captureConsole(recorder);

            progressTracker = new ProgressTracker(stallTimeout);
            progressTracker.startChecking(() => {
                stallDetected = true;
            });

            stateInterval = setInterval(() => {
                const state = sdk.getState();
                if (state && recorder) {
                    recorder.logState(compactState(state));
                }
            }, stateSnapshotInterval);

            // Write state.md every 30s for crash resilience
            stateMdInterval = setInterval(() => {
                try {
                    const state = sdk.getState();
                    if (state) {
                        writeStateMd(characterDir, state, config.characterName);
                    }
                } catch { /* ignore */ }
            }, 30_000);

            timeLimitTimeout = setTimeout(() => {
                timeLimitReached = true;
            }, timeLimit);

            const initialState = sdk.getState();
            if (initialState) {
                recorder.logState(compactState(initialState));
            }

            const instrumentedBot = createInstrumentedBot(bot, sdk, recorder, () => {
                progressTracker?.markProgress();
            });

            const ctx: ScriptContext = {
                sdk,
                bot: instrumentedBot,
                log: (msg: string) => console.log(msg),
                warn: (msg: string) => console.warn(msg),
                error: (msg: string) => console.error(msg),
                screenshot: async (label?: string) => {
                    try {
                        const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
                        recorder?.saveScreenshot(`data:image/png;base64,${screenshot}`, label);
                    } catch (err) {
                        // Ignore
                    }
                },
                progress: () => progressTracker?.markProgress(),
                state: () => sdk.getState(),
                session
            };

            const arcPromise = arcFn(ctx);

            while (true) {
                const raceResult = await Promise.race([
                    arcPromise.then(() => 'done' as const),
                    sleep(500).then(() => 'check' as const)
                ]);

                if (raceResult === 'done') {
                    break;
                }

                if (stallDetected) {
                    throw new StallError(`No progress for ${stallTimeout / 1000}s`);
                }
                if (timeLimitReached) {
                    throw new TimeoutError(`Time limit of ${timeLimit / 1000}s reached`);
                }
            }

            const finalState = sdk.getState();
            if (finalState && recorder) {
                recorder.logState(compactState(finalState));

            }

            recorder.setOutcome('success', 'Arc completed successfully');
            return 'success';

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const errorStack = err instanceof Error ? err.stack : undefined;

            if (err instanceof StallError) {
                console.error(`\nSTALL DETECTED: ${errorMessage}`);
                recorder?.setOutcome('stall', errorMessage);
                return 'stall';
            } else if (err instanceof TimeoutError) {
                console.log(`\nTIMEOUT (expected): ${errorMessage}`);
                recorder?.setOutcome('timeout', errorMessage);
                return 'timeout';
            } else {
                // Surface the FULL error to stdout so agents can debug
                console.error(`\n========== SCRIPT ERROR ==========`);
                console.error(`Message: ${errorMessage}`);
                if (errorStack) {
                    console.error(`\nStack trace:`);
                    console.error(errorStack);
                }
                // Log current state context
                try {
                    const state = session?.sdk?.getState();
                    if (state?.player) {
                        console.error(`\nState at error:`);
                        console.error(`  Position: (${state.player.worldX}, ${state.player.worldZ})`);
                        console.error(`  HP: ${state.skills.find(s => s.name === 'Hitpoints')?.level ?? '?'}`);
                        console.error(`  Inventory: ${state.inventory.length} items`);
                    }
                } catch { /* ignore state read errors */ }
                console.error(`==================================\n`);
                recorder?.setOutcome('error', errorMessage);
                return 'error';
            }

        } finally {
            if (stateInterval) clearInterval(stateInterval);
            if (stateMdInterval) clearInterval(stateMdInterval);
            if (timeLimitTimeout) clearTimeout(timeLimitTimeout);
            progressTracker?.stop();
            consoleCapture?.restore();
            recorder?.stopRun();

            // Write state.md for AI awareness before next run
            try {
                const finalState = session?.sdk?.getState();
                if (finalState) {
                    writeStateMd(characterDir, finalState, config.characterName);
                    console.log(`[state.md updated]`);
                }
            } catch { /* ignore state write errors */ }

            if (session) {
                await session.cleanup();
            }
        }
    };

    execute()
        .then(outcome => {
            console.log(`\nOutcome: ${outcome.toUpperCase()}`);
            process.exit(outcome === 'success' || outcome === 'timeout' ? 0 : 1);
        })
        .catch(e => {
            console.error('Fatal error:', e);
            process.exit(1);
        });
}

// Re-export TestPresets for initialization
export { TestPresets } from '../test/utils/save-generator';
