import type { BotActions } from '../sdk/actions';
import type { BotSDK } from '../sdk/index';
import { inspect } from 'node:util';

const DEFAULT_LOG_LIMIT = 64 * 1024;
const DEFAULT_LOG_ENTRIES = 500;

export type ExecutionStatus = 'success' | 'error' | 'timeout' | 'cancelled';

export interface ExecutionOutcome {
  status: ExecutionStatus;
  result?: unknown;
  error?: string;
  logs: string[];
  logsTruncated: boolean;
  elapsedMs: number;
  /**
   * True when cancellation happened while an SDK/BotActions promise was
   * already running. The public SDK does not currently accept AbortSignal, so
   * that call may still finish. The proxy refuses new user calls and the queue
   * remains locked while an already-started BotActions method finishes any
   * internal SDK work.
   */
  mayHaveInFlightCall: boolean;
  /**
   * Resolves after calls that were already in progress have settled. The MCP
   * queue uses this to keep the bot locked after returning a timeout response.
   */
  quiescence?: Promise<void>;
}

export class BoundedLogBuffer {
  private readonly entries: string[] = [];
  private size = 0;
  private omitted = 0;

  constructor(
    private readonly maxChars = DEFAULT_LOG_LIMIT,
    private readonly maxEntries = DEFAULT_LOG_ENTRIES,
  ) {}

  append(level: string, args: unknown[]): void {
    const prefix = level === 'log' ? '' : `[${level}] `;
    const rendered = prefix + args.map(formatLogArgument).join(' ');
    const remaining = this.maxChars - this.size;

    if (this.entries.length >= this.maxEntries || remaining <= 0) {
      this.omitted++;
      return;
    }

    const entry = rendered.length <= remaining
      ? rendered
      : rendered.slice(0, Math.max(0, remaining - 1)) + '…';
    this.entries.push(entry);
    this.size += entry.length;
    if (entry.length < rendered.length) this.omitted++;
  }

  toArray(): string[] {
    if (this.omitted === 0) return [...this.entries];
    return [...this.entries, `[logs truncated: ${this.omitted} entr${this.omitted === 1 ? 'y' : 'ies'} omitted]`];
  }

  get truncated(): boolean {
    return this.omitted > 0;
  }
}

export function createScopedConsole(buffer: BoundedLogBuffer): Console {
  const capture = (level: string) => (...args: unknown[]) => buffer.append(level, args);
  return {
    log: capture('log'),
    info: capture('info'),
    debug: capture('debug'),
    warn: capture('warn'),
    error: capture('error'),
    trace: capture('trace'),
    dir: capture('dir'),
    dirxml: capture('dirxml'),
    table: capture('table'),
    group: capture('group'),
    groupCollapsed: capture('groupCollapsed'),
    groupEnd: () => {},
    clear: () => {},
    count: capture('count'),
    countReset: capture('countReset'),
    assert: (condition?: boolean, ...data: unknown[]) => {
      if (!condition) buffer.append('assert', data);
    },
    profile: () => {},
    profileEnd: () => {},
    time: () => {},
    timeEnd: capture('timeEnd'),
    timeLog: capture('timeLog'),
    timeStamp: () => {},
    Console: console.Console,
  } as Console;
}

/**
 * Compile a TypeScript function body to JavaScript while preserving top-level
 * await/return semantics by compiling it inside an async function.
 */
