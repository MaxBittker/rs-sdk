import IdkType from '#/config/IdkType.js';
import IfType from '#/config/IfType.js';
import ClientPlayer from '#/dash3d/ClientPlayer.js';
import { ClientProt } from '#/io/ClientProt.js';
import type Packet from '#/io/Packet.js';
import { ClientCode } from './ClientCode.js';
import {
    CHARACTER_BODY_PARTS, CHARACTER_COLOR_PARTS, CHARACTER_DESIGN_INTERFACE,
    type CharacterDesign, type CharacterDesignPatch, type CharacterDesignState, type PlayerAppearance
} from '../../../../sdk/character-design.js';

export class CharacterDesignError extends Error {
    constructor(message: string, readonly reason: string = 'invalid_design') {
        super(message);
    }
}

export function assertCharacterDesignOpen(inGame: boolean, modal: number): void {
    if (!inGame) throw new CharacterDesignError('Not in game', 'not_in_game');
    if (modal !== CHARACTER_DESIGN_INTERFACE) {
        throw new CharacterDesignError('The tutorial character design screen is not open', 'design_not_open');
    }
}

export function characterDesignOptions(): CharacterDesignState['options'] {
    const body = (gender: boolean) => Object.fromEntries(CHARACTER_BODY_PARTS.map((part, index) => {
        const ids: number[] = [];
        for (let id = 0; id < IdkType.list.length; id++) {
            const kit = IdkType.list[id];
            if (kit && !kit.disable && kit.part === index + (gender ? 0 : 7)) ids.push(id);
        }
        // The server explicitly permits no jaw for female characters.
        if (!gender && part === 'jaw') ids.unshift(-1);
        return [part, ids];
    })) as Record<typeof CHARACTER_BODY_PARTS[number], number[]>;
    return {
        body: { male: body(true), female: body(false) },
        colors: Object.fromEntries(CHARACTER_COLOR_PARTS.map((part, index) =>
            [part, ClientPlayer.recol1d[index].map((_, color) => color)])) as CharacterDesignState['options']['colors']
    };
}

export function defaultCharacterDesign(gender: boolean = true): CharacterDesign {
    const options = characterDesignOptions();
    const body = options.body[gender ? 'male' : 'female'];
    for (const part of CHARACTER_BODY_PARTS) {
        if (!body[part].length) throw new CharacterDesignError('No character design kits loaded for ' + part);
    }
    return {
        gender,
        body: Object.fromEntries(CHARACTER_BODY_PARTS.map(part => [part, body[part][0]])) as CharacterDesign['body'],
        colors: Object.fromEntries(CHARACTER_COLOR_PARTS.map(part => [part, 0])) as CharacterDesign['colors']
    };
}

export function characterDesignFromArrays(gender: boolean, body: ArrayLike<number>, colors: ArrayLike<number>): CharacterDesign {
    return {
        gender,
        body: Object.fromEntries(CHARACTER_BODY_PARTS.map((part, index) => [part, body[index]])) as CharacterDesign['body'],
        colors: Object.fromEntries(CHARACTER_COLOR_PARTS.map((part, index) => [part, colors[index]])) as CharacterDesign['colors']
    };
}

function checkFields(value: unknown, fields: readonly string[], label: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
        throw new CharacterDesignError('Invalid character design ' + label);
    }
}

export function validateCharacterDesign(design: CharacterDesign): void {
    const options = characterDesignOptions();
    if (typeof design.gender !== 'boolean') throw new CharacterDesignError('Gender must be true (male) or false (female)');
    const body = options.body[design.gender ? 'male' : 'female'];
    for (const part of CHARACTER_BODY_PARTS) {
        if (!Number.isInteger(design.body[part]) || !body[part].includes(design.body[part])) {
            throw new CharacterDesignError('Invalid ' + part + ' kit: ' + design.body[part]);
        }
    }
    for (const part of CHARACTER_COLOR_PARTS) {
        if (!Number.isInteger(design.colors[part]) || !options.colors[part].includes(design.colors[part])) {
            throw new CharacterDesignError('Invalid ' + part + ' colour index: ' + design.colors[part]);
        }
    }
}

/** Resolve and validate a complete candidate before mutating any client state. */
export function patchCharacterDesign(current: CharacterDesign, patch: CharacterDesignPatch): CharacterDesign {
    checkFields(patch, ['gender', 'body', 'colors'], 'patch');
    if (patch.gender !== undefined && typeof patch.gender !== 'boolean') {
        throw new CharacterDesignError('Gender must be true (male) or false (female)');
    }
    if (patch.body !== undefined) checkFields(patch.body, CHARACTER_BODY_PARTS, 'body');
    if (patch.colors !== undefined) checkFields(patch.colors, CHARACTER_COLOR_PARTS, 'colours');
    const gender = patch.gender ?? current.gender;
    const base = gender === current.gender ? current : defaultCharacterDesign(gender);
    const candidate: CharacterDesign = {
        gender,
        body: { ...base.body, ...patch.body },
        colors: { ...current.colors, ...patch.colors }
    };
    validateCharacterDesign(candidate);
    return candidate;
}

export function randomCharacterDesign(gender?: boolean): CharacterDesign {
    if (gender !== undefined && typeof gender !== 'boolean') {
        throw new CharacterDesignError('Gender must be true (male) or false (female)');
    }
    const design = defaultCharacterDesign(gender ?? Math.random() < 0.5);
    const options = characterDesignOptions();
    const choose = (values: number[]) => values[Math.floor(Math.random() * values.length)];
    for (const part of CHARACTER_BODY_PARTS) design.body[part] = choose(options.body[design.gender ? 'male' : 'female'][part]);
    for (const part of CHARACTER_COLOR_PARTS) design.colors[part] = choose(options.colors[part]);
    return design;
}

/** Preflight both the draft and the active screen before writing either packet. */
export function characterDesignAcceptButton(inGame: boolean, modal: number, design: CharacterDesign): number {
    assertCharacterDesignOpen(inGame, modal);
    validateCharacterDesign(design);
    const accept = IfType.list.find(com => com && com.clientCode === ClientCode.CC_ACCEPT_DESIGN && com.layerId === modal);
    if (!accept) throw new CharacterDesignError('Character design accept button not found in the active screen', 'accept_button_not_found');
    return accept.id;
}

/** Same two-packet sequence as a real click, shared by browser and lite. */
export function writeCharacterDesign(out: Packet, opcode: (value: number) => void, design: CharacterDesign, acceptButton: number): void {
    opcode(ClientProt.IDK_SAVEDESIGN);
    out.p1(design.gender ? 0 : 1);
    for (const part of CHARACTER_BODY_PARTS) out.p1(design.body[part]);
    for (const part of CHARACTER_COLOR_PARTS) out.p1(design.colors[part]);
    opcode(ClientProt.IF_BUTTON);
    out.p2(acceptButton);
}

export function observedPlayerAppearance(player: ClientPlayer): PlayerAppearance | null {
    if (!player.ready) return null;
    return {
        gender: player.gender === 0,
        slots: Array.from(player.appearance),
        colors: Object.fromEntries(CHARACTER_COLOR_PARTS.map((part, index) => [part, player.colour[index]])) as CharacterDesign['colors']
    };
}
