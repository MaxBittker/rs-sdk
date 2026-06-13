// BotOverlay.ts - Main bot overlay controller
// Composes state collection, action execution, gateway connection, and UI

import type { Client } from '#/client/Client.js';
import type { BotState, BotAction, BotWorldState } from './types.js';
import { BotStateCollector } from './StateCollector.js';
import { ActionExecutor, formatAction } from './ActionExecutor.js';
import { formatBotState, formatWorldStateForAgent } from './formatters.js';
import { GatewayConnection, type GatewayMessageHandler } from './GatewayConnection.js';
import { OverlayUI } from './OverlayUI.js';
import { ScriptRunnerUI } from './ScriptRunnerUI.js';

// Global instance reference (set when overlay is created)
let globalBotOverlay: BotOverlay | null = null;

export function getBotOverlay(): BotOverlay | null {
    return globalBotOverlay;
}

export class BotOverlay implements GatewayMessageHandler {
    private client: Client;
    private collector: BotStateCollector;
    private executor: ActionExecutor;
    private gateway: GatewayConnection;
    private ui: OverlayUI;
    private scriptRunner: ScriptRunnerUI;

    // Action state
    private pendingAction: BotAction | null = null;
    private currentActionId: string | null = null;
    private waitTicks: number = 0;

    // Server tick counter - increments once per PLAYER_INFO packet (~420ms)
    private serverTick: number = 0;

    // Activity tracking for favicon
    private lastActionTime: number = 0;
    private activityCheckInterval: ReturnType<typeof setInterval> | null = null;

    constructor(client: Client) {
        this.client = client;
        this.collector = new BotStateCollector(client);
        this.executor = new ActionExecutor(client);
        this.gateway = new GatewayConnection(this, () => this.client.getCredentials());
        this.ui = new OverlayUI(client, {
            onPacketLogToggle: () => {}
        });

        // In-browser script runner. Owns its own controller SDK that connects to
        // the gateway lazily on first Run, pairing with this page's bot session.
        this.scriptRunner = new ScriptRunnerUI(client);

        // Wire scan provider so ActionExecutor can trigger on-demand scans
        this.executor.setScanProvider(this.collector);

        // Connect to gateway
        this.gateway.connect();

        // Register for game tick callback - sync state on actual server ticks
        // This fires when PLAYER_INFO packet is received (~420ms intervals)
        (this.client as any).setOnGameTickCallback(this.onGameTick.bind(this));

        // Start activity check interval for favicon state
        this.activityCheckInterval = setInterval(() => this.checkActivity(), 500);

        // Set global reference
        globalBotOverlay = this;
    }

    // Check if we've had recent activity for favicon state
    private checkActivity(): void {
        const now = Date.now();
        const isActive = (now - this.lastActionTime) < 8000;

        if (typeof (window as any).setFaviconActive === 'function') {
            (window as any).setFaviconActive(isActive);
        }
    }

    // Called when server tick is received (PLAYER_INFO packet processed)
    private onGameTick(): void {
        this.serverTick++;
        this.sendState();
    }

    // ============ GatewayMessageHandler Implementation ============

    onAction(action: BotAction, actionId: string | null): void {
        console.log(`[BotOverlay] Received action: ${action.type} (${actionId})`);
        this.pendingAction = action;
        this.currentActionId = actionId;
        this.lastActionTime = Date.now();
        // Reset idle timer - SDK actions count as activity
        this.client.idleTimer = performance.now();
        this.ui.logAction(action.type, formatAction(action));
    }

    onScreenshotRequest(screenshotId?: string): void {
        this.captureAndSendScreenshot(screenshotId);
    }

    onConnected(): void {
        this.ui.logAction('connected', 'Connected to SDK gateway');

        // Clear any stale pending actions from previous sessions
        if (this.pendingAction) {
            console.log(`[BotOverlay] Clearing stale pending action on connect: ${this.pendingAction.type}`);
        }
        this.pendingAction = null;
        this.waitTicks = 0;
    }

    onDisconnected(): void {
        console.warn('[LOGOUT DEBUG] BotOverlay.onDisconnected() - SDK gateway connection lost');
        this.ui.logAction('disconnected', 'Disconnected from SDK gateway');
    }

    onSaveAndDisconnect(reason: string): void {
        console.warn(`[LOGOUT DEBUG] Gateway save_and_disconnect received - reason: ${reason}`);
        console.log(`[BotOverlay] Save and disconnect requested: ${reason}`);
        this.ui.logAction('disconnecting', `Save and disconnect: ${reason}`);

        // Trigger client logout - this will save to server via game protocol
        // The logout method handles stream close which triggers server-side save
        // GatewayConnection.preventReconnect is already set by the message handler
        const client = this.client as any;
        if (client && typeof client.logout === 'function') {
            console.log('[BotOverlay] Triggering client logout for graceful disconnect');
            client.logout().catch((e: any) => {
                console.error('[BotOverlay] Error during logout:', e);
            });
        } else {
            console.warn('[BotOverlay] No logout method available on client');
            // Fall back to just disconnecting gateway
            this.gateway.disconnect();
        }
    }

    // ============ Main Tick Loop ============

