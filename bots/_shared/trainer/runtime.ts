/**
 * Progressive trainer runtime — thin loop over planner + skill plugins + quests.
 * Wiki knowledge is compiled JSON only (see scripts/wiki-*.ts).
 */
import { dirname, join } from 'path';
import { runScript } from '../../../sdk/runner';
import type { SkillLevels, TaskName, TrainerMemory } from './types';
import { chooseTask, shouldKeepSticky } from './planner/choose-task';
import {
    activeLadder,
    currentLadderStep,
    ladderProgressLabel,
    taskNeedsTool,
} from './planner/ladder';
import { bootstrapSkillRegistry, runSkill } from './skills/registry';
import { noteSupplyNeed } from './skills/supply';
import { runBankSession } from './bank/session';
import { FOOD } from './bank/kits';
import {
    clearStall,
    expireAvoids,
    loadMemory,
    memoryPathForBot,
    noteConfirm,
    noteStall,
    saveMemory,
} from './memory';
import {
    coinCount,
    countMatching,
    hasItem,
    inventoryCount,
    readLevels,
    sleep,
} from './util';
import { loadWikiIndex } from './knowledge/wiki';
import { loadWorldIndex } from './knowledge/world';
import { bootstrapQuestRegistry, nextQuest, runQuest } from './quests/registry';
import { buildObservation } from './observe/snapshot';
import { deriveHints } from './observe/hints';

const TICK_MS = 300;
const MAX_SECONDS = Number(process.env.TRAINER_MAX_SECONDS ?? '0');
const SAVE_EVERY = 15;
const ERROR_BACKOFF_MS = 1500;

function log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[trainer ${ts}] ${msg}`);
}

function hasToolFor(sdk: Parameters<typeof hasItem>[0], task: TaskName): boolean {
    const re = taskNeedsTool(task);
    if (!re) return true;
    return hasItem(sdk, re);
}

function hasBlockingUi(sdk: { getState: () => any }): boolean {
    const s = sdk.getState?.();
    if (!s) return false;
    // Level-up / unexpected dialog only — shop/bank are intentional sessions.
    if (s.dialog?.isOpen && !s.shop?.isOpen && !s.bank?.isOpen) return true;
    if (s.levelUp) return true;
    return false;
}

export function noteSkillFallback(
    memory: TrainerMemory,
    task: TaskName,
    ok: boolean,
    beforeConfirmAt: string | null,
): void {
    if ((memory.lastConfirm?.at ?? null) === beforeConfirmAt) {
        noteConfirm(memory, task, ok, ok ? 'ok' : 'skill returned false');
    }
}

async function ensureTutorialDone(bot: any, sdk: any): Promise<void> {
    await bot.skipTutorial();
    for (let i = 0; i < 12; i++) {
        const s = sdk.getState();
        const ifaceId = s?.interface?.interfaceId ?? s?.modalInterface;
        if (ifaceId === 3559 || s?.modalOpen) {
            log('accept character design');
            try {
                await sdk.sendRandomizeCharacterDesign();
                await sleep(200);
                await sdk.sendAcceptCharacterDesign();
                await sleep(500);
            } catch (e) {
                log(`design accept: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        const stillTutorial =
            !!sdk.findNearbyNpc(/runescape guide|survival expert/i) ||
            ifaceId === 3559 ||
            (s?.player != null && s.player.worldX < 3100 && s.player.worldZ < 3200);
        if (!stillTutorial && s?.inGame) break;
        log(`tutorial skip attempt ${i + 1}`);
        await bot.skipTutorial();
        await bot.dismissBlockingUI();
        await sleep(800);
    }
}

