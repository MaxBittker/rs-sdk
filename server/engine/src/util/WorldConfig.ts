import fs from 'fs';
import path from 'path';

import { tryParseBoolean, tryParseInt, tryParseString } from '#/util/TryParse.js';

export interface WorldConfig {
    easyStartup: boolean;
    website: {
        registration: boolean;
    };
    web: {
        port: number;
        allowedOrigin: string;
        managementPort: number;
    };
    engine: {
        revision: number;
    };
    node: {
        id: number;
        port: number;
        members: boolean;
        autoSubscribeMembers: boolean;
        xpRate: number;
        production: boolean;
        minimumWealthValueEvent: number;
        debug: boolean;
        debugProfile: boolean;
        clientRoutefinder: boolean;
        profile: string;
        maxConnected: number;
        debugProcChar: string;
        hopTime: number;
        rateLimitAddressLogin: number;
        rateLimitDeviceLogin: number;
    };
    login: {
        enabled: boolean;
        host: string;
        port: number;
    };
    friend: {
        enabled: boolean;
        host: string;
        port: number;
    };
    logger: {
        enabled: boolean;
        host: string;
        port: number;
    };
    db: {
        backend: string;
        host: string;
        port: number;
        user: string;
        pass: string;
        name: string;
        verbose: boolean;
    };
    build: {
        verbose: boolean;
        startup: boolean;
        verify: boolean;
        verifyFolder: boolean;
        verifyPack: boolean;
        liveReload: boolean;
        srcDir: string;
    };
}

const worldConfigPath = path.resolve('data/config/world.json');
const legacyEnvPath = path.resolve('.env');

export function getWorldConfigPath() {
    return worldConfigPath;
}

export function createDefaultWorldConfig(): WorldConfig {
    return {
        easyStartup: false,
        website: {
            registration: true
        },
        web: {
            port: 8888, // rs-sdk: default to 8888 on all platforms (avoids needing root for port 80)
            allowedOrigin: '',
            managementPort: 8898
        },
        engine: {
            revision: 274
        },
        node: {
            id: 10,
            port: 43594,
            members: true,
            autoSubscribeMembers: true,
            xpRate: 25, // rs-sdk: accelerated XP for botting (matches prior 254 default)
            production: false,
            minimumWealthValueEvent: 10,
            debug: true,
            debugProfile: false,
            clientRoutefinder: true,
            profile: 'main',
            maxConnected: 1000,
            debugProcChar: '~',
            hopTime: 45000,
            rateLimitAddressLogin: 30,
            rateLimitDeviceLogin: 5
        },
        login: {
            enabled: false,
            host: 'localhost',
            port: 43500
        },
        friend: {
            enabled: false,
            host: 'localhost',
            port: 45099
        },
        logger: {
            enabled: false,
            host: 'localhost',
            port: 43501
        },
        db: {
            backend: 'sqlite',
            host: 'localhost',
            port: 3306,
            user: 'root',
            pass: 'password',
            name: 'lostcity',
            verbose: false
        },
        build: {
            verbose: false,
            startup: false,
            verify: true,
            verifyFolder: true,
            verifyPack: true,
            liveReload: true,
            srcDir: '../content'
        }
    };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeConfig<T>(defaults: T, value: unknown): T {
    if (isObject(defaults)) {
        const result: Record<string, unknown> = {};
        const parsed = isObject(value) ? value : {};

        for (const [key, defaultValue] of Object.entries(defaults)) {
            result[key] = mergeConfig(defaultValue, parsed[key]);
        }

        return result as T;
    }

    if (typeof defaults === 'boolean') {
        return tryParseBoolean(value as string | boolean | undefined | null, defaults) as T;
    }

    if (typeof defaults === 'number') {
        return tryParseInt(value as string | number | undefined | null, defaults) as T;
    }

    if (typeof defaults === 'string') {
        return tryParseString(value as string | undefined | null, defaults) as T;
    }

    return defaults;
}

export function normalizeWorldConfig(value: unknown): WorldConfig {
    const config = mergeConfig(createDefaultWorldConfig(), value);

    // Legacy compatibility: accept db.kyselyVerbose from older world.json files.
    if (isObject(value) && isObject(value.db) && !('verbose' in value.db)) {
        config.db.verbose = tryParseBoolean((value.db as Record<string, unknown>).kyselyVerbose as string | boolean | undefined | null, config.db.verbose);
    }

    return config;
}

function parseLegacyEnvFile(filePath: string): Record<string, string> {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const env: Record<string, string> = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#')) {
            continue;
        }

        const equals = trimmed.indexOf('=');
        if (equals === -1) {
            continue;
        }

        const rawKey = trimmed
            .slice(0, equals)
            .trim()
            .replace(/^export\s+/, '');
        const rawValue = trimmed.slice(equals + 1).trim();

        let value = rawValue;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        env[rawKey] = value;
    }

    return env;
}

