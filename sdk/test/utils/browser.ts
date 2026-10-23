/**
 * Browser launch helper for SDK-based tests.
 * Launches a Puppeteer browser with the game client.
 * No CLI dependency - just browser management.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { BotSDK } from '../..';
import { BotActions } from '../../actions';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BOT_URL = process.env.BOT_URL || 'http://localhost:8888/bot';

/**
 * Password the test bots log in (and auto-register) with. The SDK must send the
 * same one: with LOGIN_SERVER=true the gateway authenticates the SDK connection
 * separately from the browser page, and an empty password is rejected.
 */
const BOT_PASSWORD = process.env.BOT_PASSWORD || 'test';

// Persistent browser endpoint file - allows cross-process browser sharing
const BROWSER_ENDPOINT_FILE = join(tmpdir(), 'rs-agent-browser-endpoint.txt');

// HEADLESS env var: 'true' or '1' for headless, anything else for visible browser
// Default: false (show browser) for easier debugging
const DEFAULT_HEADLESS = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';

// BACKGROUND env var: 'true' or '1' to spawn windows off-screen (won't steal focus)
const DEFAULT_BACKGROUND = process.env.BACKGROUND === 'true' || process.env.BACKGROUND === '1';

// Hold browser open for inspection when not headless
const CLEANUP_DELAY_MS = 2000;

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Shared browser instance for multi-bot scenarios
let sharedBrowser: Browser | null = null;
let sharedBrowserRefCount = 0;

// Game canvas size (must match the canvas element in bot.ejs)
const GAME_WIDTH = 765;
const GAME_HEIGHT = 600;

// Chrome args optimized for lower resource usage
const LIGHTWEIGHT_CHROME_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--mute-audio',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-ipc-flooding-protection',
    // Additional performance flags
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--safebrowsing-disable-auto-update',
    '--disable-infobars',
    '--disable-features=TranslateUI',
    // Set window size to match game canvas (avoids dead area)
    `--window-size=${GAME_WIDTH},${GAME_HEIGHT}`,
];

/**
 * Try to connect to an existing browser via saved WebSocket endpoint.
 * Returns null if no browser available or connection fails.
 */
async function tryConnectToExistingBrowser(): Promise<Browser | null> {
    if (!existsSync(BROWSER_ENDPOINT_FILE)) {
        return null;
    }

    try {
        const wsEndpoint = readFileSync(BROWSER_ENDPOINT_FILE, 'utf-8').trim();
        const browser = await puppeteer.connect({
            browserWSEndpoint: wsEndpoint,
            protocolTimeout: 120000,
        });
        console.log('[Browser] Connected to existing browser');
        return browser;
    } catch (err) {
        // Endpoint stale or browser closed - clean up file
        try { unlinkSync(BROWSER_ENDPOINT_FILE); } catch {}
        return null;
    }
}

/**
 * Save browser endpoint for cross-process sharing.
 */
function saveBrowserEndpoint(browser: Browser): void {
    const wsEndpoint = browser.wsEndpoint();
    writeFileSync(BROWSER_ENDPOINT_FILE, wsEndpoint, 'utf-8');
    console.log('[Browser] Saved endpoint for cross-process sharing');
}

/**
 * Get or create a shared browser instance.
 * Use this for load tests to avoid spawning many browser processes.
 *
 * Cross-process sharing: If another process has a browser running,
 * we'll connect to it instead of launching a new one.
 */
export async function getSharedBrowser(headless: boolean = true, background: boolean = false): Promise<Browser> {
    // First, try connecting to in-process shared browser
    if (sharedBrowser && sharedBrowser.connected) {
        sharedBrowserRefCount++;
        return sharedBrowser;
    }

    // Try connecting to cross-process shared browser
    const existingBrowser = await tryConnectToExistingBrowser();
    if (existingBrowser) {
        sharedBrowser = existingBrowser;
        sharedBrowserRefCount++;
        return existingBrowser;
    }

    // Launch new browser
    const chromeArgs = background && !headless
        ? [...LIGHTWEIGHT_CHROME_ARGS, '--window-position=3000,3000']
        : LIGHTWEIGHT_CHROME_ARGS;

    sharedBrowser = await puppeteer.launch({
        headless,
        args: chromeArgs,
        protocolTimeout: 120000,  // 2 minutes for heavy load scenarios
    });

    // Save endpoint for other processes to connect
    saveBrowserEndpoint(sharedBrowser);

    sharedBrowserRefCount++;
    return sharedBrowser;
}

