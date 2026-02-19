/**
 * Verification: report GP results from the 5-loop iterative benchmark.
 * Reads per-loop GP results from /app/gp_results.json (written by the agent).
 * Also connects to bots from the last completed loop to verify inventory coins.
 *
 * Bot naming: l{loop}a{1-5} — e.g. l1a1, l1a2, ..., l5a5
 *
 * Writes best loop GP to reward.txt for Harbor compatibility.
 * Writes full per-loop breakdown to reward.json for charting.
 */
import { BotSDK } from '/app/sdk/index';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';

const COINS_ID = 995;

const GP_RESULTS_PATH = '/app/gp_results.json';

interface LoopResult {
    loop: number;
    totalGp: number;
    perBot?: Record<string, number>;
    method?: string;
    gpPerTick?: number;
}

interface GpResults {
    loops: LoopResult[];
}

async function getCoinsForBot(botName: string): Promise<number> {
    const sdk = new BotSDK({
        botUsername: botName,
        password: 'test',
        gatewayUrl: 'ws://localhost:7780',
        connectionMode: 'observe',
        autoLaunchBrowser: false,
        autoReconnect: false,
    });

    try {
        await sdk.connect();
        await sdk.waitForCondition(s => s.inGame && s.skills.length > 0, 15000);

        const inv = sdk.getInventory();
        let coins = 0;
        if (inv) {
            for (const item of inv) {
                if (item.id === COINS_ID) {
                    coins += item.count;
                }
            }
        }

        console.log(`  ${botName}: ${coins} coins`);
        return coins;
    } catch (err: any) {
        console.log(`  ${botName}: not connected (0 GP) — ${err.message}`);
        return 0;
    } finally {
        sdk.disconnect();
    }
}

async function main() {
    console.log('Reading GP results from iterative benchmark...');

    // Read per-loop results written by the agent
    let gpResults: GpResults | null = null;
    if (existsSync(GP_RESULTS_PATH)) {
        try {
            gpResults = JSON.parse(readFileSync(GP_RESULTS_PATH, 'utf-8'));
            console.log(`Found ${gpResults!.loops?.length ?? 0} loop results`);
        } catch (err) {
            console.error(`Failed to parse ${GP_RESULTS_PATH}:`, err);
        }
    }

    const loops = gpResults?.loops ?? [];

    // Try to verify the last loop's bots by connecting to them
    const lastLoop = loops.length > 0 ? loops[loops.length - 1] : null;
    let verifiedGp: Record<string, number> = {};
    let verifiedTotal = 0;

    if (lastLoop) {
        const loopNum = lastLoop.loop;
        console.log(`\nVerifying loop ${loopNum} bots (l${loopNum}a1 - l${loopNum}a5)...`);
        for (let i = 1; i <= 5; i++) {
            const botName = `l${loopNum}a${i}`;
            const coins = await getCoinsForBot(botName);
            verifiedGp[botName] = coins;
            verifiedTotal += coins;
        }
        console.log(`Verified inventory total for loop ${loopNum}: ${verifiedTotal}`);
    }

    // Determine best loop GP
    const bestLoop = loops.reduce((best, loop) =>
        (loop.totalGp > (best?.totalGp ?? 0)) ? loop : best,
        null as LoopResult | null
    );
    const bestGp = bestLoop?.totalGp ?? 0;

    // Reward = best single loop GP
    const reward = Math.max(bestGp, verifiedTotal);

    console.log(`\nResults:`);
    console.log(`  Loops completed: ${loops.length}`);
    if (bestLoop) {
        console.log(`  Best loop: #${bestLoop.loop} — ${bestLoop.totalGp} GP (${bestLoop.method ?? 'unknown method'})`);
    }
    console.log(`  Reward (best): ${reward} GP`);

    // Print per-loop summary
    if (loops.length > 0) {
        console.log('\n  Per-loop breakdown:');
        for (const loop of loops) {
            console.log(`    Loop ${loop.loop}: ${loop.totalGp} GP — ${loop.method ?? '?'} (${loop.gpPerTick?.toFixed(2) ?? '?'} GP/tick)`);
        }
    }

    mkdirSync('/logs/verifier', { recursive: true });

    writeFileSync('/logs/verifier/reward.txt', reward.toString());
    writeFileSync('/logs/verifier/reward.json', JSON.stringify({
        reward,
        bestLoop,
        loopsCompleted: loops.length,
        loops,
        verifiedLastLoop: lastLoop ? { loopNum: lastLoop.loop, totalGp: verifiedTotal, perBot: verifiedGp } : null,
    }, null, 2));

    console.log(`\nReward: ${reward}`);
}

main().catch(err => {
    console.error('Verification error:', err);
    try {
        mkdirSync('/logs/verifier', { recursive: true });
        writeFileSync('/logs/verifier/reward.txt', '0');
        writeFileSync('/logs/verifier/reward.json', JSON.stringify({
            reward: 0,
            loopsCompleted: 0,
            loops: [],
            error: err.message,
        }));
    } catch {}
    process.exit(1);
});
