import path from 'path';
import { isIP } from 'node:net';

export function getIp(req: Request, behindFlyProxy = Boolean(process.env.FLY_APP_NAME)): string | null {
    // Only Fly's ingress can vouch for this header. Outside Fly, callers fall
    // back to the socket peer; arbitrary forwarded headers are never trusted.
    if (!behindFlyProxy) return null;
    const ip = req.headers.get('fly-client-ip')?.trim();
    return ip && isIP(ip) ? ip : null;
}

// Fly Proxy tells us which edge accepted the client and the client's IP. The
// gateway can't see either through the loopback /gateway hop, so pass them
// along for its per-swarm bandwidth stats (GET /traffic on port 7780).
export function gatewayLabelQuery(req: Request): string {
    const params = new URLSearchParams();
    const edge = req.headers.get('fly-region') ?? '';
    const ip = req.headers.get('fly-client-ip')?.trim() ?? '';
    if (/^[a-z]{3}$/.test(edge)) params.set('edge', edge);
    if (isIP(ip)) params.set('ip', ip);
    const query = params.toString();
    return query ? `?${query}` : '';
}

export const MIME_TYPES = new Map<string, string>([
    ['.js', 'application/javascript'],
    ['.mjs', 'application/javascript'],
    ['.css', 'text/css'],
    ['.html', 'text/html'],
    ['.wasm', 'application/wasm'],
    ['.sf2', 'application/octet-stream'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.png', 'image/png'],
]);

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function timeAgo(ms: number): string {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSecs}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m`;
}

export function getMimeType(filePath: string): string {
    const ext = path.extname(filePath);
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.json') return 'application/json';
    if (ext === '.jsonl') return 'application/jsonl';
    if (ext === '.html') return 'text/html';
    return MIME_TYPES.get(ext) ?? 'application/octet-stream';
}

// Skill names for hiscores (index = stat id, hiscore type = index + 1)
export const SKILL_NAMES = [
    'Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
    'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting',
    'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', null, null, 'Runecraft'
];

export const ENABLED_SKILLS = SKILL_NAMES
    .map((name, i) => name ? { id: i, name } : null)
    .filter(Boolean) as { id: number; name: string }[];
