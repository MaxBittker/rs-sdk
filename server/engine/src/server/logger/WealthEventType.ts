export const enum WealthEventType {
    TRADE,
    PVP,
    STAKE,
    DEATH,
    DROP,
    PICKUP,
    SHOP_BUY,
    SHOP_SELL,
    LOW_ALCHEMY,
    HIGH_ALCHEMY,
    PARTY_ROOM,
};

export const filteredEventTypes = [
    WealthEventType.DROP,
    WealthEventType.PICKUP
];

export const groupedEventTypes = [
    WealthEventType.DEATH,
    WealthEventType.PVP,
    WealthEventType.PARTY_ROOM
];
