// SpecialAttack.ts - The special attack bar: state, and turning it on and off.
// Shared by the browser Client and the LiteClient.

import IfType from '#/config/IfType.js';
import type { ActionResult } from './ActionExecutor.js';
import { EQUIPMENT_INTERFACE_ID } from './types.js';

/** %sa_energy, 0-1000 (server/content/pack/varp.pack: `300=sa_energy`). */
export const VARP_SA_ENERGY = 300;
/** %sa_attack, the bar's on/off toggle (server/content/pack/varp.pack: `301=sa_attack`). */
export const VARP_SA_ATTACK = 301;

const WEAPON_SLOT = 3;
/** The bar's option. Spelled "Specal Attack" on some tabs in the content, so don't compare exactly. */
const SPECIAL_BAR_OPTION = /Spec\w*al Attack/;

export interface SpecialWeapon {
    /** Energy one use takes, in percent: the obj's `sa_energy` param (default 1000) / 10. */
    cost: number;
    /** The special fires as soon as the bar is clicked, so %sa_attack never turns on. */
    instant?: boolean;
}

/**
 * Special weapons by obj id. The client has the bar but not the obj's server-side
 * params, so the cost comes from content (`specwep`/`sa_energy` in skill_combat/configs;
 * SpecialAttack.test.ts holds this table to them).
 */
export const SPECIAL_WEAPONS: Readonly<Record<number, SpecialWeapon>> = {
    35: { cost: 100, instant: true }, // excalibur
    805: { cost: 10 }, // rune_thrownaxe
    859: { cost: 35 }, // magic_longbow
    861: { cost: 35 }, // magic_shortbow
    1215: { cost: 25 }, // dragon_dagger
    1231: { cost: 25 }, // dragon_dagger_p
    1249: { cost: 25 }, // dragon_spear
    1263: { cost: 25 }, // dragon_spear_p
    1305: { cost: 25 }, // dragon_longsword
    1377: { cost: 100, instant: true }, // dragon_battleaxe
    1434: { cost: 25 }, // dragon_mace
    3101: { cost: 25 }, // rune_claws
    3176: { cost: 25 }, // tbwt_dragon_spear_kp
    3204: { cost: 30 } // dragon_halberd
};

/** Special attack energy in percent (0-100): %sa_energy / 10. */
export function specialEnergyPercent(varps: number[] | undefined): number {
    return Math.floor((varps?.[VARP_SA_ENERGY] ?? 0) / 10);
}

export function specialAttackActive(varps: number[] | undefined): boolean {
    return (varps?.[VARP_SA_ATTACK] ?? 0) === 1;
}

/**
 * The specbar button on a combat tab, found by its "Use Special Attack" option so
 * it doesn't depend on per-tab ids. `visible` is false while its layer is hidden: the server
 * hides it (if_sethide) unless the weapon has a special.
 */
export function findSpecialBar(tabId: number): { componentId: number; visible: boolean } | null {
    const visit = (comId: number, depth: number, hidden: boolean): { componentId: number; visible: boolean } | null => {
        const com = IfType.list[comId];
        if (!com || depth > 4) return null;
        const isHidden = hidden || com.hide === true;
        if (com.buttonText && SPECIAL_BAR_OPTION.test(com.buttonText)) {
            return { componentId: comId, visible: !isHidden };
        }
        for (const childId of com.children ?? []) {
            const found = visit(childId, depth + 1, isHidden);
            if (found) return found;
        }
        return null;
    };
    return tabId === -1 ? null : visit(tabId, 0, false);
}

function equippedWeapon(): number {
    return (IfType.list[EQUIPMENT_INTERFACE_ID]?.linkObjType?.[WEAPON_SLOT] ?? 0) - 1; // linkObjType holds id + 1, 0 = empty
}

/**
 * Bring the special attack to `on`. Idempotent: reads %sa_attack and only clicks when
 * that changes something, because the bar is a toggle. `data.clicked` says whether it did.
 */
export function setSpecialAttack(varps: number[], combatTabId: number, click: (componentId: number) => boolean, on: boolean): ActionResult {
    const specialEnergy = specialEnergyPercent(varps);
    const specialActive = specialAttackActive(varps);
    const data = { specialEnergy, specialActive, clicked: false };
    const fail = (reason: string, message: string, extra: object = {}): ActionResult => ({
        success: false,
        message,
        phase: 'validation',
        reason,
        data: { ...data, ...extra }
    });

    if (!on && !specialActive) {
        return { success: true, message: 'Special attack is already off', phase: 'validation', data };
    }

    const bar = findSpecialBar(combatTabId);
    if (!bar?.visible) {
        return fail('no_special_attack', 'The equipped weapon has no special attack');
    }

    const weapon = SPECIAL_WEAPONS[equippedWeapon()];
    if (on && weapon && specialEnergy < weapon.cost) {
        return fail('insufficient_energy', `Not enough special attack energy: have ${specialEnergy}%, need ${weapon.cost}%`, { needed: weapon.cost });
    }
    if (on && specialActive) {
        return { success: true, message: 'Special attack is already on', phase: 'validation', data };
    }

    if (!click(bar.componentId)) {
        return fail('not_in_game', 'Failed to click the special attack bar');
    }
    return {
        success: true,
        // The client doesn't know the cost of a weapon missing from the table.
        message: `${on ? 'Turning special attack on' : 'Turning special attack off'} (energy ${specialEnergy}%${on && !weapon ? ', cost unknown' : ''})`,
        phase: 'dispatch',
        data: { ...data, clicked: true, needed: weapon?.cost ?? null, instant: weapon?.instant ?? false }
    };
}
