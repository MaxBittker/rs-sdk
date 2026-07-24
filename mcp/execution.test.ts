import { describe, expect, test } from 'bun:test';
import {
  BoundedLogBuffer,
  executeUserCode,
  holdQueueUntil,
  PerBotExecutionQueue,
  runCancellableOperation,
  transpileTypeScriptBody,
} from './execution';
import type { BotActions } from '../sdk/actions';
import type { BotSDK } from '../sdk';

function fakeTargets(sdk: Record<string, unknown> = {}, bot: Record<string, unknown> = {}) {
  return {
    sdk: sdk as unknown as BotSDK,
    bot: bot as unknown as BotActions,
  };
}

describe('TypeScript execution', () => {
  test('transpiles TypeScript-only syntax in an async function body', async () => {
    const targets = fakeTargets();
    const outcome = await executeUserCode({
      ...targets,
      code: `
        const count: number = 2;
        const maybe: { value: number } | null = { value: 3 };
        console.log("sum", count + maybe!.value);
        return count + maybe!.value;
      `,
      timeoutMs: 1_000,
    });

    expect(outcome.status).toBe('success');
    expect(outcome.result).toBe(5);
    expect(outcome.logs).toEqual(['sum 5']);
  });

  test('returns useful TypeScript compilation errors', () => {
    expect(() => transpileTypeScriptBody('const broken: = 1;'))
      .toThrow('TypeScript compilation failed');
  });

  test('preserves request logs when user code throws', async () => {
    const outcome = await executeUserCode({
      ...fakeTargets(),
      code: 'console.warn("before failure"); throw new Error("boom");',
      timeoutMs: 1_000,
    });

    expect(outcome.status).toBe('error');
    expect(outcome.error).toBe('boom');
    expect(outcome.logs).toEqual(['[warn] before failure']);
  });

  test('classifies timeouts separately from cancellation', async () => {
    const outcome = await executeUserCode({
      ...fakeTargets(),
      code: 'await new Promise(() => {});',
      timeoutMs: 10,
    });

    expect(outcome.status).toBe('timeout');
    expect(outcome.error).toContain('timed out');
  });

  test('blocks follow-up calls and exposes quiescence after cancellation', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const targets = fakeTargets({
      first: async () => {
        calls.push('first:start');
        await Bun.sleep(40);
        calls.push('first:end');
      },
      second: async () => {
        calls.push('second');
      },
    });

    setTimeout(() => controller.abort('test cancellation'), 5);
    const outcome = await executeUserCode({
      ...targets,
      code: 'await (sdk as any).first(); await (sdk as any).second();',
      timeoutMs: 1_000,
      externalSignal: controller.signal,
    });

    expect(outcome.status).toBe('cancelled');
    expect(outcome.mayHaveInFlightCall).toBe(true);
    expect(calls).toEqual(['first:start']);
    await outcome.quiescence;
    expect(calls).toEqual(['first:start', 'first:end']);
  });

  test('drains an unawaited SDK promise before successful completion', async () => {
    let settled = false;
    const targets = fakeTargets({
      delayed: async () => {
        await Bun.sleep(20);
        settled = true;
      },
    });

    const outcome = await executeUserCode({
      ...targets,
      code: '(sdk as any).delayed(); return "done";',
      timeoutMs: 1_000,
    });

    expect(outcome.status).toBe('success');
    expect(outcome.result).toBe('done');
    expect(settled).toBe(true);
  });
});

describe('bounded request-scoped logs', () => {
  test('caps entries and reports truncation', () => {
    const logs = new BoundedLogBuffer(12, 2);
    logs.append('log', ['123456']);
    logs.append('warn', ['abcdef']);
    logs.append('log', ['ignored']);

    expect(logs.truncated).toBe(true);
    expect(logs.toArray().at(-1)).toContain('logs truncated');
    expect(logs.toArray().length).toBeLessThanOrEqual(3);
  });
});

describe('per-bot execution queue', () => {
  test('serializes one bot but allows different bots concurrently', async () => {
    const queue = new PerBotExecutionQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = queue.run('alpha', async () => {
      events.push('alpha:first:start');
      await firstGate;
      events.push('alpha:first:end');
      return 1;
    });
    const second = queue.run('alpha', async () => {
      events.push('alpha:second');
      return 2;
    });
    const other = queue.run('beta', async () => {
      events.push('beta');
      return 3;
    });

    await other;
    expect(events).toEqual(['alpha:first:start', 'beta']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['alpha:first:start', 'beta', 'alpha:first:end', 'alpha:second']);
  });

  test('holds the lock after returning a timeout result until quiescent', async () => {
    const queue = new PerBotExecutionQueue();
    const events: string[] = [];
    let releaseCall!: () => void;
    const inFlight = new Promise<void>(resolve => { releaseCall = resolve; });

    const first = queue.run('alpha', async () =>
      holdQueueUntil('timeout response', inFlight));
    expect(await first).toBe('timeout response');
    expect(queue.isLocked('alpha')).toBe(true);

    const second = queue.run('alpha', async () => {
      events.push('second');
      return 'done';
    });
    await Bun.sleep(5);
    expect(events).toEqual([]);

    releaseCall();
    expect(await second).toBe('done');
    expect(queue.isLocked('alpha')).toBe(false);
  });
});

describe('structured operation cancellation', () => {
  test('returns cancellation promptly and exposes operation quiescence', async () => {
    const controller = new AbortController();
    let completed = false;
    const outcomePromise = runCancellableOperation(async () => {
      await Bun.sleep(30);
      completed = true;
      return 42;
    }, controller.signal);

    setTimeout(() => controller.abort('stop action'), 5);
    const outcome = await outcomePromise;
    expect(outcome.status).toBe('cancelled');
    expect(completed).toBe(false);
    await outcome.quiescence;
    expect(completed).toBe(true);
  });
});
