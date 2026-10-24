// Run a single role on a single bot (spike / debugging path).
//   bun economy/runtime/run-one.ts <botname> <role> [--cycles=N]
// Requires: engine + gateway + a lite client attached for <botname> (see economy/README.md).
import { runScript } from '../../sdk/runner';
import { makeEmit } from '../lib/telemetry/log';
import { runRole } from '../lib/agent/run';
import { miner } from '../roles/miner';
import type { Role } from '../lib/agent/types';

const roles: Record<string, Role> = { miner };
const [name, roleName] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const cycles = Number(process.argv.find(a => a.startsWith('--cycles='))?.split('=')[1] ?? 1);
const role = roles[roleName];
if (!name || !role) { console.error('usage: run-one.ts <bot> <' + Object.keys(roles).join('|') + '> [--cycles=N]'); process.exit(1); }
process.argv.splice(2, 0); // runScript derives bots/<name>/bot.env from the first positional arg

await runScript(async ({ bot, sdk }) => {
    await bot.skipTutorial();
    const ctx = { name, role: role.name, bot, sdk, emit: makeEmit(name, role.name), traits: { undercut: 0.03, batch: 25 }, mem: {} };
    await runRole(ctx, role, { cycles });
}, { timeout: 30 * 60_000, printState: true });
