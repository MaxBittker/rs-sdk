export default class ClientProtCategory {
    // todo: measure how many events we should expect to receive from the client
    // osrs has this as 50/10 but we know that's not true in rs2
    // todo: determine which packets belong in which category for this era
    static readonly CLIENT_EVENT = new ClientProtCategory(0, 20);
    static readonly USER_EVENT = new ClientProtCategory(1, 5);

    // packet decoding limit per tick, exceeding this ends decoding and picks up where it left off on the next tick
    constructor(readonly id: number, readonly limit: number) {
    }
}
