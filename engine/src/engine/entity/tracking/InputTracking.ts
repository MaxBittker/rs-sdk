import Player from '#/engine/entity/Player.js';
import EnableTracking from '#/network/server/model/EnableTracking.js';
import FinishTracking from '#/network/server/model/FinishTracking.js';
import World from '#/engine/World.js';
import ReportEvent from '#/engine/entity/tracking/ReportEvent.js';
import InputTrackingEvent from '#/engine/entity/tracking/InputEvent.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import LoggerEventType from '#/server/logger/LoggerEventType.js';
import { InputTrackingEventType } from '#/network/rs225/client/handler/EventTrackingHandler.js';

export default class InputTracking {
    private static readonly TRACKING_RATE: number = 200; // 2m track interval +offset. lower this to be more aggressive.
    private static readonly TRACKING_TIME: number = 150; // 90s to track from the client
    private static readonly REPORT_TIME: number = 8; // 5s for client to report

    private readonly player: Player;

    enabled: boolean = false;
    lastTrack: number = -1;
    waitingReport: boolean = false;
    lastReport: number = -1;
    recordedEvents: InputTrackingEvent[] = [];
    recordedEventCount: number = 0;

    constructor(player: Player) {
        this.player = player;
        this.lastTrack = World.currentTick + (InputTracking.TRACKING_RATE + this.offset(15));
    }

    process(): void {
        // if tracking finished and waiting for client to send back the report up to 15s.
        if (this.waitingReport && this.lastReport + InputTracking.REPORT_TIME <= World.currentTick) {
            this.report(ReportEvent.NO_REPORT);
            return;
        }
        // if current tracking dont do anything.
        if (this.lastTrack > World.currentTick) {
            return;
        }
        // if need to start tracking.
        if (this.lastTrack <= World.currentTick + (InputTracking.TRACKING_RATE + this.offset(15)) && !this.enabled) {
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
        // start tracking for 90s. it ends early if the client gives some input.
        this.lastTrack = World.currentTick + InputTracking.TRACKING_TIME;
        this.player.write(new EnableTracking());
    }

    disable(): void {
        if (!this.enabled) {
            return;
        }
        this.enabled = false;
        this.lastTrack = World.currentTick + (InputTracking.TRACKING_RATE + this.offset(15));
        this.player.write(new FinishTracking());
        if (!this.waitingReport) {
            // wait up to 15s for the client to send us the data.
            this.waitingReport = true;
            this.lastReport = World.currentTick;
        }
    }

    tracking(): boolean {
        return this.enabled || this.waitingReport;
    }

    record(type: InputTrackingEventType, delta: number, mouseX?: number, mouseY?: number, keyPress?: number): void {
        this.recordedEvents.push(new InputTrackingEvent(type, this.recordedEventCount++, delta, mouseX, mouseY, keyPress));
        this.report(ReportEvent.ACTIVE);
    }

    report(event: ReportEvent): void {
        if (!this.waitingReport) {
            return;
        }
        if (event === ReportEvent.NO_REPORT) {
            // this means that:
            // 1: the player is trying to avoid afk timer.
            // 2: the player is on a very slow connection and the report packet never came in.
            this.player.addSessionLog(LoggerEventType.ENGINE, 'Client did not submit an input tracking report');
            this.player.tryLogout = true;
            return;
        }
        // everything below means the player was active during this tracking.
        this.waitingReport = false;
        this.lastReport = -1;
        if (this.recordedEvents.length > 0) {
            World.submitInputTracking(
                this.player.username, 
                this.player instanceof NetworkPlayer ? this.player.client.uuid : 'headless', 
                this.player.coord, 
                this.recordedEvents);
            this.recordedEvents = [];
            this.recordedEventCount = 0;
        }
    }

    offset(n: number): number {
        return Math.floor(Math.random() * (n - (-n) + 1)) + (-n);
    }
}