enum ScriptOpcode {
    // Core language ops (0-99)
    PUSH_CONSTANT_INT = 0, // official, see cs2
    PUSH_VARP, // official, see cs2
    POP_VARP, // official, see cs2
    PUSH_CONSTANT_STRING, // official, see cs2
    PUSH_VARN,
    POP_VARN,
    BRANCH, // official, see cs2
    BRANCH_NOT, // official, see cs2
    BRANCH_EQUALS, // official, see cs2
    BRANCH_LESS_THAN, // official, see cs2
    BRANCH_GREATER_THAN, // official, see cs2
    PUSH_VARS,
    POP_VARS,
    RETURN = 21, // official, see cs2
    GOSUB,
    JUMP,
    SWITCH,
    // 25 = push_varbit
    // 27 = pop_varbit
    BRANCH_LESS_THAN_OR_EQUALS = 31, // official, see cs2
    BRANCH_GREATER_THAN_OR_EQUALS, // official, see cs2
    PUSH_INT_LOCAL, // official, see cs2
    POP_INT_LOCAL, // official, see cs2
    PUSH_STRING_LOCAL, // official, see cs2
    POP_STRING_LOCAL, // official, see cs2
    JOIN_STRING, // official, see cs2
    POP_INT_DISCARD, // official, see cs2
    POP_STRING_DISCARD, // official, see cs2
    GOSUB_WITH_PARAMS, // official, see cs2
    JUMP_WITH_PARAMS, // official, see cs2
    // 42 = push_varc_int
    // 43 = pop_varc_int
    DEFINE_ARRAY = 44, // official, see cs2
    PUSH_ARRAY_INT, // official, see cs2
    POP_ARRAY_INT, // official, see cs2

    // Server ops (1000-1999)
    COORDX = 1000, // official, see cs2
    COORDY, // official, see cs2
    COORDZ, // official, see cs2
    DISTANCE,
    HUNTALL,
    HUNTNEXT, // official
    INZONE, // official
    LINEOFSIGHT,
    LINEOFWALK,
    MAP_BLOCKED, // official
    MAP_INDOORS,
    MAP_CLOCK, // official
    MAP_LOCADDUNSAFE, // official
    MAP_MEMBERS, // official
    MAP_PLAYERCOUNT, // official, see giant dwarf cutscene
    MOVECOORD, // official
    PLAYERCOUNT,
    PROJANIM_MAP,
    PROJANIM_NPC, // todo: take active_npc
    PROJANIM_PL, // todo: take active_player
    SEQLENGTH, // official
    SPLIT_GET,
    SPLIT_GETANIM,
    SPLIT_INIT, // official
    SPLIT_LINECOUNT,
    SPLIT_PAGECOUNT, // official
    SPOTANIM_MAP,
    STAT_RANDOM,
    STRUCT_PARAM,
    WORLD_DELAY, // official

