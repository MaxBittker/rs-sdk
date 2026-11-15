/**
 * Counterpart to bench.ts: measures the *browser* client's per-bot cost.
 *
 * One headless Chrome, one tab per bot, each tab auto-logging into the demo
 * server. Reports process-tree RSS (over-counts Chrome's shared framework) and
 * the system-wide physical-memory delta (counts each page once), so the two
 * bracket the real marginal cost.
 *
 *   bun src/lite/bench-browser.ts 6 [fps]
 */
import puppeteer, { type Browser } from 'puppeteer';

const N = Number(process.argv[2] ?? 6);
const FPS = Number(process.argv[3] ?? 15);
const HOST = 'rs-sdk.maxbittker.com';

const readEnv = async (n: string) => Object.fromEntries(
  (await Bun.file(`/Users/max/workplace/rs-sdk/bots/${n}/bot.env`).text())
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const sh = async (cmd: string) => (await Bun.$`sh -c ${cmd}`.quiet()).stdout.toString();

/** Sum RSS (MB) + cumulative cpu-seconds over every Chrome-for-Testing process. */
async function tree(): Promise<{ rss: number; cpu: number; procs: number }> {
  const out = await sh(`ps -Ao rss=,time=,command= | grep 'Chrome for Testing' | grep -v grep`).catch(() => '');
  let rss = 0, cpu = 0, procs = 0;
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+([\d:.]+)\s/);
    if (!m) continue;
    rss += Number(m[1]) / 1024;
    const p = m[2].split(':').map(Number);
    cpu += p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    procs++;
  }
  return { rss, cpu, procs };
}

/** System-wide physical memory in use (MB): active + wired + compressed. */
async function sysUsed(): Promise<number> {
  const out = await sh('vm_stat');
  const g = (k: string) => Number(out.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1] ?? 0);
  const pageSize = Number(out.match(/page size of (\d+)/)?.[1] ?? 16384);
  return (g('Pages active') + g('Pages wired down') + g('Pages occupied by compressor')) * pageSize / 1048576;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const sys0 = await sysUsed();
console.log(`baseline: system used=${sys0.toFixed(0)}MB`);

const browser: Browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--mute-audio', '--disable-gpu',
    '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-extensions',
    '--window-size=765,600',
  ],
  protocolTimeout: 120000,
});
await sleep(1500);
const empty = await tree();
console.log(`empty browser: rss=${empty.rss.toFixed(0)}MB procs=${empty.procs}`);

const marks: number[] = [];
const sysMarks: number[] = [];
let live = 0;

for (let i = 1; i <= N; i++) {
  const env = await readEnv(`litetest${i}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 765, height: 600 });
  page.setDefaultTimeout(60000);
  await page.goto(
    `https://${HOST}/bot?bot=${env.BOT_USERNAME}&password=${encodeURIComponent(env.PASSWORD!)}&fps=${FPS}&tst=1`,
    { waitUntil: 'networkidle2', timeout: 60000 });

  let attempts = 0;
  while (!await page.evaluate(() => (window as any).gameClient?.ingame)) {
    await sleep(200);
    if (++attempts > 200) { console.log(`  bot${i}: LOGIN TIMEOUT`); break; }
  }
  if (attempts <= 200) live++;

  await sleep(3000);
  const t = await tree();
  marks.push(t.rss);
  sysMarks.push(await sysUsed());
  console.log(`  ${i} tab(s): rss=${t.rss.toFixed(0)}MB procs=${t.procs} sysUsed=+${(sysMarks[i-1]-sys0).toFixed(0)}MB`);
}

console.log('\nsettling 8s...');
await sleep(8000);

const c0 = await tree();
const t0 = performance.now();
await sleep(10000);
const c1 = await tree();
const wall = (performance.now() - t0) / 1000;
const cpuPct = ((c1.cpu - c0.cpu) / wall) * 100;

// Per-process physical footprint: what macOS actually charges the process,
// excluding clean file-backed pages shared between the Chrome helpers.
const pids = (await sh(`ps -Ao pid=,command= | grep 'Chrome for Testing' | grep -v grep`))
  .split('\n').map(l => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean) as RegExpMatchArray[];
let footTotal = 0, rendererFoot: number[] = [];
for (const [, pid, cmd] of pids) {
  const vm = await sh(`vmmap -summary ${pid} 2>/dev/null | grep -i 'Physical footprint:'`).catch(() => '');
  const m = vm.match(/Physical footprint:\s+([\d.]+)([KMG])/);
  if (!m) continue;
  const mbv = Number(m[1]) * (m[2] === 'G' ? 1024 : m[2] === 'K' ? 1 / 1024 : 1);
  footTotal += mbv;
  const kind = /--type=renderer/.test(cmd) ? 'renderer' : /--type=(\w+)/.exec(cmd)?.[1] ?? 'browser';
  if (kind === 'renderer') rendererFoot.push(mbv);
  console.log(`  pid ${pid} ${kind.padEnd(9)} footprint=${mbv.toFixed(0)}MB`);
}
console.log(`footprint total : ${footTotal.toFixed(0)} MB (renderers: ${rendererFoot.map(v => v.toFixed(0)).join(', ')})`);

const sysEnd = await sysUsed();
console.log(`\n=== ${N} browser bots, fps=${FPS} ===`);
console.log(`live sessions   : ${live}/${N}`);
console.log(`tree rss        : ${c1.rss.toFixed(0)} MB over ${c1.procs} processes`);
console.log(`marginal rss/bot: ${((marks[marks.length-1]-marks[0])/Math.max(1,N-1)).toFixed(1)} MB`);
console.log(`system used     : +${(sysEnd - sys0).toFixed(0)} MB total, ` +
  `marginal ${((sysMarks[sysMarks.length-1]-sysMarks[0])/Math.max(1,N-1)).toFixed(1)} MB/bot`);
console.log(`cpu             : ${cpuPct.toFixed(1)}% of one core for all ${N} (${(cpuPct/N).toFixed(2)}%/bot)`);

await browser.close();
