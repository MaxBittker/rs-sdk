# Observe + Wiki Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared observe → memory → wiki-confirm layer on the existing progressive ladder so skills adapt live, and complete Cook’s Assistant from wiki facts.

**Architecture:** Keep `chooseTask` + skill plugins. Each tick builds an `Observation`, updates avoid/confirm memory, feeds planner hints that can break sticky goals, and lets skills/quests confirm success via XP/items/chat. Wiki `bestResourceForLevel` and world `nearestNpc` drive targets; Cook’s Assistant becomes a real registered quest.

**Tech Stack:** Bun, `bun:test`, existing `bots/_shared/trainer/*`, compiled `wiki-index.json` / `world-index.json`, BotSDK (`getState`, `getNewChat`, `getNearbyLocs`, `getNearbyNpcs`, `getInventory`, `getSkillXp`).

**Spec:** `docs/superpowers/specs/2026-08-03-observe-wiki-trainer-design.md`

## Global Constraints

- Do not replace the early ladder or rewrite into a scored multi-goal planner.
- Never read raw `wiki/*.md` at runtime — only compiled JSON under `bots/_shared/trainer/data/`.
- Observation build order in code: live snapshot → memory avoids → wiki confirm (A→B→C).
- Phase 1 milestone: stable early ladder + Cook’s Assistant when `TRAINER_AUTO_QUESTS=1`.
- Follow TDD: failing test → minimal impl → pass → commit per task.
- Prefer small focused files; extend existing `memory.ts` rather than duplicating persistence.

## File map

| File | Responsibility |
|------|----------------|
| `bots/_shared/trainer/observe/snapshot.ts` | Build `Observation` from SDK |
| `bots/_shared/trainer/observe/hints.ts` | Derive `PlannerHints` from observation + memory |
| `bots/_shared/trainer/observe/confirm.ts` | Helpers: XP/item/chat confirm + fail classification |
| `bots/_shared/trainer/types.ts` | `Observation`, hints fields on memory/context |
| `bots/_shared/trainer/memory.ts` | `avoidUntil`, `lastConfirm`, quest flags, helpers |
| `bots/_shared/trainer/planner/choose-task.ts` | Consume hints; break sticky on fail/no-target/low HP |
| `bots/_shared/trainer/runtime.ts` | Wire observe → hints → plan → confirm |
| `bots/_shared/trainer/skills/smart-select.ts` | Prefer wiki resource name when scoring |
| `bots/_shared/trainer/skills/{woodcutting,mining,thieving,combat}.ts` | Confirm + respect avoids |
| `bots/_shared/trainer/quests/cooks-assistant.ts` | Real walkthrough steps |
| `bots/_shared/trainer/quests/registry.ts` | Register Cook’s |
| `bots/_shared/trainer/observe/*.test.ts` + extend `planner.test.ts` | Unit tests |
| `docs/TRAINER.md` | Document observe layer + env flags |

---

### Task 1: Observation snapshot types + builder

**Files:**
- Create: `bots/_shared/trainer/observe/snapshot.ts`
- Create: `bots/_shared/trainer/observe/snapshot.test.ts`
- Modify: `bots/_shared/trainer/types.ts`

**Interfaces:**
- Produces: `Observation`, `buildObservation(sdk): Observation`
- Consumes: BotSDK-like methods (`getState`, `getInventory`, `getNearbyLocs`, `getNearbyNpcs`, `getNewChat`, `getSkill`)

- [ ] **Step 1: Add types to `types.ts`**

Append (keep existing exports intact):

