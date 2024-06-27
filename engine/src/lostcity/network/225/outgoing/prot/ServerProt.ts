export default class ServerProt {
    static readonly all: ServerProt[] = [];
    static readonly byId: ServerProt[] = [];

    // interfaces
    static readonly IF_OPENCHATMODAL = new ServerProt(14, 2);
    static readonly IF_OPENMAINSIDEMODAL = new ServerProt(28, 4);
    static readonly IF_CLOSE = new ServerProt(129, 0); // NXT has "IF_CLOSESUB"
    static readonly IF_OPENSIDEOVERLAY = new ServerProt(167, 3);
    static readonly IF_OPENMAINMODAL = new ServerProt(168, 2);
    static readonly IF_OPENSIDEMODAL = new ServerProt(195, 2);

    // updating interfaces
    static readonly IF_SETCOLOUR = new ServerProt(2, 4); // NXT naming
    static readonly IF_SETHIDE = new ServerProt(26, 3); // NXT naming
    static readonly IF_SETOBJECT = new ServerProt(46, 6); // NXT naming
    static readonly IF_SHOWSIDE = new ServerProt(84, 1);
    static readonly IF_SETMODEL = new ServerProt(87, 4); // NXT naming
    static readonly IF_SETRECOL = new ServerProt(103, 6); // NXT naming
    static readonly IF_SETANIM = new ServerProt(146, 4); // NXT naming
    static readonly IF_SETPLAYERHEAD = new ServerProt(197, 2); // NXT naming
    static readonly IF_SETTEXT = new ServerProt(201, -2); // NXT naming
    static readonly IF_SETNPCHEAD = new ServerProt(204, 4); // NXT naming
    static readonly IF_SETPOSITION = new ServerProt(209, 6); // NXT naming

    // tutorial area
    static readonly TUTORIAL_FLASHSIDE = new ServerProt(126, 1);
    static readonly TUTORIAL_OPENCHAT = new ServerProt(185, 2);

    // inventory
    static readonly UPDATE_INV_STOP_TRANSMIT = new ServerProt(15, 2); // NXT naming
    static readonly UPDATE_INV_FULL = new ServerProt(98, -2); // NXT naming
    static readonly UPDATE_INV_PARTIAL = new ServerProt(213, -2); // NXT naming

    // camera control
    static readonly CAM_LOOKAT = new ServerProt(74, 6); // NXT naming
    static readonly CAM_SHAKE = new ServerProt(13, 4); // NXT naming
    static readonly CAM_MOVETO = new ServerProt(3, 6); // NXT naming
    static readonly CAM_RESET = new ServerProt(239, 0); // NXT naming

    // entity updates
    static readonly NPC_INFO = new ServerProt(1, -2); // NXT naming
    static readonly PLAYER_INFO = new ServerProt(184, -2); // NXT naming

    // input tracking
    static readonly FINISH_TRACKING = new ServerProt(133, 0);
    static readonly ENABLE_TRACKING = new ServerProt(226, 0);

    // social
    static readonly MESSAGE_GAME = new ServerProt(4, -1); // NXT naming
    static readonly UPDATE_IGNORELIST = new ServerProt(21, -2); // NXT naming
    static readonly CHAT_FILTER_SETTINGS = new ServerProt(32, 3); // NXT naming
    static readonly MESSAGE_PRIVATE = new ServerProt(41, -1); // NXT naming
    static readonly UPDATE_FRIENDLIST = new ServerProt(152, 9); // NXT naming

    // misc
    static readonly UNSET_MAP_FLAG = new ServerProt(19, 0); // NXT has "SET_MAP_FLAG" but we cannot control the position
    static readonly UPDATE_RUNWEIGHT = new ServerProt(22, 2); // NXT naming
    static readonly HINT_ARROW = new ServerProt(25, 6); // NXT naming
    static readonly UPDATE_REBOOT_TIMER = new ServerProt(43, 2); // NXT naming
    static readonly UPDATE_STAT = new ServerProt(44, 6); // NXT naming
    static readonly UPDATE_RUNENERGY = new ServerProt(68, 1); // NXT naming
    static readonly RESET_ANIMS = new ServerProt(136, 0); // NXT naming
    static readonly UPDATE_UID192 = new ServerProt(139, 2); // NXT naming (not 100% certain if "uid192" means local player)
    static readonly LAST_LOGIN_INFO = new ServerProt(140, 9); // NXT naming
    static readonly LOGOUT = new ServerProt(142, 0); // NXT naming
    static readonly P_COUNTDIALOG = new ServerProt(243, 0); // named after runescript command + client resume_p_countdialog packet
    static readonly SET_MULTIWAY = new ServerProt(254, 1);

    // maps
    static readonly DATA_LOC_DONE = new ServerProt(20, 2);
    static readonly DATA_LAND_DONE = new ServerProt(80, 2);
    static readonly DATA_LAND = new ServerProt(132, -2);
    static readonly DATA_LOC = new ServerProt(220, -2);
    static readonly REBUILD_NORMAL = new ServerProt(237, -2); // NXT naming (do we really need _normal if there's no region rebuild?)

    // vars
    static readonly VARP_SMALL = new ServerProt(150, 3); // NXT naming
    static readonly VARP_LARGE = new ServerProt(175, 6); // NXT naming
    static readonly RESET_CLIENT_VARCACHE = new ServerProt(193, 0); // NXT naming

    // audio
    static readonly SYNTH_SOUND = new ServerProt(12, 5); // NXT naming
    static readonly MIDI_SONG = new ServerProt(54, -1); // NXT naming
    static readonly MIDI_JINGLE = new ServerProt(212, -2); // NXT naming

    // zones
    static readonly UPDATE_ZONE_PARTIAL_FOLLOWS = new ServerProt(7, 2); // NXT naming
    static readonly UPDATE_ZONE_FULL_FOLLOWS = new ServerProt(135, 2); // NXT naming
    static readonly UPDATE_ZONE_PARTIAL_ENCLOSED = new ServerProt(162, -2); // NXT naming

    constructor(readonly id: number, readonly length: number) {
        ServerProt.all.push(this); // no known index
        ServerProt.byId[id] = this;
    }
}

// for type safety in CameraInfo
export type CameraProt = typeof ServerProt.CAM_MOVETO | typeof ServerProt.CAM_LOOKAT;
