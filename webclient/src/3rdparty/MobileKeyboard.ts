import { canvas, canvas2d } from "#/graphics/Canvas";

// ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"£$%^&*()-_=+[{]};:\'@#~,<.>/?\\| 
// ^ Allowed characters in client

const KEYMAP_REGULAR = [
    'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',  // 10 chars
    'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l',  // 9 chars
    'Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Del',  // 9 chars
    '123', ',', ' ', '.', 'Enter'  // 5 chars
];

const KEYMAP_SHIFT = [
    'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P',  // 10 chars
    'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L',  // 9 chars
    'Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Del',  // 9 chars
    '123', ',', ' ', '.', 'Enter'  // 5 chars
];

const KEYMAP_SYMBOLS = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',  // 10 chars
    '!', '"', '$', '%', '_', '&', '*', '(', ')',  // 9 chars
    '1/2', '@', '=', '<', '>', '~', ';', ':', 'Del',  // 9 chars
    'abc', '#', ' ', '?', 'Enter'
];

const KEYMAP_SYMBOLS_EXTRA = [
    '£', '^',  '[', ']', '{', '}', '\'', '-', '+', '/',
    '\\', '|', '', '', '', '', '', '', '',
    '2/2', '', '', '', '', '', '', '', 'Del',
    'abc', '', ' ', '', 'Enter'
];

// Offset for addressing individual rows; four rows total.
const CHAR_OFFSET_PER_ROW = [0, 10, 19, 28];

// Width in pixels for each key.
const WIDTH_PER_KEYBOX = 50;

// Height in pixels for each key.
const HEIGHT_PER_KEYBOX = 30;

// Timeout in milliseconds between each drag event, before considering the drag to have ended.
const DRAG_TIMEOUT_MS = 1000;

// How far a drag must move at least, before the keyboard starts moving.
const DRAG_MIN_DIST_PX = 5;

// How far a drag can move at most in one touch event.
const DRAG_MAX_DIST_PX = 75;

interface KeyBox {
    startX: number;
    startY: number;
    width: number;
    height: number;
};

enum KeyboardMode {
    Regular,
    Shift,
    Symbols,
    SymbolsExtra,
};

enum UserKeyboardMode {
    Hybrid,
    Native,
    Canvas
};

interface Keyboard {
    draw(): void;
    show(originX?: number, originY?: number): void;
    hide(): void;
    isDisplayed(): boolean;
    captureMouseUp(x: number, y: number): boolean;
    captureMouseDown(x: number, y: number): boolean;
    notifyTouchMove(x: number, y: number): void;
}


function isFullScreen() {
    return document.fullscreenElement !== null;
}


class MobileKeyboard {
    canvasKeyboard: CanvasMobileKeyboard;
    nativeKeyboard: NativeMobileKeyboard;
    mode: UserKeyboardMode;
    constructor() {
        this.canvasKeyboard = new CanvasMobileKeyboard();
        this.nativeKeyboard = new NativeMobileKeyboard();
        const savedMode = localStorage.getItem('mobileKeyboardMode');
        if (savedMode === 'native') {
            this.mode = UserKeyboardMode.Native;
        } else if (savedMode === 'canvas') {
            this.mode = UserKeyboardMode.Canvas;
        } else {
            this.mode = UserKeyboardMode.Hybrid;
        }
    }

    public show(originX?: number, originY?: number) {
        if (this.mode === UserKeyboardMode.Hybrid) {
            if (isFullScreen()) {
                this.canvasKeyboard.show();
            } else {
                this.nativeKeyboard.show();
            }
        } else if (this.mode === UserKeyboardMode.Canvas) {
            this.canvasKeyboard.show(originX, originY);
        } else if (this.mode === UserKeyboardMode.Native) {
            this.nativeKeyboard.show(originX, originY);
        }
    }

    public hide() {
        this.canvasKeyboard.hide();
        this.nativeKeyboard.hide();
    }

    public draw() {
        this.canvasKeyboard.draw();
    }

    public isDisplayed(): boolean {
        return this.canvasKeyboard.isDisplayed() || this.nativeKeyboard.isDisplayed();
    }