export function migrateFromLegacyEnv(defaults: WorldConfig, env: Record<string, string>): WorldConfig {
    const config = structuredClone(defaults);

    config.easyStartup = tryParseBoolean(env.EASY_STARTUP, config.easyStartup);
    config.website.registration = tryParseBoolean(env.WEBSITE_REGISTRATION, config.website.registration);

    config.web.port = tryParseInt(env.WEB_PORT, config.web.port);
    config.web.allowedOrigin = tryParseString(env.WEB_ALLOWED_ORIGIN, config.web.allowedOrigin);
    config.web.managementPort = tryParseInt(env.WEB_MANAGEMENT_PORT, config.web.managementPort);

    config.engine.revision = tryParseInt(env.ENGINE_REVISION, config.engine.revision);

    config.node.id = tryParseInt(env.NODE_ID, config.node.id);
    config.node.port = tryParseInt(env.NODE_PORT, config.node.port);
    config.node.members = tryParseBoolean(env.NODE_MEMBERS, config.node.members);
    config.node.autoSubscribeMembers = tryParseBoolean(env.NODE_AUTO_SUBSCRIBE_MEMBERS, config.node.autoSubscribeMembers);
    config.node.xpRate = tryParseInt(env.NODE_XPRATE, config.node.xpRate);
    config.node.production = tryParseBoolean(env.NODE_PRODUCTION, config.node.production);
    config.node.minimumWealthValueEvent = tryParseInt(env.NODE_MINIMUM_WEALTH_VALUE_EVENT, config.node.minimumWealthValueEvent);
    config.node.debug = tryParseBoolean(env.NODE_DEBUG, config.node.debug);
    config.node.debugProfile = tryParseBoolean(env.NODE_DEBUG_PROFILE, config.node.debugProfile);
    config.node.clientRoutefinder = tryParseBoolean(env.NODE_CLIENT_ROUTEFINDER, config.node.clientRoutefinder);
    config.node.profile = tryParseString(env.NODE_PROFILE, config.node.profile);
    config.node.maxConnected = tryParseInt(env.NODE_MAX_CONNECTED, config.node.maxConnected);
    config.node.debugProcChar = tryParseString(env.NODE_DEBUGPROC_CHAR, config.node.debugProcChar);
    config.node.hopTime = tryParseInt(env.NODE_HOP_TIME, tryParseInt(env.NODE_MAX_NPCS, config.node.hopTime));
    config.node.rateLimitAddressLogin = tryParseInt(env.NODE_RATELIMIT_ADDRESS_LOGIN, config.node.rateLimitAddressLogin);
    config.node.rateLimitDeviceLogin = tryParseInt(env.NODE_RATELIMIT_DEVICE_LOGIN, config.node.rateLimitDeviceLogin);

    config.login.enabled = tryParseBoolean(env.LOGIN_SERVER, config.login.enabled);
    config.login.host = tryParseString(env.LOGIN_HOST, config.login.host);
    config.login.port = tryParseInt(env.LOGIN_PORT, config.login.port);

    config.friend.enabled = tryParseBoolean(env.FRIEND_SERVER, config.friend.enabled);
    config.friend.host = tryParseString(env.FRIEND_HOST, config.friend.host);
    config.friend.port = tryParseInt(env.FRIEND_PORT, config.friend.port);

    config.logger.enabled = tryParseBoolean(env.LOGGER_SERVER, config.logger.enabled);
    config.logger.host = tryParseString(env.LOGGER_HOST, config.logger.host);
    config.logger.port = tryParseInt(env.LOGGER_PORT, config.logger.port);

    config.db.backend = tryParseString(env.DB_BACKEND, config.db.backend);
    config.db.host = tryParseString(env.DB_HOST, config.db.host);
    config.db.port = tryParseInt(env.DB_PORT, config.db.port);
    config.db.user = tryParseString(env.DB_USER, config.db.user);
    config.db.pass = tryParseString(env.DB_PASS, config.db.pass);
    config.db.name = tryParseString(env.DB_NAME, config.db.name);
    config.db.verbose = tryParseBoolean(env.KYSELY_VERBOSE, config.db.verbose);

    config.build.verbose = tryParseBoolean(env.BUILD_VERBOSE, config.build.verbose);
    config.build.startup = tryParseBoolean(env.BUILD_STARTUP, config.build.startup);
    config.build.verify = tryParseBoolean(env.BUILD_VERIFY, config.build.verify);
    config.build.verifyFolder = tryParseBoolean(env.BUILD_VERIFY_FOLDER, config.build.verifyFolder);
    config.build.verifyPack = tryParseBoolean(env.BUILD_VERIFY_PACK, config.build.verifyPack);
    config.build.liveReload = tryParseBoolean(env.BUILD_LIVE_RELOAD, config.build.liveReload);
    config.build.srcDir = tryParseString(env.BUILD_SRC_DIR, config.build.srcDir);

    return config;
}

export function saveWorldConfig(config: WorldConfig) {
    fs.mkdirSync(path.dirname(worldConfigPath), { recursive: true });
    fs.writeFileSync(worldConfigPath, JSON.stringify(config, null, 4) + '\n');
}

export function getDatabaseUrl(config: WorldConfig): string {
    const user = encodeURIComponent(config.db.user);
    const pass = encodeURIComponent(config.db.pass);
    return `mysql://${user}:${pass}@${config.db.host}:${config.db.port}/${config.db.name}`;
}

export function loadWorldConfig(): WorldConfig {
    const defaults = createDefaultWorldConfig();

    if (fs.existsSync(worldConfigPath)) {
        try {
            const raw = fs.readFileSync(worldConfigPath, 'utf8');
            const parsed = JSON.parse(raw);
            return normalizeWorldConfig(parsed);
        } catch (error) {
            if (error instanceof Error) {
                console.warn(`[Config] Failed to parse ${worldConfigPath}: ${error.message}. Using defaults.`);
            } else {
                console.warn(`[Config] Failed to parse ${worldConfigPath}. Using defaults.`);
            }

            return defaults;
        }
    }

    if (fs.existsSync(legacyEnvPath)) {
        try {
            const env = parseLegacyEnvFile(legacyEnvPath);
            const migrated = migrateFromLegacyEnv(defaults, env);
            saveWorldConfig(migrated);
            return migrated;
        } catch (error) {
            if (error instanceof Error) {
                console.warn(`[Config] Failed to migrate ${legacyEnvPath}: ${error.message}. Using defaults.`);
            } else {
                console.warn(`[Config] Failed to migrate ${legacyEnvPath}. Using defaults.`);
            }

            return defaults;
        }
    }

    return defaults;
}
