/**
 * Browser launch helper for SDK-based tests.
 * Launches a Puppeteer browser with the game client.
 * No CLI dependency - just browser management.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { BotSDK } from '../../agent/sdk';
import { BotActions } from '../../agent/sdk-porcelain';

const BOT_URL = process.env.BOT_URL || 'http://localhost:8888/bot';

// HEADLESS env var: 'true' or '1' for headless, anything else for visible browser
// Default: false (show browser) for easier debugging
const DEFAULT_HEADLESS = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';

// Hold browser open for inspection when not headless
const CLEANUP_DELAY_MS = 2000;

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Shared browser instance for multi-bot scenarios
let sharedBrowser: Browser | null = null;
let sharedBrowserRefCount = 0;

// Chrome args optimized for lower resource usage
const LIGHTWEIGHT_CHROME_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--mute-audio',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-ipc-flooding-protection',
    '--js-flags=--max-old-space-size=128',  // Limit JS heap per page
    // Additional performance flags
    '--disable-software-rasterizer',
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
    '--disable-features=VizDisplayCompositor',
];

/**
 * Get or create a shared browser instance.
 * Use this for load tests to avoid spawning many browser processes.
 */
export async function getSharedBrowser(headless: boolean = true): Promise<Browser> {
    if (!sharedBrowser || !sharedBrowser.connected) {
        sharedBrowser = await puppeteer.launch({
            headless,
            args: LIGHTWEIGHT_CHROME_ARGS,
            protocolTimeout: 120000,  // 2 minutes for heavy load scenarios
        });
    }
    sharedBrowserRefCount++;
    return sharedBrowser;
}

/**
 * Release a reference to the shared browser.
 * Closes the browser when all references are released.
 */
export async function releaseSharedBrowser(): Promise<void> {
    sharedBrowserRefCount--;
    if (sharedBrowserRefCount <= 0 && sharedBrowser) {
        await sharedBrowser.close();
        sharedBrowser = null;
        sharedBrowserRefCount = 0;
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

/**
 * Launches a browser with the game client and waits for login.
 * Does NOT skip tutorial - use launchBotWithSDK for that.
 *
 * @param useSharedBrowser - If true, uses a shared browser instance (for load tests)
 */
export async function launchBotBrowser(
    botName?: string,
    options: { headless?: boolean; useSharedBrowser?: boolean } = {}
): Promise<BrowserSession> {
    const name = botName || 'bot' + Math.random().toString(36).substring(2, 5);
    const headless = options.headless ?? DEFAULT_HEADLESS;
    const useShared = options.useSharedBrowser ?? false;

    let browser: Browser;
    if (useShared) {
        browser = await getSharedBrowser(headless);
    } else {
        browser = await puppeteer.launch({
            headless,
            args: LIGHTWEIGHT_CHROME_ARGS
        });
    }

    const page = await browser.newPage();

    // Optimize page for lower resource usage
    await page.setViewport({ width: 800, height: 600 });  // Minimal viewport
    page.setDefaultTimeout(60000);  // 60s timeout for all operations

    // Navigate to bot URL with all params - page handles auto-login, fps, etc.
    // tst=1 indicates running via test (hides agent panel by default)
    await page.goto(`${BOT_URL}?bot=${name}&password=test&fps=5&tst=1`, { waitUntil: 'networkidle2', timeout: 60000 });

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
 * Skip tutorial using SDK.
 * Returns true if tutorial was skipped successfully.
 */
export async function skipTutorial(sdk: BotSDK, maxAttempts: number = 30): Promise<boolean> {
    // Accept character design if modal is open
    const state = sdk.getState();
    if (state?.modalOpen && state.modalInterface === 269) {
        await sdk.sendAcceptCharacterDesign();
        await sleep(500);
    }

    // Check if we're in tutorial (x < 3200)
    const isInTutorial = () => {
        const s = sdk.getState();
        return !s?.player || s.player.worldX < 3200;
    };

    let attempts = 0;
    while (isInTutorial() && attempts < maxAttempts) {
        await sdk.sendSkipTutorial();
        await sleep(1000);
        attempts++;
    }

    return !isInTutorial();
}

/**
 * Launches browser, connects SDK, and skips tutorial.
 * This is the main entry point for most tests.
 *
 * @param useSharedBrowser - If true, uses a shared browser instance (for load tests)
 */
export async function launchBotWithSDK(
    botName?: string,
    options: { headless?: boolean; skipTutorial?: boolean; useSharedBrowser?: boolean } = {}
): Promise<SDKSession> {
    const shouldSkipTutorial = options.skipTutorial ?? true;

    // Launch browser
    const browser = await launchBotBrowser(botName, {
        headless: options.headless,
        useSharedBrowser: options.useSharedBrowser
    });

    // Connect SDK
    const sdk = new BotSDK({ botUsername: browser.botName });
    await sdk.connect();

    // Wait for game state
    await sdk.waitForCondition(s => s.inGame, 30000);

    // Skip tutorial if requested
    if (shouldSkipTutorial) {
        const success = await skipTutorial(sdk);
        if (!success) {
            await sdk.disconnect();
            await browser.cleanup();
            throw new Error('Failed to skip tutorial');
        }
        // Wait for state to settle after tutorial
        await sleep(1000);
    }

    // Create porcelain wrapper
    const bot = new BotActions(sdk);

    return {
        ...browser,
        sdk,
        bot,
        cleanup: async () => {
            await sdk.disconnect();
            await browser.cleanup();
        }
    };
}

/**
 * Helper to check if player is in tutorial area (x < 3200)
 */
export async function isInTutorial(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        const client = (window as any).gameClient;
        if (!client?.localPlayer) return true;
        const sceneBaseX = client.sceneBaseTileX || 0;
        const playerTileX = (client.localPlayer.x || 0) >> 7;
        const worldX = sceneBaseX + playerTileX;
        return worldX < 3200;
    });
}
