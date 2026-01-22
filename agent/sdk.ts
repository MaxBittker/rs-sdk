// Bot SDK - Plumbing Layer
// Low-level WebSocket API that maps 1:1 to the action protocol
// Actions resolve when game ACKNOWLEDGES them (not when effects complete)

import type {
    BotWorldState,
    BotAction,
    ActionResult,
    SkillState,
    InventoryItem,
    NearbyNpc,
    NearbyLoc,
    GroundItem,
    DialogState,
    SyncToSDKMessage
} from './types';

export interface SDKConfig {
    botUsername: string;
    host?: string;           // Default: 'localhost'
    port?: number;           // Default: 7780
    actionTimeout?: number;  // Default: 30000ms
}

interface PendingAction {
    resolve: (result: ActionResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export class BotSDK {
    private config: Required<SDKConfig>;
    private ws: WebSocket | null = null;
    private state: BotWorldState | null = null;
    private pendingActions = new Map<string, PendingAction>();
    private stateListeners = new Set<(state: BotWorldState) => void>();
    private connectPromise: Promise<void> | null = null;
    private sdkClientId: string;

    constructor(config: SDKConfig) {
        this.config = {
            botUsername: config.botUsername,
            host: config.host || 'localhost',
            port: config.port || 7780,
            actionTimeout: config.actionTimeout || 30000
        };
        this.sdkClientId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // ============ Connection ============

    async connect(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        if (this.connectPromise) {
            return this.connectPromise;
        }

        this.connectPromise = new Promise((resolve, reject) => {
            const url = `ws://${this.config.host}:${this.config.port}`;
            this.ws = new WebSocket(url);

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
                this.ws?.close();
            }, 10000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                // Send SDK connect message
                this.send({
                    type: 'sdk_connect',
                    username: this.config.botUsername,
                    clientId: this.sdkClientId
                });
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = () => {
                this.connectPromise = null;
                // Reject any pending actions
                for (const [actionId, pending] of this.pendingActions) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error('Connection closed'));
                }
                this.pendingActions.clear();
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                reject(new Error('WebSocket error'));
            };

            // Wait for sdk_connected message
            const checkConnected = (event: MessageEvent) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'sdk_connected') {
                        this.ws?.removeEventListener('message', checkConnected);
                        resolve();
                    }
                } catch {}
            };
            this.ws.addEventListener('message', checkConnected);
        });

        return this.connectPromise;
    }

    async disconnect(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectPromise = null;
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    // ============ State Access (Synchronous) ============

    getState(): BotWorldState | null {
        return this.state;
    }

    getSkill(name: string): SkillState | null {
        if (!this.state) return null;
        return this.state.skills.find(s =>
            s.name.toLowerCase() === name.toLowerCase()
        ) || null;
    }

    getInventoryItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.inventory.find(i => i.slot === slot) || null;
    }

    findInventoryItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.inventory.find(i => regex.test(i.name)) || null;
    }

    getInventory(): InventoryItem[] {
        return this.state?.inventory || [];
    }

    getNearbyNpc(index: number): NearbyNpc | null {
        if (!this.state) return null;
        return this.state.nearbyNpcs.find(n => n.index === index) || null;
    }

    findNearbyNpc(pattern: string | RegExp): NearbyNpc | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.nearbyNpcs.find(n => regex.test(n.name)) || null;
    }

    getNearbyNpcs(): NearbyNpc[] {
        return this.state?.nearbyNpcs || [];
    }

    getNearbyLoc(x: number, z: number, id: number): NearbyLoc | null {
        if (!this.state) return null;
        return this.state.nearbyLocs.find(l =>
            l.x === x && l.z === z && l.id === id
        ) || null;
    }

    findNearbyLoc(pattern: string | RegExp): NearbyLoc | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.nearbyLocs.find(l => regex.test(l.name)) || null;
    }

    getNearbyLocs(): NearbyLoc[] {
        return this.state?.nearbyLocs || [];
    }

    findGroundItem(pattern: string | RegExp): GroundItem | null {
        if (!this.state) return null;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return this.state.groundItems.find(i => regex.test(i.name)) || null;
    }

    getGroundItems(): GroundItem[] {
        return this.state?.groundItems || [];
    }

    getDialog(): DialogState | null {
        return this.state?.dialog || null;
    }

    // ============ State Subscriptions ============

    onStateUpdate(listener: (state: BotWorldState) => void): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    // ============ Plumbing: Raw Actions ============
    // These resolve when the game ACKNOWLEDGES the action (fast)

    private async sendAction(action: BotAction): Promise<ActionResult> {
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingActions.delete(actionId);
                reject(new Error(`Action timed out: ${action.type}`));
            }, this.config.actionTimeout);

            this.pendingActions.set(actionId, { resolve, reject, timeout });

            this.send({
                type: 'sdk_action',
                username: this.config.botUsername,
                actionId,
                action
            });
        });
    }

    async sendWalk(x: number, z: number, running: boolean = false): Promise<ActionResult> {
        return this.sendAction({
            type: 'walkTo',
            x,
            z,
            running,
            reason: 'SDK'
        });
    }

    async sendInteractLoc(x: number, z: number, locId: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'interactLoc',
            x,
            z,
            locId,
            optionIndex: option,
            reason: 'SDK'
        });
    }

    async sendInteractNpc(npcIndex: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'interactNpc',
            npcIndex,
            optionIndex: option,
            reason: 'SDK'
        });
    }

    async sendTalkToNpc(npcIndex: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'talkToNpc',
            npcIndex,
            reason: 'SDK'
        });
    }

    async sendPickup(x: number, z: number, itemId: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'pickupItem',
            x,
            z,
            itemId,
            reason: 'SDK'
        });
    }

    async sendUseItem(slot: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'useInventoryItem',
            slot,
            optionIndex: option,
            reason: 'SDK'
        });
    }

    async sendDropItem(slot: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'dropItem',
            slot,
            reason: 'SDK'
        });
    }

    async sendUseItemOnItem(sourceSlot: number, targetSlot: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'useItemOnItem',
            sourceSlot,
            targetSlot,
            reason: 'SDK'
        });
    }

    async sendUseItemOnLoc(itemSlot: number, x: number, z: number, locId: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'useItemOnLoc',
            itemSlot,
            x,
            z,
            locId,
            reason: 'SDK'
        });
    }

    async sendClickDialog(option: number = 0): Promise<ActionResult> {
        return this.sendAction({
            type: 'clickDialogOption',
            optionIndex: option,
            reason: 'SDK'
        });
    }

    async sendClickInterface(option: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'clickInterfaceOption',
            optionIndex: option,
            reason: 'SDK'
        });
    }

    async sendClickInterfaceComponent(componentId: number, optionIndex: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'clickInterfaceComponent',
            componentId,
            optionIndex,
            reason: 'SDK'
        });
    }

    async sendAcceptCharacterDesign(): Promise<ActionResult> {
        return this.sendAction({
            type: 'acceptCharacterDesign',
            reason: 'SDK'
        });
    }

    async sendSkipTutorial(): Promise<ActionResult> {
        return this.sendAction({
            type: 'skipTutorial',
            reason: 'SDK'
        });
    }

    async sendShopBuy(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'shopBuy',
            slot,
            amount,
            reason: 'SDK'
        });
    }

    async sendShopSell(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'shopSell',
            slot,
            amount,
            reason: 'SDK'
        });
    }

    async sendCloseShop(): Promise<ActionResult> {
        return this.sendAction({
            type: 'closeShop',
            reason: 'SDK'
        });
    }

    async sendSetCombatStyle(style: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'setCombatStyle',
            style,
            reason: 'SDK'
        });
    }

    async sendSpellOnNpc(npcIndex: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'spellOnNpc',
            npcIndex,
            spellComponent,
            reason: 'SDK'
        });
    }

    async sendSpellOnItem(slot: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({
            type: 'spellOnItem',
            slot,
            spellComponent,
            reason: 'SDK'
        });
    }

    async sendSay(message: string): Promise<ActionResult> {
        return this.sendAction({
            type: 'say',
            message,
            reason: 'SDK'
        });
    }

    async sendWait(ticks: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'wait',
            ticks,
            reason: 'SDK'
        });
    }

    async sendBankDeposit(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'bankDeposit',
            slot,
            amount,
            reason: 'SDK'
        });
    }

    async sendBankWithdraw(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({
            type: 'bankWithdraw',
            slot,
            amount,
            reason: 'SDK'
        });
    }

    // ============ Plumbing: State Waiting ============

    async waitForCondition(
        predicate: (state: BotWorldState) => boolean,
        timeout: number = 30000
    ): Promise<BotWorldState> {
        // Check immediately
        if (this.state && predicate(this.state)) {
            return this.state;
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error('waitForCondition timed out'));
            }, timeout);

            const unsubscribe = this.onStateUpdate((state) => {
                if (predicate(state)) {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve(state);
                }
            });
        });
    }

    async waitForStateChange(timeout: number = 30000): Promise<BotWorldState> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error('waitForStateChange timed out'));
            }, timeout);

            const unsubscribe = this.onStateUpdate((state) => {
                clearTimeout(timeoutId);
                unsubscribe();
                resolve(state);
            });
        });
    }

    // ============ Internal ============

    private send(message: object) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    private handleMessage(data: string) {
        let message: SyncToSDKMessage;
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }

        if (message.type === 'sdk_state' && message.state) {
            this.state = message.state;
            for (const listener of this.stateListeners) {
                try {
                    listener(message.state);
                } catch (e) {
                    console.error('State listener error:', e);
                }
            }
        }

        if (message.type === 'sdk_action_result' && message.actionId) {
            const pending = this.pendingActions.get(message.actionId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingActions.delete(message.actionId);
                if (message.result) {
                    pending.resolve(message.result);
                } else {
                    pending.reject(new Error('No result in action response'));
                }
            }
        }

        if (message.type === 'sdk_error') {
            // If there's an actionId, reject that specific action
            if (message.actionId) {
                const pending = this.pendingActions.get(message.actionId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingActions.delete(message.actionId);
                    pending.reject(new Error(message.error || 'Unknown error'));
                }
            }
        }
    }
}
