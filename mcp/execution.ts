import type { BotActions } from '../sdk/actions';
import type { BotSDK } from '../sdk';

const MAX_LOG_ENTRIES = 100;
const MAX_LOG_CHARS = 20_000;

export interface ExecutionOutcome {
  status: 'success' | 'error' | 'timeout' | 'cancelled';
  result?: unknown;
  error?: string;
  logs: string[];
  /** Resolves when SDK calls that started before cancellation have settled. */
  quiescence?: Promise<void>;
}

export interface ExecuteCodeOptions {
  bot: BotActions;
  sdk: BotSDK;
  code: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Execute one agent program and stop it from starting SDK calls after timeout
 * or cancellation. Already-started calls cannot be aborted by the public SDK,
 * so their settlement is exposed as `quiescence`.
 */
export async function executeCode(options: ExecuteCodeOptions): Promise<ExecutionOutcome> {
  const logs: string[] = [];
  let logChars = 0;
  let omittedLogs = 0;
  const inFlight = new Set<Promise<unknown>>();
  let acceptingCalls = true;

  const appendLog = (level: string, values: unknown[]) => {
    const prefix = level === 'log' ? '' : `[${level}] `;
    const rendered = prefix + values.map(formatValue).join(' ');
    const remaining = MAX_LOG_CHARS - logChars;
    if (logs.length >= MAX_LOG_ENTRIES || remaining <= 0) {
      omittedLogs++;
      return;
    }
    const entry = rendered.length <= remaining
      ? rendered
      : `${rendered.slice(0, Math.max(0, remaining - 1))}…`;
    logs.push(entry);
    logChars += entry.length;
    if (entry.length < rendered.length) omittedLogs++;
  };

  const scopedConsole = {
    log: (...values: unknown[]) => appendLog('log', values),
    info: (...values: unknown[]) => appendLog('info', values),
    debug: (...values: unknown[]) => appendLog('debug', values),
    warn: (...values: unknown[]) => appendLog('warn', values),
    error: (...values: unknown[]) => appendLog('error', values),
  };

  const guarded = <T extends object>(target: T): T => new Proxy(target, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (!acceptingCalls) {
          throw new Error(`Execution ended; refusing ${String(property)}()`);
        }
        const result = Reflect.apply(value, object, args);
        if (!isPromiseLike(result)) return result;
        const tracked = Promise.resolve(result);
        inFlight.add(tracked);
        tracked.finally(() => inFlight.delete(tracked)).catch(() => {});
        return tracked;
      };
    },
  });

  const finishLogs = () => {
    if (omittedLogs > 0) logs.push(`[logs truncated: ${omittedLogs} omitted]`);
    return logs;
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener = () => {};
  try {
    if (options.signal?.aborted) {
      return {
        status: 'cancelled',
        error: abortMessage(options.signal),
        logs: finishLogs(),
      };
    }

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      'bot',
      'sdk',
      'console',
      transpileBody(options.code),
    );
    const invocation = (async () => {
      const result = await fn(
        guarded(options.bot),
        guarded(options.sdk),
        scopedConsole,
      );
      acceptingCalls = false;
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
      return result;
    })();
    invocation.catch(() => {});

    const terminal = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new TerminalError(
          'timeout',
          `Code execution timed out after ${formatDuration(options.timeoutMs)}`,
        )),
        options.timeoutMs,
      );
      if (options.signal) {
        const onAbort = () => reject(new TerminalError(
          'cancelled',
          abortMessage(options.signal!),
        ));
        options.signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => options.signal?.removeEventListener('abort', onAbort);
      }
    });

    return {
      status: 'success',
      result: await Promise.race([invocation, terminal]),
      logs: finishLogs(),
    };
  } catch (error) {
    acceptingCalls = false;
    const pending = [...inFlight];
    return {
      status: error instanceof TerminalError ? error.status : 'error',
      error: error instanceof Error ? error.message : String(error),
      logs: finishLogs(),
      quiescence: pending.length > 0
        ? Promise.allSettled(pending).then(() => {})
        : undefined,
    };
  } finally {
    acceptingCalls = false;
    if (timeoutId) clearTimeout(timeoutId);
    removeAbortListener();
  }
}

export interface QueueResult<T> {
  value: T;
  /** Keep the per-bot lock after returning `value` until this settles. */
  holdUntil?: Promise<unknown>;
}

/** Minimal per-bot FIFO. Different bots may still execute concurrently. */
export class PerBotQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(
    botName: string,
    task: () => Promise<QueueResult<T>>,
    signal?: AbortSignal,
  ): Promise<T> {
    const previous = this.tails.get(botName) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => gate);
    this.tails.set(botName, tail);
    tail.finally(() => {
      if (this.tails.get(botName) === tail) this.tails.delete(botName);
    }).catch(() => {});

    try {
      await waitForTurn(previous, signal);
    } catch (error) {
      release();
      throw error;
    }

    if (signal?.aborted) {
      release();
      throw new Error('Cancelled while waiting for the bot execution lock');
    }

    try {
      const result = await task();
      if (result.holdUntil) {
        result.holdUntil.finally(release).catch(() => {});
      } else {
        release();
      }
      return result.value;
    } catch (error) {
      release();
      throw error;
    }
  }
}

function transpileBody(code: string): string {
  const source = `async function __execute(bot: any, sdk: any, console: any) {
${code}
}`;
  try {
    const javascript = new Bun.Transpiler({ loader: 'ts', target: 'bun' }).transformSync(source);
    return `${javascript}\nreturn await __execute(bot, sdk, console);`;
  } catch (error) {
    throw new Error(`TypeScript compilation failed: ${error instanceof Error ? error.message : error}`);
  }
}

function waitForTurn(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return previous;
  if (signal.aborted) {
    return Promise.reject(new Error('Cancelled while waiting for the bot execution lock'));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('Cancelled while waiting for the bot execution lock'));
    signal.addEventListener('abort', onAbort, { once: true });
    previous.then(resolve, resolve).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function abortMessage(signal: AbortSignal): string {
  return typeof signal.reason === 'string' ? signal.reason : 'Code execution cancelled';
}

function formatDuration(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000} minute(s)` : `${ms}ms`;
}

class TerminalError extends Error {
  constructor(
    readonly status: 'timeout' | 'cancelled',
    message: string,
  ) {
    super(message);
  }
}
