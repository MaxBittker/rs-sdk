// AgentPanel.ts - UI Panel for Agent SDK integration
// Connects to agent-controller service to manage agent sessions
// Also connects to sync service to send game state when active

import type { Client } from '#/client/Client.js';
import { BotStateCollector, formatWorldStateForAgent, type BotWorldState } from '#/bot/BotSDK.js';
import { canvas } from '#/graphics/Canvas.js';

// Extract bot username from URL query params for multi-bot support
function getBotUsername(): string {
    if (typeof window === 'undefined') return 'default';
    const params = new URLSearchParams(window.location.search);
    return params.get('bot') || 'default';
}

// Extract goal from URL query params
function getGoalFromUrl(): string {
    if (typeof window === 'undefined') return 'Complete the tutorial';
    const params = new URLSearchParams(window.location.search);
    return params.get('goal') || 'Complete the tutorial';
}

// Update URL with goal without page reload
function updateUrlWithGoal(goal: string): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (goal) {
        url.searchParams.set('goal', goal);
    } else {
        url.searchParams.delete('goal');
    }
    window.history.replaceState({}, '', url.toString());
}

// Check if running via test (detected via 'tst' query param)
function isRunningViaTest(): boolean {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('tst');
}

const BOT_USERNAME = getBotUsername();

const CONTROLLER_URL = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/agent-controller?bot=${BOT_USERNAME}`
    : 'ws://localhost:7781';

const SYNC_URL = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/agent?bot=${BOT_USERNAME}`
    : 'ws://localhost:7780';

