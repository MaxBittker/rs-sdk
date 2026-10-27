import ObjType from '#/cache/config/ObjType.js';
import type { GEOffer } from '../../../../../sdk/ge-types.js';
import type { MarketStore } from './MarketStore.js';

/** The same private offer shape for an open game interface and an offline fleet read. */
export function projectMarketOffers(store: MarketStore, owner: string): GEOffer[] {
    return store.offers(owner).map(({ owner: _owner, created: _created, ...offer }) => ({
        ...offer,
        name: ObjType.get(offer.item).name ?? 'Item'
    }));
}
