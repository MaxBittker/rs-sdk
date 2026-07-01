// Gateway-specific message protocol types
// Re-exports common types from sdk/types for convenience

// Re-export all SDK types for backwards compatibility
export * from '../../sdk/types';

// Import types needed for message definitions
import type { BotWorldState, BotAction, ActionResult } from '../../sdk/types';

// ============ Gateway Message Types ============

// Messages from Bot Client → Gateway
export interface BotClientMessage {
    type: 'state' | 'actionResult' | 'setGoal' | 'connected' | 'screenshot_response';
    state?: BotWorldState;
    formattedState?: string;
    result?: ActionResult;
    actionId?: string;  // Echo back for correlation
    goal?: string;
    clientId?: string;
    username?: string;
    password?: string;
    dataUrl?: string;       // For screenshot_response
    screenshotId?: string;  // For screenshot_response correlation
    maxMessageLength?: number;  // Server-configured chat cap (in 'connected'), relayed to SDKs
}

// Messages from Gateway → Bot Client
export interface SyncToBotMessage {
    type: 'action' | 'thinking' | 'error' | 'status' | 'screenshot_request' | 'save_and_disconnect';
    action?: BotAction;
    actionId?: string;  // For correlation
    thinking?: string;
    error?: string;
    status?: string;
    screenshotId?: string;  // For screenshot_request correlation
    reason?: string;  // For save_and_disconnect - explains why session is being replaced
}

// SDK connection mode
export type SDKConnectionMode = 'control' | 'observe';

// Messages from SDK → Gateway
export interface SDKMessage {
    type: 'sdk_connect' | 'sdk_action' | 'sdk_screenshot_request';
    username: string;
    password?: string;  // Required in production mode
    clientId?: string;
    mode?: SDKConnectionMode;  // Connection mode: 'control' (default) or 'observe'
    actionId?: string;
    action?: BotAction;
    screenshotId?: string;  // For screenshot request correlation
}

// Messages from Gateway → SDK
export interface SyncToSDKMessage {
    type: 'sdk_connected' | 'sdk_state' | 'sdk_action_result' | 'sdk_error' | 'sdk_screenshot_response' | 'sdk_info';
    success?: boolean;
    state?: BotWorldState;
    stateReceivedAt?: number;      // Timestamp when gateway received state from bot (ms since epoch)
    actionId?: string;
    result?: ActionResult;
    error?: string;
    screenshotId?: string;  // For screenshot response correlation
    dataUrl?: string;       // Screenshot data as data URL (image/png;base64,...)
    mode?: SDKConnectionMode;      // Connection mode (in sdk_connected response)
    otherControllers?: number;     // Number of other controllers (in sdk_connected response)
    message?: string;              // Info message (in sdk_info)
    maxMessageLength?: number;     // Server-configured chat cap (in sdk_connected / sdk_info)
}
