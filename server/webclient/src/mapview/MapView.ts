import GameShell from '#/client/GameShell.js';
import Pix32 from '#/graphics/Pix32.js';
import Pix2D from '#/graphics/Pix2D.js';
import Pix8 from '#/graphics/Pix8.js';
import PixFont from '#/graphics/PixFont.js';
import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';
import { TypedArray1d, TypedArray2d } from '#/util/Arrays.js';
import { downloadUrl, sleep } from '#/util/JsUtil.js';
import { canvas, saveDataURL } from '#/graphics/Canvas.js';
import PixMap from '#/graphics/PixMap.js';
import WorldMapFont from '#/mapview/WorldMapFont.js';

export class MapView extends GameShell {
    static shouldDrawBorders: boolean = false;
    static shouldDrawLabels: boolean = true;

    static shouldDrawNpcs: boolean = false;
    static shouldDrawItems: boolean = false;
    static shouldDrawMultimap: boolean = false;
    static shouldDrawFreemap: boolean = false;
    static shouldDrawPlayers: boolean = true;
    static shouldDrawHistory: boolean = true; // heatmap on by default; fetched lazily on first frame

    // custom: long-term anonymous movement traces ('H'), pre-rendered into a sparse
    // per-row heat buffer in map space so redraws only blend visible non-zero tiles
    historyLoading: boolean = false;
    readonly historyHours: number = 168; // one week
    // max legit movement between samples is ~66 tiles (running, 10s interval); anything
    // bigger is a teleport or a sampling gap - draw nothing rather than a false chord
    readonly historyJumpThreshold: number = 80;
    heatRowStart: Int32Array | null = null;
    heatXs: Uint16Array | null = null;
    heatVs: Uint8Array | null = null;
    heatPalette: Int32Array = new Int32Array(0);

    // custom: player tracking
    playerPositions: {x: number, z: number, level: number, name: string}[] = [];
    playerTrails: Map<string, {x: number, z: number, time: number}[]> = new Map();
    lastPlayerFetch: number = 0;
    readonly playerPollInterval: number = 750;
    readonly maxTrailLength: number = 2000;
    readonly maxTrailAge: number = 1800000;

    readonly teleportThreshold: number = 30;
    teleportMarkers: {x: number, z: number, time: number}[] = [];
    readonly teleportMarkerAge: number = 8000;

    // custom: wheel zoom
    wheelDelta: number = 0;

    // custom: cursor coordinate readout
    cursorCoordinatesDirty: boolean = true;

    // custom: touch state
    touchIds: number[] = [];
    touchStartX: number = 0;
    touchStartY: number = 0;
    touchStartOffsetX: number = 0;
    touchStartOffsetZ: number = 0;
    pinchStartDist: number = 0;
    pinchStartZoom: number = 0;
    pinchMidX: number = 0;
    pinchMidY: number = 0;

    // custom: unified map — overworld (mz 44-62) + underground (62-79, overlaps OW last row) + misc (80-86)
    mapStartX: number = 50 << 6;
    mapStartZ: number = 50 << 6;
    mapWidth: number = 28 << 6;
    mapHeight: number = 44 << 6;
    mapOriginX: number = 28 << 6;
    mapOriginZ: number = 44 << 6;
    focusX: number = this.mapStartX - this.mapOriginX;
    focusZ: number = this.mapOriginZ + this.mapHeight - this.mapStartZ;

    shouldClearEmptyTiles: boolean = true;

    readonly maxLabelCount: number = 1000;
    mapLabelCount: number = 0;
    mapLabel: string[] = [];
    mapLabelX: number[] = [];
    mapLabelY: number[] = [];
    mapLabelSize: number[] = [];

    // floorcol.dat
    floorcol1: number[] = [0];
    floorcol2: number[] = [0];

    // underlay.dat
    floort1: number[][] = [];

    // overlay.dat
    floort2: number[][] = [];
    floorsr: number[][] = [];

    // loc.dat
    locWall: number[][] = [];
    locMapscene: number[][] = [];
    locMapfunction: number[][] = [];

    // custom: obj.dat
    objPos: boolean[][] = [];

    // custom: npc.dat
    npcPos: boolean[][] = [];

    // custom: multi.dat
    multiPos: boolean[][] = [];

    // custom: free.dat
    freePos: boolean[][] = [];

    mapscene: Pix8[] = [];
    mapfunction: Pix32[] = [];
    mapdot0: Pix32 | null = null;
    mapdot1: Pix32 | null = null;

    b12: PixFont | null = null;
    f11: WorldMapFont | null = null;
    f12: WorldMapFont | null = null;
    f14: WorldMapFont | null = null;
    f17: WorldMapFont | null = null;
    f19: WorldMapFont | null = null;
    f22: WorldMapFont | null = null;
    f26: WorldMapFont | null = null;
    f30: WorldMapFont | null = null;

    blendedGroundColour: number[][] = [];

    redraw: boolean = true;
    redrawTimer: number = 0;
    dragFocusX: number = -1;
    dragFocusZ: number = -1;

    keyX: number = 5;
    keyY: number = 13;
    keyWidth: number = 140;
    keyHeight: number = 470;
    showKey: boolean = false;
    keyPage: number = 0;
    lastKeyPage: number = 0;
    currentKeyHover: number = -1;
    lastKeyHover: number = 0;
    currentKey: number = 0;
    flashTimer: number = 0;

    visibleMapFunctionsX: Int32Array = new Int32Array(2000);
    visibleMapFunctionsY: Int32Array = new Int32Array(2000);
    visibleMapFunctions: Int32Array = new Int32Array(2000);
    activeMapFunctionX: Int32Array = new Int32Array(2000);
    activeMapFunctionZ: Int32Array = new Int32Array(2000);
    activeMapFunctions: Int32Array = new Int32Array(2000);
    activeMapFunctionCount: number = 0;

    overview: Pix32 | null = null;
    overviewHeight: number = 200;
    overviewWidth: number = ((this.overviewHeight * this.mapWidth) / this.mapHeight) | 0;
    overviewX: number = 635 - this.overviewWidth - 5;
    overviewY: number = 503 - this.overviewHeight - 20;
    showOverview: boolean = false;

    readonly INACTIVE_BORDER_TL: number = 0x887755;
    readonly INACTIVE: number = 0x776644;
    readonly INACTIVE_BORDER_BR: number = 0x665533;
    readonly ACTIVE_BORDER_TL: number = 0xaa0000;
    readonly ACTIVE: number = 0x990000;
    readonly ACTIVE_BORDER_BR: number = 0x880000;

    zoom: number = 4;
    targetZoom: number = 4;

    readonly keyNames: string[] = [
        'General Store',
        'Sword Shop',
        'Magic Shop',
        'Axe Shop',
        'Helmet Shop',
        'Bank',
        'Quest Start',
        'Amulet Shop',
        'Mining Site',
        'Furnace',
        'Anvil',
        'Combat Training',
        'Dungeon',
        'Staff Shop',
        'Platebody Shop',
        'Platelegs Shop',
        'Scimitar Shop',
        'Archery Shop',
        'Shield Shop',
        'Altar',
        'Herbalist',
        'Jewelery',
        'Gem Shop',
        'Crafting Shop',
        'Candle Shop',
        'Fishing Shop',
        'Fishing Spot',
        'Clothes Shop',
        'Apothecary',
        'Silk Trader',
        'Kebab Seller',
        'Pub/Bar',
        'Mace Shop',
        'Tannery',
        'Rare Trees',
        'Spinning Wheel',
        'Food Shop',
        'Cookery Shop',
        '???',
        'Water Source',
        'Cooking Range',
        'Skirt Shop',
        'Potters Wheel',
        'Windmill',
        'Mining Shop',
        'Chainmail Shop',
        'Silver Shop',
        'Fur Trader',
        'Spice Shop'
    ];

    constructor() {
        super();

        this.run();
    }

