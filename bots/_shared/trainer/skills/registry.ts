import type { SkillPlugin, TaskName } from '../types';
import { thievingSkill } from './thieving';
import { woodcuttingSkill } from './woodcutting';
import { fletchingSkill, sellingSkill } from './fletching';
import { miningSkill } from './mining';
import { fishingSkill, cookingSkill } from './fishing';
import { combatSkill } from './combat';
import { supplySkill } from './supply';
import { firemakingSkill } from './firemaking';

const skills = new Map<TaskName, SkillPlugin>();

export function registerSkill(plugin: SkillPlugin): void {
    skills.set(plugin.id, plugin);
}

export function getSkill(id: TaskName): SkillPlugin | undefined {
    return skills.get(id);
}

export function listSkills(): SkillPlugin[] {
    return [...skills.values()];
}

export function bootstrapSkillRegistry(): void {
    skills.clear();
    for (const plugin of [
        thievingSkill,
        woodcuttingSkill,
        fletchingSkill,
        sellingSkill,
        miningSkill,
        fishingSkill,
        cookingSkill,
        combatSkill,
        supplySkill,
        firemakingSkill,
    ]) {
        registerSkill(plugin);
    }
}

export async function runSkill(
    id: TaskName,
    ctx: Parameters<SkillPlugin['run']>[0],
): Promise<boolean> {
    const plugin = skills.get(id);
    if (!plugin) return false;
    if (plugin.shouldRun && !plugin.shouldRun(ctx)) return false;
    return plugin.run(ctx);
}
