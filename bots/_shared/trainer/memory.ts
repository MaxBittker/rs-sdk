import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { TrainerMemory, TaskName } from './types';

export function defaultMemory(): TrainerMemory {
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        ladderStepId: null,
        lastTask: null,
        stalls: {},
        notes: [],
        sticky: null,
        avoidUntil: {},
        lastConfirm: null,
        quests: {},
    };
}

export function avoidKey(kind: string, name: string, x?: number, z?: number): string {
    if (x != null && z != null) return `${kind}:${name}:${Math.round(x)}:${Math.round(z)}`;
    return `${kind}:${name}`;
}

export function noteAvoid(memory: TrainerMemory, key: string, ttlMs: number, nowMs = Date.now()): void {
    if (!memory.avoidUntil) memory.avoidUntil = {};
    memory.avoidUntil[key] = nowMs + ttlMs;
}

export function isAvoided(memory: TrainerMemory, key: string, nowMs = Date.now()): boolean {
    const until = memory.avoidUntil?.[key];
    return until != null && until > nowMs;
}

export function expireAvoids(memory: TrainerMemory, nowMs = Date.now()): void {
    if (!memory.avoidUntil) return;
    for (const [k, until] of Object.entries(memory.avoidUntil)) {
        if (until <= nowMs) delete memory.avoidUntil[k];
    }
}

export function noteConfirm(
    memory: TrainerMemory,
    task: string,
    ok: boolean,
    reason: string,
): void {
    memory.lastConfirm = { task, ok, reason, at: new Date().toISOString() };
    if (!ok) {
        memory.notes = [...(memory.notes ?? []).slice(-40), `${task}:fail:${reason}`];
    }
}

export function memoryPathForBot(botDir: string): string {
    return join(botDir, 'trainer-memory.json');
}

export function loadMemory(path: string): TrainerMemory {
    if (!existsSync(path)) return defaultMemory();
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as TrainerMemory;
        return { ...defaultMemory(), ...raw, version: 1 };
    } catch {
        return defaultMemory();
    }
}

export function saveMemory(path: string, memory: TrainerMemory): void {
    memory.updatedAt = new Date().toISOString();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(memory, null, 2));
}

export function noteStall(memory: TrainerMemory, task: TaskName): void {
    memory.stalls[task] = (memory.stalls[task] ?? 0) + 1;
}

export function clearStall(memory: TrainerMemory, task: TaskName): void {
    delete memory.stalls[task];
}
