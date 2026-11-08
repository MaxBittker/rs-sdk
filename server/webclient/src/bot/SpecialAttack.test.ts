import { beforeEach, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import IfType from '#/config/IfType.js';

import { findSpecialBar, setSpecialAttack, specialAttackActive, specialEnergyPercent, SPECIAL_WEAPONS, VARP_SA_ATTACK, VARP_SA_ENERGY } from './SpecialAttack.js';
import { EQUIPMENT_INTERFACE_ID } from './types.js';

const CONTENT = join(import.meta.dir, '../../../content');
const TAB = 7000;
const LAYER = 7001;
const BAR = 7002;
const DRAGON_DAGGER = 1215;
const DRAGON_BATTLEAXE = 1377;

function defineTab(hidden: boolean, weapon: number) {
    (IfType.list as any)[TAB] = { id: TAB, children: [LAYER] };
    (IfType.list as any)[LAYER] = { id: LAYER, hide: hidden, children: [BAR] };
    (IfType.list as any)[BAR] = { id: BAR, buttonText: 'Use @gre@Special Attack' };
    const worn = new Array(14).fill(0);
    worn[3] = weapon + 1;
    (IfType.list as any)[EQUIPMENT_INTERFACE_ID] = { id: EQUIPMENT_INTERFACE_ID, linkObjType: worn };
}

function run(energy: number, active: boolean, on: boolean) {
    const varps: number[] = [];
    varps[VARP_SA_ENERGY] = energy;
    varps[VARP_SA_ATTACK] = active ? 1 : 0;
    const clicked: number[] = [];
    const result = setSpecialAttack(varps, TAB, id => { clicked.push(id); return true; }, on);
    return { result, clicked };
}

beforeEach(() => {
    (IfType.list as any) = [];
});

describe('setSpecialAttack', () => {
    test('clicks the bar of the current combat tab to turn it on', () => {
        defineTab(false, DRAGON_DAGGER);
        const { result, clicked } = run(1000, false, true);
        expect(clicked).toEqual([BAR]);
        expect(result).toMatchObject({ success: true, phase: 'dispatch', data: { clicked: true, specialEnergy: 100, needed: 25, instant: false } });
    });

    test('is idempotent: never clicks a special that is already on', () => {
        defineTab(false, DRAGON_DAGGER);
        const { result, clicked } = run(1000, true, true);
        expect(clicked).toEqual([]);
        expect(result).toMatchObject({ success: true, data: { clicked: false, specialActive: true } });
    });

    test('turns off only when on', () => {
        defineTab(false, DRAGON_DAGGER);
        expect(run(1000, true, false).clicked).toEqual([BAR]);
        expect(run(1000, false, false).clicked).toEqual([]);
    });

    test('fails when the layer is hidden: the weapon has no special', () => {
        defineTab(true, 1277); // bronze_sword
        const { result, clicked } = run(1000, false, true);
        expect(clicked).toEqual([]);
        expect(result).toMatchObject({ success: false, reason: 'no_special_attack', phase: 'validation' });
    });

    test('turning off with no special is not a failure', () => {
        defineTab(true, 1277);
        expect(run(1000, false, false).result.success).toBe(true);
    });

    test('fails with current vs needed energy when there is not enough', () => {
        defineTab(false, DRAGON_DAGGER);
        const { result, clicked } = run(240, false, true);
        expect(clicked).toEqual([]);
        expect(result).toMatchObject({ success: false, reason: 'insufficient_energy', data: { specialEnergy: 24, needed: 25 } });
        expect(result.message).toContain('have 24%, need 25%');
    });

    test('flags a special that fires on click', () => {
        defineTab(false, DRAGON_BATTLEAXE);
        expect(run(1000, false, true).result.data).toMatchObject({ clicked: true, needed: 100, instant: true });
    });

    test('a visible bar on a weapon outside the table still clicks and says the cost is unknown', () => {
        defineTab(false, 99999);
        const { result, clicked } = run(100, false, true);
        expect(clicked).toEqual([BAR]);
        expect(result.data.needed).toBeNull();
        expect(result.message).toContain('cost unknown');
    });
});

test('varps read as percent and on/off', () => {
    const varps: number[] = [];
    varps[VARP_SA_ENERGY] = 755;
    varps[VARP_SA_ATTACK] = 1;
    expect(specialEnergyPercent(varps)).toBe(75);
    expect(specialAttackActive(varps)).toBe(true);
    expect(specialEnergyPercent(undefined)).toBe(0);
    expect(specialAttackActive([])).toBe(false);
});

test('findSpecialBar: a tab without one (e.g. combat_staff) is null', () => {
    (IfType.list as any)[TAB] = { id: TAB, children: [] };
    expect(findSpecialBar(TAB)).toBeNull();
    expect(findSpecialBar(-1)).toBeNull();
});

function files(dir: string, ext: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = join(dir, e.name);
        return e.isDirectory() ? files(p, ext) : e.name.endsWith(ext) ? [p] : [];
    });
}

describe('content', () => {
    test('every specwep is in SPECIAL_WEAPONS with its sa_energy (default 1000)', () => {
        const ids = new Map<string, number>();
        for (const line of readFileSync(join(CONTENT, 'pack/obj.pack'), 'utf8').split('\n')) {
            const [id, name] = line.split('=');
            if (name) ids.set(name, Number(id));
        }
        const fromContent: Record<number, number> = {};
        for (const file of files(join(CONTENT, 'scripts'), '.obj')) {
            for (const block of readFileSync(file, 'latin1').split(/^(?=\[)/m)) {
                if (!/^param=specwep,\^true$/m.test(block)) continue;
                const name = /^\[(.+)\]/.exec(block)![1];
                const energy = /^param=sa_energy,(\d+)$/m.exec(block)?.[1] ?? '1000';
                fromContent[ids.get(name)!] = Number(energy) / 10;
            }
        }
        expect(Object.keys(fromContent).length).toBeGreaterThan(0);
        expect(Object.fromEntries(Object.entries(SPECIAL_WEAPONS).map(([id, w]) => [id, w.cost]))).toEqual(fromContent);
    });

    test('every specbar carries the option findSpecialBar looks for', () => {
        const interfaces = files(join(CONTENT, 'scripts/skill_combat/interfaces'), '.if').filter(f => readFileSync(f, 'latin1').includes('[specbar]'));
        expect(interfaces.length).toBeGreaterThanOrEqual(14);
        for (const file of interfaces) {
            expect(/^\[specbar\]\n(?:.+\n)*?option=(.*)$/m.exec(readFileSync(file, 'latin1'))?.[1]).toMatch(/Spec\w*al Attack/);
        }
    });

    test('only the instant specials never turn sa_attack on', () => {
        const script = readFileSync(join(CONTENT, 'scripts/skill_combat/scripts/player/specwep.rs2'), 'latin1');
        expect(script).toMatch(/\$weapon = dragon_battleaxe/);
        expect(script).toMatch(/\$weapon = excalibur/);
        const instant = Object.entries(SPECIAL_WEAPONS).filter(([, w]) => w.instant).map(([id]) => Number(id));
        expect(instant).toEqual([35, DRAGON_BATTLEAXE]);
    });
});
