// Headless Script Runner - Fully self-contained script execution
// Launches a headless Puppeteer browser, generates a save file, connects SDK,
// runs the script, and cleans up. No external state needed (besides the server).

import { runScript, type ScriptFunction, type RunOptions, type RunResult, type LogEntry } from './runner';
import { launchBotBrowser, skipTutorial, type BrowserSession } from './test/utils/browser';
import { generateSave, TestPresets, type SaveConfig } from './test/utils/save-generator';
import { BotSDK } from './index';
import { BotActions } from './actions';

export { TestPresets, type SaveConfig } from './test/utils/save-generator';
export { Items, Spells, Skills, Locations } from './test/utils/save-generator';
export type { ScriptFunction, ScriptContext, RunResult, LogEntry } from './runner';

export interface HeadlessOptions {
    /** Save file preset or custom config (default: LUMBRIDGE_SPAWN) */
    save?: SaveConfig;
    /** Bot username (default: auto-generated) */
    botName?: string;
    /** Overall timeout in ms (default: none) */
    timeout?: number;
    /** Print world state after execution (default: true) */
    printState?: boolean;
    /**
     * How to handle bot client disconnection during script execution:
     * - 'error': Throw immediately (default)
     * - 'wait': Wait for reconnection
     * - 'ignore': Let actions fail naturally
     */
    onDisconnect?: 'error' | 'wait' | 'ignore';
    /** Timeout for waiting for reconnection when onDisconnect='wait' (default: 60000ms) */
    reconnectTimeout?: number;
    /** Skip tutorial after login (default: true) */
    skipTutorial?: boolean;
    /** Show browser window instead of headless (default: false, uses HEADLESS env var) */
    headless?: boolean;
}

/**
 * Run a script with a fully self-contained headless browser.
 *
 * This is the zero-setup entry point: it creates a bot account, launches a headless
 * Puppeteer browser, connects the SDK, runs your script, and cleans up everything.
 * The only external dependency is the game server.
 *
 * @example
 * ```ts
 * import { runHeadless, TestPresets } from '../../sdk/headless';
 *
 * await runHeadless(async (ctx) => {
 *   const { bot, log } = ctx;
 *   log('Chopping trees...');
 *   await bot.chopTree();
 * });
 * ```
 *
 * @example
 * ```ts
 * // With custom save preset and timeout
 * await runHeadless(async (ctx) => {
 *   await ctx.bot.fish();
 * }, {
 *   save: TestPresets.FISHER_AT_ALKHARID,
 *   timeout: 5 * 60 * 1000,
 * });
 * ```
 */
export async function runHeadless(
    script: ScriptFunction,
    options: HeadlessOptions = {}
): Promise<RunResult> {
    const {
        save = TestPresets.LUMBRIDGE_SPAWN,
        botName,
        timeout,
        printState = true,
        onDisconnect = 'error',
        reconnectTimeout,
        skipTutorial: shouldSkipTutorial = true,
        headless,
    } = options;

    const username = botName || `bot${Math.random().toString(36).slice(2, 8)}`;
    let browser: BrowserSession | null = null;
    let sdk: BotSDK | null = null;

    try {
        // 1. Generate save file for the bot
        console.error(`[Headless] Creating bot "${username}"...`);
        await generateSave(username, save);

        // 2. Launch headless Puppeteer browser with game client
        console.error(`[Headless] Launching headless browser...`);
        browser = await launchBotBrowser(username, {
            headless: headless ?? true,
            useSharedBrowser: false,
        });

        // 3. Connect SDK to the bot via gateway
        console.error(`[Headless] Connecting SDK...`);
        sdk = new BotSDK({
            botUsername: browser.botName,
            autoLaunchBrowser: false,  // Puppeteer already launched
        });
        await sdk.connect();
        await sdk.waitForCondition(s => s.inGame, 30000);

        // 4. Skip tutorial if requested
        if (shouldSkipTutorial) {
            const success = await skipTutorial(sdk, 30);
            if (!success) {
                throw new Error('Failed to skip tutorial');
            }
            // Brief pause for state to settle after tutorial skip
            await new Promise(r => setTimeout(r, 1000));
        }

        const bot = new BotActions(sdk);
        console.error(`[Headless] Bot "${username}" ready - running script`);

        // 5. Run the script using the existing runScript machinery
        const result = await runScript(script, {
            connection: { bot, sdk },
            timeout,
            printState,
            onDisconnect,
            reconnectTimeout,
        });

        return result;
    } catch (error: any) {
        // If we failed before runScript could execute, return a RunResult
        return {
            success: false,
            error,
            duration: 0,
            logs: [],
            finalState: sdk?.getState() ?? null,
        };
    } finally {
        // 6. Clean up everything
        console.error(`[Headless] Cleaning up...`);
        if (sdk) {
            try { await sdk.disconnect(); } catch {}
        }
        if (browser) {
            try { await browser.cleanup(); } catch {}
        }
    }
}