    public isWithinCanvasKeyboard(x: number, y: number): boolean {
        return this.canvasKeyboard.isDisplayed() && this.canvasKeyboard.posWithinKeyboard(x, y);
    }

    public captureMouseUp(x: number, y: number): boolean {
        if (this.canvasKeyboard.isDisplayed()) {
            return this.canvasKeyboard.captureMouseUp(x, y);
        } else if (this.nativeKeyboard.isDisplayed()) {
            return this.nativeKeyboard.captureMouseUp(x, y);
        }
        return false;
    }
    public captureMouseDown(x: number, y: number): boolean {
        if (this.canvasKeyboard.isDisplayed()) {
            return this.canvasKeyboard.captureMouseDown(x, y);
        } else if (this.nativeKeyboard.isDisplayed()) {
            return this.nativeKeyboard.captureMouseDown(x, y);
        }
        return false;
    }
    public notifyTouchMove(x: number, y: number): void {
        if (this.canvasKeyboard.isDisplayed()) {
            this.canvasKeyboard.notifyTouchMove(x, y);
        } else if (this.nativeKeyboard.isDisplayed()) {
            this.nativeKeyboard.notifyTouchMove(x, y);
        }
    }
}




/**
 * QWERTY-based OSK module.
 */
class CanvasMobileKeyboard implements Keyboard {
    private displayed: boolean = false;
    private height: number = (HEIGHT_PER_KEYBOX * 4) + 10;
    private width: number = (WIDTH_PER_KEYBOX * 10 + 10);
    private startX: number = 0;
    private startY: number = 532 - this.height;
    private mode: KeyboardMode = KeyboardMode.Regular;
    private animateBoxIndex: number = -1;
    private animateBoxTimeout: number = 0;
    private touchStartAtX: number = 0;
    private touchStartAtY: number = 0;
    private touching: boolean = false;
    private touchStartTimestamp: number = 0;

    /**
     * Returns a CSS style colour string for the given keyboard key index.
     */
    private getBoxColorForIndex(index: number): string {
        // If we are animating that key, mark it as a bit darker.
        if (this.animateBoxIndex > -1) {
            if (this.animateBoxIndex === index) {
                return '#a6a6a6';
            }
        }
        const char = this.getCharForIndex(index);
        if (char !== undefined && char.length > 1) {
            // Special keys have more than one character, so shade darker.
            return '#a9afba';
        }
        // Regular shade for regular keys.
        return '#c8cdd1';
    }

    /**
     * Returns the position of a key box for the given index.
     */
    private getBoxForIndex(index: number): KeyBox {
        const lineIndex = (index < CHAR_OFFSET_PER_ROW[1] ? 0 : (index < CHAR_OFFSET_PER_ROW[2] ? 1 : (index < CHAR_OFFSET_PER_ROW[3] ? 2 : 3)));
        let offsetPos = index - CHAR_OFFSET_PER_ROW[lineIndex];
        const box = {
            startX: (offsetPos * WIDTH_PER_KEYBOX) + 5,
            startY: (lineIndex * HEIGHT_PER_KEYBOX + 5),
            width: WIDTH_PER_KEYBOX,
            height: HEIGHT_PER_KEYBOX,
        }
        if (lineIndex === 1) {
            box.startX += (WIDTH_PER_KEYBOX / 2);
        }

        // Space bar has more chars than normal.
        if (index === 30) {
            box.width *= 6;
        }
        // Adjust chars after space bar to start further along.
        if (index > 30) {
            box.startX += (WIDTH_PER_KEYBOX * 5);
        }
        return box;
    }

    /**
     * Returns the character assigned to the given keymap index.
     */
    private getCharForIndex(index: number): string {
        if (this.mode === KeyboardMode.Shift) {
            return KEYMAP_SHIFT[index];
        } else if (this.mode === KeyboardMode.Symbols) {
            return KEYMAP_SYMBOLS[index];
        } else if (this.mode === KeyboardMode.SymbolsExtra) {
            return KEYMAP_SYMBOLS_EXTRA[index];
        }
        return KEYMAP_REGULAR[index];
    }
    
