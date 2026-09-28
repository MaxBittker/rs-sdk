import { describe, expect, test } from 'bun:test';
import { ConsoleCapture } from '../../mcp/console-capture';

describe('ConsoleCapture', () => {
    test('keeps every line while under the cap', () => {
        const c = new ConsoleCapture(3, 3);
        for (const l of ['a', 'b', 'c', 'd']) c.push(l);
        expect(c.lines()).toEqual(['a', 'b', 'c', 'd']);
        expect(c.total).toBe(4);
    });

    test('keeps head and most recent tail, marks the gap', () => {
        const c = new ConsoleCapture(2, 3);
        for (let i = 1; i <= 10; i++) c.push(`line ${i}`);
        const lines = c.lines();
        expect(lines.slice(0, 2)).toEqual(['line 1', 'line 2']);
        expect(lines[2]).toContain('5 line(s) omitted');
        expect(lines.slice(3)).toEqual(['line 8', 'line 9', 'line 10']);
        expect(c.length).toBe(5);
        expect(c.total).toBe(10);
    });

    test('clips overlong lines', () => {
        const c = new ConsoleCapture(5, 5, 10);
        c.push('x'.repeat(25));
        expect(c.lines()[0]).toBe(`${'x'.repeat(10)} … [15 more chars]`);
    });

    test('works with no tail', () => {
        const c = new ConsoleCapture(1, 0);
        for (const l of ['a', 'b', 'c']) c.push(l);
        expect(c.lines()).toEqual(['a', expect.stringContaining('2 line(s) omitted')]);
    });

    test('stays bounded under a tight synchronous error loop', () => {
        // The failure mode this guards against: a catch block that logs and
        // loops without awaiting, so nothing ever drains the buffer.
        const c = new ConsoleCapture();
        for (let i = 0; i < 1_000_000; i++) {
            c.push(`err TypeError: bot.attackNpc is not a function (${i})`);
        }
        expect(c.length).toBe(600);
        expect(c.total).toBe(1_000_000);
        expect(c.lines().at(-1)).toContain('(999999)');
    });
});