    override async maininit(): Promise<void> {
        // custom:
        this.keyHeight = this.sHei - this.keyY - 20;
        this.overviewX = this.sWid - this.overviewWidth - 5;
        this.overviewY = this.sHei - this.overviewHeight - 20;
        this.fullredraw = true;
        canvas.style.cursor = 'grab';

        const worldmap: JagFile = await this.loadWorldmap();

        await this.drawProgress('Please wait... Rendering Map', 100);

        // const size: Packet = new Packet(worldmap.read('size.dat'));
        // this.mapOriginX = size.g2();
        // this.mapOriginZ = size.g2();
        // this.mapWidth = size.g2();
        // this.mapHeight = size.g2();
        // this.focusX = this.mapStartX - this.mapOriginX;
        // this.focusZ = this.mapOriginZ + this.mapHeight - this.mapStartZ;

        const labels: Packet = new Packet(worldmap.read('labels.dat'));
        this.mapLabelCount = labels.g2();
        for (let i: number = 0; i < this.mapLabelCount; i++) {
            this.mapLabel[i] = labels.gjstr();
            this.mapLabelX[i] = labels.g2();
            this.mapLabelY[i] = labels.g2();
            this.mapLabelSize[i] = labels.g1();
        }

        const floorcol: Packet = new Packet(worldmap.read('floorcol.dat'));
        const floorcolCount: number = floorcol.g2();
        for (let i: number = 0; i < floorcolCount; i++) {
            this.floorcol1[i + 1] = floorcol.g4();
            this.floorcol2[i + 1] = floorcol.g4();
        }

        const underlay: Packet = new Packet(worldmap.read('underlay.dat'));
        this.floort1 = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
        this.loadUnderlay(underlay);

        const overlay: Packet = new Packet(worldmap.read('overlay.dat'));
        this.floort2 = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
        this.floorsr = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
        this.loadOverlay(overlay);

        const loc: Packet = new Packet(worldmap.read('loc.dat'));
        this.locWall = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
        this.locMapscene = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
        this.locMapfunction = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
        this.loadLoc(loc);

        try {
            // custom:
            const obj: Packet = new Packet(worldmap.read('obj.dat'));
            this.objPos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
            this.loadObj(obj);

            // custom:
            const npc: Packet = new Packet(worldmap.read('npc.dat'));
            this.npcPos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
            this.loadNpc(npc);

            // custom:
            const multi: Packet = new Packet(worldmap.read('multi.dat'));
            this.multiPos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
            this.loadMulti(multi);

            // custom:
            const free: Packet = new Packet(worldmap.read('free.dat'));
            this.freePos = new TypedArray2d(this.mapWidth, this.mapHeight, false);
            this.loadFree(free);
        } catch (_e) {
        }

        try {
            for (let i: number = 0; i < 100; i++) {
                this.mapscene[i] = Pix8.depack(worldmap, 'mapscene', i);
            }
        } catch (_e) {
            // empty
        }

        try {
            for (let i: number = 0; i < 100; i++) {
                this.mapfunction[i] = Pix32.depack(worldmap, 'mapfunction', i);
            }
        } catch (_e) {
            // empty
        }

        // custom:
        try {
            this.mapdot0 = Pix32.depack(worldmap, 'mapdots', 0);
            this.mapdot1 = Pix32.depack(worldmap, 'mapdots', 1);
        } catch (_e) {
        }

        this.b12 = PixFont.depack(worldmap, 'b12_full', false);

        // custom:
        try {
            this.f11 = WorldMapFont.load(worldmap, 'f11');
            this.f12 = WorldMapFont.load(worldmap, 'f12');
            this.f14 = WorldMapFont.load(worldmap, 'f14');
            this.f17 = WorldMapFont.load(worldmap, 'f17');
            this.f19 = WorldMapFont.load(worldmap, 'f19');
            this.f22 = WorldMapFont.load(worldmap, 'f22');
            this.f26 = WorldMapFont.load(worldmap, 'f26');
            this.f30 = WorldMapFont.load(worldmap, 'f30');
        } catch (err) {
            console.error(err);
            this.f11 = WorldMapFont.fromSystem(11, true);
            this.f12 = WorldMapFont.fromSystem(12, true);
            this.f14 = WorldMapFont.fromSystem(14, true);
            this.f17 = WorldMapFont.fromSystem(17, true);
            this.f19 = WorldMapFont.fromSystem(19, true);
            this.f22 = WorldMapFont.fromSystem(22, true);
            this.f26 = WorldMapFont.fromSystem(26, true);
            this.f30 = WorldMapFont.fromSystem(30, true);
        }

        this.blendedGroundColour = new TypedArray2d(this.mapWidth, this.mapHeight, 0);
        this.getBlendedGroundColour();
        if (this.shouldClearEmptyTiles) this.clearEmptyTiles();

        this.overview = new Pix32(this.overviewWidth, this.overviewHeight);
        this.overview.setPixels();
        this.renderWorldMap(0, 0, this.mapWidth, this.mapHeight, 0, 0, this.overviewWidth, this.overviewHeight);
        Pix2D.drawRect(0, 0, this.overviewWidth, this.overviewHeight, 0);
        Pix2D.drawRect(1, 1, this.overviewWidth - 2, this.overviewHeight - 2, this.INACTIVE_BORDER_TL);

        // custom: wheel zoom
        canvas.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            const delta: number = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
            this.wheelDelta += delta;
        }, { passive: false });

        // custom: touch events for mobile panning and pinch-to-zoom
        canvas.style.touchAction = 'none';
        canvas.addEventListener('touchstart', (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                this.touchIds = [e.touches[0].identifier];
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.touchStartOffsetX = this.focusX;
                this.touchStartOffsetZ = this.focusZ;
            } else if (e.touches.length === 2) {
                this.touchIds = [e.touches[0].identifier, e.touches[1].identifier];
                const dx: number = e.touches[1].clientX - e.touches[0].clientX;
                const dy: number = e.touches[1].clientY - e.touches[0].clientY;
                this.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
                this.pinchStartZoom = this.targetZoom;
                this.pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                this.pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                this.touchStartOffsetX = this.focusX;
                this.touchStartOffsetZ = this.focusZ;
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length === 1 && this.touchIds.length === 1) {
                const dx: number = e.touches[0].clientX - this.touchStartX;
                const dy: number = e.touches[0].clientY - this.touchStartY;
                this.focusX = (this.touchStartOffsetX - (dx * 2) / this.zoom) | 0;
                this.focusZ = (this.touchStartOffsetZ - (dy * 2) / this.zoom) | 0;
                this.redraw = true;
            } else if (e.touches.length >= 2 && this.touchIds.length === 2) {
                const dx: number = e.touches[1].clientX - e.touches[0].clientX;
                const dy: number = e.touches[1].clientY - e.touches[0].clientY;
                const dist: number = Math.sqrt(dx * dx + dy * dy);
                if (this.pinchStartDist > 0) {
                    this.targetZoom = Math.max(1.5, Math.min(16, this.pinchStartZoom * (dist / this.pinchStartDist)));
                }
                const midX: number = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY: number = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const panDx: number = midX - this.pinchMidX;
                const panDy: number = midY - this.pinchMidY;
                this.focusX = (this.touchStartOffsetX - (panDx * 2) / this.zoom) | 0;
                this.focusZ = (this.touchStartOffsetZ - (panDy * 2) / this.zoom) | 0;
                this.redraw = true;
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length === 0) {
                this.touchIds = [];
            } else if (e.touches.length === 1) {
                this.touchIds = [e.touches[0].identifier];
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.touchStartOffsetX = this.focusX;
                this.touchStartOffsetZ = this.focusZ;
            }
        }, { passive: false });

        // custom: resize handler
        window.addEventListener('resize', () => {
            this.resize(window.innerWidth, window.innerHeight);
            this.overviewX = this.sWid - this.overviewWidth - 5;
            this.overviewY = this.sHei - this.overviewHeight - 20;
            this.keyHeight = this.sHei - this.keyY - 20;
            this.redraw = true;
        });

        this.drawArea?.setPixels();
    }

    // custom: clear tiles with no data (for unified map)
    clearEmptyTiles(): void {
        for (let x: number = 0; x < this.mapWidth; x++) {
            for (let z: number = 0; z < this.mapHeight; z++) {
                if (this.floort1[x][z] == 0 && this.floort2[x][z] == 0) {
                    this.blendedGroundColour[x][z] = 0;
                }
            }
        }
    }

    getVisibleMapBounds(): {left: number, top: number, right: number, bottom: number} {
        return {
            left: Math.max(0, this.focusX - ((this.sWid / this.zoom) | 0)),
            top: Math.max(0, this.focusZ - ((this.sHei / this.zoom) | 0)),
            right: Math.min(this.mapWidth, this.focusX + ((this.sWid / this.zoom) | 0)),
            bottom: Math.min(this.mapHeight, this.focusZ + ((this.sHei / this.zoom) | 0))
        };
    }

    drawCursorCoordinates(left: number, top: number, right: number, bottom: number, y: number): void {
        const x: number = 410;
        const width: number = Math.min(150, this.sWid - x);
        if (width <= 0) return;

        let label: string = 'X: ----  Y: ----';
        if (this.mouseX >= 0 && this.mouseX < this.sWid && this.mouseY >= 0 && this.mouseY < this.sHei) {
            const mapX: number = Math.floor(left + (this.mouseX * (right - left)) / this.sWid);
            const mapY: number = Math.floor(top + (this.mouseY * (bottom - top)) / this.sHei);
            const worldX: number = this.mapOriginX + mapX;
            const worldY: number = this.mapOriginZ + this.mapHeight - mapY;
            label = `X: ${worldX}  Y: ${worldY}`;
        }

        this.drawStringBox(x, y, width, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, label);
        this.cursorCoordinatesDirty = false;
    }

    override async mainredraw(): Promise<void> {
        const {left, top, right, bottom} = this.getVisibleMapBounds();
        const controlsY: number = this.sHei - this.keyY - 20 + 1;

        if (this.redraw) {
            this.redraw = false;
            this.redrawTimer = 0;

            Pix2D.cls();

            this.renderWorldMap(left, top, right, bottom, 0, 0, this.sWid, this.sHei);

            // custom: long-term movement traces under the live player layer
            if (MapView.shouldDrawHistory) {
                this.drawHistory(left, top, right, bottom, 0, 0, this.sWid, this.sHei);
                if (this.historyLoading && this.b12) {
                    const window: string = this.historyHours % 24 === 0 ? `${this.historyHours / 24}d` : `${this.historyHours}h`;
                    this.b12.drawString(`loading ${window} movement traces...`, 11, 27, 0);
                    this.b12.drawString(`loading ${window} movement traces...`, 10, 26, 0x00ffff);
                }
            }

            // custom: draw player positions
            if (MapView.shouldDrawPlayers) {
                this.drawPlayers(left, top, right, bottom, 0, 0, this.sWid, this.sHei);
            }

            if (this.showOverview) {
                this.overview?.quickPlotSprite(this.overviewX, this.overviewY);

                Pix2D.fillRectTrans(
                    (this.overviewX + (this.overviewWidth * left) / this.mapWidth) | 0,
                    (this.overviewY + (this.overviewHeight * top) / this.mapHeight) | 0,
                    (((right - left) * this.overviewWidth) / this.mapWidth) | 0,
                    (((bottom - top) * this.overviewHeight) / this.mapHeight) | 0,
                    0xff0000,
                    0x80
                );
                Pix2D.drawRect(
                    (this.overviewX + (this.overviewWidth * left) / this.mapWidth) | 0,
                    (this.overviewY + (this.overviewHeight * top) / this.mapHeight) | 0,
                    (((right - left) * this.overviewWidth) / this.mapWidth) | 0,
                    (((bottom - top) * this.overviewHeight) / this.mapHeight) | 0,
                    0xff0000
                );

                if (this.flashTimer > 0 && this.flashTimer % 10 < 5) {
                    for (let i: number = 0; i < this.activeMapFunctionCount; i++) {
                        if (this.activeMapFunctions[i] == this.currentKey) {
                            const x: number = (this.overviewX + (this.overviewWidth * this.activeMapFunctionX[i]) / this.mapWidth) | 0;
                            const y: number = (this.overviewY + (this.overviewHeight * this.activeMapFunctionZ[i]) / this.mapHeight) | 0;
                            Pix2D.fillCircle(x, y, 2, 0xffff00, 256);
                        }
                    }
                }
            }

            if (this.showKey) {
                this.drawStringBox(this.keyX, this.keyY, this.keyWidth, 18, 0x999999, 0x777777, 0x555555, 'Prev page');
                this.drawStringBox(this.keyX, this.keyY + 18, this.keyWidth, this.keyHeight - 36, 0x999999, 0x777777, 0x555555, '');
                this.drawStringBox(this.keyX, this.keyY + this.keyHeight - 18, this.keyWidth, 18, 0x999999, 0x777777, 0x555555, 'Next page');

                const maxKeys: number = (this.keyHeight - 20) / 18;
                let y: number = this.keyY + 18 + 3;

                for (let row: number = 0; row < maxKeys; row++) {
                    if (row + this.lastKeyPage < this.mapfunction.length && row + this.lastKeyPage < this.keyNames.length) {
                        if (this.keyNames[row + this.lastKeyPage] === '???') {
                            continue;
                        }

                        this.mapfunction[row + this.lastKeyPage].plotSprite(this.keyX + 3, y);
                        this.b12?.drawString(this.keyNames[row + this.lastKeyPage], this.keyX + 21, y + 14, 0);

                        let rgb: number = 0xffffff;
                        if (this.currentKeyHover == row + this.lastKeyPage) {
                            rgb = 0xbbaaaa;
                        }
                        if (this.flashTimer > 0 && this.flashTimer % 10 < 5 && this.currentKey == row + this.lastKeyPage) {
                            rgb = 0xffff00;
                        }

                        this.b12?.drawString(this.keyNames[row + this.lastKeyPage], this.keyX + 20, y + 13, rgb);
                    }

                    y += 17;
                }
            }

            this.drawStringBox(this.overviewX, this.overviewY + this.overviewHeight, this.overviewWidth, 18, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, 'Overview');
            this.drawStringBox(this.keyX, this.keyY + this.keyHeight, this.keyWidth, 18, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, 'Key');

            if (this.targetZoom == 3.0) {
                this.drawStringBox(170, controlsY, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, '37%');
            } else {
                this.drawStringBox(170, controlsY, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, '37%');
            }

            if (this.targetZoom == 4.0) {
                this.drawStringBox(230, controlsY, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, '50%');
            } else {
                this.drawStringBox(230, controlsY, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, '50%');
            }

            if (this.targetZoom == 6.0) {
                this.drawStringBox(290, controlsY, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, '75%');
            } else {
                this.drawStringBox(290, controlsY, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, '75%');
            }

            if (this.targetZoom == 8.0) {
                this.drawStringBox(350, controlsY, 50, 30, this.ACTIVE_BORDER_TL, this.ACTIVE, this.ACTIVE_BORDER_BR, '100%');
            } else {
                this.drawStringBox(350, controlsY, 50, 30, this.INACTIVE_BORDER_TL, this.INACTIVE, this.INACTIVE_BORDER_BR, '100%');
            }

            this.drawCursorCoordinates(left, top, right, bottom, controlsY);
        } else if (this.cursorCoordinatesDirty) {
            // The readout is an opaque fixed-size box, so cursor movement can update
            // it without rerendering the full map and movement heat layer.
            this.drawCursorCoordinates(left, top, right, bottom, controlsY);
            this.redrawTimer = 0;
        }

        this.redrawTimer--;
        if (this.redrawTimer <= 0) {
            this.drawArea?.draw(0, 0);
            this.redrawTimer = 50;
        }
    }

    override refresh() {
        this.redrawTimer = 0;
    }

    override async mainloop(): Promise<void> {
        if (this.keyHeld[1] == 1) {
            this.focusX = (this.focusX - 16.0 / this.zoom) | 0;
            this.redraw = true;
        }
        if (this.keyHeld[2] == 1) {
            this.focusX = (this.focusX + 16.0 / this.zoom) | 0;
            this.redraw = true;
        }
        if (this.keyHeld[3] == 1) {
            this.focusZ = (this.focusZ - 16.0 / this.zoom) | 0;
            this.redraw = true;
        }
        if (this.keyHeld[4] == 1) {
            this.focusZ = (this.focusZ + 16.0 / this.zoom) | 0;
            this.redraw = true;
        }

        let key: number = 1;
        do {
            key = this.pollKey();
            if (key === -1) {
                break;
            }

            if (key == '1'.charCodeAt(0)) {
                this.targetZoom = 3.0;
                this.redraw = true;
            } else if (key == '2'.charCodeAt(0)) {
                this.targetZoom = 4.0;
                this.redraw = true;
            } else if (key == '3'.charCodeAt(0)) {
                this.targetZoom = 6.0;
                this.redraw = true;
            } else if (key == '4'.charCodeAt(0)) {
                this.targetZoom = 8.0;
                this.redraw = true;
            } else if (key == 'k'.charCodeAt(0) || key == 'K'.charCodeAt(0)) {
                this.showKey = !this.showKey;
                this.redraw = true;
            } else if (key == 'o'.charCodeAt(0) || key == 'O'.charCodeAt(0)) {
                this.showOverview = !this.showOverview;
                this.redraw = true;
            } else if (key == 'e'.charCodeAt(0) || key == 'E'.charCodeAt(0)) {
                const width = this.mapWidth * 2;
                const height = this.mapHeight * 2;

                const fullRender = new Pix32(width, height);
                fullRender.setPixels();
                this.renderWorldMap(0, 0, this.mapWidth, this.mapHeight, 0, 0, width, height);

                const canvas = document.createElement('canvas') as HTMLCanvasElement;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d')!;
                const out = new PixMap(width, height, ctx);
                out.setPixels();
                fullRender.quickPlotSprite(0, 0);
                out.draw(0, 0);

                this.drawArea?.setPixels();

                const map = canvas.toDataURL('image/png').replace(/^data:image\/[^;]/, 'data:application/octet-stream');
                saveDataURL(map, 'worldmap.png');
            } else if (key == 'n'.charCodeAt(0) || key == 'N'.charCodeAt(0)) {
                // custom:
                MapView.shouldDrawNpcs = !MapView.shouldDrawNpcs;
                this.redraw = true;
            } else if (key == 'i'.charCodeAt(0) || key == 'I'.charCodeAt(0)) {
                // custom:
                MapView.shouldDrawItems = !MapView.shouldDrawItems;
                this.redraw = true;
            } else if (key == 'l'.charCodeAt(0) || key == 'L'.charCodeAt(0)) {
                // custom:
                MapView.shouldDrawLabels = !MapView.shouldDrawLabels;
                this.redraw = true;
            } else if (key == 'b'.charCodeAt(0) || key == 'B'.charCodeAt(0)) {
                // custom:
                MapView.shouldDrawBorders = !MapView.shouldDrawBorders;
                this.redraw = true;
            } else if (key == 'm'.charCodeAt(0) || key == 'M'.charCodeAt(0)) {
                // custom:
                MapView.shouldDrawMultimap = !MapView.shouldDrawMultimap;
                this.redraw = true;
            } else if (key == 'f'.charCodeAt(0) || key == 'F'.charCodeAt(0)) {
                // custom:
                MapView.shouldDrawFreemap = !MapView.shouldDrawFreemap;
                this.redraw = true;
            } else if (key == 'p'.charCodeAt(0) || key == 'P'.charCodeAt(0)) {
                // custom:
                MapView.shouldDrawPlayers = !MapView.shouldDrawPlayers;
                this.redraw = true;
            } else if (key == 'h'.charCodeAt(0) || key == 'H'.charCodeAt(0)) {
                // custom: long-term movement traces
                MapView.shouldDrawHistory = !MapView.shouldDrawHistory;
                if (MapView.shouldDrawHistory && !this.heatRowStart && !this.historyLoading) {
                    this.fetchHistoryTraces();
                }
                this.redraw = true;
            }
        } while (key > 0);

        // custom: wheel zoom
        if (this.wheelDelta !== 0) {
            const zoomFactor: number = Math.pow(1.001, -this.wheelDelta);
            this.targetZoom = Math.max(1.5, Math.min(16, this.targetZoom * zoomFactor));
            this.wheelDelta = 0;
            this.redraw = true;
        }

        // custom: clean up expired teleport markers
        const markerNow: number = performance.now();
        while (this.teleportMarkers.length > 0 && markerNow - this.teleportMarkers[0].time > this.teleportMarkerAge) {
            this.teleportMarkers.shift();
        }

        if (this.mouseClickButton == 1) {
            this.nextMouseClickX = this.mouseClickX;
            this.nextMouseClickY = this.mouseClickY;
            this.dragFocusX = this.focusX;
            this.dragFocusZ = this.focusZ;

            const zoomY: number = this.sHei - this.keyY - 20 + 1;
            if (this.mouseClickX > 170 && this.mouseClickX < 220 && this.mouseClickY > zoomY) {
                this.targetZoom = 3.0;
                this.nextMouseClickX = -1;
            } else if (this.mouseClickX > 230 && this.mouseClickX < 280 && this.mouseClickY > zoomY) {
                this.targetZoom = 4.0;
                this.nextMouseClickX = -1;
            } else if (this.mouseClickX > 290 && this.mouseClickX < 340 && this.mouseClickY > zoomY) {
                this.targetZoom = 6.0;
                this.nextMouseClickX = -1;
            } else if (this.mouseClickX > 350 && this.mouseClickX < 400 && this.mouseClickY > zoomY) {
                this.targetZoom = 8.0;
                this.nextMouseClickX = -1;
            } else if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY + this.keyHeight && this.mouseClickX < this.keyX + this.keyWidth) {
                this.showKey = !this.showKey;
                this.nextMouseClickX = -1;
            } else if (this.mouseClickX > this.overviewX && this.mouseClickY > this.overviewY + this.overviewHeight && this.mouseClickX < this.overviewX + this.overviewWidth) {
                this.showOverview = !this.showOverview;
                this.nextMouseClickX = -1;
            }

            if (this.showKey) {
                if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY && this.mouseClickX < this.keyX + this.keyWidth && this.mouseClickY < this.keyY + this.keyHeight) {
                    this.nextMouseClickX = -1;
                }

                if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY && this.mouseClickX < this.keyX + this.keyWidth && this.mouseClickY < this.keyY + 18) {
                    this.keyPage = 0;
                } else if (this.mouseClickX > this.keyX && this.mouseClickY > this.keyY + this.keyHeight - 18 && this.mouseClickX < this.keyX + this.keyWidth && this.mouseClickY < this.keyY + this.keyHeight) {
                    this.keyPage = 25;
                }
            }

            this.redraw = true;
        }

        if (this.showKey) {
            this.currentKeyHover = -1;

            if (this.mouseX > this.keyX && this.mouseX < this.keyX + this.keyWidth) {
                const maxKeys: number = (this.keyHeight - 20) / 18;
                let y: number = this.keyY + 21 + 5;

                for (let row: number = 0; row < maxKeys; row++) {
                    if (row + this.lastKeyPage < this.keyNames.length && this.keyNames[row + this.lastKeyPage] !== '???') {
                        if (this.mouseY >= y && this.mouseY < y + 17) {
                            this.currentKeyHover = row + this.lastKeyPage;

                            if (this.mouseClickButton == 1) {
                                this.currentKey = row + this.lastKeyPage;
                                this.flashTimer = 50;
                            }
                        }

                        y += 17;
                    }
                }
            }

            if (this.currentKeyHover != this.lastKeyHover) {
                this.lastKeyHover = this.currentKeyHover;
                this.redraw = true;
            }
        }

        if ((this.mouseButton == 1 || this.mouseClickButton == 1) && this.showOverview) {
            let mouseClickX: number = this.mouseClickX;
            let mouseClickY: number = this.mouseClickY;
            if (this.mouseButton == 1) {
                mouseClickX = this.mouseX;
                mouseClickY = this.mouseY;
            }

            if (mouseClickX > this.overviewX && mouseClickY > this.overviewY && mouseClickX < this.overviewX + this.overviewWidth && mouseClickY < this.overviewY + this.overviewHeight) {
                this.focusX = (((mouseClickX - this.overviewX) * this.mapWidth) / this.overviewWidth) | 0;
                this.focusZ = (((mouseClickY - this.overviewY) * this.mapHeight) / this.overviewHeight) | 0;
                this.nextMouseClickX = -1;
                this.redraw = true;
            }
        }

        if (this.mouseButton == 1 && this.nextMouseClickX != -1) {
            this.focusX = this.dragFocusX + ((((this.nextMouseClickX - this.mouseX) * 2.0) / this.targetZoom) | 0);
            this.focusZ = this.dragFocusZ + ((((this.nextMouseClickY - this.mouseY) * 2.0) / this.targetZoom) | 0);
            this.redraw = true;
        }

        if (this.zoom < this.targetZoom) {
            this.redraw = true;
            this.zoom += this.zoom / 30.0;
            if (this.zoom > this.targetZoom) {
                this.zoom = this.targetZoom;
            }
        }

        if (this.zoom > this.targetZoom) {
            this.redraw = true;
            this.zoom -= this.zoom / 30.0;
            if (this.zoom < this.targetZoom) {
                this.zoom = this.targetZoom;
            }
        }

        if (this.lastKeyPage < this.keyPage) {
            this.redraw = true;
            this.lastKeyPage++;
        }

        if (this.lastKeyPage > this.keyPage) {
            this.redraw = true;
            this.lastKeyPage--;
        }

        if (this.flashTimer > 0) {
            this.redraw = true;
            this.flashTimer--;
        }

        // custom: poll player positions
        const now: number = performance.now();
        if (MapView.shouldDrawPlayers && now - this.lastPlayerFetch > this.playerPollInterval) {
            this.lastPlayerFetch = now;
            this.fetchPlayerPositions();
        }

        // custom: lazily load the history heatmap the first time it's shown (default on)
        if (MapView.shouldDrawHistory && !this.heatRowStart && !this.historyLoading) {
            this.fetchHistoryTraces();
        }

        // custom: clamp focus so the view stays within map bounds.
        // When the view is wider/taller than the map (zoomed out), the min and max
        // clamps would conflict and pin focus to a fixed value, freezing panning.
        // In that case center the axis instead; otherwise clamp to one edge only.
        const halfW: number = (this.sWid / this.zoom) | 0;
        const halfH: number = (this.sHei / this.zoom) | 0;
        if (halfW * 2 >= this.mapWidth - 96) {
            this.focusX = this.mapWidth >> 1;
        } else if (this.focusX - halfW < 48) {
            this.focusX = halfW + 48;
        } else if (this.focusX + halfW > this.mapWidth - 48) {
            this.focusX = this.mapWidth - 48 - halfW;
        }
        if (halfH * 2 >= this.mapHeight - 96) {
            this.focusZ = this.mapHeight >> 1;
        } else if (this.focusZ - halfH < 48) {
            this.focusZ = halfH + 48;
        } else if (this.focusZ + halfH > this.mapHeight - 48) {
            this.focusZ = this.mapHeight - 48 - halfH;
        }
    }

    // ----

    worldmap: JagFile | null = null;

    async loadWorldmap(): Promise<JagFile> {
        if (this.worldmap) {
            return this.worldmap;
        }

        // todo: save to cache and redownload if necessary
        let data: Uint8Array | undefined = undefined;

        let retry: number = 5;
        while (!data) {
            await this.drawProgress('Requesting map', 0);

            try {
                data = await downloadUrl('/worldmap.jag');
            } catch (_e) {
                data = undefined;
                for (let i: number = retry; i > 0; i--) {
                    await this.drawProgress(`Error loading - Will retry in ${i} secs.`, 0);
                    await sleep(1000);
                }

                retry *= 2;
                if (retry > 60) {
                    retry = 60;
                }
            }
        }

        this.worldmap = new JagFile(data);
        return this.worldmap;
    }

    drawStringBox(x: number, y: number, width: number, height: number, borderTL: number, fill: number, borderBR: number, str: string): void {
        x = Math.trunc(x);
        y = Math.trunc(y);
        width = Math.trunc(width);
        height = Math.trunc(height);

        Pix2D.drawRect(x, y, width, height, 0);

        const xPad: number = x + 1;
        const yPad: number = y + 1;
        const widthPad: number = width - 2;
        const heightPad: number = height - 2;

        Pix2D.fillRect(xPad, yPad, widthPad, heightPad, fill);
        Pix2D.hline(xPad, yPad, widthPad, borderTL);
        Pix2D.vline(xPad, yPad, heightPad, borderTL);
        Pix2D.hline(xPad, yPad + heightPad - 1, widthPad, borderBR);
        Pix2D.vline(xPad + widthPad - 1, yPad, heightPad, borderBR);

        this.b12?.centreString(str, xPad + ((widthPad / 2) | 0) + 1, yPad + ((heightPad / 2) | 0) + 1 + 4, 0);
        this.b12?.centreString(str, xPad + ((widthPad / 2) | 0), yPad + ((heightPad / 2) | 0) + 4, 0xffffff);
    }

    // jag::oldscape::rs2lib::worldmap::RenderedMapSquare::GetBlendedGroundColour
    getBlendedGroundColour(): void {
        const maxX: number = this.mapWidth;
        const maxZ: number = this.mapHeight;

        const average: number[] = new TypedArray1d(maxZ, 0);

        for (let x: number = 5; x < maxX - 5; x++) {
            const east = this.floort1[x + 5];
            const west = this.floort1[x - 5];

            for (let z: number = 0; z < maxZ; z++) {
                average[z] += this.floorcol1[east[z]] - this.floorcol1[west[z]];
            }

            if (x > 10 && x < maxX - 10) {
                let r: number = 0;
                let g: number = 0;
                let b: number = 0;

                for (let z: number = 5; z < maxZ - 5; z++) {
                    const north: number = average[z + 5];
                    const south: number = average[z - 5];

                    r += (north >> 20) - (south >> 20);
                    g += ((north >> 10) & 0x3ff) - ((south >> 10) & 0x3ff);
                    b += (north & 0x3ff) - (south & 0x3ff);

                    if (b > 0) {
                        this.blendedGroundColour[x][z] = this.getRgb(r / 8533.0, g / 8533.0, b / 8533.0);
                    }
                }
            }
        }
    }

    // ----

    loadUnderlay(data: Packet): void {
        while (data.available > 0) {
            const mx: number = data.g1() * 64 - this.mapOriginX;
            let rawMz: number = data.g1();
            if (rawMz >= 144) rawMz -= 82;
            else if (rawMz >= 70 && rawMz <= 76) rawMz += 10;
            const mz: number = rawMz * 64 - this.mapOriginZ;

            if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
                for (let x: number = 0; x < 64; x++) {
                    let zIndex: number = this.mapHeight - mz - 1;

                    for (let z: number = -64; z < 0; z++) {
                        this.floort1[mx + x][zIndex--] = data.g1();
                    }
                }
            } else {
                data.pos += 4096;
            }
        }
    }

    loadOverlay(data: Packet): void {
        while (data.available > 0) {
            const mx: number = data.g1() * 64 - this.mapOriginX;
            let rawMz: number = data.g1();
            if (rawMz >= 144) rawMz -= 82;
            else if (rawMz >= 70 && rawMz <= 76) rawMz += 10;
            const mz: number = rawMz * 64 - this.mapOriginZ;

            if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
                for (let x: number = 0; x < 64; x++) {
                    let zIndex: number = this.mapHeight - mz - 1;

                    for (let z: number = -64; z < 0; z++) {
                        const opcode: number = data.g1();
                        if (opcode === 0) {
                            this.floort2[x + mx][zIndex--] = 0;
                        } else {
                            this.floorsr[x + mx][zIndex] = data.g1();
                            this.floort2[x + mx][zIndex--] = this.floorcol2[opcode];
                        }
                    }
                }
            } else {
                for (let i: number = -4096; i < 0; i++) {
                    const opcode: number = data.g1();
                    if (opcode != 0) {
                        data.g1();
                    }
                }
            }
        }
    }

    loadLoc(data: Packet): void {
        while (data.available > 0) {
            const mx: number = data.g1() * 64 - this.mapOriginX;
            let rawMz: number = data.g1();
            if (rawMz >= 144) rawMz -= 82;
            else if (rawMz >= 70 && rawMz <= 76) rawMz += 10;
            const mz: number = rawMz * 64 - this.mapOriginZ;

            if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
                for (let x: number = 0; x < 64; x++) {
                    let zIndex: number = this.mapHeight - mz - 1;

                    for (let z: number = -64; z < 0; z++) {
                        while (true) {
                            const opcode: number = data.g1();
                            if (opcode === 0) {
                                zIndex--;
                                break;
                            }

                            if (opcode < 29) {
                                this.locWall[x + mx][zIndex] = opcode;
                            } else if (opcode < 160) {
                                this.locMapscene[x + mx][zIndex] = opcode - 28;
                            } else {
                                this.locMapfunction[x + mx][zIndex] = opcode - 159;

                                this.activeMapFunctions[this.activeMapFunctionCount] = opcode - 160;
                                this.activeMapFunctionX[this.activeMapFunctionCount] = x + mx;
                                this.activeMapFunctionZ[this.activeMapFunctionCount] = zIndex;
                                this.activeMapFunctionCount++;
                            }
                        }
                    }
                }
            } else {
                for (let x: number = 0; x < 64; x++) {
                    let opcode: number = 0;
                    for (let z: number = -64; z < 0; z++) {
                        do {
                            opcode = data.g1();
                        } while (opcode != 0);
                    }
                }
            }
        }
    }

    // custom:
    loadObj(data: Packet): void {
        while (data.available > 0) {
            const mx: number = data.g1() * 64 - this.mapOriginX;
            let rawMz: number = data.g1();
            if (rawMz >= 144) rawMz -= 82;
            else if (rawMz >= 70 && rawMz <= 76) rawMz += 10;
            const mz: number = rawMz * 64 - this.mapOriginZ;

            if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
                for (let x: number = 0; x < 64; x++) {
                    let zIndex: number = this.mapHeight - mz - 1;

                    for (let z: number = -64; z < 0; z++) {
                        this.objPos[x + mx][zIndex--] = data.g1() == 1;
                    }
                }
            } else {
                data.pos += 4096;
            }
        }
    }

    // custom:
    loadNpc(data: Packet): void {
        while (data.available > 0) {
            const mx: number = data.g1() * 64 - this.mapOriginX;
            let rawMz: number = data.g1();
            if (rawMz >= 144) rawMz -= 82;
            else if (rawMz >= 70 && rawMz <= 76) rawMz += 10;
            const mz: number = rawMz * 64 - this.mapOriginZ;

            if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
                for (let x: number = 0; x < 64; x++) {
                    let zIndex: number = this.mapHeight - mz - 1;

                    for (let z: number = -64; z < 0; z++) {
                        this.npcPos[x + mx][zIndex--] = data.g1() == 1;
                    }
                }
            } else {
                data.pos += 4096;
            }
        }
    }

    // custom:
    loadMulti(data: Packet): void {
        while (data.available > 0) {
            const mx: number = data.g1() * 64 - this.mapOriginX;
            let rawMz: number = data.g1();
            if (rawMz >= 144) rawMz -= 82;
            else if (rawMz >= 70 && rawMz <= 76) rawMz += 10;
            const mz: number = rawMz * 64 - this.mapOriginZ;

            if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
                for (let x: number = 0; x < 64; x++) {
                    let zIndex: number = this.mapHeight - mz - 1;

                    for (let z: number = -64; z < 0; z++) {
                        this.multiPos[x + mx][zIndex--] = data.g1() == 1;
                    }
                }
            } else {
                data.pos += 4096;
            }
        }
    }

    // custom:
    loadFree(data: Packet): void {
        while (data.available > 0) {
            const mx: number = data.g1() * 64 - this.mapOriginX;
            let rawMz: number = data.g1();
            if (rawMz >= 144) rawMz -= 82;
            else if (rawMz >= 70 && rawMz <= 76) rawMz += 10;
            const mz: number = rawMz * 64 - this.mapOriginZ;

            if (mx > 0 && mz > 0 && mx + 64 < this.mapWidth && mz + 64 < this.mapHeight) {
                for (let x: number = 0; x < 64; x++) {
                    let zIndex: number = this.mapHeight - mz - 1;

                    for (let z: number = -64; z < 0; z++) {
                        this.freePos[x + mx][zIndex--] = data.g1() == 1;
                    }
                }
            } else {
                data.pos += 4096;
            }
        }
    }

    // ----

    // jag::oldscape::rs2lib::worldmap::HslUtils::GetRgb
    getRgb(hue: number, saturation: number, lightness: number): number {
        let r: number = lightness;
        let g: number = lightness;
        let b: number = lightness;

        if (saturation !== 0.0) {
            let q: number;
            if (lightness < 0.5) {
                q = lightness * (saturation + 1.0);
            } else {
                q = lightness + saturation - lightness * saturation;
            }

            const p: number = lightness * 2.0 - q;
            let t: number = hue + 0.3333333333333333;
            if (t > 1.0) {
                t--;
            }

            let d11: number = hue - 0.3333333333333333;
            if (d11 < 0.0) {
                d11++;
            }

            if (t * 6.0 < 1.0) {
                r = p + (q - p) * 6.0 * t;
            } else if (t * 2.0 < 1.0) {
                r = q;
            } else if (t * 3.0 < 2.0) {
                r = p + (q - p) * (0.6666666666666666 - t) * 6.0;
            } else {
                r = p;
            }

            if (hue * 6.0 < 1.0) {
                g = p + (q - p) * 6.0 * hue;
            } else if (hue * 2.0 < 1.0) {
                g = q;
            } else if (hue * 3.0 < 2.0) {
                g = p + (q - p) * (0.6666666666666666 - hue) * 6.0;
            } else {
                g = p;
            }

            if (d11 * 6.0 < 1.0) {
                b = p + (q - p) * 6.0 * d11;
            } else if (d11 * 2.0 < 1.0) {
                b = q;
            } else if (d11 * 3.0 < 2.0) {
                b = p + (q - p) * (0.6666666666666666 - d11) * 6.0;
            } else {
                b = p;
            }
        }

        const intR: number = (r * 256.0) | 0;
        const intG: number = (g * 256.0) | 0;
        const intB: number = (b * 256.0) | 0;
        return (intR << 16) + (intG << 8) + intB;
    }

    // jag::oldscape::worldmap::Worldmap::RenderWorldmap
    renderWorldMap(left: number, top: number, right: number, bottom: number, widthOffset: number, heightOffset: number, width: number, height: number): void {
        const visibleX: number = right - left;
        const visibleY: number = bottom - top;
        const widthRatio: number = (((width - widthOffset) << 16) / visibleX) | 0;
        const heightRatio: number = (((height - heightOffset) << 16) / visibleY) | 0;

        for (let x: number = 0; x < visibleX; x++) {
            let startX: number = (widthRatio * x) >> 16;
            let endX: number = (widthRatio * (x + 1)) >> 16;
            const lengthX: number = endX - startX;
            if (lengthX <= 0) {
                continue;
            }

            startX += widthOffset;
            endX += widthOffset;

            const colours = this.blendedGroundColour[x + left];
            const overlays = this.floort2[x + left];
            const shapes = this.floorsr[x + left];

            for (let y: number = 0; y < visibleY; y++) {
                let startY: number = (heightRatio * y) >> 16;
                let endY: number = (heightRatio * (y + 1)) >> 16;
                const lengthY: number = endY - startY;
                if (lengthY <= 0) {
                    continue;
                }

                startY += heightOffset;
                endY += heightOffset;

                const overlay: number = overlays[y + top];
                if (overlay === 0) {
                    Pix2D.fillRect(startX, startY, endX - startX, endY - startY, colours[y + top]);
                } else {
                    const info: number = shapes[y + top];
                    const shape: number = info & 0xfc;
                    if (shape == 0 || lengthX <= 1 || lengthY <= 1) {
                        Pix2D.fillRect(startX, startY, lengthX, lengthY, overlay);
                    } else {
                        this.drawOverlayShape(Pix2D.pixels, startY * Pix2D.width + startX, colours[y + top], overlay, lengthX, lengthY, shape >> 2, info & 0x3);
                    }
                }
            }
        }

        if (right - left > width - widthOffset) {
            return;
        }

        let visibleMapFunctionCount: number = 0;
        for (let x: number = 0; x < visibleX; x++) {
            let startX: number = (widthRatio * x) >> 16;
            let endX: number = (widthRatio * (x + 1)) >> 16;
            const lengthX: number = endX - startX;
            if (lengthX <= 0) {
                continue;
            }

            const walls = this.locWall[x + left];
            const mapscenes = this.locMapscene[x + left];
            const mapfunctions = this.locMapfunction[x + left];

            for (let y: number = 0; y < visibleY; y++) {
                let startY: number = (heightRatio * y) >> 16;
                let endY: number = (heightRatio * (y + 1)) >> 16;
                const lengthY: number = endY - startY;
                if (lengthY <= 0) {
                    continue;
                }

                let wall: number = walls[y + top] & 0xff;
                if (wall != 0) {
                    let edgeX: number;
                    if (lengthX == 1) {
                        edgeX = startX;
                    } else {
                        edgeX = endX - 1;
                    }

                    let edgeY: number;
                    if (lengthY == 1) {
                        edgeY = startY;
                    } else {
                        edgeY = endY - 1;
                    }

                    let rgb: number = 0xcccccc;
                    if ((wall >= 5 && wall <= 8) || (wall >= 13 && wall <= 16) || (wall >= 21 && wall <= 24)) {
                        rgb = 0xcc0000;
                        wall -= 4;
                    }
                    if (wall == 27 || wall == 28) {
                        // custom: fix drawing diagonal doors
                        rgb = 0xcc0000;
                        wall -= 2;
                    }

                    if (wall == 1) {
                        Pix2D.vline(startX, startY, lengthY, rgb);
                    } else if (wall == 2) {
                        Pix2D.hline(startX, startY, lengthX, rgb);
                    } else if (wall == 3) {
                        Pix2D.vline(edgeX, startY, lengthY, rgb);
                    } else if (wall == 4) {
                        Pix2D.hline(startX, edgeY, lengthX, rgb);
                    } else if (wall == 9) {
                        Pix2D.vline(startX, startY, lengthY, 0xffffff);
                        Pix2D.hline(startX, startY, lengthX, rgb);
                    } else if (wall == 10) {
                        Pix2D.vline(edgeX, startY, lengthY, 0xffffff);
                        Pix2D.hline(startX, startY, lengthX, rgb);
                    } else if (wall == 11) {
                        Pix2D.vline(edgeX, startY, lengthY, 0xffffff);
                        Pix2D.hline(startX, edgeY, lengthX, rgb);
                    } else if (wall == 12) {
                        Pix2D.vline(startX, startY, lengthY, 0xffffff);
                        Pix2D.hline(startX, edgeY, lengthX, rgb);
                    } else if (wall == 17) {
                        Pix2D.hline(startX, startY, 1, rgb);
                    } else if (wall == 18) {
                        Pix2D.hline(edgeX, startY, 1, rgb);
                    } else if (wall == 19) {
                        Pix2D.hline(edgeX, edgeY, 1, rgb);
                    } else if (wall == 20) {
                        Pix2D.hline(startX, edgeY, 1, rgb);
                    } else if (wall == 25) {
                        for (let i: number = 0; i < lengthY; i++) {
                            Pix2D.hline(startX + i, edgeY - i, 1, rgb);
                        }
                    } else if (wall == 26) {
                        for (let i: number = 0; i < lengthY; i++) {
                            Pix2D.hline(startX + i, startY + i, 1, rgb);
                        }
                    }
                }

                const mapscene: number = mapscenes[y + top];
                if (mapscene != 0) {
                    this.mapscene[mapscene - 1].scalePlotSprite(startX - ((lengthX / 2) | 0), startY - ((lengthY / 2) | 0), lengthX * 2, lengthY * 2);
                }

                const mapfunction: number = mapfunctions[y + top];
                if (mapfunction != 0) {
                    this.visibleMapFunctions[visibleMapFunctionCount] = mapfunction - 1;
                    this.visibleMapFunctionsX[visibleMapFunctionCount] = startX + ((lengthX / 2) | 0);
                    this.visibleMapFunctionsY[visibleMapFunctionCount] = startY + ((lengthY / 2) | 0);
                    visibleMapFunctionCount++;
                }
            }
        }

        for (let i: number = 0; i < visibleMapFunctionCount; i++) {
            this.mapfunction[this.visibleMapFunctions[i]].plotSprite(this.visibleMapFunctionsX[i] - 7, this.visibleMapFunctionsY[i] - 7);
        }

        if (MapView.shouldDrawFreemap) {
            for (let x = 0; x < visibleX; x++) {
                let startX = widthRatio * x >> 16;
                let endX = widthRatio * (x + 1) >> 16;
                let lengthX = endX - startX;
                if (lengthX <= 0) {
                    continue;
                }

                startX += widthOffset;
                endX += widthOffset;

                let multi = this.freePos[x + left];
                for (let y = 0; y < visibleY; y++) {
                    let startY = heightRatio * y >> 16;
                    let endY = heightRatio * (y + 1) >> 16;
                    let lengthY = endY - startY;
                    if (lengthY <= 0) {
                        continue;
                    }

                    startY += heightOffset;
                    endY += heightOffset;

                    if (multi[y + top]) {
                        Pix2D.fillRectTrans(startX, startY, lengthX, lengthY, 0x00ff00, 96);
                    }
                }
            }
        }

        if (MapView.shouldDrawMultimap) {
            for (let x = 0; x < visibleX; x++) {
                let startX = widthRatio * x >> 16;
                let endX = widthRatio * (x + 1) >> 16;
                let lengthX = endX - startX;
                if (lengthX <= 0) {
                    continue;
                }

                startX += widthOffset;
                endX += widthOffset;

                let multi = this.multiPos[x + left];
                for (let y = 0; y < visibleY; y++) {
                    let startY = heightRatio * y >> 16;
                    let endY = heightRatio * (y + 1) >> 16;
                    let lengthY = endY - startY;
                    if (lengthY <= 0) {
                        continue;
                    }

                    startY += heightOffset;
                    endY += heightOffset;

                    if (multi[y + top]) {
                        Pix2D.fillRectTrans(startX, startY, lengthX, lengthY, 0xff0000, 96);
                    }
                }
            }
        }

        if (MapView.shouldDrawItems) {
            for (let x: number = 0; x < visibleX; x++) {
                let startX: number = (widthRatio * x) >> 16;
                let endX: number = (widthRatio * (x + 1)) >> 16;
                const lengthX: number = endX - startX;
                if (lengthX <= 0) {
                    continue;
                }

                startX += widthOffset;
                endX += widthOffset;

                for (let y: number = 0; y < visibleY; y++) {
                    let startY: number = (heightRatio * y) >> 16;
                    let endY: number = (heightRatio * (y + 1)) >> 16;
                    const lengthY: number = endY - startY;
                    if (lengthY <= 0) {
                        continue;
                    }

                    startY += heightOffset;
                    endY += heightOffset;

                    if (this.objPos[x + left][y + top]) {
                        this.mapdot0?.plotSprite(startX, startY);
                    }
                }
            }
        }

        if (MapView.shouldDrawNpcs) {
            for (let x: number = 0; x < visibleX; x++) {
                let startX: number = (widthRatio * x) >> 16;
                let endX: number = (widthRatio * (x + 1)) >> 16;
                const lengthX: number = endX - startX;
                if (lengthX <= 0) {
                    continue;
                }

                startX += widthOffset;
                endX += widthOffset;

                for (let y: number = 0; y < visibleY; y++) {
                    let startY: number = (heightRatio * y) >> 16;
                    let endY: number = (heightRatio * (y + 1)) >> 16;
                    const lengthY: number = endY - startY;
                    if (lengthY <= 0) {
                        continue;
                    }

                    startY += heightOffset;
                    endY += heightOffset;

                    if (this.npcPos[x + left][y + top]) {
                        this.mapdot1?.plotSprite(startX, startY);
                    }
                }
            }
        }

        if (this.flashTimer > 0) {
            for (let i: number = 0; i < visibleMapFunctionCount; i++) {
                if (this.visibleMapFunctions[i] == this.currentKey) {
                    this.mapfunction[this.visibleMapFunctions[i]].plotSprite(this.visibleMapFunctionsX[i] - 7, this.visibleMapFunctionsY[i] - 7);

                    if (this.flashTimer % 10 < 5) {
                        Pix2D.fillCircle(this.visibleMapFunctionsX[i], this.visibleMapFunctionsY[i], 15, 0xffff00, 128);
                        Pix2D.fillCircle(this.visibleMapFunctionsX[i], this.visibleMapFunctionsY[i], 7, 0xffffff, 256);
                    }
                }
            }
        }

        if (MapView.shouldDrawLabels) {
            for (let i: number = 0; i < this.mapLabelCount; i++) {
                let x = this.mapLabelX[i];
                let y = this.mapLabelY[i];

                x -= this.mapOriginX;
                y = this.mapOriginZ + this.mapHeight - y;

                const drawX: number = (widthOffset + ((width - widthOffset) * (x - left)) / (right - left)) | 0;
                let drawY: number = (heightOffset + ((height - heightOffset) * (y - top)) / (bottom - top)) | 0;
                const labelSize: number = this.mapLabelSize[i];

                let rgb: number = 0xffffff;
                let font: WorldMapFont | null = null;
                // Wheel and pinch zoom settle on arbitrary values, so choose a font
                // across the full zoom range instead of only at the preset zooms.
                if (labelSize == 0) {
                    if (this.zoom < 4.0) {
                        font = this.f11;
                    } else if (this.zoom < 6.0) {
                        font = this.f12;
                    } else if (this.zoom < 8.0) {
                        font = this.f14;
                    } else {
                        font = this.f17;
                    }
                } else if (labelSize == 1) {
                    if (this.zoom < 4.0) {
                        font = this.f14;
                    } else if (this.zoom < 6.0) {
                        font = this.f17;
                    } else if (this.zoom < 8.0) {
                        font = this.f19;
                    } else {
                        font = this.f22;
                    }
                } else if (labelSize == 2) {
                    rgb = 0xffaa00;

                    if (this.zoom < 4.0) {
                        font = this.f19;
                    } else if (this.zoom < 6.0) {
                        font = this.f22;
                    } else if (this.zoom < 8.0) {
                        font = this.f26;
                    } else {
                        font = this.f30;
                    }
                }

                if (font !== null) {
                    let label = this.mapLabel[i];

                    let lineCount = 1;
                    for (let j = 0; j < label.length; j++) {
                        if (label[j] === '/') {
                            lineCount++;
                        }
                    }

                    drawY -= ((font.getHeight() * (lineCount - 1) / 2) | 0);
                    drawY += (font.getYOffset() / 2) | 0;

                    while (true) {
                        const newline = label.indexOf('/');
                        if (newline === -1) {
                            font.centreString(label, drawX, drawY, rgb, true);
                            break;
                        }

                        const part = label.substring(0, newline);
                        font.centreString(part, drawX, drawY, rgb, true);

                        drawY += font.getHeight();
                        label = label.substring(newline + 1);
                    }
                }
            }
        }

        // custom: region labels for unified map
        if (MapView.shouldDrawLabels) {
            const regionLabels: {label: string, x: number, z: number}[] = [
                { label: 'Underground', x: 41 * 64 + 32, z: 71 * 64 + 32 },
                { label: 'Misc', x: 41 * 64 + 32, z: 83 * 64 + 32 }
            ];
            for (const rl of regionLabels) {
                const rx: number = rl.x - this.mapOriginX;
                const ry: number = this.mapOriginZ + this.mapHeight - rl.z;
                const rdx: number = (widthOffset + ((width - widthOffset) * (rx - left)) / (right - left)) | 0;
                const rdy: number = (heightOffset + ((height - heightOffset) * (ry - top)) / (bottom - top)) | 0;
                this.b12?.centreString(rl.label, rdx + 1, rdy + 1, 0);
                this.b12?.centreString(rl.label, rdx, rdy, 0xffaa00);
            }
        }

        if (MapView.shouldDrawBorders) {
            for (let mx: number = this.mapOriginX / 64; mx < (this.mapOriginX + this.mapWidth) / 64; mx++) {
                for (let mz: number = this.mapOriginZ / 64; mz < (this.mapOriginZ + this.mapHeight) / 64; mz++) {
                    let x: number = mx * 64;
                    let z: number = mz * 64;

                    x -= this.mapOriginX;
                    z = this.mapOriginZ + this.mapHeight - z;

                    const drawLeft: number = (widthOffset + ((width - widthOffset) * (x - left)) / (right - left)) | 0;
                    const drawTop: number = (heightOffset + ((height - heightOffset) * (z - 64 - top)) / (bottom - top)) | 0;
                    const drawRight: number = (widthOffset + ((width - widthOffset) * (x + 64 - left)) / (right - left)) | 0;
                    const drawBottom: number = (heightOffset + ((height - heightOffset) * (z - top)) / (bottom - top)) | 0;

                    if (drawLeft >= width || drawTop >= height || drawRight <= 0 || drawBottom <= 0) {
                        continue;
                    }

                    Pix2D.drawRect(drawLeft, drawTop, drawRight - drawLeft, drawBottom - drawTop, 0xffffff);
                    this.b12?.drawStringRight(mx + '_' + mz, drawRight - 5, drawBottom - 5, 0xffffff, false);

                    if (mx == 33 && mz >= 71 && mz <= 73) {
                        this.b12?.centreString('u_pass', ((drawRight + drawLeft) / 2) | 0, ((drawBottom + drawTop) / 2) | 0, 0xff0000);
                    } else if (mx >= 32 && mx <= 34 && mz >= 70 && mz <= 74) {
                        this.b12?.centreString('u_pass', ((drawRight + drawLeft) / 2) | 0, ((drawBottom + drawTop) / 2) | 0, 0xffff00);
                    }
                }
            }
        }
    }

    // jag::oldscape::rs2lib::worldmap::OverlayShapes::DrawOverlayShape
    drawOverlayShape(data: Int32Array, off: number, underlay: number, overlay: number, width: number, height: number, shape: number, rotation: number): void {
        const step: number = Pix2D.width - width;
        if (shape == 9) {
            shape = 1;
            rotation = (rotation + 1) & 0x3;
        } else if (shape == 10) {
            shape = 1;
            rotation = (rotation + 3) & 0x3;
        } else if (shape == 11) {
            shape = 8;
            rotation = (rotation + 3) & 0x3;
        }

        if (shape == 1) {
            if (rotation == 0) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        } else if (shape == 2) {
            if (rotation == 0) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x <= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x >= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        } else if (shape == 3) {
            if (rotation == 0) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x <= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x >= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        } else if (shape == 4) {
            if (rotation == 0) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x >= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x <= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        } else if (shape == 5) {
            if (rotation == 0) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x >= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y >> 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x <= y << 1) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        } else if (shape == 6) {
            if (rotation == 0) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= ((width / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (y <= ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= ((width / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (y >= ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        } else if (shape == 7) {
            if (rotation == 0) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x <= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x <= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x <= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        } else if (shape == 8) {
            if (rotation == 0) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 1) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = 0; x < width; x++) {
                        if (x >= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 2) {
                for (let y: number = height - 1; y >= 0; y--) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x >= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            } else if (rotation == 3) {
                for (let y: number = 0; y < height; y++) {
                    for (let x: number = width - 1; x >= 0; x--) {
                        if (x >= y - ((height / 2) | 0)) {
                            data[off++] = overlay;
                        } else {
                            data[off++] = underlay;
                        }
                    }
                    off += step;
                }
            }
        }
    }

    // custom: remap z-coordinates into the unified map space
    remapZ(z: number): number {
        const mz: number = (z >> 6);
        if (mz >= 144) return z - (82 << 6);
        if (mz >= 70 && mz <= 76) return z + (10 << 6);
        return z;
    }

    // custom: fetch player positions from server
    fetchPlayerPositions(): void {
        fetch('/playerpositions')
            .then(res => res.json())
            .then((data: {x: number, z: number, level: number, name: string}[]) => {
                this.playerPositions = data;
                this.updateTrails(data);
                this.redraw = true;
            })
            .catch(() => {});
    }

    // custom: fetch and pre-render long-term anonymous traces
    fetchHistoryTraces(): void {
        this.historyLoading = true;
        fetch(`/playertraces?hours=${this.historyHours}`)
            .then(res => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then((data: { lines: number[][] }) => {
                this.buildHeat(data.lines);
                this.historyLoading = false;
                this.redraw = true;
            })
            .catch(() => {
                this.historyLoading = false;
                MapView.shouldDrawHistory = false;
                this.redraw = true;
            });
    }

    buildHeat(lines: number[][]): void {
        const w: number = this.mapWidth;
        const h: number = this.mapHeight;
        const dense: Uint16Array = new Uint16Array(w * h);

        // rasterize every line pass; overlap accumulates into heat. Single-point lines
        // are samples the server wouldn't connect (coarse cadence, teleports) - they
        // render as dots rather than false paths
        for (const line of lines) {
            if (line.length >= 2) {
                const px: number = line[0] - this.mapOriginX;
                const py: number = this.mapOriginZ + h - this.remapZ(line[1]);
                if (px >= 0 && px < w && py >= 0 && py < h) {
                    const off: number = px + py * w;
                    if (dense[off] < 0xffff) dense[off]++;
                }
            }
            for (let i = 2; i < line.length; i += 2) {
                let x1: number = line[i - 2] - this.mapOriginX;
                let y1: number = this.mapOriginZ + h - this.remapZ(line[i - 1]);
                const x2: number = line[i] - this.mapOriginX;
                const y2: number = this.mapOriginZ + h - this.remapZ(line[i + 1]);

                // teleports aren't movement - don't draw a line across the map
                if (Math.abs(x2 - x1) > this.historyJumpThreshold || Math.abs(y2 - y1) > this.historyJumpThreshold) continue;

                const dx: number = Math.abs(x2 - x1);
                const dy: number = Math.abs(y2 - y1);
                const sx: number = x1 < x2 ? 1 : -1;
                const sy: number = y1 < y2 ? 1 : -1;
                let err: number = dx - dy;
                for (;;) {
                    if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
                        const off: number = x1 + y1 * w;
                        if (dense[off] < 0xffff) dense[off]++;
                    }
                    if (x1 === x2 && y1 === y2) break;
                    const e2: number = 2 * err;
                    if (e2 > -dy) { err -= dy; x1 += sx; }
                    if (e2 < dx) { err += dx; y1 += sy; }
                }
            }
        }

        // compact to per-row sparse arrays. Normalize intensity against the busiest
        // tile on a log scale so heavy-traffic areas keep a gradient instead of all
        // pinning to max (which made dense zones a flat opaque blob over a week of data).
        let count: number = 0;
        let maxCount: number = 1;
        for (let i = 0; i < dense.length; i++) {
            const v: number = dense[i];
            if (v !== 0) {
                count++;
                if (v > maxCount) maxCount = v;
            }
        }
        const invLogMax: number = 1 / Math.log(1 + maxCount);

        const rowStart: Int32Array = new Int32Array(h + 1);
        const xs: Uint16Array = new Uint16Array(count);
        const vs: Uint8Array = new Uint8Array(count);
        let n: number = 0;
        for (let y = 0; y < h; y++) {
            rowStart[y] = n;
            const base: number = y * w;
            for (let x = 0; x < w; x++) {
                const v: number = dense[base + x];
                if (v !== 0) {
                    xs[n] = x;
                    // gamma <1 lifts the low end so single-pass (lightest) traces read
                    // as visible cyan rather than near-invisible dark blue
                    const ratio: number = Math.log(1 + v) * invLogMax;
                    vs[n] = Math.min(255, (Math.pow(ratio, 0.55) * 255) | 0);
                    n++;
                }
            }
        }
        rowStart[h] = n;

        if (this.heatPalette.length === 0) {
            // blue -> cyan -> yellow -> red. No white at the top so the hottest tiles
            // stay a saturated colour you can still read the terrain through.
            const stops: number[][] = [
                [0x20, 0x40, 0xb0], // low: blue
                [0x20, 0xd0, 0xf0], // cyan
                [0xf0, 0xe0, 0x30], // yellow
                [0xff, 0x30, 0x10] // hot: red
            ];
            this.heatPalette = new Int32Array(256);
            for (let i = 0; i < 256; i++) {
                const t: number = (i / 255) * (stops.length - 1);
                const seg: number = Math.min(stops.length - 2, t | 0);
                const f: number = t - seg;
                const a = stops[seg];
                const b = stops[seg + 1];
                const r: number = (a[0] + (b[0] - a[0]) * f) | 0;
                const g: number = (a[1] + (b[1] - a[1]) * f) | 0;
                const bl: number = (a[2] + (b[2] - a[2]) * f) | 0;
                this.heatPalette[i] = (r << 16) | (g << 8) | bl;
            }
        }

        this.heatRowStart = rowStart;
        this.heatXs = xs;
        this.heatVs = vs;
    }

    // custom: blend the visible slice of the heat buffer into the frame
    drawHistory(left: number, top: number, right: number, bottom: number, widthOffset: number, heightOffset: number, width: number, height: number): void {
        if (!this.heatRowStart || !this.heatXs || !this.heatVs) {
            return;
        }

        const pixels: Int32Array = Pix2D.pixels;
        const stride: number = Pix2D.width;
        const screenH: number = pixels.length / stride;
        const scaleX: number = (width - widthOffset) / (right - left);
        const scaleY: number = (height - heightOffset) / (bottom - top);
        const cellW: number = Math.max(1, Math.ceil(scaleX));
        const cellH: number = Math.max(1, Math.ceil(scaleY));

        const y0: number = Math.max(0, top);
        const y1: number = Math.min(this.mapHeight, bottom);

        for (let my = y0; my < y1; my++) {
            const start: number = this.heatRowStart[my];
            const end: number = this.heatRowStart[my + 1];
            if (start === end) continue;

            const syBase: number = (heightOffset + scaleY * (my - top)) | 0;
            for (let i = start; i < end; i++) {
                const mx: number = this.heatXs[i];
                if (mx < left || mx >= right) continue;

                const v: number = this.heatVs[i];
                const rgb: number = this.heatPalette[v];
                // floor keeps the lightest traces visible; cap keeps the hottest tile
                // translucent so the map still reads through
                const alpha: number = 70 + ((v * 90) >> 8);
                const invAlpha: number = 256 - alpha;
                const srcR: number = ((rgb >> 16) & 0xff) * alpha;
                const srcG: number = ((rgb >> 8) & 0xff) * alpha;
                const srcB: number = (rgb & 0xff) * alpha;

                const sxBase: number = (widthOffset + scaleX * (mx - left)) | 0;
                for (let py = syBase; py < syBase + cellH; py++) {
                    if (py < 0 || py >= screenH) continue;
                    let off: number = sxBase + py * stride;
                    for (let px = sxBase; px < sxBase + cellW; px++, off++) {
                        if (px < 0 || px >= stride) continue;
                        const dst: number = pixels[off];
                        pixels[off] = ((((srcR + ((dst >> 16) & 0xff) * invAlpha) >> 8) << 16) |
                                       (((srcG + ((dst >> 8) & 0xff) * invAlpha) >> 8) << 8) |
                                       ((srcB + (dst & 0xff) * invAlpha) >> 8));
                    }
                }
            }
        }
    }

    // custom: track player movement trails
    updateTrails(players: {x: number, z: number, level: number, name: string}[]): void {
        const now: number = performance.now();
        const activeNames: Set<string> = new Set();

        for (const p of players) {
            activeNames.add(p.name);
            let trail = this.playerTrails.get(p.name);
            if (!trail) {
                trail = [];
                this.playerTrails.set(p.name, trail);
            }

            const last = trail.length > 0 ? trail[trail.length - 1] : null;
            if (!last || last.x !== p.x || last.z !== p.z) {
                if (last) {
                    const dx: number = Math.abs(p.x - last.x);
                    const dz: number = Math.abs(p.z - last.z);
                    if (dx > this.teleportThreshold || dz > this.teleportThreshold) {
                        const lastZ: number = this.remapZ(last.z);
                        const lastHx: number = last.x - this.mapOriginX;
                        const lastHz: number = this.mapOriginZ + this.mapHeight - lastZ;
                        if (lastHx >= 0 && lastHx < this.mapWidth && lastHz >= 0 && lastHz < this.mapHeight) {
                            this.teleportMarkers.push({ x: lastHx, z: lastHz, time: now });
                        }
                        const curZ: number = this.remapZ(p.z);
                        const curHx: number = p.x - this.mapOriginX;
                        const curHz: number = this.mapOriginZ + this.mapHeight - curZ;
                        if (curHx >= 0 && curHx < this.mapWidth && curHz >= 0 && curHz < this.mapHeight) {
                            this.teleportMarkers.push({ x: curHx, z: curHz, time: now });
                        }
                    }
                }

                trail.push({ x: p.x, z: p.z, time: now });
            }

            if (trail.length > this.maxTrailLength) {
                trail.splice(0, trail.length - this.maxTrailLength);
            }

            while (trail.length > 0 && now - trail[0].time > this.maxTrailAge) {
                trail.shift();
            }
        }

        for (const name of this.playerTrails.keys()) {
            if (!activeNames.has(name)) {
                this.playerTrails.delete(name);
            }
        }
    }

    // custom: Bresenham line drawing with alpha blending
    drawLineAlpha(x1: number, y1: number, x2: number, y2: number, rgb: number, alpha: number): void {
        const pixels: Int32Array = Pix2D.pixels;
        const w: number = Pix2D.width;
        const h: number = pixels.length / w;
        const srcR: number = (rgb >> 16) & 0xff;
        const srcG: number = (rgb >> 8) & 0xff;
        const srcB: number = rgb & 0xff;
        const invAlpha: number = 256 - alpha;

        const dx: number = Math.abs(x2 - x1);
        const dy: number = Math.abs(y2 - y1);
        const sx: number = x1 < x2 ? 1 : -1;
        const sy: number = y1 < y2 ? 1 : -1;
        let err: number = dx - dy;

        while (true) {
            if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
                const off: number = x1 + y1 * w;
                const dst: number = pixels[off];
                const dstR: number = (dst >> 16) & 0xff;
                const dstG: number = (dst >> 8) & 0xff;
                const dstB: number = dst & 0xff;
                pixels[off] = (((srcR * alpha + dstR * invAlpha) >> 8) << 16) |
                              (((srcG * alpha + dstG * invAlpha) >> 8) << 8) |
                              ((srcB * alpha + dstB * invAlpha) >> 8);
            }

            if (x1 === x2 && y1 === y2) break;
            const e2: number = 2 * err;
            if (e2 > -dy) { err -= dy; x1 += sx; }
            if (e2 < dx) { err += dx; y1 += sy; }
        }
    }

    // custom: draw player positions, trails, and teleport markers
    drawPlayers(left: number, top: number, right: number, bottom: number, widthOffset: number, heightOffset: number, width: number, height: number): void {
        const now: number = performance.now();

        // Draw teleport X markers
        for (const marker of this.teleportMarkers) {
            const age: number = now - marker.time;
            const fade: number = Math.max(0, 1 - age / this.teleportMarkerAge);

            const screenX: number = (widthOffset + ((width - widthOffset) * (marker.x - left)) / (right - left)) | 0;
            const screenY: number = (heightOffset + ((height - heightOffset) * (marker.z - top)) / (bottom - top)) | 0;

            if (screenX < 4 || screenX >= width - 4 || screenY < 4 || screenY >= height - 4) continue;

            const r: number = (fade * 255) | 0;
            const color: number = (r << 16);
            const size: number = 4;
            this.drawLineAlpha(screenX - size, screenY - size, screenX + size, screenY + size, color, 256);
            this.drawLineAlpha(screenX + size, screenY - size, screenX - size, screenY + size, color, 256);
        }

        for (const p of this.playerPositions) {
            const pz: number = this.remapZ(p.z);
            const mapX: number = p.x - this.mapOriginX;
            const mapY: number = this.mapOriginZ + this.mapHeight - pz;

            if (mapX < 0 || mapX >= this.mapWidth || mapY < 0 || mapY >= this.mapHeight) continue;

            // Draw trail
            const trail = this.playerTrails.get(p.name);
            if (trail && trail.length > 1) {
                for (let i: number = 1; i < trail.length; i++) {
                    const prev = trail[i - 1];
                    const curr = trail[i];

                    const tdx: number = Math.abs(curr.x - prev.x);
                    const tdz: number = Math.abs(curr.z - prev.z);
                    if (tdx > this.teleportThreshold || tdz > this.teleportThreshold) continue;

                    const age: number = now - curr.time;
                    const recentFade: number = Math.max(0, 1 - age / 15000);
                    const alpha: number = (80 + recentFade * 176) | 0;

                    const prevZ: number = this.remapZ(prev.z);
                    const currZ: number = this.remapZ(curr.z);
                    const prevMapX: number = prev.x - this.mapOriginX;
                    const prevMapY: number = this.mapOriginZ + this.mapHeight - prevZ;
                    const currMapX: number = curr.x - this.mapOriginX;
                    const currMapY: number = this.mapOriginZ + this.mapHeight - currZ;

                    const sx1: number = (widthOffset + ((width - widthOffset) * (prevMapX - left)) / (right - left)) | 0;
                    const sy1: number = (heightOffset + ((height - heightOffset) * (prevMapY - top)) / (bottom - top)) | 0;
                    const sx2: number = (widthOffset + ((width - widthOffset) * (currMapX - left)) / (right - left)) | 0;
                    const sy2: number = (heightOffset + ((height - heightOffset) * (currMapY - top)) / (bottom - top)) | 0;

                    this.drawLineAlpha(sx1, sy1, sx2, sy2, 0x00ff00, alpha);
                }
            }

            const screenX: number = (widthOffset + ((width - widthOffset) * (mapX - left)) / (right - left)) | 0;
            const screenY: number = (heightOffset + ((height - heightOffset) * (mapY - top)) / (bottom - top)) | 0;

            if (screenX < 0 || screenX >= width || screenY < 0 || screenY >= height) continue;

            Pix2D.fillCircle(screenX, screenY, 3, 0xffff00, 256);

            if (this.zoom >= 6 && this.b12) {
                this.b12.centreString(p.name, screenX + 1, screenY - 6, 0);
                this.b12.centreString(p.name, screenX, screenY - 7, 0xffffff);
            }
        }
    }

    // ----

    dragging = false;
    activePointerId: number | null = null;

    override mouseDown(x: number, y: number, e: MouseEvent) {
        this.nextMouseClickX = x;
        this.nextMouseClickY = y;

        this.mouseX = x;
        this.mouseY = y;
        this.cursorCoordinatesDirty = true;
        this.redrawTimer = 0;

        if (e.button === 2) {
            this.nextMouseClickButton = 2;
            this.mouseButton = 2;
        } else {
            this.nextMouseClickButton = 1;
            this.mouseButton = 1;
            canvas.style.cursor = 'grabbing';
            this.dragging = true;
        }

        // e.preventDefault();
    }

    override mouseUp(x: number, y: number, _e: MouseEvent) {
        this.dragging = false;
        canvas.style.cursor = 'grab';

        this.mouseX = x;
        this.mouseY = y;
        this.mouseButton = 0;
        this.nextMouseClickX = -1;
        this.nextMouseClickY = -1;
        this.nextMouseClickButton = 0;
        this.cursorCoordinatesDirty = true;
        this.redrawTimer = 0;

        // e.preventDefault();
    }

    override pointerDown(x: number, y: number, _e: PointerEvent) {
        this.idleTimer = performance.now();
        this.mouseX = x;
        this.mouseY = y;
        this.mouseButton = 1;
        this.nextMouseClickX = x;
        this.nextMouseClickY = y;
        this.nextMouseClickButton = 1;
        this.cursorCoordinatesDirty = true;
        this.redrawTimer = 0;
    }

    override pointerUp(x: number, y: number, _e: PointerEvent) {
        this.mouseX = x;
        this.mouseY = y;
        this.mouseButton = 0;
        this.nextMouseClickX = -1;
        this.nextMouseClickY = -1;
        this.nextMouseClickButton = 0;
        this.cursorCoordinatesDirty = true;
        this.redrawTimer = 0;
    }

    override pointerEnter(x: number, y: number) {
        this.mouseX = x;
        this.mouseY = y;
        this.cursorCoordinatesDirty = true;
        this.redrawTimer = 0;
    }

    override pointerLeave() {
        this.mouseX = -1;
        this.mouseY = -1;
        this.cursorCoordinatesDirty = true;
        this.redrawTimer = 0;
    }

    override pointerMove(x: number, y: number, _e: PointerEvent) {
        if (!this.dragging) {
            this.mouseX = x;
            this.mouseY = y;
            this.cursorCoordinatesDirty = true;
            this.redrawTimer = 0;
        }
    }

    override windowMouseUp(_e: MouseEvent) {
        this.dragging = false;
        canvas.style.cursor = 'grab';

        this.mouseButton = 0;
        this.nextMouseClickX = -1;
        this.nextMouseClickY = -1;
        this.nextMouseClickButton = 0;
        this.cursorCoordinatesDirty = true;
        this.redrawTimer = 0;
    }

    override windowMouseMove(e: MouseEvent) {
        if (this.dragging) {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) | 0;
            const y = (e.clientY - rect.top) | 0;

            this.mouseX = x;
            this.mouseY = y;
            this.cursorCoordinatesDirty = true;
            this.redrawTimer = 0;
        }
    }
}
