#!/usr/bin/env bun
/**
 * MCP Code Execution Server for RS-Agent
 *
 * Security boundary: execute_code intentionally runs trusted agent-provided
 * code in this Bun process. It is not a sandbox and can access process APIs,
 * the filesystem, and the network with the MCP server's permissions.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { botManager } from './api/index.js';
import {
  executeUserCode,
  holdQueueUntil,
  PerBotExecutionQueue,
  runCancellableOperation,
} from './execution.js';
import { AGENT_TOOL_DEFINITIONS, inspectState, performAction, queryEntities } from './agent-tools.js';
import { buildExecutionOutput, jsonResponseText } from './output.js';
import { getResourceDefinitions, readAllowedResource } from './resources.js';

const executionQueue = new PerBotExecutionQueue();

const server = new Server(
  {
    name: 'rs-agent-bot',
    version: '2.1.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: getResourceDefinitions().map(({ filePath: _filePath, ...resource }) => resource),
}));

server.setRequestHandler(ReadResourceRequestSchema, async request => {
  const content = await readAllowedResource(request.params.uri);
  return { contents: [content] };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'execute_code',
      description: 'Execute trusted TypeScript on a bot. Auto-connects using bots/{name}/bot.env. The async body receives bot (BotActions), sdk (BotSDK), console (request-scoped), and signal (AbortSignal). Calls are serialized per bot. This is not a security sandbox.',
      inputSchema: {
        type: 'object',
        properties: {
          bot_name: {
            type: 'string',
            description: 'Bot name (matches folder in bots/). Auto-connects on first use.',
          },
          code: {
            type: 'string',
            maxLength: 262144,
            description: 'TypeScript async function body. Available globals: bot, sdk, console, signal.',
          },
          timeout: {
            type: 'number',
            minimum: 0.1,
            maximum: 60,
            description: 'Execution timeout in minutes (default: 2, max: 60).',
          },
        },
        required: ['bot_name', 'code'],
        additionalProperties: false,
      },
    },
    ...AGENT_TOOL_DEFINITIONS,
    {
      name: 'disconnect_bot',
      description: 'Disconnect a connected bot.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Bot name to disconnect.' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    {
      name: 'list_bots',
      description: 'List bot sessions with transport/auth state, game-state freshness, control mode, and gateway controller/observer information.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  ] as any,
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case 'disconnect_bot': {
        const botName = requireString(args.name, 'name');
        await botManager.disconnect(botName);
        return successResponse({ message: `Disconnected bot "${botName}"` });
      }

      case 'list_bots': {
        const bots = (await botManager.list()).map(bot => ({
          ...bot,
          executionBusy: executionQueue.isLocked(bot.name),
        }));
        return successResponse({ bots, count: bots.length });
      }

      case 'inspect_state': {
        const botName = requireString(args.bot_name, 'bot_name');
        const sections = optionalStringArray(args.sections, 'sections');
        // Inspection intentionally returns cached state with an explicit age,
        // even when stale, so agents can diagnose a stopped browser.
        const connection = await botManager.ensureHealthy(botName, { requireFreshState: false });
        return successResponse(inspectState(connection, sections));
      }

      case 'query_entities': {
        const botName = requireString(args.bot_name, 'bot_name');
        return await executionQueue.run(botName, async () => {
          const connection = await botManager.ensureHealthy(botName);
          const outcome = await runCancellableOperation(
            () => queryEntities(connection, args),
            extra.signal,
          );
          const response = outcome.status === 'success'
            ? successResponse(outcome.value)
            : errorResponse(outcome.error ?? `Entity query ${outcome.status}`);
          return outcome.quiescence
            ? holdQueueUntil(response, outcome.quiescence)
            : response;
        }, extra.signal);
      }

      case 'perform_action': {
        const botName = requireString(args.bot_name, 'bot_name');
        return await executionQueue.run(botName, async () => {
          const connection = await botManager.ensureHealthy(botName);
          const outcome = await runCancellableOperation(
            () => performAction(connection, args),
            extra.signal,
          );
          const response = outcome.status === 'success'
            ? successResponse(outcome.value)
            : errorResponse(outcome.error ?? `Action ${outcome.status}`);
          return outcome.quiescence
            ? holdQueueUntil(response, outcome.quiescence)
            : response;
        }, extra.signal);
      }

      case 'execute_code': {
        const botName = requireString(args.bot_name, 'bot_name');
        const code = requireString(args.code, 'code');
        if (code.length > 262_144) {
          throw new Error('code exceeds the 262144-character execution limit');
        }
        const timeoutMinutes = clampTimeoutMinutes(args.timeout);

        return await executionQueue.run(botName, async () => {
          const connection = await botManager.ensureHealthy(botName);
          const outcome = await executeUserCode({
            bot: connection.bot,
            sdk: connection.sdk,
            code,
            timeoutMs: timeoutMinutes * 60_000,
            externalSignal: extra.signal,
            logLimitChars: 48 * 1024,
          });

          const response = {
            content: [{
              type: 'text' as const,
              text: buildExecutionOutput(outcome, connection, code.length > 2_000),
            }],
            ...(outcome.status === 'success' ? {} : { isError: true }),
          };

          // The public SDK cannot abort a call already in progress. Keep this
          // bot's queue locked until that call settles so a new mutation cannot
          // overlap it, while still returning timeout diagnostics immediately.
          return outcome.quiescence
            ? holdQueueUntil(response, outcome.quiescence)
            : response;
        }, extra.signal);
      }

      default:
        return errorResponse(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
});

function successResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: jsonResponseText(data) }],
  };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value;
}

function clampTimeoutMinutes(value: unknown): number {
  if (value === undefined) return 2;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('timeout must be a finite number of minutes');
  }
  return Math.min(Math.max(value, 0.1), 60);
}

function installStdioSafeConsole(): void {
  // MCP reserves stdout for JSON-RPC. SDK diagnostics use console.log, so route
  // process-level logs to stderr once. User code receives its own scoped
  // console argument and never requires per-request global monkeypatching.
  console.log = (...args: unknown[]) => console.error(...args);
}

async function main() {
  installStdioSafeConsole();
  console.error('[MCP Server] Starting RS-Agent MCP server v2.1...');
  console.error('[MCP Server] Bots auto-connect on first use. execute_code runs trusted code and is not sandboxed.');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP Server] Server running on stdio');
}

if (import.meta.main) {
  main().catch(error => {
    console.error('[MCP Server] Fatal error:', error);
    process.exit(1);
  });
}
