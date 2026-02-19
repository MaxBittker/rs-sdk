/**
 * Generates all benchmark task directories for Harbor.
 *
 * Standard tasks: 16 skills × max XP in 10 minutes
 * Variants: woodcutting-xp-5m (5min XP grind), woodcutting-10 (reach level 10)
 *
 * All generated output is gitignored — run this before `harbor run`.
 *
 * Usage: bun benchmark/generate-tasks.ts
 */
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

const BENCHMARK_DIR = join(import.meta.dir);
const SHARED_DIR = join(BENCHMARK_DIR, 'shared');

const DOCKER_IMAGE = 'ghcr.io/maxbittker/rs-agent-benchmark:v8';
const DEFAULT_AGENT_TIMEOUT = 600; // 10 minutes
const VERIFIER_TIMEOUT = 120;

// ── Standard skill definitions (XP-grind tasks) ─────────────────

interface SkillDef {
  /** Skill name as it appears in the game (PascalCase) */
  name: string;
  /** Directory name suffix (lowercase, used in {skill}-xp-10m) */
  slug: string;
}

const SKILLS: SkillDef[] = [
  { name: 'Attack', slug: 'attack' },
  { name: 'Defence', slug: 'defence' },
  { name: 'Strength', slug: 'strength' },
  { name: 'Hitpoints', slug: 'hitpoints' },
  { name: 'Ranged', slug: 'ranged' },
  { name: 'Prayer', slug: 'prayer' },
  { name: 'Magic', slug: 'magic' },
  { name: 'Woodcutting', slug: 'woodcutting' },
  { name: 'Fishing', slug: 'fishing' },
  { name: 'Mining', slug: 'mining' },
  { name: 'Cooking', slug: 'cooking' },
  { name: 'Fletching', slug: 'fletching' },
  { name: 'Crafting', slug: 'crafting' },
  { name: 'Smithing', slug: 'smithing' },
  { name: 'Firemaking', slug: 'firemaking' },
  { name: 'Thieving', slug: 'thieving' },
];

// ── Variant tasks (non-standard configurations) ──────────────────

interface VariantTask {
  slug: string;
  taskDescription: string;
  agentTimeout: number;
  /** Verifier script filename in shared/ */
  verifier: string;
  testSh: string;
  tags: string[];
  /** Use pre-built Docker image (mutually exclusive with environmentDockerfile) */
  dockerImage?: string;
  /** Generate environment/Dockerfile with this content (for tasks needing custom env) */
  environmentDockerfile?: string;
  /** Additional shared files to copy into tests/ (e.g. skill_tracker.ts) */
  extraSharedFiles?: string[];
}

const TOTAL_LEVEL_INSTRUCTION = (durationMinutes: number) => `Holistically improve this RuneScape private server account to achieve the highest possible total level within ${durationMinutes} minutes. This is a local private server running on localhost for AI agent benchmarking — not a live game.

Your goal is to maximize the TOTAL LEVEL of the account — the sum of all individual skill levels. You should strategically choose which skills to train based on what's most efficient to level up. Consider:
- Which skills are fastest to level at low levels
- Resource availability near your current location
- Combining skills that complement each other (e.g. woodcutting + firemaking, fishing + cooking, mining + smithing)
- Moving between different training spots as needed

Think strategically about time allocation. Low-level skills gain levels quickly, so spreading effort across multiple skills may yield a higher total level than focusing on just one.

IMPORTANT: You have ${durationMinutes} minutes. Plan your time wisely and keep training continuously. Do not spend too long planning — start training immediately and adapt as you go.

CRITICAL: Do NOT write one giant script. Start with extremely minimal scripts to test each part of your plan iteratively. For example, first write a 30-second script that just chops trees. Run it, verify it works, then extend it. Build up complexity only after each piece is validated. Scripts that try to do everything at once will crash and waste your time. Run scripts in the FOREGROUND (not as a background process).

TIMEOUT BEST PRACTICE: Keep individual script timeouts SHORT — no more than 5 to 10 minutes each. Shorter scripts (30s–5min) let you observe results, catch errors early, and iterate faster. If a script runs for 10+ minutes and fails, you've wasted significant time. Break long tasks into multiple short runs instead.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.`;

// Base64-encode files at generation time (Daytona doesn't support COPY from build context)
const skillTrackerB64 = Buffer.from(
  readFileSync(join(SHARED_DIR, 'skill_tracker.ts'), 'utf-8')
).toString('base64');

