import InputTracking from '#/client/InputTracking.js';
import { CanvasEnabledKeys, KeyCodes } from '#/client/KeyCodes.js';
import MobileKeyboard from '#/client/MobileKeyboard.js';

import { canvas, canvas2d } from '#/graphics/Canvas.js';
import Pix3D from '#/graphics/Pix3D.js';
import PixMap from '#/graphics/PixMap.js';

import { sleep } from '#/util/JsUtil.js';

export default abstract class GameShell {
    protected state: number = 0;
    protected deltime: number = 20;
    protected mindel: number = 1;
    protected otim: number[] = new Array(10);
    protected fps: number = 0;
    protected debug: boolean = false;
    protected drawArea: PixMap | null = null;
    protected redrawScreen: boolean = true;
    protected hasFocus: boolean = true;

    public idleCycles: number = performance.now();
    public mouseButton: number = 0;
    public mouseX: number = -1;
    public mouseY: number = -1;
    protected nextMouseClickButton: number = 0;
    protected nextMouseClickX: number = -1;
    protected nextMouseClickY: number = -1;
    public mouseClickButton: number = 0;
    public mouseClickX: number = -1;
    public mouseClickY: number = -1;
    protected nextMouseClickTime: number = 0;
    public mouseClickTime: number = 0;

    public actionKey: number[] = [];
    protected keyQueue: number[] = [];
    protected keyQueueReadPos: number = 0;
    protected keyQueueWritePos: number = 0;

    // custom
    protected slowestMS: number = 0.0;
    protected averageMS: number[] = [];
    protected averageIndexMS: number = 0;
    protected resizeToFit: boolean = false;
    protected tfps: number = 50;
    protected fpos: number = 0;
    protected frameTime: number[] = [];
    protected ingame: boolean = false;

    // touch controls
    private startedInViewport: boolean = false;
    private startedInTabArea: boolean = false;
    private startedInChatScroll: boolean = false;
    private ttime: number = -1;
    // start
    private sx: number = 0;
    private sy: number = 0;
    // mouse
    private mx: number = 0;
    private my: number = 0;
    // new
    private nx: number = 0;
    private ny: number = 0;
    private dragging: boolean = false;
    private panning: boolean = false;

    abstract getTitleScreenState(): number;
    abstract isChatBackInputOpen(): boolean;
    abstract isShowSocialInput(): boolean;
    abstract getChatInterfaceId(): number;
    abstract getViewportInterfaceId(): number;
    abstract getReportAbuseInterfaceId(): number; // custom: report abuse input on mobile

    protected async load() {}
    protected async update() {}
    protected async draw() {}
    protected refresh() {}

    constructor(resizetoFit: boolean = false) {
        canvas.tabIndex = -1;
        canvas2d.fillStyle = 'black';
        canvas2d.fillRect(0, 0, canvas.width, canvas.height);

        this.resizeToFit = resizetoFit;
        if (this.resizeToFit) {
            this.resize(window.innerWidth, window.innerHeight);
        } else {
            this.resize(canvas.width, canvas.height);
        }
    }

    protected get width(): number {
        return canvas.width;
    }

    protected get height(): number {
        return canvas.height;
    }

    protected resize(width: number, height: number) {
        canvas.width = width;
        canvas.height = height;
        this.drawArea = new PixMap(width, height);
        Pix3D.init2D();
    }