    /**
     * Draw all keyboard key backgrounds to the 2D canvas context.
     */
    private drawKeyBoxes() {
        for (let i = 0; i < KEYMAP_REGULAR.length; i++) {
            const box = this.getBoxForIndex(i);
            canvas2d.fillStyle = this.getBoxColorForIndex(i);
            canvas2d.beginPath();
            canvas2d.roundRect(this.startX + box.startX + 2, this.startY + box.startY + 2, box.width - 2, box.height - 2, 5);
            canvas2d.fill();
        }
    }

    /**
     * Draw all key 'chars' to the 2D canvas context.
     */
    private drawKeyChars() {
        canvas2d.fillStyle = 'black';
        canvas2d.textAlign = 'center';
        canvas2d.textBaseline = 'middle';
        for (let i = 0; i < KEYMAP_REGULAR.length; i++) {
            canvas2d.font = '16px Roboto, sans-serif';
            const box = this.getBoxForIndex(i);
            const offsetXCanvas = this.startX + box.startX + (WIDTH_PER_KEYBOX / 2);
            const offsetYCanvas = this.startY + box.startY + (HEIGHT_PER_KEYBOX / 2) + 2;
            const char = this.getCharForIndex(i);
            if (char.length > 1) {
                canvas2d.font = '14px Roboto, sans-serif';
            }
            canvas2d.fillText(char, offsetXCanvas, offsetYCanvas);
        }
    }

    /**
     * Draw the keyboard main background to the 2D canvas context.
     */
    private drawBackground() {
        canvas2d.fillStyle = '#dadde2';
        canvas2d.beginPath();
        canvas2d.roundRect(this.startX, this.startY, this.width, this.height, 5);
        canvas2d.fill();
    }

    /**
     * Draw the keyboard to the 2D canvas context.
     */
    draw() {
        if (!this.isDisplayed()) {
            return;
        }
        canvas2d.save();
        this.drawBackground();
        this.drawKeyBoxes();
        this.drawKeyChars();
        canvas2d.restore();
    }

    /**
     * Show the keyboard.
     */
    public show(_originX?: number, _originY?: number) {
        this.mode = KeyboardMode.Regular;
        this.displayed = true;
    }

    /**
     * Hide the keyboard.
     */
    public hide() {
        this.displayed = false;
    }

    /**
     * Returns whether the keyboard is displayed on-screen.
     */
    public isDisplayed() {
        return this.displayed;
    }

    /**
     * Determines whether given x and y are within the bounds of the keyboard.
     */
    public posWithinKeyboard(x: number, y: number): boolean {
        const withinX = x >= this.startX && x < (this.startX + this.width);
        const withinY = y >= this.startY && y < (this.startY + this.height);
        return withinX && withinY;
    }

    /**
     * Returns the box index for given x and y position.
     * Will return -1 on error.
     */
    private getBoxIndexForClick(x: number, y: number): number {
        const relativeX = x - this.startX;
        const relativeY = y - this.startY;
        if (relativeX < 0 || relativeY < 0 || relativeX >= this.width || relativeY >= this.height) {
            // Out of bounds
            return -1;
        }
        const rowIndex = Math.floor(relativeY / HEIGHT_PER_KEYBOX);
        const columnIndex = Math.floor(relativeX / WIDTH_PER_KEYBOX);
        if (rowIndex === 0) {
            return columnIndex;
        }
        if (rowIndex === 1) {
            // second row is offset by half a key
            if (relativeX < (WIDTH_PER_KEYBOX / 2) || relativeX > (this.width - (WIDTH_PER_KEYBOX / 2))) {
                return -1;
            }
            return CHAR_OFFSET_PER_ROW[1] + Math.floor((relativeX - (WIDTH_PER_KEYBOX / 2)) / WIDTH_PER_KEYBOX);
        }
        if (rowIndex === 2) {
            if (columnIndex >= 9) {
                return -1;
            }
            return CHAR_OFFSET_PER_ROW[2] + columnIndex;
        }
        return CHAR_OFFSET_PER_ROW[3] + columnIndex;
    }