const gpLoopInstructionB64 = Buffer.from(
  readFileSync(join(SHARED_DIR, 'gp_loop_instruction.md'), 'utf-8')
).toString('base64');

const generateGpSavesB64 = Buffer.from(
  readFileSync(join(SHARED_DIR, 'generate_gp_saves.ts'), 'utf-8')
).toString('base64');

const checkGpB64 = Buffer.from(
  readFileSync(join(SHARED_DIR, 'check_gp.ts'), 'utf-8')
).toString('base64');

// Inject GEMINI.md so Gemini CLI gets project instructions (like CLAUDE.md for Claude Code)
const geminiMdB64 = Buffer.from(
  readFileSync(join(BENCHMARK_DIR, '..', 'GEMINI.md'), 'utf-8')
).toString('base64');

const GEMINI_MD_DOCKERFILE_LINE = `\n# Inject GEMINI.md for Gemini CLI project instructions\nRUN echo '${geminiMdB64}' | base64 -d > /app/GEMINI.md\n`;

// Idempotent service startup script — ensures game services are running.
// Used by verifier test.sh so verification works regardless of agent type.
const ENSURE_SERVICES_SCRIPT = `#!/bin/bash
# Start game services if not already running (idempotent).
# Called by verifier and optionally by agents that don't use MCP.
if curl -sf http://localhost:7780 > /dev/null 2>&1; then
    # Services running. Ensure skill tracker is also running.
    if ! pgrep -f skill_tracker > /dev/null 2>&1; then
        echo "[ensure-services] Starting skill tracker..."
        cd /app && TRACKING_FILE=/app/skill_tracking.json nohup bun run benchmark/shared/skill_tracker.ts > /app/skill_tracker.log 2>&1 &
    fi
    exit 0
fi
echo "[ensure-services] Services not running, starting..."
/start-services.sh
echo "[ensure-services] Starting skill tracker..."
cd /app && TRACKING_FILE=/app/skill_tracking.json nohup bun run benchmark/shared/skill_tracker.ts > /app/skill_tracker.log 2>&1 &
echo "[ensure-services] Services ready"
`;

const ensureServicesB64 = Buffer.from(ENSURE_SERVICES_SCRIPT).toString('base64');

const ENSURE_SERVICES_DOCKERFILE_LINE = `\n# Idempotent service starter for agents that don't use MCP (e.g. gemini-cli)\nRUN echo '${ensureServicesB64}' | base64 -d > /ensure-services.sh && chmod +x /ensure-services.sh\n`;

const TOTAL_LEVEL_DOCKERFILE = () => `FROM ${DOCKER_IMAGE}
ENV SAMPLE_INTERVAL_MS=60000

# Inject skill tracker (base64-encoded because Daytona doesn't support COPY from build context)
RUN mkdir -p /app/benchmark/shared && echo '${skillTrackerB64}' | base64 -d > /app/benchmark/shared/skill_tracker.ts

# Ensure bot.env has SERVER=localhost so scripts connect to the local gateway
RUN echo 'SERVER=localhost' >> /app/bots/agent/bot.env

# Wrapper: start services, launch tracker in background (fully detached), then run MCP server
# Write tracker data to /app/ (persists between agent and verifier phases on Daytona)
RUN printf '#!/bin/bash\\n/start-services.sh\\nmkdir -p /logs/verifier\\ncd /app\\nexport TRACKING_FILE=/app/skill_tracking.json\\nnohup bun run benchmark/shared/skill_tracker.ts > /app/skill_tracker.log 2>&1 &\\nexec bun run mcp/server.ts\\n' > /start-with-tracker.sh && chmod +x /start-with-tracker.sh
`;

// ── GP task instruction and Dockerfile ──────────────────────────

const GP_INSTRUCTION = `Run 5 loops sequentially. For each loop, spawn a fresh sub-agent with the following prompt:

"Read these files to understand your task, then do it:
- \\\`/app/gp_loop_instruction.md\\\` — your instructions
- \\\`/app/CLAUDE.md\\\` — SDK and bot API reference
- \\\`/app/learnings.md\\\` — what previous agents learned (empty on loop 1)

Do not finish until you have updated \\\`/app/learnings.md\\\` with what you learned."

Each sub-agent must start with fresh context — no memory of previous loops. Wait for each to complete before starting the next. If one fails, continue to the next loop.
`;