```ts
export interface ObservationTarget {
    kind: 'loc' | 'npc';
    name: string;
    x: number;
    z: number;
}

export interface Observation {
    tickAt: string;
    inGame: boolean;
    x: number;
    z: number;
    hp: number;
    hpMax: number;
    inventoryCount: number;
    coins: number;
    dialogOpen: boolean;
    shopOpen: boolean;
    bankOpen: boolean;
    nearbyChop: ObservationTarget[];
    nearbyMine: ObservationTarget[];
    nearbyNpc: ObservationTarget[];
    recentChat: string[];
    errors: Array<'cant_reach' | 'stun' | 'busy' | 'nothing' | 'other'>;
    lowHp: boolean;
    noCombatTarget: boolean;
    noChopTarget: boolean;
    noMineTarget: boolean;
}
```

Also extend `TrainerMemory`:

```ts
export interface TrainerMemory {
    version: 1;
    updatedAt: string;
    ladderStepId: string | null;
    lastTask: TaskName | null;
    stalls: Record<string, number>;
    notes: string[];
    sticky?: {
        kind: 'skill' | 'bank' | 'supply';
        task?: TaskName;
        label?: string;
        reason: string;
        untilInv?: number;
        startedAt: string;
        ticks: number;
    } | null;
    /** Spot/NPC avoids: key → unix ms expiry */
    avoidUntil?: Record<string, number>;
    lastConfirm?: {
        task: string;
        ok: boolean;
        reason: string;
        at: string;
    } | null;
    quests?: Record<string, { complete?: boolean; step?: string }>;
}
```

Extend `SkillRunContext` with optional `observation?: Observation`.

- [ ] **Step 2: Write failing tests**

Create `bots/_shared/trainer/observe/snapshot.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { buildObservation, classifyChatErrors } from './snapshot';

function mockSdk(over: Record<string, any> = {}) {
    const state = {
        inGame: true,
        player: { worldX: 3222, worldZ: 3218 },
        dialog: { isOpen: false },
        shop: { isOpen: false },
        bank: { isOpen: false },
        ...over.state,
    };
    return {
        getState: () => state,
        getInventory: () => over.inv ?? [{ name: 'Coins', count: 50 }],
        getNearbyLocs: () =>
            over.locs ?? [
                { name: 'Tree', x: 3220, z: 3218, optionsWithIndex: [{ text: 'Chop', opIndex: 0 }] },
            ],
        getNearbyNpcs: () => over.npcs ?? [{ name: 'Man', x: 3221, z: 3218 }],
        getNewChat: () => over.chat ?? [],
        getSkill: (name: string) =>
            name === 'Hitpoints' ? { level: 10, currentLevel: over.hp ?? 10 } : { level: 1, currentLevel: 1 },
        ...over.extra,
    };
}

describe('buildObservation', () => {
    test('captures position, nearby chop, and coins', () => {
        const obs = buildObservation(mockSdk() as any);
        expect(obs.inGame).toBe(true);
        expect(obs.x).toBe(3222);
        expect(obs.nearbyChop.length).toBe(1);
        expect(obs.nearbyChop[0]!.name).toBe('Tree');
        expect(obs.noChopTarget).toBe(false);
        expect(obs.coins).toBe(50);
    });

    test('flags lowHp when current HP <= 40% max', () => {
        const obs = buildObservation(mockSdk({ hp: 3 }) as any);
        expect(obs.lowHp).toBe(true);
        expect(obs.hp).toBe(3);
    });

    test('classifies cant_reach and stun from chat', () => {
        const errs = classifyChatErrors([
            { text: "I can't reach that!" },
            { text: 'You are stunned!' },
        ]);
        expect(errs).toContain('cant_reach');
        expect(errs).toContain('stun');
    });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/observe/snapshot.test.ts
```

Expected: FAIL (module / exports missing).

- [ ] **Step 4: Implement `snapshot.ts`**