    async run() {
        canvas.addEventListener(
            'resize',
            (): void => {
                if (this.resizeToFit) {
                    this.resize(window.innerWidth, window.innerHeight);
                }
            },
            false
        );

        canvas.onfocus = this.onfocus.bind(this);
        canvas.onblur = this.onblur.bind(this);

        canvas.onkeydown = this.onkeydown.bind(this);
        canvas.onkeyup = this.onkeyup.bind(this);

        canvas.onmousedown = this.onmousedown.bind(this);
        canvas.onpointerdown = this.onpointerdown.bind(this);
        canvas.onmouseup = this.onmouseup.bind(this);
        canvas.onpointerup = this.onpointerup.bind(this);
        canvas.onpointerenter = this.onpointerenter.bind(this);
        canvas.onpointerleave = this.onpointerleave.bind(this);
        canvas.onpointermove = this.onpointermove.bind(this);

        if (this.isTouchDevice) {
            if (this.hasTouchEvents) {
                canvas.ontouchstart = this.ontouchstart.bind(this);
            } else {
                // edge case: we can't control canvas touch action behavior to allow zooming
                // device has a touch screen but browser does not expose touchstart
                canvas.style.touchAction = 'none';
            }
        }

        // Preventing mouse events from bubbling up to the context menu in the browser for our canvas.
        // This may need to be hooked up to our own context menu in the future.
        canvas.oncontextmenu = (e: MouseEvent): void => {
            e.preventDefault();
        };

        window.oncontextmenu = (e: MouseEvent): void => {
            e.preventDefault();
        };

        await this.drawProgress(0, 'Loading...');
        await this.load();

        let ntime: number = 0;
        let opos: number = 0;
        let ratio: number = 256;
        let delta: number = 1;
        let count: number = 0;

        for (let i: number = 0; i < 10; i++) {
            this.otim[i] = performance.now();
        }

        while (this.state >= 0) {
            if (this.state > 0) {
                this.state--;

                if (this.state === 0) {
                    this.shutdown();
                    return;
                }
            }

            const lastRatio: number = ratio;
            const lastDelta: number = delta;

            ratio = 300;
            delta = 1;

            ntime = performance.now();

            const otim: number = this.otim[opos];
            if (otim === 0) {
                ratio = lastRatio;
                delta = lastDelta;
            } else if (ntime > otim) {
                ratio = ((this.deltime * 2560) / (ntime - otim)) | 0;
            }

            if (ratio < 25) {
                ratio = 25;
            } else if (ratio > 256) {
                ratio = 256;
                delta = (this.deltime - (ntime - otim) / 10) | 0;
            }

            this.otim[opos] = ntime;
            opos = (opos + 1) % 10;

            if (delta > 1) {
                for (let i: number = 0; i < 10; i++) {
                    if (this.otim[i] !== 0) {
                        this.otim[i] += delta;
                    }
                }
            }

            if (delta < this.mindel) {
                delta = this.mindel;
            }

            await sleep(delta);

            while (count < 256) {
                this.mouseClickButton = this.nextMouseClickButton;
                this.mouseClickX = this.nextMouseClickX;
                this.mouseClickY = this.nextMouseClickY;
                this.mouseClickTime = this.nextMouseClickTime;
                this.nextMouseClickButton = 0;

                await this.update();

                // this.keyQueueReadPos = this.keyQueueWritePos;
                count += ratio;
            }
            count &= 0xff;

            if (this.deltime > 0) {
                this.fps = ((ratio * 1000) / (this.deltime * 256)) | 0;
            }

            const start: number = performance.now();

            await this.draw();

            if (this.isMobile) {
                MobileKeyboard.draw();
            }

            this.frameTime[this.fpos] = (performance.now() - start) / 1000;
            this.fpos = (this.fpos + 1) % this.frameTime.length;

            // this is custom for targeting specific fps (on mobile).
            if (this.tfps < 50) {
                const tfps: number = 1000 / this.tfps - (performance.now() - ntime);
                if (tfps > 0) {
                    await sleep(tfps);
                }
            }

            if (this.debug) {
                console.log('ntime:' + ntime);
                for (let i = 0; i < 10; i++) {
                    let o = (opos - i - 1 + 20) % 10;
                    console.log('otim' + o + ':' + this.otim[o]);
                }
                console.log('fps:' + this.fps + ' ratio:' + ratio + ' count:' + count);
                console.log('del:' + delta + ' deltime:' + this.deltime + ' mindel:' + this.mindel);
                console.log('opos:' + opos);
                this.debug = false;
            }
        }

        if (this.state === -1) {
            this.shutdown();
        }
    }

