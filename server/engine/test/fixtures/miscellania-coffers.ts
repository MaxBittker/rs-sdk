import { expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CompileServerScript } from '@lostcityrs/runescript';

const output = process.env.MISCELLANIA_TEST_OUTPUT!;
const cache = resolve('data/pack');
const compile = CompileServerScript;
mkdirSync(`${output}/source`);
copyFileSync(resolve('../content/scripts/engine.rs2'), `${output}/source/engine.rs2`);
copyFileSync(resolve('../content/scripts/minigames/game_managing_miscellania/scripts/managing_miscellania.rs2'), `${output}/source/managing_miscellania.rs2`);
// Only message rendering is stubbed; the actual money handlers and their dependencies compile normally.
writeFileSync(`${output}/source/messages.rs2`, '[proc,mesbox](string $message)\nreturn;\n');
// Keep the production compiler's symbols and pointer checks, but never overwrite the server cache.
mock.module('@lostcityrs/runescript', () => ({
    CompileServerScript: (config: Parameters<typeof CompileServerScript>[0]) =>
        compile({ ...config, sourcePaths: [`${output}/source`], writer: { jag: { output: `${output}/server` } } })
}));
const { runServerCompiler } = await import('../../tools/pack/Compiler.js');
runServerCompiler();

mkdirSync(`${output}/data/config`, { recursive: true });
copyFileSync(resolve('data/config/private.pem'), `${output}/data/config/private.pem`);
process.chdir(output);
class TestWorker extends EventEmitter { postMessage() {} }
mock.module('worker_threads', () => ({ Worker: TestWorker }));
await import('../../src/engine/World.js');
const { default: ObjType } = await import('../../src/cache/config/ObjType.js');
const { default: InvType } = await import('../../src/cache/config/InvType.js');
const { default: VarBitType } = await import('../../src/cache/config/VarBitType.js');
const { default: ScriptProvider } = await import('../../src/engine/script/ScriptProvider.js');
const { default: ScriptRunner } = await import('../../src/engine/script/ScriptRunner.js');
const { default: ScriptState } = await import('../../src/engine/script/ScriptState.js');
const { default: ScriptPointer } = await import('../../src/engine/script/ScriptPointer.js');
const { NetworkPlayer } = await import('../../src/engine/entity/NetworkPlayer.js');
const { default: NullClientSocket } = await import('../../src/server/NullClientSocket.js');
ObjType.load(cache);
InvType.load(cache);
VarBitType.load(cache);
expect(ScriptProvider.load(output)).toBeGreaterThan(0);

const inv = InvType.getId('inv');
const coins = ObjType.getId('coins');
const coffers = VarBitType.getId('misc_coffers');

function player(balance: number, cash: number) {
    const p = new NetworkPlayer('coffertest', 1n, 1n, new NullClientSocket());
    p.setVarBit(coffers, balance);
    if (cash > 0) p.invAdd(inv, coins, cash);
    return p;
}

function run(p: InstanceType<typeof NetworkPlayer>, button: 88 | 89, input: number, atDialog?: () => void) {
    const script = ScriptProvider.getByName(`[if_button,misc_both_manage:com_${button}]`)!;
    expect(script).toBeDefined();
    const state = ScriptRunner.init(script, p);
    state.pointerAdd(ScriptPointer.ProtectedActivePlayer);
    let requested = false;
    for (let step = 0; step < 20; step++) {
        const execution = ScriptRunner.execute(state);
        expect(execution).not.toBe(ScriptState.ABORTED);
        if (execution === ScriptState.FINISHED) return requested;
        if (execution === ScriptState.COUNTDIALOG) {
            expect(requested).toBe(false);
            requested = true;
            atDialog?.();
            state.lastInt = input;
        } else expect(execution).toBe(ScriptState.SUSPENDED);
    }
    throw new Error('Money handler did not finish');
}

function money(p: InstanceType<typeof NetworkPlayer>) {
    return [p.getVarBit(coffers), p.invTotal(inv, coins)];
}

