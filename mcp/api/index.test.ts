import { describe, expect, test } from 'bun:test';
import { BotManager, type BotConnection } from './index';

function installConnection(manager: BotManager, options: {
  ageMs?: number;
  connected?: boolean;
  authenticated?: boolean;
  sessionStatus?: 'active' | 'stale' | 'dead';
} = {}) {
  let receivedAt = Date.now() - (options.ageMs ?? 20);
  let socketConnected = options.connected ?? true;
  let authenticated = options.authenticated ?? true;
  let connectCalls = 0;
  let disconnectCalls = 0;
  const state = {
    tick: 44,
    inGame: true,
    player: { name: 'tester', worldX: 3200, worldZ: 3201 },
  };

  const sdk = {
    isConnected: () => socketConnected,
    isAuthenticated: () => authenticated,
    getConnectionState: () => socketConnected ? 'connected' : 'disconnected',
    getConnectionMode: () => 'control',
    getReconnectAttempt: () => 0,
    getState: () => state,
    getStateReceivedAt: () => receivedAt,
    getStateAge: () => Date.now() - receivedAt,
    checkBotStatus: async () => ({
      status: options.sessionStatus ?? 'active',
      inGame: true,
      stateAge: Date.now() - receivedAt,
      controllers: ['sdk-controller'],
      observers: ['observer-1'],
      player: state.player,
    }),
    disconnect: async () => {
      disconnectCalls++;
      socketConnected = false;
      authenticated = false;
    },
    connect: async () => {
      connectCalls++;
      socketConnected = true;
      authenticated = true;
      receivedAt = Date.now();
    },
    waitForCondition: async (predicate: (value: typeof state) => boolean) => {
      if (!predicate(state)) throw new Error('not ready');
      return state;
    },
  };

  const connection = {
    sdk,
    bot: {},
    username: 'tester',
    connected: socketConnected,
    lastShownMessageCursor: -1,
  } as unknown as BotConnection;
  (manager as any).connections.set('tester', connection);

  return {
    connection,
    get connectCalls() { return connectCalls; },
    get disconnectCalls() { return disconnectCalls; },
  };
}

describe('BotManager health and diagnostics', () => {
  test('lists transport, state freshness, mode, and controller details', async () => {
    const manager = new BotManager();
    installConnection(manager);

    const [summary] = await manager.list();
    expect(summary).toMatchObject({
      name: 'tester',
      connected: true,
      authenticated: true,
      connectionState: 'connected',
      connectionMode: 'control',
      hasState: true,
      inGame: true,
      tick: 44,
      sessionStatus: 'active',
      controllers: ['sdk-controller'],
      observers: ['observer-1'],
    });
    expect(summary!.stateAgeMs).toBeLessThan(1_000);
  });

  test('reuses a fresh authenticated connection', async () => {
    const manager = new BotManager();
    const fixture = installConnection(manager, { ageMs: 50 });

    expect(await manager.ensureHealthy('tester')).toBe(fixture.connection);
    expect(fixture.connectCalls).toBe(0);
    expect(fixture.disconnectCalls).toBe(0);
  });

  test('reconnects a stale cached connection before mutation', async () => {
    const manager = new BotManager();
    const fixture = installConnection(manager, {
      ageMs: 30_000,
      sessionStatus: 'stale',
    });

    expect(await manager.ensureHealthy('tester')).toBe(fixture.connection);
    expect(fixture.disconnectCalls).toBe(1);
    expect(fixture.connectCalls).toBe(1);
  });
});
