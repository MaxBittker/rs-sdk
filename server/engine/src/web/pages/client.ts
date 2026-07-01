import ejs from 'ejs';

import { CrcBuffer } from '#/cache/CrcTable.js';
import OnDemand from '#/engine/OnDemand.js';
import { getPublicPerDeploymentToken } from '#/io/PemUtil.js';
import { tryParseInt } from '#/util/TryParse.js';
import Environment from '#/util/Environment.js';

// Cache-bust token appended to the client.js module import URL so browsers fetch the
// fresh bundle after a deploy instead of a stale cached ES module. Changes every process
// start (i.e. every deploy/restart). Without this, the import URL is static and the browser
// caches the old client indefinitely (no version query + no cache headers historically).
const CLIENT_CACHEBUST = Date.now().toString(36);

export async function handleClientPage(url: URL): Promise<Response | null> {
    // Bot client at / and /bot
    if (url.pathname === '/' || url.pathname === '/bot' || url.pathname === '/bot/') {
        const lowmem = tryParseInt(url.searchParams.get('lowmem'), 0);
        const botUsername = url.searchParams.get('bot') || 'default';

        return new Response(await ejs.renderFile('view/bot.ejs', {
            nodeid: Environment.NODE_ID,
            lowmem,
            members: Environment.NODE_MEMBERS,
            botUsername,
            maxMessageLength: Environment.node.maxMessageLength,
            cachebust: CLIENT_CACHEBUST,
            per_deployment_token: Environment.WEB_SOCKET_TOKEN_PROTECTION ? getPublicPerDeploymentToken() : ''
        }), {
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }
        });
    }

    // Vanilla client at /vanilla
    if (url.pathname === '/vanilla' || url.pathname === '/vanilla/') {
        const lowmem = tryParseInt(url.searchParams.get('lowmem'), 0);

        return new Response(await ejs.renderFile('view/client.ejs', {
            nodeid: Environment.NODE_ID,
            lowmem,
            members: Environment.NODE_MEMBERS,
            cachebust: CLIENT_CACHEBUST,
            per_deployment_token: Environment.WEB_SOCKET_TOKEN_PROTECTION ? getPublicPerDeploymentToken() : ''
        }), {
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }
        });
    }

    if (url.pathname === '/rs2.cgi') {
        const plugin = tryParseInt(url.searchParams.get('plugin'), 0);
        const lowmem = tryParseInt(url.searchParams.get('lowmem'), 0);

        if (Environment.NODE_DEBUG && plugin === 1) {
            return new Response(await ejs.renderFile('view/java.ejs', {
                nodeid: Environment.NODE_ID,
                lowmem,
                members: Environment.NODE_MEMBERS,
                portoff: Environment.NODE_PORT - 43594
            }), {
                headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }
            });
        } else {
            return new Response(await ejs.renderFile('view/client.ejs', {
                nodeid: Environment.NODE_ID,
                lowmem,
                members: Environment.NODE_MEMBERS,
                cachebust: CLIENT_CACHEBUST,
                per_deployment_token: Environment.WEB_SOCKET_TOKEN_PROTECTION ? getPublicPerDeploymentToken() : ''
            }), {
                headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }
            });
        }
    }

    return null;
}

export function handleCacheEndpoints(url: URL): Response | null {
    if (url.pathname.startsWith('/crc')) {
        return new Response(Buffer.from(CrcBuffer.data));
    }
    if (url.pathname.startsWith('/title')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 1)!));
    }
    if (url.pathname.startsWith('/config')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 2)!));
    }
    if (url.pathname.startsWith('/interface')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 3)!));
    }
    if (url.pathname.startsWith('/media')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 4)!));
    }
    if (url.pathname.startsWith('/versionlist')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 5)!));
    }
    if (url.pathname.startsWith('/textures')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 6)!));
    }
    if (url.pathname.startsWith('/wordenc')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 7)!));
    }
    if (url.pathname.startsWith('/sounds')) {
        return new Response(Buffer.from(OnDemand.cache.read(0, 8)!));
    }
    if (url.pathname.startsWith('/ondemand.zip')) {
        return new Response(Bun.file('data/pack/ondemand.zip'));
    }
    if (url.pathname === '/worldmap.jag') {
        return new Response(Bun.file('data/pack/mapview/worldmap.jag'));
    }
    if (url.pathname.startsWith('/build')) {
        return new Response(Bun.file('data/pack/server/build'));
    }

    return null;
}