    protected shutdown() {
        this.state = -2;
    }

    protected setFramerate(rate: number) {
        this.deltime = (1000 / rate) | 0;
    }

    protected setTargetedFramerate(rate: number) {
        this.tfps = Math.max(Math.min(50, rate | 0), 0);
    }

    protected start() {
        if (this.state >= 0) {
            this.state = 0;
        }
    }

    protected stop() {
        if (this.state >= 0) {
            this.state = (4000 / this.deltime) | 0;
        }
    }

    protected async drawProgress(progress: number, message: string): Promise<void> {
        const width: number = this.width;
        const height: number = this.height;

        if (this.redrawScreen) {
            canvas2d.fillStyle = 'black';
            canvas2d.fillRect(0, 0, width, height);
            this.redrawScreen = false;
        }

        const y: number = height / 2 - 18;

        // draw full progress bar
        canvas2d.strokeStyle = 'rgb(140, 17, 17)';
        canvas2d.strokeRect(((width / 2) | 0) - 152, y, 304, 34);
        canvas2d.fillStyle = 'rgb(140, 17, 17)';
        canvas2d.fillRect(((width / 2) | 0) - 150, y + 2, progress * 3, 30);

        // cover up progress bar
        canvas2d.fillStyle = 'black';
        canvas2d.fillRect(((width / 2) | 0) - 150 + progress * 3, y + 2, 300 - progress * 3, 30);

        // draw text
        canvas2d.font = 'bold 13px helvetica, sans-serif';
        canvas2d.textAlign = 'center';
        canvas2d.fillStyle = 'white';
        canvas2d.fillText(message, (width / 2) | 0, y + 22);

        await sleep(5); // return a slice of time to the main loop so it can update the progress bar
    }

    protected get ms(): number {
        const length: number = this.frameTime.length;
        let ft: number = 0;
        for (let index: number = 0; index < length; index++) {
            ft += this.frameTime[index];
        }
        const ms: number = (ft / length) * 1000;
        if (ms > this.slowestMS) {
            this.slowestMS = ms;
        }
        this.averageMS[this.averageIndexMS] = ms;
        this.averageIndexMS = (this.averageIndexMS + 1) % 250; // 250 circular limit
        return ms;
    }

    protected get msAvg(): number {
        return this.averageMS.reduce((accumulator: number, currentValue: number): number => accumulator + currentValue, 0) / 250; // 250 circular limit
    }

    // ----

    private onmousedown(e: MouseEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        this.idleCycles = performance.now();
        this.nextMouseClickX = x;
        this.nextMouseClickY = y;
        this.nextMouseClickTime = performance.now();

        // custom: down event comes before and potentially without move event
        this.mouseX = x;
        this.mouseY = y;

        if (e.button === 2) {
            this.nextMouseClickButton = 2;
            this.mouseButton = 2;
        } else {
            this.nextMouseClickButton = 1;
            this.mouseButton = 1;
        }

        if (InputTracking.enabled) {
            InputTracking.mousePressed(x, y, e.button, 'mouse');
        }
    }

    private onpointerdown(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        if (MobileKeyboard.isWithinCanvasKeyboard(x, y) && !this.exceedsGrabThreshold(20)) {
            MobileKeyboard.captureMouseDown(x, y);
            return;
        }

        if (e.pointerType !== 'mouse') {
            // custom: touchscreen support
            // we don't acknowledge the first press as a click, instead we interpret the user's gesture on release

            this.idleCycles = performance.now();
            this.nextMouseClickX = -1;
            this.nextMouseClickY = -1;
            this.nextMouseClickButton = 0;
            this.mouseX = x;
            this.mouseY = y;
            this.mouseButton = 0;

            this.sx = this.nx = this.mx = e.screenX | 0;
            this.sy = this.ny = this.my = e.screenY | 0;
            this.ttime = e.timeStamp;

            this.startedInViewport = this.insideViewportArea();
            this.startedInTabArea = this.insideTabArea();
            this.startedInChatScroll = this.insideChatScrollArea();
        }
    }