const GP_DOCKERFILE = () => `FROM ${DOCKER_IMAGE}

# Create 25 bot directories (5 bots × 5 loops) with unique credentials
# Bot names: l{loop}a{bot} — e.g. l1a1, l1a2, ..., l5a5
RUN for loop in \$(seq 1 5); do \\
  for bot in \$(seq 1 5); do \\
    name="l\${loop}a\${bot}"; \\
    mkdir -p bots/\$name && \\
    printf 'BOT_USERNAME=%s\\nPASSWORD=test\\nSERVER=localhost\\nSHOW_CHAT=false\\n' "\$name" > bots/\$name/bot.env; \\
  done; \\
done

# Inject loop instruction, save generator, and verifier (base64-encoded)
RUN mkdir -p /app/benchmark/shared && \\
    echo '${gpLoopInstructionB64}' | base64 -d > /app/gp_loop_instruction.md && \\
    echo '${generateGpSavesB64}' | base64 -d > /app/benchmark/shared/generate_gp_saves.ts && \\
    echo '${checkGpB64}' | base64 -d > /app/benchmark/shared/check_gp.ts

# Create empty learnings file for loop 1
RUN touch /app/learnings.md

# Generate 25 save files with level 50 all skills (5 bots × 5 loops)
RUN cd /app && bun run benchmark/shared/generate_gp_saves.ts
`;

