import fs from 'fs';
import path from 'path';
import { MIME_TYPES } from '../utils.js';

export function handleDisclaimerPage(url: URL): Response | null {
    if (url.pathname !== '/disclaimer' && url.pathname !== '/disclaimer/') {
        return null;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Disclaimer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #ccc;
            margin: 0;
            padding: 40px 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 700px;
            margin: 0 auto;
            background: rgba(255,255,255,0.03);
            padding: 40px;
            border-radius: 8px;
        }
        h1 {
            color: #5bf;
            margin-bottom: 24px;
        }
        p {
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Disclaimer</h1>
        <p>This is a free, open-source, community-run project.</p>
        <p>The goal is strictly education and scientific research.</p>
        <p>LostCity Server was written from scratch after many hours of research and peer review. Everything you see is completely and transparently open source.</p>
        <p>We have not been endorsed by, authorized by, or officially communicated with Jagex Ltd. on our efforts here.</p>
        <p>You cannot play Old School RuneScape here, buy RuneScape gold, or access any of the official game's services!</p>
    </div>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

export function handleMapviewPage(url: URL): Response | null {
    if (url.pathname !== '/mapview' && url.pathname !== '/mapview/') {
        return null;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>World Map</title>
    <style>
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            background: black;
            overflow: hidden;
            width: 100%;
            height: 100%;
            position: fixed;
            touch-action: none;
            -webkit-overflow-scrolling: none;
            overscroll-behavior: none;
        }
        canvas {
            display: block;
            width: 100%;
            height: 100%;
            touch-action: none;
        }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>
    <script type="module">
        import { MapView } from '/client/mapview.js';
        const canvas = document.getElementById('canvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        new MapView();
    </script>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// Map URL prefixes to webclient build output directories.
// The webclient builds into ../webclient/out/ relative to the engine CWD,
// so we serve those files directly instead of requiring a copy step.
const WEBCLIENT_OUT = path.resolve('../webclient/out');
const WEBCLIENT_ROUTES: Record<string, string> = {
    '/client/': path.join(WEBCLIENT_OUT, 'standard'),
    '/bot/': path.join(WEBCLIENT_OUT, 'bot'),
};

function resolveWebclientPath(pathname: string): string | null {
    for (const [prefix, dir] of Object.entries(WEBCLIENT_ROUTES)) {
        if (pathname.startsWith(prefix)) {
            const file = pathname.slice(prefix.length);
            const resolved = path.resolve(dir, file);
            // Prevent path traversal
            if (!resolved.startsWith(dir)) return null;
            return resolved;
        }
    }
    return null;
}

export function handlePublicFiles(url: URL): Response | null {
    // Check engine/public/ first (favicon, images, etc.)
    const publicPath = `public${url.pathname}`;
    if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
        return new Response(Bun.file(publicPath), {
            headers: {
                'Content-Type': MIME_TYPES.get(path.extname(url.pathname ?? '')) ?? 'text/plain'
            }
        });
    }

    // Fall back to webclient build output
    const webclientPath = resolveWebclientPath(url.pathname);
    if (webclientPath && fs.existsSync(webclientPath) && fs.statSync(webclientPath).isFile()) {
        return new Response(Bun.file(webclientPath), {
            headers: {
                'Content-Type': MIME_TYPES.get(path.extname(url.pathname ?? '')) ?? 'text/plain'
            }
        });
    }

    return null;
}