export function transpileTypeScriptBody(code: string): string {
  const wrapperName = '__rsAgentExecute';
  const wrapped = `
async function ${wrapperName}(
  bot: import("../sdk/actions").BotActions,
  sdk: import("../sdk/index").BotSDK,
  console: Console,
  signal: AbortSignal
) {
${code}
}
`;

  try {
    const transpiler = new Bun.Transpiler({
      loader: 'ts',
      target: 'bun',
      trimUnusedImports: true,
    });
    return `${transpiler.transformSync(wrapped)}\nreturn await ${wrapperName}(bot, sdk, console, signal);`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TypeScript compilation failed: ${message}`);
  }
}

export interface ExecuteUserCodeOptions {
  bot: BotActions;
  sdk: BotSDK;
  code: string;
  timeoutMs: number;
  externalSignal?: AbortSignal;
  logLimitChars?: number;
  logLimitEntries?: number;
}

export interface CancellableOperationOutcome<T> {
  status: 'success' | 'cancelled' | 'error';
  value?: T;
  error?: string;
  quiescence?: Promise<void>;
}

/**
 * Race one structured operation against MCP cancellation. The public SDK
 * cannot interrupt a BotActions promise after it starts, so cancellation
 * returns promptly while exposing quiescence for the per-bot lock.
 */
export async function runCancellableOperation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<CancellableOperationOutcome<T>> {
  if (signal?.aborted) {
    return {
      status: 'cancelled',
      error: typeof signal.reason === 'string' ? signal.reason : 'Operation cancelled',
    };
  }

  const running = Promise.resolve().then(operation);
  running.catch(() => {});
  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    if (!signal) return;
    onAbort = () => reject(new OperationCancelledError(
      typeof signal.reason === 'string' ? signal.reason : 'Operation cancelled',
    ));
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return { status: 'success', value: await Promise.race([running, cancellation]) };
  } catch (error) {
    if (error instanceof OperationCancelledError) {
      return {
        status: 'cancelled',
        error: error.message,
        quiescence: running.then(() => {}, () => {}),
      };
    }
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export async function executeUserCode(options: ExecuteUserCodeOptions): Promise<ExecutionOutcome> {
  const startedAt = Date.now();
  const logs = new BoundedLogBuffer(options.logLimitChars, options.logLimitEntries);
  const scopedConsole = createScopedConsole(logs);
  const controller = new AbortController();
  const signal = controller.signal;
  const inFlight = new Set<Promise<unknown>>();
  let acceptingCalls = true;

  const stop = (reason: unknown) => {
    acceptingCalls = false;
    if (!signal.aborted) controller.abort(reason);
  };

  const externalAbort = () => stop(options.externalSignal?.reason ?? 'Cancelled by MCP client');
  if (options.externalSignal?.aborted) externalAbort();
  else options.externalSignal?.addEventListener('abort', externalAbort, { once: true });

  const cancellable = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof value !== 'function') return value;

        return (...args: unknown[]) => {
          if (!acceptingCalls || signal.aborted) {
            throw new Error(`Execution cancelled; refusing ${String(prop)}()`);
          }

          const result = Reflect.apply(value, obj, args);
          if (!isPromiseLike(result)) return result;

          const tracked = Promise.resolve(result);
          inFlight.add(tracked);
          tracked.finally(() => inFlight.delete(tracked)).catch(() => {});
          return tracked;
        };
      },
    });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    if (signal.aborted) {
      return {
        status: 'cancelled',
        error: typeof signal.reason === 'string' ? signal.reason : 'Code execution cancelled',
        logs: logs.toArray(),
        logsTruncated: logs.truncated,
        elapsedMs: Date.now() - startedAt,
        mayHaveInFlightCall: false,
      };
    }

    const javascript = transpileTypeScriptBody(options.code);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('bot', 'sdk', 'console', 'signal', javascript);

    const invocation = (async () => {
      const result = await fn(
        cancellable(options.bot),
        cancellable(options.sdk),
        scopedConsole,
        signal,
      );

      // Once the user's main function returns, refuse timer/callback-driven
      // follow-up actions, but wait for promises it already started. This
      // prevents ordinary fire-and-forget calls from leaking into the next run.
      acceptingCalls = false;
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
      return result;
    })();
    invocation.catch(() => {});

    const terminal = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new ExecutionTerminalError(
          'timeout',
          `Code execution timed out after ${formatDuration(options.timeoutMs)}`,
        );
        // Abort listeners run synchronously. Using the typed terminal error as
        // the abort reason preserves timeout (rather than cancellation) status.
        stop(timeoutError);
        reject(timeoutError);
      }, options.timeoutMs);

      signal.addEventListener('abort', () => {
        const reason = signal.reason;
        if (reason instanceof ExecutionTerminalError) {
          reject(reason);
          return;
        }
        const message = typeof reason === 'string' ? reason : 'Code execution cancelled';
        reject(new ExecutionTerminalError('cancelled', message));
      }, { once: true });
    });

    const result = await Promise.race([invocation, terminal]);
    acceptingCalls = false;
    return {
      status: 'success',
      result,
      logs: logs.toArray(),
      logsTruncated: logs.truncated,
      elapsedMs: Date.now() - startedAt,
      mayHaveInFlightCall: false,
    };
  } catch (error) {
    const status = error instanceof ExecutionTerminalError ? error.status : 'error';
    const pendingCalls = [...inFlight];
    return {
      status,
      error: error instanceof Error ? error.message : String(error),
      logs: logs.toArray(),
      logsTruncated: logs.truncated,
      elapsedMs: Date.now() - startedAt,
      mayHaveInFlightCall: pendingCalls.length > 0,
      quiescence: pendingCalls.length > 0
        ? Promise.allSettled(pendingCalls).then(() => {})
        : undefined,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    acceptingCalls = false;
    options.externalSignal?.removeEventListener('abort', externalAbort);
  }
}

class ExecutionTerminalError extends Error {
  constructor(readonly status: 'timeout' | 'cancelled', message: string) {
    super(message);
  }
}

class OperationCancelledError extends Error {}

export class PerBotExecutionQueue {
  private readonly locked = new Set<string>();
  private readonly waiters = new Map<string, Array<{
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
  }>>();

  isLocked(botName: string): boolean {
    return this.locked.has(botName);
  }

  async run<T>(
    botName: string,
    task: () => Promise<T | QueueHeldResult<T>>,
    signal?: AbortSignal,
  ): Promise<T> {
    const release = await this.acquire(botName, signal);
    let releaseDeferred = false;
    try {
      const result = await task();
      if (result instanceof QueueHeldResult) {
        releaseDeferred = true;
        result.until.finally(release).catch(() => {});
        return result.value;
      }
      return result;
    } finally {
      if (!releaseDeferred) release();
    }
  }

  private acquire(botName: string, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      return Promise.reject(new Error('Cancelled while waiting for the bot execution lock'));
    }

    if (!this.locked.has(botName)) {
      this.locked.add(botName);
      return Promise.resolve(this.createRelease(botName));
    }

    return new Promise((resolve, reject) => {
      const waiter: {
        resolve: (release: () => void) => void;
        reject: (error: Error) => void;
        signal?: AbortSignal;
        onAbort?: () => void;
      } = { resolve, reject, signal };

      if (signal) {
        waiter.onAbort = () => {
          const queue = this.waiters.get(botName);
          if (queue) {
            const index = queue.indexOf(waiter);
            if (index >= 0) queue.splice(index, 1);
          }
          reject(new Error('Cancelled while waiting for the bot execution lock'));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }

      const queue = this.waiters.get(botName) ?? [];
      queue.push(waiter);
      this.waiters.set(botName, queue);
    });
  }

  private createRelease(botName: string): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      const queue = this.waiters.get(botName);
      while (queue && queue.length > 0) {
        const next = queue.shift()!;
        if (next.signal?.aborted) continue;
        if (next.signal && next.onAbort) {
          next.signal.removeEventListener('abort', next.onAbort);
        }
        next.resolve(this.createRelease(botName));
        if (queue.length === 0) this.waiters.delete(botName);
        return;
      }

      this.waiters.delete(botName);
      this.locked.delete(botName);
    };
  }
}

export class QueueHeldResult<T> {
  constructor(readonly value: T, readonly until: Promise<unknown>) {}
}

export function holdQueueUntil<T>(value: T, until: Promise<unknown>): QueueHeldResult<T> {
  return new QueueHeldResult(value, until);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value
    && typeof (value as { then?: unknown }).then === 'function';
}

function formatLogArgument(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  return inspect(value, {
    depth: 5,
    maxArrayLength: 100,
    maxStringLength: 4_096,
    breakLength: 120,
    compact: 3,
  });
}

function formatDuration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} minute(s)`;
  return `${ms}ms`;
}