    /**
     * Returns the character for an x and y position on the keyboard.
     */
    private getCharForClick(x: number, y: number): string {
        const boxIndex = this.getBoxIndexForClick(x, y);
        if (boxIndex > -1) {
            // there is a key corresponding to the click
            let char = '';
            if (boxIndex >= 30 && boxIndex <= 35) {
                // space takes 6 keyboxes
                char = ' ';
            } else if (boxIndex === 36) {
                char = this.getCharForIndex(31);
            } else if (boxIndex === 37) {
                char = 'Enter';
            } else {
                char = this.getCharForIndex(boxIndex);
            }
            if (char === 'Del') {
                char = 'Backspace';
            }
            return char;
        }
        return '';
    }

    /**
     * Signal that a MouseDown event occurred at x and y.
     * If this returns true, the MouseDown event should be considered swallowed
     * by the keyboard.
     */
    public captureMouseDown(x: number, y: number): boolean {
        if (this.posWithinKeyboard(x, y)) {
            return true;  // handled by keyboard
        }
        return false;
    }

    /**
     * Signal that a MouseUp event occurred at x and y.
     * If this returns true, the MouseUp event should be considered swallowed
     * by the keyboard.
     */
    public captureMouseUp(x: number, y: number): boolean {
        this.touching = false;
        if (this.posWithinKeyboard(x, y)) {
            const index = this.getBoxIndexForClick(x, y);
            const char = this.getCharForClick(x, y);
            if (char === 'Shift') {
                if (this.mode === KeyboardMode.Regular) {
                    this.mode = KeyboardMode.Shift;
                } else {
                    this.mode = KeyboardMode.Regular;
                }
                return true;
            } else if (char === '123' || char === '2/2') {
                this.mode = KeyboardMode.Symbols;
                return true;
            } else if (char === '1/2') {
                this.mode = KeyboardMode.SymbolsExtra;
                return true;
            } else if (char === 'abc') {
                this.mode = KeyboardMode.Regular;
                return true;
            } else if (char === '') {
                // Swallow here, something went wrong.
                return true;
            }
            // relay to canvas!
            const downEvent = new KeyboardEvent('keydown', {
                key: char,
                code: char,
            })
            const upEvent = new KeyboardEvent('keyup', {
                key: char,
                code: char,
            })
            canvas.dispatchEvent(downEvent);
            canvas.dispatchEvent(upEvent);
            if (!this.animateBoxTimeout) {
                if (index >= 30 && index <= 35) {
                    this.animateBoxIndex = 30;
                } else if (index > 35) {
                    this.animateBoxIndex = index - 5;
                } else {
                    this.animateBoxIndex = index;
                }
                this.animateBoxTimeout = window.setTimeout(() => {
                    this.animateBoxIndex = -1;
                    this.animateBoxTimeout = 0;
                }, 100);
            }
            return true;  // handled by keyboard
        }
        return false;
    }

    /**
     * Signal that a TouchMove event occurred at x and y.
     * This is used for the keyboard drag logic.
     */
    public notifyTouchMove(x: number, y: number) {
        if (!this.posWithinKeyboard(x, y)) {
            return;
        }
        if (this.touching && performance.now() > (this.touchStartTimestamp + DRAG_TIMEOUT_MS)) {
            // Timeout since touch started
            this.touching = false;
            return;
        }
        if (!this.touching) {
            // Record when and where the touch event started.
            this.touching = true;
            this.touchStartTimestamp = performance.now();
            this.touchStartAtX = x - this.startX;
            this.touchStartAtY = y - this.startY;
            return;
        }
        // How far have we moved in this touch event?
        const deltaX = Math.abs(Math.abs(this.touchStartAtX - x) - this.startX);
        const deltaY = Math.abs(Math.abs(this.touchStartAtY - y) - this.startY);
        if (deltaX > DRAG_MAX_DIST_PX || deltaY > DRAG_MAX_DIST_PX) {
            // Dragged further than the maximum distance in one touch event.
            return;
        }
        if (deltaX > DRAG_MIN_DIST_PX || deltaY > DRAG_MIN_DIST_PX) {
            // Dragged further than the minimum distance in one touch event.
            // Restrict movement such that the keyboard can't be repositioned out of sight
            // Otherwise, it's possible to make the keyboard unusable!
            const newStartX = Math.max(0, Math.min(789 - this.width, x - this.touchStartAtX));
            const newStartY = Math.max(0, Math.min(532 - this.height, y - this.touchStartAtY));
            this.startX = newStartX;
            this.startY = newStartY;
            // Focus event forces a re-draw of canvas
            canvas.dispatchEvent(new FocusEvent('focus'));
        }
    }
}

