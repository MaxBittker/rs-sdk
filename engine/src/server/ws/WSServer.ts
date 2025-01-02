import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

import Packet from '#/io/Packet.js';

import Environment from '#/util/Environment.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import WSClientSocket from '#/server/ws/WSClientSocket.js';
import World from '#/engine/World.js';

function getIp(req: IncomingMessage) {
    let forwardedFor = req.headers['x-forwarded-for'];

    if (!forwardedFor) {
        return req.socket.remoteAddress;
    }

    if (Array.isArray(forwardedFor)) {
        forwardedFor = forwardedFor[0];
    }

    return forwardedFor.split(',')[0].trim();
}

// todo: websocket keepalives
export default class WSServer {
    wss: WebSocketServer | null = null;

    start() {
        this.wss = new WebSocketServer({ port: Environment.NODE_PORT + 1, host: '0.0.0.0' }, () => {
        });

        this.wss.on('connection', (ws: WebSocket, req) => {
            const client = new WSClientSocket(ws, getIp(req) ?? 'unknown');

            // todo: connection negotation feature flag
            const seed = new Packet(new Uint8Array(8));
            seed.p4(Math.floor(Math.random() * 0xffffffff));
            seed.p4(Math.floor(Math.random() * 0xffffffff));
            client.send(seed.data);

            ws.on('message', (data: Buffer) => {
                try {
                    if (client.state === -1 || client.remaining <= 0) {
                        client.terminate();
                        return;
                    }

                    client.buffer(data);
                    World.onClientData(client);
                } catch (err) {
                    client.terminate();
                }
            });

            ws.on('close', () => {
                client.state = -1;

                if (client.player) {
                    client.player.addSessionLog(2, 'WS socket closed');
                    client.player.client = new NullClientSocket();
                }
            });

            ws.on('error', (err) => {
                if (client.player) {
                    client.player.addSessionLog(2, 'WS socket error', err.message);
                }

                ws.terminate();
            });
        });
    }
}
