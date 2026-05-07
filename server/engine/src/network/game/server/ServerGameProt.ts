export default class ServerGameProt {
    // interfaces
    static readonly IF_OPENCHAT = new ServerGameProt(141, 2);
    static readonly IF_OPENMAIN_SIDE = new ServerGameProt(249, 4);
    static readonly IF_CLOSE = new ServerGameProt(174, 0);
    static readonly IF_SETTAB = new ServerGameProt(91, 3);
    static readonly IF_SETTAB_ACTIVE = new ServerGameProt(138, 1);
    static readonly IF_OPENMAIN = new ServerGameProt(197, 2);
    static readonly IF_OPENSIDE = new ServerGameProt(187, 2);
    static readonly IF_OPENOVERLAY = new ServerGameProt(85, 2);

    // updating interfaces
    static readonly IF_SETCOLOUR = new ServerGameProt(38, 4); // NXT naming
    static readonly IF_SETHIDE = new ServerGameProt(227, 3); // NXT naming
    static readonly IF_SETOBJECT = new ServerGameProt(222, 6); // NXT naming
    static readonly IF_SETMODEL = new ServerGameProt(211, 4); // NXT naming
    static readonly IF_SETANIM = new ServerGameProt(95, 4); // NXT naming
    static readonly IF_SETPLAYERHEAD = new ServerGameProt(161, 2); // NXT naming
    static readonly IF_SETTEXT = new ServerGameProt(41, -2); // NXT naming
    static readonly IF_SETNPCHEAD = new ServerGameProt(3, 4); // NXT naming
    static readonly IF_SETPOSITION = new ServerGameProt(27, 6); // NXT naming
    static readonly IF_SETSCROLLPOS = new ServerGameProt(14, 4); // NXT naming

    // tutorial area
    static readonly TUT_FLASH = new ServerGameProt(58, 1);
    static readonly TUT_OPEN = new ServerGameProt(239, 2);

    // inventory
    static readonly UPDATE_INV_STOP_TRANSMIT = new ServerGameProt(168, 2); // NXT naming
    static readonly UPDATE_INV_FULL = new ServerGameProt(28, -2); // NXT naming
    static readonly UPDATE_INV_PARTIAL = new ServerGameProt(170, -2); // NXT naming

    // camera control
    static readonly CAM_LOOKAT = new ServerGameProt(0, 6); // NXT naming
    static readonly CAM_SHAKE = new ServerGameProt(225, 4); // NXT naming
    static readonly CAM_MOVETO = new ServerGameProt(55, 6); // NXT naming
    static readonly CAM_RESET = new ServerGameProt(167, 0); // NXT naming

    // entity updates
    static readonly NPC_INFO = new ServerGameProt(123, -2); // NXT naming
    static readonly PLAYER_INFO = new ServerGameProt(87, -2); // NXT naming

    // input tracking
    static readonly FINISH_TRACKING = new ServerGameProt(29, 0);
    static readonly ENABLE_TRACKING = new ServerGameProt(251, 0);

    // social
    static readonly FRIENDLIST_LOADED = new ServerGameProt(255, 1); // NXT naming
    static readonly MESSAGE_GAME = new ServerGameProt(73, -1); // NXT naming
    static readonly UPDATE_IGNORELIST = new ServerGameProt(63, -2); // NXT naming
    static readonly CHAT_FILTER_SETTINGS = new ServerGameProt(24, 3); // NXT naming
    static readonly MESSAGE_PRIVATE = new ServerGameProt(60, -1); // NXT naming
    static readonly MESSAGE_PUBLIC = new ServerGameProt(81, -1); // server-side broadcast of public chat (out-of-visual-range)
    static readonly UPDATE_FRIENDLIST = new ServerGameProt(111, 9); // NXT naming

    // misc
    static readonly UNSET_MAP_FLAG = new ServerGameProt(108, 0); // NXT has "SET_MAP_FLAG" but we cannot control the position
    static readonly UPDATE_RUNWEIGHT = new ServerGameProt(164, 2); // NXT naming
    static readonly HINT_ARROW = new ServerGameProt(64, 6); // NXT naming
    static readonly UPDATE_REBOOT_TIMER = new ServerGameProt(143, 2); // NXT naming
    static readonly UPDATE_STAT = new ServerGameProt(136, 6); // NXT naming
    static readonly UPDATE_RUNENERGY = new ServerGameProt(94, 1); // NXT naming
    static readonly RESET_ANIMS = new ServerGameProt(203, 0); // NXT naming
    static readonly UPDATE_PID = new ServerGameProt(213, 3);
    static readonly LAST_LOGIN_INFO = new ServerGameProt(146, 10); // NXT naming
    static readonly LOGOUT = new ServerGameProt(21, 0); // NXT naming
    static readonly P_COUNTDIALOG = new ServerGameProt(5, 0); // named after runescript command + client resume_p_countdialog packet
    static readonly SET_MULTIWAY = new ServerGameProt(75, 1);
    static readonly SET_PLAYER_OP = new ServerGameProt(204, -1);

    // maps
    static readonly REBUILD_NORMAL = new ServerGameProt(209, 4); // NXT naming (do we really need _normal if there's no region rebuild?)

    // vars
    static readonly VARP_SMALL = new ServerGameProt(186, 3); // NXT naming
    static readonly VARP_LARGE = new ServerGameProt(196, 6); // NXT naming
    static readonly RESET_CLIENT_VARCACHE = new ServerGameProt(140, 0); // NXT naming

    // audio
    static readonly SYNTH_SOUND = new ServerGameProt(25, 5); // NXT naming
    static readonly MIDI_SONG = new ServerGameProt(163, 2); // NXT naming
    static readonly MIDI_JINGLE = new ServerGameProt(242, 4); // NXT naming

    // zones
    static readonly UPDATE_ZONE_PARTIAL_FOLLOWS = new ServerGameProt(173, 2); // NXT naming
    static readonly UPDATE_ZONE_FULL_FOLLOWS = new ServerGameProt(159, 2); // NXT naming
    static readonly UPDATE_ZONE_PARTIAL_ENCLOSED = new ServerGameProt(61, -2); // NXT naming

    constructor(
        readonly id: number,
        readonly length: number
    ) {}
}
