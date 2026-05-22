import { Counter, Gauge, Histogram } from 'prom-client';

export const trackPlayerCount = new Gauge({ name: 'lostcity_active_players', help: 'Active player count.' });
export const trackNpcCount = new Gauge({ name: 'lostcity_active_npcs', help: 'Active NPC count.' });

export const trackCycleTime = new Histogram({
    name: 'lostcity_cycle_ms',
    help: 'Overall processing duration in milliseconds.',
    buckets: [10, 20, 30, 50, 80, 100, 150, 200, 250, 300, 400, 450, 550, 600, 800, 1000]
});

export const trackCycleWorldTime = new Histogram({
    name: 'lostcity_cycle_world_ms',
    help: 'World (not overall) processing duration in milliseconds.',
    buckets: [10, 20, 30, 40, 50, 100]
});

export const trackCycleClientInTime = new Histogram({
    name: 'lostcity_cycle_client_in_ms',
    help: 'Client In processing duration in milliseconds.',
    buckets: [10, 30, 50, 100, 200, 300, 400]
});

export const trackCycleClientOutTime = new Histogram({
    name: 'lostcity_cycle_client_out_ms',
    help: 'Client Out processing duration in milliseconds.',
    buckets: [10, 30, 50, 100, 200, 300, 400]
});

export const trackCycleNpcTime = new Histogram({
    name: 'lostcity_cycle_npc_ms',
    help: 'NPC processing duration in milliseconds.',
    buckets: [10, 20, 30, 40, 50, 100]
});

export const trackCyclePlayerTime = new Histogram({
    name: 'lostcity_cycle_player_ms',
    help: 'Player processing duration in milliseconds.',
    buckets: [10, 20, 30, 40, 50, 100]
});

export const trackCycleZoneTime = new Histogram({
    name: 'lostcity_cycle_zone_ms',
    help: 'Zone processing duration in milliseconds.',
    buckets: [10, 20, 30, 40, 50, 100]
});

export const trackCycleLoginTime = new Histogram({
    name: 'lostcity_cycle_login_ms',
    help: 'Login processing duration in milliseconds.',
    buckets: [10, 30, 50, 100]
});

export const trackCycleLogoutTime = new Histogram({
    name: 'lostcity_cycle_logout_ms',
    help: 'Logout processing duration in milliseconds.',
    buckets: [10, 30, 50, 100]
});

export const trackCycleBandwidthInBytes = new Counter({
    name: 'lostcity_cycle_bandwidth_in_bytes',
    help: 'Total incoming bandwidth in bytes.'
});

export const trackCycleBandwidthOutBytes = new Counter({
    name: 'lostcity_cycle_bandwidth_out_bytes',
    help: 'Total outgoing bandwidth in bytes.'
});

export const trackSessionEventsPublished = new Counter({
    name: 'lostcity_session_events_published',
    help: 'Total number of session events published.'
});
