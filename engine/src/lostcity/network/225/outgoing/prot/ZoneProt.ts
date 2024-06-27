import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';

export default class ZoneProt extends ServerProt {
    // zone protocol
    static readonly LOC_MERGE = new ZoneProt(23, 14); // based on runescript command p_locmerge
    static readonly LOC_ANIM = new ZoneProt(42, 4); // NXT naming
    static readonly OBJ_DEL = new ZoneProt(49, 3); // NXT naming
    static readonly OBJ_REVEAL = new ZoneProt(50, 7); // NXT naming
    static readonly LOC_ADD_CHANGE = new ZoneProt(59, 4); // NXT naming
    static readonly MAP_PROJANIM = new ZoneProt(69, 15); // NXT naming
    static readonly LOC_DEL = new ZoneProt(76, 2); // NXT naming
    static readonly OBJ_COUNT = new ZoneProt(151, 7); // NXT naming
    static readonly MAP_ANIM = new ZoneProt(191, 6); // NXT naming
    static readonly OBJ_ADD = new ZoneProt(223, 5); // NXT naming
}