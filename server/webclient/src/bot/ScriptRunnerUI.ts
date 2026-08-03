// ScriptRunnerUI.ts - In-browser script runner panel.
//
// Mounts a script editor + Run/Stop/Restart controls into the bot client page.
// Runs the user's script against an in-page BotSDK that connects to the gateway
// as a *controller* (role `sdk_connect`), pairing with this same page's bot
// session - exactly how a Node `bun bots/x/script.ts` controller works, just
// relocated into the browser. Reuses sdk/index.ts + sdk/actions.ts verbatim.
//
// Execution mirrors mcp/server.ts execute_code: `new AsyncFunction('bot','sdk', code)`
// with an AbortController + cancellable proxy so Stop halts mid-loop.

import type { Client } from '#/client/Client.js';
import { BotSDK } from '../../../../sdk/index';
import { BotActions } from '../../../../sdk/actions';

const STORAGE_KEY = 'rs-sdk-script';

const DEFAULT_SCRIPT = `// 'bot' (high-level actions) and 'sdk' (low-level) are available.
// Anything you return is shown below; console.log is captured too.
const state = sdk.getState();
console.log('Position:', state.player.worldX, state.player.worldZ);
return sdk.getInventory();
`;

const CONTEXT_PREAMBLE = `You are writing a script for an MMO game bot.

The script body runs in an async function with two globals already in scope:
- \`bot\`  - high-level actions that wait for effects (chopTree, walkTo, attack, ...)
- \`sdk\`  - low-level state/queries (getState, getInventory, findNearbyNpc, ...)

Write plain JavaScript (no imports, no TypeScript annotations). \`await\` is allowed
at the top level. Whatever you \`return\` is shown to the user. Return ONLY a runnable
script body - no markdown fences, no explanation.

Full API reference follows.

`;

export class ScriptRunnerUI {
    private client: Client;
    private sdk: BotSDK | null = null;
    private bot: BotActions | null = null;

    private editor!: HTMLTextAreaElement;
    private output!: HTMLPreElement;
    private status!: HTMLSpanElement;
    private runBtn!: HTMLButtonElement;
    private stopBtn!: HTMLButtonElement;
    private restartBtn!: HTMLButtonElement;
    private progressiveBtn!: HTMLButtonElement;
    private progressiveStopBtn!: HTMLButtonElement;
    private progressiveRunning = false;

    private abortController: AbortController | null = null;
    private running = false;

    constructor(client: Client) {
        this.client = client;
        this.buildUI();
    }

    // ============ SDK lifecycle ============

    /** Lazily create + connect the in-page controller SDK using the page's login creds. */
    private async ensureConnected(): Promise<void> {
        const { username, password } = this.client.getCredentials();
        if (!username) {
            throw new Error('Log in to the game first, then run a script.');
        }

        if (!this.sdk) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const gatewayUrl = `${protocol}//${window.location.host}/gateway`;
            this.sdk = new BotSDK({
                botUsername: username,
                password,
                gatewayUrl,
                connectionMode: 'control',
                autoLaunchBrowser: false, // we ARE the browser; never spawn one
            });
            this.bot = new BotActions(this.sdk);
            this.patchNativeWalk(this.sdk, this.bot);
        }

