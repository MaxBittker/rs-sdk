enum EntityLifeCycle {
    FOREVER, // never respawns or despawns, is always in the world.
    RESPAWN, // entity added from engine that respawns later.
    DESPAWN // entity added from script that despawns later.
}

export default EntityLifeCycle;
