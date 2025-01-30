import 'dotenv/config';
import { tryParseArray, tryParseBoolean, tryParseInt, tryParseString } from '#/util/TryParse.js';
import WalkTriggerSetting from '#/util/WalkTriggerSetting.js';

export default {
    EASY_STARTUP: tryParseBoolean(process.env.EASY_STARTUP, false),
    WEBSITE_REGISTRATION: tryParseBoolean(process.env.WEBSITE_REGISTRATION, false),

    // bundler/webrtc browser mode
    STANDALONE_BUNDLE: tryParseBoolean(process.env.STANDALONE_BUNDLE, false),

    /// web server
    WEB_PORT: tryParseInt(process.env.WEB_PORT, process.platform === 'win32' || process.platform === 'darwin' ? 80 : 8888),

    // management server
    WEB_MANAGEMENT_PORT: tryParseInt(process.env.WEB_MANAGEMENT_PORT, 8898),

    /// game server
    // world id - offset by 9, so 1 = 10, 2 = 11, etc
    NODE_ID: tryParseInt(process.env.NODE_ID, 10),
    NODE_PORT: tryParseInt(process.env.NODE_PORT, 43594),
    // members content
    NODE_MEMBERS: tryParseBoolean(process.env.NODE_MEMBERS, true),
    // addxp multiplier
    NODE_XPRATE: tryParseInt(process.env.NODE_XPRATE, 1),
    // production mode!
    NODE_PRODUCTION: tryParseBoolean(process.env.NODE_PRODUCTION, false),
    // automatic shutdown time for production mode on sigint
    NODE_KILLTIMER: tryParseInt(process.env.NODE_KILLTIMER, 500), // 5 minutes
    NODE_ALLOW_CHEATS: tryParseBoolean(process.env.NODE_ALLOW_CHEATS, true),
    // extra debug info e.g. missing triggers
    NODE_DEBUG: tryParseBoolean(process.env.NODE_DEBUG, true),
    // measuring script execution
    NODE_DEBUG_PROFILE: tryParseBoolean(process.env.NODE_DEBUG_PROFILE, false),
    // doing headless bot testing!
    NODE_DEBUG_SOCKET: tryParseBoolean(process.env.NODE_DEBUG_SOCKET, false),
    // *only* if no login server is running to authenticate accounts, this provides admin accs by username :)
    NODE_STAFF: tryParseArray(process.env.NODE_STAFF?.split(','), ['pazaz']),
    // no server routefinding until 2009
    NODE_CLIENT_ROUTEFINDER: tryParseBoolean(process.env.NODE_CLIENT_ROUTEFINDER, true),
    // yellow-x walktriggers in osrs went from: in packet handler -> in player setup -> player movement
    // 0 = processed in packet handler. 1 = processed in player setup (client input). 2 = processed in player movement
    NODE_WALKTRIGGER_SETTING: tryParseInt(process.env.NODE_WALKTRIGGER_SETTING, WalkTriggerSetting.PLAYERPACKET),
    // separate save folder
    NODE_PROFILE: tryParseString(process.env.NODE_PROFILE, 'main'),
    // entities cap
    NODE_MAX_PLAYERS: tryParseInt(process.env.NODE_MAX_PLAYERS, 2047),
    NODE_MAX_NPCS: tryParseInt(process.env.NODE_MAX_NPCS, 8191),

    /// login server
    LOGIN_SERVER: tryParseBoolean(process.env.LOGIN_SERVER, false),
    LOGIN_HOST: tryParseString(process.env.LOGIN_HOST, 'localhost'),
    LOGIN_PORT: tryParseInt(process.env.LOGIN_PORT, 43500),

    /// friends server
    FRIEND_SERVER: tryParseBoolean(process.env.FRIEND_SERVER, false),
    FRIEND_HOST: tryParseString(process.env.FRIEND_HOST, 'localhost'),
    FRIEND_PORT: tryParseInt(process.env.FRIEND_PORT, 45099),

    /// logger server
    LOGGER_SERVER: tryParseBoolean(process.env.LOGGER_SERVER, false),
    LOGGER_HOST: tryParseString(process.env.LOGGER_HOST, 'localhost'),
    LOGGER_PORT: tryParseInt(process.env.LOGGER_PORT, 43501),

    /// database
    DB_BACKEND: tryParseString(process.env.DB_BACKEND, 'sqlite'),
    DB_HOST: tryParseString(process.env.DB_HOST, 'localhost'),
    DB_PORT: tryParseInt(process.env.DB_PORT, 3306),
    DB_USER: tryParseString(process.env.DB_USER, 'root'),
    DB_PASS: tryParseString(process.env.DB_PASS, 'password'),
    DB_NAME: tryParseString(process.env.DB_NAME, 'lostcity'),

    /// development
    // some users may not be able to change their system PATH for this project
    BUILD_JAVA_PATH: tryParseString(process.env.BUILD_JAVA_PATH, 'java'),
    // auto-build on startup
    BUILD_STARTUP: tryParseBoolean(process.env.BUILD_STARTUP, true),
    // auto-update compiler on startup
    BUILD_STARTUP_UPDATE: tryParseBoolean(process.env.BUILD_STARTUP_UPDATE, true),
    // used to check if we're producing the original cache without edits
    BUILD_VERIFY: tryParseBoolean(process.env.BUILD_VERIFY, true),
    // used to keep some semblance of sanity in our folder structure
    BUILD_VERIFY_FOLDER: tryParseBoolean(process.env.BUILD_VERIFY_FOLDER, true),
    // used for unpacking/custom development
    BUILD_VERIFY_PACK: tryParseBoolean(process.env.BUILD_VERIFY_PACK, true),
    // used for unpacking/custom development
    BUILD_SRC_DIR: tryParseString(process.env.BUILD_SRC_DIR, 'data/src'),
};