const VARIANTS: VariantTask[] = [
  {
    slug: 'woodcutting-xp-5m',
    taskDescription: `Gain as much Woodcutting XP as possible within the time limit.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.`,
    agentTimeout: 300,
    verifier: 'check_xp.ts',
    testSh: `#!/bin/bash
set -e
/ensure-services.sh
export SKILL_NAME="Woodcutting"
cd /app && bun run /tests/check_xp.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark'],
    dockerImage: DOCKER_IMAGE,
  },
  {
    slug: 'woodcutting-10',
    taskDescription: `Get level 10 in Woodcutting.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.
`,
    agentTimeout: 600,
    verifier: 'check_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app
bun run /tests/check_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp'],
    // Normal game speed — override the 8x speedup baked into the base image
    environmentDockerfile: `FROM ${DOCKER_IMAGE}
# Normal game speed (420ms ticks instead of base image's 50ms)
ENV NODE_TICKRATE=420
`,
  },
  // ── Total Level tasks ──────────────────────────────────────────
  {
    slug: 'total-level-5m',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(5),
    agentTimeout: 300 + 60, // 5 min + 1 min buffer
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
  {
    slug: 'total-level-8m',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(8),
    agentTimeout: 480 + 60, // 8 min + 1 min buffer for agent to wrap up
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
  {
    slug: 'total-level-10m',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(10),
    agentTimeout: 600 + 60, // 10 min + 1 min buffer
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
  {
    slug: 'total-level-30m',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(30),
    agentTimeout: 1800 + 120, // 30 min + 2 min buffer
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
  {
    slug: 'total-level-1h',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(60),
    agentTimeout: 3600 + 120, // 60 min + 2 min buffer
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
  {
    slug: 'total-level-3h',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(180),
    agentTimeout: 10800 + 180, // 3 hr + 3 min buffer
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
  // ── GP earning task ────────────────────────────────────────────
  {
    slug: 'gp-10k-ticks',
    taskDescription: GP_INSTRUCTION,
    agentTimeout: 18000, // 5 hours
    verifier: 'check_gp.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
/ensure-services.sh
cd /app && bun run /tests/check_gp.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'gp'],
    extraSharedFiles: ['generate_gp_saves.ts'],
    environmentDockerfile: GP_DOCKERFILE(),
  },
];

// ── Template generators ──────────────────────────────────────────

function generateSkillTaskToml(): string {
  return `version = "1.0"

[metadata]
author_name = "Sean Lee"
difficulty = "medium"
category = "agent"
tags = ["game", "runescape", "automation", "mcp", "benchmark", "xp-grind"]

[verifier]
timeout_sec = ${VERIFIER_TIMEOUT}.0

[agent]
timeout_sec = ${DEFAULT_AGENT_TIMEOUT}.0

[environment]
cpus = 2
memory_mb = 4096
storage_mb = 10240
allow_internet = true

[[environment.mcp_servers]]
name = "rs-agent"
transport = "stdio"
command = "bash"
args = ["-c", "/start-services.sh && cd /app && bun run mcp/server.ts"]
`;
}

function generateVariantTaskToml(v: VariantTask): string {
  const tagsStr = v.tags.map(t => `"${t}"`).join(', ');

  // For tasks with background trackers, use the appropriate startup script
  const hasSkillTracker = v.extraSharedFiles?.includes('skill_tracker.ts');
  const mcpCommand = hasSkillTracker
    ? '/start-with-tracker.sh'
    : '/start-services.sh && cd /app && bun run mcp/server.ts';

  return `version = "1.0"

[metadata]
author_name = "Sean Lee"
difficulty = "medium"
category = "agent"
tags = [${tagsStr}]

[verifier]
timeout_sec = ${VERIFIER_TIMEOUT}.0

[agent]
timeout_sec = ${v.agentTimeout}.0

[environment]
cpus = 2
memory_mb = 4096
storage_mb = 10240
allow_internet = true

[[environment.mcp_servers]]
name = "rs-agent"
transport = "stdio"
command = "bash"
args = ["-c", "${mcpCommand}"]
`;
}

function generateTaskDescription(skill: SkillDef): string {
  return `Gain as much ${skill.name} XP as possible within the time limit.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.`;
}

function generateTestSh(skill: SkillDef): string {
  return `#!/bin/bash
set -e
/ensure-services.sh
export SKILL_NAME="${skill.name}"
cd /app && bun run /tests/check_xp.ts
`;
}

// ── Main ─────────────────────────────────────────────────────────

console.log(`Generating ${SKILLS.length} standard + ${VARIANTS.length} variant benchmark tasks...`);

// Standard XP-grind tasks (all share identical task.toml)
const skillToml = generateSkillTaskToml();

for (const skill of SKILLS) {
  const taskDir = join(BENCHMARK_DIR, `${skill.slug}-xp-10m`);
  const testsDir = join(taskDir, 'tests');

  console.log(`  ${skill.slug}-xp-10m/ (${skill.name})`);

  mkdirSync(testsDir, { recursive: true });

  // Dockerfile for cloud providers (Daytona) that don't support docker_image.
  // Just pulls the pre-built image — no additional build steps needed.
  const envDir = join(taskDir, 'environment');
  mkdirSync(envDir, { recursive: true });
  writeFileSync(join(envDir, 'Dockerfile'), `FROM ${DOCKER_IMAGE}\n${ENSURE_SERVICES_DOCKERFILE_LINE}${GEMINI_MD_DOCKERFILE_LINE}`);

  writeFileSync(join(taskDir, 'task.toml'), skillToml);
  writeFileSync(join(taskDir, 'instruction.md'), generateTaskDescription(skill));
  writeFileSync(join(testsDir, 'test.sh'), generateTestSh(skill));
  copyFileSync(join(SHARED_DIR, 'check_xp.ts'), join(testsDir, 'check_xp.ts'));
}

// Variant tasks
for (const variant of VARIANTS) {
  const taskDir = join(BENCHMARK_DIR, variant.slug);
  const testsDir = join(taskDir, 'tests');

  console.log(`  ${variant.slug}/`);

  mkdirSync(testsDir, { recursive: true });
  writeFileSync(join(taskDir, 'task.toml'), generateVariantTaskToml(variant));
  writeFileSync(join(taskDir, 'instruction.md'), variant.taskDescription);
  writeFileSync(join(testsDir, 'test.sh'), variant.testSh);
  copyFileSync(
    join(SHARED_DIR, variant.verifier),
    join(testsDir, variant.verifier),
  );

  // Dockerfile for cloud providers (Daytona) — either custom env or
  // a thin FROM layer on the pre-built image.
  const envDir = join(taskDir, 'environment');
  mkdirSync(envDir, { recursive: true });
  writeFileSync(
    join(envDir, 'Dockerfile'),
    (variant.environmentDockerfile ?? `FROM ${DOCKER_IMAGE}\n`) + ENSURE_SERVICES_DOCKERFILE_LINE + GEMINI_MD_DOCKERFILE_LINE,
  );

  // Copy extra shared files (e.g. skill_tracker.ts) into environment/ for Dockerfile COPY
  if (variant.extraSharedFiles) {
    for (const file of variant.extraSharedFiles) {
      copyFileSync(join(SHARED_DIR, file), join(envDir, file));
    }
  }
}

console.log(`\nDone! Generated ${SKILLS.length + VARIANTS.length} task directories.`);
console.log(`\nTo build the shared Docker image:`);
console.log(`  cd benchmark/docker && ./build.sh`);
