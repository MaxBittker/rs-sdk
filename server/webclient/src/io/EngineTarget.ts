// Where the game engine's sockets connect. Defaults to the page's own origin;
// an optional ?engine=host[:port] lets a locally served client play against a
// remote engine (e.g. a local gateway + patched client fronting the hosted server).
export function engineTarget(): { host: string; secured: boolean } {
    const override = new URLSearchParams(window.location.search).get('engine');
    if (!override) {
        return { host: window.location.host, secured: window.location.protocol === 'https:' };
    }
    const local = override.startsWith('localhost') || override.startsWith('127.');
    return { host: override, secured: !local };
}
