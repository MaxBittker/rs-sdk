import fs from 'fs';

import { fromBase37 } from '#jagex2/jstring/JString.js';

const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('Usage: node renameCache.js <path>');
    process.exit(1);
}

fs.readdirSync(args[0]).forEach(f => {
    try {
        fs.renameSync(`${args[0]}/${f}`, `${args[0]}/${fromBase37(BigInt(f))}`);
    } catch (err) {
        /* empty */
    }
});
