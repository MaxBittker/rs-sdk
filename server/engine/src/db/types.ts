import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date | string, Date | string, Date | string>;

export type account = {
    id: Generated<number>;
    username: string;
    password: string;
    registration_ip: string | null;
    registration_date: Generated<Timestamp>;
    muted_until: Timestamp | null;
    banned_until: Timestamp | null;
    staffmodlevel: Generated<number>;
    members: Generated<number>;
};
export type account_login = {
    account_id: number;
    profile: string;
    logged_in: Generated<number>;
    login_time: Timestamp | null;
    logged_out: Generated<number>;
    logout_time: Timestamp | null;
};
export type friendlist = {
    account_id: number;
    friend_account_id: number;
    profile: Generated<string>;
    created: Generated<Timestamp>;
};
export type hiscore = {
    account_id: number;
    profile: Generated<string>;
    type: number;
    level: number;
    value: number;
    playtime: Generated<number>;
    date: Generated<Timestamp>;
};
export type hiscore_large = {
    account_id: number;
    profile: Generated<string>;
    type: number;
    level: number;
    value: number;
    playtime: Generated<number>;
    date: Generated<Timestamp>;
};
export type ignorelist = {
    account_id: number;
    value: string;
    profile: Generated<string>;
    created: Generated<Timestamp>;
};
export type input_report = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: Timestamp;
    data: Buffer;
};
export type ipban = {
    ip: string;
};
export type private_chat = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    timestamp: Timestamp;
    coord: number;
    to_account_id: number;
    message: string;
};
export type public_chat = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: Timestamp;
    coord: number;
    message: string;
};
export type report = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: Timestamp;
    coord: number;
    offender: string;
    reason: number;
};
export type session = {
    uuid: string;
    account_id: number;
    profile: string;
    world: number;
    timestamp: Timestamp;
    uid: number;
    ip: string | null;
};
export type session_log = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: Timestamp;
    coord: number;
    event: string;
    event_type: Generated<number>;
};
export type session_wealth = {
    id: Generated<number>;
    session_uuid: string;
    timestamp: Timestamp;
    coord: number;
    event_type: Generated<number>;
    account_items: string;
    account_value: number;
    recipient_session: string | null;
    recipient_items: string | null;
    recipient_value: number | null;
};
export type hiscore_outfit = {
    account_id: number;
    profile: Generated<string>;
    value: number;
    items: string;
    date: Generated<Timestamp>;
};
export type hiscore_bank = {
    account_id: number;
    profile: Generated<string>;
    value: number;
    items: string;
    date: Generated<Timestamp>;
};
export type player_telemetry = {
    id: Generated<number>;
    timestamp: Timestamp;
    username: string;
    session_uuid: string | null;
    x: number;
    z: number;
    level: number;
    ip: string | null;
    total_xp: Generated<number>;
    skills: string | null;
};
export type player_telemetry_segment = {
    id: Generated<number>;
    username: string;
    session_uuid: string | null;
    ip: string | null;
    start_time: Timestamp;
    end_time: Timestamp;
    sample_count: number;
    data: Buffer;
};
export type player_skills_log = {
    id: Generated<number>;
    timestamp: Timestamp;
    username: string;
    total_xp: number;
    skills: string;
};
export type DB = {
    account: account;
    account_login: account_login;
    friendlist: friendlist;
    hiscore: hiscore;
    hiscore_large: hiscore_large;
    hiscore_outfit: hiscore_outfit;
    hiscore_bank: hiscore_bank;
    ignorelist: ignorelist;
    input_report: input_report;
    ipban: ipban;
    player_telemetry: player_telemetry;
    player_telemetry_segment: player_telemetry_segment;
    player_skills_log: player_skills_log;
    private_chat: private_chat;
    public_chat: public_chat;
    report: report;
    session: session;
    session_log: session_log;
    session_wealth: session_wealth;
};
