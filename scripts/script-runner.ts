/**
 * Script Runner - Automatic instrumentation for bot scripts
 *
 * Provides:
 * - Automatic logging of BotActions calls
 * - Console capture to event log
 * - Periodic screenshots
 * - State snapshots
 * - Stall detection and timeout handling
 *
 * Each script runs in its own directory under scripts/<name>/runs/
 */

import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { launchBotWithSDK, sleep, type SDKSession } from '../test/utils/browser';
import { generateSave, type TestPreset } from '../test/utils/save-generator';
import { RunRecorder, type RunMetadata } from '../agent/run-recorder';
import { BotSDK } from '../agent/sdk';
import { BotActions } from '../agent/bot-actions';
import type { BotWorldState } from '../agent/types';

// ============================================================================
// State Delta Types & Computation
// ============================================================================

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
    npcKills: string[];
}

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

// ============================================================================
// Types
// ============================================================================

export interface ScriptConfig {
    /** Script name - creates scripts/<name>/ directory */
    name: string;
    /** Goal description - what success looks like */
    goal: string;
    /** Bot name (auto-generated if not provided) */
    botName?: string;
    /** Test preset - a fixed constraint like goal, NOT to be modified during optimization */
    preset?: TestPreset;
    /** Max runtime in ms (default: 5 minutes) */
    timeLimit?: number;
    /** No-progress timeout in ms (default: 30 seconds) */
    stallTimeout?: number;
    /** Screenshot interval in ms (default: 30 seconds, 0 to disable) */
    screenshotInterval?: number;
    /** State snapshot interval in ms (default: 10 seconds) */
    stateSnapshotInterval?: number;
    /** Launch options */
    launchOptions?: {
        skipTutorial?: boolean;
        headless?: boolean;
        /** Spawn window off-screen to avoid stealing focus (env: BACKGROUND=true) */
        background?: boolean;
        /** Use shared browser - all scripts open as tabs in one window (default: true) */
        useSharedBrowser?: boolean;
    };
}

export interface ScriptContext {
    /** Raw SDK - not logged */
    sdk: BotSDK;
    /** Instrumented BotActions - auto-logged */
    bot: BotActions;
    /** Log a message (goes to console AND events.jsonl) */
    log: (msg: string) => void;
    /** Log a warning */
    warn: (msg: string) => void;
    /** Log an error */
    error: (msg: string) => void;
    /** Take a screenshot with optional label */
    screenshot: (label?: string) => Promise<void>;
    /** Mark progress (resets stall timer) */
    progress: () => void;
    /** Get current state */
    state: () => BotWorldState | null;
    /** Session for advanced usage */
    session: SDKSession;
}

export type ScriptFn = (ctx: ScriptContext) => Promise<void>;

// ============================================================================
// Stall Error
// ============================================================================

export class StallError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StallError';
    }
}

export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class DisconnectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DisconnectError';
    }
}

// ============================================================================
// Instrumented BotActions
// ============================================================================

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

            // Only wrap async methods (the action methods)
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

                        // Log the action with delta
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

                        // Mark progress on successful action
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

/**
 * Format arguments for logging (handle complex objects)
 */
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
            // For NearbyNpc, NearbyLoc, etc. - extract key fields
            const obj = arg as Record<string, unknown>;
            if ('name' in obj && 'index' in obj) {
                return { name: obj.name, index: obj.index }; // NPC
            }
            if ('name' in obj && 'id' in obj && 'x' in obj) {
                return { name: obj.name, id: obj.id, x: obj.x, z: obj.z }; // Loc
            }
            if ('name' in obj && 'slot' in obj) {
                return { name: obj.name, slot: obj.slot }; // InventoryItem
            }
            // Generic object - just stringify
            try {
                return JSON.parse(JSON.stringify(obj));
            } catch {
                return String(obj);
            }
        }
        return String(arg);
    });
}

// ============================================================================
// Console Capture (with deduplication)
// ============================================================================

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

// ============================================================================
// Progress Tracker
// ============================================================================

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
        }, 1000); // Check every second
    }

    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    getTimeSinceProgress(): number {
        return Date.now() - this.lastProgressTime;
    }
}

// ============================================================================
// Connection Health Monitor
// ============================================================================

/**
 * Monitors SDK connection and game state health.
 * Detects:
 * - SDK disconnections
 * - Game tick freezes (no state updates)
 */
class ConnectionHealthMonitor {
    private lastStateUpdateTime = Date.now();
    private lastTick = 0;
    private tickFreezeThresholdMs: number;
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private onTickFreeze: (() => void) | null = null;

    constructor(tickFreezeThresholdMs: number = 10000) {
        this.tickFreezeThresholdMs = tickFreezeThresholdMs;
    }

    /**
     * Call this whenever a state update is received
     */
    onStateUpdate(tick: number): void {
        if (tick !== this.lastTick) {
            this.lastTick = tick;
            this.lastStateUpdateTime = Date.now();
        }
    }

