import type { Observation, TaskName, TrainerMemory } from '../types';

export interface PlannerHints {
    noTargetNearby: boolean;
    lowHp: boolean;
    recentFail: boolean;
}

export function deriveHints(
    obs: Observation,
    memory: TrainerMemory,
    activeTask: TaskName | null,
): PlannerHints {
    let noTargetNearby = false;
    if (activeTask === 'woodcutting') noTargetNearby = obs.noChopTarget;
    if (activeTask === 'mining') noTargetNearby = obs.noMineTarget;
    if (activeTask === 'thieving' || activeTask === 'combat') {
        noTargetNearby = obs.noCombatTarget && obs.nearbyNpc.length === 0;
    }
    const recentFail =
        memory.lastConfirm?.ok === false &&
        memory.lastConfirm.task === (activeTask ?? memory.lastConfirm.task) &&
        Date.now() - Date.parse(memory.lastConfirm.at) <= 60_000;
    return {
        noTargetNearby,
        lowHp: obs.lowHp,
        recentFail,
    };
}
