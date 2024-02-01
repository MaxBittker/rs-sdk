import net, { Server } from 'net';

import Packet from '#jagex2/io/Packet.js';

import ClientSocket from '#lostcity/server/ClientSocket.js';

import Environment from '#lostcity/util/Environment.js';

export default class TcpServer {
    tcp: Server;

    constructor() {
        this.tcp = net.createServer();
    }

    start() {
        this.tcp.on('connection', (s: net.Socket) => {
            s.setTimeout(30000);
            s.setNoDelay(true);

            const ip: string = s.remoteAddress ?? 'unknown';
            console.log(`[Maintenance]: Connection from ${ip}`);

            const socket = new ClientSocket(s, ip, ClientSocket.TCP);

            const seed = Packet.alloc(8);
            seed.p4(Math.floor(Math.random() * 0xffffffff));
            seed.p4(Math.floor(Math.random() * 0xffffffff));
            socket.send(seed.data);

            s.on('data', (_data: Buffer) => {
                socket.send(Uint8Array.from([14]));
                socket.close();
            });

            s.on('close', () => {
                console.log(`[Maintenance]: Disconnected from ${socket.remoteAddress}`);
            });

            s.on('end', () => {
                socket.terminate();
            });

            s.on('error', (/* err */) => {
                socket.terminate();
            });

            s.on('timeout', () => {
                socket.terminate();
            });
        });

        this.tcp.listen(Environment.GAME_PORT as number, '0.0.0.0', () => {
            console.log(`[Maintenance]: Listening on port ${Environment.GAME_PORT}`);
        });
    }
}
