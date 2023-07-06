import { WebSocketServer } from 'ws';

import ClientSocket from '#lostcity/server/ClientSocket.js';
import Packet from '#jagex2/io/Packet.js';
import World from '#lostcity/engine/World.js';
import Login from '#lostcity/engine/Login.js';

// TODO: keepalives
export default class WSServer {
    wss = null;

    start() {
        this.wss = new WebSocketServer({ port: (Number(process.env.GAME_PORT) + 1), host: '0.0.0.0' }, () => {
            console.log(`[WSWorld]: Listening on port ${Number(process.env.GAME_PORT) + 1}`);
        });

        this.wss.on('connection', (ws, req) => {
            const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.connection.remoteAddress;
            console.log(`[WSWorld]: Connection from ${ip}`);

            let socket = new ClientSocket(ws, ip, ClientSocket.WEBSOCKET);

            let seed = new Packet(8);
            seed.p4(Math.floor(Math.random() * 0xFFFFFFFF));
            seed.p4(Math.floor(Math.random() * 0xFFFFFFFF));
            socket.send(seed.data);

            ws.on('message', (data) => {
                data = new Packet(data);

                if (socket.state === 1) {
                    World.readIn(socket, data);
                } else {
                    Login.readIn(socket, data);
                }
            });

            ws.on('close', () => {
                if (socket.state === 1) {
                    World.removePlayerBySocket(socket);
                }

                console.log(`[WSWorld]: Disconnected from ${ip}`);
            });
        });
    }
}
