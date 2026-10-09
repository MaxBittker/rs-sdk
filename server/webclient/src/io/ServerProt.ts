export const enum ServerProt {
    // interfaces
    IF_OPENCHAT = 81,
    IF_OPENMAIN_SIDE = 55,
    IF_CLOSE = 23,
    IF_SETICON = 63,
    IF_SHOWICON = 189,
    IF_OPENMAIN = 119,
    IF_OPENSIDE = 252,
    IF_OPENOVERLAY = 127,

    // updating interfaces
    IF_SETCOLOUR = 160,
    IF_SETHIDE = 138,
    IF_SETOBJECT = 18,
    IF_SETMODEL = 222,
    IF_SETANIM = 211,
    IF_SETPLAYERHEAD = 30,
    IF_SETTEXT = 59,
    IF_SETNPCHEAD = 244,
    IF_SETPOSITION = 79,
    IF_SETSCROLLPOS = 184,

    // tutorial area
    TUT_FLASH = 181,
    TUT_OPEN = 12,

    // inventory
    UPDATE_INV_STOP_TRANSMIT = 28,
    UPDATE_INV_FULL = 107,
    UPDATE_INV_PARTIAL = 76,

    // camera control
    CAM_LOOKAT = 82,
    CAM_SHAKE = 208,
    CAM_MOVETO = 73,
    CAM_RESET = 133,

    // entity updates
    NPC_INFO = 65,
    PLAYER_INFO = 188,

    // social
    FRIENDLIST_LOADED = 235,
    MESSAGE_GAME = 196,
    UPDATE_IGNORELIST = 47,
    CHAT_FILTER_SETTINGS = 13,
    MESSAGE_PRIVATE = 243,
    MESSAGE_PUBLIC = 255, // rs-sdk: out-of-visual-range public chat broadcast (matches engine ServerGameProt; 255 is free in 289)
    UPDATE_FRIENDLIST = 168,

    // misc
    UNSET_MAP_FLAG = 164,
    UPDATE_RUNWEIGHT = 46,
    HINT_ARROW = 115,
    UPDATE_REBOOT_TIMER = 204,
    UPDATE_STAT = 154,
    UPDATE_RUNENERGY = 195,
    RESET_ANIMS = 201,
    UPDATE_PID = 120,
    LAST_LOGIN_INFO = 253,
    LOGOUT = 121,
    P_COUNTDIALOG = 35,
    SET_MULTIWAY = 247,
    SET_PLAYER_OP = 21,
    MINIMAP_TOGGLE = 136,

    // maps
    REBUILD_NORMAL = 219,

    // vars
    VARP_SMALL = 75,
    VARP_LARGE = 97,
    VARP_SYNC = 172,

    // audio
    SYNTH_SOUND = 177,
    MIDI_SONG = 187,
    MIDI_JINGLE = 29,

    // zones
    UPDATE_ZONE_PARTIAL_FOLLOWS = 155,
    UPDATE_ZONE_FULL_FOLLOWS = 144,
    UPDATE_ZONE_PARTIAL_ENCLOSED = 112,

    // zone protocol
    P_LOCMERGE = 83,
    LOC_ANIM = 106,
    OBJ_DEL = 71,
    OBJ_REVEAL = 176,
    LOC_ADD_CHANGE = 90,
    MAP_PROJANIM = 87,
    LOC_DEL = 194,
    OBJ_COUNT = 117,
    MAP_ANIM = 233,
    OBJ_ADD = 60
};

// prettier-ignore
export const ServerProtSizes = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 2, 3, 0, 0, 0, 0, 6, 0,
    0, -1, 0, 0, 0, 0, 0, 0, 2, 4,
    2, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 2, -2, 0, 0,
    0, 0, 0, 0, 0, 4, 0, 0, 0, -2,
    5, 0, 0, 3, 0, -2, 0, 0, 0, 0,
    0, 3, 0, 6, 0, 3, -2, 0, 0, 6,
    0, 2, 6, 14, 0, 0, 0, 15, 0, 0,
    4, 4, 0, 0, 0, 0, 0, 6, 0, 0,
    0, 0, 0, 0, 0, 0, 4, -2, 0, 0,
    0, 0, -2, 0, 0, 6, 0, 7, 0, 2,
    3, 0, 6, 0, 0, 0, 0, 2, 0, 0,
    0, 0, 0, 0, 0, 0, 1, 0, 3, 0,
    0, 0, 0, 0, 2, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 6, 2, 0, 0, 0, 0,
    4, 0, 0, 0, 0, 0, 0, 0, 9, 0,
    0, 0, 0, 0, 0, 0, 7, 5, 0, 0,
    0, 1, 0, 0, 4, 0, 0, 2, -2, 1,
    0, 0, 0, 0, 2, 1, -1, 0, 0, 0,
    0, 0, 0, 0, 2, 0, 0, 0, 4, 0,
    0, 4, 0, 0, 0, 0, 0, 0, 0, 4,
    0, 0, 4, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 6, 0, 1, 0, 0, 0, 0,
    0, 0, 0, -1, 4, 0, 0, 1, 0, 0,
    // rs-sdk: index 255 = -1 (MESSAGE_PUBLIC, variable-length)
    0, 0, 2, 10, 0, -1, 0
];
