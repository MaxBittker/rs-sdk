// Spell component ids (from server/content/pack/interface.pack).
// These are what sdk.sendSpellOnTarget / sendSpellOnItem and bot.castSpell
// take as the spell argument, e.g.:
//   await sdk.sendSpellOnItem(item.slot, Spells.HIGH_ALCHEMY);
//   await bot.castSpell('goblin', Spells.WIND_STRIKE);
export const Spells = {
    // Combat spells
    WIND_STRIKE: 1152,
    CONFUSE: 1153,
    WATER_STRIKE: 1154,
    ENCHANT_LVL1: 1155, // Sapphire
    EARTH_STRIKE: 1156,
    WEAKEN: 1157,
    FIRE_STRIKE: 1158,
    WIND_BOLT: 1160,
    CURSE: 1161,
    LOW_ALCHEMY: 1162,
    WATER_BOLT: 1163,
    VARROCK_TELEPORT: 1164,
    ENCHANT_LVL2: 1165, // Emerald
    EARTH_BOLT: 1166,
    LUMBRIDGE_TELEPORT: 1167,
    FIRE_BOLT: 1169,
    FALADOR_TELEPORT: 1170,
    WIND_BLAST: 1172,
    SUPERHEAT: 1173, // Requires Magic 43 AND Smithing level for the bar
    CAMELOT_TELEPORT: 1174,
    WATER_BLAST: 1175,
    ENCHANT_LVL3: 1176, // Ruby
    EARTH_BLAST: 1177,
    HIGH_ALCHEMY: 1178,
    ENCHANT_LVL4: 1180, // Diamond
    FIRE_BLAST: 1181,
    WIND_WAVE: 1183,
    WATER_WAVE: 1185,
    ENCHANT_LVL5: 1187, // Dragonstone
    EARTH_WAVE: 1188,
    FIRE_WAVE: 1189,
    BIND: 1572,
} as const;

export type SpellName = keyof typeof Spells;
