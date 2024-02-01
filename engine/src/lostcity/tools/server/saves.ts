import fs from 'fs';

import Player from '#lostcity/entity/Player.js';

const saves = fs.readdirSync('data/players');

const sorted = [];
for (let i = 0; i < saves.length; i++) {
    const username = saves[i].split('.')[0];
    const player = Player.loadFromFile(username);
    sorted.push(player);
}
sorted.sort((a, b) => b.playtime - a.playtime);

for (let i = 0; i < sorted.length; i++) {
    const player = sorted[i];
    const ticks = player.playtime;

    const seconds = Math.round((ticks / 1000) * 600 * 100) / 100;
    const minutes = Math.round((seconds / 60) * 100) / 100;
    const hours = Math.round((minutes / 60) * 100) / 100;

    if (hours > 1) {
        console.log(player.username, 'played for:', hours, 'hours');
    } else if (minutes > 1) {
        console.log(player.username, 'played for:', minutes, 'minutes');
    } else {
        console.log(player.username, 'played for:', seconds, 'seconds');
    }
}