    private onmouseup(e: MouseEvent) {
        const { x, y } = this.getMousePos(e);

        this.idleCycles = performance.now();
        this.mouseButton = 0;

        if (InputTracking.enabled) {
            InputTracking.mouseReleased(e.button, 'mouse');
        }

        // custom: up event comes before and potentially without move event
        this.mouseX = x;
        this.mouseY = y;

        // custom: moving off-canvas may have a stuck mouse event
        this.nextMouseClickX = -1;
        this.nextMouseClickY = -1;
        this.nextMouseClickButton = 0;
    }

    private onpointerup(e: PointerEvent) {
        const { x, y } = this.getMousePos(e);

        if (MobileKeyboard.isWithinCanvasKeyboard(x, y) && !this.exceedsGrabThreshold(20)) {
            MobileKeyboard.captureMouseUp(x, y);
            return;
        }

        if (e.pointerType !== 'mouse') {
            // custom: touchscreen support
            // we don't acknowledge the first press as a click, instead we interpret the user's gesture on release

            this.idleCycles = performance.now();
            this.mouseX = x;
            this.mouseY = y;

            if (this.dragging) {
                this.dragging = false;

                this.nextMouseClickX = -1;
                this.nextMouseClickY = -1;
                this.nextMouseClickButton = 0;
                this.mouseButton = 0;

                if (InputTracking.enabled) {
                    InputTracking.mouseReleased(0, e.pointerType);
                }
            } else if (this.panning) {
                // ignore up events if the player was moving the camera in the viewport
                this.panning = false;

                // release all arrow keys
                this.actionKey[1] = 0;
                this.actionKey[2] = 0;
                this.actionKey[3] = 0;
                this.actionKey[4] = 0;
                return;
            } else {
                if (!MobileKeyboard.isDisplayed() && this.insideMobileInputArea()) {
                    // show keyboard when tapping in an input area
                    MobileKeyboard.show();
                } else if (MobileKeyboard.isDisplayed() && !MobileKeyboard.isWithinCanvasKeyboard(x, y)) {
                    // hide keyboard when tapping outside of an input area
                    MobileKeyboard.hide();
                    this.refresh();
                }

                // within click threshold: activate mouse button
                this.nextMouseClickX = x;
                this.nextMouseClickY = y;
                this.nextMouseClickTime = performance.now();

                const longPress: boolean = e.timeStamp >= this.ttime + 500;
                if (longPress) {
                    this.nextMouseClickButton = 2;
                    this.mouseButton = 2;
                } else {
                    this.nextMouseClickButton = 1;
                    this.mouseButton = 1;
                }

                if (InputTracking.enabled) {
                    InputTracking.mousePressed(x, y, longPress ? 2 : 0, e.pointerType);
                }

                // release after a client cycle has passed
                setTimeout(() => {
                    this.nextMouseClickX = -1;
                    this.nextMouseClickY = -1;
                    this.nextMouseClickButton = 0;
                    this.mouseButton = 0;

                    if (InputTracking.enabled) {
                        InputTracking.mouseReleased(longPress ? 2 : 0, e.pointerType);
                    }
                }, 40);
            }
        }
    }

    private onpointerenter(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        if (e.pointerType === 'mouse') {
            this.mouseX = x;
            this.mouseY = y;

            if (InputTracking.enabled) {
                InputTracking.mouseEntered();
            }

            // custom: moving off-canvas may have a stuck mouse event
            this.nextMouseClickX = -1;
            this.nextMouseClickY = -1;
            this.nextMouseClickButton = 0;
            this.mouseButton = 0;
        } else {
            // custom: touchscreen support

            this.idleCycles = performance.now();
            this.nextMouseClickX = -1;
            this.nextMouseClickY = -1;
            this.nextMouseClickButton = 0;
            this.mouseX = x;
            this.mouseY = y;
            this.mouseButton = 0;

            this.sx = this.nx = this.mx = e.screenX | 0;
            this.sy = this.ny = this.my = e.screenY | 0;
            this.ttime = e.timeStamp;

            this.startedInViewport = this.insideViewportArea();
            this.startedInTabArea = this.insideTabArea();
        }
    }