```ts
import type { Observation, ObservationTarget } from '../types';

type SdkLike = {
    getState: () => any;
    getInventory: () => Array<{ name: string; count?: number }> | null | undefined;
    getNearbyLocs: () => Array<{
        name: string;
        x: number;
        z: number;
        optionsWithIndex?: Array<{ text: string }>;
    }>;
    getNearbyNpcs: () => Array<{ name: string; x: number; z: number }>;
    getNewChat: (opts?: object) => Array<{ text?: string; message?: string }>;
    getSkill: (name: string) => { level?: number; currentLevel?: number } | null | undefined;
};

export function classifyChatErrors(
    messages: Array<{ text?: string; message?: string }>,
): Observation['errors'] {
    const out: Observation['errors'] = [];
    for (const m of messages) {
        const t = m.text ?? m.message ?? '';
        if (/can'?t reach/i.test(t)) out.push('cant_reach');
        else if (/stunned/i.test(t)) out.push('stun');
        else if (/busy|already/i.test(t)) out.push('busy');
        else if (/nothing interesting|nothing happens/i.test(t)) out.push('nothing');
    }
    return out;
}

function coinCount(inv: Array<{ name: string; count?: number }>): number {
    return inv
        .filter((i) => /^coins?$/i.test(i.name))
        .reduce((s, i) => s + (i.count ?? 1), 0);
}

export function buildObservation(sdk: SdkLike): Observation {
    const s = sdk.getState?.() ?? {};
    const inv = sdk.getInventory?.() ?? [];
    const locs = sdk.getNearbyLocs?.() ?? [];
    const npcs = sdk.getNearbyNpcs?.() ?? [];
    const chat = sdk.getNewChat?.({ types: [0], includeSelf: false }) ?? [];
    const hpSkill = sdk.getSkill?.('Hitpoints');
    const hpMax = hpSkill?.level ?? 10;
    const hp = hpSkill?.currentLevel ?? hpMax;

    const nearbyChop: ObservationTarget[] = locs
        .filter((l) => l.optionsWithIndex?.some((o) => /chop/i.test(o.text)))
        .map((l) => ({ kind: 'loc' as const, name: l.name, x: l.x, z: l.z }));
    const nearbyMine: ObservationTarget[] = locs
        .filter((l) => l.optionsWithIndex?.some((o) => /^mine$/i.test(o.text)))
        .map((l) => ({ kind: 'loc' as const, name: l.name, x: l.x, z: l.z }));
    const nearbyNpc: ObservationTarget[] = npcs.map((n) => ({
        kind: 'npc' as const,
        name: n.name,
        x: n.x,
        z: n.z,
    }));

    const recentChat = chat.map((m) => m.text ?? m.message ?? '').filter(Boolean);
    const errors = classifyChatErrors(chat);
    const hasCowOrMan = nearbyNpc.some((n) => /man|woman|farmer|cow/i.test(n.name));

    return {
        tickAt: new Date().toISOString(),
        inGame: !!s.inGame,
        x: s.player?.worldX ?? 0,
        z: s.player?.worldZ ?? 0,
        hp,
        hpMax,
        inventoryCount: inv.length,
        coins: coinCount(inv),
        dialogOpen: !!s.dialog?.isOpen,
        shopOpen: !!s.shop?.isOpen,
        bankOpen: !!s.bank?.isOpen,
        nearbyChop,
        nearbyMine,
        nearbyNpc,
        recentChat,
        errors,
        lowHp: hpMax > 0 && hp / hpMax <= 0.4,
        noCombatTarget: !hasCowOrMan,
        noChopTarget: nearbyChop.length === 0,
        noMineTarget: nearbyMine.length === 0,
    };
}
```

Adjust `getNewChat` opts if SDK types require different signature — match `sdk/index.ts`.

- [ ] **Step 5: Run tests — expect PASS**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/observe/snapshot.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add bots/_shared/trainer/types.ts bots/_shared/trainer/observe/snapshot.ts bots/_shared/trainer/observe/snapshot.test.ts
git commit -m "$(cat <<'EOF'
feat(trainer): add per-tick observation snapshot

