import type { BotConnection } from './api';

export const INSPECT_STATE_SECTIONS = [
  'player',
  'skills',
  'inventory',
  'equipment',
  'nearby_npcs',
  'nearby_players',
  'nearby_locations',
  'ground_items',
  'dialog',
  'interface',
  'bank',
  'shop',
  'messages',
  'combat_events',
  'prayers',
] as const;

type InspectSection = typeof INSPECT_STATE_SECTIONS[number];
type ToolArguments = Record<string, unknown>;

export const AGENT_TOOL_DEFINITIONS = [
  {
    name: 'inspect_state',
    description: 'Get typed game state without executing arbitrary code. Returns freshness and connection metadata plus the full state or selected sections. This supersedes the older get_state proposal.',
    inputSchema: {
      type: 'object',
      properties: {
        bot_name: { type: 'string', description: 'Bot name (matches bots/{name}/).' },
        sections: {
          type: 'array',
          items: { type: 'string', enum: [...INSPECT_STATE_SECTIONS] },
          uniqueItems: true,
          description: 'Optional sections to return. Omit for the complete state.',
        },
      },
      required: ['bot_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_entities',
    description: 'Query nearby NPCs, players, locations, ground items, or inventory with typed filters. Location and ground-item queries may request an on-demand scan.',
    inputSchema: {
      type: 'object',
      properties: {
        bot_name: { type: 'string', description: 'Bot name (matches bots/{name}/).' },
        kind: {
          type: 'string',
          enum: ['npc', 'player', 'location', 'ground_item', 'inventory_item'],
        },
        name: { type: 'string', description: 'Case-insensitive literal name substring.' },
        name_pattern: { type: 'string', description: 'Optional JavaScript regular expression; cannot be combined with name.' },
        option: { type: 'string', description: 'Require an interaction option containing this text.' },
        max_distance: { type: 'number', minimum: 0 },
        scan_radius: {
          type: 'number',
          minimum: 1,
          maximum: 64,
          description: 'On-demand scan radius; supported for location and ground_item.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      required: ['bot_name', 'kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'perform_action',
    description: 'Perform one validated high-level bot action. Calls for the same bot are serialized. Results inherit the completion guarantees of the named BotActions method.',
    inputSchema: {
      type: 'object',
      properties: {
        bot_name: { type: 'string', description: 'Bot name (matches bots/{name}/).' },
        action: {
          type: 'string',
          enum: [
            'walk_to',
            'talk_to',
            'interact_npc',
            'interact_location',
            'attack_npc',
            'pickup_item',
            'chop_tree',
            'open_door',
            'open_bank',
            'deposit_item',
            'withdraw_item',
            'eat_food',
            'say',
            'wait_ticks',
            'dismiss_blocking_ui',
            'skip_tutorial',
          ],
        },
        target: { type: 'string', description: 'Case-insensitive literal target-name substring.' },
        target_index: { type: 'integer', minimum: 0, description: 'Nearby NPC index, where supported.' },
        x: { type: 'integer', description: 'Destination world X for walk_to.' },
        z: { type: 'integer', description: 'Destination world Z for walk_to.' },
        tolerance: { type: 'integer', minimum: 0, maximum: 20, default: 3 },
        option: {
          oneOf: [{ type: 'string' }, { type: 'integer', minimum: 1 }],
          description: 'Interaction option text or protocol option index.',
        },
        amount: { type: 'integer', description: 'Item quantity; -1 means all where supported.' },
        slot: { type: 'integer', minimum: 0, description: 'Bank slot for withdraw_item.' },
        timeout_ms: { type: 'integer', minimum: 100, maximum: 120000 },
        text: { type: 'string', description: 'Chat text for say.' },
        ticks: { type: 'integer', minimum: 1, maximum: 1000 },
        randomize_appearance: { type: 'boolean', default: true },
      },
      required: ['bot_name', 'action'],
      additionalProperties: false,
    },
  },
] as const;

const SECTION_FIELDS: Record<InspectSection, string> = {
  player: 'player',
  skills: 'skills',
  inventory: 'inventory',
  equipment: 'equipment',
  nearby_npcs: 'nearbyNpcs',
  nearby_players: 'nearbyPlayers',
  nearby_locations: 'nearbyLocs',
  ground_items: 'groundItems',
  dialog: 'dialog',
  interface: 'interface',
  bank: 'bank',
  shop: 'shop',
  messages: 'gameMessages',
  combat_events: 'combatEvents',
  prayers: 'prayers',
};

export function inspectState(connection: BotConnection, sections?: string[]): unknown {
  const state = connection.sdk.getState();
  const metadata = connectionMetadata(connection);
  if (!state) {
    return {
      metadata,
      state: null,
      warning: 'No game state has been received. Open or reload the bot browser and confirm the character is logged in.',
    };
  }

  if (!sections || sections.length === 0) {
    return { metadata, state };
  }

  const selected: Record<string, unknown> = {};
  for (const requested of sections) {
    if (!isInspectSection(requested)) {
      throw new Error(`Unknown state section "${requested}"`);
    }
    const field = SECTION_FIELDS[requested];
    selected[requested] = (state as unknown as Record<string, unknown>)[field];
  }
  return { metadata, state: selected };
}

export async function queryEntities(connection: BotConnection, args: ToolArguments): Promise<unknown> {
  const kind = requireEnum(args.kind, 'kind', [
    'npc',
    'player',
    'location',
    'ground_item',
    'inventory_item',
  ] as const);
  const name = optionalString(args.name, 'name');
  const patternText = optionalString(args.name_pattern, 'name_pattern');
  if (name && patternText) throw new Error('Use either name or name_pattern, not both');

  let namePattern: RegExp | null = null;
  if (patternText) {
    try {
      namePattern = new RegExp(patternText, 'i');
    } catch (error) {
      throw new Error(`Invalid name_pattern: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const option = optionalString(args.option, 'option')?.toLowerCase();
  const maxDistance = optionalNumberInRange(args.max_distance, 'max_distance', 0, Infinity);
  const scanRadius = optionalInteger(args.scan_radius, 'scan_radius', 1, 64);
  const limit = optionalInteger(args.limit, 'limit', 1, 100) ?? 20;

  if (scanRadius !== undefined && kind !== 'location' && kind !== 'ground_item') {
    throw new Error('scan_radius is only valid for location and ground_item queries');
  }

  let entities: Array<Record<string, unknown>>;
  switch (kind) {
    case 'npc':
      entities = connection.sdk.getNearbyNpcs() as unknown as Array<Record<string, unknown>>;
      break;
    case 'player':
      entities = (connection.sdk.getState()?.nearbyPlayers ?? []) as unknown as Array<Record<string, unknown>>;
      break;
    case 'location':
      entities = (scanRadius === undefined
        ? connection.sdk.getNearbyLocs()
        : await connection.sdk.scanNearbyLocs(scanRadius)) as unknown as Array<Record<string, unknown>>;
      break;
    case 'ground_item':
      entities = (scanRadius === undefined
        ? connection.sdk.getGroundItems()
        : await connection.sdk.scanGroundItems(scanRadius)) as unknown as Array<Record<string, unknown>>;
      break;
    case 'inventory_item':
      entities = connection.sdk.getInventory() as unknown as Array<Record<string, unknown>>;
      break;
  }

  const filtered = entities
    .filter(entity => {
      const entityName = String(entity.name ?? '');
      if (name && !entityName.toLowerCase().includes(name.toLowerCase())) return false;
      if (namePattern && !namePattern.test(entityName)) return false;
      if (maxDistance !== undefined && typeof entity.distance === 'number' && entity.distance > maxDistance) return false;
      if (option) {
        const options = Array.isArray(entity.options)
          ? entity.options
          : Array.isArray(entity.optionsWithIndex)
            ? (entity.optionsWithIndex as Array<{ text?: unknown }>).map(entry => entry.text)
            : [];
        if (!options.some(value => String(value).toLowerCase().includes(option))) return false;
      }
      return true;
    })
    .sort((left, right) => {
      const leftDistance = typeof left.distance === 'number' ? left.distance : 0;
      const rightDistance = typeof right.distance === 'number' ? right.distance : 0;
      return leftDistance - rightDistance;
    })
    .slice(0, Math.floor(limit));

  return {
    metadata: connectionMetadata(connection),
    query: { kind, name: name ?? null, namePattern: patternText ?? null, option: option ?? null, maxDistance: maxDistance ?? null, scanRadius: scanRadius ?? null },
    count: filtered.length,
    entities: filtered,
  };
}

export async function performAction(connection: BotConnection, args: ToolArguments): Promise<unknown> {
  const action = requireEnum(args.action, 'action', [
    'walk_to',
    'talk_to',
    'interact_npc',
    'interact_location',
    'attack_npc',
    'pickup_item',
    'chop_tree',
    'open_door',
    'open_bank',
    'deposit_item',
    'withdraw_item',
    'eat_food',
    'say',
    'wait_ticks',
    'dismiss_blocking_ui',
    'skip_tutorial',
  ] as const);

  const target = optionalString(args.target, 'target');
  const targetIndex = optionalInteger(args.target_index, 'target_index', 0, Infinity);
  const option = args.option;
  let result: unknown;

  switch (action) {
    case 'walk_to':
      result = await connection.bot.walkTo(
        requireInteger(args.x, 'x'),
        requireInteger(args.z, 'z'),
        optionalInteger(args.tolerance, 'tolerance', 0, 20) ?? 3,
      );
      break;
    case 'talk_to':
      result = await connection.bot.talkTo(resolveNpcTarget(connection, target, targetIndex));
      break;
    case 'interact_npc':
      result = await connection.bot.interactNpc(
        resolveNpcTarget(connection, target, targetIndex),
        normalizeOption(option),
      );
      break;
    case 'interact_location':
      result = await connection.bot.interactLoc(
        literalPattern(requireTarget(target)),
        normalizeOption(option),
      );
      break;
    case 'attack_npc':
      result = await connection.bot.attackNpc(
        resolveNpcTarget(connection, target, targetIndex),
        optionalInteger(args.timeout_ms, 'timeout_ms', 100, 120_000) ?? 5_000,
      );
      break;
    case 'pickup_item':
      result = await connection.bot.pickupItem(literalPattern(requireTarget(target)));
      break;
    case 'chop_tree':
      result = await connection.bot.chopTree(target ? literalPattern(target) : undefined);
      break;
    case 'open_door':
      result = await connection.bot.openDoor(target ? literalPattern(target) : undefined);
      break;
    case 'open_bank':
      result = await connection.bot.openBank(optionalInteger(args.timeout_ms, 'timeout_ms', 100, 120_000) ?? 10_000);
      break;
    case 'deposit_item':
      result = await connection.bot.depositItem(
        literalPattern(requireTarget(target)),
        optionalInteger(args.amount, 'amount', -1, Infinity) ?? -1,
      );
      break;
    case 'withdraw_item': {
      const slot = optionalInteger(args.slot, 'slot', 0, Infinity);
      if (slot === undefined && !target) throw new Error('withdraw_item requires slot or target');
      result = await connection.bot.withdrawItem(
        slot ?? literalPattern(target!),
        optionalInteger(args.amount, 'amount', -1, Infinity) ?? 1,
      );
      break;
    }
    case 'eat_food':
      result = await connection.bot.eatFood(literalPattern(requireTarget(target)));
      break;
    case 'say':
      result = await connection.sdk.say(requireString(args.text, 'text'));
      break;
    case 'wait_ticks':
      await connection.sdk.waitForTicks(optionalInteger(args.ticks, 'ticks', 1, 1_000) ?? 1);
      result = { success: true, message: 'Wait complete' };
      break;
    case 'dismiss_blocking_ui':
      await connection.bot.dismissBlockingUI();
      result = { success: true, message: 'Blocking UI dismissed when safe' };
      break;
    case 'skip_tutorial':
      result = await connection.bot.skipTutorial({
        randomizeAppearance: optionalBoolean(args.randomize_appearance, 'randomize_appearance') ?? true,
      });
      break;
  }

  return {
    action,
    result,
    metadata: connectionMetadata(connection),
  };
}

export function connectionMetadata(connection: BotConnection): Record<string, unknown> {
  const state = connection.sdk.getState();
  return {
    username: connection.username,
    connected: connection.sdk.isConnected(),
    authenticated: connection.sdk.isAuthenticated(),
    connectionState: connection.sdk.getConnectionState(),
    connectionMode: connection.sdk.getConnectionMode(),
    stateAgeMs: state && connection.sdk.getStateReceivedAt() > 0
      ? connection.sdk.getStateAge()
      : null,
    tick: state?.tick ?? null,
    inGame: state?.inGame ?? null,
  };
}

function resolveNpcTarget(connection: BotConnection, target?: string, targetIndex?: number) {
  if (targetIndex !== undefined) {
    const npc = connection.sdk.getNearbyNpc(targetIndex);
    if (!npc) throw new Error(`Nearby NPC index ${targetIndex} was not found`);
    return npc;
  }
  return literalPattern(requireTarget(target));
}

function normalizeOption(value: unknown): number | RegExp {
  if (value === undefined) return 1;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return value;
  if (typeof value === 'string' && value.length > 0) return literalPattern(value);
  throw new Error('option must be a non-empty string or a positive integer');
}

function literalPattern(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function requireTarget(value?: string): string {
  if (!value) throw new Error('target is required for this action');
  return value;
}

function isInspectSection(value: string): value is InspectSection {
  return (INSPECT_STATE_SECTIONS as readonly string[]).includes(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, field);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} must be a finite number`);
  return value;
}

function requireInteger(value: unknown, field: string): number {
  const number = requireNumber(value, field);
  if (!Number.isInteger(number)) throw new Error(`${field} must be an integer`);
  return number;
}

function optionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  const number = requireInteger(value, field);
  if (number < min || number > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return number;
}

function optionalNumberInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  const number = requireNumber(value, field);
  if (number < min || number > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return number;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function requireEnum<const T extends readonly string[]>(value: unknown, field: string, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${field} must be one of: ${values.join(', ')}`);
  }
  return value as T[number];
}