test('deposits and withdrawals preserve money and reject invalid or stale amounts', () => {
    // The original exploit: coffer-space clamping must ALSO respect the inventory balance.
    for (const [balance, cash, input, moved] of [
        [0, 1, 2000000000, 1],
        [0, 100, 2147483647, 100],
        [4999000, 100, 2000, 100],
        [4999000, 2000, 2147483647, 1000],
        [0, 100, 50, 50],
        [0, 100, 100, 100],
        [0, 100, 101, 100],
        [0, 100, 0, 0],
        [0, 100, -1, 0],
        [0, 100, -2147483648, 0],
        [5000000, 100, 1, 0],
        [5000001, 100, 1, 0],
        [0, 0, 100, 0]
    ]) {
        const p = player(balance, cash);
        run(p, 88, input);
        expect(money(p)).toEqual([balance + moved, cash - moved]);
    }

    for (const input of [-2147483648, -1, 0, 1, 100, 101, 2147483647]) {
        const p = player(100, 25);
        const moved = Math.max(0, Math.min(input, 100));
        run(p, 89, input);
        expect(money(p)).toEqual([100 - moved, 25 + moved]);
    }

    const negative = player(1, 0);
    run(negative, 89, -134217726);
    expect(money(negative)).toEqual([1, 0]);

    // Already-inflated coffers can be withdrawn, but new deposits must never expand them.
    const inflated = player(134217727, 1);
    run(inflated, 88, 2000000000);
    expect(money(inflated)).toEqual([134217727, 1]);
    run(inflated, 89, 134217727);
    expect(money(inflated)).toEqual([0, 134217728]);

    const changed = player(0, 1000);
    run(changed, 88, 1000, () => changed.invDel(inv, coins, 900));
    expect(money(changed)).toEqual([100, 0]);

    const filled = player(4999000, 1000);
    run(filled, 88, 1000, () => filled.setVarBit(coffers, 5000000));
    expect(money(filled)).toEqual([5000000, 1000]);

    const spent = player(100, 25);
    run(spent, 89, 100, () => spent.setVarBit(coffers, 10));
    expect(money(spent)).toEqual([0, 35]);

    const emptied = player(100, 25);
    run(emptied, 89, 100, () => emptied.setVarBit(coffers, 0));
    expect(money(emptied)).toEqual([0, 25]);

    const full = player(100, 0);
    run(full, 89, 100, () => {
        for (let slot = 0; slot < full.invSize(inv); slot++) full.invSet(inv, ObjType.getId('tinderbox'), 1, slot);
    });
    expect(money(full)).toEqual([100, 0]);

    const overflow = player(100, 25);
    run(overflow, 89, 100, () => overflow.invSet(inv, coins, 2147483647, 0));
    expect(money(overflow)).toEqual([100, 2147483647]);

    const partial = player(100, 2147483640);
    run(partial, 89, 7);
    expect(money(partial)).toEqual([93, 2147483647]);

    const repeated = player(0, 100);
    for (let cycle = 0; cycle < 10; cycle++) {
        run(repeated, 88, 2147483647);
        run(repeated, 89, 2147483647);
        expect(money(repeated)).toEqual([0, 100]);
    }
    console.log('Miscellania coffer checks passed');
});

test('resource collection spends the points even when a fish share rounds to zero', () => {
    const restotal = VarBitType.getId('misc_restotal');
    const generate = ScriptProvider.getByName('[proc,manage_misc_resource_generation]')!;
    expect(generate).toBeDefined();
    const collect = (p: InstanceType<typeof NetworkPlayer>) => {
        const state = ScriptRunner.init(generate, p);
        state.pointerAdd(ScriptPointer.ProtectedActivePlayer);
        expect(ScriptRunner.execute(state)).toBe(ScriptState.FINISHED);
    };
    const totals = (p: InstanceType<typeof NetworkPlayer>) => ['cert_maple_logs', 'cert_raw_tuna', 'cert_raw_swordfish'].map(name => p.invTotal(inv, ObjType.getId(name)));

    // 41 points split 1 wood / 1 fish: 2 logs, 2 fish -> 1 tuna and 0 swordfish. inv_add(0) used to throw
    // after the logs and tuna were paid but before the points were cleared, so this repeated forever.
    const p = player(0, 0);
    p.setVarBit(restotal, 41);
    p.setVarBit(VarBitType.getId('misc_points_wood'), 1);
    p.setVarBit(VarBitType.getId('misc_points_fish'), 1);
    collect(p);
    expect(p.getVarBit(restotal)).toBe(0);
    expect(totals(p)).toEqual([2, 1, 0]);
    collect(p);
    expect(totals(p)).toEqual([2, 1, 0]);
    console.log('Miscellania collection checks passed');
});
