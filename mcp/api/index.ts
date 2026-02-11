// Bot connection manager
// Supports multiple simultaneous bot connections

import { BotSDK, deriveGatewayUrl } from '../../sdk/index';
import { BotActions } from '../../sdk/actions';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface BotConnection {
  sdk: BotSDK;
  bot: BotActions;
  username: string;
  connected: boolean;
  unsubscribeConnectionState?: () => void;
}

class BotManager {
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
      await this.connectWithTimeout(existing.sdk, 30000);
      existing.connected = true;
      return existing;
    }

    let username = name;
    let pwd = password;
    let gateway = gatewayUrl || this.defaultGatewayUrl;
    let showChat = false;

    // Load credentials from bot.env if no password provided
    if (!password) {
      const envPath = join(process.cwd(), 'bots', name, 'bot.env');

      if (!existsSync(envPath)) {
        throw new Error(`Bot "${name}" not found. Create it first with: bun scripts/create-bot.ts ${name}`);
      }

      const envContent = await readFile(envPath, 'utf-8');
      const env = this.parseEnv(envContent);

      username = env.BOT_USERNAME || name;
      pwd = env.PASSWORD;

      if (env.SERVER) {
        gateway = deriveGatewayUrl(env.SERVER);
      }

      // Check if chat should be shown (default: false for safety)
      if (env.SHOW_CHAT?.toLowerCase() === 'true') {
        showChat = true;
      }
    }

    if (!pwd) {
      throw new Error(`No password provided for bot "${name}"`);
    }

    console.error(`[MCP] Connecting bot "${name}":`);
    console.error(`[MCP]   username: ${username}`);
    console.error(`[MCP]   gateway: ${gateway}`);
    console.error(`[MCP]   password: ${pwd ? pwd.substring(0, 3) + '...' : 'MISSING'}`);

    const sdk = new BotSDK({
      botUsername: username,
      password: pwd,
      gatewayUrl: gateway,
      connectionMode: 'control',
      autoReconnect: true,       // Enable auto-reconnect for connection stability
      autoLaunchBrowser: 'auto', // Auto-launch browser if session is stale
      showChat,                  // Show other players' chat (default: false for safety)
    });

    const bot = new BotActions(sdk);

    // Connect with 30s timeout to avoid blocking forever
    console.error(`[MCP] Starting connection...`);
    await this.connectWithTimeout(sdk, 30000);
    console.error(`[MCP] Bot "${name}" connected!`);

    const connection: BotConnection = {
      sdk,
      bot,
      username,
      connected: true
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

  private async connectWithTimeout(sdk: BotSDK, timeoutMs: number): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });

    try {
      await Promise.race([sdk.connect(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
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
    connection.sdk.disconnect();
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
  list(): Array<{ name: string; username: string; connected: boolean }> {
    return Array.from(this.connections.entries()).map(([name, conn]) => ({
      name,
      username: conn.username,
      connected: conn.connected
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
}

// Export singleton instance
export const botManager = new BotManager();
