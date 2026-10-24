import { resolve } from 'path';
import type { BotConnection } from './api/index';
import { ConsoleCapture, formatLogArgument, installExecutionConsoleCapture } from './console-capture';
import { executionContext, abortable, throwIfExecutionAborted } from '../sdk/execution-context';
import { formatWorldState, summarizeWorldState, type WorldDetail, type WorldSummary } from '../sdk/formatter';
import { Spells } from '../sdk/spells';
import { redactCredentials } from '../sdk/redact';
import { tracked } from '../sdk/tracked';

export type ExecutionErrorKind = 'exception' | 'timeout' | 'superseded' | 'cancelled' | 'not_connected' | 'invalid_input' | 'unserializable_result';
export const EXECUTION_ERROR_KINDS: ExecutionErrorKind[] = ['exception', 'timeout', 'superseded', 'cancelled', 'not_connected', 'invalid_input', 'unserializable_result'];

/** Why an execution stopped early; carried as the abort reason so the result can say so. */
export class ExecutionStopped extends Error {
  constructor(readonly kind: ExecutionErrorKind, message: string) { super(message); }
}

/** execute_code's structuredContent. Every key is always present so code can branch on it without probing. */
export interface ExecuteCodeResult {
  ok: boolean;
  /** The code's return value as JSON (credentials redacted), or null. */
  result: unknown;
  logs: string[];
  error: { kind: ExecutionErrorKind; message: string; activeActions: string[] } | null;
  elapsedMs: number;
  world: WorldSummary | null;
}

export type WorldOption = 'none' | WorldDetail;
export interface ExecuteOptions {
  /** JSON exposed to the code as `args` (or ctx.args for a script). */
  args?: unknown;
  world?: WorldOption;
}

const REPO_ROOT = resolve(import.meta.dir, '..');

/** One execution per character: a new call cancels the running one and starts once it has unwound. */
export class BotExecutions {
  private current = new Map<string, { controller: AbortController; done: Promise<unknown> }>();

  async run<T>(name: string, signal: AbortSignal | undefined, task: (controller: AbortController) => Promise<T>): Promise<T> {
    const key = name.toLowerCase();
    const previous = this.current.get(key);
    previous?.controller.abort(new ExecutionStopped('superseded', 'Superseded by a newer call for this bot'));
    const controller = new AbortController();
    const onClientAbort = () => controller.abort(new ExecutionStopped('cancelled', signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason ?? 'Cancelled by client')));
    signal?.addEventListener('abort', onClientAbort, { once: true });
    if (signal?.aborted) onClientAbort();
    const done = (async () => {
      await previous?.done; // the old run releases the bot before the new one touches it
      controller.signal.throwIfAborted();
      return task(controller);
    })();
    const entry = { controller, done: done.catch(() => {}) };
    this.current.set(key, entry);
    try {
      return await done;
    } finally {
      signal?.removeEventListener('abort', onClientAbort);
      if (this.current.get(key) === entry) this.current.delete(key);
    }
  }
}

export const botExecutions = new BotExecutions();
type Manager = { get(name: string): BotConnection | undefined; connect(name: string): Promise<BotConnection> };

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactCredentials(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, /^(password|token|secret|api[_-]?key)$/i.test(key) ? '[REDACTED]' : redactValue(item)]));
  }
  return value;
}