        this.setStatus('connecting…');
        await this.sdk.connect();
        // connect() already waits for readiness, but be defensive about first state.
        await this.sdk.waitForCondition(() => this.sdk!.getState() !== null, 15000);
    }

    /**
     * Replace BotActions.walkTo with one backed by the game client's NATIVE
     * pathfinding (via the 'walkTo' action -> client.walkTo). The stock walkTo
     * pathfinds with the SDK's rsmod + 22MB collision snapshot, which we
     * deliberately don't ship to the browser. The client already pathfinds for
     * player clicks, so we loop sendWalk toward the target until we arrive.
     */
    private patchNativeWalk(sdk: BotSDK, bot: BotActions): void {
        (bot as any).walkTo = async (x: number, z: number, tolerance = 3) => {
            const cheb = (p: { worldX: number; worldZ: number }) =>
                Math.max(Math.abs(p.worldX - x), Math.abs(p.worldZ - z));

            let last: { x: number; z: number } | null = null;
            let stuck = 0;
            const MAX_STEPS = 40;

            for (let i = 0; i < MAX_STEPS; i++) {
                await bot.dismissBlockingUI();
                const player = sdk.getState()?.player;
                if (!player) return { success: false, message: 'No player state' };
                if (cheb(player) <= tolerance) {
                    return { success: true, message: 'Arrived' };
                }
                if (last && last.x === player.worldX && last.z === player.worldZ) {
                    if (++stuck >= 3) {
                        return { success: false, message: `Stuck at (${player.worldX}, ${player.worldZ}) heading to (${x}, ${z})` };
                    }
                } else {
                    stuck = 0;
                }
                last = { x: player.worldX, z: player.worldZ };
                await sdk.sendWalk(x, z, true);
                await sdk.waitForTicks(2);
            }

            const player = sdk.getState()?.player;
            const done = player ? cheb(player) <= tolerance : false;
            return done
                ? { success: true, message: 'Arrived' }
                : { success: false, message: `Did not reach (${x}, ${z}) within ${MAX_STEPS} steps` };
        };
    }

    // ============ Run / Stop / Restart ============

    private async run(): Promise<void> {
        if (this.running) return;
        const code = this.editor.value;
        localStorage.setItem(STORAGE_KEY, code);

        this.running = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        this.syncButtons();
        this.clearOutput();

        // Capture console output produced during the run.
        const logs: string[] = [];
        const append = (prefix: string) => (...args: any[]) => {
            const line = prefix + args
                .map(a => (typeof a === 'object' ? safeStringify(a) : String(a)))
                .join(' ');
            logs.push(line);
            this.renderOutput(logs);
        };
        const original = { log: console.log, warn: console.warn, error: console.error };
        console.log = append('');
        console.warn = append('[warn] ');
        console.error = append('[error] ');

        // Proxy that throws on any bot/sdk call once the run is aborted, so
        // tight loops stop promptly instead of running to completion.
        const cancellable = <T extends object>(target: T): T =>
            new Proxy(target, {
                get(obj, prop, receiver) {
                    const value = Reflect.get(obj, prop, receiver);
                    if (typeof value === 'function') {
                        return (...args: any[]) => {
                            if (signal.aborted) throw new Error('Execution stopped');
                            return value.apply(obj, args);
                        };
                    }
                    return value;
                },
            });

        try {
            this.setStatus('connecting…');
            await this.ensureConnected();
            if (signal.aborted) throw new Error('Execution stopped');

            this.setStatus('running…');
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            const fn = new AsyncFunction('bot', 'sdk', code);

            const cancelPromise = new Promise<never>((_, reject) => {
                signal.addEventListener('abort', () => reject(new Error('Execution stopped')), { once: true });
            });

            const result = await Promise.race([
                fn(cancellable(this.bot!), cancellable(this.sdk!)),
                cancelPromise,
            ]);

            if (result !== undefined) {
                logs.push('── Result ──', safeStringify(result));
                this.renderOutput(logs);
            }
            this.setStatus('done');
        } catch (err: any) {
            const stopped = signal.aborted;
            logs.push(stopped ? '── Stopped ──' : `── Error ──\n${err?.message ?? err}`);
            this.renderOutput(logs);
            this.setStatus(stopped ? 'stopped' : 'error');
        } finally {
            console.log = original.log;
            console.warn = original.warn;
            console.error = original.error;
            this.running = false;
            this.abortController = null;
            this.syncButtons();
        }
    }

    private stop(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.setStatus('stopping…');
        }
    }

    private async restart(): Promise<void> {
        this.stop();
        // Let the in-flight run unwind before starting the next.
        const wait = () => new Promise(r => setTimeout(r, 50));
        while (this.running) await wait();
        await this.run();
    }

    /** Start Bun progressive trainer against the currently logged-in account. */
    private async runProgressive(): Promise<void> {
        const { username, password } = this.client.getCredentials();
        if (!username) {
            this.setStatus('log in first, then start Progressive');
            return;
        }
        this.progressiveBtn.disabled = true;
        this.setStatus(`starting progressive on ${username}…`);
        try {
            const webPort = window.location.port || '8890';
            const res = await fetch('/api/progressive/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, webPort }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || `HTTP ${res.status}`);
            }
            this.progressiveRunning = true;
            this.setStatus(`progressive running on ${username} (pid ${data.pid ?? '?'})`);
            this.appendProgressiveLog(username);
        } catch (err: any) {
            this.setStatus(`progressive failed: ${err?.message ?? err}`);
            this.progressiveRunning = false;
        } finally {
            this.syncButtons();
        }
    }

    private async stopProgressive(): Promise<void> {
        const { username } = this.client.getCredentials();
        if (!username) {
            this.setStatus('no username');
            return;
        }
        this.setStatus(`stopping progressive on ${username}…`);
        try {
            const res = await fetch('/api/progressive/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            const data = await res.json().catch(() => ({}));
            this.progressiveRunning = false;
            this.setStatus(data?.stopped ? 'progressive stopped' : 'progressive not running');
        } catch (err: any) {
            this.setStatus(`stop failed: ${err?.message ?? err}`);
        } finally {
            this.syncButtons();
        }
    }

    private async appendProgressiveLog(username: string): Promise<void> {
        try {
            await new Promise((r) => setTimeout(r, 1500));
            const res = await fetch(`/api/progressive/log?username=${encodeURIComponent(username)}`);
            const data = await res.json();
            if (data?.lines?.length) {
                this.renderOutput(['── Progressive ──', ...data.lines]);
            }
        } catch {
            // ignore
        }
    }

    private async refreshProgressiveStatus(): Promise<void> {
        const { username } = this.client.getCredentials();
        if (!username) return;
        try {
            const res = await fetch(`/api/progressive/status?username=${encodeURIComponent(username)}`);
            const data = await res.json();
            this.progressiveRunning = !!data?.running;
            this.syncButtons();
        } catch {
            // ignore
        }
    }

    private async copyContext(): Promise<void> {
        try {
            this.setStatus('copying context…');
            const res = await fetch('/bot/api.md', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`api.md ${res.status}`);
            const apiMd = await res.text();
            await navigator.clipboard.writeText(CONTEXT_PREAMBLE + apiMd);
            this.setStatus('SDK context copied to clipboard ✓');
        } catch (err: any) {
            this.setStatus(`copy failed: ${err?.message ?? err}`);
        }
    }

    // ============ UI ============

    private buildUI(): void {
        const wrap = document.createElement('div');
        wrap.id = 'rs-script-runner';
        wrap.style.cssText = `
            width: 100%;
            max-width: 700px;
            margin: 10px auto 0;
            background: rgba(0, 0, 0, 0.85);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
            color: #04A800;
            text-align: left;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 4px 10px;
            background: rgba(4, 168, 0, 0.15);
            font-weight: bold;
            font-size: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        const title = document.createElement('span');
        title.textContent = 'SCRIPT RUNNER';
        const copyBtn = this.makeButton('Copy SDK Context', () => this.copyContext());
        copyBtn.style.color = '#FFD700';
        copyBtn.style.borderColor = '#FFD700';
        header.appendChild(title);
        header.appendChild(copyBtn);

        this.editor = document.createElement('textarea');
        this.editor.spellcheck = false;
        this.editor.value = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SCRIPT;
        this.editor.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            height: 160px;
            resize: vertical;
            margin: 0;
            padding: 8px 10px;
            border: none;
            border-top: 1px solid rgba(4, 168, 0, 0.3);
            background: rgba(0, 0, 0, 0.5);
            color: #9be89b;
            font-family: inherit;
            font-size: 12px;
            line-height: 1.4;
            tab-size: 2;
            outline: none;
        `;
        // Tab inserts two spaces instead of moving focus.
        this.editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const el = this.editor;
                const s = el.selectionStart, en = el.selectionEnd;
                el.value = el.value.slice(0, s) + '  ' + el.value.slice(en);
                el.selectionStart = el.selectionEnd = s + 2;
            }
            // Cmd/Ctrl+Enter runs.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (!this.running) this.run();
            }
        });

        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            gap: 6px;
            align-items: center;
            padding: 6px 10px;
            border-top: 1px solid rgba(4, 168, 0, 0.3);
        `;
        this.runBtn = this.makeButton('▶ Run', () => this.run());
        this.stopBtn = this.makeButton('■ Stop', () => this.stop());
        this.restartBtn = this.makeButton('↻ Restart', () => this.restart());
        this.progressiveBtn = this.makeButton('▶ Progressive', () => this.runProgressive());
        this.progressiveBtn.style.color = '#FFD700';
        this.progressiveBtn.style.borderColor = '#FFD700';
        this.progressiveBtn.title = 'Run wiki progressive trainer on this logged-in account';
        this.progressiveStopBtn = this.makeButton('■ Stop Prog', () => this.stopProgressive());
        this.progressiveStopBtn.style.color = '#FFD700';
        this.progressiveStopBtn.style.borderColor = '#FFD700';
        this.status = document.createElement('span');
        this.status.style.cssText = 'margin-left: auto; font-size: 10px; opacity: 0.8;';
        this.status.textContent = 'idle';
        controls.appendChild(this.runBtn);
        controls.appendChild(this.stopBtn);
        controls.appendChild(this.restartBtn);
        controls.appendChild(this.progressiveBtn);
        controls.appendChild(this.progressiveStopBtn);
        controls.appendChild(this.status);

        this.output = document.createElement('pre');
        this.output.className = 'dark-scrollbar';
        this.output.style.cssText = `
            margin: 0;
            padding: 8px 10px;
            max-height: 220px;
            overflow-y: auto;
            overflow-x: hidden;
            white-space: pre-wrap;
            word-break: break-word;
            border-top: 1px solid rgba(4, 168, 0, 0.3);
            color: #cfcfcf;
            font-size: 11px;
        `;
        this.output.textContent = '(output will appear here)';

        wrap.appendChild(header);
        wrap.appendChild(this.editor);
        wrap.appendChild(controls);
        wrap.appendChild(this.output);

        // Prepend so the runner sits ABOVE the world-state / SDK-actions overlay,
        // regardless of which mounts first.
        const container = document.getElementById('sdk-panel-container') ?? document.body;
        container.prepend(wrap);

        this.syncButtons();
        this.refreshProgressiveStatus();
        setInterval(() => this.refreshProgressiveStatus(), 5000);
    }

    private makeButton(label: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            background: none;
            border: 1px solid #04A800;
            color: #04A800;
            cursor: pointer;
            padding: 3px 10px;
            font-family: inherit;
            font-size: 11px;
        `;
        btn.addEventListener('click', onClick);
        return btn;
    }

    private syncButtons(): void {
        this.runBtn.disabled = this.running;
        this.stopBtn.disabled = !this.running;
        this.runBtn.style.opacity = this.running ? '0.4' : '1';
        this.stopBtn.style.opacity = this.running ? '1' : '0.4';
        this.progressiveBtn.disabled = this.progressiveRunning;
        this.progressiveStopBtn.disabled = !this.progressiveRunning;
        this.progressiveBtn.style.opacity = this.progressiveRunning ? '0.4' : '1';
        this.progressiveStopBtn.style.opacity = this.progressiveRunning ? '1' : '0.4';
    }

    private setStatus(text: string): void {
        this.status.textContent = text;
    }

    private clearOutput(): void {
        this.output.textContent = '';
    }

    private renderOutput(logs: string[]): void {
        this.output.textContent = logs.join('\n');
        this.output.scrollTop = this.output.scrollHeight;
    }
}

function safeStringify(value: any): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}
