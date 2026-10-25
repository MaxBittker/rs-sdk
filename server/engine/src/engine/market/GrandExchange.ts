import Environment from '#/util/Environment.js';
import type { GEState } from '../../../../../sdk/ge-types.js';
import { MARKET_SORTS, type MarketSort } from './ItemSearch.js';
import { Inventory } from '#/engine/Inventory.js';
import IfSetHide from '#/network/game/server/model/IfSetHide.js';
import IfSetColour from '#/network/game/server/model/IfSetColour.js';
import IfSetPosition from '#/network/game/server/model/IfSetPosition.js';
import UpdateInvFull from '#/network/game/server/model/UpdateInvFull.js';
import World from '#/engine/World.js';
import Component from '#/cache/config/Component.js';
import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import type Player from '#/engine/entity/Player.js';
import IfOpenMainSide from '#/network/game/server/model/IfOpenMainSide.js';
import IfSetText from '#/network/game/server/model/IfSetText.js';
import IfSetObject from '#/network/game/server/model/IfSetObject.js';
import PCountDialog from '#/network/game/server/model/PCountDialog.js';
import { marketStore, MAX_GP, OFFER_SLOTS, positive, type MarketAccount, type Side } from './MarketStore.js';
import { canonicalItem, catalog, marketItem, noteFor } from './MarketCatalog.js';

let nextSession = 0;
let nextReceipt = 0;
type Session = {
    serial: number;
    revision: number;
    actionRevision: number;
    error: string | null;
    receipt: GEState['receipt'];
    screen: 'home' | 'catalog' | 'draft' | 'offer';
    side: Side;
    slot?: number;
    query: string;
    sort: MarketSort;
    matches: number;
    page: number;
    offerSnapshot?: string;
    rows: number[];
    item: number;
    quantity: number;
    price: number;
    offer: number;
    input?: 'quantity' | 'price' | 'item';
    x: number;
    z: number;
};
const sessions = new WeakMap<Player, Session>();
const com = (name: string) => Component.getId(`grand_exchange:${name}`);
const root = () => Component.getId('grand_exchange');
const sideRoot = () => Component.getId('grand_exchange_side');
const sideInventory = () => Component.getId('grand_exchange_side:inv');
const coins = () => ObjType.getId('coins');
const backpack = (p: Player) => p.getInventory(InvType.getId('inv'))!;

/** Combine loose items and notes into the quantities actually available to sell. */
function sellableInventory(p: Player): Map<number, number> {
    const owned = new Map<number, number>();
    for (const item of backpack(p).itemsFiltered) {
        try {
            const id = canonicalItem(item.id);
            owned.set(id, (owned.get(id) ?? 0) + item.count);
        } catch {
            // Coins and untradeable items cannot be offered.
        }
    }
    return owned;
}
function availableQuantity(p: Player, item: number): number {
    return Math.min(MAX_GP, sellableInventory(p).get(item) ?? 0);
}