/** Load a script module: `export default async ({ bot, sdk, args }) => ...`. Reloaded when the file changes. */
async function loadScript(path: string): Promise<(ctx: { bot: unknown; sdk: unknown; args: unknown }) => unknown> {
  const absolute = resolve(REPO_ROOT, path);
  const file = Bun.file(absolute);
  if (!(await file.exists())) throw new ExecutionStopped('invalid_input', `Script not found: ${absolute}`);
  const source = await file.text();
  // Importing a plain runScript() file would open a second controller connection for the bot.
  if (/\brunScript\s*\(/.test(source) && !/import\.meta\.main/.test(source)) {
    throw new ExecutionStopped('invalid_input', `${path} calls runScript() on import. Export the function instead: \`export default main; if (import.meta.main) runScript(main);\``);
  }
  const module = await import(`${absolute}?v=${file.lastModified}-${file.size}`);
  if (typeof module.default !== 'function') {
    throw new ExecutionStopped('invalid_input', `${path} has no default-exported function. Use \`export default async ({ bot, sdk, args }) => { ... }\`.`);
  }
  return module.default;
}

export async function executeCode(
  manager: Manager,
  botName: string,
  source: string | { script: string },
  timeoutMs: number,
  clientSignal?: AbortSignal,
  executions = botExecutions,
  options: ExecuteOptions = {},
) {
  installExecutionConsoleCapture();
  const started = Date.now();
  const world = options.world ?? 'brief';
  try {
    return await executions.run(botName, clientSignal, async controller => {
      const logs = new ConsoleCapture();
      const active = new Map<symbol, string>();
      const record = (level: 'log' | 'warn' | 'error', args: unknown[]) => {
        logs.push((level === 'log' ? '' : `[${level}] `) + args.map(formatLogArgument).join(' '));
      };
      let connection: BotConnection | undefined;
      let connected = false;
      let result: unknown;
      let failure: unknown;
      let failed = false;
      let interruptedActions: string[] = [];
      const rememberActions = () => { interruptedActions = [...active.values()]; };
      controller.signal.addEventListener('abort', rememberActions, { once: true });
      const timer = setTimeout(() => controller.abort(new ExecutionStopped('timeout', `Code execution timed out after ${timeoutMs / 60_000} minute(s)`)), timeoutMs);

      const work = async () => {
        const connecting = Symbol();
        active.set(connecting, 'Connecting / waiting for fresh state');
        try {
          connection = manager.get(botName);
          if (!connection?.connected) connection = await manager.connect(botName);
          connected = true;
          const sdk = connection.sdk;
          try {
            if (sdk.getStateAge() > 10_000) await sdk.waitForStateChange(15_000);
            if (!sdk.getState()?.inGame) await sdk.waitForReady(15_000);
          } catch (error) {
            throwIfExecutionAborted();
            // Still run: diagnosing a stale client is exactly when you need execute_code.
            record('warn', [`No fresh in-game state (${error instanceof Error ? error.message : error}); running anyway, actions may not take effect.`]);
          }
        } finally { active.delete(connecting); }
        throwIfExecutionAborted();

        const context = { botName, source: 'execute_code' };
        const bot = tracked(connection.bot, 'bot', active, controller.signal, context);
        const sdk = tracked(connection.sdk, 'sdk', active, controller.signal, context);
        if (typeof source !== 'string') return (await loadScript(source.script))({ bot, sdk, args: options.args });
        // The inner block lets code redeclare `args` (or bot/sdk) without a parameter clash.
        const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(
          `const __rsExec = async (bot, sdk, Spells, args) => {{\n${source}\n}};`,
        );
        const fn = new Function(`${compiled}\nreturn __rsExec;`)();
        return fn(bot, sdk, Spells, options.args);
      };

      try {
        result = await executionContext.run({ signal: controller.signal, log: record }, () => abortable(work()));
      } catch (error) {
        failure = error;
        failed = true;
        if (interruptedActions.length === 0) interruptedActions = [...active.values()];
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', rememberActions);
      }
      const reason = controller.signal.aborted ? controller.signal.reason : undefined;
      // Detached continuations inherit this scope and must not dispatch after it ends.
      if (!controller.signal.aborted) controller.abort(new Error('Execution finished'));

      let error: ExecuteCodeResult['error'] = null;
      if (failed) {
        const kind = reason instanceof ExecutionStopped ? reason.kind
          : failure instanceof ExecutionStopped ? failure.kind
          : connected ? 'exception' : 'not_connected';
        error = { kind, message: redactCredentials(failure instanceof Error ? failure.message : formatLogArgument(failure)), activeActions: interruptedActions };
      }

      let value: unknown = null;
      if (!failed && result !== undefined) {
        try { value = redactValue(JSON.parse(JSON.stringify(result) ?? 'null')); }
        catch (serializeError) {
          failed = true;
          failure = serializeError;
          error = { kind: 'unserializable_result', message: formatLogArgument(serializeError), activeActions: [] };
        }
      }

      const parts: string[] = [];
      if (logs.length) parts.push('── Console ──', ...logs.lines());
      if (failed && error?.kind === 'unserializable_result') {
        parts.push('', '── Error ──', error.message);
      } else if (failed) {
        const errorText = failure instanceof Error
          ? formatLogArgument(failure).split('\n').slice(0, 7).join('\n')
          : formatLogArgument(failure);
        parts.push('', '── Error ──', errorText,
          `Elapsed: ${Date.now() - started}ms`,
          `Active action: ${interruptedActions.join(', ') || 'User code'}`);
      } else if (result !== undefined) {
        parts.push('', '── Result ──', JSON.stringify(value, null, 2));
      }

      let worldSummary: WorldSummary | null = null;
      const state = connection?.sdk.getState();
      if (state && world !== 'none') {
        const ticks = state.gameMessages?.map(message => message.tick) ?? [];
        if (ticks.length && ticks.every(tick => tick < connection!.lastShownMessageTick)) connection!.lastShownMessageTick = -1;
        const sinceTick = connection!.lastShownMessageTick;
        const stateAge = connection!.sdk.getStateAge();
        worldSummary = redactValue(summarizeWorldState(state, stateAge, { sinceTick, detail: world })) as WorldSummary;
        parts.push('', '── World State ──', redactCredentials(formatWorldState(state, stateAge, { sinceTick, brief: world === 'brief' })));
        // Advance only from messages present in this snapshot; tolerate client cycle resets.
        if (ticks.length) connection!.lastShownMessageTick = Math.max(connection!.lastShownMessageTick, ...ticks);
      }
      if (typeof source === 'string' && source.length > 2000) parts.push('', '── Tip ──', `For long or reused code, save it as a module under bots/${botName}/ (\`export default async ({ bot, sdk, args }) => ...\`) and pass it as \`script\`.`);

      const structured: ExecuteCodeResult = { ok: !failed, result: value, logs: logs.lines(), error, elapsedMs: Date.now() - started, world: worldSummary };
      return response(parts.join('\n').trim() || '(no output)', structured);
    });
  } catch (error) {
    // Superseded or cancelled before it started.
    if (error instanceof ExecutionStopped) return executionError(error.kind, error.message, started);
    return executionError('exception', formatLogArgument(error), started);
  }
}

/** A failed execute_code result that never ran any code. */
export function executionError(kind: ExecutionErrorKind, message: string, started = Date.now()) {
  return response(`Error: ${message}`, { ok: false, result: null, logs: [], error: { kind, message, activeActions: [] }, elapsedMs: Date.now() - started, world: null });
}

function response(text: string, structured: ExecuteCodeResult) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: structured as unknown as Record<string, unknown>,
    ...(structured.ok ? {} : { isError: true }),
  };
}