    tick(): void {
        // Handle wait ticks
        if (this.waitTicks > 0) {
            this.waitTicks--;
            if (this.waitTicks === 0 && this.currentActionId) {
                this.sendActionResult({ success: true, message: 'Wait complete' });
            }
            return;
        }

        // Execute pending action
        if (this.pendingAction) {
            const action = this.pendingAction;
            this.pendingAction = null;

            console.log(`[BotOverlay] Executing action: ${action.type}`);
            const resultOrPromise = this.executor.execute(action);

            // Handle async actions if any
            if (resultOrPromise instanceof Promise) {
                resultOrPromise.then(result => {
                    console.log(`[BotOverlay] Async action result: ${result.success ? 'success' : 'failed'} - ${result.message}`);
                    this.sendActionResult(result);
                    this.sendState();  // Immediate feedback after action
                }).catch(e => {
                    console.error(`[BotOverlay] Async action error:`, e);
                    this.sendActionResult({ success: false, message: `Error: ${e}` });
                });
                return;
            }

            const result = resultOrPromise;
            console.log(`[BotOverlay] Action result: ${result.success ? 'success' : 'failed'} - ${result.message}`);

            // Handle wait action specially
            if (action.type === 'wait' && result.success) {
                this.waitTicks = action.ticks || 1;
                return;
            }

            this.sendActionResult(result);

            // Send state immediately after action for fresh feedback
            this.sendState();
            return;
        }

        // Note: Regular state sync now happens via onGameTick() callback
        // which fires when PLAYER_INFO packet arrives (once per server tick)
    }

    // ============ State Collection ============

    private collectWorldState(): BotWorldState | null {
        if (!this.collector || !this.client) return null;

        const baseState = this.collector.collectState();
        const c = this.client as any;

        // Get dialog state - include componentId for direct clicking
        const dialogOptions: Array<{ index: number; text: string; componentId?: number; buttonType?: number }> = [];
        const allDialogComponents: Array<{ id: number; type: number; buttonType: number; option: string; text: string }> = [];
        if (c.chatModalId !== -1) {
            const options = this.client.getDialogOptions();
            for (const opt of options) {
                dialogOptions.push({
                    index: opt.index,
                    text: opt.text,
                    componentId: opt.componentId,
                    buttonType: opt.buttonType
                });
            }
            // Also get ALL components for debugging
            if (typeof this.client.debugDialogComponents === 'function') {
                const debugComps = this.client.debugDialogComponents();
                for (const comp of debugComps) {
                    allDialogComponents.push(comp);
                }
            }
        }

        // Collect interface options (for crafting menus like fletching)
        const interfaceOptions: Array<{ index: number; text: string; componentId: number }> = [];
        if (this.client.isViewportInterfaceOpen()) {
            const options = this.client.getInterfaceOptions();
            for (const opt of options) {
                interfaceOptions.push({ index: opt.index, text: opt.text, componentId: opt.componentId });
            }
        }

        return {
            ...baseState,
            tick: this.serverTick,  // Override with server tick (not client frame counter)
            dialog: {
                isOpen: this.client.isDialogOpen(),
                options: dialogOptions,
                isWaiting: this.client.isWaitingForDialog(),
                allComponents: allDialogComponents
            },
            interface: {
                isOpen: this.client.isViewportInterfaceOpen(),
                interfaceId: this.client.getViewportInterface(),
                options: interfaceOptions,
                debugInfo: this.client.isViewportInterfaceOpen()
                    ? this.client.getInterfaceDebugInfo(this.client.getViewportInterface())
                    : []
            },
            modalOpen: this.client.isModalOpen(),
            modalInterface: this.client.getModalInterface()
        };
    }

    private sendState(): void {
        if (!this.gateway.isConnected()) return;

        const state = this.collectWorldState();
        if (!state) return;

        const formattedState = formatWorldStateForAgent(state, 'SDK Control');
        this.gateway.sendState(state, formattedState);
    }

    private sendActionResult(result: { success: boolean; message: string; data?: any }): void {
        if (this.currentActionId) {
            this.gateway.sendActionResult(this.currentActionId, result);
            this.ui.logAction(result.success ? 'success' : 'failed', result.message);
            this.currentActionId = null;
        }
    }

    private captureAndSendScreenshot(screenshotId?: string): void {
        const canvasEl = (window as any).gameCanvas || document.querySelector('canvas');
        if (!canvasEl) return;

        try {
            const dataUrl = canvasEl.toDataURL('image/png');
            this.gateway.sendScreenshot(dataUrl, screenshotId);
        } catch (e) {
            console.error('[BotOverlay] Failed to capture screenshot:', e);
        }
    }

    // ============ Public API ============

    update(): void {
        if (!this.ui.isVisible() || this.ui.isMinimized()) return;

        const state = this.collector.collectState();
        // Override with actual game tick (not client render cycle)
        state.tick = this.serverTick;
        this.ui.updateContent(formatBotState(state));
    }

    getState(): BotState {
        return this.collector.collectState();
    }

    toggle(): void {
        this.ui.toggle();
    }

    show(): void {
        this.ui.show();
    }

    hide(): void {
        this.ui.hide();
    }

    isVisible(): boolean {
        return this.ui.isVisible();
    }

    toggleMinimize(): void {
        this.ui.toggleMinimize();
    }

    togglePacketLog(): void {
        this.ui.togglePacketLog();
    }

    destroy(): void {
        this.gateway.disconnect();

        // Clean up callbacks
        (this.client as any).setOnGameTickCallback(null);
        if (this.ui.isPacketLoggingEnabled()) {
            this.client.setPacketLogCallback(null);
        }

        // Clean up activity check interval
        if (this.activityCheckInterval) {
            clearInterval(this.activityCheckInterval);
            this.activityCheckInterval = null;
        }

        this.ui.destroy();
        globalBotOverlay = null;
    }
}
