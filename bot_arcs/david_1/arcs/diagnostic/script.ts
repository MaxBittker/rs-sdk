import { runArc } from '../../../arc-runner';

runArc({
    characterName: 'david_1',
    arcName: 'diagnostic',
    goal: 'Check current character state',
    timeLimit: 60 * 1000,
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Diagnostic ===');

    // Wait for state to load - be very patient
    ctx.log('Waiting for state to sync...');
    for (let i = 0; i < 60; i++) {  // Wait up to 30 seconds
        const s = ctx.state();
        if (s?.player?.worldX > 0) {
            ctx.log(`State loaded after ${i+1} attempts`);
            break;
        }
        await new Promise(r => setTimeout(r, 500));
        ctx.progress();
    }

    const state = ctx.state();
    ctx.log('Position: (' + state?.player?.worldX + ', ' + state?.player?.worldZ + ')');
    ctx.log('Combat Level: ' + state?.player?.combatLevel);

    const hp = state?.skills.find(s => s.name === 'Hitpoints');
    ctx.log('HP: ' + hp?.level + '/' + hp?.baseLevel);

    ctx.log('');
    ctx.log('Skills:');
    const trainedSkills = state?.skills.filter(s => s.baseLevel > 1) ?? [];
    for (const skill of trainedSkills) {
        ctx.log('  ' + skill.name + ': ' + skill.baseLevel + ' (' + skill.experience + ' XP)');
    }

    ctx.log('');
    ctx.log('Inventory (' + state?.inventory.length + '/28):');
    for (const item of state?.inventory ?? []) {
        ctx.log('  - ' + item.name + (item.count > 1 ? ' x' + item.count : ''));
    }

    ctx.log('');
    ctx.log('Nearby NPCs:');
    for (const npc of state?.nearbyNpcs.slice(0, 10) ?? []) {
        ctx.log('  - ' + npc.name + ' (lvl ' + npc.combatLevel + ') - ' + npc.distance.toFixed(0) + ' tiles');
    }

    ctx.log('');
    ctx.log('Equipment:');
    for (const slot of state?.equipment ?? []) {
        if (slot.name) {
            ctx.log('  - ' + slot.name);
        }
    }

    // Show current combat style
    ctx.log('');
    ctx.log('Combat Style:');
    if (state?.combatStyle) {
        ctx.log(`  Weapon: ${state.combatStyle.weaponName}`);
        ctx.log(`  Current Style: ${state.combatStyle.currentStyle}`);
        for (const style of state.combatStyle.styles) {
            const current = style.index === state.combatStyle.currentStyle ? ' <<CURRENT' : '';
            ctx.log(`    [${style.index}] ${style.name} (${style.type}) - trains ${style.trainedSkill}${current}`);
        }
    } else {
        ctx.log('  No combat style info available');
    }

    ctx.log('Done!');
});
