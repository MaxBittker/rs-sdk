// The per-IP login cap (World.PLAYER_MAX_PER_IP) keys on getIp. Only Fly's
// ingress header may set it: client-supplied forwarding headers would let a
// swarm claim a fresh IP per connection and walk past the cap.

import { describe, expect, test } from 'bun:test';

import { getIp } from '../src/web/utils.ts';

const req = (headers: Record<string, string>) => new Request('http://game/bot', { headers });

describe('getIp', () => {
    test('uses Fly-Client-IP behind Fly', () => {
        expect(getIp(req({ 'fly-client-ip': '203.0.113.9' }), true)).toBe('203.0.113.9');
        expect(getIp(req({ 'fly-client-ip': '2a09:bac1:5500::3e3:2c' }), true)).toBe('2a09:bac1:5500::3e3:2c');
    });

    test('ignores client-supplied forwarding headers', () => {
        const spoofed = req({ 'fly-client-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1, 203.0.113.9', 'cf-connecting-ip': '198.51.100.2' });
        expect(getIp(spoofed, true)).toBe('203.0.113.9');
        expect(getIp(req({ 'x-forwarded-for': '198.51.100.1' }), true)).toBeNull();
    });

    test('rejects a malformed header', () => {
        expect(getIp(req({ 'fly-client-ip': 'not-an-ip' }), true)).toBeNull();
    });

    test('outside Fly, defers to the socket peer', () => {
        expect(getIp(req({ 'fly-client-ip': '203.0.113.9' }), false)).toBeNull();
    });
});
