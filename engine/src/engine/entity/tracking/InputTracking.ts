import Player from '#/engine/entity/Player.js';
import EnableTracking from '#/network/server/model/EnableTracking.js';
import FinishTracking from '#/network/server/model/FinishTracking.js';
import World from '#/engine/World.js';
import InputTrackingEvent from '#/engine/entity/tracking/InputEvent.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import LoggerEventType from '#/server/logger/LoggerEventType.js';
import Environment from '#/util/Environment.js';

export default class InputTracking {
    // How many ticks between tracking sessions:
    private static readonly TRACKING_RATE: number = 200;  // 120 seconds
    // How many ticks the tracking is enabled for:
    private static readonly TRACKING_TIME: number = 150;  // 90 seconds
    // How many ticks to allow for the last client report:
    private static readonly FINAL_REPORT_TIME_LEEWAY: number = 16;  // ~10 seconds

    private readonly player: Player;

    enabled: boolean = false;
    hasSeenReport: boolean = false;;
    waitingForLastReport: boolean = false;
    endTrackingAt: number = this.calculateTrackingEnd();
    recordedEvents: InputTrackingEvent[] = [];
    recordedEventCount: number = 0;
    recordedEventsSizeTotal: number = 0;

    constructor(player: Player) {
        this.player = player;
    }

    private calculateTrackingEnd(): number {
        return World.currentTick + (InputTracking.TRACKING_RATE + this.offset(15));
    }

    process(): void {
        // if tracking finished and waiting for client to send back the report up to 15s.
        if (this.waitingForLastReport) {
            if (this.endTrackingAt + InputTracking.FINAL_REPORT_TIME_LEEWAY > World.currentTick) {
                this.submitEvents();
            }
            return;
        }
        // if current tracking dont do anything.
        if (this.endTrackingAt > World.currentTick) {
            return;
        }
        // if need to start tracking.
        if (this.endTrackingAt <= this.calculateTrackingEnd() && !this.enabled) {
            this.enable();
            return;
        }
        this.disable();
    }

    enable(): void {
        if (this.enabled) {
            return;
        }
        this.enabled = true;
        // Set the tick count at which we will end tracking:
        this.endTrackingAt = World.currentTick + InputTracking.TRACKING_TIME;
        // Notify the client
        this.player.write(new EnableTracking());
    }

    disable(): void {
        if (!this.enabled) {
            return;
        }
        this.enabled = false;
        this.endTrackingAt = World.currentTick + (InputTracking.TRACKING_RATE + this.offset(15));
        this.player.write(new FinishTracking());
        if (!this.waitingForLastReport) {
            // wait up to an amount of time for the client to send us the last batch of data.
            this.waitingForLastReport = true;
        }
    }

    isActive(): boolean {
        return this.enabled || this.waitingForLastReport;
    }

    /**
     * Whether the player should submit their detailed tracking events to the
     * server. Activated by either the per-player flag, or global env.
     */
    shouldSubmitTrackingDetails(): boolean {
        return this.player.submitInput || Environment.NODE_SUBMIT_INPUT;
    }

    record(rawData: Uint8Array): void {
        this.recordedEventsSizeTotal += rawData.length;
        this.recordedEvents.push(new InputTrackingEvent(rawData, this.recordedEventCount++, this.player.coord));
    }

    /**
     * Submit recorded events to the World server.
     * If there are no events seen, player will be kicked.
     * Otherwise, if we are actually recording, submit tracking.
     */
    submitEvents(): void {
        if (this.hasSeenReport) {
            // Have events to be submitted
            if (this.shouldSubmitTrackingDetails()) {
                World.submitInputTracking(
                    this.player.username, 
                    this.player instanceof NetworkPlayer ? this.player.client.uuid : 'headless', 
                    this.recordedEvents,
                );
            }
        } else if (!Environment.NODE_DEBUG) {
            // this means that:
            // 1: the player is trying to avoid afk timer.
            // 2: the player is on a very slow connection and the report packet never came in.
            this.player.addSessionLog(LoggerEventType.ENGINE, 'Client did not submit an input tracking report');
            this.player.requestIdleLogout = true;
        }
        // This finalizes the tracking session, so reset initial state.
        this.waitingForLastReport = false;
        this.recordedEvents = [];
        this.recordedEventCount = 0;
        this.recordedEventsSizeTotal = 0;
        this.hasSeenReport = false;
    }

    offset(n: number): number {
        return Math.floor(Math.random() * (n - (-n) + 1)) + (-n);
    }
}