export async function runTrainer(): Promise<void> {
    bootstrapSkillRegistry();
    bootstrapQuestRegistry();
    const wiki = loadWikiIndex();
    const world = loadWorldIndex();
    log(`knowledge: wiki=${wiki.count} facts, world npcs=${world.npcCount} shops=${world.shopCount}`);
    log(`ladder: ${activeLadder().map((s) => s.id).join(' → ')}`);

    await runScript(
        async ({ bot, sdk }) => {
            await ensureTutorialDone(bot, sdk);
            await sleep(500);

            const botDir = process.env.BOT_DIR || join(dirname(Bun.main), '.');
            const memPath = memoryPathForBot(botDir);
            const memory = loadMemory(memPath);

            const started = Date.now();
            let ticks = 0;
            let consecutiveErrors = 0;

            log('progressive trainer online');

            while (true) {
                ticks += 1;
                if (MAX_SECONDS > 0 && (Date.now() - started) / 1000 > MAX_SECONDS) {
                    log(`max seconds ${MAX_SECONDS} reached — stopping`);
                    break;
                }

                // Soft reconnect wait if state goes stale.
                if (!sdk.isConnected?.() || !sdk.getState()?.inGame) {
                    log('waiting for connection/in-game…');
                    await sleep(2000);
                    continue;
                }

                expireAvoids(memory);
                const levels = readLevels(sdk) as SkillLevels;
                const coins = coinCount(sdk);
                const inv = inventoryCount(sdk);
                const ladder = activeLadder();
                const step = currentLadderStep(levels, ladder);
                const observation = buildObservation(sdk);
                const activeTask = memory.sticky?.task ?? step?.task ?? null;
                const hints = deriveHints(observation, memory, activeTask);
                memory.ladderStepId = step?.id ?? null;

                if (ticks % 10 === 1) {
                    log(`status coins=${coins} inv=${inv} ${ladderProgressLabel(levels, step)}`);
                }

                const ctxBase = {
                    sdk,
                    bot,
                    levels,
                    coins,
                    inventoryCount: inv,
                    memory,
                    log,
                    observation,
                };

                // Phase 2: quest interrupt after opening cash.
                const quest = nextQuest(ctxBase);
                if (quest && coins >= 100) {
                    try {
                        const qOk = await runQuest(quest, ctxBase);
                        if (qOk) {
                            consecutiveErrors = 0;
                            if (ticks % SAVE_EVERY === 0) saveMemory(memPath, memory);
                            await sleep(TICK_MS);
                            continue;
                        }
                    } catch (err) {
                        log(`quest error: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }

                const plannerInput = {
                    levels,
                    coins,
                    inventoryCount: inv,
                    inventoryFull: inv >= 28,
                    hasBlockingUi: hasBlockingUi(sdk),
                    hasToolFor: (task: TaskName) => hasToolFor(sdk, task),
                    hasLogs: countMatching(sdk, /logs?/i) > 0,
                    hasKnife: hasItem(sdk, /^knife$/i),
                    hasBows: countMatching(sdk, /bow/i) > 0,
                    bowCount: countMatching(sdk, /bow/i),
                    logCount: countMatching(sdk, /logs?/i),
                    rawFoodCount: countMatching(sdk, /raw\s+/i),
                    oreCount: countMatching(sdk, /ore|clay|coal/i),
                    foodCount: countMatching(
                        sdk,
                        FOOD,
                    ),
                    stalls: memory.stalls,
                    hints,
                    stickyTask: memory.sticky?.kind === 'skill' ? memory.sticky.task : undefined,
                };

                let decision = chooseTask(plannerInput);

                // Sticky goal: stay on WC/mining/fletch sessions instead of re-planning every tick.
                if (
                    memory.sticky &&
                    shouldKeepSticky(memory.sticky, plannerInput) &&
                    decision.kind !== 'dismiss_ui' &&
                    decision.kind !== 'idle'
                ) {
                    const s = memory.sticky;
                    if (s.kind === 'skill' && s.task) {
                        decision = { kind: 'skill', task: s.task, reason: `sticky: ${s.reason}` };
                    } else if (s.kind === 'bank') {
                        decision = { kind: 'bank', reason: `sticky: ${s.reason}` };
                    }
                    memory.sticky.ticks += 1;
                } else if (decision.kind === 'skill') {
                    memory.sticky = {
                        kind: 'skill',
                        task: decision.task,
                        reason: decision.reason,
                        startedAt: new Date().toISOString(),
                        ticks: 1,
                    };
                } else if (decision.kind === 'bank') {
                    memory.sticky = {
                        kind: 'bank',
                        reason: decision.reason,
                        startedAt: new Date().toISOString(),
                        ticks: 1,
                    };
                } else {
                    memory.sticky = null;
                }

                let ok = false;
                try {
                    switch (decision.kind) {
                        case 'dismiss_ui': {
                            log('dismiss UI');
                            await bot.dismissBlockingUI();
                            if (sdk.getState()?.dialog?.isOpen) {
                                try {
                                    await bot.navigateDialog([/click here|continue|yes|ok/i]);
                                } catch {
                                    await sdk.sendClickDialog(0);
                                }
                            }
                            ok = true;
                            break;
                        }
                        case 'bank': {
                            log(`bank: ${decision.reason}`);
                            const focus = step?.task ?? memory.lastTask ?? 'bank';
                            ok = await runBankSession(bot, sdk, focus, log);
                            memory.sticky = null;
                            break;
                        }
                        case 'supply': {
                            log(`supply: need ${decision.label}`);
                            noteSupplyNeed(memory, decision.label, decision.item);
                            const beforeConfirmAt = memory.lastConfirm?.at ?? null;
                            ok = await runSkill('supply', ctxBase);
                            if (!ok && coins < 16) {
                                log('supply: underfunded → thieving');
                                ok = await runSkill('thieving', ctxBase);
                            }
                            noteSkillFallback(memory, 'supply', ok, beforeConfirmAt);
                            memory.sticky = null;
                            break;
                        }
                        case 'skill': {
                            if (!String(decision.reason).startsWith('sticky:')) {
                                log(`skill: ${decision.task} (${decision.reason})`);
                            } else if (ticks % 5 === 1) {
                                log(`skill: ${decision.task} (${decision.reason})`);
                            }
                            memory.lastTask = decision.task;
                            const beforeConfirmAt = memory.lastConfirm?.at ?? null;
                            ok = await runSkill(decision.task, ctxBase);
                            noteSkillFallback(memory, decision.task, ok, beforeConfirmAt);
                            if (!ok) memory.sticky = null;
                            break;
                        }
                        case 'idle': {
                            log(`idle: ${decision.reason}`);
                            await sleep(2500);
                            ok = true;
                            memory.sticky = null;
                            break;
                        }
                    }
                    consecutiveErrors = ok ? 0 : consecutiveErrors;
                } catch (err) {
                    consecutiveErrors += 1;
                    memory.sticky = null;
                    log(`error: ${err instanceof Error ? err.message : String(err)}`);
                    ok = false;
                    await sleep(Math.min(ERROR_BACKOFF_MS * consecutiveErrors, 8000));
                }

                if (decision.kind === 'skill' || decision.kind === 'supply') {
                    const key = decision.kind === 'skill' ? decision.task : 'supply';
                    if (ok) clearStall(memory, key as TaskName);
                    else noteStall(memory, key as TaskName);
                }
                if (decision.kind === 'bank') {
                    if (ok) clearStall(memory, 'bank');
                    else noteStall(memory, 'bank');
                }

                if (ticks % SAVE_EVERY === 0) saveMemory(memPath, memory);
                await sleep(TICK_MS);
            }

            saveMemory(memPath, memory);
        },
        {
            timeout: undefined,
            printState: true,
            onDisconnect: 'wait',
            reconnectTimeout: 180_000,
        },
    );
}

if (import.meta.main) {
    await runTrainer();
}
