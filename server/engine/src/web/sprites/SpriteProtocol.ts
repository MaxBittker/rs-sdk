// Messages between SpriteRenderer (main thread) and SpriteWorker (worker thread).

export type PlayerAppearance = { gender: number; colors: number[]; slots: number[] };

export type SpriteJob = { kind: 'player'; appearance: PlayerAppearance; width: number; height: number } | { kind: 'item'; itemId: number; count: number };

export type SpriteRequest = SpriteJob & { id: number };

export type SpriteResponse = { id: number; png: Uint8Array | null; error?: string };
