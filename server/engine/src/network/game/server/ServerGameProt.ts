export default class ServerGameProt {
    // interfaces
    static readonly IF_OPENCHAT = new ServerGameProt(81, 2);
    static readonly IF_OPENMAIN_SIDE = new ServerGameProt(55, 4);
    static readonly IF_CLOSE = new ServerGameProt(23, 0);
    static readonly IF_SETTAB = new ServerGameProt(63, 3);
    static readonly IF_SETTAB_ACTIVE = new ServerGameProt(189, 1);
    static readonly IF_OPENMAIN = new ServerGameProt(119, 2);
    static readonly IF_OPENSIDE = new ServerGameProt(252, 2);
    static readonly IF_OPENOVERLAY = new ServerGameProt(127, 2);

    // updating interfaces
    static readonly IF_SETCOLOUR = new ServerGameProt(160, 4);
    static readonly IF_SETHIDE = new ServerGameProt(138, 3);
    static readonly IF_SETOBJECT = new ServerGameProt(18, 6);
    static readonly IF_SETMODEL = new ServerGameProt(222, 4);
    static readonly IF_SETANIM = new ServerGameProt(211, 4);
    static readonly IF_SETPLAYERHEAD = new ServerGameProt(30, 2);
    static readonly IF_SETTEXT = new ServerGameProt(59, -2);
    static readonly IF_SETNPCHEAD = new ServerGameProt(244, 4);
    static readonly IF_SETPOSITION = new ServerGameProt(79, 6);
    static readonly IF_SETSCROLLPOS = new ServerGameProt(184, 4);

    // tutorial area
    static readonly TUT_FLASH = new ServerGameProt(181, 1);
    static readonly TUT_OPEN = new ServerGameProt(12, 2);

    // inventory
    static readonly UPDATE_INV_STOP_TRANSMIT = new ServerGameProt(28, 2);
    static readonly UPDATE_INV_FULL = new ServerGameProt(107, -2);
    static readonly UPDATE_INV_PARTIAL = new ServerGameProt(76, -2);

    // camera control
    static readonly CAM_LOOKAT = new ServerGameProt(82, 6);
    static readonly CAM_SHAKE = new ServerGameProt(208, 4);
    static readonly CAM_MOVETO = new ServerGameProt(73, 6);
    static readonly CAM_RESET = new ServerGameProt(133, 0);

    // entity updates
    static readonly NPC_INFO = new ServerGameProt(65, -2);
    static readonly PLAYER_INFO = new ServerGameProt(188, -2);

    // social
    static readonly FRIENDLIST_LOADED = new ServerGameProt(235, 1);
    static readonly MESSAGE_GAME = new ServerGameProt(196, -1);
    static readonly UPDATE_IGNORELIST = new ServerGameProt(47, -2);
    static readonly CHAT_FILTER_SETTINGS = new ServerGameProt(13, 3);
    static readonly MESSAGE_PRIVATE = new ServerGameProt(243, -1);
    // rs-sdk: server-side broadcast of public chat (out-of-visual-range). 255 is free in the 289 protocol.
    static readonly MESSAGE_PUBLIC = new ServerGameProt(255, -1);
    static readonly UPDATE_FRIENDLIST = new ServerGameProt(168, 9);

    // misc
    static readonly UNSET_MAP_FLAG = new ServerGameProt(164, 0);
    static readonly UPDATE_RUNWEIGHT = new ServerGameProt(46, 2);
    static readonly HINT_ARROW = new ServerGameProt(115, 6);
    static readonly UPDATE_REBOOT_TIMER = new ServerGameProt(204, 2);
    static readonly UPDATE_STAT = new ServerGameProt(154, 6);
    static readonly UPDATE_RUNENERGY = new ServerGameProt(195, 1);
    static readonly RESET_ANIMS = new ServerGameProt(201, 0);
    static readonly UPDATE_PID = new ServerGameProt(120, 3);
    static readonly LAST_LOGIN_INFO = new ServerGameProt(253, 10);
    static readonly LOGOUT = new ServerGameProt(121, 0);
    static readonly P_COUNTDIALOG = new ServerGameProt(35, 0);
    static readonly SET_MULTIWAY = new ServerGameProt(247, 1);
    static readonly SET_PLAYER_OP = new ServerGameProt(21, -1);
    static readonly MINIMAP_TOGGLE = new ServerGameProt(136, 1);

    // maps
    static readonly REBUILD_NORMAL = new ServerGameProt(219, 4);

    // vars
    static readonly VARP_SMALL = new ServerGameProt(75, 3);
    static readonly VARP_LARGE = new ServerGameProt(97, 6);
    static readonly RESET_CLIENT_VARCACHE = new ServerGameProt(172, 0);

    // audio
    static readonly SYNTH_SOUND = new ServerGameProt(177, 5);
    static readonly MIDI_SONG = new ServerGameProt(187, 2);
    static readonly MIDI_JINGLE = new ServerGameProt(29, 4);

    // zones
    static readonly UPDATE_ZONE_PARTIAL_FOLLOWS = new ServerGameProt(155, 2);
    static readonly UPDATE_ZONE_FULL_FOLLOWS = new ServerGameProt(144, 2);
    static readonly UPDATE_ZONE_PARTIAL_ENCLOSED = new ServerGameProt(112, -2);

    constructor(
        readonly id: number,
        readonly length: number
    ) {}
}
