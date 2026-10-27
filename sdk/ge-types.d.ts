/** Private offer data from an open in-game session or the authenticated fleet ledger feed. */
export interface GEOffer {
    id: number;
    slot: number;
    item: number;
    name: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    remaining: number;
    filled: number;
    state: 'open' | 'completed' | 'cancelled';
    /** Collectible balances, not assets already in the backpack. */
    items: number;
    coins: number;
    gross: number;
    tax: number;
}
export interface GEState {
    isOpen: true;
    session: number;
    revision: number;
    /** Advances for handled client commands, never for passive fill updates. */
    actionRevision: number;
    screen: 'home' | 'catalog' | 'draft' | 'offer';
    offers: GEOffer[];
    selectedOffer: number | null;
    draft: {
        item: number;
        name: string;
        side: 'buy' | 'sell';
        quantity: number;
        price: number;
        slot: number | null;
    } | null;
    search: {
        query: string;
        side: 'buy' | 'sell';
        page: number;
        total: number;
        results: { item: number; name: string; componentId: number }[];
    } | null;
    input: 'item' | 'quantity' | 'price' | null;
    /** Named component IDs for the current screen; dispatched through ordinary UI handlers. */
    controls: Record<string, number>;
    notice: string;
    error: string | null;
    receipt: {
        token: number;
        kind: 'place' | 'cancel' | 'collect';
        offerId?: number;
        items?: number;
        coins?: number;
    } | null;
}
export interface GEOfferRequest {
    item: number;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    /** Zero-based offer slot. Defaults to the first empty slot. */
    slot?: number;
}
export interface GEActionResult {
    success: boolean;
    message: string;
    reason?: string;
    phase?: 'validation' | 'routing' | 'dispatch' | 'observation' | 'completion';
    /** An observation timeout after a send may have applied the action: inspect state before retrying. */
    outcome?: 'confirmed' | 'unknown';
    offer?: GEOffer;
    items?: number;
    coins?: number;
    state?: GEState;
}
