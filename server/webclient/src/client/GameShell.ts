import { CanvasEnabledKeys, KeyCodes } from '#/client/KeyCodes.js';

import { canvas, canvas2d } from '#/graphics/Canvas.js';
import Pix3D from '#/dash3d/Pix3D.js';
import PixMap from '#/graphics/PixMap.js';

import { sleep } from '#/util/JsUtil.js';

export default abstract class GameShell {
    protected state: number = 0;
    protected deltime: number = 14; // 30% faster than original 20ms
    protected mindel: number = 1;
    protected otim: number[] = new Array(10);
    protected fps: number = 0;
    protected debug: boolean = false;
    protected drawArea: PixMap | null = null;
    protected fullredraw: boolean = true;
    protected focus: boolean = true;

    public idleTimer: number = performance.now();
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

    public keyHeld: number[] = [];
    protected keyQueue: number[] = [];
    protected keyQueueReadPos: number = 0;
    protected keyQueueWritePos: number = 0;

    /// custom
    protected resizeToFit: boolean = false;
    protected tfps: number = 50;
    private absMouseX: number = 0;
    private absMouseY: number = 0;

    private readonly resizeHandler = (): void => {
        if (this.resizeToFit) {
            this.resize(window.innerWidth, window.innerHeight);
        }
    };

    private readonly touchEndHandler = (e: TouchEvent): void => {
        e.preventDefault();
    };

    protected async maininit() { }
    protected mainquit() { }
    protected async mainloop() { }
    protected async mainredraw() { }
    protected refresh() { }

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

    protected get sWid(): number {
        return canvas.width;
    }

    protected get sHei(): number {
        return canvas.height;
    }

    protected resize(width: number, height: number) {
        canvas.width = width;
        canvas.height = height;
        this.drawArea = new PixMap(width, height);
        Pix3D.setRenderClipping();
    }

    async run() {
        window.addEventListener('resize', this.resizeHandler, false);

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
        window.onmouseup = this.windowMouseUp.bind(this);
        window.onmousemove = this.windowMouseMove.bind(this);

        if (this.isTouchDevice) {
            canvas.style.touchAction = 'pinch-zoom';
            canvas.addEventListener('touchend', this.touchEndHandler, { passive: false });
        }

        // Preventing mouse events from bubbling up to the context menu in the browser for our canvas.
        // This may need to be hooked up to our own context menu in the future.
        canvas.oncontextmenu = (e: MouseEvent): void => {
            e.preventDefault();
        };

        window.oncontextmenu = (e: MouseEvent): void => {
            e.preventDefault();
        };

        await this.drawProgress('Loading...', 0);
        await this.maininit();

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

                await this.mainloop();

                this.keyQueueReadPos = this.keyQueueWritePos;
                count += ratio;
            }
            count &= 0xff;

            if (this.deltime > 0) {
                this.fps = ((ratio * 1000) / (this.deltime * 256)) | 0;
            }

            await this.mainredraw();

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
                    const o = (opos - i - 1 + 20) % 10;
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
        this.mainquit();

        window.removeEventListener('resize', this.resizeHandler, false);
        canvas.onfocus = null;
        canvas.onblur = null;
        canvas.onkeydown = null;
        canvas.onkeyup = null;
        canvas.onmousedown = null;
        canvas.onpointerdown = null;
        canvas.onmouseup = null;
        canvas.onpointerup = null;
        canvas.onpointerenter = null;
        canvas.onpointerleave = null;
        canvas.onpointermove = null;
        canvas.removeEventListener('touchend', this.touchEndHandler);
        canvas.oncontextmenu = null;
        window.onmouseup = null;
        window.onmousemove = null;
        window.oncontextmenu = null;
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

