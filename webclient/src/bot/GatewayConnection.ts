// GatewayConnection.ts - WebSocket connection to SDK gateway
// Handles connection, reconnection, message sending/receiving

import type { BotAction, BotWorldState } from './types.js';

export interface GatewayMessageHandler {
    onAction(action: BotAction, actionId: string | null): void;
    onScreenshotRequest(screenshotId?: string): void;
    onConnected(): void;
    onDisconnected(): void;
}

// Extract bot username from URL query params
function getBotUsername(): string {
    if (typeof window === 'undefined') return 'default';
    const params = new URLSearchParams(window.location.search);
    return params.get('bot') || 'default';
}

export class GatewayConnection {
    private ws: WebSocket | null = null;
    private reconnectTimer: number | null = null;
    private connected: boolean = false;
    private handler: GatewayMessageHandler;
    private botUsername: string;

    constructor(handler: GatewayMessageHandler) {
        this.handler = handler;
        this.botUsername = getBotUsername();
    }

    connect(): void {
        if (this.ws) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const url = `${protocol}//${host}/gateway`;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.connected = true;
                console.log(`[GatewayConnection] Connected, registering as '${this.botUsername}'`);

                // Register as bot with gateway
                this.send({
                    type: 'connected',
                    username: this.botUsername,
                    clientId: `${this.botUsername}-${Date.now()}`
                });

                this.handler.onConnected();
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);
                } catch (e) {
                    console.error('[GatewayConnection] Failed to parse message:', e);
                }
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.ws = null;
                this.handler.onDisconnected();

                // Reconnect after delay
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
            };

            this.ws.onerror = () => {
                // Will trigger onclose
            };
        } catch (e) {
            console.error('[GatewayConnection] Failed to connect:', e);
        }
    }

    disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected;
    }

    send(msg: any): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    sendState(state: BotWorldState, formattedState: string): void {
        if (!this.connected) return;
        this.send({
            type: 'state',
            state,
            formattedState
        });
    }

    sendActionResult(actionId: string, result: { success: boolean; message: string; data?: any }): void {
        this.send({
            type: 'actionResult',
            actionId,
            result
        });
    }

    sendScreenshot(dataUrl: string, screenshotId?: string): void {
        this.send({
            type: 'screenshot_response',
            dataUrl,
            screenshotId
        });
    }

    private handleMessage(msg: any): void {
        if (msg.type === 'action') {
            console.log(`[GatewayConnection] Received action: ${msg.action?.type} (${msg.actionId})`);
            this.handler.onAction(msg.action, msg.actionId || null);
        } else if (msg.type === 'status') {
            console.log(`[GatewayConnection] Gateway status: ${msg.status}`);
        } else if (msg.type === 'screenshot_request') {
            this.handler.onScreenshotRequest(msg.screenshotId);
        }
    }
}
