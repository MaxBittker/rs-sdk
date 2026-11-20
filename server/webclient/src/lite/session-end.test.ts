// How a session decides that it ended. The server can send LOGOUT and close the
// socket in the same moment; the close keeps the bytes that are already queued,
// so the LOGOUT must be read before the close counts as a disconnect.
//
// Drives pumpSessionEnd with a fake client, and once with a real ClientStream
// over a fake socket, because the queued bytes live in the stream.

import { expect, test } from 'bun:test';

import ClientStream from '#/io/ClientStream.js';
import { ServerProt } from '#/io/ServerProt.js';

import { pumpSessionEnd } from './session.js';

type Client = Parameters<typeof pumpSessionEnd>[0];

const client = (parts: Partial<Client>): Client => ({
    isLoggedOut: () => false,
    isInGame: () => true,
    pumpPackets: async () => {},
    ...parts
});

test('a LOGOUT that arrived before the socket closed ends the session as logged-out', async () => {
    const socket: any = {};
    const stream = new ClientStream(socket);
    socket.onmessage({ data: Uint8Array.of(ServerProt.LOGOUT).buffer });
    socket.onclose({});

    let loggedOut = false;
    const reason = await pumpSessionEnd({
        isLoggedOut: () => loggedOut,
        isInGame: () => !stream.isClosed,
        pumpPackets: async () => {
            if (stream.available > 0) {
                loggedOut = (await stream.read()) === ServerProt.LOGOUT;
            }
        }
    });

    expect(reason).toBe('logged-out');
    expect(stream.available).toBe(0);
});

test('a socket that closes with no LOGOUT ends the session as disconnected', async () => {
    expect(await pumpSessionEnd(client({ isInGame: () => false }))).toBe('disconnected');
});

test('an open session carries on', async () => {
    expect(await pumpSessionEnd(client({}))).toBeNull();
});

test('a logout that is already seen does not read the closed stream again', async () => {
    const seen = client({
        isLoggedOut: () => true,
        isInGame: () => false,
        pumpPackets: async () => {
            throw Error('read after logout');
        }
    });
    expect(await pumpSessionEnd(seen)).toBe('logged-out');
});

test('a packet error is thrown, not reported as a logout', async () => {
    const broken = client({
        pumpPackets: async () => {
            throw Error('bad stream');
        }
    });
    await expect(pumpSessionEnd(broken)).rejects.toThrow('bad stream');
});
