import type { BotConnection } from './api';
import type { ExecutionOutcome } from './execution';
import { formatWorldState } from '../sdk/formatter';

export const MAX_TOOL_OUTPUT_CHARS = 160 * 1024;
const MAX_RESULT_CHARS = 32 * 1024;
const MAX_STATE_CHARS = 48 * 1024;

export function jsonResponseText(value: unknown, maxChars = MAX_TOOL_OUTPUT_CHARS): string {
  const serialized = safeStringify(value);
  if (serialized.length <= maxChars) return serialized;

  // Keep structured-tool responses valid JSON even when bounded. Agents can
  // request narrower inspect_state sections instead of receiving a broken JSON
  // fragment.
  let previewLength = Math.max(0, Math.floor(maxChars * 0.7));
  let bounded = '';
  do {
    bounded = safeStringify({
      truncated: true,
      originalChars: serialized.length,
      omittedChars: serialized.length - previewLength,
      message: 'Response exceeded the MCP output limit. Request fewer state sections or narrower query filters.',
      preview: serialized.slice(0, previewLength),
    });
    previewLength = Math.max(0, previewLength - Math.max(1, bounded.length - maxChars));
  } while (bounded.length > maxChars && previewLength > 0);

  return bounded.length <= maxChars
    ? bounded
    : '{"truncated":true,"message":"Response exceeded the MCP output limit."}';
}

export function buildExecutionOutput(
  outcome: ExecutionOutcome,
  connection: BotConnection,
  isLongCode: boolean,
): string {
  const parts: string[] = [];

  parts.push(`── Execution (${outcome.status}, ${outcome.elapsedMs}ms) ──`);
  if (outcome.logs.length > 0) {
    parts.push('── Console ──');
    parts.push(outcome.logs.join('\n'));
  }

  if (outcome.status === 'success' && outcome.result !== undefined) {
    parts.push('── Result ──');
    parts.push(truncateText(safeStringify(outcome.result), MAX_RESULT_CHARS, 'result'));
  } else if (outcome.status !== 'success') {
    parts.push('── Error ──');
    parts.push(outcome.error ?? 'Execution failed');
    if (outcome.mayHaveInFlightCall) {
      parts.push('An SDK/BotActions call had already started when execution stopped. The public SDK cannot abort it; new calls through this execution’s bot/sdk proxies are refused and the bot queue stays locked until the started call settles.');
    }
  }

  const state = connection.sdk.getState();
  if (state) {
    const sinceTick = updateMessageCursor(connection);
    parts.push('── Terminal World State ──');
    parts.push(truncateText(
      formatWorldState(state, connection.sdk.getStateAge(), {
        sinceTick,
      }),
      MAX_STATE_CHARS,
      'world state',
    ));
  } else {
    parts.push('── Terminal World State ──');
    parts.push('(no game state received)');
  }

  if (isLongCode) {
    parts.push('── Tip ──');
    parts.push('Long script detected. For persistent jobs, write a bot script and run it through sdk/runner.ts so process lifecycle and output are explicit.');
  }

  return truncateText(parts.join('\n\n'), MAX_TOOL_OUTPUT_CHARS, 'tool output');
}

export function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === 'bigint') return `${nested}n`;
      if (typeof nested === 'object' && nested !== null) {
        if (seen.has(nested)) return '[Circular]';
        seen.add(nested);
      }
      return nested;
    }, 2);
  } catch {
    return String(value);
  }
}

export function truncateText(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  const suffix = `\n[${label} truncated: ${text.length - maxChars} characters omitted]`;
  return text.slice(0, Math.max(0, maxChars - suffix.length)) + suffix;
}

function updateMessageCursor(connection: BotConnection): number {
  const state = connection.sdk.getState();
  if (!state) return connection.lastShownMessageTick;

  if (state.gameMessages?.length > 0
      && state.gameMessages.every(message => message.tick < connection.lastShownMessageTick)) {
    connection.lastShownMessageTick = -1;
  }
  const sinceTick = connection.lastShownMessageTick;
  for (const message of state.gameMessages ?? []) {
    if (message.tick > connection.lastShownMessageTick) {
      connection.lastShownMessageTick = message.tick;
    }
  }
  return sinceTick;
}
