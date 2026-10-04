// preferDirectGateway: SDK WebSockets go straight to a gateway's own port when
// it answers (compressed frames, no relay through the game server's tick
// thread) and stay on the relayed /gateway URL when it doesn't.

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';

import { deriveGatewayUrl, forgetDirectGateway, preferDirectGateway } from '../index';

let server: Server | null = null;
afterEach(() => {
    server?.stop(true);
    server = null;
    delete process.env.GATEWAY_DIRECT;
});

describe('preferDirectGateway', () => {
    test('uses the direct port when it answers', async () => {
        server = Bun.serve({ port: 0, fetch: () => new Response('Gateway Service') });
        const direct = `ws://localhost:${server.port}`;
        const relayed = 'wss://example.test/gateway';
        expect(await preferDirectGateway(relayed, { [relayed]: direct })).toBe(direct);
    });

    test('keeps the relayed URL when the direct port is unreachable', async () => {
        // Bind then release a port so nothing is listening on it.
        const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
        const closedPort = probe.port;
        probe.stop(true);
        const relayed = 'wss://unreachable.test/gateway';
        expect(await preferDirectGateway(relayed, { [relayed]: `ws://localhost:${closedPort}` })).toBe(relayed);
    });

    test('keeps the relayed URL when the direct port answers with an error', async () => {
        server = Bun.serve({ port: 0, fetch: () => new Response('nope', { status: 502 }) });
        const relayed = 'wss://erroring.test/gateway';
        expect(await preferDirectGateway(relayed, { [relayed]: `ws://localhost:${server.port}` })).toBe(relayed);
    });

    test('GATEWAY_DIRECT=false opts out', async () => {
        server = Bun.serve({ port: 0, fetch: () => new Response('Gateway Service') });
        process.env.GATEWAY_DIRECT = 'false';
        const relayed = 'wss://optout.test/gateway';
        expect(await preferDirectGateway(relayed, { [relayed]: `ws://localhost:${server.port}` })).toBe(relayed);
    });

    test('leaves URLs without a direct gateway untouched', async () => {
        expect(await preferDirectGateway('ws://localhost:7780')).toBe('ws://localhost:7780');
        expect(await preferDirectGateway('wss://other-server.test/gateway')).toBe('wss://other-server.test/gateway');
    });

    test('the public demo server has a direct gateway, keyed by its derived URL', () => {
        // HTTP helpers keep deriving from the relayed origin; only the socket moves.
        expect(deriveGatewayUrl('rs-sdk-demo.fly.dev')).toBe('wss://rs-sdk-demo.fly.dev/gateway');
    });
});

describe('forgetDirectGateway', () => {
    test('a forgotten check probes again and falls back once the port is gone', async () => {
        server = Bun.serve({ port: 0, fetch: () => new Response('Gateway Service') });
        const relayed = 'wss://restarting.test/gateway';
        const gateways = { [relayed]: `ws://localhost:${server.port}` };
        expect(await preferDirectGateway(relayed, gateways)).toBe(gateways[relayed]);

        server.stop(true);
        server = null;
        // Cached: still answers direct until a failed connect forgets it.
        expect(await preferDirectGateway(relayed, gateways)).toBe(gateways[relayed]);
        forgetDirectGateway(relayed, gateways);
        expect(await preferDirectGateway(relayed, gateways)).toBe(relayed);
    });
});