    // Player ops (2000-2499)
    ALLOWDESIGN = 2000,
    ANIM, // official, newspost
    BAS_READYANIM,
    BAS_RUNNING,
    BAS_TURNONSPOT,
    BAS_WALK_B,
    BAS_WALK_F,
    BAS_WALK_L,
    BAS_WALK_R,
    BUFFER_FULL, // official
    BUILDAPPEARANCE, // official
    BUSY, // official
    CAM_LOOKAT, // official
    CAM_MOVETO, // official
    CAM_RESET, // official
    CAM_SHAKE, // official, see server packets
    CLEARQUEUE, // official
    CLEARSOFTTIMER,
    CLEARTIMER,
    COORD, // official
    DAMAGE,
    DISPLAYNAME, // official, joke reply
    FACESQUARE, // official
    FINDUID, // official
    GENDER,
    GETQUEUE, // official
    GIVEXP,
    HEADICONS_GET,
    HEADICONS_SET,
    HEALENERGY, // official
    HINT_COORD,
    HINT_NPC, // todo: take active_npc
    HINT_PLAYER, // todo: take active_player
    HINT_STOP,
    IF_CLOSE, // official
    IF_CLOSESTICKY,
    IF_MULTIZONE,
    IF_OPENCHAT,
    IF_OPENCHATSTICKY,
    IF_OPENMAINMODAL,
    IF_OPENMAINMODALSIDEOVERLAY,
    IF_OPENSIDEOVERLAY,
    IF_SETANIM, // official
    IF_SETCOLOUR, // official
    IF_SETHIDE, // official
    IF_SETMODEL, // official
    IF_SETRECOL,
    IF_SETNPCHEAD, // official
    IF_SETOBJECT, // official
    IF_SETPLAYERHEAD, // official
    IF_SETPOSITION, // official
    IF_SETRESUMEBUTTONS,
    IF_SETTAB,
    IF_SETTABACTIVE,
    IF_SETTABFLASH,
    IF_SETTEXT, // official
    LAST_LOGIN_INFO,
    LAST_COM,
    LAST_INT, // official
    LAST_ITEM,
    LAST_SLOT, // official
    LAST_TARGETSLOT,
    LAST_USEITEM, // official
    LAST_USESLOT, // official
    LONGQUEUE, // official
    MES, // official
    MIDI_JINGLE, // official, see cs2
    MIDI_SONG, // official, see cs2
    NAME, // official, joke reply
    P_APRANGE, // official
    P_ARRIVEDELAY, // official
    P_COUNTDIALOG, // official
    P_DELAY, // official
    P_EXACTMOVE, // official
    P_FINDUID, // official
    P_LOCMERGE, // official
    P_LOGOUT,
    P_OPHELD, // official
    P_OPLOC, // official
    P_OPNPC, // official
    P_OPNPCT, // official
    P_OPOBJ,
    P_OPPLAYER,
    P_OPPLAYERT, // official
    P_PAUSEBUTTON, // official
    P_STOPACTION, // official
    P_TELEJUMP, // official
    P_TELEPORT,
    P_WALK, // official
    PLAYER_FINDALLZONE, // todo: replace with huntall
    PLAYER_FINDNEXT, // todo: replace with huntnext
    QUEUE,
    SAY,
    WALKTRIGGER, // official
    SETTIMER,
    SOFTTIMER, // official
    SOUND_SYNTH, // official, newspost
    SPOTANIM_PL,
    STAFFMODLEVEL, // official
    STAT, // official
    STAT_ADD,
    STAT_BASE, // official
    STAT_HEAL, // official
    STAT_SUB,
    STRONGQUEUE,
    UID, // official
    WEAKQUEUE, // official
    IF_OPENMAINOVERLAY,
    AFK_EVENT,
    LOWMEMORY,
    SETIDKIT,
    P_CLEARPENDINGACTION, // official
    GETWALKTRIGGER, // official

    // Npc ops (2500-2999)
    NPC_ADD = 2500, // official
    NPC_ANIM, // official, newspost
    NPC_BASESTAT, // official
    NPC_CATEGORY, // official
    NPC_CHANGETYPE,
    NPC_COORD, // official
    NPC_DAMAGE,
    NPC_DEL, // official
    NPC_DELAY, // official
    NPC_FACESQUARE, // official
    NPC_FINDEXACT, // official
    NPC_FINDHERO, // official
    NPC_FINDALLZONE,
    NPC_FINDNEXT,
    NPC_FINDUID,
    NPC_GETMODE,
    NPC_HEROPOINTS, // official
    NPC_NAME,
    NPC_PARAM, // official
    NPC_QUEUE, // official
    NPC_RANGE, // official
    NPC_SAY, // official
    NPC_SETHUNT, // official
    NPC_SETHUNTMODE, // official
    NPC_SETMODE, // official
    NPC_WALKTRIGGER, // official
    NPC_SETTIMER,
    NPC_STAT,
    NPC_STATADD,
    NPC_STATHEAL, // official
    NPC_STATSUB,
    NPC_TELE,
    NPC_TYPE, // official
    NPC_UID,
    SPOTANIM_NPC,
    NPC_WALK,
    NPC_ATTACKRANGE, // official

    // Loc ops (3000-3499)
    LOC_ADD = 3000, // official
    LOC_ANGLE, // official
    LOC_ANIM, // official
    LOC_CATEGORY, // official
    LOC_CHANGE,
    LOC_COORD, // official
    LOC_DEL, // official
    LOC_FIND, // official
    LOC_FINDALLZONE, // official
    LOC_FINDNEXT, // official
    LOC_NAME,
    LOC_PARAM, // official
    LOC_SHAPE,
    LOC_TYPE, // official

    // Obj ops (3500-4000)
    OBJ_ADD = 3500, // official
    OBJ_ADDALL,
    OBJ_COORD,
    OBJ_COUNT,
    OBJ_DEL,
    OBJ_NAME,
    OBJ_PARAM,
    OBJ_TAKEITEM,
    OBJ_TYPE,

    // Npc config ops (4000-4099)
    NC_CATEGORY = 4000,
    NC_DEBUGNAME,
    NC_DESC,
    NC_NAME,
    NC_OP,
    NC_PARAM,

    // Loc config ops (4100-4199)
    LC_CATEGORY = 4100,
    LC_DEBUGNAME,
    LC_DESC,
    LC_NAME,
    LC_OP,
    LC_PARAM,

