import { tryParseBoolean, tryParseInt } from '#/util/TryParse.js';
import { loadWorldConfig, migrateFromLegacyEnv } from '#/util/WorldConfig.js';

// rs-sdk: 274 reads nested config from data/config/world.json only; it does NOT
// consult process.env. Deployments (fly.io [env], Docker -e, etc.) set the legacy
// flat env vars (WEB_PORT, LOGIN_SERVER, NODE_MEMBERS, ...), so overlay process.env
// on top of the loaded config — env vars win, absent keys fall back to world.json /
// defaults. Locally (no such vars set) this is a no-op.
const config = migrateFromLegacyEnv(loadWorldConfig(), process.env as Record<string, string>);

export default {
    runtime: {
        isBun: typeof process.versions.bun !== 'undefined',
        maxNpcs: 16383
    },
    ...config,

    // ---------------------------------------------------------------------------
    // rs-sdk back-compat + custom config.
    // 274 moved server config into the nested WorldConfig object (Environment.web.port,
    // Environment.node.xpRate, ...). The rs-sdk bot framework (src/web/, hiscores,
    // login security) was written against the older flat Environment.* names, so we
    // expose flat aliases that map onto the nested config, plus a handful of
    // rs-sdk-only keys read straight from the environment.
    // ---------------------------------------------------------------------------

    // flat aliases -> 274 nested config
    WEB_PORT: config.web.port,
    WEB_MANAGEMENT_PORT: config.web.managementPort,
    WEBSITE_REGISTRATION: config.website.registration,
    NODE_ID: config.node.id,
    NODE_PORT: config.node.port,
    NODE_MEMBERS: config.node.members,
    NODE_PRODUCTION: config.node.production,
    NODE_DEBUG: config.node.debug,
    NODE_HOP_TIME: config.node.hopTime,

    // rs-sdk-only keys (not part of upstream WorldConfig)
    WEB_SOCKET_TOKEN_PROTECTION: tryParseBoolean(process.env.WEB_SOCKET_TOKEN_PROTECTION, false),
    NODE_DEBUG_SOCKET: tryParseBoolean(process.env.NODE_DEBUG_SOCKET, false),
    // rs-sdk: default ON for 274. The 274 web client fetches on-demand assets over the
    // game WebSocket; with this off the engine terminates that socket and the client
    // stalls at ~60% ("Connecting to update server"). Required for the bot client to load.
    NODE_WS_ONDEMAND: tryParseBoolean(process.env.NODE_WS_ONDEMAND, true),
    NODE_INFINITE_RUN: tryParseBoolean(process.env.NODE_INFINITE_RUN, true),
    NODE_RANDOM_EVENTS: tryParseBoolean(process.env.NODE_RANDOM_EVENTS, false),
    NODE_TICKRATE: tryParseInt(process.env.NODE_TICKRATE, 400),
    HISCORES_WEB_PORT: tryParseInt(process.env.HISCORES_WEB_PORT, 8889),
    HISCORES_HIDDEN_NAMES: (process.env.HISCORES_HIDDEN_NAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    BANNED_USERNAME_WORDS: (process.env.BANNED_USERNAME_WORDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
};
