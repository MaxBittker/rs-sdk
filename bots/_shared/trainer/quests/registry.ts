/**
 * Quest plugin scaffold (phase 2).
 * Enable with TRAINER_AUTO_QUESTS=1 once runners are filled in.
 */
import type { BotActions } from '../../../sdk/actions';
import type { BotSDK } from '../../../sdk/index';
import type { Observation, SkillLevels, TrainerMemory } from '../types';

export interface QuestContext {
    sdk: BotSDK;
    bot: BotActions;
    levels: SkillLevels;
    coins: number;
    memory: TrainerMemory;
    log: (msg: string) => void;
    observation?: Observation;
}

export interface QuestPlugin {
    id: string;
    title: string;
    /** When true, runtime may run this quest before the skill ladder. */
    shouldRun(ctx: QuestContext): boolean;
    run(ctx: QuestContext): Promise<boolean>;
}

const quests: QuestPlugin[] = [];

export function registerQuest(plugin: QuestPlugin): void {
    quests.push(plugin);
}

export function listQuests(): QuestPlugin[] {
    return [...quests];
}

export function bootstrapQuestRegistry(): void {
    quests.length = 0;
    // Phase 2 runners register here, e.g.:
    // registerQuest(cooksAssistant);
}

export function nextQuest(ctx: QuestContext): QuestPlugin | null {
    if (process.env.TRAINER_AUTO_QUESTS !== '1') return null;
    return quests.find((q) => q.shouldRun(ctx)) ?? null;
}

export async function runQuest(plugin: QuestPlugin, ctx: QuestContext): Promise<boolean> {
    ctx.log(`quest: ${plugin.id} — ${plugin.title}`);
    return plugin.run(ctx);
}