/**
 * Release a reference to the shared browser.
 * Does NOT close the browser - it stays open for other processes.
 */
export async function releaseSharedBrowser(): Promise<void> {
    sharedBrowserRefCount--;
    if (sharedBrowserRefCount <= 0) {
        sharedBrowser = null;
        sharedBrowserRefCount = 0;
        // Don't close browser - leave it running for other processes
    }
}

export interface BrowserSession {
    browser: Browser;
    page: Page;
    botName: string;
    cleanup: () => Promise<void>;
}

export interface SDKSession extends BrowserSession {
    sdk: BotSDK;
    bot: BotActions;
}

export interface LaunchOptions {
    headless?: boolean;
    skipTutorial?: boolean;
    useSharedBrowser?: boolean;
    background?: boolean;
    usePuppeteer?: boolean;
    /** Exit process after cleanup (default: true for CLI scripts) */
    exitOnCleanup?: boolean;
}

/**
 * Launches a browser with the game client and waits for login.
 * Does NOT skip tutorial - use launchBotWithSDK for that.
 *
 * @param useSharedBrowser - If true, uses a shared browser instance (for load tests)
 */
export async function launchBotBrowser(
    botName?: string,
    options: { headless?: boolean; useSharedBrowser?: boolean; background?: boolean } = {}
): Promise<BrowserSession> {
    const name = botName || 'bot' + Math.random().toString(36).substring(2, 5);
    const headless = options.headless ?? DEFAULT_HEADLESS;
    const useShared = options.useSharedBrowser ?? false;
    const background = options.background ?? DEFAULT_BACKGROUND;

    // Add off-screen position if running in background mode (prevents focus stealing)
    const chromeArgs = background && !headless
        ? [...LIGHTWEIGHT_CHROME_ARGS, '--window-position=3000,3000']
        : LIGHTWEIGHT_CHROME_ARGS;

    let browser: Browser;
    if (useShared) {
        browser = await getSharedBrowser(headless, background);
    } else {
        browser = await puppeteer.launch({
            headless,
            args: chromeArgs
        });
    }

    const page = await browser.newPage();

    // Set viewport to match game canvas exactly
    await page.setViewport({ width: GAME_WIDTH, height: GAME_HEIGHT });
    page.setDefaultTimeout(60000);  // 60s timeout for all operations

    // Add crash/error handlers to detect page issues
    page.on('crash', () => {
        console.error(`[Browser] Page CRASHED for bot '${name}'!`);
    });

    page.on('pageerror', (error) => {
        console.error(`[Browser] Page JS error for bot '${name}':`, (error as Error).message);
    });

    page.on('error', (error) => {
        console.error(`[Browser] Page error for bot '${name}':`, error.message);
    });

    page.on('close', () => {
        console.log(`[Browser] Page closed for bot '${name}'`);
    });

    // Log console messages from the game page
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            console.error(`[Browser Console] ${name}:`, msg.text());
        }
    });

    // Navigate to bot URL with all params - page handles auto-login, fps, etc.
    // tst=1 indicates running via test (hides agent panel by default)
    await page.goto(`${BOT_URL}?bot=${name}&password=${encodeURIComponent(BOT_PASSWORD)}&fps=15&tst=1`, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for in-game (page auto-logs in via URL params)
    let attempts = 0;
    while (!await page.evaluate(() => (window as any).gameClient?.ingame)) {
        await sleep(200);
        attempts++;
        if (attempts > 150) {  // 30 seconds
            await browser.close();
            throw new Error('Timeout waiting for login');
        }
    }

    console.log(`[Browser] Bot '${name}' logged in and in-game`);

    return {
        browser,
        page,
        botName: name,
        cleanup: async () => {
            // Hold browser open for inspection when not headless
            if (!headless) {
                console.log(`[Browser] Holding open for ${CLEANUP_DELAY_MS / 1000}s...`);
                await sleep(CLEANUP_DELAY_MS);
            }
            console.log(`[Browser] Closing page for '${name}'`);
            await page.close();
            if (useShared) {
                await releaseSharedBrowser();
            } else {
                await browser.close();
            }
        }
    };
}

