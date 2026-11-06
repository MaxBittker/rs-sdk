import { describe, expect, test } from 'bun:test';
import { parseAutoLaunchBrowser } from '../../mcp/api/index';

describe('AUTO_LAUNCH_BROWSER', () => {
    test('parses false, true and auto, and leaves anything else to the default', () => {
        expect(parseAutoLaunchBrowser('false')).toBe(false);
        expect(parseAutoLaunchBrowser(' TRUE ')).toBe(true);
        expect(parseAutoLaunchBrowser('auto')).toBe('auto');
        expect(parseAutoLaunchBrowser(undefined)).toBeUndefined();
        expect(parseAutoLaunchBrowser('')).toBeUndefined();
        expect(parseAutoLaunchBrowser('sometimes')).toBeUndefined();
    });
});
