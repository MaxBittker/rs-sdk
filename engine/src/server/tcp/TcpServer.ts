import net from 'net';

import Packet from '#/io/Packet.js';

import Environment from '#/util/Environment.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import TcpClientSocket from '#/server/tcp/TcpClientSocket.js';
import World from '#/engine/World.js';

export default class TcpServer {
    tcp: net.Server;

    constructor() {
        this.tcp = net.createServer();
    }

    start() {
        this.tcp.on('connection', (s: net.Socket) => {
            s.setTimeout(30000);
            s.setNoDelay(true);

            const client = new TcpClientSocket(s, s.remoteAddress ?? 'unknown');

            // todo: connection negotiation feature flag
            const seed = new Packet(new Uint8Array(8));
            seed.p4(Math.floor(Math.random() * 0xffffffff));
            seed.p4(Math.floor(Math.random() * 0xffffffff));
            client.send(seed.data);
            client.state = 0;

            s.on('data', (data: Buffer) => {
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

            s.on('close', () => {
                client.state = -1;

                if (client.player) {
                    client.player.addSessionLog(2, 'TCP socket closed');
                    client.player.client = new NullClientSocket();
                }
            });

            s.on('error', (err) => {
                if (client.player) {
                    client.player.addSessionLog(2, 'TCP socket error', err.message);
                }

                s.destroy();
            });

            s.on('timeout', () => {
                if (client.player) {
                    client.player.addSessionLog(2, 'TCP socket timeout');
                }

                s.destroy();
            });
        });

        this.tcp.listen(Environment.NODE_PORT, '0.0.0.0', () => {
        });
    }
}