EOF
)"
```

---

### Task 2: Memory avoids + confirm helpers

**Files:**
- Modify: `bots/_shared/trainer/memory.ts`
- Create: `bots/_shared/trainer/observe/confirm.ts`
- Create: `bots/_shared/trainer/observe/memory-observe.test.ts`

**Interfaces:**
- Consumes: `TrainerMemory` from Task 1
- Produces:
  - `avoidKey(kind, name, x?, z?): string`
  - `noteAvoid(memory, key, ttlMs): void`
  - `isAvoided(memory, key, nowMs?): boolean`
  - `expireAvoids(memory, nowMs?): void`
  - `noteConfirm(memory, task, ok, reason): void`
  - `confirmByXpDelta(before, after): boolean`
  - `confirmByItemGain(beforeNames, afterNames, pattern): boolean`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from 'bun:test';
import { defaultMemory, noteAvoid, isAvoided, expireAvoids, noteConfirm, avoidKey } from '../memory';
import { confirmByXpDelta, confirmByItemGain } from './confirm';

describe('memory avoids', () => {
    test('noteAvoid blocks until expiry', () => {
        const m = defaultMemory();
        const key = avoidKey('loc', 'Tree', 3200, 3200);
        noteAvoid(m, key, 60_000, 1_000);
        expect(isAvoided(m, key, 1_500)).toBe(true);
        expect(isAvoided(m, key, 70_000)).toBe(false);
    });

    test('expireAvoids removes past keys', () => {
        const m = defaultMemory();
        noteAvoid(m, 'loc:Tree:1:1', 100, 0);
        expireAvoids(m, 200);
        expect(m.avoidUntil?.['loc:Tree:1:1']).toBeUndefined();
    });

    test('noteConfirm stores last result', () => {
        const m = defaultMemory();
        noteConfirm(m, 'woodcutting', false, 'cant_reach');
        expect(m.lastConfirm?.ok).toBe(false);
        expect(m.lastConfirm?.reason).toBe('cant_reach');
    });
});

describe('confirm helpers', () => {
    test('xp delta detects success', () => {
        expect(confirmByXpDelta(100, 120)).toBe(true);
        expect(confirmByXpDelta(100, 100)).toBe(false);
    });

    test('item gain detects new matching item', () => {
        expect(confirmByItemGain(['Bronze axe'], ['Bronze axe', 'Logs'], /logs?/i)).toBe(true);
        expect(confirmByItemGain(['Logs'], ['Logs'], /logs?/i)).toBe(false);
    });
});
```

- [ ] **Step 2: Run — expect FAIL**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/observe/memory-observe.test.ts
```

- [ ] **Step 3: Implement memory helpers in `memory.ts`**

```ts
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
```

Update `defaultMemory()` to include `avoidUntil: {}`, `lastConfirm: null`, `quests: {}`.

Create `observe/confirm.ts`:

```ts
export function confirmByXpDelta(beforeXp: number, afterXp: number): boolean {
    return afterXp > beforeXp;
}

export function confirmByItemGain(
    beforeNames: string[],
    afterNames: string[],
    pattern: RegExp,
): boolean {
    const before = beforeNames.filter((n) => pattern.test(n)).length;
    const after = afterNames.filter((n) => pattern.test(n)).length;
    return after > before;
}
```

- [ ] **Step 4: Run — expect PASS**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/observe/memory-observe.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add bots/_shared/trainer/memory.ts bots/_shared/trainer/observe/confirm.ts bots/_shared/trainer/observe/memory-observe.test.ts bots/_shared/trainer/types.ts
git commit -m "$(cat <<'EOF'
feat(trainer): memory avoids and action confirm helpers

EOF
)"
```

---

### Task 3: Planner hints from observation

**Files:**
- Create: `bots/_shared/trainer/observe/hints.ts`
- Modify: `bots/_shared/trainer/planner/choose-task.ts`
- Modify: `bots/_shared/trainer/planner.test.ts`

