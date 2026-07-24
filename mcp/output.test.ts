import { describe, expect, test } from 'bun:test';
import { buildExecutionOutput, jsonResponseText } from './output';
import type { BotConnection } from './api';

function connectionWithState(): BotConnection {
  const state = {
    tick: 100,
    inGame: true,
    player: {
      name: 'tester',
      combatLevel: 3,
      hp: 10,
      maxHp: 10,
      worldX: 3200,
      worldZ: 3200,
      level: 0,
      combat: { inCombat: false, targetIndex: -1, lastDamageTick: -1 },
    },
    modalOpen: false,
    modalInterface: -1,
    dialog: { isOpen: false, isWaiting: false, options: [] },
    interface: { isOpen: false, interfaceId: -1, options: [] },
    shop: { isOpen: false },
    bank: { isOpen: false },
    skills: [],
    inventory: [],
    equipment: [],
    nearbyNpcs: [],
    nearbyPlayers: [],
    nearbyLocs: [],
    groundItems: [],
    gameMessages: [{ type: 0, text: 'terminal snapshot', sender: '', tick: 100, fromSelf: false }],
    combatEvents: [],
  };
  return {
    sdk: {
      getState: () => state,
      getStateAge: () => 25,
    },
    bot: {},
    username: 'tester',
    connected: true,
    lastShownMessageCursor: -1,
  } as unknown as BotConnection;
}

describe('bounded MCP output', () => {
  test('error output preserves partial logs and a terminal state snapshot', () => {
    const output = buildExecutionOutput({
      status: 'error',
      error: 'boom',
      logs: ['before failure'],
      logsTruncated: false,
      elapsedMs: 12,
      mayHaveInFlightCall: false,
    }, connectionWithState(), false);

    expect(output).toContain('before failure');
    expect(output).toContain('boom');
    expect(output).toContain('── Terminal World State ──');
    expect(output).toContain('terminal snapshot');
  });

  test('caps structured JSON responses', () => {
    const output = jsonResponseText({ value: 'x'.repeat(1_000) }, 100);
    expect(output.length).toBeLessThanOrEqual(100);
    expect(output).toContain('truncated');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test('uses observation ids to show messages that share a public tick', () => {
    const connection = connectionWithState();
    const state = connection.sdk.getState()!;
    const messages = state.gameMessages as Array<
      (typeof state.gameMessages)[number] & { observationId?: number }
    >;
    messages[0]!.observationId = 1;

    const first = buildExecutionOutput({
      status: 'success',
      logs: [],
      logsTruncated: false,
      elapsedMs: 1,
      mayHaveInFlightCall: false,
    }, connection, false);

    messages.push({
      type: 0,
      text: 'same tick, later observation',
      sender: '',
      tick: 100,
      observationId: 2,
      fromSelf: false,
    });
    const second = buildExecutionOutput({
      status: 'success',
      logs: [],
      logsTruncated: false,
      elapsedMs: 1,
      mayHaveInFlightCall: false,
    }, connection, false);

    expect(first).toContain('terminal snapshot');
    expect(second).not.toContain('terminal snapshot');
    expect(second).toContain('same tick, later observation');
  });
});