    protected async drawProgress(message: string, progress: number): Promise<void> {
        const width: number = this.sWid;
        const height: number = this.sHei;

        if (this.fullredraw) {
            canvas2d.fillStyle = 'black';
            canvas2d.fillRect(0, 0, width, height);
            this.fullredraw = false;
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

    // ----

    private onmousedown(e: MouseEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        this.getMousePos(e);

        this.mouseDown(this.absMouseX, this.absMouseY, e);
    }

    protected mouseDown(x: number, y: number, e: MouseEvent) {
        this.idleTimer = performance.now();
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
    }

    private onpointerdown(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        this.getMousePos(e);

        this.pointerDown(this.absMouseX, this.absMouseY, e);
    }

    protected pointerDown(_x: number, _y: number, _e: PointerEvent) {
    }

    private onmouseup(e: MouseEvent) {
        this.getMousePos(e);

        this.mouseUp(this.absMouseX, this.absMouseY, e);
    }

    protected mouseUp(x: number, y: number, e: MouseEvent) {
        this.idleTimer = performance.now();
        this.mouseButton = 0;

        // custom: up event comes before and potentially without move event
        this.mouseX = x;
        this.mouseY = y;
    }

    private onpointerup(e: PointerEvent) {
        this.getMousePos(e);

        this.pointerUp(this.absMouseX, this.absMouseY, e);
    }

    protected pointerUp(_x: number, _y: number, _e: PointerEvent) {
    }

    private onpointerenter(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        this.getMousePos(e);

        this.pointerEnter(this.absMouseX, this.absMouseY, e);
    }

    protected pointerEnter(x: number, y: number, _e: PointerEvent) {
        this.mouseX = x;
        this.mouseY = y;
    }

    private onpointerleave(e: PointerEvent) {
        this.pointerLeave(e);
    }

    protected pointerLeave(_e: PointerEvent) {
        this.idleTimer = performance.now();
        this.mouseX = -1;
        this.mouseY = -1;

        // custom: moving off-canvas may have a stuck mouse event
        this.nextMouseClickX = -1;
        this.nextMouseClickY = -1;
        this.nextMouseClickButton = 0;
        this.mouseButton = 0;
    }

    private onpointermove(e: PointerEvent) {
        if (e.clientX < 0 || e.clientY < 0) {
            return;
        }

        this.getMousePos(e);

        this.pointerMove(this.absMouseX, this.absMouseY, e);
    }

    protected pointerMove(x: number, y: number, e: PointerEvent) {
        this.idleTimer = performance.now();
        this.mouseX = x;
        this.mouseY = y;
    }

    protected windowMouseUp(e: MouseEvent) {
    }

    protected windowMouseMove(e: MouseEvent) {
    }

    private onkeydown(e: KeyboardEvent) {
        this.idleTimer = performance.now();

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
            this.keyHeld[ch] = 1;
        }

        if (ch > 4) {
            this.keyQueue[this.keyQueueWritePos] = ch;
            this.keyQueueWritePos = (this.keyQueueWritePos + 1) & 0x7f;
        }

        if (!CanvasEnabledKeys.includes(e.key)) {
            e.preventDefault();
        }
    }

    private onkeyup(e: KeyboardEvent) {
        // if (e.isTrusted && MobileKeyboard.isDisplayed()) {
        //     // physical keyboard started typing, hide virtual
        //     MobileKeyboard.hide();
        //     this.refresh();
        // }

        this.idleTimer = performance.now();

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
            this.keyHeld[ch] = 0;
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
        this.focus = true;
        this.fullredraw = true;
        this.refresh();
    }

    private onblur(_e: FocusEvent) {
        this.focus = false;

        // custom: taken from later version to release all keys
        for (let i = 0; i < 128; i++) {
            this.keyHeld[i] = 0;
        }
    }

    // ----

    private get hasTouchEvents() {
        return 'ontouchstart' in window;
    }

    private get isTouchDevice() {
        return (
            this.hasTouchEvents ||
            navigator.maxTouchPoints > 0 ||
            (navigator as any).msMaxTouchPoints > 0
        );
    }

    protected get isMobile(): boolean {
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone|Mobile/i.test(navigator.userAgent)) {
            return true;
        }

        return this.isTouchDevice;
    }

    private isFullScreen() {
        return document.fullscreenElement !== null;
    }

    private getMousePos(e: MouseEvent): void {
        const fixedWidth: number = this.sWid;
        const fixedHeight: number = this.sHei;

        const canvasBounds: DOMRect = canvas.getBoundingClientRect();
        const clickX = e.clientX - canvasBounds.left;
        const clickY = e.clientY - canvasBounds.top;
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
            x = ((clickX - offsetX) * scaleX) | 0;
            y = ((clickY - offsetY) * scaleY) | 0;
        } else {
            const scaleX: number = canvas.width / canvasBounds.width;
            const scaleY: number = canvas.height / canvasBounds.height;
            x = (clickX * scaleX) | 0;
            y = (clickY * scaleY) | 0;
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

        this.absMouseX = x;
        this.absMouseY = y;
    }
}
