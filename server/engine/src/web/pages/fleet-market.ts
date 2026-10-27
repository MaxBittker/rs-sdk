import { createHash, timingSafeEqual } from 'node:crypto';
import Environment from '#/util/Environment.js';
import { marketStore, OFFER_SLOTS } from '#/engine/market/MarketStore.js';
import { projectMarketOffers } from '#/engine/market/MarketProjection.js';
import { toSafeName } from '#/util/JString.js';

const PATH = '/api/market/fleet/offers';
const MAX_BODY_BYTES = 16_384;
const MAX_ACCOUNTS = 64;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (status: number, body: object, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });

function validToken(provided: string, expected: string): boolean {
    // Hashing first keeps timingSafeEqual's inputs equal-length even for a bad token length.
    const left = createHash('sha256').update(provided).digest();
    const right = createHash('sha256').update(expected).digest();
    return timingSafeEqual(left, right);
}

/** Authenticated service-to-service reads. Never add this route to the public CORS API. */
export async function handleFleetMarket(req: Request, url: URL): Promise<Response | null> {
    if (url.pathname !== PATH) return null;
    if (req.method !== 'POST') return reply(405, { error: 'Fleet offers require POST.' }, { Allow: 'POST' });
    if (!Environment.FLEET_MARKET_TOKEN || !Environment.FLEET_MARKET_OWNERS.length) return reply(503, { error: 'Fleet market is not configured.' });
    const authorization = req.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !validToken(token, Environment.FLEET_MARKET_TOKEN)) return reply(401, { error: 'Unauthorized.' }, { 'WWW-Authenticate': 'Bearer' });
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(415, { error: 'JSON only.' });
    const length = Number(req.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) return reply(413, { error: 'Request body is too large.' });
    let text: string;
    try {
        text = await req.text();
    } catch {
        return reply(400, { error: 'Invalid request body.' });
    }
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) return reply(413, { error: 'Request body is too large.' });
    let body: { owners?: unknown };
    try {
        body = JSON.parse(text);
    } catch {
        return reply(400, { error: 'Invalid JSON.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.owners) || body.owners.length < 1 || body.owners.length > MAX_ACCOUNTS) {
        return reply(400, { error: `owners must contain 1 to ${MAX_ACCOUNTS} account names.` });
    }
    const allowed = new Set(Environment.FLEET_MARKET_OWNERS.map((name: string) => toSafeName(name)));
    const seen = new Set<string>();
    const owners: { owner: string; ledgerOwner: string }[] = [];
    for (const value of body.owners) {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_ ]{1,12}$/.test(value.trim())) return reply(400, { error: 'Invalid account name.' });
        const owner = value.trim();
        const ledgerOwner = toSafeName(owner);
        if (!ledgerOwner || ledgerOwner === 'invalid_name') return reply(400, { error: 'Invalid account name.' });
        if (seen.has(ledgerOwner)) return reply(400, { error: 'Duplicate account name.' });
        seen.add(ledgerOwner);
        if (!allowed.has(ledgerOwner)) return reply(403, { error: 'Account is not authorized for fleet market access.' });
        owners.push({ owner, ledgerOwner });
    }
    try {
        // All ledger reads are synchronous after validation: requests cannot observe a partial fleet refresh.
        const store = marketStore();
        return reply(200, {
            at: new Date().toISOString(),
            accounts: owners.map(({ owner, ledgerOwner }) => ({ owner, offers: projectMarketOffers(store, ledgerOwner).slice(0, OFFER_SLOTS) }))
        });
    } catch (error) {
        console.error('[fleet-market] Ledger read failed', error);
        return reply(503, { error: 'Fleet market temporarily unavailable.' });
    }
}
