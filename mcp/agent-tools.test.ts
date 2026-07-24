import { describe, expect, test } from 'bun:test';
import { AGENT_TOOL_DEFINITIONS, inspectState, performAction, queryEntities } from './agent-tools';
import type { BotConnection } from './api';

function fakeConnection(overrides: {
  state?: Record<string, unknown> | null;
  npcs?: Array<Record<string, unknown>>;
  bot?: Record<string, unknown>;
} = {}): BotConnection {
  const state = overrides.state === undefined
    ? {
        tick: 10,
        inGame: true,
        player: { name: 'tester', worldX: 3200, worldZ: 3200 },
        nearbyPlayers: [],
      }
    : overrides.state;
  const sdk = {
    getState: () => state,
    getStateReceivedAt: () => state ? Date.now() - 25 : 0,
    getStateAge: () => state ? 25 : 0,
    isConnected: () => true,
    isAuthenticated: () => true,
    getConnectionState: () => 'connected',
    getConnectionMode: () => 'control',
    getNearbyNpcs: () => overrides.npcs ?? [],
    getNearbyLocs: () => [],
    getGroundItems: () => [],
    getInventory: () => [],
    getNearbyNpc: (index: number) => (overrides.npcs ?? []).find(npc => npc.index === index) ?? null,
  };
  return {
    sdk,
    bot: overrides.bot ?? {},
    username: 'tester',
    connected: true,
    lastShownMessageCursor: -1,
  } as unknown as BotConnection;
}

describe('structured agent tools', () => {
  test('exposes state, query, and action tools', () => {
    expect(AGENT_TOOL_DEFINITIONS.map(tool => tool.name))
      .toEqual(['inspect_state', 'query_entities', 'perform_action']);
  });

  test('inspect_state reports missing state instead of hiding freshness metadata', () => {
    const result = inspectState(fakeConnection({ state: null })) as any;
    expect(result.state).toBeNull();
    expect(result.metadata.stateAgeMs).toBeNull();
    expect(result.warning).toContain('No game state');
  });

  test('query_entities applies literal name, option, distance, and limit filters', async () => {
    const connection = fakeConnection({
      npcs: [
        { index: 1, name: 'Cow', distance: 4, options: ['Attack', 'Examine'] },
        { index: 2, name: 'Cow calf', distance: 8, options: ['Attack'] },
        { index: 3, name: 'Cow', distance: 2, options: ['Talk-to'] },
      ],
    });
    const result = await queryEntities(connection, {
      kind: 'npc',
      name: 'cow',
      option: 'attack',
      max_distance: 6,
      limit: 1,
    }) as any;

    expect(result.count).toBe(1);
    expect(result.entities[0].index).toBe(1);
  });

  test('perform_action resolves an NPC index and calls the high-level action', async () => {
    let targetIndex = -1;
    const connection = fakeConnection({
      npcs: [{ index: 7, name: 'Banker', distance: 1, options: ['Talk-to'] }],
      bot: {
        talkTo: async (target: { index: number }) => {
          targetIndex = target.index;
          return { success: true, message: 'Dialog opened' };
        },
      },
    });
    const result = await performAction(connection, {
      action: 'talk_to',
      target_index: 7,
    }) as any;

    expect(targetIndex).toBe(7);
    expect(result.result.success).toBe(true);
  });

  test('perform_action rejects missing action-specific arguments', async () => {
    await expect(performAction(fakeConnection(), { action: 'walk_to', x: 3200 }))
      .rejects.toThrow('z must be a finite number');
  });
});
