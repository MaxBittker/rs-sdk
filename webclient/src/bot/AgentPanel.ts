// AgentPanel.ts - UI Panel for Agent SDK integration
// Connects to agent-controller service to manage agent sessions
// Also connects to sync service to send game state when active

import type { Client } from '#/client/Client.js';
import { BotStateCollector, formatWorldStateForAgent, type BotWorldState } from '#/bot/BotSDK.js';

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
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string };

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
    type: 'thinking' | 'action' | 'result' | 'error' | 'system' | 'user_message';
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
    private goalInput: HTMLInputElement | null = null;
    private messageInput: HTMLInputElement | null = null;
    private logContainer: HTMLDivElement | null = null;
    private startBtn: HTMLButtonElement | null = null;
    private stopBtn: HTMLButtonElement | null = null;

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
        let message: SyncMessage;
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }

        if (message.type === 'action' && message.action) {
            this.pendingAction = message.action;
            this.currentActionId = (message as any).actionId || null;  // Store for result correlation
            // Log the action
            this.state.actionLog.push({
                timestamp: Date.now(),
                type: 'action',
                content: `${message.action.type}: ${message.action.reason || ''}`
            });
            this.addLogEntry({
                timestamp: Date.now(),
                type: 'action',
                content: `${message.action.type}: ${message.action.reason || ''}`
            });
        }

        if (message.type === 'thinking' && message.thinking) {
            this.state.actionLog.push({
                timestamp: Date.now(),
                type: 'thinking',
                content: message.thinking
            });
            this.addLogEntry({
                timestamp: Date.now(),
                type: 'thinking',
                content: message.thinking
            });
        }

        if (message.type === 'error' && message.error) {
            this.state.actionLog.push({
                timestamp: Date.now(),
                type: 'error',
                content: message.error
            });
            this.addLogEntry({
                timestamp: Date.now(),
                type: 'error',
                content: message.error
            });
        }
    }

    private updateSyncStatus(connected: boolean): void {
        if (this.syncStatusEl) {
            this.syncStatusEl.innerHTML = connected
                ? `<span style="color: #5f5;">Sync: ${BOT_USERNAME}</span>`
                : '<span style="color: #f55;">Sync: Disconnected</span>';
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
                    if (this.client.clickInterfaceIop(action.componentId, action.optionIndex ?? 1)) {
                        return { success: true, message: `Clicked interface component ${action.componentId} option ${action.optionIndex ?? 1}` };
                    }
                    return { success: false, message: 'Failed to click interface component' };

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
        }
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
            this.statusEl.innerHTML = `<span style="color: #5f5;">Agent: Running</span>`;
            if (this.startBtn) this.startBtn.disabled = true;
            if (this.stopBtn) this.stopBtn.disabled = false;
        } else {
            this.statusEl.innerHTML = '<span style="color: #888;">Agent: Stopped</span>';
            if (this.startBtn) this.startBtn.disabled = false;
            if (this.stopBtn) this.stopBtn.disabled = true;
        }
    }

    private updateUI(): void {
        this.updateStatusDisplay();

        // Render all log entries
        if (this.logContainer) {
            this.logContainer.innerHTML = '';
            for (const entry of this.state.actionLog) {
                this.addLogEntry(entry, false);
            }
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    private addLogEntry(entry: ActionLogEntry, scroll: boolean = true): void {
        if (!this.logContainer) return;

        const div = document.createElement('div');
        div.style.cssText = `
            padding: 4px 6px;
            margin: 2px 0;
            border-radius: 3px;
            font-size: 11px;
            word-wrap: break-word;
        `;

        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        switch (entry.type) {
            case 'thinking':
                div.style.background = 'rgba(100, 100, 255, 0.15)';
                div.style.borderLeft = '3px solid #66f';
                div.innerHTML = `<span style="color:#888">${time}</span> <span style="color:#aaf;">Claude:</span> ${this.escapeHtml(entry.content)}`;
                break;

            case 'action':
                div.style.background = 'rgba(255, 200, 100, 0.15)';
                div.style.borderLeft = '3px solid #fa0';
                div.innerHTML = `<span style="color:#888">${time}</span> <span style="color:#fa0;">Action:</span> ${this.escapeHtml(entry.content)}`;
                break;

            case 'result':
                div.style.background = 'rgba(100, 255, 100, 0.15)';
                div.style.borderLeft = '3px solid #5f5';
                div.innerHTML = `<span style="color:#888">${time}</span> <span style="color:#5f5;">Result:</span> ${this.escapeHtml(entry.content)}`;
                break;

            case 'error':
                div.style.background = 'rgba(255, 100, 100, 0.15)';
                div.style.borderLeft = '3px solid #f55';
                div.innerHTML = `<span style="color:#888">${time}</span> <span style="color:#f55;">Error:</span> ${this.escapeHtml(entry.content)}`;
                break;

            case 'system':
                div.style.background = 'rgba(150, 150, 150, 0.15)';
                div.style.borderLeft = '3px solid #888';
                div.innerHTML = `<span style="color:#888">${time}</span> <span style="color:#aaa;">System:</span> ${this.escapeHtml(entry.content)}`;
                break;

            case 'user_message':
                div.style.background = 'rgba(100, 200, 255, 0.15)';
                div.style.borderLeft = '3px solid #5bf';
                div.innerHTML = `<span style="color:#888">${time}</span> <span style="color:#5bf;">You:</span> ${this.escapeHtml(entry.content)}`;
                break;
        }

        this.logContainer.appendChild(div);

        if (scroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
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
        this.container = document.createElement('div');
        this.container.id = 'agent-panel';
        this.container.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 400px;
            max-height: 500px;
            background: rgba(0, 0, 0, 0.95);
            border: 2px solid #5bf;
            border-radius: 8px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            color: #fff;
            z-index: 10003;
            display: none;
            flex-direction: column;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: rgba(85, 187, 255, 0.2);
            border-bottom: 1px solid #5bf;
            cursor: move;
        `;
        header.innerHTML = `
            <span style="font-weight: bold; color: #5bf;">AGENT SDK</span>
            <div>
                <button id="agent-minimize" style="background: none; border: 1px solid #5bf; color: #5bf; cursor: pointer; padding: 2px 8px; margin-right: 4px;">_</button>
                <button id="agent-close" style="background: none; border: 1px solid #5bf; color: #5bf; cursor: pointer; padding: 2px 8px;">X</button>
            </div>
        `;

        // Content container
        const content = document.createElement('div');
        content.id = 'agent-content';
        content.style.cssText = `
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            overflow: hidden;
        `;

        // Status row
        const statusRow = document.createElement('div');
        statusRow.style.cssText = `
            display: flex;
            gap: 10px;
            padding: 6px 8px;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 4px;
            font-size: 11px;
        `;

        this.statusEl = document.createElement('div');
        this.statusEl.textContent = 'Controller: Connecting...';

        this.syncStatusEl = document.createElement('div');
        this.syncStatusEl.innerHTML = '<span style="color: #888;">Sync: Waiting...</span>';

        statusRow.appendChild(this.statusEl);
        statusRow.appendChild(this.syncStatusEl);

        // Goal input row
        const goalRow = document.createElement('div');
        goalRow.style.cssText = `display: flex; gap: 6px;`;

        this.goalInput = document.createElement('input');
        this.goalInput.type = 'text';
        this.goalInput.placeholder = 'Enter goal for agent...';
        this.goalInput.value = this.currentGoal;
        this.goalInput.style.cssText = `
            flex: 1;
            background: #111;
            border: 1px solid #5bf;
            color: #fff;
            padding: 6px 8px;
            font-family: inherit;
            font-size: 11px;
            border-radius: 3px;
        `;
        // Sync goal changes to URL as user types
        this.goalInput.oninput = () => {
            const goal = this.goalInput?.value.trim();
            if (goal) {
                this.currentGoal = goal;
                updateUrlWithGoal(goal);
            }
        };

        this.startBtn = document.createElement('button');
        this.startBtn.textContent = 'Start';
        this.startBtn.style.cssText = `
            background: #5bf;
            border: none;
            color: #000;
            padding: 6px 12px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 3px;
        `;
        this.startBtn.onclick = () => this.startAgent();

        this.stopBtn = document.createElement('button');
        this.stopBtn.textContent = 'Stop';
        this.stopBtn.disabled = true;
        this.stopBtn.style.cssText = `
            background: #f55;
            border: none;
            color: #fff;
            padding: 6px 12px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 3px;
        `;
        this.stopBtn.onclick = () => this.stopAgent();

        goalRow.appendChild(this.goalInput);
        goalRow.appendChild(this.startBtn);
        goalRow.appendChild(this.stopBtn);

        // Message input row
        const messageRow = document.createElement('div');
        messageRow.style.cssText = `display: flex; gap: 6px;`;

        this.messageInput = document.createElement('input');
        this.messageInput.type = 'text';
        this.messageInput.placeholder = 'Send message to agent...';
        this.messageInput.style.cssText = `
            flex: 1;
            background: #111;
            border: 1px solid #5bf;
            color: #fff;
            padding: 6px 8px;
            font-family: inherit;
            font-size: 11px;
            border-radius: 3px;
        `;
        this.messageInput.onkeydown = (e) => {
            if (e.key === 'Enter') this.sendMessage();
        };

        const sendBtn = document.createElement('button');
        sendBtn.textContent = 'Send';
        sendBtn.style.cssText = `
            background: #5bf;
            border: none;
            color: #000;
            padding: 6px 12px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 3px;
        `;
        sendBtn.onclick = () => this.sendMessage();

        messageRow.appendChild(this.messageInput);
        messageRow.appendChild(sendBtn);

        // Log header
        const logHeader = document.createElement('div');
        logHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 4px;
        `;
        logHeader.innerHTML = `
            <span style="color: #888; font-size: 10px;">ACTION LOG</span>
        `;

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = `
            background: none;
            border: 1px solid #666;
            color: #888;
            padding: 2px 8px;
            cursor: pointer;
            font-size: 10px;
            border-radius: 3px;
        `;
        clearBtn.onclick = () => this.clearLog();
        logHeader.appendChild(clearBtn);

        // Log container
        this.logContainer = document.createElement('div');
        this.logContainer.style.cssText = `
            flex: 1;
            min-height: 200px;
            max-height: 300px;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid #333;
            border-radius: 4px;
            overflow-y: auto;
            padding: 4px;
        `;
        this.logContainer.innerHTML = '<div style="color: #666; font-style: italic; padding: 10px;">No activity yet</div>';

        // Assemble content
        content.appendChild(statusRow);
        content.appendChild(goalRow);
        content.appendChild(messageRow);
        content.appendChild(logHeader);
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

    private startAgent(): void {
        const goal = this.goalInput?.value.trim();
        if (!goal) {
            alert('Please enter a goal for the agent');
            return;
        }
        // Update currentGoal so sendState() uses the correct goal in world.md
        this.setGoal(goal);
        this.send({ type: 'start', goal });
    }

    private stopAgent(): void {
        this.send({ type: 'stop' });
    }

    private sendMessage(): void {
        const message = this.messageInput?.value.trim();
        if (!message) return;

        this.send({ type: 'send', message });
        if (this.messageInput) {
            this.messageInput.value = '';
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
