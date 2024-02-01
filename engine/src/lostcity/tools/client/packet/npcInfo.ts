import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

const npcIds: number[] = [];
let npcCount = 0;

const entityRemovalIds: number[] = [];
let entityRemovalCount = 0;

const entityUpdateIds: number[] = [];
let entityUpdateCount = 0;

fs.readdirSync('dump')
    .sort((a, b) => parseInt(a.slice(0, a.length - '.npc.bin'.length)) - parseInt(b.slice(0, b.length - '.npc.bin'.length)))
    .filter(f => f.endsWith('.npc.bin'))
    .forEach(f => {
        const buf = Packet.load(`dump/${f}`);
        console.log('----');
        console.log(f);

        entityRemovalCount = 0;
        entityUpdateCount = 0;

        // readNpcs
        buf.bits();

        const total = buf.gBit(8);
        if (total < npcCount) {
            for (let i = total; i < npcCount; i++) {
                entityRemovalIds[entityRemovalCount++] = npcIds[i];
            }
        }

        if (total > npcCount) {
            console.error('Too many npcs', total, npcCount);
            process.exit(1);
        }

        npcCount = 0;
        for (let i = 0; i < total; i++) {
            const id = npcIds[i];
            const update = buf.gBit(1);

            if (update === 0) {
                console.log('refresh', id);
                npcIds[npcCount++] = id;
            } else if (update === 1) {
                const type = buf.gBit(2);

                if (type === 0) {
                    npcIds[npcCount++] = id;
                    console.log('refresh + mask', id);
                    entityUpdateIds[entityUpdateCount++] = id;
                } else if (type === 1) {
                    npcIds[npcCount++] = id;
                    const walkDir = buf.gBit(3);
                    const maskUpdate = buf.gBit(1);
                    console.log('refresh + walk', id, walkDir, maskUpdate);

                    if (maskUpdate === 1) {
                        entityUpdateIds[entityUpdateCount++] = id;
                    }
                } else if (type === 2) {
                    npcIds[npcCount++] = id;
                    const runDir = buf.gBit(3);
                    const walkDir = buf.gBit(3);
                    const maskUpdate = buf.gBit(1);
                    console.log('refresh + run', id, runDir, walkDir, maskUpdate);

                    if (maskUpdate === 1) {
                        entityUpdateIds[entityUpdateCount++] = id;
                    }
                } else if (type === 3) {
                    console.log('remove', id);
                    entityRemovalIds[entityRemovalCount++] = id;
                }
            }
        }

        // readNewNpcs
        while (buf.bitPos + 21 < buf.length * 8) {
            const id = buf.gBit(13);
            if (id === 8191) {
                break;
            }

            npcIds[npcCount++] = id;
            const type = buf.gBit(11);
            const x = buf.gBit(5);
            const z = buf.gBit(5);
            const maskUpdate = buf.gBit(1);
            console.log('add', id, type, x, z, maskUpdate);

            if (maskUpdate === 1) {
                entityUpdateIds[entityUpdateCount++] = id;
            }
        }

        buf.bytes();

        // readNpcUpdates
        for (let i = 0; i < entityUpdateCount; i++) {
            const id = entityUpdateIds[i];
            const mask = buf.g1();
            console.log('mask', id, mask.toString(16));

            if ((mask & 0x2) === 0x2) {
                const animId = buf.g2();
                const animDelay = buf.g1();
            }

            if ((mask & 0x4) === 0x4) {
                const faceEntity = buf.g2();
            }

            if ((mask & 0x8) === 0x8) {
                const say = buf.gjstr();
            }

            if ((mask & 0x10) === 0x10) {
                const hitDamage = buf.g2();
                const hitType = buf.g1();
                const health = buf.g1();
                const maxHealth = buf.g2();
            }

            if ((mask & 0x20) === 0x20) {
                const newType = buf.g2();
            }

            if ((mask & 0x40) === 0x40) {
                const graphicId = buf.g2();
                const graphicHeight = buf.g2();
                const graphicDelay = buf.g1();
            }

            if ((mask & 0x80) === 0x80) {
                const faceX = buf.g2();
                const faceZ = buf.g2();
            }
        }

        for (let i = 0; i < entityRemovalCount; i++) {
            const id = entityRemovalIds[i];
        }

        if (buf.pos !== buf.length) {
            console.error('size mismatch in getnpc', buf.pos, buf.length);
            process.exit(1);
        }

        console.log(npcCount, 'npcs');
    });