    // Obj config ops (4200-4299)
    OC_CATEGORY = 4200, // official
    OC_CERT, // official, see cs2
    OC_COST, // official, see cs2
    OC_DEBUGNAME,
    OC_DESC, // official
    OC_IOP, // official, see cs2
    OC_MEMBERS, // official
    OC_NAME, // official
    OC_OP, // official, see cs2
    OC_PARAM, // official
    OC_STACKABLE, // official, see cs2
    OC_TRADEABLE,
    OC_UNCERT, // official, see cs2
    OC_WEARPOS2,
    OC_WEARPOS3,
    OC_WEARPOS,
    OC_WEIGHT,

    // Inventory ops (4300-4399)
    INV_ALLSTOCK = 4300,
    INV_SIZE, // official
    INV_STOCKBASE,
    INV_ADD, // official
    INV_CHANGESLOT, // official
    INV_CLEAR,
    INV_DEL, // official
    INV_DELSLOT,
    INV_DROPITEM,
    INV_DROPSLOT,
    INV_FREESPACE,
    INV_GETNUM,
    INV_GETOBJ, // official
    INV_ITEMSPACE,
    INV_ITEMSPACE2, // official
    INV_MOVEFROMSLOT,
    INV_MOVETOSLOT, // official
    BOTH_MOVEINV, // official
    INV_MOVEITEM, // official
    INV_MOVEITEM_CERT, // official
    INV_MOVEITEM_UNCERT, // official
    INV_SETSLOT, // official
    INV_TOTAL, // official
    INV_TOTALCAT,
    INV_TRANSMIT,
    INVOTHER_TRANSMIT,
    INV_STOPTRANSMIT,

    // Enum ops (4400-4499)
    ENUM = 4400, // official
    ENUM_GETOUTPUTCOUNT, // official

    // String ops (4500-4599)
    APPEND_NUM = 4500, // official, see cs2
    APPEND, // official, see cs2
    APPEND_SIGNNUM, // official, see cs2
    LOWERCASE, // official, see cs2
    // FROMDATE, // official, see cs2
    TEXT_GENDER, // official, see cs2
    TOSTRING, // official, see cs2
    COMPARE, // official, see cs2
    // PARAHEIGHT, // official, see cs2
    // PARAWIDTH, // official, see cs2
    TEXT_SWITCH, // official, see cs2
    // ESCAPE, // official, see cs2
    APPEND_CHAR, // official, see cs2
    // CHAR_ISPRINTABLE, // official, see cs2
    // CHAR_ISALPHANUMERIC, // official, see cs2
    // CHAR_ISALPHA, // official, see cs2
    // CHAR_ISNUMERIC, // official, see cs2
    STRING_LENGTH, // official, see cs2
    SUBSTRING, // official, see cs2
    // REMOVETAGS, // official, see cs2
    STRING_INDEXOF_CHAR, // official, see cs2
    STRING_INDEXOF_STRING, // official, see cs2
    // CHAR_TOLOWERCASE, // official, see cs2
    // CHAR_TOUPPERCASE, // official, see cs2
    // TOSTRING_LOCALISED, // official, see cs2
    // STRINGWIDTH, // official, see cs2

    // Number ops (4600-4699)
    ADD = 4600, // official, see cs2
    SUB, // official, see cs2
    MULTIPLY, // official, see cs2
    DIVIDE, // official, see cs2
    RANDOM, // official, see cs2
    RANDOMINC, // official, see cs2
    INTERPOLATE, // official, see cs2
    ADDPERCENT, // official, see cs2
    SETBIT, // official, see cs2
    CLEARBIT, // official, see cs2
    TESTBIT, // official, see cs2
    MODULO, // official, see cs2
    POW, // official, see cs2
    INVPOW, // official, see cs2
    AND, // official, see cs2
    OR, // official, see cs2
    MIN, // official, see cs2
    MAX, // official, see cs2
    SCALE, // official, see cs2
    BITCOUNT, // custom
    TOGGLEBIT, // custom
    SETBIT_RANGE, // custom
    CLEARBIT_RANGE, // custom
    GETBIT_RANGE, // custom
    SETBIT_RANGE_TOINT, // custom
    SIN_DEG, // custom
    COS_DEG, // custom
    ATAN2_DEG, // custom
    ABS, // custom

    // DB ops (7500-7599)
    DB_FIND_WITH_COUNT = 7500,
    DB_FINDNEXT,
    DB_GETFIELD,
    DB_GETFIELDCOUNT,
    DB_LISTALL_WITH_COUNT,
    DB_GETROWTABLE,
    DB_FINDBYINDEX,
    DB_FIND_REFINE_WITH_COUNT,
    DB_FIND,
    DB_FIND_REFINE,
    DB_LISTALL,

    // Debug ops (10000-11000)
    ERROR = 10000,
    MAP_LOCALDEV
}

export default ScriptOpcode;
