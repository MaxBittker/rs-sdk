#!/usr/bin/env bun
/**
 * MCP Code Execution Server for RS-Agent
 *
 * Manages multiple bot connections dynamically at runtime.
 * Agents can connect, disconnect, and execute code on any connected bot.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { botManager } from './api/index.js';
import { formatWorldState } from '../sdk/formatter.js';
import { executeCode, PerBotQueue } from './execution.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const executionQueue = new PerBotQueue();

// Create MCP server
const server = new Server(
  {
    name: 'rs-agent-bot',
    version: '2.0.0'
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    }
  }
);

// List available API modules as resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'file://../sdk/API.md',
        name: 'SDK API Reference',
        description: 'Auto-generated reference for bot.* (high-level actions: chopTree, walkTo, attackNpc, openBank, ...) and sdk.* (low-level: getState, sendWalk, findNearbyNpc, ...).',
        mimeType: 'text/markdown'
      }
    ]
  };
});

// Read API module contents
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    const uri = request.params.uri;
    let filePath: string;

    if (uri.startsWith('file://')) {
      const relativePath = uri.replace('file://', '');
      filePath = join(__dirname, relativePath);
    } else {
      throw new Error(`Unsupported URI scheme: ${uri}`);
    }

    const content = await Bun.file(filePath).text();

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: 'text/plain',
          text: content
        }
      ]
    };
  } catch (error: any) {
    throw new Error(`Failed to read resource: ${error.message}`);
  }
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_code',
        description: 'Execute TypeScript code on a bot. Auto-connects using credentials from bots/{name}/bot.env. The code runs in an async context with bot (BotActions) and sdk (BotSDK) available.',
        inputSchema: {
          type: 'object',
          properties: {
            bot_name: {
              type: 'string',
              description: 'Bot name (matches folder in bots/). Auto-connects on first use.'
            },
            code: {
              type: 'string',
              description: 'TypeScript code to execute. Available globals: bot (BotActions), sdk (BotSDK). Example: "await bot.chopTree(); return sdk.getState();"'
            },
            timeout: {
              type: 'number',
              description: 'Execution timeout in minutes (default: 2, max: 60)'
            }
          },
          required: ['bot_name', 'code']
        }
      },
      {
        name: 'disconnect_bot',
        description: 'Disconnect a connected bot',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Bot name to disconnect'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'list_bots',
        description: 'List all connected bots',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'disconnect_bot': {
        const botName = args?.name as string;

        if (!botName) {
          return errorResponse('Bot name is required');
        }

        await botManager.disconnect(botName);
        return successResponse({ message: `Disconnected bot "${botName}"` });
      }

      case 'list_bots': {
        const bots = botManager.list();
        return successResponse({
          bots,
          count: bots.length
        });
      }

      case 'execute_code': {
        const botName = args?.bot_name as string;
        const code = args?.code as string;

        if (!botName) {
          return errorResponse('bot_name is required');
        }

        if (!code) {
          return errorResponse('code is required');
        }

        const isLongCode = code.length > 2000;
        return executionQueue.run(botName, async () => {
          // Connecting is part of the serialized session so concurrent first
          // calls cannot create duplicate controllers for the same bot.
          let connection = botManager.get(botName);
          if (!connection) {
            console.error(`[MCP] Bot "${botName}" not connected, auto-connecting...`);
            connection = await botManager.connect(botName);
            try {
              await connection.sdk.waitForCondition(
                () => connection!.sdk.getState() !== null,
                15000,
              );
            } catch {
              console.error(`[MCP] Warning: initial state not received within 15s for bot "${botName}"`);
            }
          }

          const timeoutMinutes = Math.min(
            Math.max((args?.timeout as number) || 2, 0.1),
            60,
          );
          const outcome = await executeCode({
            bot: connection.bot,
            sdk: connection.sdk,
            code,
            timeoutMs: timeoutMinutes * 60_000,
            signal: extra.signal,
          });
          const parts: string[] = [];

          if (outcome.logs.length > 0) {
            parts.push('── Console ──');
            parts.push(outcome.logs.join('\n'));
          }

          if (outcome.status === 'success' && outcome.result !== undefined) {
            if (parts.length > 0) parts.push('');
            parts.push('── Result ──');
            parts.push(stringifyResult(outcome.result));
          } else if (outcome.status !== 'success') {
            if (parts.length > 0) parts.push('');
            parts.push(`── ${outcome.status.toUpperCase()} ──`);
            parts.push(outcome.error ?? 'Execution failed');
          }

          // Append formatted world state. The connection's tick cursor
          // advances each call so repeat execute_code invocations only show
          // NEW chat / system messages — old ones the bot already saw don't
          // get re-emitted. Cursor lives on BotConnection (MCP-only concern)
          // so the SDK surface stays minimal for script authors.
          const state = connection.sdk.getState();
          if (state) {
            // Message ticks are the client's loopCycle, which restarts near 0
            // when the bot page reloads. If every tick is below our cursor the
            // client reloaded — reset the cursor or chat would be muted forever.
            if (state.gameMessages && state.gameMessages.length > 0 &&
                state.gameMessages.every(m => m.tick < connection.lastShownMessageTick)) {
              connection.lastShownMessageTick = -1;
            }
            const sinceTick = connection.lastShownMessageTick;
            if (state.gameMessages) {
              for (const m of state.gameMessages) {
                if (m.tick > connection.lastShownMessageTick) {
                  connection.lastShownMessageTick = m.tick;
                }
              }
            }
            parts.push('');
            parts.push('── World State ──');
            parts.push(formatWorldState(state, connection.sdk.getStateAge(), { sinceTick }));
          }

          // Add reminder for long code
          if (isLongCode) {
            parts.push('');
            parts.push('── Tip ──');
            parts.push(`Long script detected. Consider writing to a .ts file and running with: bun run bots/${botName}/script.ts`);
          }

          const output = parts.length > 0 ? parts.join('\n') : '(no output)';
          return {
            value: {
              content: [{ type: 'text' as const, text: output }],
              ...(outcome.status === 'success' ? {} : { isError: true }),
            },
            holdUntil: outcome.quiescence,
          };
        }, extra.signal);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    const errorMessage = `Error: ${error.message}\n\nStack trace:\n${error.stack}`;
    return {
      content: [{ type: 'text', text: errorMessage }],
      isError: true
    };
  }
});

function successResponse(data: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true
  };
}

function stringifyResult(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function keepStdioProtocolClean(): void {
  // stdout belongs to MCP JSON-RPC. User code receives a scoped console;
  // process and SDK diagnostics go to stderr.
  console.log = (...args: unknown[]) => console.error(...args);
  console.info = (...args: unknown[]) => console.error(...args);
  console.debug = (...args: unknown[]) => console.error(...args);
}

// Start server
async function main() {
  keepStdioProtocolClean();
  console.error('[MCP Server] Starting RS-Agent MCP server v2.0...');
  console.error('[MCP Server] Bots auto-connect on the first execute_code call.');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP Server] Server running on stdio');
}

main().catch((error) => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});
