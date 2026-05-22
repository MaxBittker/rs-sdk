import child_process from 'child_process';

import { getDatabaseUrl, loadWorldConfig } from '#/util/WorldConfig.js';

const args = process.argv.slice(2);

if (!args.some(arg => arg === '--schema' || arg.startsWith('--schema='))) {
    args.push('--schema', 'prisma/multiworld/schema.prisma');
}

const config = loadWorldConfig();
const databaseUrl = getDatabaseUrl(config);

const prismaExecutable = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';

const result = child_process.spawnSync(prismaExecutable, args, {
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
