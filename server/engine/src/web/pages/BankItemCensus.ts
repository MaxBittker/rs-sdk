import type { BankSnapshot } from './BankHiscores.js';
import { escapeHtml } from '../utils.js';

export type BankCensusItemDefinition = { id: number; tradeable: boolean; quest: boolean };
export type BankItemTotal = { id?: number; name: string; quantity: number; holders: number; rarityEligible: boolean };
export type BankCensus = { banks: number; quantity: number; items: BankItemTotal[] };

export function summarizeBankItems(banks: BankSnapshot[], definitions: BankCensusItemDefinition[] = []): BankCensus {
    const catalog = new Map(definitions.map(item => [item.id, item]));
    const items = new Map<string, BankItemTotal>();
    let quantity = 0;
    for (const bank of banks) {
        const held = new Set<string>();
        for (const item of bank.items) {
            // Combine noted variants, jewellery charges and potion doses. The
            // linked holder board searches the base name to include all variants.
            const name = item.name.replace(/\s*\(\d+\)\s*$/, '').trim();
            const key = name.toLowerCase();
            const definition = item.id == null ? undefined : catalog.get(item.id);
            let total = items.get(key);
            if (!total) {
                total = { id: item.id, name, quantity: 0, holders: 0, rarityEligible: false };
                items.set(key, total);
            }
            total.quantity += item.count;
            if (definition?.tradeable && !definition.quest) total.rarityEligible = true;
            quantity += item.count;
            if (!held.has(key)) {
                total.holders++;
                held.add(key);
            }
        }
    }
    return { banks: banks.length, quantity, items: [...items.values()] };
}

export function renderBankItemCensus(census: BankCensus, url: URL, options: { profile: string; capturedAt: string; holdersBaseUrl?: string; assetBaseUrl?: string; refresh?: boolean }): Response {
    const search = (url.searchParams.get('q') || '').trim();
    const by = url.searchParams.get('by') === 'holders' ? 'holders' : 'quantity';
    const visible = census.items.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
    const base = options.holdersBaseUrl || '/hiscores/bank';
    const assets = options.assetBaseUrl || '';
    const order = (direction: number) =>
        visible
            .filter(item => direction !== 1 || item.rarityEligible)
            .sort((a, b) => direction * (a[by] - b[by]) || a.name.localeCompare(b.name, 'en') || (a.id ?? 0) - (b.id ?? 0))
            .slice(0, 50);
    const panel = (title: string, direction: number) => {
        const rows = order(direction)
            .map(item => {
                const query = new URLSearchParams({ profile: options.profile, q: item.name });
                const icon = item.id == null ? '' : `<img width="32" height="32" loading="lazy" src="${assets}/sprite/item/${item.id}.png" alt="">`;
                return `<tr><td><a class="item" href="${escapeHtml(`${base}?${query}`)}" title="View holders of items containing ${escapeHtml(item.name)}">${icon}<span>${escapeHtml(item.name)}</span></a></td><td class="number ${by === 'quantity' ? 'selected' : ''}">${item.quantity.toLocaleString('en-US')}</td><td class="number ${by === 'holders' ? 'selected' : ''}">${item.holders.toLocaleString('en-US')}</td></tr>`;
            })
            .join('');
        return `<section class="panel">
        <h2>${title}</h2>
        <table><thead><tr><th>Item</th><th class="number">Quantity</th><th class="number">Holders</th></tr></thead><tbody>
        ${rows || '<tr><td colspan="3" class="empty">No matching bank items</td></tr>'}
        </tbody></table>
    </section>`;
    };
    const timestamp = new Date(options.capturedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bank items</title>
<style>
    * { box-sizing: border-box; }
    body { margin:0; background:#000; color:#fff; font:13px Arial,Helvetica,sans-serif; }
    main { max-width:1080px; margin:24px auto; padding:18px; background:#17150f url('${assets}/img/background2.jpg'); border:3px solid #382418; }
    h1 { font-size:22px; margin:0; } h2 { margin:0 0 4px; font-size:17px; }
    a { color:#fff; text-decoration:none; } a:hover { text-decoration:underline; color:#ffe139; }
    header { text-align:center; }
    .controls { padding:8px; margin:14px 0; background:#474747 url('${assets}/img/stoneback.gif'); border:3px outset #777; display:flex; justify-content:center; align-items:center; gap:8px; flex-wrap:wrap; }
    input,select,button { font:14px Arial; padding:5px; } input { max-width:220px; }
    .columns { display:grid; grid-template-columns:1fr 1fr; gap:14px; } .panel { padding:12px; border:2px solid #382418; background:#000; min-width:0; }
    table { width:100%; border-collapse:collapse; } th { font-size:11px; color:#c8bea8; text-align:left; padding:10px 4px; border-bottom:1px solid #51432b; }
    td { padding:4px; border-bottom:1px solid #211d16; } .number { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; } .selected { color:#ffe139; }
    .item { display:flex; align-items:center; gap:6px; min-height:34px; } .item img { image-rendering:pixelated; flex:none; } .empty { padding:30px 4px; text-align:center; }
    footer { display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; margin-top:14px; color:#c8bea8; font-size:11px; } .refresh { margin:0; }
    footer button { font-size:11px; }
    @media(max-width:780px) { main { margin:0; padding:12px; } .columns { grid-template-columns:1fr; } }
</style></head><body><main>
<header><h1>Bank items</h1></header>
<form method="GET" action="${escapeHtml(url.pathname)}" class="controls"><input type="hidden" name="profile" value="${escapeHtml(options.profile)}">
<select id="rank-by" name="by" aria-label="Rank by"><option value="quantity"${by === 'quantity' ? ' selected' : ''}>Quantity</option><option value="holders"${by === 'holders' ? ' selected' : ''}>Holders</option></select>
<input id="item-search" name="q" aria-label="Search items" value="${escapeHtml(search)}" placeholder="Search items"><button type="submit">Search</button>
${search ? `<a href="${escapeHtml(url.pathname)}?profile=${encodeURIComponent(options.profile)}&by=${by}">Clear</a>` : ''}</form>
<div class="columns">${panel('Rarest items', 1)}${panel('Most common items', -1)}</div>
<footer><span>${census.banks.toLocaleString('en-US')} banks · ${escapeHtml(timestamp)}</span>
<a href="${escapeHtml(`${base}?profile=${encodeURIComponent(options.profile)}`)}">Bank Hiscores</a>
${options.refresh ? '<form method="POST" action="/refresh" class="refresh"><button type="submit">Refresh</button></form>' : ''}</footer>
</main></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
