import type { ColumnType } from 'kysely';
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type account = {
    id: Generated<number>;
    username: string;
    password: string;
    email: string | null;
    registration_ip: string | null;
    registration_date: Generated<string>;
    logged_in: Generated<number>;
    login_time: string | null;
    logged_out: Generated<number>;
    logout_time: string | null;
    muted_until: string | null;
    banned_until: string | null;
    staffmodlevel: Generated<number>;
    notes: string | null;
    notes_updated: string | null;
};
export type account_session = {
    id: Generated<number>;
    account_id: number;
    world: Generated<number>;
    profile: Generated<string>;
    session_uuid: string;
    timestamp: string;
    coord: number;
    event: string;
    event_type: Generated<number>;
};
export type friendlist = {
    account_id: number;
    friend_account_id: number;
    created: Generated<string>;
};
export type hiscore = {
    profile: Generated<string>;
    account_id: number;
    type: number;
    level: number;
    value: number;
    date: Generated<string>;
};
export type hiscore_large = {
    profile: Generated<string>;
    account_id: number;
    type: number;
    level: number;
    value: number;
    date: Generated<string>;
};
export type ignorelist = {
    account_id: number;
    value: string;
    created: Generated<string>;
};
export type ipban = {
    ip: string;
};
export type login = {
    uuid: string;
    account_id: number;
    world: number;
    timestamp: string;
    uid: number;
    ip: string | null;
};
export type input_report = {
    id: Generated<number>;
    account_id: number;
    timestamp: Timestamp;
    session_uuid: string;
};
export type input_report_event = {
    input_report_id: number;
    seq: number;
    input_type: Generated<number>;
    delta: number;
    coord: number;
    mouse_x: number | null;
    mouse_y: number | null;
    key_code: number | null;
};
export type newspost = {
    id: Generated<number>;
    category: number;
    title: string;
    content: string;
    slug: string | null;
    created: Generated<string>;
    updated: Generated<string>;
};
export type private_chat = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    timestamp: string;
    coord: number;
    to_account_id: number;
    message: string;
};
export type public_chat = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    world: number;
    timestamp: string;
    coord: number;
    message: string;
};
export type report = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    world: number;
    timestamp: string;
    coord: number;
    offender: string;
    reason: number;
};
export type session = {
    uuid: string;
    account_id: number;
    profile: string;
    world: number;
    timestamp: string;
    uid: number;
    ip: string | null;
};
export type DB = {
    account: account;
    account_session: account_session;
    friendlist: friendlist;
    hiscore: hiscore;
    hiscore_large: hiscore_large;
    ignorelist: ignorelist;
    input_report: input_report;
    input_report_event: input_report_event;
    ipban: ipban;
    login: login;
    newspost: newspost;
    private_chat: private_chat;
    public_chat: public_chat;
    report: report;
    session: session;
};
