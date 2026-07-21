export type PlayerTelemetryEvent = {
    timestamp: number;
    username: string;
    session_uuid: string | null;
    x: number;
    z: number;
    level: number;
    ip: string | null;
    total_xp: number;
    // JSON map of skill name -> { xp, level }; only set when xp changed since the last snapshot
    skills: string | null;
};
