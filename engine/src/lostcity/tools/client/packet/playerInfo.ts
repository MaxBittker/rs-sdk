import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';
import { fromBase37 } from '#jagex2/jstring/JString.js';

const playerIds: number[] = [];
let playerCount = 0;

const entityRemovalIds: number[] = [];
let entityRemovalCount = 0;

const entityUpdateIds: number[] = [];
let entityUpdateCount = 0;

const files = fs.readdirSync('dump');
const players = new Map<string, number[]>();
for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (file.endsWith('.player.bin')) {
        const parts = file.split('.');
        const tick = parseInt(parts[0]);
        const username = parts[1];

        if (!players.has(username)) {
            players.set(username, []);
        }

        players.get(username)!.push(tick);
    }
}

for (const [username, ticks] of players) {
    // if (username !== 'pazaz') {
    //     continue;
    // }

    ticks.sort((a, b) => a - b);

    for (let i = 0; i < ticks.length; i++) {
        console.log('----');
        console.log(username, 'tick', ticks[i]);
        const buf = Packet.load(`dump/${ticks[i]}.${username}.player.bin`);

        entityRemovalCount = 0;
        entityUpdateCount = 0;

        // readLocalPlayer
        buf.bits();

        const update = buf.gBit(1);

        if (update === 1) {
            const type = buf.gBit(2);

            if (type === 0) {
                console.log('local mask');
                entityUpdateIds[entityUpdateCount++] = 0;
            } else if (type === 1) {
                const walkDir = buf.gBit(3);
                const maskUpdate = buf.gBit(1);
                console.log('local walk', walkDir, maskUpdate);

                if (maskUpdate === 1) {
                    entityUpdateIds[entityUpdateCount++] = 0;
                }
            } else if (type === 2) {
                const runDir = buf.gBit(3);
                const walkDir = buf.gBit(3);
                const maskUpdate = buf.gBit(1);
                console.log('local run', runDir, walkDir, maskUpdate);

                if (maskUpdate === 1) {
                    entityUpdateIds[entityUpdateCount++] = 0;
                }
            } else if (type === 3) {
                const level = buf.gBit(2);
                const x = buf.gBit(7);
                const z = buf.gBit(7);
                const jump = buf.gBit(1);
                const maskUpdate = buf.gBit(1);
                console.log('local teleport', level, x, z, jump, maskUpdate);

                if (maskUpdate === 1) {
                    entityUpdateIds[entityUpdateCount++] = 0;
                }
            }
        }

        // readPlayers
        const total = buf.gBit(8);
        if (total < playerCount) {
            for (let i = total; i < playerCount; i++) {
                entityRemovalIds[entityRemovalCount++] = playerIds[i];
            }
        }

        if (total > playerCount) {
            console.error('Too many players', total, playerCount);
            process.exit(1);
        }

        playerCount = 0;
        for (let i = 0; i < total; i++) {
            const id = playerIds[i];
            const update = buf.gBit(1) ? true : false;

            if (!update) {
                console.log('refresh', id);
                playerIds[playerCount++] = id;
            } else {
                const type = buf.gBit(2);

                if (type === 0) {
                    playerIds[playerCount++] = id;
                    console.log('refresh + mask', id);
                    entityUpdateIds[entityUpdateCount++] = id;
                } else if (type === 1) {
                    playerIds[playerCount++] = id;
                    const walkDir = buf.gBit(3);
                    const maskUpdate = buf.gBit(1) ? true : false;
                    console.log('refresh + walk', id, walkDir, maskUpdate);

                    if (maskUpdate) {
                        entityUpdateIds[entityUpdateCount++] = id;
                    }
                } else if (type === 2) {
                    playerIds[playerCount++] = id;
                    const runDir = buf.gBit(3);
                    const walkDir = buf.gBit(3);
                    const maskUpdate = buf.gBit(1) ? true : false;
                    console.log('refresh + run', id, runDir, walkDir, maskUpdate);

                    if (maskUpdate) {
                        entityUpdateIds[entityUpdateCount++] = id;
                    }
                } else if (type === 3) {
                    console.log('remove', id);
                    entityRemovalIds[entityRemovalCount++] = id;
                }
            }
        }

        // readNewPlayers
        while (buf.bitPos + 10 < buf.data.length * 8) {
            const id = buf.gBit(11);
            if (id === 2047) {
                break;
            }

            playerIds[playerCount++] = id;
            let x = buf.gBit(5);
            if (x > 15) {
                x -= 32;
            }
            let z = buf.gBit(5);
            if (z > 15) {
                z -= 32;
            }
            const jump = buf.gBit(1) ? true : false;
            const maskUpdate = buf.gBit(1) ? true : false;
            console.log('add', id, x, z, jump, maskUpdate);

            if (maskUpdate) {
                entityUpdateIds[entityUpdateCount++] = id;
            }
        }

        buf.bytes();

        // readPlayerUpdates
        for (let i = 0; i < entityUpdateCount; i++) {
            const id = entityUpdateIds[i];

            if (!buf.available) {
                console.error('not enough data in getplayer', id, entityUpdateCount, i);
                process.exit(1);
            }

            let mask = buf.g1();
            if ((mask & 0x80) === 0x80) {
                mask += buf.g1() << 8;
            }

            console.log('mask', id, mask.toString(16));

            if ((mask & 0x1) === 0x1) {
                const length = buf.g1();
                const gender = buf.g1();
                const headicons = buf.g1();

                for (let i = 0; i < 12; i++) {
                    let type = buf.g1();

                    if (type === 0) {
                        //
                    } else {
                        type = (type << 8) + buf.g1();
                    }
                }

                for (let i = 0; i < 5; i++) {
                    const color = buf.g1();
                }

                let basReadyAnim = buf.g2();
                if (basReadyAnim === 65535) {
                    basReadyAnim = -1;
                }

                let basTurnOnSpot = buf.g2();
                if (basTurnOnSpot === 65535) {
                    basTurnOnSpot = -1;
                }

                let basWalkForward = buf.g2();
                if (basWalkForward === 65535) {
                    basWalkForward = -1;
                }

                let basWalkBackward = buf.g2();
                if (basWalkBackward === 65535) {
                    basWalkBackward = -1;
                }

                let basWalkLeft = buf.g2();
                if (basWalkLeft === 65535) {
                    basWalkLeft = -1;
                }

                let basWalkRight = buf.g2();
                if (basWalkRight === 65535) {
                    basWalkRight = -1;
                }

                let basRunning = buf.g2();
                if (basRunning === 65535) {
                    basRunning = -1;
                }

                const name = fromBase37(buf.g8());
                const combatLevel = buf.g1();
            }

            if ((mask & 0x2) === 0x2) {
                const animId = buf.g2();
                const animDelay = buf.g1();
            }

            if ((mask & 0x4) === 0x4) {
                const faceEntity = buf.g2();
            }

            if ((mask & 0x8) === 0x8) {
                const chat = buf.gjstr();
            }

            if ((mask & 0x10) === 0x10) {
                const hitDamage = buf.g2();
                const hitType = buf.g1();
                const health = buf.g1();
                const maxHealth = buf.g2();
            }

            if ((mask & 0x20) === 0x20) {
                const faceX = buf.g2();
                const faceZ = buf.g2();
            }

            if ((mask & 0x40) === 0x40) {
                const messageColor = buf.g1();
                const messageEffect = buf.g1();
                const messageType = buf.g1();

                const length = buf.g1();
                const message = new Uint8Array(length);
                buf.gdata(message, 0, message.length);
            }

            if ((mask & 0x100) === 0x100) {
                const graphicId = buf.g2();
                const graphicHeight = buf.g2();
                const graphicDelay = buf.g2();
            }

            if ((mask & 0x200) === 0x200) {
                const exactStartX = buf.g1();
                const exactStartZ = buf.g1();
                const exactEndX = buf.g1();
                const exactEndZ = buf.g1();
                const exactMoveStart = buf.g2();
                const exactMoveEnd = buf.g2();
                const exactMoveDirection = buf.g1();
            }
        }

        for (let i = 0; i < entityRemovalCount; i++) {
            const id = entityRemovalIds[i];
        }

        if (buf.pos !== buf.data.length) {
            console.error('size mismatch in getplayer', buf.pos, buf.data.length);
            process.exit(1);
        }

        console.log(playerCount, 'players');
    }
}
