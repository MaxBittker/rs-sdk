import type { BotSDK } from './index';
import type { BotActions } from './actions';
import type { GEState, GEOfferRequest, GEActionResult } from './ge-types';
import type { ActionResult } from './types';

/** Offer slots per account; must match the engine's MarketStore OFFER_SLOTS. */
export const GE_OFFER_SLOTS = 12;

const activeSDKs = new WeakSet<BotSDK>();
const MAX_GP = 2_147_483_647;
/** Ground floor tile beside the Varrock west bank exchange table; the teller stands two tiles north. */
const GE_STAND = { x: 3181, z: 3443 };
/**
 * Land anywhere beside the table rather than on one exact tile. The stand tile is the
 * preferred approach, but an exact-tile walk can fail when a player occupies it,
 * even though the table and teller stay perfectly reachable.
 */
const GE_APPROACH_TOLERANCE = 3;
/** Floor for observing an interface open, so a slow first target still leaves the second a chance. */
const MIN_OBSERVE_MS = 3_000;
/** Budget for silently reopening an exchange that closed mid-sequence. */
const REOPEN_MS = 15_000;
class GEFailure extends Error {
    constructor(
        message: string,
        readonly reason: string,
        readonly unknown = false,
    ) {
        super(message);
    }
}
/** Serial, observation-driven UI transactions. Never automatically retry a dispatched mutation. */
export class GEActions {
    constructor(
        private sdk: BotSDK,
        private bot: BotActions,
    ) {}
    private state(): GEState {
        if (!this.sdk.isConnected() || this.sdk.getStateAge() > 5000)
            throw new GEFailure('No fresh game connection. Reconnect and inspect the GE before acting.', 'stale_state');
        const s = this.sdk.getGEState();
        if (!s) throw new GEFailure('Open the Grand Exchange at its table or teller first. Older clients need an update for GE state.', 'no_interface');
        return s;
    }
    private async run(work: () => Promise<GEActionResult>, approach = false): Promise<GEActionResult> {
        if (activeSDKs.has(this.sdk))
            return {
                success: false,
                reason: 'busy',
                message: 'Another GE action is still running.',
                phase: 'validation',
            };
        activeSDKs.add(this.sdk);
        try {
            // An open, fresh GE session already proves availability. Otherwise ask
            // before routing or giving misleading 'open the interface' guidance.
            if (!this.sdk.getGEState()) {
                const availability = await this.sdk.getGEAvailability();
                if (!availability.enabled)
                    throw new GEFailure(availability.message ?? 'Grand Exchange is not available on this server.', 'ge_unavailable');
                // Reopen from a table or teller already in reach - a stray dialog can close
                // the interface mid-sequence. This never travels; only open() does. Reopening
                // is best effort: whatever goes wrong here, work() reports the caller's own
                // failure ('no_interface') rather than a confusing routing error.
                if (approach) await this.openNearby(Date.now() + REOPEN_MS).catch(() => undefined);
            }
            return await work();
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : String(error),
                reason: error instanceof GEFailure ? error.reason : 'error',
                outcome: error instanceof GEFailure && error.unknown ? 'unknown' : undefined,
                state: this.sdk.getGEState() ?? undefined,
            };
        } finally {
            activeSDKs.delete(this.sdk);
        }
    }
    private async step(send: () => Promise<ActionResult>, done: (s: GEState) => boolean, deadline: number): Promise<GEState> {
        const before = this.state();
        if (Date.now() >= deadline) throw new GEFailure('GE action deadline reached before dispatch.', 'timeout');
        const result = await send();
        if (!result.success)
            throw new GEFailure(result.message, result.reason ?? 'dispatch_failed', result.reason === 'timeout' || result.reason === 'disconnected');
        let observed;
        try {
            observed = await this.sdk.waitForCondition(
                (w) =>
                    !w.modalOpen ||
                    !w.ge ||
                    w.ge.session !== before.session ||
                    (w.ge.revision > before.revision &&
                        w.ge.actionRevision > before.actionRevision &&
                        (!!w.ge.error || ((!w.ge.receipt || w.ge.receipt.token !== before.receipt?.token) && done(w.ge)))),
                Math.max(1, deadline - Date.now()),
            );
        } catch {
            throw new GEFailure('GE result was not observed. The action may have applied; inspect getGEState() before retrying.', 'timeout', true);
        }
        const state = observed.ge;
        if (!observed.modalOpen || !state || state.session !== before.session)
            throw new GEFailure('The exchange session closed or changed; inspect offers before retrying.', 'session_changed', true);
        if (state.error)
            throw new GEFailure(
                state.error,
                'server_rejected',
                state.receipt?.kind === 'collect' && ((state.receipt.items ?? 0) > 0 || (state.receipt.coins ?? 0) > 0),
            );
        return state;
    }
    private async click(name: string, done: (s: GEState) => boolean, deadline: number) {
        const id = this.state().controls[name];
        if (id === undefined) throw new GEFailure(`GE control ${name} is unavailable on this screen.`, 'no_control');
        return this.step(() => this.sdk.sendClickComponent(id), done, deadline);
    }
    private async home(deadline: number) {
        await this.click('home', (s) => s.screen === 'home' && !s.input, deadline);
    }
    private async select(offerId: number, deadline: number) {
        await this.home(deadline);
        const offer = this.state().offers.find((o) => o.id === offerId);
        if (!offer) throw new GEFailure('That offer is no longer in your occupied slots.', 'offer_not_found');
        await this.click(`view${offer.slot}`, (s) => s.screen === 'offer' && s.selectedOffer === offerId, deadline);
    }
    private validNumber(n: number) {
        return Number.isSafeInteger(n) && n > 0 && n <= MAX_GP;
    }
    /**
     * Table first, then the teller: both open the same exchange from different tiles.
     * An unusable scene means nothing is in reach, never a thrown lookup error - callers
     * use this to decide whether to travel, and must still report their own failure.
     */
    private targets(): Array<{ kind: 'table' | 'teller'; interact: () => Promise<ActionResult> }> {
        const found: Array<{ kind: 'table' | 'teller'; interact: () => Promise<ActionResult> }> = [];
        try {
            const table = this.sdk.findNearbyLoc(/^Grand Exchange table$/i, { reachable: true });
            if (table) found.push({ kind: 'table', interact: () => this.bot.interactLoc(table, 'Exchange') });
            const teller = this.sdk.findNearbyNpc(/^Grand Exchange teller$/i, { reachable: true });
            if (teller) found.push({ kind: 'teller', interact: () => this.bot.interactNpc(teller, 'Exchange') });
        } catch {
            return [];
        }
        return found;
    }
    /**
     * Open the exchange from a table or teller that is already in reach, closing the last
     * tiles with the interaction's own approach. Tries every target: one that refuses to
     * open does not rule out the other. Returns undefined when none is in reach, and a
     * failed result when one was tried and did not open.
     */
    private async openNearby(deadline: number): Promise<GEActionResult | undefined> {
        let failure: GEActionResult | undefined;
        for (const target of this.targets()) {
            const result = await target.interact();
            if (!result.success) {
                failure = {
                    success: false,
                    message: `Could not reach the Grand Exchange ${target.kind}: ${result.message}`,
                    reason: result.reason ?? 'cant_reach',
                    phase: 'routing',
                };
                continue;
            }
            try {
                await this.sdk.waitForCondition((w) => w.modalOpen && !!w.ge, Math.max(MIN_OBSERVE_MS, deadline - Date.now()));
            } catch {
                failure = {
                    success: false,
                    message: `The ${target.kind} did not open a structured exchange. Update the client/server and inspect the interface.`,
                    reason: 'timeout',
                    phase: 'observation',
                };
                continue;
            }
            return {
                success: true,
                message: `Grand Exchange opened at the Varrock west bank ${target.kind}.`,
                state: this.state(),
                phase: 'observation',
            };
        }
        return failure;
    }
    async open(timeout: number): Promise<GEActionResult> {
        return this.run(async () => {
            if (this.sdk.getGEState())
                return {
                    success: true,
                    message: 'Grand Exchange is open.',
                    state: this.state(),
                    phase: 'observation',
                };
            // Interactions walk the final tiles themselves, so only travel when neither
            // target is in reach yet.
            const inReach = await this.openNearby(Date.now() + timeout);
            if (inReach?.success) return inReach;
            const walk = await this.bot.walkTo(GE_STAND.x, GE_STAND.z, GE_APPROACH_TOLERANCE);
            const arrived = await this.openNearby(Date.now() + timeout);
            if (arrived) return arrived;
            throw new GEFailure(
                walk.success
                    ? 'No reachable Grand Exchange table or teller at Varrock west bank. Check the server content version.'
                    : `Could not walk to the Grand Exchange: ${walk.message}`,
                walk.success ? 'no_target' : 'cant_reach',
            );
        });
    }
    async search(query: string, side: 'buy' | 'sell', timeout: number): Promise<GEActionResult> {
        return this.run(async () => {
            if (!['buy', 'sell'].includes(side) || !/^[a-zA-Z0-9 '()*-]{0,48}$/.test(query))
                throw new GEFailure('Invalid GE side or search query (maximum 48 ASCII characters).', 'invalid_argument');
            const deadline = Date.now() + timeout;
            await this.home(deadline);
            const slot = Array.from({ length: GE_OFFER_SLOTS }, (_, i) => i).find((i) => !this.state().offers.some((o) => o.slot === i));
            if (slot === undefined) throw new GEFailure('All offer slots are occupied. Collect finished offers to free a slot.', 'no_slot');
            await this.click(`${side}${slot}`, (s) => s.screen === 'catalog' && s.search?.side === side, deadline);
            const state = await this.step(
                () => this.sdk.sendGESearch(query),
                (s) => s.search?.query === query,
                deadline,
            );
            return {
                success: true,
                message: `${state.search?.total ?? 0} matching items.`,
                state,
                phase: 'observation',
            };
        }, true);
    }
    async place(request: GEOfferRequest, timeout: number): Promise<GEActionResult> {
        return this.run(async () => {
            const { item, side, quantity, price } = request;
            if (
                !this.validNumber(item) ||
                !this.validNumber(quantity) ||
                !this.validNumber(price) ||
                quantity * price > MAX_GP ||
                !['buy', 'sell'].includes(side) ||
                (request.slot !== undefined && (!Number.isInteger(request.slot) || request.slot < 0 || request.slot >= GE_OFFER_SLOTS))
            )
                throw new GEFailure(
                    `Use a canonical item ID, buy/sell, positive integer quantity/price, total at most 2,147,483,647 gp and slot 0–${GE_OFFER_SLOTS - 1}.`,
                    'invalid_argument',
                );
            const deadline = Date.now() + timeout;
            await this.home(deadline);
            const slot = request.slot ?? Array.from({ length: GE_OFFER_SLOTS }, (_, i) => i).find((i) => !this.state().offers.some((o) => o.slot === i));
            if (slot === undefined || this.state().offers.some((o) => o.slot === slot))
                throw new GEFailure('Requested slot is occupied, or all offer slots are full. Collect finished offers first.', 'no_slot');
            await this.click(`${side}${slot}`, (s) => s.screen === 'catalog' && s.search?.side === side, deadline);
            // Retained numeric selector: server validates canonical eligibility, and placement validates carried assets.
            await this.click('find', (s) => s.input === 'item', deadline);
            await this.step(
                () => this.sdk.sendCountDialog(item),
                (s) => s.draft?.item === item && !s.input,
                deadline,
            );
            for (const [field, value] of [
                ['quantity', quantity],
                ['price', price],
            ] as const) {
                if (this.state().draft?.[field] === value) continue;
                await this.click(field, (s) => s.input === field, deadline);
                await this.step(
                    () => this.sdk.sendCountDialog(value),
                    (s) => s.draft?.[field] === value && !s.input,
                    deadline,
                );
            }
            const draft = this.state().draft;
            if (!draft || draft.item !== item || draft.side !== side || draft.quantity !== quantity || draft.price !== price || draft.slot !== slot)
                throw new GEFailure('GE draft changed before confirmation. No confirmation sent.', 'draft_changed');
            const previous = new Set(this.state().offers.map((o) => o.id));
            const state = await this.click('confirm', (s) => s.receipt?.kind === 'place' && !!s.receipt.offerId && !previous.has(s.receipt.offerId), deadline);
            const offer = state.offers.find((o) => o.id === state.receipt?.offerId);
            if (!offer || offer.item !== item || offer.side !== side || offer.quantity !== quantity || offer.price !== price || offer.slot !== slot)
                throw new GEFailure('Placement receipt does not match the requested offer. Inspect offers before retrying.', 'unexpected_offer', true);
            return {
                success: true,
                message: `Placed ${side} offer #${offer.id}; ${offer.filled}/${offer.quantity} filled.`,
                offer,
                state,
                phase: 'completion',
                outcome: 'confirmed',
            };
        }, true);
    }
    async cancel(offerId: number, timeout: number): Promise<GEActionResult> {
        return this.run(async () => {
            if (!this.validNumber(offerId)) throw new GEFailure('Invalid offer ID.', 'invalid_argument');
            const deadline = Date.now() + timeout;
            await this.select(offerId, deadline);
            const offer = this.state().offers.find((o) => o.id === offerId)!;
            if (offer.state !== 'open')
                return {
                    success: true,
                    message: 'Offer has no open remainder. Collect its claims to free the slot.',
                    offer,
                    state: this.state(),
                    phase: 'observation',
                    outcome: 'confirmed',
                };
            const state = await this.click('cancel', (s) => s.receipt?.kind === 'cancel' && s.receipt.offerId === offerId, deadline);
            return {
                success: true,
                message: 'Unfilled remainder cancelled; assets are ready for collection.',
                offer: state.offers.find((o) => o.id === offerId),
                state,
                phase: 'completion',
                outcome: 'confirmed',
            };
        }, true);
    }
    async collect(offerId: number | undefined, notes: boolean, timeout: number): Promise<GEActionResult> {
        return this.run(async () => {
            const deadline = Date.now() + timeout;
            if (offerId !== undefined) {
                if (!this.validNumber(offerId)) throw new GEFailure('Invalid offer ID.', 'invalid_argument');
                await this.select(offerId, deadline);
            }
            const state = await this.click(
                // collectNotes is only offered when the claim holds a notable item; plain collect is equivalent otherwise.
                offerId === undefined ? 'collectAll' : notes && this.state().controls.collectNotes ? 'collectNotes' : 'collect',
                (s) => s.receipt?.kind === 'collect' && s.receipt.offerId === offerId,
                deadline,
            );
            return {
                success: true,
                message: `Collected ${state.receipt!.items} items and ${state.receipt!.coins} gp. Any overflow remains in the exchange.`,
                items: state.receipt!.items,
                coins: state.receipt!.coins,
                state,
                phase: 'completion',
                outcome: 'confirmed',
            };
        }, true);
    }
}