**Interfaces:**
- Produces: `PlannerHints`, `deriveHints(obs, memory, activeTask): PlannerHints`
- Extends: `PlannerInput` with optional `hints?: PlannerHints`
- Extends: `shouldKeepSticky(...)` to return false when hints say break

```ts
export interface PlannerHints {
    noTargetNearby: boolean;
    lowHp: boolean;
    recentFail: boolean;
    questReady: boolean;
}
```

- [ ] **Step 1: Write failing planner tests** (append to `planner.test.ts`)

```ts
import { shouldKeepSticky } from './planner/choose-task';

test('sticky breaks on noTargetNearby hint', () => {
    const sticky = {
        kind: 'skill' as const,
        task: 'woodcutting' as const,
        ticks: 5,
        reason: 'test',
        startedAt: '',
    };
    const keep = shouldKeepSticky(sticky, baseInput({
        levels: levels({ Thieving: 40 }),
        hints: { noTargetNearby: true, lowHp: false, recentFail: false, questReady: false },
    }));
    expect(keep).toBe(false);
});

test('sticky breaks on recentFail', () => {
    const sticky = {
        kind: 'skill' as const,
        task: 'thieving' as const,
        ticks: 2,
        reason: 'test',
        startedAt: '',
    };
    expect(
        shouldKeepSticky(sticky, baseInput({
            coins: 20,
            hints: { noTargetNearby: false, lowHp: false, recentFail: true, questReady: false },
        })),
    ).toBe(false);
});

test('lowHp during combat prefers bank when no food', () => {
    const d = chooseTask(baseInput({
        levels: levels({ Thieving: 40, Woodcutting: 30, Fletching: 20, Mining: 30 }),
        foodCount: 0,
        hints: { noTargetNearby: false, lowHp: true, recentFail: false, questReady: false },
    }));
    expect(d.kind === 'bank' || (d.kind === 'skill' && d.task === 'combat')).toBe(true);
    // Prefer bank interrupt:
    expect(d.kind).toBe('bank');
});
```

- [ ] **Step 2: Run — expect FAIL**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/planner.test.ts
```

- [ ] **Step 3: Implement hints + planner changes**

`observe/hints.ts`:

```ts
import type { Observation, TaskName, TrainerMemory } from '../types';

export interface PlannerHints {
    noTargetNearby: boolean;
    lowHp: boolean;
    recentFail: boolean;
    questReady: boolean;
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
        memory.lastConfirm.task === (activeTask ?? memory.lastConfirm.task);
    const questReady =
        process.env.TRAINER_AUTO_QUESTS === '1' &&
        !memory.quests?.['cooks-assistant']?.complete;
    return {
        noTargetNearby,
        lowHp: obs.lowHp,
        recentFail,
        questReady,
    };
}
```

In `choose-task.ts`, add to `PlannerInput`:

```ts
hints?: {
    noTargetNearby: boolean;
    lowHp: boolean;
    recentFail: boolean;
    questReady: boolean;
};
```

At top of `chooseTask` after UI dismiss / opening cash, add combat low-HP interrupt:

```ts
if (input.hints?.lowHp && input.foodCount < 1) {
    return { kind: 'bank', reason: 'low HP — withdraw food' };
}
```

In `shouldKeepSticky`, after null/tick checks:

```ts
if (input.hints?.noTargetNearby) return false;
if (input.hints?.recentFail) return false;
if (input.hints?.lowHp && sticky.task === 'combat') return false;
```

- [ ] **Step 4: Run — expect PASS**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/planner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add bots/_shared/trainer/observe/hints.ts bots/_shared/trainer/planner/choose-task.ts bots/_shared/trainer/planner.test.ts
git commit -m "$(cat <<'EOF'
feat(trainer): planner hints from observation break sticky goals

EOF
)"
```

---

### Task 4: Wire observation into runtime tick

**Files:**
- Modify: `bots/_shared/trainer/runtime.ts`