/**
 * Check if player is on Tutorial Island based on coordinates.
 * Tutorial Island is a specific area, not just "west of Lumbridge".
 *
 * Tutorial Island bounds (approximate):
 * - X: 3050 to 3156
 * - Z: 3056 to 3136
 *
 * Other western locations like Catherby (x: 2836) or Falador (x: 2964)
 * should NOT be considered tutorial.
 */
export function isOnTutorialIsland(x: number, z: number): boolean {
    return x >= 3050 && x <= 3156 && z >= 3056 && z <= 3136;
}

/**
 * Skip tutorial using SDK.
 * Returns true if tutorial was skipped successfully.
 * Fresh characters are designed by bot.skipTutorial(), entirely through the SDK.
 */
export async function skipTutorial(sdk: BotSDK, maxAttempts: number = 30): Promise<boolean> {
    // Check if we're in tutorial (on Tutorial Island specifically)
    const isInTutorial = () => {
        const s = sdk.getState();
        if (!s?.player) return true;  // No player state yet, assume tutorial
        return isOnTutorialIsland(s.player.worldX, s.player.worldZ);
    };

    const bot = new BotActions(sdk);
    let attempts = 0;
    while (isInTutorial() && attempts < maxAttempts) {
        await bot.skipTutorial();
        await sleep(1000);
        attempts++;
    }

    return !isInTutorial();
}

/**
 * Launches browser, connects SDK, and skips tutorial.
 * This is the main entry point for most tests.
 *
 * @param usePuppeteer - If true, uses Puppeteer (headless capable). If false, uses native browser.
 * @param useSharedBrowser - If true, uses a shared browser instance (for load tests)
 * @param background - If true, spawns window off-screen (won't steal focus)
 * @param exitOnCleanup - If true (default), calls process.exit(0) after cleanup to ensure Node exits
 */
export async function launchBotWithSDK(
    botName?: string,
    options: LaunchOptions = {}
): Promise<SDKSession> {
    const shouldSkipTutorial = options.skipTutorial ?? true;
    const usePuppeteer = options.usePuppeteer ?? false;
    const exitOnCleanup = options.exitOnCleanup ?? true;  // Default true for CLI scripts

    if (usePuppeteer) {
        // Puppeteer mode (for CI/headless)
        const browser = await launchBotBrowser(botName, {
            headless: options.headless,
            useSharedBrowser: options.useSharedBrowser,
            background: options.background
        });

        const sdk = new BotSDK({
            botUsername: browser.botName,
            password: BOT_PASSWORD,
            autoLaunchBrowser: false  // Puppeteer already launched
        });
        await sdk.connect();
        await sdk.waitForCondition(s => s.inGame, 30000);

        if (shouldSkipTutorial) {
            const success = await skipTutorial(sdk, 30);
            if (!success) {
                await sdk.disconnect();
                await browser.cleanup();
                throw new Error('Failed to skip tutorial');
            }
            await sleep(1000);
        }

        const bot = new BotActions(sdk);
        return {
            ...browser,
            sdk,
            bot,
            cleanup: async () => {
                await sdk.disconnect();
                await browser.cleanup();
                if (exitOnCleanup) {
                    process.exit(0);
                }
            }
        };
    }

    // Native browser mode (default) - SDK opens system browser
    const name = botName || 'bot' + Math.random().toString(36).substring(2, 5);

    const sdk = new BotSDK({
        botUsername: name,
        password: BOT_PASSWORD,
        autoLaunchBrowser: true,
        browserLaunchUrl: BOT_URL,
    });

    sdk.onConnectionStateChange((state) => {
        console.log(`[SDK] Connection: ${state}`);
    });

    await sdk.connect();
    await sdk.waitForCondition(s => s.inGame, 60000);

    console.log(`[SDK] Bot '${name}' logged in and in-game`);

    if (shouldSkipTutorial) {
        const success = await skipTutorial(sdk, 30);
        if (!success) {
            await sdk.disconnect();
            throw new Error('Failed to skip tutorial');
        }
        await sleep(1000);
    }

    const bot = new BotActions(sdk);

    return {
        browser: null as any,  // No Puppeteer browser
        page: null as any,     // No Puppeteer page
        botName: name,
        sdk,
        bot,
        cleanup: async () => {
            await sdk.disconnect();
            // Native browser stays open - user can close it manually
            if (exitOnCleanup) {
                process.exit(0);
            }
        }
    };
}

