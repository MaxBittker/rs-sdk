import type { ColumnType } from 'kysely';

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U> ? ColumnType<S, I | undefined, U> : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type account = {
    id: Generated<number>;
    username: string;
    password: string;
    registration_ip: string | null;
    registration_date: Generated<Timestamp>;
};
export type friendlist = {
    account_id: number;
    friend_account_id: number;
};
export type ignorelist = {
    account_id: number;
    ignore_account_id: number;
};
export type newspost = {
    id: Generated<number>;
    category_id: number;
    title: string;
    content: string;
    date: Timestamp;
};
export type newspost_category = {
    id: Generated<number>;
    name: string;
    style: string;
};
export type npc_hiscore = {
    id: Generated<number>;
    npc_id: number;
    account_id: number;
    kill_count: Generated<number>;
};
export type private_chat = {
    id: Generated<number>;
    from_account_id: number;
    to_account_id: number;
    message: string;
    date: Generated<Timestamp>;
};
export type public_chat = {
    id: Generated<number>;
    account_id: number;
    message: string;
    date: Generated<Timestamp>;
};
export type DB = {
    account: account;
    friendlist: friendlist;
    ignorelist: ignorelist;
    newspost: newspost;
    newspost_category: newspost_category;
    npc_hiscore: npc_hiscore;
    private_chat: private_chat;
    public_chat: public_chat;
};