/** World-space footprint of the existing bank table (rotated in m49_53) and stationary teller. */
export const EXCHANGE_TABLE = { x: 3180, z: 3443, width: 1, length: 2 } as const;
export const EXCHANGE_TELLER = { x: 3181, z: 3445, width: 1, length: 1 } as const;
export function atExchange(p: Pick<Player, 'x' | 'z' | 'level'>, x: number, z: number): boolean {
    const target = [EXCHANGE_TABLE, EXCHANGE_TELLER].find(t => t.x === x && t.z === z);
    if (!target || p.level !== 0 || p.x < 3180 || p.x > 3185 || p.z < 3436 || p.z > 3446) return false;
    const dx = Math.max(target.x - p.x, p.x - (target.x + target.width - 1), 0);
    const dz = Math.max(target.z - p.z, p.z - (target.z + target.length - 1), 0);
    return dx + dz <= 1;
}
export function openExchange(p: Player, x: number, z: number) {
    if (!Environment.GE_ENABLED) {
        p.messageGame('Grand Exchange is not available on this server.');
        return;
    }
    if (!atExchange(p, x, z)) {
        p.messageGame('Visit the Grand Exchange table or teller on the west side of Varrock west bank.');
        return;
    }
    p.closeModal();
    sessions.set(p, {
        serial: ++nextSession,
        revision: 0,
        actionRevision: 0,
        error: null,
        receipt: null,
        screen: 'home',
        side: 'buy',
        query: '',
        sort: 'relevance',
        matches: 0,
        page: 0,
        rows: [],
        item: 0,
        quantity: 1,
        price: 1,
        offer: 0,
        x,
        z
    });
    text(p, 'agent_state', '');
    p.invListenOnCom(InvType.getId('inv'), sideInventory(), p.uid);
    p.openMainSideModal(root(), sideRoot());
    render(p);
}
function active(p: Player): Session | undefined {
    if (!Environment.GE_ENABLED) return;
    const s = sessions.get(p);
    if (!s || p.modalMain !== root()) return;
    if (!atExchange(p, s.x, s.z) || p.delayed || p.loggingOut) {
        p.closeModal();
        sessions.delete(p);
        return;
    }
    return s;
}
function account(p: Player): MarketAccount {
    const inv = backpack(p);
    const before = inv.items.map(i => (i ? { ...i } : null));
    return {
        owner: p.username,
        take(id, count) {
            const ids = id === coins() ? [id] : [id, noteFor(id)].filter((v, i, a) => a.indexOf(v) === i);
            if (ids.reduce((n, id) => n + inv.getItemCount(id), 0) < count) throw new Error('Bring the required items or coins in your backpack.');
            let remaining = count;
            for (const id of ids) {
                if (remaining) remaining -= inv.remove(id, remaining);
            }
            if (remaining) throw new Error('Inventory changed. Please try again.');
        },
        give: (id, count) => inv.add(id, count),
        save: () => {
            // One durable cut across carried player inventories prevents an item handed
            // from A to B between autosaves reappearing in A after B deposits it here.
            // This runs inside the exchange transaction, without yielding the world.
            const save = p.save(false);
            World.checkpointPlayers(p, save);
            return save;
        },
        rollback: () => {
            before.forEach((item, i) => inv.set(i, item));
        }
    };
}
function text(p: Player, name: string, value: string) {
    const id = com(name);
    // Optional SDK metadata may be absent while an older packed cache is loaded.
    // Encoding -1 as an unsigned component ID would crash existing clients.
    if (name === 'agent_state' && id < 0) return;
    p.write(new IfSetText(id, value));
}
function hide(p: Player, name: string, hidden: boolean) {
    p.write(new IfSetHide(com(name), hidden));
}
function icon(p: Player, name: string, item: number, count: number) {
    // A display-only container. It is never attached to player/world inventory.
    const display = new Inventory(-1, 1);
    display.set(0, { id: item, count });
    p.write(new UpdateInvFull(com(name), display));
}
function wrapItemName(name: string): string {
    const words = name.split(' ');
    const lines = [''];
    for (const word of words) {
        const last = lines.length - 1;
        if (lines[last] && (lines[last] + ' ' + word).length > 17) lines.push(word);
        else lines[last] += (lines[last] ? ' ' : '') + word;
    }
    return lines
        .slice(0, 2)
        .map(line => line.slice(0, 19))
        .join('\\n');
}
/** Coins and unnotable items (runes, arrows, ...) have no noted form, so the notes button would only duplicate Collect. */
function collectsAsNotes(o: { item: number; items: number }): boolean {
    return o.items > 0 && noteFor(o.item) !== o.item;
}
function renderGrid(p: Player) {
    const offers = marketStore().offers(p.username);
    const s = sessions.get(p)!;
    s.rows = [];
    for (let i = 0; i < OFFER_SLOTS; i++) {
        const o = offers.find(offer => offer.slot === i);
        const name = `slot${i}`;
        s.rows[i] = o?.id ?? 0;
        hide(p, name + '_occupied', !o);
        hide(p, name + '_empty', !!o);
        text(p, name + '_side', o ? (o.side === 'buy' ? 'Buy' : 'Sell') : 'Empty');
        if (!o) {
            icon(p, name + '_buy_coins', ObjType.getId('coins_1000'), 1);
            icon(p, name + '_sell_coins', ObjType.getId('coins_1000'), 1);
            continue;
        }
        icon(p, name + '_icon', o.item, o.quantity);
        text(p, name + '_name', wrapItemName(ObjType.get(o.item).name ?? 'Item'));
        text(p, name + '_price', `${o.price.toLocaleString('en-US')} coins`);
        // IF_SETCOLOUR uses RGB555, not a 24-bit RGB value.
        const rgb = o.state === 'cancelled' ? 0xb33324 : o.state === 'completed' ? 0x299526 : 0xcc962c;
        const colour = (((rgb >> 19) & 31) << 10) | (((rgb >> 11) & 31) << 5) | ((rgb >> 3) & 31);
        p.write(new IfSetColour(com(name + '_fill'), colour));
        p.write(new IfSetPosition(com(name + '_mask'), Math.floor((140 * o.filled) / o.quantity), 0));
    }
}
/** One complete snapshot is sent after all visual updates, avoiding partially decoded UI state. */
function publishExchange(p: Player, notice = '') {
    const s = sessions.get(p)!;
    const offers = marketStore()
        .offers(p.username)
        .map(({ owner, created, ...o }) => ({ ...o, name: ObjType.get(o.item).name ?? 'Item' }));
    const controls: Record<string, number> = { home: com('home'), close: com('close'), collectAll: com('collect') };
    if (s.screen === 'home') {
        for (let slot = 0; slot < OFFER_SLOTS; slot++) {
            if (offers.some(o => o.slot === slot)) controls[`view${slot}`] = com(`slot${slot}_view`);
            else {
                controls[`buy${slot}`] = com(`slot${slot}_buy`);
                controls[`sell${slot}`] = com(`slot${slot}_sell`);
            }
        }
    }
    if (s.screen === 'catalog') {
        controls.find = com('find');
        controls.sort = com('search_sort');
        controls.clear = com('search_clear');
        if (s.page > 0) controls.previous = com('previous');
        if ((s.page + 1) * 12 < s.matches) controls.next = com('next');
    }
    if (s.screen === 'draft') {
        controls.quantity = com('offer_quantity');
        controls.price = com('offer_price');
        controls.confirm = com('offer_confirm');
        controls.change = com('offer_change');
    }
    if (s.screen === 'offer') {
        const offer = offers.find(o => o.id === s.offer);
        controls.collect = com('row3');
        if (offer && collectsAsNotes(offer)) controls.collectNotes = com('row4');
        if (offer?.state === 'open') controls.cancel = com('row5');
    }
    const state: GEState = {
        isOpen: true,
        session: s.serial,
        revision: ++s.revision,
        actionRevision: s.actionRevision,
        screen: s.screen,
        offers,
        selectedOffer: s.screen === 'offer' ? s.offer : null,
        draft: s.screen === 'draft' ? { item: s.item, name: ObjType.get(s.item).name ?? 'Item', side: s.side, quantity: s.quantity, price: s.price, slot: s.slot ?? null } : null,
        search:
            s.screen === 'catalog'
                ? {
                      query: s.query,
                      side: s.side,
                      page: s.page,
                      total: s.matches,
                      results: s.rows.map((item, i) => ({ item, name: ObjType.get(item).name ?? 'Item', componentId: com(`result${i}_select`) }))
                  }
                : null,
        input: s.input ?? null,
        controls,
        notice,
        error: s.error,
        receipt: s.receipt
    };
    text(p, 'agent_state', JSON.stringify(state));
}
function render(p: Player, notice = '') {
    const s = sessions.get(p)!;
    hide(p, 'grid', s.screen !== 'home');
    hide(p, 'detail', true);
    hide(p, 'offer_view', s.screen !== 'offer');
    hide(p, 'offer_setup', s.screen !== 'draft');
    // The 274 client reads only five packets per frame. Reveal a newly opened
    // search after its field, results and receipt arrive, not before them.
    if (s.screen !== 'catalog') hide(p, 'search', true);
    text(p, 'search_clear', s.screen === 'catalog' ? 'Clear search' : '');
    text(p, 'subtitle', s.screen === 'home' ? 'Click a backpack item to sell, or choose an offer slot.' : 'Choose an item, quantity and price.');
    for (let i = 0; i < 8; i++) text(p, `row${i}`, '');
    text(p, 'previous', '');
    text(p, 'next', '');
    text(p, 'letters', '');
    for (let i = 0; i < 26; i++) text(p, `letter${i}`, '');
    if (s.screen === 'home') {
        text(p, 'heading', 'Grand Exchange');
        renderGrid(p);
    } else if (s.screen === 'catalog') {
        text(p, 'heading', 'Grand Exchange');
        text(p, 'subtitle', s.side === 'buy' ? 'Search for an item to buy.' : 'Choose an item from your backpack. Quantities include notes.');
        text(p, 'search_prompt', `What would you like to ${s.side}?`);
        text(p, 'search_query', s.query || 'Type a name or alias...');
        text(p, 'search_sort', { relevance: 'Sort: Best match', name: 'Sort: A-Z', 'name-desc': 'Sort: Z-A' }[s.sort]);
        const owned = sellableInventory(p);
        const items = catalog(s.query, s.sort).filter(o => s.side === 'buy' || owned.has(o.id));
        s.matches = items.length;
        s.page = Math.min(s.page, Math.max(0, Math.ceil(items.length / 12) - 1));
        const page = items.slice(s.page * 12, s.page * 12 + 12);
        s.rows = page.map(o => o.id);
        for (let i = 0; i < 12; i++) {
            hide(p, `result${i}`, !page[i]);
            if (!page[i]) continue;
            icon(p, `result${i}_icon`, page[i].id, s.side === 'sell' ? owned.get(page[i].id)! : 1);
            text(p, `result${i}_name`, wrapItemName(page[i].name));
        }
        if (!items.length) {
            text(p, 'subtitle', s.side === 'sell' ? (owned.size ? 'No backpack items match. Clear the search to see what you can sell.' : 'No sellable items in your backpack. Bring items from your bank.') : 'No matching items. Try another search.');
        }
        text(p, 'search_ack', s.query);
        hide(p, 'search', false);
        text(p, 'previous', s.page > 0 ? 'Previous page' : '');
        text(p, 'next', items.length > (s.page + 1) * 12 ? 'Next page' : '');
    } else if (s.screen === 'draft') {
        const item = marketItem(s.item);
        const total = s.price * s.quantity;
        hide(p, 'offer_sell_quantity', s.side !== 'sell');
        text(p, 'heading', 'Grand Exchange: Set up offer');
        text(p, 'subtitle', s.side === 'buy' ? 'Buy offer' : `Sell offer - ${availableQuantity(p, s.item).toLocaleString('en-US')} available in your backpack`);
        text(p, 'offer_name', item.name!);
        const description = item.desc ?? 'Choose a quantity and a price for your offer.';
        const lines: string[] = [''];
        for (const word of description.split(/\s+/)) {
            if ((lines[lines.length - 1] + ' ' + word).length > 62) lines.push('');
            lines[lines.length - 1] += (lines[lines.length - 1] ? ' ' : '') + word;
        }
        text(p, 'offer_description', lines.slice(0, 2).join('\\n'));
        p.write(new IfSetObject(com('offer_icon'), s.item, 180));
        text(p, 'offer_quantity', s.quantity.toLocaleString('en-US'));
        text(p, 'offer_price', s.price.toLocaleString('en-US'));
        text(p, 'offer_total', `${total.toLocaleString('en-US')} coins`);
    } else {
        const o = marketStore()
            .offers(p.username)
            .find(o => o.id === s.offer);
        if (!o) {
            s.screen = 'home';
            render(p, notice);
            return;
        }
        const amount = (n: number) => n.toLocaleString('en-US');
        const state = o.state === 'open' ? 'In progress' : o.state === 'completed' ? 'Offer completed' : 'Offer cancelled';
        text(p, 'heading', 'Grand Exchange: Offer details');
        text(p, 'subtitle', `${o.side === 'buy' ? 'Buy' : 'Sell'} offer`);
        text(p, 'view_name', ObjType.get(o.item).name ?? 'Item');
        p.write(new IfSetObject(com('view_icon'), o.item, 140));
        text(p, 'view_price', `Price per item: ${amount(o.price)} coins`);
        text(p, 'view_value', `${amount(o.gross)} coins traded`);
        text(p, 'view_progress', `${state} - ${amount(o.filled)} of ${amount(o.quantity)} traded`);
        const rgb = o.state === 'cancelled' ? 0xb33324 : o.state === 'completed' ? 0x299526 : 0xcc962c;
        p.write(new IfSetColour(com('view_fill'), (((rgb >> 19) & 31) << 10) | (((rgb >> 11) & 31) << 5) | ((rgb >> 3) & 31)));
        p.write(new IfSetPosition(com('view_mask'), Math.floor((460 * o.filled) / o.quantity), 0));
        p.write(new IfSetObject(com('view_items_icon'), o.item, 100));
        p.write(new IfSetObject(com('view_coins_icon'), ObjType.getId('coins_1000'), 100));
        text(p, 'view_items', amount(o.items));
        text(p, 'view_coins', amount(o.coins));
        const ready = o.items > 0 || o.coins > 0;
        hide(p, 'view_claim_controls', !ready);
        for (const name of ['view_notes', 'view_notes_edge', 'view_notes_face']) hide(p, name, !collectsAsNotes(o));
        hide(p, 'view_cancel_controls', o.state !== 'open');
        text(p, 'view_waiting', ready ? '' : 'Nothing ready to collect yet.');
    }
    if (s.screen === 'home' || s.screen === 'offer') s.offerSnapshot = JSON.stringify(marketStore().offers(p.username));
    if (notice) p.messageGame(notice);
    publishExchange(p, notice);
}