    private onpointerleave(e: PointerEvent) {
        if (e.pointerType === 'mouse') {
            this.idleCycles = performance.now();
            this.mouseX = -1;
            this.mouseY = -1;

            if (InputTracking.enabled) {
                InputTracking.mouseExited();
            }

            // custom: moving off-canvas may have a stuck mouse event
            this.nextMouseClickX = -1;
            this.nextMouseClickY = -1;
            this.nextMouseClickButton = 0;
            this.mouseButton = 0;
        } else {
            // custom: touchscreen support
            this.idleCycles = performance.now();

            // release all arrow keys
            this.actionKey[1] = 0;
            this.actionKey[2] = 0;
            this.actionKey[3] = 0;
            this.actionKey[4] = 0;
        }
    }

    private onpointermove(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        const { x, y } = this.getMousePos(e);

        if (e.pointerType === 'mouse') {
            this.idleCycles = performance.now();
            this.mouseX = x;
            this.mouseY = y;

            if (InputTracking.enabled) {
                InputTracking.mouseMoved(x, y, e.pointerType);
            }
        } else {
            // custom: touchscreen support
            this.idleCycles = performance.now();
            this.mouseX = x;
            this.mouseY = y;

            this.nx = e.screenX | 0;
            this.ny = e.screenY | 0;

            if (this.dragging) {
                // no-op
            } else if (MobileKeyboard.isWithinCanvasKeyboard(x, y) && this.exceedsGrabThreshold(20)) {
                MobileKeyboard.notifyTouchMove(x, y);
            } else if (this.startedInViewport && this.getViewportInterfaceId() === -1 && this.exceedsGrabThreshold(20)) {
                // moving camera
                this.panning = true;

                // emulate arrow keys:
                if (this.mx - this.nx > 0) {
                    // right
                    this.actionKey[1] = 0;
                    this.actionKey[2] = 1;
                } else if (this.mx - this.nx < 0) {
                    // left
                    this.actionKey[1] = 1;
                    this.actionKey[2] = 0;
                }

                if (this.my - this.ny > 0) {
                    // down
                    this.actionKey[3] = 0;
                    this.actionKey[4] = 1;
                } else if (this.my - this.ny < 0) {
                    // up
                    this.actionKey[3] = 1;
                    this.actionKey[4] = 0;
                }
            } else if (this.startedInTabArea || this.startedInChatScroll || this.getViewportInterfaceId() !== -1) {
                if (!this.dragging && this.exceedsGrabThreshold(5)) {
                    this.dragging = true;

                    this.nextMouseClickX = x;
                    this.nextMouseClickY = y;
                    this.nextMouseClickButton = 1;
                    this.mouseButton = 1;
                }
            }

            this.mx = this.nx;
            this.my = this.ny;
        }
    }

    // all mouse logic is done above, this is for controlling canvas behaviors
    private ontouchstart(e: TouchEvent) {
        if (e.touches.length < 2 || this.dragging) {
            // 1 touch - prevent natural browser behavior
            // 2+ touches - allow scrolling/zooming
            e.preventDefault();
        }
    }

