import type { ActionResult } from './types';

export const CHARACTER_DESIGN_INTERFACE = 3559;
export const CHARACTER_BODY_PARTS = ['hair', 'jaw', 'torso', 'arms', 'hands', 'legs', 'feet'] as const;
export const CHARACTER_COLOR_PARTS = ['hair', 'torso', 'legs', 'feet', 'skin'] as const;
export type CharacterBodyPart = typeof CHARACTER_BODY_PARTS[number];
export type CharacterColorPart = typeof CHARACTER_COLOR_PARTS[number];

export interface CharacterDesign {
    /** Matches the existing client convention: true for male, false for female. */
    gender: boolean;
    /** Identity-kit IDs, with -1 for the female jaw. */
    body: Record<CharacterBodyPart, number>;
    /** Palette indices, not colour values. */
    colors: Record<CharacterColorPart, number>;
}

export interface CharacterDesignPatch {
    gender?: boolean;
    body?: Partial<CharacterDesign['body']>;
    colors?: Partial<CharacterDesign['colors']>;
}

export interface CharacterDesignState {
    current: CharacterDesign;
    options: {
        body: Record<'male' | 'female', Record<CharacterBodyPart, number[]>>;
        colors: Record<CharacterColorPart, number[]>;
    };
}

/** Server-decoded visible appearance. Equipment and hidden slots remain encoded. */
export interface PlayerAppearance {
    gender: boolean;
    /** Twelve player-info slots: 0 absent/hidden, 256 + kit, or 512 + equipment ID. Slot 0 is 65535 for an NPC transformation; remaining slots are not current. */
    slots: number[];
    colors: CharacterDesign['colors'];
}

export interface CharacterDesignActionResult extends ActionResult {
    /** Snapshot of the complete draft edited or dispatched by this action. */
    data?: { design: CharacterDesign };
}

/** Body order mapped to player-info slots; see engine Player.getAppearanceInSlot. */
const BODY_SLOTS = [8, 11, 4, 6, 9, 7, 10] as const;

export function appearanceMatchesDesign(appearance: PlayerAppearance | null | undefined, design: CharacterDesign): boolean {
    return !!appearance && appearance.slots[0] !== 65535 && appearance.gender === design.gender &&
        CHARACTER_COLOR_PARTS.every(part => appearance.colors[part] === design.colors[part]) &&
        CHARACTER_BODY_PARTS.every((part, index) =>
            appearance.slots[BODY_SLOTS[index]!] === (design.body[part] === -1 ? 0 : 256 + design.body[part]));
}
