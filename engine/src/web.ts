import fs from 'fs';
import path from 'path';

import ejs from 'ejs';
import { register } from 'prom-client';

import { CrcBuffer } from '#/cache/CrcTable.js';
import World from '#/engine/World.js';
// import { getPublicPerDeploymentToken } from '#/io/PemUtil.js';
import { LoggerEventType } from '#/server/logger/LoggerEventType.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import WSClientSocket from '#/server/ws/WSClientSocket.js';
import Environment from '#/util/Environment.js';
import OnDemand from '#/engine/OnDemand.js';

function getIp(req: Request) {
    // todo: environment flag to respect cf-connecting-ip (NOT safe if origin is exposed publicly by IP + proxied)
    const forwardedFor = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for');
    if (!forwardedFor) {
        return null;
    }

    return forwardedFor.split(',')[0].trim();
}

const MIME_TYPES = new Map<string, string>();
MIME_TYPES.set('.js', 'application/javascript');
MIME_TYPES.set('.mjs', 'application/javascript');
MIME_TYPES.set('.css', 'text/css');
MIME_TYPES.set('.html', 'text/html');
MIME_TYPES.set('.wasm', 'application/wasm');
MIME_TYPES.set('.sf2', 'application/octet-stream');

export type WebSocketData = {
    client: WSClientSocket,
    remoteAddress: string
};

export type WebSocketRoutes = {
    '/': Response
};

export async function startWeb() {
    Bun.serve<WebSocketData, WebSocketRoutes>({
        port: Environment.WEB_PORT,
        async fetch(req, server) {
            const url = new URL(req.url ?? `', 'http://${req.headers.get('host')}`);

            if (url.pathname === '/') {
                const upgraded = server.upgrade(req, {
                    data: {
                        client: new WSClientSocket(),
                        remoteAddress: getIp(req)
                    }
                });

                if (upgraded) {
                    return undefined;
                }

                return new Response(null, { status: 404 });
            } else if (url.pathname.startsWith('/crc')) {
                return new Response(CrcBuffer.data);
            } else if (url.pathname.startsWith('/title')) {
                return new Response(await Bun.file('data/pack/client/title').bytes());
            } else if (url.pathname.startsWith('/config')) {
                return new Response(await Bun.file('data/pack/client/config').bytes());
            } else if (url.pathname.startsWith('/interface')) {
                return new Response(await Bun.file('data/pack/client/interface').bytes());
            } else if (url.pathname.startsWith('/media')) {
                return new Response(await Bun.file('data/pack/client/media').bytes());
            } else if (url.pathname.startsWith('/versionlist')) {
                return new Response(await Bun.file('data/pack/client/versionlist').bytes());
            } else if (url.pathname.startsWith('/textures')) {
                return new Response(await Bun.file('data/pack/client/textures').bytes());
            } else if (url.pathname.startsWith('/wordenc')) {
                return new Response(await Bun.file('data/raw/wordenc').bytes());
            } else if (url.pathname.startsWith('/sounds')) {
                return new Response(await Bun.file('data/pack/client/sounds').bytes());
            } else if (url.pathname === '/rs2.cgi') {
                return new Response(await ejs.renderFile('view/client.ejs', {
                    nodeid: 10,
                    lowmem: 0,
                    members: 1,
                    per_deployment_token: ''
                }), {
                    headers: {
                        'Content-Type': 'text/html'
                    }
                });
            } else if (url.pathname.startsWith('/1/') || url.pathname.startsWith('/2/') || url.pathname.startsWith('/3/') || url.pathname.startsWith('/4/')) {
                const archive = parseInt(url.pathname.slice(1, 2));
                const file = parseInt(url.pathname.slice(3));

                return new Response(OnDemand.cache.read(archive, file), {
                    headers: {
                        'Content-Type': 'application/octet-stream'
                    }
                });
            } else if (fs.existsSync(`public${url.pathname}`)) {
                return new Response(await Bun.file(`public${url.pathname}`).bytes(), {
                    headers: {
                        'Content-Type': MIME_TYPES.get(path.extname(url.pathname ?? '')) ?? 'text/plain'
                    }
                });
            } else {
                return new Response(null, { status: 404 });
            }
        },
        websocket: {
            maxPayloadLength: 2000,
            open(ws) {
                /* TODO:
                if (Environment.WEB_SOCKET_TOKEN_PROTECTION) {
                    // if WEB_CONNECTION_TOKEN_PROTECTION is enabled, we must
                    // have a matching per-deployment token sent via cookie.
                    const headers = info.req.headers;
                    if (!headers.cookie) {
                        // no cookie
                        cb(false);
                        return;
                    }
                    // cookie string is present at least
                    // find exact match. NOTE: the double quotes are deliberate
                    const search = `per_deployment_token="${getPublicPerDeploymentToken()}"`;
                    // could do something more fancy with cookie parsing, but
                    // this seems fine.
                    if (headers.cookie.indexOf(search) === -1) {
                        cb(false);
                        return;
                    }
                }
                const { origin } = info;

                // todo: check more than just the origin header (important!)
                if (Environment.WEB_ALLOWED_ORIGIN && origin !== Environment.WEB_ALLOWED_ORIGIN) {
                    cb(false);
                    return;
                }

                cb(true);
                */

                ws.data.client.init(ws, ws.data.remoteAddress ?? ws.remoteAddress);
            },
            message(ws, message: Buffer) {
                try {
                    const { client } = ws.data;
                    if (client.state === -1 || client.remaining <= 0) {
                        client.terminate();
                        return;
                    }

                    client.buffer(message);

                    if (client.state === 0) {
                        World.onClientData(client);
                    } else if (client.state === 2) {
                        if (Environment.NODE_WS_ONDEMAND) {
                            OnDemand.onClientData(client);
                        } else {
                            client.terminate();
                        }
                    }
                } catch (_) {
                    ws.terminate();
                }
            },
            close(ws) {
                const { client } = ws.data;
                client.state = -1;

                if (client.player) {
                    client.player.addSessionLog(LoggerEventType.ENGINE, 'WS socket closed');
                    client.player.client = new NullClientSocket();
                }
            }
        }
    });
}

export async function startManagementWeb() {
    Bun.serve({
        port: Environment.WEB_MANAGEMENT_PORT,
        routes: {
            '/prometheus': new Response(await register.metrics(), {
                headers: {
                    'Content-Type': register.contentType
                }
            })
        },
        fetch() {
            return new Response(null, { status: 404 });
        },
    });
}