    private onkeydown(e: KeyboardEvent) {
        this.idleCycles = performance.now();

        const keyCode = KeyCodes.get(e.key);
        if (!keyCode || (e.code.length === 0 && !e.isTrusted)) {
            return;
        }

        let ch: number = keyCode.ch;

        if (e.ctrlKey) {
            if ((ch >= 'A'.charCodeAt(0) && ch <= ']'.charCodeAt(0)) || ch == '_'.charCodeAt(0)) {
                ch -= 'A'.charCodeAt(0) - 1;
            } else if (ch >= 'a'.charCodeAt(0) && ch <= 'z'.charCodeAt(0)) {
                ch -= 'a'.charCodeAt(0) - 1;
            }
        }

        if (ch > 0 && ch < 128) {
            this.actionKey[ch] = 1;
        }

        if (ch > 4) {
            this.keyQueue[this.keyQueueWritePos] = ch;
            this.keyQueueWritePos = (this.keyQueueWritePos + 1) & 0x7f;
        }

        if (InputTracking.enabled) {
            InputTracking.keyPressed(ch);
        }

        if (!CanvasEnabledKeys.includes(e.key)) {
            e.preventDefault();
        }
    }

    private onkeyup(e: KeyboardEvent) {
        if (e.isTrusted && MobileKeyboard.isDisplayed()) {
            // physical keyboard started typing, hide virtual
            MobileKeyboard.hide();
            this.refresh();
        }

        this.idleCycles = performance.now();

        const keyCode = KeyCodes.get(e.key);
        if (!keyCode || (e.code.length === 0 && !e.isTrusted)) {
            return;
        }

        let ch: number = keyCode.ch;

        if (e.ctrlKey) {
            if ((ch >= 'A'.charCodeAt(0) && ch <= ']'.charCodeAt(0)) || ch == '_'.charCodeAt(0)) {
                ch -= 'A'.charCodeAt(0) - 1;
            } else if (ch >= 'a'.charCodeAt(0) && ch <= 'z'.charCodeAt(0)) {
                ch -= 'a'.charCodeAt(0) - 1;
            }
        }

        if (ch > 0 && ch < 128) {
            this.actionKey[ch] = 0;
        }

        if (InputTracking.enabled) {
            InputTracking.keyReleased(ch);
        }

        if (!CanvasEnabledKeys.includes(e.key)) {
            e.preventDefault();
        }
    }

    protected pollKey() {
        let key: number = -1;
        if (this.keyQueueWritePos !== this.keyQueueReadPos) {
            key = this.keyQueue[this.keyQueueReadPos];
            this.keyQueueReadPos = (this.keyQueueReadPos + 1) & 0x7f;
        }
        return key;
    }

    private onfocus(_e: FocusEvent) {
        this.hasFocus = true;
        this.redrawScreen = true;
        this.refresh();

        if (InputTracking.enabled) {
            InputTracking.focusGained();
        }
    }

    private onblur(_e: FocusEvent) {
        this.hasFocus = false;

        // custom: taken from later version to release all keys
        for (let i = 0; i < 128; i++) {
            this.actionKey[i] = 0;
        }

        if (InputTracking.enabled) {
            InputTracking.focusLost();
        }
    }

    // ----

    private get hasTouchEvents() {
        return 'ontouchstart' in window;
    }

    private get isTouchDevice() {
        return (this.hasTouchEvents ||
            (navigator.maxTouchPoints > 0) ||
            ((navigator as any).msMaxTouchPoints > 0));
    }

    protected get isMobile(): boolean {
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone|Mobile/i.test(navigator.userAgent)) {
            return true;
        }