**Interfaces:**
- Consumes: `buildObservation`, `deriveHints`, `expireAvoids`, `noteConfirm` (skills may also note)
- Produces: `observation` on skill/quest context; `hints` on `plannerInput`

- [ ] **Step 1: Patch tick loop** (after in-game check, before quest/planner)

Insert:

```ts
import { buildObservation } from './observe/snapshot';
import { deriveHints } from './observe/hints';
import { expireAvoids } from './memory';

// inside loop after connection check:
expireAvoids(memory);
const observation = buildObservation(sdk);
const activeTask = memory.sticky?.task ?? step?.task ?? null;
const hints = deriveHints(observation, memory, activeTask);

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

const plannerInput = {
    // ...existing fields...
    stalls: memory.stalls,
    hints,
};
```

Ensure sticky path still calls `shouldKeepSticky(memory.sticky, plannerInput)` so hints apply.

When a skill returns `false`, call:

```ts
noteConfirm(memory, decision.task ?? decision.kind, false, 'skill returned false');
```

When `true`:

```ts
noteConfirm(memory, decision.task ?? decision.kind, true, 'ok');
clearStall(memory, ...); // existing
```

- [ ] **Step 2: Smoke typecheck / unit suite**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/
```

Expected: all existing + new tests PASS.

- [ ] **Step 3: Commit**

```bash
git add bots/_shared/trainer/runtime.ts
git commit -m "$(cat <<'EOF'
feat(trainer): wire observation and hints into runtime tick

EOF
)"
```

---

### Task 5: Wiki resource preference in smart-select + WC/mining travel

**Files:**
- Modify: `bots/_shared/trainer/skills/smart-select.ts`
- Modify: `bots/_shared/trainer/skills/woodcutting.ts`
- Modify: `bots/_shared/trainer/skills/mining.ts`
- Modify: `bots/_shared/trainer/skills/smart-select.test.ts`

**Interfaces:**
- Consumes: `bestResourceForLevel(skillId, level, tableRe)`
- Produces: `pickBestTree(sdk, level, preferredName?: string | null)` — boost score when name matches preferred wiki resource

- [ ] **Step 1: Failing test** in `smart-select.test.ts`

```ts
test('preferred wiki name boosts matching tree', () => {
    // Use existing mock pattern in file; if none, add a tiny mock sdk with Oak + Tree.
    // Expect pickBestTree(sdk, 20, 'Oak') prefers Oak over Tree when both unlocked.
});
```

Read current `smart-select.test.ts` and mirror its mock style exactly.

- [ ] **Step 2: Implement preferred-name boost**

In `pickBestTree` / `pickBestRock`, add optional `preferredName?: string | null`. When `preferredName` and `new RegExp(preferredName, 'i').test(loc.name)`, add `+500` to score.

In `woodcutting.ts` before picking:

```ts
const best = bestResourceForLevel('woodcutting', ctx.levels.Woodcutting ?? 1, /trees/i);
const pick = pickBestTree(ctx.sdk, ctx.levels.Woodcutting ?? 1, best?.name ?? null);
```

If `noChopTarget` / no pick: walk to `TRAINING_AREAS` fallback mapped by preferred name (`willow` → `draynorWillows`, else `lumbridgeTrees`). Skip targets whose `avoidKey('loc', name, x, z)` is avoided.

Same pattern for mining with `/ores?/i` and `seVarrockMine`.

- [ ] **Step 3: Run tests**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/skills/smart-select.test.ts bots/_shared/trainer/planner.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add bots/_shared/trainer/skills/smart-select.ts bots/_shared/trainer/skills/smart-select.test.ts bots/_shared/trainer/skills/woodcutting.ts bots/_shared/trainer/skills/mining.ts
git commit -m "$(cat <<'EOF'
feat(trainer): prefer wiki best resource when selecting trees/rocks

EOF
)"
```

---

### Task 6: Confirm loops + avoids in thieving/combat/WC