// Action types from sync service
type BotAction =
    | { type: 'none'; reason: string }
    | { type: 'wait'; reason: string; ticks?: number }
    | { type: 'talkToNpc'; npcIndex: number; reason: string }
    | { type: 'interactNpc'; npcIndex: number; optionIndex: number; reason: string }
    | { type: 'clickDialogOption'; optionIndex: number; reason: string }
    | { type: 'clickInterfaceOption'; optionIndex: number; reason: string }
    | { type: 'clickInterfaceComponent'; componentId: number; optionIndex?: number; reason: string }
    | { type: 'acceptCharacterDesign'; reason: string }
    | { type: 'skipTutorial'; reason: string }
    | { type: 'walkTo'; x: number; z: number; running?: boolean; reason: string }
    | { type: 'useInventoryItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'dropItem'; slot: number; reason: string }
    | { type: 'pickupItem'; x: number; z: number; itemId: number; reason: string }
    | { type: 'interactGroundItem'; x: number; z: number; itemId: number; optionIndex: number; reason: string }
    | { type: 'interactLoc'; x: number; z: number; locId: number; optionIndex: number; reason: string }
    | { type: 'shopBuy'; slot: number; amount: number; reason: string }
    | { type: 'shopSell'; slot: number; amount: number; reason: string }
    | { type: 'closeShop'; reason: string }
    | { type: 'setCombatStyle'; style: number; reason: string }
    | { type: 'useItemOnItem'; sourceSlot: number; targetSlot: number; reason: string }
    | { type: 'useItemOnLoc'; itemSlot: number; x: number; z: number; locId: number; reason: string }
    | { type: 'say'; message: string; reason: string }
    | { type: 'spellOnNpc'; npcIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string }
    | { type: 'setTab'; tabIndex: number; reason: string };

// Messages from sync service
interface SyncMessage {
    type: 'action' | 'thinking' | 'error' | 'status';
    action?: BotAction;
    thinking?: string;
    error?: string;
    status?: string;
}

interface ActionLogEntry {
    timestamp: number;
    type: 'thinking' | 'action' | 'result' | 'error' | 'system' | 'user_message' | 'code' | 'state';
    content: string;
}

interface AgentState {
    running: boolean;
    sessionId: string | null;
    goal: string | null;
    startedAt: number | null;
    actionLog: ActionLogEntry[];
}

export class AgentPanel {
    private container: HTMLDivElement | null = null;
    private ws: WebSocket | null = null;  // Controller connection
    private syncWs: WebSocket | null = null;  // Sync service connection
    private state: AgentState = {
        running: false,
        sessionId: null,
        goal: null,
        startedAt: null,
        actionLog: []
    };
    private visible: boolean = false;
    private minimized: boolean = false;
    private reconnectTimer: number | null = null;
    private syncReconnectTimer: number | null = null;

    // Client reference for executing actions and collecting state
    private client: Client | null = null;
    private stateCollector: BotStateCollector | null = null;
    private clientId: string;
    private currentGoal: string = getGoalFromUrl();
    private syncConnected: boolean = false;  // Flag to track if we've sent 'connected' message

    // Action execution
    private pendingAction: BotAction | null = null;
    private currentActionId: string | null = null;  // For SDK correlation
    private waitTicks: number = 0;

    // Sync throttling - only send state every N ticks
    private syncTickCounter: number = 0;
    private static readonly SYNC_INTERVAL_TICKS: number = 10; // Sync every 10 ticks (~500ms at 20 ticks/sec)

    // UI Elements
    private statusEl: HTMLDivElement | null = null;
    private syncStatusEl: HTMLDivElement | null = null;
    private messageInput: HTMLInputElement | null = null;
    private logContainer: HTMLDivElement | null = null;
    private stopBtn: HTMLButtonElement | null = null;

    // Deduplication for repeated entries
    private lastEntryKey: string = '';
    private lastEntryDiv: HTMLDivElement | null = null;
    private lastEntryCount: number = 1;

    // Todo list state
    private todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }> = [];
    private todoContainer: HTMLDivElement | null = null;

    constructor(client?: Client) {
        // Include bot username in clientId for easier identification
        this.clientId = `${BOT_USERNAME}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        if (client) {
            this.setClient(client);
        }
        this.createUI();
        this.connect();
        // Always connect to sync service so actions can be executed
        // even when the panel is not visible
        this.connectSync();
        // Show panel by default, unless running via test
        if (!isRunningViaTest()) {
            this.show();
        }
    }

    setClient(client: Client): void {
        this.client = client;
        this.stateCollector = new BotStateCollector(client);
    }

    private connect(): void {
        if (this.ws) {
            this.ws.close();
        }

        try {
            this.ws = new WebSocket(CONTROLLER_URL);

            this.ws.onopen = () => {
                console.log('[AgentPanel] Connected to controller');
                this.updateConnectionStatus(true);
                // Request current state
                this.send({ type: 'getState' });
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = () => {
                console.log('[AgentPanel] Disconnected from controller');
                this.updateConnectionStatus(false);
                this.scheduleReconnect();
            };

            this.ws.onerror = () => {
                this.updateConnectionStatus(false);
            };
        } catch (e) {
            console.error('[AgentPanel] Connection error:', e);
            this.updateConnectionStatus(false);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 3000);
    }

    // Sync service connection (for game state streaming)
    private connectSync(): void {
        if (this.syncWs) {
            this.syncWs.close();
        }

        try {
            console.log(`[AgentPanel] Connecting to sync service at ${SYNC_URL}...`);
            this.syncWs = new WebSocket(SYNC_URL);

            this.syncWs.onopen = () => {
                console.log(`[AgentPanel] Connected to sync service (bot: ${BOT_USERNAME})`);
                this.updateSyncStatus(true);

                // Clear any stale pending actions from previous sessions
                // This prevents agents from getting stuck in broken states
                if (this.pendingAction) {
                    console.log(`[AgentPanel] Clearing stale pending action on connect: ${this.pendingAction.type}`);
                }
                this.pendingAction = null;
                this.waitTicks = 0;

                // Send initial connection message with username for multi-bot routing
                // IMPORTANT: Must send this BEFORE any state messages
                this.sendSync({
                    type: 'connected',
                    clientId: this.clientId,
                    username: BOT_USERNAME
                });

                // Mark as connected so tick() can start sending state
                this.syncConnected = true;

                // Send current goal
                this.sendSync({
                    type: 'setGoal',
                    goal: this.currentGoal
                });
            };

            this.syncWs.onmessage = (event) => {
                this.handleSyncMessage(event.data);
            };

            this.syncWs.onclose = () => {
                console.log('[AgentPanel] Disconnected from sync service');
                this.syncConnected = false;
                this.updateSyncStatus(false);
                this.scheduleSyncReconnect();
            };

            this.syncWs.onerror = () => {
                this.updateSyncStatus(false);
            };
        } catch (e) {
            console.error('[AgentPanel] Sync connection error:', e);
            this.updateSyncStatus(false);
            this.scheduleSyncReconnect();
        }
    }

    private disconnectSync(): void {
        if (this.syncReconnectTimer) {
            clearTimeout(this.syncReconnectTimer);
            this.syncReconnectTimer = null;
        }
        if (this.syncWs) {
            this.syncWs.close();
            this.syncWs = null;
        }
        this.syncConnected = false;
        this.updateSyncStatus(false);
    }

    private scheduleSyncReconnect(): void {
        if (!this.visible) return;  // Only reconnect if panel is visible
        if (this.syncReconnectTimer) return;
        this.syncReconnectTimer = window.setTimeout(() => {
            this.syncReconnectTimer = null;
            if (this.visible) {
                this.connectSync();
            }
        }, 3000);
    }

    private sendSync(message: any): void {
        if (this.syncWs && this.syncWs.readyState === WebSocket.OPEN) {
            this.syncWs.send(JSON.stringify(message));
        }
    }

    private handleSyncMessage(data: string): void {
        let message: SyncMessage & { type: string };
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }

        if (message.type === 'action' && (message as SyncMessage).action) {
            this.pendingAction = (message as SyncMessage).action!;
            this.currentActionId = (message as any).actionId || null;  // Store for result correlation
            // Log the action
            this.state.actionLog.push({
                timestamp: Date.now(),
                type: 'action',
                content: `${(message as SyncMessage).action!.type}: ${(message as SyncMessage).action!.reason || ''}`
            });
            this.addLogEntry({
                timestamp: Date.now(),
                type: 'action',
                content: `${(message as SyncMessage).action!.type}: ${(message as SyncMessage).action!.reason || ''}`
            });
        }

        if (message.type === 'thinking' && (message as SyncMessage).thinking) {
            this.state.actionLog.push({
                timestamp: Date.now(),
                type: 'thinking',
                content: (message as SyncMessage).thinking!
            });
            this.addLogEntry({
                timestamp: Date.now(),
                type: 'thinking',
                content: (message as SyncMessage).thinking!
            });
        }

        if (message.type === 'error' && (message as SyncMessage).error) {
            this.state.actionLog.push({
                timestamp: Date.now(),
                type: 'error',
                content: (message as SyncMessage).error!
            });
            this.addLogEntry({
                timestamp: Date.now(),
                type: 'error',
                content: (message as SyncMessage).error!
            });
        }

        // Handle screenshot request from controller via sync service
        if (message.type === 'screenshot_request') {
            this.captureAndSendScreenshot();
        }
    }

    private captureAndSendScreenshot(): void {
        if (!canvas) return;

        try {
            // Capture canvas only (not full page) as PNG
            const dataUrl = canvas.toDataURL('image/png');

            // Send screenshot back via sync service
            this.sendSync({
                type: 'screenshot_response',
                dataUrl
            });
        } catch (e) {
            console.error('[AgentPanel] Failed to capture screenshot:', e);
        }
    }

    private updateSyncStatus(connected: boolean): void {
        if (this.syncStatusEl) {
            this.syncStatusEl.textContent = connected ? BOT_USERNAME : '—';
            this.syncStatusEl.style.color = connected ? '#555' : '#604040';
        }
    }

    // Called every game tick from the client
    tick(): void {
        if (!this.client) return;

        // Always process pending actions even if panel is hidden
        // to avoid blocking the action queue

        // Handle wait ticks
        if (this.waitTicks > 0) {
            this.waitTicks--;
            return;
        }

        // Execute pending action
        if (this.pendingAction) {
            const result = this.executeAction(this.pendingAction);
            const actionId = this.currentActionId;
            this.pendingAction = null;
            this.currentActionId = null;

            // Send result back to sync service (with actionId for SDK correlation)
            this.sendSync({
                type: 'actionResult',
                result,
                actionId
            });

            // Log the result
            this.state.actionLog.push({
                timestamp: Date.now(),
                type: 'result',
                content: `${result.success ? 'Success' : 'Failed'}: ${result.message}`
            });
            this.addLogEntry({
                timestamp: Date.now(),
                type: 'result',
                content: `${result.success ? 'Success' : 'Failed'}: ${result.message}`
            });

            // Send state immediately after action for fresh feedback
            this.syncTickCounter = 0;
            this.sendState();
            return;
        }

        // Send current state to sync service (throttled)
        this.syncTickCounter++;
        if (this.syncTickCounter >= AgentPanel.SYNC_INTERVAL_TICKS) {
            this.syncTickCounter = 0;
            this.sendState();
        }
    }

    private collectWorldState(): BotWorldState | null {
        if (!this.stateCollector || !this.client) return null;

        const baseState = this.stateCollector.collectState();
        const c = this.client as any;

        // Get dialog state
        const dialogOptions: Array<{ index: number; text: string }> = [];
        if (c.chatInterfaceId !== -1) {
            const options = this.client.getDialogOptions();
            for (const opt of options) {
                dialogOptions.push({ index: opt.index, text: opt.text });
            }
        }

        // Collect interface options (for crafting menus like fletching)
        const interfaceOptions: Array<{ index: number; text: string }> = [];
        if (this.client.isViewportInterfaceOpen()) {
            const options = this.client.getInterfaceOptions();
            for (const opt of options) {
                interfaceOptions.push({ index: opt.index, text: opt.text });
            }
        }

        return {
            ...baseState,
            dialog: {
                isOpen: this.client.isDialogOpen(),
                options: dialogOptions,
                isWaiting: this.client.isWaitingForDialog()
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
        // Don't send state until we've sent the 'connected' message
        if (!this.syncConnected) return;
        if (!this.syncWs || this.syncWs.readyState !== WebSocket.OPEN) return;

        const state = this.collectWorldState();
        if (!state) return;

        // Always use the current value from the input field (reflects what user typed)
        const goal = this.goalInput?.value.trim() || this.currentGoal;
        const formattedState = formatWorldStateForAgent(state, goal);
        this.sendSync({
            type: 'state',
            state,
            formattedState
        });
    }

    private executeAction(action: BotAction): { success: boolean; message: string } {
        if (!this.client) {
            return { success: false, message: 'Client not available' };
        }

        try {
            switch (action.type) {
                case 'none':
                    return { success: true, message: 'No action taken' };

                case 'wait':
                    this.waitTicks = action.ticks || 1;
                    return { success: true, message: `Waiting ${this.waitTicks} ticks` };

                case 'talkToNpc':
                    if (this.client.talkToNpc(action.npcIndex)) {
                        return { success: true, message: `Talking to NPC ${action.npcIndex}` };
                    }
                    return { success: false, message: 'Failed to talk to NPC' };

                case 'interactNpc':
                    if (this.client.interactNpc(action.npcIndex, action.optionIndex)) {
                        return { success: true, message: `Interacting with NPC ${action.npcIndex} option ${action.optionIndex}` };
                    }
                    return { success: false, message: 'Failed to interact with NPC' };

                case 'clickDialogOption':
                    if (this.client.clickDialogOption(action.optionIndex)) {
                        return { success: true, message: `Clicked dialog option ${action.optionIndex}` };
                    }
                    return { success: false, message: 'Failed to click dialog option' };

                case 'clickInterfaceOption':
                    if (this.client.clickInterfaceOption(action.optionIndex)) {
                        return { success: true, message: `Clicked interface option ${action.optionIndex}` };
                    }
                    return { success: false, message: 'Failed to click interface option (no viewport interface open or invalid option)' };

                case 'clickInterfaceComponent':
                    // Use simple IF_BUTTON for option 1 (e.g., casting spells), INV_BUTTON for inventory-style ops
                    if ((action.optionIndex ?? 1) === 1) {
                        if (this.client.clickComponent(action.componentId)) {
                            return { success: true, message: `Clicked interface component ${action.componentId}` };
                        }
                    } else {
                        if (this.client.clickInterfaceIop(action.componentId, action.optionIndex ?? 1)) {
                            return { success: true, message: `Clicked interface component ${action.componentId} option ${action.optionIndex ?? 1}` };
                        }
                    }
                    return { success: false, message: 'Failed to click interface component' };

                case 'setTab':
                    if (this.client.setTab(action.tabIndex)) {
                        return { success: true, message: `Switched to tab ${action.tabIndex}` };
                    }
                    return { success: false, message: 'Failed to switch tab' };

                case 'acceptCharacterDesign':
                    if (this.client.acceptCharacterDesign()) {
                        return { success: true, message: 'Accepted character design' };
                    }
                    return { success: false, message: 'Failed to accept character design' };

                case 'skipTutorial': {
                    // Inline tutorial skip logic (mirrors Client.skipTutorial but synchronous)
                    if (!this.client.ingame) {
                        return { success: false, message: 'Not in game yet' };
                    }

                    // If a dialog is open, try to interact with it
                    if (this.client.isDialogOpen()) {
                        if (this.client.isWaitingForDialog()) {
                            return { success: false, message: 'Waiting for dialog response...' };
                        }

                        const options = this.client.getDialogOptions();
                        if (options.length > 0) {
                            // Look for "Yes please" or similar affirmative option
                            for (let i = 0; i < options.length; i++) {
                                const text = options[i].text.toLowerCase();
                                if (text.includes('yes')) {
                                    this.client.clickDialogOption(i + 1);
                                    return { success: true, message: `Selected: ${options[i].text}` };
                                }
                            }
                            // If no clear yes option, just click option 1
                            this.client.clickDialogOption(1);
                            return { success: true, message: `Selected: ${options[0]?.text || 'option 1'}` };
                        }

                        // No options available, click continue
                        if (this.client.clickDialogOption(0)) {
                            return { success: true, message: 'Clicked continue' };
                        }
                        return { success: false, message: 'Dialog open but cannot interact' };
                    }

                    // Find and talk to RuneScape Guide
                    const guideIndex = this.client.findNpcByName('RuneScape Guide');
                    if (guideIndex >= 0) {
                        this.client.talkToNpc(guideIndex);
                        return { success: true, message: 'Talking to RuneScape Guide' };
                    }

                    // Try other common tutorial NPC names
                    const alternateNames = ['Guide', 'Tutorial'];
                    for (const name of alternateNames) {
                        const idx = this.client.findNpcByName(name);
                        if (idx >= 0) {
                            this.client.talkToNpc(idx);
                            return { success: true, message: `Talking to ${name}` };
                        }
                    }

                    return { success: false, message: 'No tutorial NPC found nearby' };
                }

                case 'walkTo':
                    if (this.client.walkTo(action.x, action.z, action.running || false)) {
                        return { success: true, message: `Walking to (${action.x}, ${action.z})` };
                    }
                    return { success: false, message: 'Failed to walk' };

                case 'useInventoryItem':
                    console.log(`[AgentPanel] useInventoryItem called - slot: ${action.slot}, optionIndex: ${action.optionIndex}`);
                    if (this.client.useInventoryItem(action.slot, action.optionIndex)) {
                        console.log(`[AgentPanel] useInventoryItem SUCCESS - slot: ${action.slot}, optionIndex: ${action.optionIndex}`);
                        return { success: true, message: `Using inventory item at slot ${action.slot}` };
                    }
                    console.log(`[AgentPanel] useInventoryItem FAILED - slot: ${action.slot}, optionIndex: ${action.optionIndex}`);
                    return { success: false, message: 'Failed to use inventory item' };

                case 'dropItem':
                    console.log(`[AgentPanel] dropItem called - slot: ${action.slot}`);
                    if (this.client.dropInventoryItem(action.slot)) {
                        console.log(`[AgentPanel] dropItem SUCCESS - slot: ${action.slot}`);
                        return { success: true, message: `Dropping item at slot ${action.slot}` };
                    }
                    console.log(`[AgentPanel] dropItem FAILED - slot: ${action.slot}`);
                    return { success: false, message: 'Failed to drop item' };

                case 'pickupItem':
                    if (this.client.pickupGroundItem(action.x, action.z, action.itemId)) {
                        return { success: true, message: `Picking up item ${action.itemId} at (${action.x}, ${action.z})` };
                    }
                    return { success: false, message: 'Failed to pickup item' };

                case 'interactGroundItem':
                    if (this.client.interactGroundItem(action.x, action.z, action.itemId, action.optionIndex)) {
                        return { success: true, message: `Interacting with ground item ${action.itemId}` };
                    }
                    return { success: false, message: 'Failed to interact with ground item' };

                case 'interactLoc':
                    if (this.client.interactLoc(action.x, action.z, action.locId, action.optionIndex)) {
                        return { success: true, message: `Interacting with location ${action.locId}` };
                    }
                    return { success: false, message: 'Failed to interact with location' };

                case 'shopBuy':
                    if (this.client.shopBuy(action.slot, action.amount)) {
                        return { success: true, message: `Buying item at slot ${action.slot} x${action.amount}` };
                    }
                    return { success: false, message: 'Failed to buy from shop (shop may not be open)' };

                case 'shopSell':
                    if (this.client.shopSell(action.slot, action.amount)) {
                        return { success: true, message: `Selling item at slot ${action.slot} x${action.amount}` };
                    }
                    return { success: false, message: 'Failed to sell to shop (shop may not be open)' };

                case 'closeShop':
                    if (this.client.closeShop()) {
                        return { success: true, message: 'Closing shop' };
                    }
                    return { success: false, message: 'Failed to close shop (shop may not be open)' };

                case 'setCombatStyle':
                    if (this.client.setCombatStyle(action.style)) {
                        const styleNames = ['Accurate (Attack)', 'Aggressive (Strength)', 'Defensive (Defence)', 'Controlled (Shared)'];
                        const styleName = styleNames[action.style] || `Style ${action.style}`;
                        return { success: true, message: `Set combat style to ${styleName}` };
                    }
                    return { success: false, message: `Failed to set combat style to ${action.style}` };

                case 'useItemOnItem':
                    if (this.client.useItemOnItem(action.sourceSlot, action.targetSlot)) {
                        return { success: true, message: `Used item in slot ${action.sourceSlot} on item in slot ${action.targetSlot}` };
                    }
                    return { success: false, message: `Failed to use item ${action.sourceSlot} on item ${action.targetSlot}` };

                case 'useItemOnLoc':
                    if (this.client.useItemOnLoc(action.itemSlot, action.x, action.z, action.locId)) {
                        return { success: true, message: `Used item in slot ${action.itemSlot} on location ${action.locId} at (${action.x}, ${action.z})` };
                    }
                    return { success: false, message: `Failed to use item on location` };

                case 'say':
                    if (this.client.say(action.message)) {
                        return { success: true, message: `Said: "${action.message}"` };
                    }
                    return { success: false, message: `Failed to send chat message` };

                case 'spellOnNpc':
                    if (this.client.spellOnNpc(action.npcIndex, action.spellComponent)) {
                        return { success: true, message: `Casting spell ${action.spellComponent} on NPC ${action.npcIndex}` };
                    }
                    return { success: false, message: `Failed to cast spell on NPC` };

                case 'spellOnItem':
                    if (this.client.spellOnItem(action.slot, action.spellComponent)) {
                        return { success: true, message: `Casting spell ${action.spellComponent} on item in slot ${action.slot}` };
                    }
                    return { success: false, message: `Failed to cast spell on item` };

                case 'bankDeposit':
                    if (this.client.bankDeposit(action.slot, action.amount)) {
                        return { success: true, message: `Depositing item at slot ${action.slot} x${action.amount}` };
                    }
                    return { success: false, message: 'Failed to deposit item (bank may not be open or slot empty)' };

                case 'bankWithdraw':
                    if (this.client.bankWithdraw(action.slot, action.amount)) {
                        return { success: true, message: `Withdrawing item at slot ${action.slot} x${action.amount}` };
                    }
                    return { success: false, message: 'Failed to withdraw item (bank may not be open or slot empty)' };

                default:
                    return { success: false, message: `Unknown action type: ${(action as any).type}` };
            }
        } catch (error) {
            console.error('[AgentPanel] Action execution error:', error);
            return { success: false, message: `Error: ${error}` };
        }
    }

    setGoal(goal: string): void {
        this.currentGoal = goal;
        localStorage.setItem('agentPanelGoal', goal);
        updateUrlWithGoal(goal);
        this.sendSync({
            type: 'setGoal',
            goal
        });
    }

    private send(message: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    private handleMessage(data: string): void {
        let message;
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }

        switch (message.type) {
            case 'state':
                this.state = {
                    running: message.running,
                    sessionId: message.sessionId,
                    goal: message.goal,
                    startedAt: message.startedAt,
                    actionLog: message.actionLog || []
                };
                this.updateUI();
                break;

            case 'status':
                this.state.running = message.status === 'running' || message.status === 'starting';
                if (message.goal) this.state.goal = message.goal;
                if (message.sessionId) this.state.sessionId = message.sessionId;
                this.updateStatusDisplay();
                break;

            case 'log':
                this.state.actionLog.push(message.entry);
                this.addLogEntry(message.entry);
                break;

            case 'logCleared':
                this.state.actionLog = [];
                if (this.logContainer) {
                    this.logContainer.innerHTML = '<div style="color: #666; font-style: italic;">Log cleared</div>';
                }
                break;

            case 'message_queued':
                // Message was queued for the running agent - log entry already added
                // Could add toast notification here if desired
                break;

            case 'todos':
                // Update todo list from agent
                if (Array.isArray(message.todos)) {
                    this.todos = message.todos;
                    this.renderTodos();
                }
                break;
        }
    }

    private renderTodos(): void {
        if (!this.todoContainer) return;

        // Hide if no active todos
        const activeTodos = this.todos.filter(t => t.status !== 'completed');
        if (activeTodos.length === 0) {
            this.todoContainer.style.display = 'none';
            return;
        }

        this.todoContainer.style.display = 'block';
        let html = '';
        for (const todo of activeTodos) {
            const text = todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content;
            html += `<div class="todo-item todo-${todo.status}">${todo.status === 'in_progress' ? '→ ' : ''}${this.escapeHtml(text)}</div>`;
        }
        this.todoContainer.innerHTML = html;
    }

    private updateConnectionStatus(connected: boolean): void {
        if (this.statusEl) {
            if (connected) {
                this.updateStatusDisplay();
            } else {
                this.statusEl.innerHTML = '<span style="color: #f55;">Controller: Disconnected</span>';
            }
        }
    }

    private updateStatusDisplay(): void {
        if (!this.statusEl) return;

        if (this.state.running) {
            this.statusEl.textContent = '● Running';
            this.statusEl.style.color = '#70a070';
            if (this.stopBtn) {
                this.stopBtn.style.background = '#604040';
                this.stopBtn.style.opacity = '1';
            }
        } else {
            this.statusEl.textContent = '○ Idle';
            this.statusEl.style.color = '#606060';
            if (this.stopBtn) {
                this.stopBtn.style.background = '#404040';
                this.stopBtn.style.opacity = '0.5';
            }
        }
    }

    private updateUI(): void {
        this.updateStatusDisplay();

        // Render all log entries
        if (this.logContainer) {
            this.logContainer.innerHTML = '';
            // Reset deduplication when rebuilding log
            this.lastEntryKey = '';
            this.lastEntryDiv = null;
            this.lastEntryCount = 1;
            for (const entry of this.state.actionLog) {
                this.addLogEntry(entry, false);
            }
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    private addLogEntry(entry: ActionLogEntry, scroll: boolean = true): void {
        if (!this.logContainer) return;

        // Filter out low-level SDK noise - only show high-level info
        if (entry.type === 'action' && entry.content.endsWith(': SDK')) {
            return; // Skip low-level SDK action spam
        }
        if (entry.type === 'result' && /^(Success|Failed): (Interacting|Walking|Talking|Picking|Dropping|Using|Clicking|Waiting|Set combat)/i.test(entry.content)) {
            return; // Skip low-level result spam
        }

        // Create a key for deduplication (type + content for action/result pairs)
        const entryKey = `${entry.type}:${entry.content}`;

        // Check for repeated entries (only dedupe action and result types)
        if ((entry.type === 'action' || entry.type === 'result') && entryKey === this.lastEntryKey && this.lastEntryDiv) {
            this.lastEntryCount++;
            // Update the existing entry with count
            const countBadge = this.lastEntryDiv.querySelector('.repeat-count');
            if (countBadge) {
                countBadge.textContent = `×${this.lastEntryCount}`;
                (countBadge as HTMLElement).style.display = 'inline';
            }
            if (scroll) {
                this.logContainer.scrollTop = this.logContainer.scrollHeight;
            }
            return;
        }

        // Reset deduplication tracking for new entry
        this.lastEntryKey = entryKey;
        this.lastEntryCount = 1;

        const div = document.createElement('div');
        div.style.cssText = `
            padding: 4px 6px;
            margin: 2px 0;
            font-size: 11px;
            word-wrap: break-word;
        `;

        // Count badge HTML (hidden by default)
        const countBadgeHtml = `<span class="repeat-count" style="display:none; color:#505050; font-size:9px; margin-left:4px;"></span>`;

        switch (entry.type) {
            case 'thinking':
                div.style.color = '#b0b0b0';
                div.innerHTML = this.escapeHtml(entry.content);
                this.lastEntryDiv = null;
                this.lastEntryKey = '';
                break;

            case 'action':
                div.style.color = '#707070';
                div.innerHTML = `${this.escapeHtml(entry.content)}${countBadgeHtml}`;
                this.lastEntryDiv = div;
                break;

            case 'code':
                div.style.padding = '0';
                div.innerHTML = this.formatCodeEntry('', entry.content);
                this.lastEntryDiv = null;
                this.lastEntryKey = '';
                break;

            case 'result':
                div.innerHTML = `<span style="color:#506050; font-size:10px;">→ returned:</span> ` + this.formatResultEntry('', entry.content) + countBadgeHtml;
                this.lastEntryDiv = div;
                break;

            case 'error':
                div.style.color = '#a06060';
                div.innerHTML = `${this.escapeHtml(entry.content)}${countBadgeHtml}`;
                this.lastEntryDiv = div;
                break;

            case 'system':
                div.style.color = '#585858';
                div.style.fontSize = '10px';
                div.innerHTML = this.escapeHtml(entry.content);
                this.lastEntryDiv = null;
                this.lastEntryKey = '';
                break;

            case 'state':
                div.style.color = '#606060';
                div.style.fontSize = '10px';
                div.style.fontFamily = 'monospace';
                div.style.whiteSpace = 'pre-wrap';
                div.style.background = '#151515';
                div.style.borderRadius = '3px';
                div.style.padding = '6px 8px';
                div.innerHTML = this.escapeHtml(entry.content);
                this.lastEntryDiv = null;
                this.lastEntryKey = '';
                break;

            case 'user_message':
                div.style.color = '#90b0c0';
                div.style.borderLeft = '2px solid #506070';
                div.style.paddingLeft = '8px';
                div.innerHTML = this.escapeHtml(entry.content);
                this.lastEntryDiv = null;
                this.lastEntryKey = '';
                break;
        }

        this.logContainer.appendChild(div);

        if (scroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    private formatCodeEntry(time: string, code: string): string {
        // Try to highlight with hljs if available
        let highlighted = this.escapeHtml(code);
        const hljs = (window as any).hljs;
        if (hljs) {
            try {
                highlighted = hljs.highlight(code, { language: 'typescript' }).value;
            } catch {
                // Fall back to escaped
            }
        }

        // Simple code block without max-height or scrolling
        return `<div style="background: #1e1e1e; border-radius: 3px; padding: 8px 10px;">
            <pre style="margin: 0; white-space: pre-wrap; word-break: break-word; font-family: 'Consolas', 'Monaco', monospace; font-size: 11px; line-height: 1.5; color: #707070;"><code>${highlighted}</code></pre>
        </div>`;
    }

    private formatResultEntry(time: string, content: string): string {
        const isError = content.toLowerCase().startsWith('error');
        const color = isError ? '#a06060' : '#608060';

        // Try to parse as JSON
        try {
            const parsed = JSON.parse(content);
            const formatted = JSON.stringify(parsed, null, 2);
            const lines = formatted.split('\n');

            // Compact for small results
            if (lines.length <= 2) {
                return `<span style="color:${color}; font-family: monospace; font-size: 10px;">${this.syntaxHighlightJson(JSON.stringify(parsed))}</span>`;
            }

            // Show full result without scrolling
            return `<div style="background: #1a1a1a; border-radius: 3px; overflow: hidden; padding: 6px 8px;">
                <pre style="margin: 0; font-size: 10px; line-height: 1.3; font-family: monospace; white-space: pre-wrap; word-break: break-all; color: #707070;">${this.syntaxHighlightJson(formatted)}</pre>
            </div>`;
        } catch {
            // Plain text
            return `<span style="color:${color}; font-size: 11px;">${this.escapeHtml(content)}</span>`;
        }
    }

    private syntaxHighlightJson(json: string): string {
        const hljs = (window as any).hljs;
        if (hljs) {
            try {
                return hljs.highlight(json, { language: 'json' }).value;
            } catch {
                // Fall back
            }
        }
        return this.escapeHtml(json);
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private createUI(): void {
        // Add highlight.js and styles
        if (!document.getElementById('agent-panel-styles')) {
            // Load highlight.js with typescript and json
            const hljsScript = document.createElement('script');
            hljsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
            hljsScript.onload = () => {
                const tsScript = document.createElement('script');
                tsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js';
                document.head.appendChild(tsScript);
                const jsonScript = document.createElement('script');
                jsonScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/json.min.js';
                document.head.appendChild(jsonScript);
            };
            document.head.appendChild(hljsScript);

            const style = document.createElement('style');
            style.id = 'agent-panel-styles';
            style.textContent = `
                .collapsed { display: none !important; }
                #agent-panel ::-webkit-scrollbar { width: 6px; height: 6px; }
                #agent-panel ::-webkit-scrollbar-track { background: transparent; }
                #agent-panel ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
                #agent-panel .todo-item { padding: 2px 0; font-size: 10px; color: #505050; }
                #agent-panel .todo-in_progress { color: #808080; }
                #agent-panel .todo-completed { color: #383838; }
                #agent-panel pre code.hljs { background: transparent; padding: 0; }
                #agent-panel .hljs { background: transparent; color: #808080; }
                #agent-panel .hljs-keyword { color: #907090; }
                #agent-panel .hljs-built_in { color: #709080; }
                #agent-panel .hljs-string { color: #908070; }
                #agent-panel .hljs-number { color: #809070; }
                #agent-panel .hljs-literal { color: #708090; }
                #agent-panel .hljs-comment { color: #505050; }
                #agent-panel .hljs-function { color: #909070; }
                #agent-panel .hljs-title.function_ { color: #909070; }
                #agent-panel .hljs-params { color: #707080; }
                #agent-panel .hljs-property { color: #707080; }
                #agent-panel .hljs-attr { color: #807070; }
                #agent-panel .hljs-variable { color: #707080; }
                #agent-panel .hljs-punctuation { color: #606060; }
            `;
            document.head.appendChild(style);
        }

        this.container = document.createElement('div');
        this.container.id = 'agent-panel';
        this.container.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 500px;
            height: 600px;
            min-width: 350px;
            min-height: 300px;
            max-width: 90vw;
            max-height: 90vh;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            color: #888;
            z-index: 10003;
            display: none;
            flex-direction: column;
            resize: both;
            overflow: hidden;
        `;

        // Header with status
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: rgba(40, 40, 40, 0.95);
            border-bottom: 1px solid #333;
            cursor: move;
            font-size: 11px;
        `;

        const headerLeft = document.createElement('div');
        headerLeft.style.cssText = 'display: flex; align-items: center; gap: 10px;';

        this.statusEl = document.createElement('span');
        this.statusEl.style.color = '#888';
        this.statusEl.textContent = '○ Idle';

        this.syncStatusEl = document.createElement('span');
        this.syncStatusEl.style.color = '#555';
        this.syncStatusEl.textContent = '';

        headerLeft.appendChild(this.statusEl);
        headerLeft.appendChild(this.syncStatusEl);

        const headerRight = document.createElement('div');
        headerRight.innerHTML = `
            <button id="agent-minimize" style="background: none; border: none; color: #555; cursor: pointer; padding: 2px 6px; font-size: 12px;">_</button>
            <button id="agent-close" style="background: none; border: none; color: #555; cursor: pointer; padding: 2px 6px; font-size: 12px;">×</button>
        `;

        header.appendChild(headerLeft);
        header.appendChild(headerRight);

        // Content container
        const content = document.createElement('div');
        content.id = 'agent-content';
        content.style.cssText = `
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            overflow: hidden;
            flex: 1;
            min-height: 0;
        `;

        // Chat input row (simplified - single input for both starting and messaging)
        const chatRow = document.createElement('div');
        chatRow.style.cssText = `display: flex; gap: 6px;`;

        this.messageInput = document.createElement('input');
        this.messageInput.type = 'text';
        this.messageInput.placeholder = 'Chat with agent... (Enter to send)';
        this.messageInput.value = this.currentGoal || '';
        this.messageInput.style.cssText = `
            flex: 1;
            background: #111;
            border: 1px solid #5bf;
            color: #fff;
            padding: 8px 10px;
            font-family: inherit;
            font-size: 12px;
            border-radius: 3px;
        `;
        this.messageInput.onkeydown = (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        };

        this.stopBtn = document.createElement('button');
        this.stopBtn.textContent = '⏹';
        this.stopBtn.title = 'Stop agent';
        this.stopBtn.style.cssText = `
            background: #f55;
            border: none;
            color: #fff;
            padding: 8px 12px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 3px;
            font-size: 14px;
        `;
        this.stopBtn.onclick = () => this.stopAgent();

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺';
        resetBtn.title = 'Reset conversation';
        resetBtn.style.cssText = `
            background: #666;
            border: none;
            color: #fff;
            padding: 8px 12px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 3px;
            font-size: 14px;
        `;
        resetBtn.onclick = () => this.resetConversation();

        chatRow.appendChild(this.messageInput);
        chatRow.appendChild(this.stopBtn);
        chatRow.appendChild(resetBtn);


        // Todo list container
        this.todoContainer = document.createElement('div');
        this.todoContainer.style.cssText = `
            padding: 6px 8px;
            border-bottom: 1px solid #252525;
            display: none;
        `;

        // Log container
        this.logContainer = document.createElement('div');
        this.logContainer.style.cssText = `
            flex: 1;
            min-height: 100px;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid #333;
            border-radius: 4px;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 4px;
        `;
        this.logContainer.innerHTML = '<div style="color: #666; font-style: italic; padding: 10px;">No activity yet</div>';

        // Assemble content
        content.appendChild(chatRow);
        content.appendChild(this.todoContainer);
        content.appendChild(this.logContainer);

        this.container.appendChild(header);
        this.container.appendChild(content);
        document.body.appendChild(this.container);

        // Event handlers
        document.getElementById('agent-minimize')?.addEventListener('click', () => this.toggleMinimize());
        document.getElementById('agent-close')?.addEventListener('click', () => this.hide());

        // Make draggable
        this.makeDraggable(header);
    }

    private makeDraggable(handle: HTMLElement): void {
        if (!this.container) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startBottom = 0;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(this.container!.style.left) || 10;
            startBottom = parseInt(this.container!.style.bottom) || 10;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !this.container) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this.container.style.left = `${startLeft + dx}px`;
            this.container.style.bottom = `${startBottom - dy}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    private sendChatMessage(): void {
        const message = this.messageInput?.value.trim();
        if (!message) return;

        // Clear input immediately
        if (this.messageInput) {
            this.messageInput.value = '';
        }

        // Update URL with the message as goal context
        this.setGoal(message);

        // Send as message - controller will start agent if not running
        this.send({ type: 'send', message });
    }

    private stopAgent(): void {
        this.send({ type: 'stop' });
    }

    private resetConversation(): void {
        // Stop if running, clear log, and reset state
        this.send({ type: 'stop' });
        this.send({ type: 'clearLog' });
        this.state.actionLog = [];
        this.state.goal = null;
        // Reset deduplication
        this.lastEntryKey = '';
        this.lastEntryDiv = null;
        this.lastEntryCount = 1;
        if (this.logContainer) {
            this.logContainer.innerHTML = '<div style="color: #666; font-style: italic; padding: 10px;">Conversation reset. Type a message to start.</div>';
        }
    }

    private clearLog(): void {
        this.send({ type: 'clearLog' });
    }

    private toggleMinimize(): void {
        this.minimized = !this.minimized;
        const content = document.getElementById('agent-content');
        if (content) {
            content.style.display = this.minimized ? 'none' : 'flex';
        }
    }

    show(): void {
        this.visible = true;
        if (this.container) {
            this.container.style.display = 'flex';
        }
    }

    hide(): void {
        this.visible = false;
        if (this.container) {
            this.container.style.display = 'none';
        }
        // Keep sync connection alive to avoid blocking action queue
        // Only disconnect when explicitly destroyed
    }

    toggle(): void {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    isVisible(): boolean {
        return this.visible;
    }

    destroy(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.syncReconnectTimer) {
            clearTimeout(this.syncReconnectTimer);
        }
        if (this.ws) {
            this.ws.close();
        }
        if (this.syncWs) {
            this.syncWs.close();
        }
        if (this.container) {
            this.container.remove();
        }
    }
}

// Keyboard shortcut setup
export function setupAgentPanelKeyboardShortcut(panel: AgentPanel): void {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+A to toggle agent panel
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            panel.toggle();
        }
    });
}