/** Push changed offers from the game tick; never disturb an input prompt or draft. */
export function tickExchange(p: Player): void {
    const s = sessions.get(p);
    if (!s || !active(p) || (s.screen !== 'home' && s.screen !== 'offer')) return;
    if (s.offerSnapshot !== JSON.stringify(marketStore().offers(p.username))) render(p);
}
/** Inventory clicks create a draft only; the player still chooses a price and confirms. */
export function exchangeInventoryButton(p: Player, component: number, slot: number, item: number, op: number): boolean {
    if (component !== sideInventory()) return false;
    const s = active(p);
    if (!s || p.modalSide !== sideRoot() || op !== 1 || !backpack(p).hasAt(slot, item)) return true;
    s.actionRevision++;
    if (s.input) p.write(new IfOpenMainSide(root(), sideRoot()));
    s.input = undefined;
    s.error = null;
    s.receipt = null;
    try {
        const id = canonicalItem(item);
        const offers = marketStore().offers(p.username);
        const selectedSlot = s.screen === 'catalog' || s.screen === 'draft' ? s.slot : undefined;
        const freeSlot = selectedSlot !== undefined && !offers.some(o => o.slot === selectedSlot) ? selectedSlot : Array.from({ length: OFFER_SLOTS }, (_, i) => i).find(i => !offers.some(o => o.slot === i));
        if (freeSlot === undefined) throw new Error('All offer slots are full. Collect a completed offer to free a slot.');
        s.side = 'sell';
        s.slot = freeSlot;
        s.query = '';
        s.page = 0;
        draft(p, id);
        render(p);
    } catch (error) {
        s.error = error instanceof Error ? error.message : 'Item unavailable.';
        render(p, s.error);
    }
    return true;
}