**Files:**
- Modify: `bots/_shared/trainer/skills/thieving.ts`
- Modify: `bots/_shared/trainer/skills/combat.ts`
- Modify: `bots/_shared/trainer/skills/woodcutting.ts`
- Create: `bots/_shared/trainer/observe/skill-confirm.test.ts` (pure helpers only if skill files are hard to unit test)

**Pattern for each skill action:**

```ts
const beforeXp = ctx.sdk.getSkillXp?.('Woodcutting') ?? 0;
const beforeInv = (ctx.sdk.getInventory() ?? []).map((i) => i.name);
// ... perform interact ...
await waitUntilIdle(ctx.sdk); // existing helper where available
const afterXp = ctx.sdk.getSkillXp?.('Woodcutting') ?? 0;
const afterInv = (ctx.sdk.getInventory() ?? []).map((i) => i.name);
const ok =
    confirmByXpDelta(beforeXp, afterXp) ||
    confirmByItemGain(beforeInv, afterInv, /logs?/i);
if (!ok) {
    const t = /* target */;
    noteAvoid(ctx.memory, avoidKey('loc', t.name, t.x, t.z), 45_000);
    noteConfirm(ctx.memory, 'woodcutting', false, ctx.observation?.errors[0] ?? 'no_progress');
    return false;
}
noteConfirm(ctx.memory, 'woodcutting', true, 'xp_or_item');
return true;
```

Thieving: prefer nearby Man/Woman not avoided; on `cant_reach`/`stun` in `observation.errors` or chat, avoid that NPC 30s and return false.

Combat: if `observation.lowHp` and food in invent, eat first; if still low and no food, return false so planner banks.

- [ ] **Step 1: Implement WC confirm first + quick manual reasoning via unit helpers already tested**
- [ ] **Step 2: Thieving + combat**
- [ ] **Step 3: Run full trainer unit tests**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/
```

- [ ] **Step 4: Commit**

```bash
git add bots/_shared/trainer/skills/thieving.ts bots/_shared/trainer/skills/combat.ts bots/_shared/trainer/skills/woodcutting.ts
git commit -m "$(cat <<'EOF'
feat(trainer): confirm actions and avoid failed targets

EOF
)"
```

---

### Task 7: Cook’s Assistant quest from wiki facts

**Files:**
- Modify: `bots/_shared/trainer/quests/cooks-assistant.ts`
- Modify: `bots/_shared/trainer/quests/registry.ts`
- Create: `bots/_shared/trainer/quests/cooks-assistant.test.ts`
- Modify: `bots/_shared/trainer/knowledge/wiki.ts` — add `getQuestFact(id)` if missing (`getSkillFact` works for any id; alias `getQuestFact = getSkillFact`)

**Quest step machine** (store `memory.quests['cooks-assistant'].step`):

| Step id | Precondition (observe invent/nearby) | Action |
|---------|--------------------------------------|--------|
| `start` | none | Walk to Cook (world `nearestNpc(/cook/i)` or TRAINING fallback Lumbridge kitchen ~3208,3215); talk; set step `need_items` |
| `need_items` | missing egg/flour/milk | Branch to gather substeps |
| `get_pot_bucket` | no pot/bucket | Buy/pickup from general store / ground (use supply or nearby) |
| `flour` | no pot of flour | Grain → mill hopper → controls → pot on bin (use wiki walkthrough order) |
| `egg` | no egg | Walk chicken farm; pickup egg |
| `milk` | no bucket of milk | Use bucket on dairy cow |
| `turn_in` | has egg + pot of flour + bucket of milk | Talk to Cook; on success set `complete: true` |

Hard-code Lumbridge-ish anchors if world-index lacks Cook coords (acceptable fallback):

```ts
const COOK = { x: 3208, z: 3215, label: 'Cook' };
const WHEAT = { x: 3160, z: 3295 };
const MILL = { x: 3165, z: 3305 };
const CHICKENS = { x: 3230, z: 3298 };
const DAIRY = { x: 3254, z: 3271 };
```

Use `getQuestFact('cooks-assistant')` for `itemsNeeded` logging and to assert pot/bucket in checklist — steps still explicit (wiki walkthrough is not machine-executable JSON).

- [ ] **Step 1: Failing unit test for step selection**

```ts
import { describe, expect, test } from 'bun:test';
import { nextCooksStep } from './cooks-assistant';

