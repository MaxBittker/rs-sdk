export const enum ServerProt {
    // interfaces
    IF_OPENCHAT = 166,
    IF_OPENMAIN_SIDE = 158,
    IF_CLOSE = 171,
    IF_SETICON = 215,
    IF_SHOWICON = 241,
    IF_OPENMAIN = 211,
    IF_OPENSIDE = 16,
    IF_OPENOVERLAY = 240,

    // updating interfaces
    IF_SETCOLOUR = 183,
    IF_SETHIDE = 10,
    IF_SETOBJECT = 28,
    IF_SETMODEL = 129,
    IF_SETANIM = 134,
    IF_SETPLAYERHEAD = 192,
    IF_SETTEXT = 44,
    IF_SETNPCHEAD = 142,
    IF_SETPOSITION = 77,
    IF_SETSCROLLPOS = 54,

    // tutorial area
    TUT_FLASH = 90,
    TUT_OPEN = 130,

    // inventory
    UPDATE_INV_STOP_TRANSMIT = 227,
    UPDATE_INV_FULL = 106,
    UPDATE_INV_PARTIAL = 172,

    // camera control
    CAM_LOOKAT = 233,
    CAM_SHAKE = 64,
    CAM_MOVETO = 200,
    CAM_RESET = 101,

    // entity updates
    NPC_INFO = 197,
    PLAYER_INFO = 167,

    // social
    FRIENDLIST_LOADED = 185,
    MESSAGE_GAME = 161,
    UPDATE_IGNORELIST = 3,
    CHAT_FILTER_SETTINGS = 114,
    MESSAGE_PRIVATE = 235,
    MESSAGE_PUBLIC = 255, // rs-sdk: out-of-visual-range public chat broadcast (matches engine ServerGameProt; 255 is free in 274)
    UPDATE_FRIENDLIST = 247,

    // misc
    UNSET_MAP_FLAG = 115,
    UPDATE_RUNWEIGHT = 67,
    HINT_ARROW = 156,
    UPDATE_REBOOT_TIMER = 89,
    UPDATE_STAT = 105,
    UPDATE_RUNENERGY = 83,
    RESET_ANIMS = 47,
    UPDATE_PID = 133,
    LAST_LOGIN_INFO = 91,
    LOGOUT = 88,
    P_COUNTDIALOG = 210,
    SET_MULTIWAY = 207,
    SET_PLAYER_OP = 17,
    MINIMAP_TOGGLE = 194,

    // maps
    REBUILD_NORMAL = 231,

    // vars
    VARP_SMALL = 203,
    VARP_LARGE = 245,
    VARP_SYNC = 190,

    // audio
    SYNTH_SOUND = 34,
    MIDI_SONG = 23,
    MIDI_JINGLE = 15,

    // zones
    UPDATE_ZONE_PARTIAL_FOLLOWS = 32,
    UPDATE_ZONE_FULL_FOLLOWS = 153,
    UPDATE_ZONE_PARTIAL_ENCLOSED = 195,

    // zone protocol
    P_LOCMERGE = 176,
    LOC_ANIM = 48,
    OBJ_DEL = 52,
    OBJ_REVEAL = 219,
    LOC_ADD_CHANGE = 138,
    MAP_PROJANIM = 107,
    LOC_DEL = 173,
    OBJ_COUNT = 95,
    MAP_ANIM = 85,
    OBJ_ADD = 81
};

// prettier-ignore
export const ServerProtSizes = [
    0, 0, 0, -2, 0, 0, 0, 0, 0, 0,
    3, 0, 0, 0, 0, 4, 2, -1, 0, 0,
    0, 0, 0, 2, 0, 0, 0, 0, 6, 0,
    0, 0, 2, 0, 5, 0, 0, 0, 0, 0,
    0, 0, 0, 0, -2, 0, 0, 0, 4, 0,
    0, 0, 3, 0, 4, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 4, 0, 0, 2, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 6, 0, 0,
    0, 5, 0, 1, 0, 6, 0, 0, 0, 2,
    1, 10, 0, 0, 0, 7, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 6, -2, 15, 0, 0,
    0, 0, 0, 0, 3, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 6, 0, 0, 0, 4,
    2, 0, 0, 3, 4, 0, 0, 0, 4, 0,
    0, 0, 4, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 2, 0, 0, 6, 0, 4, 0,
    0, -1, 0, 0, 0, 0, 2, -2, 0, 0,
    0, 0, -2, 2, 0, 0, 14, 0, 0, 0,
    0, 0, 0, 4, 0, 1, 0, 0, 0, 0,
    0, 0, 2, 0, 1, -2, 0, -2, 0, 0,
    6, 0, 0, 3, 0, 0, 0, 1, 0, 0,
    0, 2, 0, 0, 0, 3, 0, 0, 0, 7,
    0, 0, 0, 0, 0, 0, 0, 2, 0, 0,
    0, 4, 0, 6, 0, -1, 0, 0, 0, 0,
    2, 1, 0, 0, 0, 6, 0, 9, 0, 0,
    // rs-sdk: index 255 = -1 (MESSAGE_PUBLIC, variable-length)
    0, 0, 0, 0, 0, -1, 0
];