class NativeMobileKeyboard implements Keyboard {
    virtualInputElement: HTMLInputElement;
    private displayed: boolean = false;
    private isAndroid: boolean = false;
    constructor() {
        // android device detection
        this.isAndroid = navigator.userAgent.includes('Android');
        // Create the virtual input field
        this.virtualInputElement = document.createElement('input');
        this.virtualInputElement.setAttribute('type', 'password');
        this.virtualInputElement.setAttribute('autofocus', 'autofocus');
        this.virtualInputElement.setAttribute('spellcheck', 'false');
        this.virtualInputElement.setAttribute('autocomplete', 'off');
        this.virtualInputElement.setAttribute('style', 'position: fixed; top: 0px; left: 0px; width: 1px; height: 1px; opacity: 0;');
        if (this.isAndroid) {
            // Android uses `input` event for text entry rathern than `keydown` / `keyup`

            this.virtualInputElement.addEventListener('input', (ev: Event) => {
                if (!(ev instanceof InputEvent)) {
                    return;
                }
                const data: string | null = ev.data;

                if (data === null) {
                    return;
                }

                if (ev.inputType !== 'insertText') {
                    return;
                }

                canvas.dispatchEvent(new KeyboardEvent('keydown', { key: data, code: data }));
                canvas.dispatchEvent(new KeyboardEvent('keyup', { key: data, code: data }));
            });

            this.virtualInputElement.addEventListener('keydown', (ev: KeyboardEvent) => {
                if (ev.key === 'Enter' || ev.key === 'Backspace') {
                    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ev.key, code: ev.key }));
                }
            });
            this.virtualInputElement.addEventListener('keyup', (ev: KeyboardEvent) => {
                if (ev.key === 'Enter' || ev.key === 'Backspace') {
                    canvas.dispatchEvent(new KeyboardEvent('keyup', { key: ev.key, code: ev.key }));
                }
            });
        } else {
            // Non-android can use `keydown` / `keyup` directly
            this.virtualInputElement.addEventListener('keydown', (ev: KeyboardEvent) => {
                canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ev.key, code: ev.key }));
            });
            this.virtualInputElement.addEventListener('keyup', (ev: KeyboardEvent) => {
                canvas.dispatchEvent(new KeyboardEvent('keyup', { key: ev.key, code: ev.key }));
            });
        }
        document.body.appendChild(this.virtualInputElement);
    }
    draw(): void {
        // Native keyboard, nothing to draw
    }
    show(originX?: number, originY?: number): void {
        // Focus and click the virtual input field
        if (originX && originY) {
            this.virtualInputElement.style.left = `${originX}px`;
            this.virtualInputElement.style.top = `${originY}px`;
        }
        canvas.blur();
        this.virtualInputElement.focus();
        this.virtualInputElement.click();
        this.displayed = true;
    }
    hide(): void {
        // Blur the virtual input field
        this.virtualInputElement.blur();
        canvas.focus();
        this.displayed = false;
    }
    isDisplayed(): boolean {
        return this.displayed;
    }
    captureMouseUp(_x: number, _y: number): boolean {
        // We don't capture mouse events as the keyboard is Native so doesn't bubble
        return false;
    }
    captureMouseDown(_x: number, _y: number): boolean {
        // We don't capture mouse events as the keyboard is Native so doesn't bubble
        return false;
    }
    notifyTouchMove(_x: number, _y: number) {
        // We don't capture touch movement as we don't move the native keyboard
        return;
    }

}

export default new MobileKeyboard();
