import type { BankSnapshot } from './BankHiscores.js';
import { escapeHtml } from '../utils.js';

export type BankItemTotal = { id?: number; name: string; quantity: number; holders: number };
export type BankCensus = { banks: number; quantity: number; items: BankItemTotal[] };

export function summarizeBankItems(banks: BankSnapshot[]): BankCensus {
    const items = new Map<string, BankItemTotal>();
    let quantity = 0;
    for (const bank of banks) {
        const held = new Set<string>();
        for (const item of bank.items) {
            // Banked noted/unnoted variants can share a name. Combine them because
            // the linked holder board searches item names, rather than item IDs.
            const key = item.name.toLowerCase();
            let total = items.get(key);
            if (!total) {
                total = { id: item.id, name: item.name, quantity: 0, holders: 0 };
                items.set(key, total);
            }
            total.quantity += item.count;
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
    const metric = by === 'holders' ? 'Number of holders' : 'Total quantity';
    const visible = census.items.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
    const base = options.holdersBaseUrl || '/hiscores/bank';
    const assets = options.assetBaseUrl || '';
    const order = (direction: number) => [...visible].sort((a, b) => direction * (a[by] - b[by]) || a.name.localeCompare(b.name, 'en') || (a.id ?? 0) - (b.id ?? 0)).slice(0, 50);
    const panel = (title: string, direction: number) => {
        const rows = order(direction)
            .map(item => {
                const query = new URLSearchParams({ profile: options.profile, q: item.name });
                const icon = item.id == null ? '' : `<img width="32" height="32" loading="lazy" src="${assets}/sprite/item/${item.id}.png" alt="">`;
                return `<tr><td><a class="item" href="${escapeHtml(`${base}?${query}`)}" title="View holders of items containing ${escapeHtml(item.name)}">${icon}<span>${escapeHtml(item.name)}</span></a></td><td class="number ${by === 'quantity' ? 'selected' : ''}">${item.quantity.toLocaleString('en-US')}</td><td class="number ${by === 'holders' ? 'selected' : ''}">${item.holders.toLocaleString('en-US')}</td></tr>`;
            })
            .join('');
        return `<section class="panel">
        <h2>${title}</h2><p class="muted">${direction === 1 ? 'Lowest' : 'Highest'} ${metric.toLowerCase()}</p>
        <table><thead><tr><th>Item</th><th class="number">Quantity</th><th class="number">Holders</th></tr></thead><tbody>
        ${rows || '<tr><td colspan="3" class="empty">No matching bank items</td></tr>'}
        </tbody></table>
    </section>`;
    };
    const timestamp = new Date(options.capturedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bank Item Census</title>
<style>
    * { box-sizing: border-box; }
    body { margin:0; background:#000; color:#fff; font:13px Arial,Helvetica,sans-serif; }
    main { max-width:1080px; margin:24px auto; padding:22px; background:#17150f url('${assets}/img/background2.jpg'); border:3px solid #382418; }
    h1 { font-size:24px; margin:0 0 8px; } h2 { margin:0 0 4px; font-size:19px; }
    a { color:#fff; text-decoration:none; } a:hover { text-decoration:underline; color:#ffe139; }
    header { text-align:center; } .muted { color:#c8bea8; margin:6px 0 12px; line-height:1.5; }
    .stats { display:flex; gap:32px; justify-content:center; flex-wrap:wrap; margin:20px 0; }
    .stats strong { display:block; color:#ffe139; font-size:21px; margin-bottom:3px; }
    .controls { padding:12px; margin:20px 0; background:#474747 url('${assets}/img/stoneback.gif'); border:4px outset #777; display:flex; justify-content:center; align-items:end; gap:18px; flex-wrap:wrap; }
    label { display:block; font-weight:bold; margin-bottom:6px; } input,select,button { font:14px Arial; padding:5px; } input { max-width:220px; }
    .columns { display:grid; grid-template-columns:1fr 1fr; gap:18px; } .panel { padding:14px; border:2px solid #382418; background:#000; min-width:0; }
    table { width:100%; border-collapse:collapse; } th { font-size:11px; color:#c8bea8; text-align:left; padding:10px 4px; border-bottom:1px solid #51432b; }
    td { padding:4px; border-bottom:1px solid #211d16; } .number { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; } .selected { color:#ffe139; }
    .item { display:flex; align-items:center; gap:6px; min-height:34px; } .item img { image-rendering:pixelated; flex:none; } .empty { padding:30px 4px; text-align:center; }
    footer { text-align:center; margin-top:20px; } .refresh { margin-top:12px; } .note { font-size:12px; }
    @media(max-width:780px) { main { margin:0; padding:14px; } .columns { grid-template-columns:1fr; } .stats { gap:16px; } }
</style></head><body><main>
<header><h1>Bank Item Census</h1><p class="muted">The rarest and most common items in players’ saved banks.<br>Click an item to see its holders, ranked by matching bank value.</p>
<p class="muted note">${options.refresh ? 'Production snapshot' : 'Saved bank data'} · ${escapeHtml(timestamp)} · ${escapeHtml(options.profile)} profile</p>
<div class="stats"><div><strong>${census.banks.toLocaleString('en-US')}</strong>Banks counted</div><div><strong>${census.items.length.toLocaleString('en-US')}</strong>Distinct items</div><div><strong>${census.quantity.toLocaleString('en-US')}</strong>Total quantity</div></div></header>
<form method="GET" action="${escapeHtml(url.pathname)}" class="controls"><input type="hidden" name="profile" value="${escapeHtml(options.profile)}">
<div><label for="rank-by">Rank by</label><select id="rank-by" name="by"><option value="quantity"${by === 'quantity' ? ' selected' : ''}>Total quantity</option><option value="holders"${by === 'holders' ? ' selected' : ''}>Number of holders</option></select></div>
<div><label for="item-search">Item name contains</label><input id="item-search" name="q" value="${escapeHtml(search)}" placeholder="e.g. rune, shrimp"></div><button type="submit">Show</button>
${search ? `<a href="${escapeHtml(url.pathname)}?profile=${encodeURIComponent(options.profile)}&by=${by}">Clear</a>` : ''}</form>
<div class="columns">${panel('Rarest items', 1)}${panel('Most common items', -1)}</div>
<footer><p class="muted note">Quantity counts all units in banked stacks. Holders counts each bank once per item.<br>Noted and unnoted variants sharing a name are combined. Items absent from all banks are omitted.<br>Each list shows up to 50 items.</p>
<a href="${escapeHtml(`${base}?profile=${encodeURIComponent(options.profile)}`)}">Bank Hiscores</a>
${options.refresh ? '<form method="POST" action="/refresh" class="refresh"><button type="submit">Refresh production snapshot</button></form>' : ''}</footer>
</main></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