const num = { type: 'number' } as const;
const str = { type: 'string' } as const;
const bool = { type: 'boolean' } as const;
const arr = (items: object) => ({ type: 'array', items });
const obj = (properties: Record<string, object>, description?: string) =>
  ({ type: 'object', properties, required: Object.keys(properties), ...(description ? { description } : {}) });
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const capped = (item: object) => obj({ total: num, items: arr(item) }, '`total` counts everything nearby; `items` is capped by the world option, never by crowding.');
const option = obj({ index: num, text: str });

/** JSON Schema for ExecuteCodeResult; keep in step with it and with summarizeWorldState (tested). */
export const EXECUTE_CODE_OUTPUT_SCHEMA = obj({
  ok: bool,
  result: { description: 'The JSON value the code returned, or null.' },
  logs: arr(str),
  error: nullable(obj({ kind: { type: 'string', enum: EXECUTION_ERROR_KINDS }, message: str, activeActions: arr(str) })),
  elapsedMs: num,
  world: nullable(obj({
    tick: num,
    inGame: bool,
    stateAgeMs: nullable(num),
    player: nullable(obj({
      name: str, combatLevel: num, x: num, z: num, level: num, hp: num, maxHp: num, runEnergy: num,
      isDead: bool, inCombat: bool, combatTargetIndex: nullable(num),
    })),
    skills: arr(obj({ name: str, level: num, baseLevel: num, xp: num })),
    inventory: obj({ freeSlots: num, items: arr(obj({ slot: num, id: num, name: str, count: num })) }),
    equipment: arr(obj({ slot: num, id: num, name: str })),
    dialog: nullable(obj({ text: nullable(str), isWaiting: bool, options: arr(option) }, 'Click options by `index` with sdk.sendClickDialog, or by text with sdk.clickDialogByText.')),
    modal: nullable(obj({
      kind: { type: 'string', enum: ['shop', 'bank', 'trade', 'ge', 'interface'] },
      interfaceId: num,
      options: arr(obj({ componentId: num, text: str })),
    }, 'An open modal blocks inventory actions; close it with bot.closeInterface().')),
    nearby: obj({
      npcs: capped(obj({
        index: num, id: num, name: str, combatLevel: num, x: num, z: num, distance: num,
        hp: nullable(num), maxHp: nullable(num), inCombat: bool, reachable: nullable(bool), options: arr(str),
      })),
      players: capped(obj({ index: num, name: str, combatLevel: num, x: num, z: num, distance: num })),
      locs: capped(obj({ id: num, name: str, x: num, z: num, distance: num, reachable: nullable(bool), options: arr(str) })),
      groundItems: capped(obj({ id: num, name: str, count: num, x: num, z: num, distance: num, reachable: nullable(bool) })),
    }),
    messages: obj({ chat: arr(obj({ from: str, text: str, private: bool })), system: arr(str) }, 'Messages not shown by a previous call.'),
  })),
});
