# Final observe + wiki trainer fixes

Status: complete

- Made trainer source, generated world data, progressive entry points, specs, and test wiring trackable so the branch is self-contained.
- Scoped low-HP banking to combat, preserved opening-cash thieving, and added the bank-stall escape.
- Prevented the Cook's Assistant container step from succeeding without acquiring missing containers; preserved woodcutting/mining progress after a final failed confirmation.
- Removed unused `questReady`; `recentFail` now expires after 60 seconds.

Verification:

- `bun test bots/_shared/trainer/` — 43 passed
- `bun run typecheck` — passed

Deferred:

- Live Cook's Assistant smoke test was not run because no engine was already running.
