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
import { dirname, join, resolve } from 'path';
import { botManager } from './api/index.js';
import { initPathfinding } from '../sdk/pathfinding.js';
import { addActionObserver } from '../sdk/tracked.js';
import { marketTool, readMarket } from './market-tools.js';
import { installExecutionConsoleCapture } from './console-capture.js';
import { executeCode, executionError, botExecutions, EXECUTE_CODE_OUTPUT_SCHEMA, type WorldOption } from './execute-code.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create MCP server
const server = new Server(
  {
    name: 'rs-agent-bot',
    version: '2.1.0'
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    },
    instructions: [
      'Plays an MMO through bots. execute_code runs TypeScript against one bot with `bot` (high-level actions) and `sdk` (state + low-level packets) in scope; the full API is the SDK API Reference resource (sdk/API.md).',
      'Results carry structuredContent { ok, result, logs, error: { kind, message } | null, world }. error.kind is one of exception, timeout, superseded, cancelled, not_connected, invalid_input, unserializable_result.',
      'Pass values through `args` instead of splicing them into `code`. Reusable routines belong in a module file run via `script`.',
      'One execution per bot: a new call for the same bot cancels the running one (error.kind "superseded"), so never run two calls for one bot in parallel. Different bots run concurrently.',
      'Keep tight game loops inside one execute_code call: state reads there are synchronous and timers work. Set world: "none" when calling it in a loop.',
      'Open shops/banks block inventory actions; close them with bot.closeInterface(). Skill dialog options are not in product order; click by text.',
    ].join('\n'),
  }
);

// List available API modules as resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'file://../sdk/API.md',
        name: 'SDK API Reference',
        description: 'Auto-generated reference for bot.* (high-level actions: chopTree, walkTo, attack, openBank, ...) and sdk.* (low-level: getState, sendWalk, findNearbyNpc, ...).',
        mimeType: 'text/markdown'
      },
      {uri: 'file://../sdk/MARKET.md', name: 'Grand Exchange guide', description: 'Public market reads, physical trading, offer receipts and recovery after uncertain outcomes.', mimeType: 'text/markdown'}
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
      marketTool,
      {
        name: 'execute_code',
        description: 'Execute TypeScript on a bot: inline `code`, or a module file via `script`. Auto-connects using credentials from bots/{name}/bot.env. Code runs in an async function with bot (BotActions), sdk (BotSDK), Spells (spell component ids) and args (your `args` JSON) in scope; `return` a JSON value. A new call for the same bot cancels the one still running. Timeout or explicit MCP cancellation stops SDK dispatches and observations, including inside high-level actions. Returns structuredContent { ok, result, logs, error, elapsedMs, world }.',
        inputSchema: {
          type: 'object',
          properties: {
            bot_name: {
              type: 'string',
              description: 'Bot name (matches folder in bots/). Auto-connects on first use.'
            },
            code: {
              type: 'string',
              description: 'TypeScript function body (type annotations are stripped before running). Globals: bot, sdk, Spells (e.g. Spells.HIGH_ALCHEMY), args. Example: "const r = await bot.chopTree(); return r;". A world-state summary is included with every result, so there is no need to return sdk.getState() just to look around. Provide exactly one of code or script.'
            },
            script: {
              type: 'string',
              description: 'Path (absolute, or relative to the repo root) of a module whose default export is `async ({ bot, sdk, args }) => result`, e.g. "bots/mybot/chop.ts". Reloaded whenever the file changes. Provide exactly one of code or script.'
            },
            args: {
              description: 'Any JSON value, exposed to the code as `args` (ctx.args for a script). Use it instead of interpolating values into `code`.'
            },
            world: {
              type: 'string',
              enum: ['none', 'brief', 'full'],
              description: 'World state to include with the result: brief (default; nearby lists capped at 10), full (capped at 50), or none.'
            },
            timeout: {
              type: 'number',
              description: 'Execution timeout in minutes (default: 2, max: 60).'
            }
          },
          required: ['bot_name']
        },
        outputSchema: EXECUTE_CODE_OUTPUT_SCHEMA
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
      case 'get_market': return successResponse(await readMarket(args ?? {}));

      case 'disconnect_bot': {
        const botName = args?.name as string;

        if (!botName) {
          return errorResponse('Bot name is required');
        }

        // Supersedes any execution still running on this bot.
        await botExecutions.run(botName, extra.signal, async () => botManager.disconnect(botName));
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
        const botName = args?.bot_name;
        const code = args?.code;
        const script = args?.script;
        const world = args?.world ?? 'brief';

        if (typeof botName !== 'string' || !botName) return executionError('invalid_input', 'bot_name is required');
        if ((code === undefined) === (script === undefined)) return executionError('invalid_input', 'Provide exactly one of code or script');
        if (code !== undefined && (typeof code !== 'string' || !code)) return executionError('invalid_input', 'code must be a non-empty string');
        if (script !== undefined && (typeof script !== 'string' || !script)) return executionError('invalid_input', 'script must be a non-empty path');
        if (!['none', 'brief', 'full'].includes(world as string)) return executionError('invalid_input', 'world must be none, brief or full');

        const timeoutMinutes = Math.min(Math.max((args?.timeout as number) || 2, 0.1), 60);
        return executeCode(botManager, botName, code ?? { script: script as string }, timeoutMinutes * 60_000, extra.signal, botExecutions,
          { args: args?.args, world: world as WorldOption });
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

// Start server
async function main() {
  installExecutionConsoleCapture();
  console.error('[MCP Server] Starting RS-Agent MCP server v2.0...');
  console.error('[MCP Server] Bots auto-connect on the first execute_code call.');

  // Warm the pathfinder before any live session exists: init is fully
  // synchronous (tens of seconds on slow hosts), and paying it lazily inside
  // a walkTo blocks the event loop until the gateway drops the connection.
  initPathfinding();

  // Optional module whose default export observes every execute_code bot/sdk call (e.g. an audit log).
  const observerPath = process.env.RS_SDK_ACTION_OBSERVER;
  if (observerPath) addActionObserver((await import(resolve(process.cwd(), observerPath))).default);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP Server] Server running on stdio');
}

main().catch((error) => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});
