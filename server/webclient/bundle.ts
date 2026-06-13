import fs from 'fs';
import path from 'path';

import { minify } from 'terser';

import { nth_identifier } from './identifier.js';

const baseDefine = {
    'process.env.SECURE_ORIGIN': JSON.stringify(process.env.SECURE_ORIGIN ?? 'false'),
    // original key, used 2003-2010
    'process.env.LOGIN_RSAE': JSON.stringify(process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821'),
    'process.env.LOGIN_RSAN': JSON.stringify(process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789'),
    'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
};

// Build mode: 'standard', 'bot', or 'both'
const buildMode = process.env.BUILD_MODE ?? 'both';

// ----

type BunOutput = {
    source: string;
    sourcemap: string;
}

// The bot client bundles sdk/index.ts + sdk/actions.ts (for the in-browser
// script runner). Those statically import sdk/pathfinding.ts, which pulls in a
// 273KB rsmod WASM binary + a 22MB collision-data.json - Node-only machinery
// that bloats the client and breaks wasm-bindgen init in the browser. Alias it
// to a lightweight stub; the runner uses the client's native pathfinding instead.
const PATHFINDING_STUB = path.resolve('src/bot/pathfinding-browser-stub.ts');
const stubPathfindingPlugin = {
    name: 'stub-sdk-pathfinding',
    setup(build: any) {
        build.onResolve({ filter: /(^|\/)pathfinding$/ }, () => ({ path: PATHFINDING_STUB }));
    },
};

async function bunBuild(entry: string, external: string[] = [], minify = true, drop: string[] = [], customDefine: Record<string, string> = {}): Promise<BunOutput> {
    const build = await Bun.build({
        entrypoints: [entry],
        sourcemap: 'external',
        define: { ...baseDefine, ...customDefine },
        external,
        minify,
        drop,
        plugins: [stubPathfindingPlugin],
    });

    if (!build.success) {
        build.logs.forEach((x: any) => console.log(x));
        process.exit(1);
    }

    return {
        source: await build.outputs[0].text(),
        sourcemap: build.outputs[0].sourcemap ? await build.outputs[0].sourcemap.text() : ''
    };
}

async function applyTerser(script: BunOutput): Promise<boolean> {
    const mini = await minify(script.source, {
        sourceMap: {
            content: script.sourcemap
        },
        toplevel: true,
        // format: {
        //     beautify: true
        // },
        compress: {
            ecma: 2020
        },
        mangle: {
            nth_identifier: nth_identifier
            // rs-sdk: property mangling intentionally disabled. The bot framework accesses
            // many client members by their original names from outside the bundle
            // (bot.ejs auto-login: client.autoLogin / client.lastProgressPercent /
            // client.setTargetedFramerate, the Puppeteer harness: randomizeCharacterDesign /
            // acceptCharacterDesign, plus the WASM/midi glue). 274 upstream enabled property
            // mangling with a reserved list tuned only for the standalone client, which breaks
            // those external accesses. Leaving properties unmangled keeps everything addressable.
        }
    });

    script.source = mini.code ?? '';
    script.sourcemap = mini.map?.toString() ?? '';
    return true;
}

// todo: workaround due to a bun bug https://github.com/oven-sh/bun/issues/16509: not remapping external
function replaceDepsUrl(source: string) {
    return source.replaceAll('#3rdparty', '.');
}

// ----

// Create output directories
const outDirs = ['out', 'out/standard', 'out/bot'];
for (const dir of outDirs) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Copy shared assets to both directories
for (const outDir of ['out/standard', 'out/bot']) {
    fs.copyFileSync('src/3rdparty/tinymidipcm/tinymidipcm.wasm', `${outDir}/tinymidipcm.wasm`);
}

// Also copy to root out for backwards compatibility
fs.copyFileSync('src/3rdparty/tinymidipcm/tinymidipcm.wasm', 'out/tinymidipcm.wasm');

const args = process.argv.slice(2);
const prod = args[0] !== 'dev';

// Build configurations
const builds = [
    { name: 'standard', outDir: 'out/standard', enableBotSDK: 'false' },
    { name: 'bot', outDir: 'out/bot', enableBotSDK: 'true' }
];

// Filter builds based on BUILD_MODE
const buildsToRun = builds.filter(b => buildMode === 'both' || buildMode === b.name);

const entrypoints = [
    'src/client/Client.ts',
    'src/mapview/MapView.ts',
    'src/io/OnDemandWorker.ts'
];

for (const buildConfig of buildsToRun) {
    console.log(`Building ${buildConfig.name} client...`);

    const customDefine = {
        'process.env.ENABLE_BOT_SDK': JSON.stringify(buildConfig.enableBotSDK)
    };

    for (const file of entrypoints) {
        const output = path.basename(file).replace('.ts', '.js').toLowerCase();

        // 'open' is a Node-only dep reached only by BotSDK's auto-launch path,
        // which the in-browser runner disables (autoLaunchBrowser:false). Mark it
        // external so the browser bundle doesn't try to polyfill it.
        const script = await bunBuild(file, ['open'], prod, prod ? ['console'] : [], customDefine);
        if (script) {
            if (prod) {
                await applyTerser(script);
            }

            fs.writeFileSync(`${buildConfig.outDir}/${output}`, script.source);
            fs.writeFileSync(`${buildConfig.outDir}/${output}.map`, script.sourcemap);
        }
    }
}

// Build standalone item viewer
console.log('Building item viewer...');
if (!fs.existsSync('out/viewer')) {
    fs.mkdirSync('out/viewer', { recursive: true });
}
const viewerScript = await bunBuild(
    'src/viewer/ItemViewer.ts',
    [],
    prod,
    prod ? ['console'] : []
);
if (viewerScript) {
    if (prod) {
        await applyTerser(viewerScript);
    }
    fs.writeFileSync('out/viewer/viewer.js', viewerScript.source);
    fs.writeFileSync('out/viewer/viewer.js.map', viewerScript.sourcemap);
}
fs.copyFileSync('src/3rdparty/tinymidipcm/tinymidipcm.wasm', 'out/viewer/tinymidipcm.wasm');

// Ship the generated SDK API reference next to the bot client so the in-browser
// script runner's "Copy SDK Context" button can fetch it at /bot/api.md.
if (buildMode === 'both' || buildMode === 'bot') {
    const apiMd = path.resolve('../../sdk/API.md');
    if (fs.existsSync(apiMd)) {
        fs.copyFileSync(apiMd, 'out/bot/api.md');
    } else {
        console.warn('[bundle] sdk/API.md not found - run `bun sdk/generate-api-docs.ts` to enable Copy SDK Context');
    }
}

// Copy bot client to root out for backwards compatibility
if (buildMode === 'both' || buildMode === 'bot') {
    for (const ep of entrypoints) {
        const output = path.basename(ep).replace('.ts', '.js').toLowerCase();
        fs.copyFileSync(`out/bot/${output}`, `out/${output}`);
        fs.copyFileSync(`out/bot/${output}.map`, `out/${output}.map`);
    }
}

console.log('Build complete!');
