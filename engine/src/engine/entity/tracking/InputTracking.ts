import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import Player from '#/engine/entity/Player.js';
import InputTrackingBlob from '#/engine/entity/tracking/InputEvent.js';
import World from '#/engine/World.js';
import EnableTracking from '#/network/server/model/game/EnableTracking.js';
import FinishTracking from '#/network/server/model/game/FinishTracking.js';
import { LoggerEventType } from '#/server/logger/LoggerEventType.js';
import Environment from '#/util/Environment.js';

export default class InputTracking {
    // How many ticks between tracking sessions
    private static readonly TRACKING_RATE: number = 200; // 120 seconds
    // How many ticks the tracking is enabled for
    private static readonly TRACKING_TIME: number = 150; // 90 seconds
    // How many ticks to allow for any remaining data from client
    private static readonly REMAINING_DATA_UPLOAD_LEEWAY: number = 16; // ~10 seconds

    private readonly player: Player;

    // Whether we have seen at least one input tracking report
    hasSeenReport: boolean = false;
    // Whether we are waiting for any remaining data to be sent from client
    waitingForRemainingData: boolean = false;

    // Whether we have enabled tracking
    enabled: boolean = false;

    // The World tick-count for when tracking should start
    startTrackingAt: number = this.nextScheduledTrackingStart();

    // The World tick-count for when tracking should end
    endTrackingAt: number = this.nextScheduledTrackingEnd();

    // List of recorded input 'blobs'
    recordedBlobs: InputTrackingBlob[] = [];
    // Number of bytes in total for all recorded blobs
    recordedBlobsSizeTotal: number = 0;

    constructor(player: Player) {
        this.player = player;
    }

    /**
     * Returns the tick number for when input tracking should start.
     */
    private nextScheduledTrackingStart(): number {
        return World.currentTick + InputTracking.TRACKING_RATE + this.offset(15);
    }

    /**
     * Returns the tick number for when input tracking should end.
     */
    private nextScheduledTrackingEnd(): number {
        return this.startTrackingAt + InputTracking.TRACKING_TIME;
    }

    /**
     * Whether we should start input tracking.
     */
    private shouldStartTracking(): boolean {
        return World.currentTick >= this.startTrackingAt;
    }

    /**
     * Whether we should end input tracking.
     */
    private shouldEndTracking(): boolean {
        return World.currentTick >= this.endTrackingAt;
    }

    /**
     * Called once per cycle for each player, it decides whether to enable
     * or disable input tracking, along with submitting events to the logger.
     */
    onCycle(): void {
        // if tracking has finished, then wait for client to send back the report up to 15s.
        // console.log('InputTracking.ts->onCycle(): state={active=%s, startAt=%d, endAt=%d, waiting=%d, recv=%d, worldTick=%d}', this.isActive(), this.startTrackingAt, this.endTrackingAt, this.waitingForRemainingData, this.recordedBlobsSizeTotal, World.currentTick);
        if (this.waitingForRemainingData) {
            if (this.endTrackingAt + InputTracking.REMAINING_DATA_UPLOAD_LEEWAY < World.currentTick) {
                this.submitEvents();
            }
            return;
        }
        // if we are currently tracking then do not do anything.
        if (this.shouldStartTracking() && !this.enabled) {
            this.enable();
            return;
        }
        if (this.shouldEndTracking() && this.enabled) {
            // otherwise, we are not supposed to be tracking, so disable now:
            this.disable();
            return;
        }
    }

    enable(): void {
        if (this.enabled) {
            return;
        }
        this.enabled = true;
        this.startTrackingAt = World.currentTick;  // enabled immediately
        this.endTrackingAt = this.nextScheduledTrackingEnd();  // at the next interval
        // Notify the client
        this.player.write(new EnableTracking());
    }

    disable(): void {
        if (!this.enabled) {
            return;
        }
        this.enabled = false;
        this.startTrackingAt = this.nextScheduledTrackingStart();  // at the next interval
        this.endTrackingAt = World.currentTick;  // disabled immediately
        // wait up to an amount of time for the client to send us the last batch of data.
        this.waitingForRemainingData = true;
        this.player.write(new FinishTracking());
    }

    isActive(): boolean {
        const withinTicks = World.currentTick >= this.startTrackingAt && World.currentTick <= this.endTrackingAt;
        return withinTicks || this.waitingForRemainingData;
    }

    /**
     * Whether the player should submit their detailed tracking events to the
     * server. Activated by either the per-player flag, or global env.
     */
    shouldSubmitTrackingDetails(): boolean {
        return this.player.submitInput || Environment.NODE_SUBMIT_INPUT;
    }

    record(rawData: Uint8Array): void {
        this.recordedBlobsSizeTotal += rawData.length;
        this.recordedBlobs.push(new InputTrackingBlob(rawData, this.recordedBlobs.length + 1, this.player.coord));
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
                World.submitInputTracking(this.player.username, this.player instanceof NetworkPlayer ? this.player.client.uuid : 'headless', this.recordedBlobs);
            }
        } else if (!Environment.NODE_DEBUG) {
            // this means that:
            // 1: the player is trying to avoid afk timer.
            // 2: the player is on a very slow connection and the report packet never came in.
            this.player.addSessionLog(LoggerEventType.ENGINE, 'Client did not submit an input tracking report');
            this.player.requestIdleLogout = true;
        }
        // This finalizes the tracking session, so reset initial state.
        this.waitingForRemainingData = false;
        this.recordedBlobs = [];
        this.recordedBlobsSizeTotal = 0;
        this.hasSeenReport = false;
    }

    offset(n: number): number {
        return Math.floor(Math.random() * (n - -n + 1)) + -n;
    }
}
