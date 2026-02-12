#!/usr/bin/env bun
import fs from 'fs';

const data = fs.readFileSync('server/content/scripts/_unpack/225/all.loc', 'utf-8');
const blocks = data.split(/\n(?=\[)/);
const closeDoors: { id: string; name: string; blockwalk: string }[] = [];

for (const block of blocks) {
    if (block.indexOf('op1=Close') === -1) continue;
    const nameMatch = block.match(/^\[([^\]]+)\]/);
    const typeMatch = block.match(/name=(.+)/);
    const blockwalkMatch = block.match(/blockwalk=(.+)/);
    if (nameMatch) {
        closeDoors.push({
            id: nameMatch[1],
            name: typeMatch ? typeMatch[1] : '?',
            blockwalk: blockwalkMatch ? blockwalkMatch[1] : 'yes (default)',
        });
    }
}

const doorTypes = closeDoors.filter(d => /door|gate/i.test(d.name));
console.log(`All locs with op1=Close: ${closeDoors.length}`);
console.log(`Doors/Gates (wall-shaped): ${doorTypes.length}`);
doorTypes.forEach(d => console.log(`  ${d.id} - ${d.name} (blockwalk: ${d.blockwalk})`));

console.log();
const nonDoors = closeDoors.filter(d => !/door|gate/i.test(d.name));
console.log(`Non-door locs with Close: ${nonDoors.length}`);
nonDoors.forEach(d => console.log(`  ${d.id} - ${d.name}`));