    /**
     * Start monitoring for tick freezes
     */
    startChecking(onTickFreeze: () => void): void {
        this.onTickFreeze = onTickFreeze;
        this.checkInterval = setInterval(() => {
            const timeSinceUpdate = Date.now() - this.lastStateUpdateTime;
            if (timeSinceUpdate > this.tickFreezeThresholdMs) {
                console.warn(`[Health] Game tick frozen for ${Math.round(timeSinceUpdate / 1000)}s (last tick: ${this.lastTick})`);
                this.onTickFreeze?.();
            }
        }, 2000); // Check every 2 seconds
    }

    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    getTimeSinceStateUpdate(): number {
        return Date.now() - this.lastStateUpdateTime;
    }

    getLastTick(): number {
        return this.lastTick;
    }
}

// ============================================================================
// Script Runner
// ============================================================================

/**
 * Run a script with automatic instrumentation.
 *
 * @example
 * ```ts
 * runScript({
 *   name: 'goblin-killer',
 *   goal: 'Kill goblins until combat level 10',
 *   preset: TestPresets.LUMBRIDGE_SPAWN,
 * }, async ({ bot, log, progress }) => {
 *   while (ctx.state()?.player?.combatLevel < 10) {
 *     const goblin = ctx.sdk.findNearbyNpc(/goblin/i);
 *     if (goblin) {
 *       log(`Attacking ${goblin.name}`);
 *       await bot.attackNpc(goblin);
 *       progress();
 *     }
 *   }
 * });
 * ```
 */
