import { describe, expect, test } from 'bun:test';
import { StateFieldSampler, TrafficMeter, formatFieldReport, formatTrafficReport, groupOf } from './traffic';

const ewr = { edge: 'ewr', ip: '203.0.113.7' };
const iad = { edge: 'iad', ip: '198.51.100.2' };

function meterAt(start = 1_000_000) {
    let now = start;
    const meter = new TrafficMeter(() => now);
    return { meter, advance: (ms: number) => { now += ms; } };
}

describe('groupOf', () => {
    test('drops trailing digits and separators', () => {
        expect(groupOf('goo004')).toBe('goo');
        expect(groupOf('Kuro_12')).toBe('kuro');
        expect(groupOf('bunswarm03')).toBe('bunswarm');
        expect(groupOf('ChiefKeefer')).toBe('chiefkeefer');
        expect(groupOf('1234')).toBe('1234');
    });
});

describe('TrafficMeter', () => {
    test('rates cover only the requested window', () => {
        const { meter, advance } = meterAt();
        meter.record('sdk_out', 'goo004', 'observe', ewr, 5_000_000); // before the window
        advance(10_000);
        meter.snapshot();
        advance(10_000);
        meter.record('sdk_out', 'goo004', 'observe', ewr, 1_000_000);
        meter.snapshot();

        const r = meter.report(10, { bots: ['goo004', 'goo005'], sdks: [{ bot: 'goo004', mode: 'observe' }] });
        expect(r.windowSec).toBe(10);
        expect(r.totals.sdk_out).toBe(0.1); // 1 MB over 10 s
    });

    test('attributes bytes to swarm, mode, edge and source', () => {
        const { meter, advance } = meterAt();
        advance(10_000);
        for (let i = 0; i < 10; i++) {
            meter.record('bot_in', 'goo004', '', ewr, 40_000);
            meter.record('sdk_out', 'goo004', 'control', ewr, 40_000);
            meter.record('sdk_out', 'goo004', 'observe', ewr, 40_000);
            meter.record('sdk_out', 'goo005', 'observe', ewr, 40_000);
            meter.record('sdk_out', 'kuro01', 'control', iad, 20_000);
        }
        meter.record('sdk_out', 'ChiefKeefer', 'control', iad, 1_000);

        const r = meter.report(60, {
            bots: ['goo004', 'goo005', 'kuro01', 'kuro02', 'ChiefKeefer'],
            sdks: [{ bot: 'goo004', mode: 'control' }, { bot: 'goo004', mode: 'observe' }, { bot: 'goo005', mode: 'observe' }]
        });

        const goo = r.groups.find(g => g.group === 'goo')!;
        expect(goo.bots).toBe(2);
        expect(goo.subs).toEqual({ control: 1, observe: 2 });
        expect(goo.inMBps).toBe(0.04);
        expect(goo.outMBps).toBe(0.12);
        expect(goo.avgOutFrameKB).toBe(40);
        expect(goo.sdkOutMBpsByMode).toEqual({ control: 0.04, observe: 0.08 });
        expect(r.groups[0].group).toBe('goo'); // most expensive first

        // single-account names fold into one row instead of one row each
        expect(r.groups.some(g => g.group === 'chiefkeefer')).toBe(false);
        expect(r.groups.find(g => g.group.startsWith('(single accounts'))?.bots).toBe(1);

        expect(r.edges.map(e => e.edge)).toEqual(['ewr', 'iad']);
        expect(r.sources[0]).toMatchObject({ ip: '203.0.113.7', groups: ['goo'] });
    });

    test('cost estimate charges the cross-region hop only off non-iad edges', () => {
        const { meter, advance } = meterAt();
        advance(10_000);
        meter.record('sdk_out', 'a01', 'control', iad, 1e9);
        meter.record('sdk_out', 'b01', 'control', ewr, 1e9);
        meter.record('bot_in', 'b01', '', ewr, 1e9);
        const r = meter.report(10, { bots: ['a01', 'a02', 'b01', 'b02'], sdks: [] });
        const perMonth = 30 * 24 * 3600 / 10;
        const a = r.groups.find(g => g.group === 'a')!;
        const b = r.groups.find(g => g.group === 'b')!;
        expect(a.estUsdPerMonth).toBe(Math.round(0.02 * perMonth));
        expect(b.estUsdPerMonth).toBe(Math.round((0.02 + 0.006 * 2) * perMonth));
    });

    test('keeps at most ten minutes of snapshots', () => {
        const { meter, advance } = meterAt();
        for (let i = 0; i < 100; i++) {
            advance(10_000);
            meter.record('bot_in', 'goo004', '', ewr, 1000);
            meter.snapshot();
        }
        expect(meter.report(3600, { bots: [], sdks: [] }).windowSec).toBe(600);
    });

    test('text format renders every section', () => {
        const { meter, advance } = meterAt();
        advance(10_000);
        meter.record('sdk_out', 'goo004', 'observe', ewr, 1000);
        const text = formatTrafficReport(meter.report(60, { bots: ['goo004', 'goo005'], sdks: [] }));
        expect(text).toContain('goo');
        expect(text).toContain('ewr');
        expect(text).toContain('203.0.113.7');
    });
});

describe('StateFieldSampler', () => {
    test('measures field shares and tick-to-tick repetition on sampled pairs', () => {
        const sampler = new StateFieldSampler(3, () => 0); // sample every 3rd frame
        const bank = { items: 'b'.repeat(900) };
        for (let tick = 0; tick < 9; tick++) {
            sampler.observe('goo004', { tick, bank, player: { x: tick } });
        }
        const r = sampler.report();
        expect(r.all.pairs).toBe(2);
        const fields = Object.fromEntries(r.all.fields.map(f => [f.field, f]));
        expect(fields.bank.unchangedPct).toBe(100);
        expect(fields.tick.unchangedPct).toBe(0);
        expect(fields.player.unchangedPct).toBe(0);
        expect(r.all.fields[0].field).toBe('bank');
        expect(r.groups[0].group).toBe('goo');
        expect(r.all.unchangedPct).toBeGreaterThan(95);
        expect(formatFieldReport(r)).toContain('bank');
    });

    test('pairs are consecutive frames from the same bot, not interleaved bots', () => {
        const sampler = new StateFieldSampler(2, () => 0);
        sampler.observe('a01', { v: 1 });
        sampler.observe('b01', { v: 1 });   // other bot in between
        sampler.observe('a01', { v: 1 });   // a01's next frame: unchanged
        const r = sampler.report();
        expect(r.groups.find(g => g.group === 'a')?.unchangedPct).toBe(100);
    });
});
