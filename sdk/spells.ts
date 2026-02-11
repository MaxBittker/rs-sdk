// Spell component IDs (from content/pack/interface.pack)
// These map to the interface component ID used by the game protocol.

export const Spells = {
    // Strike spells (lowest tier combat)
    WIND_STRIKE: 1152,
    CONFUSE: 1153,
    WATER_STRIKE: 1154,
    ENCHANT_LVL1: 1155,  // Sapphire
    EARTH_STRIKE: 1156,
    WEAKEN: 1157,
    FIRE_STRIKE: 1158,

    // Bolt spells
    WIND_BOLT: 1160,
    CURSE: 1161,
    LOW_ALCHEMY: 1162,
    WATER_BOLT: 1163,
    VARROCK_TELEPORT: 1164,
    ENCHANT_LVL2: 1165,  // Emerald
    EARTH_BOLT: 1166,
    LUMBRIDGE_TELEPORT: 1167,
    FIRE_BOLT: 1169,
    FALADOR_TELEPORT: 1170,

    // Blast spells
    WIND_BLAST: 1172,
    SUPERHEAT: 1173,
    CAMELOT_TELEPORT: 1174,
    WATER_BLAST: 1175,
    ENCHANT_LVL3: 1176,  // Ruby
    EARTH_BLAST: 1177,
    HIGH_ALCHEMY: 1178,
    ENCHANT_LVL4: 1180,  // Diamond
    FIRE_BLAST: 1181,

    // Wave spells (highest tier)
    WIND_WAVE: 1183,
    WATER_WAVE: 1185,
    ENCHANT_LVL5: 1187,  // Dragonstone
    EARTH_WAVE: 1188,
    FIRE_WAVE: 1189,

    // Other
    BIND: 1572,
} as const;

/** The name of a spell (e.g. 'WIND_STRIKE', 'FIRE_BOLT'). */
export type SpellName = keyof typeof Spells;

// Reverse lookup: component ID → spell name (for validation/error messages)
const spellById = new Map<number, SpellName>(
    (Object.entries(Spells) as [SpellName, number][]).map(([name, id]) => [id, name])
);

/**
 * Resolve a spell name or component ID to a numeric component ID.
 * Returns undefined if the spell name is not recognized.
 */
export function resolveSpell(spell: SpellName | number): number | undefined {
    if (typeof spell === 'number') {
        return spell;
    }
    const id = Spells[spell];
    return id;
}

/** Get the spell name for a component ID, if known. */
export function getSpellName(componentId: number): SpellName | undefined {
    return spellById.get(componentId);
}