export function runScript(config: ScriptConfig, scriptFn: ScriptFn): void {
    const execute = async (): Promise<RunMetadata['outcome']> => {
        const scriptDir = join(__dirname, config.name);
        const runsDir = join(scriptDir, 'runs');

        // Ensure directories exist
        if (!existsSync(scriptDir)) {
            mkdirSync(scriptDir, { recursive: true });
        }
        if (!existsSync(runsDir)) {
            mkdirSync(runsDir, { recursive: true });
        }

        const timeLimit = config.timeLimit ?? 5 * 60 * 1000; // 5 minutes
        const stallTimeout = config.stallTimeout ?? 30_000; // 30 seconds
        const screenshotInterval = config.screenshotInterval ?? 30_000; // 30 seconds
        const stateSnapshotInterval = config.stateSnapshotInterval ?? 10_000; // 10 seconds
        const botName = config.botName ?? generateBotName(config.name);

        console.log(`\n=== Script: ${config.name} ===`);
        console.log(`Goal: ${config.goal}`);
        console.log(`Time limit: ${timeLimit / 1000}s, Stall timeout: ${stallTimeout / 1000}s`);

        // Generate save file from preset (a fixed constraint, not to be modified during optimization)
        const { TestPresets } = await import('../test/utils/save-generator');
        const preset = config.preset ?? TestPresets.LUMBRIDGE_SPAWN;
        console.log(`Creating save file for '${botName}' with preset...`);
        await generateSave(botName, preset);

        // Launch session
        let session: SDKSession | null = null;
        let recorder: RunRecorder | null = null;
        let consoleCapture: ConsoleCapture | null = null;
        let progressTracker: ProgressTracker | null = null;
        let healthMonitor: ConnectionHealthMonitor | null = null;
        let stateInterval: ReturnType<typeof setInterval> | null = null;
        let timeLimitTimeout: ReturnType<typeof setTimeout> | null = null;
        let unsubscribeConnection: (() => void) | null = null;
        let unsubscribeState: (() => void) | null = null;
        let stallDetected = false;
        let timeLimitReached = false;
        let disconnectDetected = false;
        let tickFreezeDetected = false;

        try {
            // Create recorder for this script's runs
            recorder = new RunRecorder({
                runsDir,
                screenshotIntervalMs: screenshotInterval
            });

            session = await launchBotWithSDK(botName, {
                ...config.launchOptions,
                // Default to shared browser (all scripts as tabs in one window)
                useSharedBrowser: config.launchOptions?.useSharedBrowser ?? true
            });
            const { sdk, bot, page } = session;
            console.log(`Bot '${session.botName}' ready at (${sdk.getState()?.player?.worldX}, ${sdk.getState()?.player?.worldZ})`);

            // Start recording with screenshot callback
            recorder.startRun(botName, config.goal, async () => {
                try {
                    const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
                    recorder?.saveScreenshot(`data:image/png;base64,${screenshot}`);
                } catch (err) {
                    // Ignore screenshot errors
                }
            });

            // Capture console
            consoleCapture = captureConsole(recorder);

            // Setup progress tracker
            progressTracker = new ProgressTracker(stallTimeout);
            progressTracker.startChecking(() => {
                stallDetected = true;
            });

            // Setup connection health monitor
            healthMonitor = new ConnectionHealthMonitor(15000); // 15s tick freeze threshold
            healthMonitor.startChecking(() => {
                tickFreezeDetected = true;
            });

            // Subscribe to SDK connection state changes
            unsubscribeConnection = sdk.onConnectionStateChange((state, attempt) => {
                console.log(`[SDK] Connection state: ${state}${attempt ? ` (attempt ${attempt})` : ''}`);
                if (state === 'disconnected') {
                    disconnectDetected = true;
                } else if (state === 'reconnecting') {
                    console.log(`[SDK] Attempting reconnection...`);
                } else if (state === 'connected') {
                    console.log(`[SDK] Connection restored`);
                    disconnectDetected = false; // Reset if we reconnected
                }
            });

            // Subscribe to state updates for health monitoring
            unsubscribeState = sdk.onStateUpdate((state) => {
                healthMonitor?.onStateUpdate(state.tick);
            });

            // Setup state snapshots
            stateInterval = setInterval(() => {
                const state = sdk.getState();
                if (state && recorder) {
                    recorder.logState(compactState(state));
                }
            }, stateSnapshotInterval);

            // Setup time limit
            timeLimitTimeout = setTimeout(() => {
                timeLimitReached = true;
            }, timeLimit);

            // Log initial state
            const initialState = sdk.getState();
            if (initialState) {
                recorder.logState(compactState(initialState));
            }

            // Create instrumented bot
            const instrumentedBot = createInstrumentedBot(bot, sdk, recorder, () => {
                progressTracker?.markProgress();
            });

            // Create context
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

            // Run the script with periodic stall/timeout checks
            const scriptPromise = scriptFn(ctx);

            // Poll for stall/timeout while script runs
            while (true) {
                const raceResult = await Promise.race([
                    scriptPromise.then(() => 'done' as const),
                    sleep(500).then(() => 'check' as const)
                ]);

                if (raceResult === 'done') {
                    break;
                }

                // Check conditions
                if (disconnectDetected) {
                    throw new DisconnectError(`SDK disconnected (last tick: ${healthMonitor?.getLastTick() || 'unknown'})`);
                }
                if (tickFreezeDetected) {
                    throw new DisconnectError(`Game tick frozen for ${Math.round((healthMonitor?.getTimeSinceStateUpdate() || 0) / 1000)}s (last tick: ${healthMonitor?.getLastTick() || 'unknown'})`);
                }
                if (stallDetected) {
                    throw new StallError(`No progress for ${stallTimeout / 1000}s`);
                }
                if (timeLimitReached) {
                    throw new TimeoutError(`Time limit of ${timeLimit / 1000}s reached`);
                }
            }

            // Log final state
            const finalState = sdk.getState();
            if (finalState && recorder) {
                recorder.logState(compactState(finalState));
            }

            recorder.setOutcome('success', 'Script completed successfully');
            return 'success';

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const errorStack = err instanceof Error ? err.stack : undefined;

            if (err instanceof DisconnectError) {
                console.error(`\nDISCONNECT: ${errorMessage}`);
                recorder?.logEvent({
                    timestamp: Date.now(),
                    type: 'error',
                    content: `Disconnect: ${errorMessage}`
                });
                recorder?.setOutcome('error', `Disconnect: ${errorMessage}`);
                return 'error';
            } else if (err instanceof StallError) {
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
                        if (state.dialog.isOpen) {
                            console.error(`  Dialog open: ${state.dialog.options.length} options`);
                        }
                    }
                } catch { /* ignore state read errors */ }
                console.error(`==================================\n`);
                recorder?.logEvent({
                    timestamp: Date.now(),
                    type: 'error',
                    content: errorMessage
                });
                recorder?.setOutcome('error', errorMessage);
                return 'error';
            }

        } finally {
            // Cleanup
            if (stateInterval) clearInterval(stateInterval);
            if (timeLimitTimeout) clearTimeout(timeLimitTimeout);
            progressTracker?.stop();
            healthMonitor?.stop();
            unsubscribeConnection?.();
            unsubscribeState?.();
            consoleCapture?.restore();
            recorder?.stopRun();

            if (session) {
                await session.cleanup();
            }
        }
    };

    execute()
        .then(outcome => {
            console.log(`\nOutcome: ${(outcome ?? 'error').toUpperCase()}`);
            process.exit(outcome === 'success' ? 0 : 1);
        })
        .catch(e => {
            console.error('Fatal error:', e);
            process.exit(1);
        });
}

// ============================================================================
// Helpers
// ============================================================================

function generateBotName(scriptName: string): string {
    const prefix = scriptName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4) || 'scpt';
    const suffix = Math.random().toString(36).slice(2, 5);
    return `${prefix}${suffix}`;
}

/**
 * Create a compact state representation for logging
 */
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

// Re-export TestPresets (only LUMBRIDGE_SPAWN is available)
export { TestPresets } from '../test/utils/save-generator';