        return this.isTouchDevice;
    }

    private insideViewportArea() {
        // 512 x 334
        const viewportAreaX1: number = 4;
        const viewportAreaY1: number = 4;
        const viewportAreaX2: number = viewportAreaX1 + 512;
        const viewportAreaY2: number = viewportAreaY1 + 334;
        return this.ingame && this.mouseX >= viewportAreaX1 && this.mouseX <= viewportAreaX2 && this.mouseY >= viewportAreaY1 && this.mouseY <= viewportAreaY2;
    }

    private insideMobileInputArea() {
        // custom: for mobile keyboard input
        return this.insideChatInputArea() || this.insideChatPopupArea() || this.insideUsernameArea() || this.inPasswordArea() || this.in2FAInputArea() || this.insideReportInterfaceTextArea();
    }

    private insideChatInputArea() {
        const chatInputAreaX1: number = 17;
        const chatInputAreaY1: number = 434;
        const chatInputAreaX2: number = chatInputAreaX1 + 479;
        const chatInputAreaY2: number = chatInputAreaY1 + 26;
        return (
            this.ingame &&
            this.getChatInterfaceId() === -1 &&
            !this.isChatBackInputOpen() &&
            !this.isShowSocialInput() &&
            this.mouseX >= chatInputAreaX1 &&
            this.mouseX <= chatInputAreaX2 &&
            this.mouseY >= chatInputAreaY1 &&
            this.mouseY <= chatInputAreaY2
        );
    }

    protected insideChatPopupArea() {
        const chatInputAreaX1: number = 17;
        const chatInputAreaY1: number = 357;
        const chatInputAreaX2: number = chatInputAreaX1 + 479;
        const chatInputAreaY2: number = chatInputAreaY1 + 96;
        return (
            this.ingame &&
            (this.isChatBackInputOpen() || this.isShowSocialInput()) &&
            this.mouseX >= chatInputAreaX1 &&
            this.mouseX <= chatInputAreaX2 &&
            this.mouseY >= chatInputAreaY1 &&
            this.mouseY <= chatInputAreaY2
        );
    }

    private insideChatScrollArea() {
        const chatInputAreaX1: number = 480;
        const chatInputAreaY1: number = 357;
        const chatInputAreaX2: number = chatInputAreaX1 + 16;
        const chatInputAreaY2: number = chatInputAreaY1 + 77;
        return (
            this.ingame &&
            (!this.isChatBackInputOpen() && !this.isShowSocialInput()) &&
            this.mouseX >= chatInputAreaX1 &&
            this.mouseX <= chatInputAreaX2 &&
            this.mouseY >= chatInputAreaY1 &&
            this.mouseY <= chatInputAreaY2
        );
    }

    private insideReportInterfaceTextArea() {
        // custom: for report abuse input on mobile
        // actual component size is [233, 137, 58 14]
        // extended it a little bit for easier interaction, since the area to
        // touch is not obvious (it's a bit narrow)
        if (!this.ingame) {
            return false;
        }

        const viewportInterfaceId = this.getViewportInterfaceId();
        const reportAbuseInterfaceId = this.getReportAbuseInterfaceId();
        // either viewport or report-abuse interface Ids are bad
        if (viewportInterfaceId === -1 || reportAbuseInterfaceId === -1) {
            return false;
        }

        // active viewport interface Id does not match
        if (viewportInterfaceId !== reportAbuseInterfaceId) {
            return false;
        }

        const reportInputAreaX1: number = 87;
        const reportInputAreaY1: number = 119;
        const reportInputAreaX2: number = reportInputAreaX1 + 348;
        const reportInputAreaY2: number = reportInputAreaY1 + 37;
        return this.mouseX >= reportInputAreaX1 && this.mouseX <= reportInputAreaX2 && this.mouseY >= reportInputAreaY1 && this.mouseY <= reportInputAreaY2;
    }

    private insideTabArea() {
        const tabAreaX1: number = 553;
        const tabAreaY1: number = 205;
        const tabAreaX2: number = tabAreaX1 + 190;
        const tabAreaY2: number = tabAreaY1 + 261;
        return this.ingame && this.mouseX >= tabAreaX1 && this.mouseX <= tabAreaX2 && this.mouseY >= tabAreaY1 && this.mouseY <= tabAreaY2;
    }

    private insideUsernameArea() {
        const usernameAreaX1: number = 280;
        const usernameAreaY1: number = 233;
        const usernameAreaX2: number = usernameAreaX1 + 190;
        const usernameAreaY2: number = usernameAreaY1 + 31;
        return !this.ingame && this.getTitleScreenState() === 2 && this.mouseX >= usernameAreaX1 && this.mouseX <= usernameAreaX2 && this.mouseY >= usernameAreaY1 && this.mouseY <= usernameAreaY2;
    }

    private inPasswordArea() {
        const passwordAreaX1: number = 280;
        const passwordAreaY1: number = 264;
        const passwordAreaX2: number = passwordAreaX1 + 278;
        const passwordAreaY2: number = passwordAreaY1 + 20;
        return !this.ingame && this.getTitleScreenState() === 2 && this.mouseX >= passwordAreaX1 && this.mouseX <= passwordAreaX2 && this.mouseY >= passwordAreaY1 && this.mouseY <= passwordAreaY2;
    }

    private in2FAInputArea() {
        const inputAreaX1: number = 280;
        const inputAreaY1: number = 233;
        const inputAreaX2: number = inputAreaX1 + 190;
        const inputAreaY2: number = inputAreaY1 + 61;
        return !this.ingame && this.getTitleScreenState() === 1 && this.mouseX >= inputAreaX1 && this.mouseX <= inputAreaX2 && this.mouseY >= inputAreaY1 && this.mouseY <= inputAreaY2;
    }

    private isFullScreen() {
        return document.fullscreenElement !== null;
    }

    private getMousePos(e: MouseEvent): { x: number, y: number } {
        const fixedWidth: number = this.width;
        const fixedHeight: number = this.height;

        const canvasBounds: DOMRect = canvas.getBoundingClientRect();
        const clickLocWithinCanvas = {
            x: e.clientX - canvasBounds.left,
            y: e.clientY - canvasBounds.top
        };
        let x = 0;
        let y = 0;

        if (this.isFullScreen()) {
            // Fullscreen logic will ensure the canvas aspect ratio is
            // preserved, centering the canvas on the screen.
            const gameAspectRatio = fixedWidth / fixedHeight;
            const ourAspectRatio = window.innerWidth / window.innerHeight;

            // Determine whether our aspect ratio is wider than canvas' one.
            const wider = ourAspectRatio >= gameAspectRatio;

            let trueCanvasWidth = 0;
            let trueCanvasHeight = 0;
            let offsetX = 0;
            let offsetY = 0;

            if (wider) {
                // Browser will scale canvas according to _height_.
                trueCanvasWidth = window.innerHeight * gameAspectRatio;
                trueCanvasHeight = window.innerHeight;
                // As such, there will be a gap on the X axis either side.
                offsetX = (window.innerWidth - trueCanvasWidth) / 2;
            } else {
                // Browser will scale canvas according to _width_.
                trueCanvasWidth = window.innerWidth;
                trueCanvasHeight = window.innerWidth / gameAspectRatio;
                // As such, there will be a gap on the Y axis either side.
                offsetY = (window.innerHeight - trueCanvasHeight) / 2;
            }
            const scaleX = fixedWidth / trueCanvasWidth;
            const scaleY = fixedHeight / trueCanvasHeight;
            x = ((clickLocWithinCanvas.x - offsetX) * scaleX) | 0;
            y = ((clickLocWithinCanvas.y - offsetY) * scaleY) | 0;
        } else {
            const scaleX: number = canvas.width / canvasBounds.width;
            const scaleY: number = canvas.height / canvasBounds.height;
            x = (clickLocWithinCanvas.x * scaleX) | 0;
            y = (clickLocWithinCanvas.y * scaleY) | 0;
        }

        // Specifically filter events outside of bounds of canvas; this can
        // happen if fullscreen mode is on due to letterboxing! The result is
        // that the mouse appears to move up/down vertically along X:0 if they
        // move mouse on the black section to the left, vice versa for other
        // sides, depending on aspect ratio.
        if (x < 0) {
            x = 0;
        }

        if (x > fixedWidth) {
            x = fixedWidth;
        }

        if (y < 0) {
            y = 0;
        }

        if (y > fixedHeight) {
            y = fixedHeight;
        }

        return { x, y };
    }

    exceedsGrabThreshold(size: number) {
        return Math.abs(this.sx - this.nx) > size || Math.abs(this.sy - this.ny) > size;
    }
}
