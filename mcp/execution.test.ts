import { describe, expect, test } from 'bun:test';
import type { BotActions } from '../sdk/actions';
import type { BotSDK } from '../sdk';
import { executeCode, PerBotQueue } from './execution';

function targets(
  sdk: Record<string, unknown> = {},
  bot: Record<string, unknown> = {},
) {
  return {
    sdk: sdk as unknown as BotSDK,
    bot: bot as unknown as BotActions,
  };
}

describe('minimal execute_code session', () => {
  test('executes TypeScript and captures request-scoped logs', async () => {
    const outcome = await executeCode({
      ...targets(),
      code: `
        const count: number = 2;
        console.log("count", count);
        return count + 1;
      `,
      timeoutMs: 1_000,
    });

    expect(outcome).toMatchObject({
      status: 'success',
      result: 3,
      logs: ['count 2'],
    });
  });

  test('preserves logs when user code fails', async () => {
    const outcome = await executeCode({
      ...targets(),
      code: 'console.warn("before"); throw new Error("boom");',
      timeoutMs: 1_000,
    });

    expect(outcome.status).toBe('error');
    expect(outcome.error).toBe('boom');
    expect(outcome.logs).toEqual(['[warn] before']);
  });

  test('drains unawaited SDK calls before reporting success', async () => {
    let settled = false;
    const outcome = await executeCode({
      ...targets({
        slow: async () => {
          await Bun.sleep(20);
          settled = true;
        },
      }),
      code: '(sdk as any).slow(); return "done";',
      timeoutMs: 1_000,
    });

    expect(outcome.status).toBe('success');
    expect(outcome.result).toBe('done');
    expect(settled).toBe(true);
  });

  test('blocks follow-up SDK calls after timeout and exposes quiescence', async () => {
    const events: string[] = [];
    let releaseSlow!: () => void;
    const slow = new Promise<void>(resolve => { releaseSlow = resolve; });

    const outcome = await executeCode({
      ...targets({
        first: async () => {
          events.push('first:start');
          await slow;
          events.push('first:end');
        },
        second: async () => {
          events.push('second');
        },
      }),
      code: 'await (sdk as any).first(); await (sdk as any).second();',
      timeoutMs: 10,
    });

    expect(outcome.status).toBe('timeout');
    expect(events).toEqual(['first:start']);
    expect(outcome.quiescence).toBeDefined();

    releaseSlow();
    await outcome.quiescence;
    await Bun.sleep(0);
    expect(events).toEqual(['first:start', 'first:end']);
  });

  test('classifies client cancellation separately from timeout', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort('client stopped'), 5);

    const outcome = await executeCode({
      ...targets(),
      code: 'await new Promise(() => {});',
      timeoutMs: 1_000,
      signal: controller.signal,
    });

    expect(outcome.status).toBe('cancelled');
    expect(outcome.error).toBe('client stopped');
  });
});

describe('per-bot FIFO', () => {
  test('serializes one bot while allowing different bots concurrently', async () => {
    const queue = new PerBotQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = queue.run('alpha', async () => {
      events.push('alpha:first');
      await firstGate;
      return { value: 1 };
    });
    const second = queue.run('alpha', async () => {
      events.push('alpha:second');
      return { value: 2 };
    });
    const other = queue.run('beta', async () => {
      events.push('beta');
      return { value: 3 };
    });

    expect(await other).toBe(3);
    expect(events).toEqual(['alpha:first', 'beta']);
    releaseFirst();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(events).toEqual(['alpha:first', 'beta', 'alpha:second']);
  });

  test('keeps the next session queued until a timed-out call is quiescent', async () => {
    const queue = new PerBotQueue();
    const events: string[] = [];
    let releaseCall!: () => void;
    const inFlight = new Promise<void>(resolve => { releaseCall = resolve; });

    const first = await queue.run('alpha', async () => ({
      value: 'timeout response',
      holdUntil: inFlight,
    }));
    expect(first).toBe('timeout response');

    const second = queue.run('alpha', async () => {
      events.push('second');
      return { value: 'done' };
    });
    await Bun.sleep(5);
    expect(events).toEqual([]);

    releaseCall();
    expect(await second).toBe('done');
    expect(events).toEqual(['second']);
  });
});
