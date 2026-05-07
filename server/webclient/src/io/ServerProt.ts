export const enum ServerProt {
    // interfaces
    IF_OPENCHAT = 141,
    IF_OPENMAIN_SIDE = 249,
    IF_CLOSE = 174,
    IF_SETTAB = 91,
    IF_OPENMAIN = 197,
    IF_OPENSIDE = 187,
    IF_SETTAB_ACTIVE = 138,
    IF_OPENOVERLAY = 85,

    // updating interfaces
    IF_SETCOLOUR = 38,
    IF_SETHIDE = 227,
    IF_SETOBJECT = 222,
    IF_SETMODEL = 211,
    IF_SETANIM = 95,
    IF_SETPLAYERHEAD = 161,
    IF_SETTEXT = 41,
    IF_SETNPCHEAD = 3,
    IF_SETPOSITION = 27,
    IF_SETSCROLLPOS = 14,

    // tutorial area
    TUT_FLASH = 58,
    TUT_OPEN = 239,

    // inventory
    UPDATE_INV_STOP_TRANSMIT = 168,
    UPDATE_INV_FULL = 28,
    UPDATE_INV_PARTIAL = 170,

    // camera control
    CAM_LOOKAT = 0,
    CAM_SHAKE = 225,
    CAM_MOVETO = 55,
    CAM_RESET = 167,

    // entity updates
    NPC_INFO = 123,
    PLAYER_INFO = 87,

    // input tracking
    FINISH_TRACKING = 29,
    ENABLE_TRACKING = 251,

    // social
    MESSAGE_GAME = 73,
    UPDATE_IGNORELIST = 63,
    CHAT_FILTER_SETTINGS = 24,
    MESSAGE_PRIVATE = 60,
    MESSAGE_PUBLIC = 81,
    UPDATE_FRIENDLIST = 111,
    FRIENDLIST_LOADED = 255,

    // misc
    UNSET_MAP_FLAG = 108,
    UPDATE_RUNWEIGHT = 164,
    HINT_ARROW = 64,
    UPDATE_REBOOT_TIMER = 143,
    UPDATE_STAT = 136,
    UPDATE_RUNENERGY = 94,
    RESET_ANIMS = 203,
    UPDATE_PID = 213,
    LAST_LOGIN_INFO = 146,
    LOGOUT = 21,
    P_COUNTDIALOG = 5,
    SET_MULTIWAY = 75,
    SET_PLAYER_OP = 204,

    // maps
    REBUILD_NORMAL = 209,

    // vars
    VARP_SMALL = 186,
    VARP_LARGE = 196,
    VARP_SYNC = 140,

    // audio
    SYNTH_SOUND = 25,
    MIDI_SONG = 163,
    MIDI_JINGLE = 242,

    // zones
    UPDATE_ZONE_PARTIAL_FOLLOWS = 173,
    UPDATE_ZONE_FULL_FOLLOWS = 159,
    UPDATE_ZONE_PARTIAL_ENCLOSED = 61,

    // zone protocol
    P_LOCMERGE = 218,
    LOC_ANIM = 30,
    OBJ_DEL = 115,
    OBJ_REVEAL = 8,
    LOC_ADD_CHANGE = 70,
    MAP_PROJANIM = 37,
    LOC_DEL = 88,
    OBJ_COUNT = 98,
    MAP_ANIM = 114,
    OBJ_ADD = 120
};

// prettier-ignore
export const ServerProtSizes = [
    6, 0, 0, 4, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 4, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 3, 5, 0, 6, -2, 0, 4, 0,
    0, 0, 0, 0, 0, 15, 4, 0, 0, -2, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 1, 0, -1, -2, 0, -2,
    6, 0, 0, 0, 0, 0, 4, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0,
    -1, 0, 0, 0, 2, 0, -2, 2, 0, 0, 3, 0, 0, 1, 4, 0, 0,
    7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 6, 3,
    0, 0, 0, 0, 5, 0, 0, -2, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0,
    0, 0, 6, 0, 1, 0, 0, 2, 0, 2, 0, 0, 10, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 2, 0, 0, 0, 2, 0,
    -2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2,
    0, 0, 0, 0, 0, 0, 0, 0, 6, 2, 0, 0, 0, 0, 0, 0, -1, 0,
    0, 0, 0, 4, 0, 4, 0, 3, 0, 0, 0, 0, 14, 0, 0, 0, 6, 0,
    0, 4, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0,
    4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 1, 0
];
