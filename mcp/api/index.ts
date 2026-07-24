// Bot connection manager
// Supports multiple simultaneous bot connections

import { BotSDK, deriveGatewayUrl } from '../../sdk/index';
import { BotActions } from '../../sdk/actions';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { BotStatus, ConnectionState, SDKConnectionMode, SessionStatus } from '../../sdk/types';

export interface BotConnection {
  sdk: BotSDK;
  bot: BotActions;
  username: string;
  connected: boolean;
  unsubscribeConnectionState?: () => void;
  /**
   * High-water cursor for gameMessages already shown to the agent. Prefers
   * observationId when available and falls back to tick for older clients.
   * Internal — not part of the SDK surface.
   */
  lastShownMessageCursor: number;
}

export interface BotConnectionSummary {
  name: string;
  username: string;
  connected: boolean;
  authenticated: boolean;
  connectionState: ConnectionState;
  connectionMode: SDKConnectionMode;
  reconnectAttempt: number;
  hasState: boolean;
  stateAgeMs: number | null;
  inGame: boolean | null;
  tick: number | null;
  player: { name: string; worldX: number; worldZ: number } | null;
  sessionStatus: SessionStatus | 'unknown';
  controllers: string[];
  observers: string[];
}

export interface EnsureHealthyOptions {
  /** Require a current game snapshot, not merely an authenticated gateway. */
  requireFreshState?: boolean;
  /** Maximum acceptable local state age. */
  maxStateAgeMs?: number;
  /** Time allowed for a state to become fresh after connection/reconnection. */
  readyTimeoutMs?: number;
}

export class BotManager {
  private connections: Map<string, BotConnection> = new Map();
  private defaultGatewayUrl = 'ws://localhost:7780';

  /**
   * Connect to a bot by name.
   * If password is not provided, loads credentials from bots/{name}/bot.env
   */
  async connect(name: string, password?: string, gatewayUrl?: string): Promise<BotConnection> {
    // Check if already connected
    if (this.connections.has(name)) {
      const existing = this.connections.get(name)!;
      if (existing.connected) {
        return existing;
      }
      // Reconnect if disconnected
      await this.connectWithRetry(existing.sdk);
      existing.connected = true;
      return existing;
    }

    let username = name;
    let pwd = password;
    let gateway = gatewayUrl || this.defaultGatewayUrl;
    let showChat = true;

    // Load credentials from bot.env if no password provided
    if (!password) {
      // Try cwd first, then fall back to the repository root from mcp/api/.
      const cwdPath = join(process.cwd(), 'bots', name, 'bot.env');
      const repoPath = join(import.meta.dir, '..', '..', 'bots', name, 'bot.env');
      const envPath = existsSync(cwdPath) ? cwdPath : repoPath;

      if (!existsSync(envPath)) {
        throw new Error(`Bot "${name}" not found. Create it first with: bun bots/create-bot.ts ${name}`);
      }

      const envContent = await readFile(envPath, 'utf-8');
      const env = this.parseEnv(envContent);

      username = env.BOT_USERNAME || name;
      pwd = env.PASSWORD;

      if (env.SERVER) {
        gateway = deriveGatewayUrl(env.SERVER);
      }

      // Allow opting out of player chat via SHOW_CHAT=false in bot.env.
      // Default: true, so multi-bot scripts can see each other's speech.
      if (env.SHOW_CHAT?.toLowerCase() === 'false') {
        showChat = false;
      }
    }

    if (!pwd) {
      throw new Error(`No password provided for bot "${name}"`);
    }

    console.error(`[MCP] Connecting bot "${name}":`);
    console.error(`[MCP]   username: ${username}`);
    console.error(`[MCP]   gateway: ${gateway}`);

    const sdk = new BotSDK({
      botUsername: username,
      password: pwd,
      gatewayUrl: gateway,
      connectionMode: 'control',
      autoReconnect: true,       // Enable auto-reconnect for connection stability
      autoLaunchBrowser: 'auto', // Auto-launch browser if session is stale
      showChat,                  // Show other players' chat (default: true; opt out with SHOW_CHAT=false)
    });

    const bot = new BotActions(sdk);

    // Connect with retry to handle race conditions
    console.error(`[MCP] Starting connection...`);
    await this.connectWithRetry(sdk);
    console.error(`[MCP] Bot "${name}" connected!`);

    const connection: BotConnection = {
      sdk,
      bot,
      username,
      connected: true,
      lastShownMessageCursor: -1
    };

    // Track connection state changes
    connection.unsubscribeConnectionState = sdk.onConnectionStateChange((state) => {
      const wasConnected = connection.connected;
      connection.connected = state === 'connected';
      if (wasConnected && !connection.connected) {
        console.error(`[MCP] Bot "${name}" connection lost (${state}), will auto-reconnect...`);
      } else if (!wasConnected && connection.connected) {
        console.error(`[MCP] Bot "${name}" reconnected!`);
      }
    });

    this.connections.set(name, connection);
    return connection;
  }

