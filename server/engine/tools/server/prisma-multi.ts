import child_process from 'child_process';
import path from 'path';

import { getDatabaseUrl, loadWorldConfig } from '#/util/WorldConfig.js';

const args = process.argv.slice(2);

if (!args.some(arg => arg === '--schema' || arg.startsWith('--schema='))) {
    args.push('--schema', 'prisma/multiworld/schema.prisma');
}

const config = loadWorldConfig();
const databaseUrl = getDatabaseUrl(config);

const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

const result = child_process.spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: 'inherit',
    env: {
        ...process.env,
        DATABASE_URL: databaseUrl
    }
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
