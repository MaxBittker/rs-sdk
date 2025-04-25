export default class ServerProt {
    // interfaces
    static readonly IF_OPENCHAT = new ServerProt(189, 2);
    static readonly IF_OPENMAIN_SIDE = new ServerProt(207, 4);
    static readonly IF_CLOSE = new ServerProt(214, 0);
    static readonly IF_SETTAB = new ServerProt(200, 3);
    static readonly IF_SETTAB_ACTIVE = new ServerProt(56, 1);
    static readonly IF_OPENMAIN = new ServerProt(10, 2);
    static readonly IF_OPENSIDE = new ServerProt(176, 2);
    static readonly IF_OPENOVERLAY = new ServerProt(158, 2);

    // updating interfaces
    static readonly IF_SETCOLOUR = new ServerProt(78, 4); // NXT naming
    static readonly IF_SETHIDE = new ServerProt(123, 3); // NXT naming
    static readonly IF_SETOBJECT = new ServerProt(164, 6); // NXT naming
    static readonly IF_SETMODEL = new ServerProt(245, 4); // NXT naming
    static readonly IF_SETRECOL = new ServerProt(103, 6); // NXT naming
    static readonly IF_SETANIM = new ServerProt(219, 4); // NXT naming
    static readonly IF_SETPLAYERHEAD = new ServerProt(108, 2); // NXT naming
    static readonly IF_SETTEXT = new ServerProt(154, -2); // NXT naming
    static readonly IF_SETNPCHEAD = new ServerProt(129, 4); // NXT naming
    static readonly IF_SETPOSITION = new ServerProt(241, 6); // NXT naming

    // tutorial area
    static readonly TUT_FLASH = new ServerProt(168, 1);
    static readonly TUT_OPEN = new ServerProt(174, 2);

    // inventory
    static readonly UPDATE_INV_STOP_TRANSMIT = new ServerProt(162, 2); // NXT naming
    static readonly UPDATE_INV_FULL = new ServerProt(72, -2); // NXT naming
    static readonly UPDATE_INV_PARTIAL = new ServerProt(132, -2); // NXT naming

    // camera control
    static readonly CAM_LOOKAT = new ServerProt(222, 6); // NXT naming
    static readonly CAM_SHAKE = new ServerProt(50, 4); // NXT naming
    static readonly CAM_MOVETO = new ServerProt(12, 6); // NXT naming
    static readonly CAM_RESET = new ServerProt(53, 0); // NXT naming

    // entity updates
    static readonly NPC_INFO = new ServerProt(244, -2); // NXT naming
    static readonly PLAYER_INFO = new ServerProt(86, -2); // NXT naming

    // input tracking
    static readonly FINISH_TRACKING = new ServerProt(60, 0);
    static readonly ENABLE_TRACKING = new ServerProt(22, 0);

    // social
    static readonly MESSAGE_GAME = new ServerProt(95, -1); // NXT naming
    static readonly UPDATE_IGNORELIST = new ServerProt(7, -2); // NXT naming
    static readonly CHAT_FILTER_SETTINGS = new ServerProt(9, 3); // NXT naming
    static readonly MESSAGE_PRIVATE = new ServerProt(30, -1); // NXT naming
    static readonly UPDATE_FRIENDLIST = new ServerProt(70, 9); // NXT naming

    // misc
    static readonly UNSET_MAP_FLAG = new ServerProt(62, 0); // NXT has "SET_MAP_FLAG" but we cannot control the position
    static readonly UPDATE_RUNWEIGHT = new ServerProt(160, 2); // NXT naming
    static readonly HINT_ARROW = new ServerProt(49, 6); // NXT naming
    static readonly UPDATE_REBOOT_TIMER = new ServerProt(85, 2); // NXT naming
    static readonly UPDATE_STAT = new ServerProt(24, 6); // NXT naming
    static readonly UPDATE_RUNENERGY = new ServerProt(177, 1); // NXT naming
    static readonly RESET_ANIMS = new ServerProt(242, 0); // NXT naming
    static readonly UPDATE_PID = new ServerProt(210, 3);
    static readonly LAST_LOGIN_INFO = new ServerProt(44, 9); // NXT naming
    static readonly LOGOUT = new ServerProt(17, 0); // NXT naming
    static readonly P_COUNTDIALOG = new ServerProt(152, 0); // named after runescript command + client resume_p_countdialog packet
    static readonly SET_MULTIWAY = new ServerProt(97, 1);

    // maps
    static readonly REBUILD_NORMAL = new ServerProt(165, 4); // NXT naming (do we really need _normal if there's no region rebuild?)

    // vars
    static readonly VARP_SMALL = new ServerProt(236, 3); // NXT naming
    static readonly VARP_LARGE = new ServerProt(226, 6); // NXT naming
    static readonly RESET_CLIENT_VARCACHE = new ServerProt(87, 0); // NXT naming

    // audio
    static readonly SYNTH_SOUND = new ServerProt(151, 5); // NXT naming
    static readonly MIDI_SONG = new ServerProt(240, 2); // NXT naming
    static readonly MIDI_JINGLE = new ServerProt(212, 4); // NXT naming

    // zones
    static readonly UPDATE_ZONE_PARTIAL_FOLLOWS = new ServerProt(94, 2); // NXT naming
    static readonly UPDATE_ZONE_FULL_FOLLOWS = new ServerProt(131, 2); // NXT naming
    static readonly UPDATE_ZONE_PARTIAL_ENCLOSED = new ServerProt(233, -2); // NXT naming

    constructor(
        readonly id: number,
        readonly length: number
    ) {}
}