  /**
   * Return a usable cached connection, reconnecting a dead transport and, for
   * mutating tools, refreshing a stale browser session. Throws an actionable
   * error rather than letting an operation run against old state.
   */
  async ensureHealthy(name: string, options: EnsureHealthyOptions = {}): Promise<BotConnection> {
    const {
      requireFreshState = true,
      maxStateAgeMs = 15_000,
      readyTimeoutMs = 15_000,
    } = options;

    let connection = this.get(name);
    if (!connection) {
      connection = await this.connect(name);
    } else if (!connection.sdk.isConnected() || !connection.sdk.isAuthenticated()) {
      connection.connected = false;
      await this.connectWithRetry(connection.sdk);
      connection.connected = true;
    }

    if (!requireFreshState) return connection;
    if (this.hasFreshState(connection, maxStateAgeMs)) return connection;

    // Refresh even when gateway diagnostics say the browser is active: stale
    // local state can mean this SDK socket stopped receiving updates. For a
    // stale/dead browser, reconnecting also re-runs BotSDK's auto-launch policy.
    await connection.sdk.checkBotStatus();
    await connection.sdk.disconnect();
    connection.connected = false;
    await this.connectWithRetry(connection.sdk);
    connection.connected = true;

    try {
      await connection.sdk.waitForCondition(
        () => this.hasFreshState(connection!, maxStateAgeMs),
        readyTimeoutMs,
      );
    } catch {
      const latestStatus = await connection.sdk.checkBotStatus();
      throw new Error(this.formatUnhealthyMessage(name, connection, latestStatus, maxStateAgeMs));
    }

    if (!this.hasFreshState(connection, maxStateAgeMs)) {
      const latestStatus = await connection.sdk.checkBotStatus();
      throw new Error(this.formatUnhealthyMessage(name, connection, latestStatus, maxStateAgeMs));
    }

    return connection;
  }

  private async connectWithRetry(sdk: BotSDK, maxAttempts = 3, timeoutMs = 30000): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs / 1000}s`)), timeoutMs);
        });

        await Promise.race([sdk.connect(), timeoutPromise]).finally(() => clearTimeout(timeoutId!));
        return; // success
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          const delay = attempt * 2000; // 2s, 4s backoff
          console.error(`[MCP] Connection attempt ${attempt}/${maxAttempts} failed: ${msg}. Retrying in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error(`Failed to connect after ${maxAttempts} attempts. Last error: ${msg}`);
        }
      }
    }
  }

  /**
   * Disconnect a bot by name
   */
  async disconnect(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Bot "${name}" is not connected`);
    }

    console.error(`[MCP] Disconnecting bot "${name}"...`);
    if (connection.unsubscribeConnectionState) {
      connection.unsubscribeConnectionState();
    }
    await connection.sdk.disconnect();
    connection.connected = false;
    this.connections.delete(name);
    console.error(`[MCP] Bot "${name}" disconnected`);
  }

  /**
   * Get a bot connection by name
   */
  get(name: string): BotConnection | undefined {
    return this.connections.get(name);
  }

  /**
   * List all connected bots
   */
  async list(): Promise<BotConnectionSummary[]> {
    return Promise.all(Array.from(this.connections.entries()).map(async ([name, conn]) => {
      let status: BotStatus | null = null;
      try {
        status = await conn.sdk.checkBotStatus();
      } catch {
        // Local connection details remain useful if gateway diagnostics fail.
      }

      const state = conn.sdk.getState();
      const stateAge = state && conn.sdk.getStateReceivedAt() > 0
        ? conn.sdk.getStateAge()
        : null;

      return {
        name,
        username: conn.username,
        connected: conn.sdk.isConnected(),
        authenticated: conn.sdk.isAuthenticated(),
        connectionState: conn.sdk.getConnectionState(),
        connectionMode: conn.sdk.getConnectionMode(),
        reconnectAttempt: conn.sdk.getReconnectAttempt(),
        hasState: state !== null,
        stateAgeMs: stateAge,
        inGame: state?.inGame ?? status?.inGame ?? null,
        tick: state?.tick ?? null,
        player: state?.player
          ? {
              name: state.player.name,
              worldX: state.player.worldX,
              worldZ: state.player.worldZ,
            }
          : status?.player ?? null,
        sessionStatus: status?.status ?? 'unknown',
        controllers: status?.controllers ?? [],
        observers: status?.observers ?? [],
      };
    }));
  }

  /**
   * Check if a bot is connected
   */
  has(name: string): boolean {
    return this.connections.has(name);
  }

  private parseEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join('=').trim();
      }
    }
    return result;
  }

  private hasFreshState(connection: BotConnection, maxStateAgeMs: number): boolean {
    return connection.sdk.getState() !== null
      && connection.sdk.getStateReceivedAt() > 0
      && connection.sdk.getStateAge() <= maxStateAgeMs;
  }

  private formatUnhealthyMessage(
    name: string,
    connection: BotConnection,
    status: BotStatus,
    maxStateAgeMs: number,
  ): string {
    const localAge = connection.sdk.getStateReceivedAt() > 0
      ? `${connection.sdk.getStateAge()}ms`
      : 'never received';
    const remoteAge = status.stateAge === null ? 'never received' : `${status.stateAge}ms`;
    return `Bot "${name}" has no fresh game state (local: ${localAge}, gateway: ${status.status}/${remoteAge}, required <= ${maxStateAgeMs}ms). `
      + 'Open or reload the bot browser, confirm the character is logged in, then retry.';
  }
}

// Export singleton instance
export const botManager = new BotManager();
