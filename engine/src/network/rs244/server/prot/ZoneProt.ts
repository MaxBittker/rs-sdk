import ServerProt from '#/network/rs244/server/prot/ServerProt.js';

export default class ZoneProt extends ServerProt {
    // zone protocol
    static readonly LOC_MERGE = new ZoneProt(29, 14); // based on runescript command p_locmerge
    static readonly LOC_ANIM = new ZoneProt(155, 4); // NXT naming
    static readonly OBJ_DEL = new ZoneProt(39, 3); // NXT naming
    static readonly OBJ_REVEAL = new ZoneProt(69, 7); // NXT naming
    static readonly LOC_ADD_CHANGE = new ZoneProt(232, 4); // NXT naming
    static readonly MAP_PROJANIM = new ZoneProt(137, 15); // NXT naming
    static readonly LOC_DEL = new ZoneProt(125, 2); // NXT naming
    static readonly OBJ_COUNT = new ZoneProt(209, 7); // NXT naming
    static readonly MAP_ANIM = new ZoneProt(198, 6); // NXT naming
    static readonly OBJ_ADD = new ZoneProt(234, 5); // NXT naming
}