export function exchangeButton(p: Player, id: number): boolean {
    if (Component.get(id)?.rootLayer !== root()) return false;
    const s = active(p);
    if (!s) return true;
    s.actionRevision++;
    // A different click invalidates the numeric prompt on both server and client.
    if (s.input) p.write(new IfOpenMainSide(root(), sideRoot()));
    s.input = undefined;
    s.error = null;
    s.receipt = null;
    try {
        if (s.screen === 'draft') {
            const aliases: Record<string, string> = { offer_quantity: 'row0', offer_price: 'row1', offer_confirm: 'row5', offer_change: 'row6' };
            for (const [button, row] of Object.entries(aliases)) if (id === com(button)) id = com(row);
            const quantitySteps: Record<string, number> = {
                offer_quantity_minus: -1,
                offer_quantity_plus: 1,
                offer_qty_one: 1,
                offer_qty_ten: 10,
                offer_qty_hundred: 100,
                offer_qty_thousand: 1000
            };
            const quantityLimit = s.side === 'sell' ? availableQuantity(p, s.item) : MAX_GP;
            for (const [button, step] of Object.entries(quantitySteps)) if (id === com(button)) s.quantity = Math.max(1, Math.min(quantityLimit, s.quantity + step));
            if (id === com('offer_qty_all') && s.side === 'sell') {
                s.quantity = Math.max(1, quantityLimit);
            }
            if (id === com('offer_price_minus')) s.price = Math.max(1, s.price - 1);
            if (id === com('offer_price_plus')) s.price = Math.min(MAX_GP, s.price + 1);
            if (id === com('offer_price_lower')) id = com('row2');
            if (id === com('offer_price_higher')) id = com('row3');
            if (id === com('offer_price_guide')) s.price = marketStore().quote(s.item).lastPrice ?? Math.max(1, ObjType.get(s.item).cost);
        }
        if (s.screen === 'offer') {
            const aliases: Record<string, string> = { view_collect: 'row3', view_notes: 'row4', view_cancel: 'row5' };
            for (const [button, row] of Object.entries(aliases)) if (id === com(button)) id = com(row);
        }
        if (s.screen === 'home') {
            for (let i = 0; i < OFFER_SLOTS; i++) {
                const offer = marketStore()
                    .offers(p.username)
                    .find(o => o.slot === i);
                if (id === com(`slot${i}_view`) && offer) {
                    s.offer = offer.id;
                    s.screen = 'offer';
                    render(p);
                    return true;
                }
                if ((id === com(`slot${i}_buy`) || id === com(`slot${i}_sell`)) && !offer) {
                    s.side = id === com(`slot${i}_buy`) ? 'buy' : 'sell';
                    s.slot = i;
                    s.screen = 'catalog';
                    s.query = '';
                    s.sort = 'relevance';
                    s.page = 0;
                    render(p);
                    return true;
                }
            }
        }
        if (id === com('collect')) {
            const result = marketStore().collectMany(
                account(p),
                marketStore()
                    .offers(p.username)
                    .map(offer => ({ id: offer.id, itemId: noteFor(offer.item) })),
                coins()
            );
            s.receipt = { token: ++nextReceipt, kind: 'collect', ...result };
            s.screen = 'home';
            render(p, `Collected ${result.items} items and ${result.coins} coins. Any overflow stays here.`);
            return true;
        }
        if (id === com('close')) {
            p.closeModal();
            sessions.delete(p);
            return true;
        }
        if (id === com('home') || id === com('refresh')) {
            s.screen = 'home';
            render(p);
            return true;
        }
        if (id === com('buy') || id === com('sell')) {
            s.side = id === com('buy') ? 'buy' : 'sell';
            s.slot = undefined;
            s.screen = 'catalog';
            s.page = 0;
            render(p);
            return true;
        }
        if (id === com('find')) {
            s.input = 'item';
            p.write(new PCountDialog());
            p.messageGame('Enter an item ID from the market website.');
            publishExchange(p);
            return true;
        }
        if (s.screen === 'catalog') {
            if (id === com('search_sort')) {
                s.sort = MARKET_SORTS[(MARKET_SORTS.indexOf(s.sort) + 1) % MARKET_SORTS.length];
                s.page = 0;
            }
            if (id === com('search_clear')) {
                s.query = '';
                s.page = 0;
            }
            if (id === com('previous')) s.page = Math.max(0, s.page - 1);
            if (id === com('next') && (s.page + 1) * 12 < s.matches) s.page++;
            // Search results are selected by displayed item ID through MARKET_SEARCH,
            // never by a row index that could change while a keystroke is in flight.
        }
        const row = Array.from({ length: 8 }, (_, i) => com(`row${i}`)).indexOf(id);
        if (row >= 0) {
            if (s.screen === 'home' && s.rows[row]) {
                s.offer = s.rows[row];
                s.screen = 'offer';
            } else if (s.screen === 'draft') {
                if (row === 0 || row === 1) {
                    s.input = row === 0 ? 'quantity' : 'price';
                    p.write(new PCountDialog());
                    p.messageGame(`Enter ${s.input} in the chat area below.`);
                    publishExchange(p);
                    return true;
                }
                if (row === 2) s.price = Math.max(1, s.price - Math.max(1, Math.floor(s.price * 0.05)));
                if (row === 3) s.price = Math.min(MAX_GP, s.price + Math.max(1, Math.floor(s.price * 0.05)));
                if (row === 5) {
                    marketItem(s.item);
                    const o = marketStore().place(account(p), s.item, s.side, s.quantity, s.price, coins(), s.slot);
                    s.receipt = { token: ++nextReceipt, kind: 'place', offerId: o.id };
                    s.offer = o.id;
                    s.screen = 'offer';
                }
                if (row === 6) s.screen = 'catalog';
            } else if (s.screen === 'offer') {
                if (row === 3 || row === 4) {
                    const offer = marketStore()
                        .offers(p.username)
                        .find(o => o.id === s.offer)!;
                    const result = marketStore().collect(account(p), s.offer, coins(), row === 4 ? noteFor(offer.item) : offer.item);
                    s.receipt = { token: ++nextReceipt, kind: 'collect', offerId: s.offer, items: result.items, coins: result.coins };
                    render(p, `Collected ${result.items} items and ${result.coins} gp. Any overflow stays here.`);
                    return true;
                }
                if (row === 5) {
                    marketStore().cancel(p.username, s.offer);
                    s.receipt = { token: ++nextReceipt, kind: 'cancel', offerId: s.offer };
                }
                if (row === 6) s.screen = 'home';
            }
        }
        render(p);
    } catch (error) {
        s.error = error instanceof Error ? error.message : 'Exchange unavailable.';
        render(p, s.error);
    }
    return true;
}
function draft(p: Player, id: number) {
    const s = sessions.get(p)!;
    marketItem(id);
    const owned = availableQuantity(p, id);
    if (s.side === 'sell' && !owned) throw new Error('This item is no longer in your backpack. Choose another item.');
    s.item = id;
    s.quantity = s.side === 'sell' ? owned : 1;
    s.price = marketStore().quote(id).lastPrice ?? Math.max(1, ObjType.get(id).cost);
    s.screen = 'draft';
}
export function exchangeCount(p: Player, value: number): boolean {
    const s = active(p);
    if (!s?.input) return false;
    s.actionRevision++;
    const input = s.input;
    s.error = null;
    s.receipt = null;
    s.input = undefined;
    try {
        positive(value, input);
        if (input === 'item') draft(p, value);
        else {
            if (input === 'quantity' && s.side === 'sell' && value > availableQuantity(p, s.item)) {
                throw new Error(`You only have ${availableQuantity(p, s.item).toLocaleString('en-US')} of this item in your backpack.`);
            }
            s[input] = value;
        }
        render(p);
    } catch (error) {
        s.error = error instanceof Error ? error.message : 'Invalid number.';
        render(p, s.error);
    }
    return true;
}

/** Bound to the logged-in player's physical exchange session, not a public mutation API. */
export function exchangeSearch(p: Player, query: string, selectedItem = 0): boolean {
    const s = active(p);
    if (!s || s.screen !== 'catalog' || s.input || query.length > 48 || !/^[a-zA-Z0-9 '()*-]*$/.test(query)) return false;
    s.actionRevision++;
    s.error = null;
    s.receipt = null;
    if (selectedItem) {
        // Reject a stale result rather than silently selecting a different row/item.
        if (query !== s.query || !s.rows.includes(selectedItem)) return true;
        try {
            draft(p, selectedItem);
            render(p);
        } catch (error) {
            s.error = error instanceof Error ? error.message : 'Item unavailable.';
            render(p, s.error);
        }
    } else {
        s.query = query;
        s.page = 0;
        render(p);
    }
    return true;
}