test('with no items → get_pot_bucket or flour path', () => {
    expect(nextCooksStep({ items: [], step: 'need_items' })).toMatch(/pot|bucket|flour|egg|milk/);
});

test('with all three → turn_in', () => {
    expect(
        nextCooksStep({
            items: ['Egg', 'Pot of flour', 'Bucket of milk'],
            step: 'need_items',
        }),
    ).toBe('turn_in');
});

test('complete flag stops shouldRun', () => {
    // shouldRun false when memory.quests['cooks-assistant'].complete
});
```

Export pure `nextCooksStep` for testing; `run()` uses it.

- [ ] **Step 2: Implement quest + register**

In `registry.ts` `bootstrapQuestRegistry`:

```ts
import { cooksAssistantQuest } from './cooks-assistant';
// ...
registerQuest(cooksAssistantQuest);
```

- [ ] **Step 3: Run tests**

```sh
cd /Users/klim/RSPS && bun test bots/_shared/trainer/quests/cooks-assistant.test.ts bots/_shared/trainer/
```

- [ ] **Step 4: Optional live smoke** (manual)

```sh
TRAINER_AUTO_QUESTS=1 bun run progressive -- --max-seconds=180
```

Or attach via GUI Progressive button with `TRAINER_AUTO_QUESTS=1` in `bots/<user>/bot.env`.

- [ ] **Step 5: Commit**

```bash
git add bots/_shared/trainer/quests/cooks-assistant.ts bots/_shared/trainer/quests/cooks-assistant.test.ts bots/_shared/trainer/quests/registry.ts bots/_shared/trainer/knowledge/wiki.ts
git commit -m "$(cat <<'EOF'
feat(trainer): implement Cook's Assistant from wiki quest facts

EOF
)"
```

---

### Task 8: Docs + attach env for quests

**Files:**
- Modify: `docs/TRAINER.md`
- Modify: `scripts/attach-progressive.ts` — write `TRAINER_AUTO_QUESTS=1` into generated `bot.env` (or document toggle; prefer env default off, GUI later). For phase 1, add optional `--quests` flag that sets the env when spawning.

- [ ] **Step 1: Update TRAINER.md**

Document:
- Observe layer (snapshot → memory → hints → confirm)
- `TRAINER_AUTO_QUESTS=1` enables Cook’s
- Phase 1 milestone matches design doc
- Link to design spec path

- [ ] **Step 2: Attach script optional flag**

```ts
// if flag('quests') or process.env.TRAINER_AUTO_QUESTS === '1'
// include TRAINER_AUTO_QUESTS=1 in bot.env
```

- [ ] **Step 3: Commit**

```bash
git add docs/TRAINER.md scripts/attach-progressive.ts
git commit -m "$(cat <<'EOF'
docs(trainer): document observe layer and Cook's Assistant flag

EOF
)"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Live observation each tick | 1, 4 |
| Short-term avoid memory | 2, 6 |
| Wiki + observe confirm | 5, 6 |
| Planner hints break sticky | 3, 4 |
| Wiki resources for WC/mining | 5 |
| Cook’s Assistant via wiki | 7 |
| Error handling table | 2, 3, 6, 7 |
| Unit tests listed in spec | 1–3, 5, 7 |
| docs/TRAINER.md | 8 |
| Non-goals respected (no full quest engine / item wiki) | All tasks stay within phase 1 |

No TBD placeholders. Types `Observation` / `PlannerHints` / memory fields are consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-observe-wiki-trainer.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
