import { playWave, setWaveVolume } from '#3rdparty/audio.js';
import { stopMidi, setMidiVolume, playMidi } from '#3rdparty/tinymidipcm.js';

import ClientBuild from '#/client/ClientBuild.js';
import { ClientCode } from '#/client/ClientCode.js';
import GameShell from '#/client/GameShell.js';
import { MiniMenuAction } from '#/client/MiniMenuAction.js';
import MobileKeyboard from '#/client/MobileKeyboard.js';
import MouseTracking from '#/client/MouseTracking.js';
import Skill from '#/client/Skill.js';
import TitleFlames from '#/client/TitleFlames.js';

import FloType from '#/config/FloType.js';
import SeqType, { PostanimMove, PreanimMove, RestartMode } from '#/config/SeqType.js';
import LocType from '#/config/LocType.js';
import ObjType from '#/config/ObjType.js';
import NpcType from '#/config/NpcType.js';
import IdkType from '#/config/IdkType.js';
import SpotType from '#/config/SpotType.js';
import VarpType from '#/config/VarpType.js';
import VarBitType from '#/config/VarBitType.js';
import IfType from '#/config/IfType.js';
import { ComponentType, ButtonType } from '#/config/IfType.js';

import ClientEntity from '#/dash3d/ClientEntity.js';
import ClientLocAnim from '#/dash3d/ClientLocAnim.js';
import ClientNpc, { NpcUpdate } from '#/dash3d/ClientNpc.js';
import ClientObj from '#/dash3d/ClientObj.js';
import ClientPlayer, { PlayerUpdate } from '#/dash3d/ClientPlayer.js';
import ClientProj from '#/dash3d/ClientProj.js';
import CollisionMap, { BuildArea } from '#/dash3d/CollisionMap.js';
import { CollisionFlag } from '#/dash3d/CollisionFlag.js';
import { DirectionFlag } from '#/dash3d/DirectionFlag.js';
import { LocAngle } from '#/dash3d/LocAngle.js';
import LocChange from '#/dash3d/LocChange.js';
import { LocLayer } from '#/dash3d/LocLayer.js';
import { LocShape, LOC_SHAPE_TO_LAYER } from '#/dash3d/LocShape.js';
import { MapFlag } from '#/dash3d/MapFlag.js';
import MapSpotAnim from '#/dash3d/MapSpotAnim.js';
import World from '#/dash3d/World.js';

import JString from '#/datastruct/JString.js';
import LinkList from '#/datastruct/LinkList.js';

import { Int32Array2d, TypedArray1d, TypedArray3d, Int32Array3d, Uint8Array3d } from '#/util/Arrays.js';
import { downloadUrl, sleep } from '#/util/JsUtil.js';

import AnimFrame from '#/dash3d/AnimFrame.js';
import { canvas2d } from '#/graphics/Canvas.js';
import { Colour } from '#/graphics/Colour.js';
import Pix2D from '#/graphics/Pix2D.js';
import Pix3D from '#/dash3d/Pix3D.js';
import Model from '#/dash3d/Model.js';
import Pix8 from '#/graphics/Pix8.js';
import Pix32 from '#/graphics/Pix32.js';
import PixFont from '#/graphics/PixFont.js';
import PixMap from '#/graphics/PixMap.js';

import ClientStream from '#/io/ClientStream.js';
import { ClientProt } from '#/io/ClientProt.js';
import Database from '#/io/Database.js';
import Isaac from '#/io/Isaac.js';
import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';
import OnDemand from '#/io/OnDemand.js';
import { ServerProt, ServerProtSizes } from '#/io/ServerProt.js';

import { reverseDnsLookup } from '#/util/WebDns.js';

import WordFilter from '#/wordfilter/WordFilter.js';
import WordPack from '#/wordfilter/WordPack.js';

import JagFX from '#/sound/JagFX.js';

// Bot SDK is conditionally included based on build flag
declare const process: { env: { ENABLE_BOT_SDK?: string; SECURE_ORIGIN?: string; LOGIN_RSAN?: string; LOGIN_RSAE?: string } };
const ENABLE_BOT_SDK = process.env.ENABLE_BOT_SDK === 'true';

// Conditional Bot SDK import - will be tree-shaken in standard build
import * as BotSDKModule from '#/bot/index.js';
const BotOverlay = ENABLE_BOT_SDK ? BotSDKModule.BotOverlay : null;

const CLIENT_VERSION = 274;

const MAX_PLAYER_COUNT = 2048;
const LOCAL_PLAYER_INDEX = 2047;

const MAX_CHATS = 50;
const CHAT_COLOURS = [Colour.YELLOW, Colour.RED, Colour.GREEN, Colour.CYAN, Colour.MAGENTA, Colour.WHITE];

const SCROLLBAR_TRACK = 0x23201b;
const SCROLLBAR_GRIP_FOREGROUND = 0x4d4233;
const SCROLLBAR_GRIP_HIGHLIGHT = 0x766654;
const SCROLLBAR_GRIP_LOWLIGHT = 0x332d25;

export class Client extends GameShell {
    static nodeId: number = 10;
    static memServer: boolean = true;
    static lowMem: boolean = false;

    static cyclelogic1: number = 0;
    static cyclelogic2: number = 0;
    static cyclelogic3: number = 0;
    static cyclelogic4: number = 0;
    static cyclelogic5: number = 0;
    static cyclelogic6: number = 0;
    static cyclelogic7: number = 0;
    static cyclelogic8: number = 0;
    static cyclelogic9: number = 0;
    static cyclelogic10: number = 0;

    static oplogic1: number = 0;
    static oplogic2: number = 0;
    static oplogic3: number = 0;
    static oplogic4: number = 0;
    static oplogic5: number = 0;
    static oplogic6: number = 0;
    static oplogic7: number = 0;
    static oplogic8: number = 0;
    static oplogic9: number = 0;
    static oplogic10: number = 0;

    static loopCycle: number = 0;
    static drawCycle: number = 0;

    static CHARSET: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!\"£$%^&*()-_=+[{]};:'@#~,<.>/?\\| ";

    static readbit = new Int32Array(32);
    static levelExperience: number[] = [];

    static {
        let n = 2;
        for (let bit = 0; bit < 32; bit++) {
            Client.readbit[bit] = n - 1;
            n += n;
        }

        let acc: number = 0;
        for (let i: number = 0; i < 99; i++) {
            const level: number = i + 1;
            // Curve shape must match the engine (Player.ts uses level/10.0, our custom curve).
            // NOTE: no *10 here — the engine stores XP in ×10 "fine" units and its table has *10,
            // but the server sends the client REAL xp (÷10), so the client table is in real-xp units.
            const delta: number = (level + Math.pow(2.0, level / 10.0) * 300.0) | 0;
            acc += delta;
            Client.levelExperience[i] = (acc / 4) | 0;
        }
    }

    private alreadyStarted: boolean = false;
    private errorStarted: boolean = false;
    private errorLoading: boolean = false;
    private errorHost: boolean = false;
    private errorMessage: string | null = null;
    private lastProgressPercent: number = 0;
    private lastProgressMessage: string = '';

    ingame: boolean = false;

    private prevMouseClickTime: number = 0;
    private mouseTracked: boolean = false;
    private mouseTracking: MouseTracking = new MouseTracking(this);
    private mouseTrackingInterval: ReturnType<typeof setInterval> | null = null;
    private mouseTrackedX: number = 0;
    private mouseTrackedY: number = 0;
    private mouseTrackDelta: number = 0;
    private focusIn: boolean = false;

    private showFps: boolean = false;
    private rebootTimer: number = 0;

    private hintType: number = 0;
    private hintNpc: number = 0;
    private hintPlayer: number = 0;
    private hintTileX: number = 0;
    private hintTileZ: number = 0;
    private hintHeight: number = 0;
    private hintOffsetX: number = 0;
    private hintOffsetZ: number = 0;

    private lastAddress: number = 0;
    private dnsReq: string | null = null;
    private daysSinceLastLogin: number = 0;
    private daysSinceRecoveriesChanged: number = 0;
    private unreadMessages: number = 0;
    private warnMembersInNonMembers: number = 0;

    private onDemand: OnDemand | null = null;
    public db: Database | null = null;
    private jagChecksum: number[] = [];

    private npc: (ClientNpc | null)[] = new TypedArray1d(16384, null);
    private npcCount: number = 0;
    private npcIds: Int32Array = new Int32Array(16384);

    private stream: ClientStream | null = null;
    private loginSeed: bigint = 0n;
    private randomIn: Isaac | null = null;
    private out: Packet = Packet.alloc(1);
    private loginout: Packet = Packet.alloc(1);
    private in: Packet = Packet.alloc(1);
    private psize: number = 0;
    private ptype: number = 0;
    private timeoutTimer: number = 0;
    private noTimeoutTimer: number = 0;
    private logoutTimer: number = 0;
    private ptype0: number = 0;
    private ptype1: number = 0;
    private ptype2: number = 0;

    private title: JagFile | null = null;
    private p11: PixFont | null = null;
    private p12: PixFont | null = null;
    private b12: PixFont | null = null;
    private q8: PixFont | null = null;

    private mapBuildBaseX: number = 0;
    private mapBuildBaseZ: number = 0;
    private mapBuildPrevBaseX: number = 0;
    private mapBuildPrevBaseZ: number = 0;
    private sceneState: number = 0;
    private sceneLoadStartTime: number = 0;
    private withinTutorialIsland: boolean = false;
    private awaitingPlayerInfo: boolean = false;
    private mapBuildCentreZoneX: number = 0;
    private mapBuildCentreZoneZ: number = 0;
    private mapBuildIndex: Int32Array | null = null;
    private mapBuildGroundFile: number[] = [];
    private mapBuildLocationFile: number[] = [];
    private mapBuildGroundData: (Uint8Array | null)[] | null = null;
    private mapBuildLocationData: (Uint8Array | null)[] | null = null;
    private world: World | null = null;
    private mapl: Uint8Array[][] | null = null;
    private groundh: Int32Array[][] | null = null;
    private collision: (CollisionMap | null)[] = new TypedArray1d(BuildArea.LEVELS, null);
    private textureBuffer: Int8Array = new Int8Array(16384);

    private zoneUpdateX: number = 0;
    private zoneUpdateZ: number = 0;

    private tryMoveNearest: number = 0;
    private dirMap: Int32Array = new Int32Array(BuildArea.SIZE * BuildArea.SIZE);
    private distMap: Int32Array = new Int32Array(BuildArea.SIZE * BuildArea.SIZE);
    private routeX: Int32Array = new Int32Array(4000);
    private routeZ: Int32Array = new Int32Array(4000);

    private macroCameraX: number = 0;
    private macroCameraXModifier: number = 2;
    private macroCameraZ: number = 0;
    private macroCameraZModifier: number = 2;
    private macroCameraAngle: number = 0;
    private macroCameraAngleModifier: number = 1;
    private macroCameraCycle: number = 0;
    private macroMinimapAngle: number = 0;
    private macroMinimapAngleModifier: number = 2;
    private macroMinimapZoom: number = 0;
    private macroMinimapZoomModifier: number = 1;
    private macroMinimapCycle: number = 0;

    private worldUpdateNum: number = 0;

    private minimap: Pix32 | null = null;
    private compass: Pix32 | null = null;
    private mapedge: Pix32 | null = null;
    private mapscene: (Pix8 | null)[] = new TypedArray1d(50, null);
    private mapfunction: (Pix32 | null)[] = new TypedArray1d(50, null);
    private hitmarks: (Pix32 | null)[] = new TypedArray1d(20, null);
    private headicons: (Pix32 | null)[] = new TypedArray1d(20, null);
    private mapmarker1: Pix32 | null = null;
    private mapmarker2: Pix32 | null = null;
    private cross: (Pix32 | null)[] = new TypedArray1d(8, null);
    private mapdots1: Pix32 | null = null;
    private mapdots2: Pix32 | null = null;
    private mapdots3: Pix32 | null = null;
    private mapdots4: Pix32 | null = null;
    private scrollbar1: Pix8 | null = null;
    private scrollbar2: Pix8 | null = null;
    private modIcons: Pix8[] = [];

    private redrawFrame: boolean = true;

    private imageTitle2: PixMap | null = null;
    private imageTitle3: PixMap | null = null;
    private imageTitle4: PixMap | null = null;
    private imageTitle0: PixMap | null = null;
    private imageTitle1: PixMap | null = null;
    private imageTitle5: PixMap | null = null;
    private imageTitle6: PixMap | null = null;
    private imageTitle7: PixMap | null = null;
    private imageTitle8: PixMap | null = null;
    private imageTitlebox: Pix8 | null = null;
    private imageTitlebutton: Pix8 | null = null;
    private loginscreen: number = 0;
    private loginSelect: number = 0;
    private loginMes1: string = '';
    private loginMes2: string = '';
    private loginUser: string = '';
    private loginPass: string = '';

    private imageRunes: Pix8[] = [];
    private titleFlames: TitleFlames | null = null;

    private areaSide: PixMap | null = null;
    private areaMap: PixMap | null = null;
    private areaGame: PixMap | null = null;
    private areaChat: PixMap | null = null;
    private areaBackbase1: PixMap | null = null;
    private areaBackbase2: PixMap | null = null;
    private areaBackhmid1: PixMap | null = null;
    private areaBackleft1: PixMap | null = null;
    private areaBackleft2: PixMap | null = null;
    private areaBackright1: PixMap | null = null;
    private areaBackright2: PixMap | null = null;
    private areaBacktop1: PixMap | null = null;
    private areaBackvmid1: PixMap | null = null;
    private areaBackvmid2: PixMap | null = null;
    private areaBackvmid3: PixMap | null = null;
    private areaBackhmid2: PixMap | null = null;
    private chatScanline: Int32Array | null = null;
    private sideScanline: Int32Array | null = null;
    private gameScanline: Int32Array | null = null;
    private invback: Pix8 | null = null;
    private chatback: Pix8 | null = null;
    private backbase1: Pix8 | null = null;
    private backbase2: Pix8 | null = null;
    private backhmid1: Pix8 | null = null;
    private sideicons: (Pix8 | null)[] = new TypedArray1d(13, null);
    private redstone1: Pix8 | null = null;
    private redstone2: Pix8 | null = null;
    private redstone3: Pix8 | null = null;
    private redstone1h: Pix8 | null = null;
    private redstone2h: Pix8 | null = null;
    private redstone1v: Pix8 | null = null;
    private redstone2v: Pix8 | null = null;
    private redstone3v: Pix8 | null = null;
    private redstone1hv: Pix8 | null = null;
    private redstone2hv: Pix8 | null = null;
    private redrawSide: boolean = false;
    private redrawChat: boolean = false;
    private redrawIcons: boolean = false;
    private redrawChatMode: boolean = false;

    private mapback: Pix8 | null = null;
    private compassMaskLineOffsets: Int32Array = new Int32Array(33);
    private compassMaskLineLengths: Int32Array = new Int32Array(33);
    private minimapMaskLineOffsets: Int32Array = new Int32Array(151);
    private minimapMaskLineLengths: Int32Array = new Int32Array(151);

    private scrollGrabbed: boolean = false;
    private scrollInputPadding: number = 0;
    private scrollCycle: number = 0;

    private camX: number = 0;
    private camY: number = 0;
    private camZ: number = 0;
    private camPitch: number = 0;
    private camYaw: number = 0;
    private orbitCameraPitch: number = 200;
    private orbitCameraYaw: number = 0;
    private orbitCameraYawVelocity: number = 0;
    private orbitCameraPitchVelocity: number = 0;
    private orbitCameraX: number = 0;
    private orbitCameraZ: number = 0;
    private sendCameraDelay: number = 0;
    private sendCamera: boolean = false;
    private cameraPitchClamp: number = 0;

    private chatCount: number = 0;
    private chatX: Int32Array = new Int32Array(MAX_CHATS);
    private chatY: Int32Array = new Int32Array(MAX_CHATS);
    private chatHeight: Int32Array = new Int32Array(MAX_CHATS);
    private chatWidth: Int32Array = new Int32Array(MAX_CHATS);
    private chatColour: Int32Array = new Int32Array(MAX_CHATS);
    private chatEffect: Int32Array = new Int32Array(MAX_CHATS);
    private chatTimer: Int32Array = new Int32Array(MAX_CHATS);
    private chats: (string | null)[] = new TypedArray1d(MAX_CHATS, null);

    private tileLastOccupiedCycle: Int32Array[] = new Int32Array2d(BuildArea.SIZE, BuildArea.SIZE);
    private sceneCycle: number = 0;

    private projectX: number = 0;
    private projectY: number = 0;

    private crossX: number = 0;
    private crossY: number = 0;
    private crossCycle: number = 0;
    private crossMode: number = 0;

    private selectedArea: number = 0;
    private selectedComId: number = 0;
    private selectedItem: number = 0;
    private selectedCycle: number = 0;

    private objDragArea: number = 0;
    private objDragComId: number = 0;
    private hoveredSlotComId: number = 0;
    private objDragSlot: number = 0;
    private objGrabX: number = 0;
    private objGrabY: number = 0;
    private hoveredSlot: number = 0;
    private objGrabThreshold: boolean = false;
    private objDragCycles: number = 0;

    private inMultizone: number = 0;
    private chatDisabled: number = 0;

    private players: (ClientPlayer | null)[] = new TypedArray1d(MAX_PLAYER_COUNT, null);
    private playerCount: number = 0;
    private playerIds: Int32Array = new Int32Array(MAX_PLAYER_COUNT);

    private entityUpdateCount: number = 0;
    private entityUpdateIds: Int32Array = new Int32Array(MAX_PLAYER_COUNT);
    private playerAppearanceBuffer: (Packet | null)[] = new TypedArray1d(MAX_PLAYER_COUNT, null);

    private minusedlevel: number = 0;
    private selfSlot: number = -1;
    private localPlayer: ClientPlayer | null = null;
    private membersAccount: number = 0;

    private entityRemovalCount: number = 0;
    private entityRemovalIds: Int32Array = new Int32Array(1000);

    private playerOp: (string | null)[] = new TypedArray1d(5, null);
    private playerOpPriority: boolean[] = new TypedArray1d(5, false);

    private groundObj: (LinkList<ClientObj> | null)[][][] = new TypedArray3d(BuildArea.LEVELS, BuildArea.SIZE, BuildArea.SIZE, null);
    private locChanges: LinkList<LocChange> = new LinkList();
    private projectiles: LinkList<ClientProj> = new LinkList();
    private spotanims: LinkList<MapSpotAnim> = new LinkList();

    private statEffectiveLevel: Int32Array = new Int32Array(Skill.count);
    private statBaseLevel: Int32Array = new Int32Array(Skill.count);
    private statXP: Int32Array = new Int32Array(Skill.count);

    private oneMouseButton: number = 0;
    private isMenuOpen: boolean = false;
    private menuNumEntries: number = 0;
    private menuArea: number = 0;
    private menuX: number = 0;
    private menuY: number = 0;
    private menuWidth: number = 0;
    private menuHeight: number = 0;
    private menuParamB: Int32Array = new Int32Array(500);
    private menuParamC: Int32Array = new Int32Array(500);
    private menuAction: Int32Array = new Int32Array(500);
    private menuParamA: Int32Array = new Int32Array(500);
    private menuOption: string[] = [];

    private useMode: number = 0;
    private objComId: number = 0;
    private objSelectedName: string | null = null;
    private objSelectedComId: number = 0;
    private objSelectedSlot: number = 0;

    private targetMode: number = 0;
    private targetComId: number = 0;
    private targetMask: number = 0;
    private targetOp: string | null = null;

    private chatModalId: number = -1;
    private mainModalId: number = -1;
    private sideModalId: number = -1;
    private mainOverlayId: number = -1;
    private lastOverComId: number = 0;
    private overChatComId: number = 0;
    private overMainComId: number = 0;
    private overSideComId: number = 0;
    private activeIcon: number = 3;
    private sideIcon: number[] = [
        -1, -1, -1,
        -1, -1, -1,
        -1, -1, -1,
        -1, -1, -1,
        -1, -1, -1
    ];
    private tutComId: number = -1;
    private tutComMessage: string | null = null;
    private tutFlashIcon: number = -1;

    private chatEffects: number = 0;
    private splitPrivateChat: number = 0;
    private bankArrangeMode: number = 0;

    private resumedPauseButton: boolean = false;
    private runenergy: number = 0;
    private runweight: number = 0;
    private staffmodlevel: number = 0;
    private var: number[] = [];
    private varServ: number[] = [];

    private chatInterface: IfType = new IfType();
    private chatScrollHeight: number = 78;
    private chatScrollPos: number = 0;
    private chatInput: string = '';
    private chatType: Int32Array = new Int32Array(100);
    private chatUsername: (string | null)[] = new TypedArray1d(100, null);
    private chatText: (string | null)[] = new TypedArray1d(100, null);
    private messageTick: Int32Array = new Int32Array(100);  // Track when each message arrived
    // Dialog history storage (similar to message history)
    private dialogHistory: Array<{ text: string[]; tick: number; interfaceId: number }> = [];
    private dialogHistoryMax: number = 10;
    private lastCapturedDialogId: number = -1;
    private chatPublicMode: number = 0;
    private chatPrivateMode: number = 0;
    private chatTradeMode: number = 0;
    private privateMessageIds: Int32Array = new Int32Array(100);
    private privateMessageCount: number = 0;

    private socialUserhash: bigint | null = null;
    private socialInputOpen: boolean = false;
    private socialInput: string = '';
    private socialInputType: number = 0;
    private socialInputHeader: string = '';

    private dialogInputOpen: boolean = false;
    private dialogInput: string = '';

    private reportAbuseInput: string = '';
    private reportAbuseMuteOption: boolean = false;
    private reportAbuseComId: number = -1;

    private minimapState: number = 0;
    private minimapLevel: number = -1;
    private activeMapFunctionCount: number = 0;
    private activeMapFunctionX: Int32Array = new Int32Array(1000);
    private activeMapFunctionZ: Int32Array = new Int32Array(1000);
    private activeMapFunctions: (Pix32 | null)[] = new TypedArray1d(1000, null);
    private minimapFlagX: number = 0;
    private minimapFlagZ: number = 0;

    private midiActive: boolean = true;
    private midiVolume: number = 0;
    private midiSong: number = -1;
    private nextMidiSong: number = -1;
    private nextMusicDelay: number = 0;
    private midiFading: boolean = true;

    private waveEnabled: boolean = true;
    private waveVolume: number = 0;
    private waveCount: number = 0;
    private waveIds: Int32Array = new Int32Array(50);
    private waveLoops: Int32Array = new Int32Array(50);
    private waveDelay: Int32Array = new Int32Array(50);
    private lastWaveId: number = -1;
    private lastWaveLoops: number = -1;
    private lastWaveLength: number = 0;
    private lastWaveStartTime: number = 0;

    private cinemaCam: boolean = false;
    private camShake: boolean[] = new TypedArray1d(5, false);
    private camShakeAxis: Int32Array = new Int32Array(5);
    private camShakeRan: Int32Array = new Int32Array(5);
    private camShakeAmp: Int32Array = new Int32Array(5);
    private camShakeCycle: Int32Array = new Int32Array(5);
    private camMoveToLx: number = 0;
    private camMoveToLz: number = 0;
    private camMoveToHei: number = 0;
    private camMoveToRate: number = 0;
    private camMoveToRate2: number = 0;
    private camLookAtLx: number = 0;
    private camLookAtLz: number = 0;
    private camLookAtHei: number = 0;
    private camLookAtRate: number = 0;
    private camLookAtRate2: number = 0;

    private friendCount: number = 0;
    private friendServerStatus: number = 0;
    private friendUsername: (string | null)[] = new TypedArray1d(200, null);
    private friendUserhash: BigInt64Array = new BigInt64Array(200);
    private friendNodeId: Int32Array = new Int32Array(200);

    private ignoreCount: number = 0;
    private ignoreUserhash: bigint[] = [];

    private idkDesignGender: boolean = true;
    private idkDesignRedraw: boolean = false;
    private idkDesignPart: Int32Array = new Int32Array(7);
    private idkDesignColour: Int32Array = new Int32Array(5);
    private idkDesignButton1: Pix32 | null = null;
    private idkDesignButton2: Pix32 | null = null;
    private readonly searchParams: URLSearchParams;

    // rs-sdk: Bot SDK overlay for bot development (dynamically loaded when enabled)
    private botOverlay: InstanceType<typeof import('#/bot/index.js').BotOverlay> | null = null;
    private botAutoLoginAttempted: boolean = false;
    private loginInProgress: boolean = false;

    // rs-sdk: Callback fired when a game tick is received (PLAYER_INFO packet processed)
    private onGameTickCallback: (() => void) | null = null;

    // rs-sdk: Adaptive tick speed: measures real server tick interval to scale client movement
    private lastTickTime: number = 0;
    private measuredTickInterval: number = 420;
    tickSpeedMultiplier: number = 1;

    // ----

    constructor(nodeid: number, lowmem: boolean, members: boolean) {
        super();
        this.searchParams = new URLSearchParams(window.location.search);

        if (typeof nodeid === 'undefined' || typeof lowmem === 'undefined' || typeof members === 'undefined') {
            return;
        }

        console.log(`RS2 user client - release #${CLIENT_VERSION}`);

        Client.nodeId = nodeid;
        Client.memServer = members;

        if (lowmem) {
            Client.setLowMem();
        } else {
            Client.setHighMem();
        }

        this.run();
    }

    // === BOT SDK PUBLIC METHODS ===

    // Packet logging for debugging
    private packetLog: Array<{ timestamp: number; opcode: number; name: string; size: number; data: string }> = [];
    private packetLogEnabled: boolean = false;
    private packetLogCallback: ((entry: { timestamp: number; opcode: number; name: string; size: number; data: string }) => void) | null = null;
    private static readonly PACKET_NAMES: { [key: number]: string } = {
        239: 'NO_TIMEOUT', 144: 'IDLE_TIMER', 142: 'EVENT_TRACKING',
        141: 'OPOBJ1', 67: 'OPOBJ2', 178: 'OPOBJ3', 47: 'OPOBJ4', 97: 'OPOBJ5', 202: 'OPOBJT', 245: 'OPOBJU',
        143: 'OPNPC1', 195: 'OPNPC2', 69: 'OPNPC3', 122: 'OPNPC4', 118: 'OPNPC5', 231: 'OPNPCT', 119: 'OPNPCU',
        33: 'OPLOC1', 213: 'OPLOC2', 98: 'OPLOC3', 87: 'OPLOC4', 147: 'OPLOC5', 26: 'OPLOCT', 240: 'OPLOCU',
        192: 'OPPLAYER1', 17: 'OPPLAYER2', 18: 'OPPLAYER3', 72: 'OPPLAYER4', 68: 'OPPLAYERT', 113: 'OPPLAYERU',
        243: 'OPHELD1', 228: 'OPHELD2', 80: 'OPHELD3', 163: 'OPHELD4', 74: 'OPHELD5', 102: 'OPHELDT', 200: 'OPHELDU',
        181: 'INV_BUTTON1', 70: 'INV_BUTTON2', 59: 'INV_BUTTON3', 160: 'INV_BUTTON4', 62: 'INV_BUTTON5',
        244: 'IF_BUTTON', 146: 'RESUME_PAUSEBUTTON', 58: 'CLOSE_MODAL', 161: 'RESUME_P_COUNTDIALOG', 201: 'TUT_CLICKSIDE',
        127: 'MOVE_OPCLICK', 220: 'MOVE_MINIMAPCLICK', 176: 'INV_BUTTOND',
        193: 'IGNORELIST_DEL', 189: 'IGNORELIST_ADD', 13: 'IDK_SAVEDESIGN', 129: 'CHAT_SETMODE',
        214: 'MESSAGE_PRIVATE', 84: 'FRIENDLIST_DEL', 9: 'FRIENDLIST_ADD', 86: 'CLIENT_CHEAT',
        83: 'MESSAGE_PUBLIC', 6: 'MOVE_GAMECLICK'
    };

    /**
     * Enable or disable packet logging
     */
    setPacketLogging(enabled: boolean): void {
        this.packetLogEnabled = enabled;
    }

    /**
     * Check if packet logging is enabled
     */
    isPacketLoggingEnabled(): boolean {
        return this.packetLogEnabled;
    }

    /**
     * Get all logged packets
     */
    getPacketLog(): Array<{ timestamp: number; opcode: number; name: string; size: number; data: string }> {
        return [...this.packetLog];
    }

    /**
     * Clear the packet log
     */
    clearPacketLog(): void {
        this.packetLog = [];
    }

    /**
     * Set a callback for when packets are logged (for real-time UI updates)
     */
    setPacketLogCallback(callback: ((entry: { timestamp: number; opcode: number; name: string; size: number; data: string }) => void) | null): void {
        this.packetLogCallback = callback;
    }

    /**
     * Set a callback for when a game tick is received (PLAYER_INFO packet processed).
     * This fires once per server tick (~420ms), allowing SDK to sync state on actual game ticks.
     */
    setOnGameTickCallback(callback: (() => void) | null): void {
        this.onGameTickCallback = callback;
    }

    /**
     * Internal method to log a packet
     */
    private logPacket(opcode: number, dataBytes: number[]): void {
        if (!this.packetLogEnabled) return;

        const name = Client.PACKET_NAMES[opcode] || `UNKNOWN_${opcode}`;

        // Convert packet data to hex string
        const hexData = dataBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');

        const entry = {
            timestamp: Date.now(),
            opcode,
            name,
            size: dataBytes.length,
            data: hexData
        };

        this.packetLog.push(entry);

        // Keep log size reasonable
        if (this.packetLog.length > 500) {
            this.packetLog = this.packetLog.slice(-250);
        }

        // Call the callback if set
        if (this.packetLogCallback) {
            this.packetLogCallback(entry);
        }
    }

    // Track current packet being built for logging
    private currentPacketOpcode: number = -1;
    private currentPacketStart: number = 0;

    /**
     * Write a packet opcode with logging support
     * Use this instead of direct p1Enc for bot SDK methods
     */
    private writePacketOpcode(opcode: number): void {
        this.currentPacketOpcode = opcode;
        this.currentPacketStart = this.out.pos;
        this.out.p1Enc(opcode);
    }

    /**
     * Set login credentials for auto-login functionality
     * Used by bot SDK to programmatically log in
     */
    setCredentials(username: string, password: string): void {
        this.loginUser = username;
        this.loginPass = password;
    }

    /**
     * Get current login credentials
     */
    getCredentials(): { username: string; password: string } {
        return { username: this.loginUser, password: this.loginPass };
    }

    /**
     * Trigger login attempt with current credentials
     * Call setCredentials first, then call this when on the login screen
     */
    async triggerLogin(): Promise<void> {
        if (this.loginUser && this.loginPass && !this.ingame) {
            await this.login(this.loginUser, this.loginPass, false);
        }
    }

    /**
     * Check if client is currently in game
     */
    isInGame(): boolean {
        return this.ingame;
    }

    /**
     * Get the current title screen state
     * 0 = main menu (Existing User button), 2 = login form, 3 = new user
     */
    getTitleState(): number {
        return this.loginscreen;
    }

    /**
     * Navigate to the login form (simulates clicking "Existing User")
     * Only works when on title screen state 0
     */
    goToLoginScreen(): boolean {
        if (this.loginscreen === 0) {
            this.loginscreen = 2;
            this.loginSelect = 0;
            return true;
        }
        return false;
    }

    /**
     * Fully autonomous login - handles all states automatically
     * Sets credentials, navigates to login screen, and logs in
     */
    async autoLogin(username: string, password: string): Promise<void> {
        this.loginUser = username;
        this.loginPass = password;

        // If already in game or login already in progress, nothing to do
        if (this.ingame || this.loginInProgress) {
            return;
        }

        // Wait for loading to complete (100%) before triggering login
        // This prevents a race condition where login completes while assets are still unpacking
        while (this.lastProgressPercent < 100) {
            await sleep(100);
        }

        // If on main menu (state 0), go to login screen
        if (this.loginscreen === 0) {
            this.loginscreen = 2;
            this.loginSelect = 0;
        }

        // If on login screen (state 2), trigger login
        if (this.loginscreen === 2) {
            this.loginInProgress = true;
            try {
                await this.login(this.loginUser, this.loginPass, false);
            } finally {
                this.loginInProgress = false;
            }
        }
    }

    /**
     * Accept character design with current settings
     * Sends the IDK_SAVEDESIGN packet to finalize the character
     */
    acceptCharacterDesign(): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        this.writePacketOpcode(ClientProt.IDK_SAVEDESIGN);
        this.out.p1(this.idkDesignGender ? 0 : 1);

        for (let i = 0; i < 7; i++) {
            this.out.p1(this.idkDesignPart[i]);
        }

        for (let i = 0; i < 5; i++) {
            this.out.p1(this.idkDesignColour[i]);
        }

        // IDK_SAVEDESIGN only sets the appearance. The on-screen "Accept" button is a
        // normal button (clientcode CC_ACCEPT_DESIGN) whose IF_BUTTON trigger
        // ([if_button,player_kit:accept]) is what closes the design interface and
        // advances the tutorial. A real click sends both; replicate the IF_BUTTON here.
        for (let i = 0; i < IfType.list.length; i++) {
            const com = IfType.list[i];
            if (com && com.clientCode === ClientCode.CC_ACCEPT_DESIGN) {
                this.writePacketOpcode(ClientProt.IF_BUTTON);
                this.out.p2(com.id);
                break;
            }
        }

        return true;
    }

    /**
     * Set character design parameters
     * @param gender true for male, false for female
     * @param body array of 7 body kit indices (or null to keep current)
     * @param colors array of 5 color indices (or null to keep current)
     */
    setCharacterDesign(gender: boolean, body: number[] | null, colors: number[] | null): boolean {
        this.idkDesignGender = gender;
        this.validateIdkDesign();

        if (body && body.length === 7) {
            for (let i = 0; i < 7; i++) {
                this.idkDesignPart[i] = body[i];
            }
        }

        if (colors && colors.length === 5) {
            for (let i = 0; i < 5; i++) {
                this.idkDesignColour[i] = colors[i];
            }
        }

        this.idkDesignRedraw = true;
        return true;
    }

    /**
     * Randomize character design with valid random values
     * @param gender optional gender (true=male, false=female), random if not provided
     */
    randomizeCharacterDesign(gender?: boolean): boolean {
        // Randomize gender if not specified
        this.idkDesignGender = gender ?? Math.random() < 0.5;

        // First validate to get default kits for this gender
        this.validateIdkDesign();

        // Now randomize each body part from valid options
        for (let part = 0; part < 7; part++) {
            const validKits: number[] = [];
            for (let j = 0; j < IdkType.list.length; j++) {
                if (!IdkType.list[j].disable && IdkType.list[j].part === part + (this.idkDesignGender ? 0 : 7)) {
                    validKits.push(j);
                }
            }
            if (validKits.length > 0) {
                this.idkDesignPart[part] = validKits[Math.floor(Math.random() * validKits.length)];
            }
        }

        // Randomize colors (using known color counts: 12, 16, 16, 6, 8)
        const colorCounts = [12, 16, 16, 6, 8];
        for (let i = 0; i < 5; i++) {
            this.idkDesignColour[i] = Math.floor(Math.random() * colorCounts[i]);
        }

        this.idkDesignRedraw = true;
        return true;
    }

    /**
     * Find an NPC by name in the nearby NPC list
     * Returns the NPC index for use with talkToNpc, or -1 if not found
     */
    findNpcByName(name: string): number {
        const nameLower = name.toLowerCase();

        for (let i = 0; i < this.npcCount; i++) {
            const npcIndex = this.npcIds[i];
            const n = this.npc[npcIndex];

            if (n && n.type && n.type.name) {
                if (n.type.name.toLowerCase().includes(nameLower)) {
                    return npcIndex;
                }
            }
        }

        return -1;
    }

    /**
     * Get all nearby NPCs with their details
     */
    getNearbyNpcs(): Array<{ index: number; name: string; options: string[] }> {
        const result: Array<{ index: number; name: string; options: string[] }> = [];

        for (let i = 0; i < this.npcCount; i++) {
            const npcIndex = this.npcIds[i];
            const n = this.npc[npcIndex];

            if (n && n.type) {
                const options: string[] = [];
                if (n.type.op) {
                    for (const op of n.type.op) {
                        if (op) options.push(op);
                    }
                }

                result.push({
                    index: npcIndex,
                    name: n.type.name || 'Unknown',
                    options
                });
            }
        }

        return result;
    }

    /**
     * Talk to an NPC by index (sends OPNPC1 - first option, usually "Talk-to")
     * Use findNpcByName to get the index
     */
    talkToNpc(npcIndex: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer || npcIndex < 0) {
            return false;
        }

        const n = this.npc[npcIndex];
        if (!n) {
            return false;
        }

        // Walk to the NPC first. In 274's client-routefinder mode the server expects the
        // client to send the route to an interaction target; without it the player never
        // moves and the server replies "I can't reach that!". Mirrors spellOnNpc/useItemOnNpc.
        this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], n.routeX[0], n.routeZ[0], false, 1, 1, 0, 0, 0, 2);

        // Send OPNPC1 packet (Talk-to)
        this.writePacketOpcode(ClientProt.OPNPC1);
        this.out.p2(npcIndex);

        return true;
    }

    /**
     * Interact with an NPC using a specific option (1-5)
     * Option 1 is usually "Talk-to", Option 2 might be "Pickpocket", etc.
     * Use getNearbyNpcs() to see available options for each NPC
     */
    interactNpc(npcIndex: number, optionIndex: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer || npcIndex < 0 || optionIndex < 1 || optionIndex > 5) {
            return false;
        }

        const n = this.npc[npcIndex];
        if (!n) {
            return false;
        }

        // Walk to the NPC first. In 274's client-routefinder mode the server expects the
        // client to send the route to an interaction target; without it the player never
        // moves and the server replies "I can't reach that!". Mirrors spellOnNpc/useItemOnNpc.
        this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], n.routeX[0], n.routeZ[0], false, 1, 1, 0, 0, 0, 2);

        // Send the appropriate OPNPC packet based on option index
        const opcodes = [
            ClientProt.OPNPC1,
            ClientProt.OPNPC2,
            ClientProt.OPNPC3,
            ClientProt.OPNPC4,
            ClientProt.OPNPC5
        ];
        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(npcIndex);

        return true;
    }

    /**
     * Interact with a player using a specific option (1-4)
     * Option 2 is Attack (wilderness only), Option 3 is Follow, Option 4 is Trade
     */
    interactPlayer(playerIndex: number, optionIndex: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer || playerIndex < 0 || optionIndex < 1 || optionIndex > 4) {
            return false;
        }

        const p = this.players[playerIndex];
        if (!p) {
            return false;
        }

        // Walk to the player first. In 274's client-routefinder mode the server expects the
        // client to send the route to an interaction target; without it the player never
        // moves and the server replies "I can't reach that!". Mirrors spellOnNpc/useItemOnNpc.
        this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], p.routeX[0], p.routeZ[0], false, 1, 1, 0, 0, 0, 2);

        const opcodes = [
            ClientProt.OPPLAYER1,
            ClientProt.OPPLAYER2,
            ClientProt.OPPLAYER3,
            ClientProt.OPPLAYER4
        ];
        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(playerIndex);

        return true;
    }

    /**
     * Cast a spell on an NPC (sends OPNPCT)
     * Used for magic combat spells like Wind Strike
     *
     * npcIndex: the index of the NPC to target
     * spellComponent: the interface component ID of the spell (e.g., 1152 for Wind Strike)
     */
    spellOnNpc(npcIndex: number, spellComponent: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer || npcIndex < 0) {
            return false;
        }

        const n = this.npc[npcIndex];
        if (!n) {
            return false;
        }

        // Try to move towards the NPC
        this.tryMove(
            this.localPlayer.routeX[0],
            this.localPlayer.routeZ[0],
            n.routeX[0],
            n.routeZ[0],
            false,  // tryNearest
            1, 1,   // NPC size
            0, 0,   // angle, shape
            0,      // forceapproach
            2       // type = MOVE_OPCLICK
        );

        // Send OPNPCT packet
        this.writePacketOpcode(ClientProt.OPNPCT);
        this.out.p2(npcIndex);
        this.out.p2(spellComponent);

        return true;
    }

    /**
     * Cast a spell on an inventory item (sends OPHELDT)
     * Used for spells like Low/High Alchemy, Enchant, Superheat
     *
     * slot: the inventory slot (0-27)
     * spellComponent: the interface component ID of the spell (e.g., 1162 for Low Alchemy)
     * interfaceId: the inventory interface ID (default 3214)
     */
    spellOnItem(slot: number, spellComponent: number, interfaceId: number = 3214): boolean {
        if (!this.ingame || !this.out || slot < 0 || slot > 27) {
            return false;
        }

        // Get the inventory component
        const component = IfType.list[interfaceId];
        if (!component || !component.linkObjType) {
            return false;
        }

        // Get item in slot
        const rawItemId = component.linkObjType[slot];
        if (!rawItemId || rawItemId <= 0) {
            return false;
        }
        const itemObj = ObjType.list(rawItemId - 1);
        const itemId = itemObj.id;

        // Send OPHELDT packet: obj, slot, component, spellComponent
        this.writePacketOpcode(ClientProt.OPHELDT);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(interfaceId);
        this.out.p2(spellComponent);

        return true;
    }

    /**
     * Cast a spell on a ground item (e.g., Telekinetic Grab)
     * Sends OPOBJT packet
     */
    spellOnGroundItem(worldX: number, worldZ: number, itemId: number, spellComponent: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            return false;
        }

        const sceneX = worldX - this.mapBuildBaseX;
        const sceneZ = worldZ - this.mapBuildBaseZ;

        if (sceneX < 0 || sceneX >= 104 || sceneZ < 0 || sceneZ >= 104) {
            return false;
        }

        // Try to move towards the ground item
        this.tryMove(
            this.localPlayer.routeX[0],
            this.localPlayer.routeZ[0],
            sceneX,
            sceneZ,
            false,
            0, 0,
            0, 0,
            0,
            2  // MOVE_OPCLICK
        );

        // Send OPOBJT packet: x, z, itemId, spellComponent
        this.writePacketOpcode(ClientProt.OPOBJT);
        this.out.p2(worldX);
        this.out.p2(worldZ);
        this.out.p2(itemId);
        this.out.p2(spellComponent);

        return true;
    }

    /**
     * Pick up a ground item at the specified world coordinates
     * Use the groundItems from BotState to get item locations
     */
    pickupGroundItem(worldX: number, worldZ: number, itemId: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            return false;
        }

        // Convert world coordinates to scene coordinates
        const sceneX = worldX - this.mapBuildBaseX;
        const sceneZ = worldZ - this.mapBuildBaseZ;

        // Validate scene coordinates
        if (sceneX < 0 || sceneX >= 104 || sceneZ < 0 || sceneZ >= 104) {
            return false;
        }

        // First send MOVE_OPCLICK via tryMove (type=2) to walk to the item
        this.tryMove(
            this.localPlayer.routeX[0],
            this.localPlayer.routeZ[0],
            sceneX,
            sceneZ,
            false,  // tryNearest
            0, 0,   // locWidth, locLength
            0, 0,   // locAngle, locShape
            0,      // forceapproach
            2       // type = MOVE_OPCLICK
        );

        // Then send OPOBJ3 packet (Take is option 3, not option 1)
        this.writePacketOpcode(ClientProt.OPOBJ3);
        this.out.p2(worldX);
        this.out.p2(worldZ);
        this.out.p2(itemId);

        return true;
    }

    /**
     * Interact with a ground item using a specific option (1-5)
     * Option 1 = op[0], Option 2 = op[1], Option 3 = Take (op[2]), etc.
     */
    interactGroundItem(worldX: number, worldZ: number, itemId: number, optionIndex: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer || optionIndex < 1 || optionIndex > 5) {
            return false;
        }

        // Convert world coordinates to scene coordinates
        const sceneX = worldX - this.mapBuildBaseX;
        const sceneZ = worldZ - this.mapBuildBaseZ;

        // Validate scene coordinates
        if (sceneX < 0 || sceneX >= 104 || sceneZ < 0 || sceneZ >= 104) {
            return false;
        }

        // First send MOVE_OPCLICK via tryMove (type=2) to walk to the item
        this.tryMove(
            this.localPlayer.routeX[0],
            this.localPlayer.routeZ[0],
            sceneX,
            sceneZ,
            false,  // tryNearest
            0, 0,   // locWidth, locLength
            0, 0,   // locAngle, locShape
            0,      // forceapproach
            2       // type = MOVE_OPCLICK
        );

        // Then send OPOBJ packet
        const opcodes = [
            ClientProt.OPOBJ1,
            ClientProt.OPOBJ2,
            ClientProt.OPOBJ3,
            ClientProt.OPOBJ4,
            ClientProt.OPOBJ5
        ];
        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(worldX);
        this.out.p2(worldZ);
        this.out.p2(itemId);

        return true;
    }

    /**
     * Use/interact with an inventory item
     * optionIndex: 1-5 for different item options
     * Option 1 is usually the primary action (Eat, Wear, Wield, etc.)
     * slot: inventory slot (0-27)
     * interfaceId: usually 3214 for main inventory
     */
    useInventoryItem(slot: number, optionIndex: number, interfaceId: number = 3214): boolean {
        console.log(`[Client] useInventoryItem called - slot: ${slot}, optionIndex: ${optionIndex}, interfaceId: ${interfaceId}`);

        if (!this.ingame || !this.out || optionIndex < 1 || optionIndex > 5) {
            console.log(`[Client] useInventoryItem REJECTED - ingame: ${this.ingame}, out: ${!!this.out}, optionIndex: ${optionIndex}`);
            return false;
        }

        // Get item ID from the inventory slot
        const component = IfType.list[interfaceId];
        if (!component || !component.linkObjType) {
            console.log(`[Client] useInventoryItem FAILED - component not found or no linkObjType for interfaceId: ${interfaceId}`);
            return false;
        }

        const rawItemId = component.linkObjType[slot];
        console.log(`[Client] useInventoryItem - rawItemId at slot ${slot}: ${rawItemId}`);

        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] useInventoryItem FAILED - no item at slot ${slot} (rawItemId: ${rawItemId})`);
            return false;
        }

        // Must use ObjType.list().id like the original menu code does
        const obj = ObjType.list(rawItemId - 1);
        const itemId = obj.id;

        const opcodes = [
            ClientProt.OPHELD1,
            ClientProt.OPHELD2,
            ClientProt.OPHELD3,
            ClientProt.OPHELD4,
            ClientProt.OPHELD5
        ];
        const opcode = opcodes[optionIndex - 1];
        console.log(`[Client] useInventoryItem SENDING packet - opcode: ${opcode}, item: ${obj.name} (id:${itemId}), slot: ${slot}, interfaceId: ${interfaceId}`);

        this.writePacketOpcode(opcode);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(interfaceId);

        console.log(`[Client] useInventoryItem SUCCESS - packet sent`);
        return true;
    }

    /**
     * Drop an inventory item (usually option 5)
     */
    dropInventoryItem(slot: number): boolean {
        console.log(`[Client] dropInventoryItem called - slot: ${slot}`);
        return this.useInventoryItem(slot, 5);
    }

    /**
     * Click on an equipment slot (unequip item)
     * Uses INV_BUTTON1 packet which triggers inv_button1 script (unequip)
     * Equipment interface ID: 1688 (wornitems:wear)
     */
    clickEquipmentSlot(slot: number, optionIndex: number = 1): boolean {
        console.log(`[Client] clickEquipmentSlot called - slot: ${slot}, optionIndex: ${optionIndex}`);

        if (!this.ingame || !this.out || optionIndex < 1 || optionIndex > 5) {
            console.log(`[Client] clickEquipmentSlot REJECTED - ingame: ${this.ingame}, out: ${!!this.out}, optionIndex: ${optionIndex}`);
            return false;
        }

        const EQUIPMENT_INTERFACE_ID = 1688;
        const component = IfType.list[EQUIPMENT_INTERFACE_ID];
        if (!component || !component.linkObjType) {
            console.log(`[Client] clickEquipmentSlot FAILED - component not found`);
            return false;
        }

        const rawItemId = component.linkObjType[slot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] clickEquipmentSlot FAILED - no item at slot ${slot}`);
            return false;
        }

        const obj = ObjType.list(rawItemId - 1);
        const itemId = obj.id;

        // INV_BUTTON opcodes (for interface-defined options like "Remove")
        const opcodes = [
            ClientProt.INV_BUTTON1,
            ClientProt.INV_BUTTON2,
            ClientProt.INV_BUTTON3,
            ClientProt.INV_BUTTON4,
            ClientProt.INV_BUTTON5
        ];

        console.log(`[Client] clickEquipmentSlot SENDING packet - item: ${obj.name} (id:${itemId}), slot: ${slot}`);

        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(EQUIPMENT_INTERFACE_ID);

        console.log(`[Client] clickEquipmentSlot SUCCESS - packet sent`);
        return true;
    }

    /**
     * Check if shop is currently open
     */
    isShopOpen(): boolean {
        return this.mainModalId === 3824 && this.sideModalId === 3822;
    }

    /**
     * Get current shop state
     */
    getShopState(): { isOpen: boolean; title: string } {
        if (!this.isShopOpen()) {
            return { isOpen: false, title: '' };
        }
        let title = '';
        try {
            const titleComponent = IfType.list[3901];
            if (titleComponent && titleComponent.text) {
                title = titleComponent.text;
            }
        } catch { /* ignore */ }
        return { isOpen: true, title };
    }

    /**
     * Buy an item from the shop
     * slot: the slot number in the shop inventory (0-based)
     * amount: 1, 5, or 10 (corresponds to Buy 1, Buy 5, Buy 10)
     * Shop interface ID: 3900 (shop_template:inv)
     */
    shopBuy(slot: number, amount: number = 1): boolean {
        if (!this.ingame || !this.out || !this.isShopOpen()) {
            return false;
        }

        const SHOP_INV_ID = 3900;
        const component = IfType.list[SHOP_INV_ID];
        if (!component || !component.linkObjType) {
            return false;
        }

        const rawItemId = component.linkObjType[slot];
        if (!rawItemId || rawItemId <= 0) {
            return false;
        }

        // Must use ObjType.list().id like the original menu code does
        const obj = ObjType.list(rawItemId - 1);
        const itemId = obj.id;

        // Map amount to option index: 1->2 (Buy 1), 5->3 (Buy 5), 10->4 (Buy 10)
        let optionIndex = 2; // Default to Buy 1
        if (amount === 5) optionIndex = 3;
        else if (amount === 10) optionIndex = 4;
        else if (amount !== 1) {
            console.log(`[Client] shopBuy: unsupported amount ${amount}, only 1/5/10 supported. Use buyFromShop() for arbitrary amounts.`);
        }

        // INV_BUTTON opcodes for shop interface actions
        const opcodes = [
            ClientProt.INV_BUTTON1, // Option 1 - Value
            ClientProt.INV_BUTTON2, // Option 2 - Buy 1
            ClientProt.INV_BUTTON3, // Option 3 - Buy 5
            ClientProt.INV_BUTTON4, // Option 4 - Buy 10
            ClientProt.INV_BUTTON5  // Option 5
        ];

        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(SHOP_INV_ID);

        return true;
    }

    /**
     * Sell an item to the shop
     * slot: the slot number in player's inventory (0-based)
     * amount: 1, 5, or 10 (corresponds to Sell 1, Sell 5, Sell 10)
     * Shop side panel interface ID: 3823 (shop_template_side:inv)
     */
    shopSell(slot: number, amount: number = 1): boolean {
        if (!this.ingame || !this.out || !this.isShopOpen()) {
            return false;
        }

        const SHOP_SIDE_INV_ID = 3823;
        const component = IfType.list[SHOP_SIDE_INV_ID];
        if (!component || !component.linkObjType) {
            return false;
        }

        const rawItemId = component.linkObjType[slot];
        if (!rawItemId || rawItemId <= 0) {
            return false;
        }

        // Must use ObjType.list().id like the original menu code does
        const obj = ObjType.list(rawItemId - 1);
        const itemId = obj.id;

        // Map amount to option index: 1->2 (Sell 1), 5->3 (Sell 5), 10->4 (Sell 10)
        let optionIndex = 2; // Default to Sell 1
        if (amount === 5) optionIndex = 3;
        else if (amount === 10) optionIndex = 4;
        else if (amount !== 1) {
            console.log(`[Client] shopSell: unsupported amount ${amount}, only 1/5/10 supported. Use sellToShop() for arbitrary amounts.`);
        }

        // INV_BUTTON opcodes for shop interface actions
        const opcodes = [
            ClientProt.INV_BUTTON1, // Option 1 - Value
            ClientProt.INV_BUTTON2, // Option 2 - Sell 1
            ClientProt.INV_BUTTON3, // Option 3 - Sell 5
            ClientProt.INV_BUTTON4, // Option 4 - Sell 10
            ClientProt.INV_BUTTON5  // Option 5
        ];

        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(SHOP_SIDE_INV_ID);

        return true;
    }

    /**
     * Close the shop interface
     */
    closeShop(): boolean {
        if (!this.ingame || !this.out || !this.isShopOpen()) {
            return false;
        }

        // Use the existing private closeModal() which sends CLOSE_MODAL and resets state
        this.closeModal();

        return true;
    }

    /**
     * Close any modal interface (bank, shop, etc.)
     * Unlike closeShop(), this works for any open modal interface.
     */
    closeBotModal(): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        // Check if any modal is open
        if (this.mainModalId === -1 && this.sideModalId === -1) {
            return true; // Already closed
        }

        // Use the existing private closeModal() which handles all cleanup
        this.closeModal();

        return true;
    }

    /**
     * Check if bank interface is open
     */
    isBankOpen(): boolean {
        const BANK_MAIN_ID = 5292;
        const BANK_SIDE_INV_ID = 2006;

        if (this.mainModalId === BANK_MAIN_ID) {
            return true;
        }

        const component = IfType.list[BANK_SIDE_INV_ID];
        if (component && component.linkObjType) {
            for (let i = 0; i < component.linkObjType.length; i++) {
                if (component.linkObjType[i] > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Deposit item from inventory into bank
     */
    bankDeposit(slot: number, amount: number = 1): boolean {
        if (!this.ingame || !this.out) {
            console.log('[Client] bankDeposit failed - not in game');
            return false;
        }

        const BANK_SIDE_INV_ID = 2006;
        const component = IfType.list[BANK_SIDE_INV_ID];
        if (!component || !component.linkObjType) {
            console.log('[Client] bankDeposit failed - bank_side:inv component not found');
            return false;
        }

        const rawItemId = component.linkObjType[slot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] bankDeposit failed - no item at slot ${slot}`);
            return false;
        }

        const obj = ObjType.list(rawItemId - 1);
        const itemId = obj.id;

        let optionIndex = 1;
        if (amount === 5) optionIndex = 2;
        else if (amount === 10) optionIndex = 3;
        else if (amount === -1 || amount >= 2147483647) optionIndex = 4;
        else if (amount !== 1) optionIndex = 5;

        const opcodes = [
            ClientProt.INV_BUTTON1,
            ClientProt.INV_BUTTON2,
            ClientProt.INV_BUTTON3,
            ClientProt.INV_BUTTON4,
            ClientProt.INV_BUTTON5
        ];

        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(BANK_SIDE_INV_ID);

        console.log(`[Client] bankDeposit: slot=${slot}, itemId=${itemId}, amount=${amount}, optionIndex=${optionIndex}`);
        return true;
    }

    /**
     * Withdraw item from bank into inventory
     */
    bankWithdraw(slot: number, amount: number = 1): boolean {
        if (!this.ingame || !this.out) {
            console.log('[Client] bankWithdraw failed - not in game');
            return false;
        }

        const BANK_MAIN_INV_ID = 5382;
        const component = IfType.list[BANK_MAIN_INV_ID];
        if (!component || !component.linkObjType) {
            console.log('[Client] bankWithdraw failed - bank_main:inv component not found');
            return false;
        }

        const rawItemId = component.linkObjType[slot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] bankWithdraw failed - no item at slot ${slot}`);
            return false;
        }

        const obj = ObjType.list(rawItemId - 1);
        const itemId = obj.id;

        let optionIndex = 1;
        if (amount === 5) optionIndex = 2;
        else if (amount === 10) optionIndex = 3;
        else if (amount === -1 || amount >= 2147483647) optionIndex = 4;
        else if (amount !== 1) optionIndex = 5;

        const opcodes = [
            ClientProt.INV_BUTTON1,
            ClientProt.INV_BUTTON2,
            ClientProt.INV_BUTTON3,
            ClientProt.INV_BUTTON4,
            ClientProt.INV_BUTTON5
        ];

        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(BANK_MAIN_INV_ID);

        console.log(`[Client] bankWithdraw: slot=${slot}, itemId=${itemId}, amount=${amount}, optionIndex=${optionIndex}`);
        return true;
    }

    /**
     * Submit a value for the P_COUNTDIALOG prompt (e.g. Withdraw-X, Deposit-X).
     */
    submitCountDialog(value: number): boolean {
        if (!this.ingame || !this.out) {
            console.log('[Client] submitCountDialog failed - not in game');
            return false;
        }

        if (!this.dialogInputOpen) {
            console.log('[Client] submitCountDialog failed - count dialog not open');
            return false;
        }

        this.out.p1Enc(ClientProt.RESUME_P_COUNTDIALOG);
        this.out.p4(value);
        this.dialogInputOpen = false;
        this.redrawChat = true;

        console.log(`[Client] submitCountDialog: value=${value}`);
        return true;
    }

    /**
     * Get items in bank (from bank_main:inv component)
     */
    getBankItems(): Array<{ slot: number; id: number; name: string; count: number }> {
        const BANK_MAIN_INV_ID = 5382;
        const component = IfType.list[BANK_MAIN_INV_ID];
        const items: Array<{ slot: number; id: number; name: string; count: number }> = [];

        if (!component || !component.linkObjType || !component.linkObjNumber) {
            return items;
        }

        for (let slot = 0; slot < component.linkObjType.length; slot++) {
            const rawId = component.linkObjType[slot];
            if (rawId && rawId > 0) {
                const obj = ObjType.list(rawId - 1);
                items.push({
                    slot,
                    id: obj.id,
                    name: obj.name || `Unknown(${obj.id})`,
                    count: component.linkObjNumber[slot] || 1
                });
            }
        }

        return items;
    }

    /**
     * Find item slot in bank by name pattern
     */
    findBankItemSlot(pattern: string | RegExp): number {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
        const items = this.getBankItems();
        const item = items.find(i => regex.test(i.name));
        return item ? item.slot : -1;
    }

    /**
     * Set combat style (0-3)
     */
    setCombatStyle(style: number): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        const combatInterfaceId = this.sideIcon[0];
        if (combatInterfaceId === -1) {
            console.log('[Client] No combat interface in tab 0');
            return false;
        }

        const combatInterface = IfType.list[combatInterfaceId];
        if (!combatInterface || !combatInterface.children) {
            console.log('[Client] Combat interface has no children');
            return false;
        }

        for (const childId of combatInterface.children) {
            const child = IfType.list[childId];
            if (!child) continue;

            if (child.buttonType === 5) {
                if (child.scriptOperand && child.scriptOperand[0] === style) {
                    this.writePacketOpcode(ClientProt.IF_BUTTON);
                    this.out.p2(childId);
                    console.log(`[Client] Clicked combat style button ${childId} for style ${style}`);
                    return true;
                }
            }

            if (child.children) {
                for (const grandchildId of child.children) {
                    const grandchild = IfType.list[grandchildId];
                    if (!grandchild) continue;

                    if (grandchild.buttonType === 5 && grandchild.scriptOperand && grandchild.scriptOperand[0] === style) {
                        this.writePacketOpcode(ClientProt.IF_BUTTON);
                        this.out.p2(grandchildId);
                        console.log(`[Client] Clicked combat style button ${grandchildId} for style ${style}`);
                        return true;
                    }
                }
            }
        }

        console.log(`[Client] Could not find combat style button for style ${style}`);
        return false;
    }

    /**
     * Get current combat style (0-3)
     */
    getCombatStyle(): number {
        for (const tryIndex of [43, 11, 12, 13, 42, 44]) {
            const val = this.var[tryIndex];
            if (val !== undefined && val >= 0 && val <= 3) {
                return val;
            }
        }
        return 0;
    }

    /**
     * Send a public chat message in-game
     */
    say(message: string): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            return false;
        }

        let text = message.substring(0, 80);

        this.out.p1Enc(ClientProt.MESSAGE_PUBLIC);
        this.out.p1(0);
        const start: number = this.out.pos;

        this.out.p1(0);
        this.out.p1(0);
        WordPack.pack(this.out, text);
        this.out.psize1(this.out.pos - start);

        text = JString.toSentenceCase(text);
        text = WordFilter.filter(text);

        if (this.localPlayer) {
            this.localPlayer.chatMessage = text;
            this.localPlayer.chatColour = 0;
            this.localPlayer.chatEffect = 0;
            this.localPlayer.chatTimer = 150;

            this.addChat(2, this.localPlayer.chatMessage, this.localPlayer.name ?? '');
        }

        return true;
    }

    /**
     * Use one inventory item on another inventory item (OPHELDU)
     */
    useItemOnItem(sourceSlot: number, targetSlot: number, interfaceId: number = 3214): boolean {
        if (!this.ingame || !this.out) {
            console.log('[Client] useItemOnItem failed - not in game');
            return false;
        }

        const component = IfType.list[interfaceId];
        if (!component || !component.linkObjType) {
            console.log('[Client] useItemOnItem failed - invalid interface');
            return false;
        }

        const sourceRawId = component.linkObjType[sourceSlot];
        if (!sourceRawId || sourceRawId <= 0) {
            console.log(`[Client] useItemOnItem failed - no item in source slot ${sourceSlot}`);
            return false;
        }
        const sourceObj = ObjType.list(sourceRawId - 1);
        const sourceItemId = sourceObj.id;

        const targetRawId = component.linkObjType[targetSlot];
        if (!targetRawId || targetRawId <= 0) {
            console.log(`[Client] useItemOnItem failed - no item in target slot ${targetSlot}`);
            return false;
        }
        const targetObj = ObjType.list(targetRawId - 1);
        const targetItemId = targetObj.id;

        console.log(`[Client] Using item ${sourceObj.name} (id:${sourceItemId}, slot ${sourceSlot}) on item ${targetObj.name} (id:${targetItemId}, slot ${targetSlot})`);

        this.writePacketOpcode(ClientProt.OPHELDU);
        this.out.p2(targetItemId);
        this.out.p2(targetSlot);
        this.out.p2(interfaceId);
        this.out.p2(sourceItemId);
        this.out.p2(sourceSlot);
        this.out.p2(interfaceId);

        return true;
    }

    /**
     * Use an inventory item on an NPC (OPNPCU)
     */
    useItemOnNpc(itemSlot: number, npcIndex: number, interfaceId: number = 3214): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            console.log('[Client] useItemOnNpc failed - not in game');
            return false;
        }

        const component = IfType.list[interfaceId];
        if (!component || !component.linkObjType) {
            console.log('[Client] useItemOnNpc failed - invalid interface');
            return false;
        }

        const rawItemId = component.linkObjType[itemSlot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] useItemOnNpc failed - no item in slot ${itemSlot}`);
            return false;
        }
        const itemObj = ObjType.list(rawItemId - 1);
        const itemId = itemObj.id;

        const n = this.npc[npcIndex];
        if (!n) {
            console.log(`[Client] useItemOnNpc failed - NPC ${npcIndex} not found`);
            return false;
        }

        this.tryMove(
            this.localPlayer.routeX[0],
            this.localPlayer.routeZ[0],
            n.routeX[0],
            n.routeZ[0],
            false, 1, 1, 0, 0, 0, 2
        );

        console.log(`[Client] Using item ${itemObj.name} (id:${itemId}, slot ${itemSlot}) on NPC ${npcIndex}`);

        this.writePacketOpcode(ClientProt.OPNPCU);
        this.out.p2(npcIndex);
        this.out.p2(itemId);
        this.out.p2(itemSlot);
        this.out.p2(interfaceId);

        return true;
    }

    /**
     * Use an inventory item on a location (OPLOCU)
     */
    useItemOnLoc(itemSlot: number, worldX: number, worldZ: number, locId: number, interfaceId: number = 3214): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            console.log('[Client] useItemOnLoc failed - not in game');
            return false;
        }

        const component = IfType.list[interfaceId];
        if (!component || !component.linkObjType) {
            console.log('[Client] useItemOnLoc failed - invalid interface');
            return false;
        }

        const rawItemId = component.linkObjType[itemSlot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] useItemOnLoc failed - no item in slot ${itemSlot}`);
            return false;
        }
        const itemObj = ObjType.list(rawItemId - 1);
        const itemId = itemObj.id;

        const destSceneX = worldX - this.mapBuildBaseX;
        const destSceneZ = worldZ - this.mapBuildBaseZ;

        if (destSceneX < 0 || destSceneX > 103 || destSceneZ < 0 || destSceneZ > 103) {
            console.log(`[Client] useItemOnLoc failed - location out of scene bounds`);
            return false;
        }

        const loc = LocType.list(locId);
        if (loc) {
            let width = loc.width;
            let height = loc.length;
            this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], destSceneX, destSceneZ, false, width, height, 0, 0, 0, 2);
        }

        console.log(`[Client] Using item ${itemObj.name} (id:${itemId}, slot ${itemSlot}) on loc ${loc?.name || locId} at (${worldX}, ${worldZ})`);

        this.writePacketOpcode(ClientProt.OPLOCU);
        this.out.p2(worldX);
        this.out.p2(worldZ);
        this.out.p2(locId);
        this.out.p2(itemId);
        this.out.p2(itemSlot);
        this.out.p2(interfaceId);

        return true;
    }

    /**
     * Walk to a world coordinate using proper client-side pathfinding
     */
    walkTo(worldX: number, worldZ: number, running: boolean = false): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            return false;
        }

        let destSceneX = worldX - this.mapBuildBaseX;
        let destSceneZ = worldZ - this.mapBuildBaseZ;

        const minBound = 1;
        const maxBound = 102;
        const wasClamped = destSceneX < minBound || destSceneX > maxBound || destSceneZ < minBound || destSceneZ > maxBound;

        destSceneX = Math.max(minBound, Math.min(maxBound, destSceneX));
        destSceneZ = Math.max(minBound, Math.min(maxBound, destSceneZ));

        if (wasClamped) {
            console.log(`[Walk] Destination clamped to scene bounds: (${destSceneX + this.mapBuildBaseX}, ${destSceneZ + this.mapBuildBaseZ})`);
        }

        const prevKeyHeld = this.keyHeld[5];
        this.keyHeld[5] = running ? 1 : 0;

        const success = this.tryMove(
            this.localPlayer.routeX[0],
            this.localPlayer.routeZ[0],
            destSceneX,
            destSceneZ,
            true,   // tryNearest
            0, 0,   // locWidth, locLength
            0, 0,   // locAngle, locShape
            0,      // forceapproach
            0       // type = MOVE_GAMECLICK
        );

        this.keyHeld[5] = prevKeyHeld;

        if (success) {
            const screenPos = this.projectTileToScreen(worldX, worldZ);
            if (screenPos) {
                this.crossX = screenPos.x;
                this.crossY = screenPos.y;
            } else {
                this.crossX = 256;
                this.crossY = 166;
            }
            this.crossMode = 1;
            this.crossCycle = 0;
        }

        return success;
    }

    /**
     * Walk relative to current position
     */
    walkRelative(deltaX: number, deltaZ: number, running: boolean = false): boolean {
        if (!this.ingame || !this.localPlayer) {
            return false;
        }

        const currentTileX = (this.localPlayer.x >> 7);
        const currentTileZ = (this.localPlayer.z >> 7);
        const worldX = this.mapBuildBaseX + currentTileX + deltaX;
        const worldZ = this.mapBuildBaseZ + currentTileZ + deltaZ;

        return this.walkTo(worldX, worldZ, running);
    }

    /**
     * Get current player world coordinates
     */
    getPlayerPosition(): { worldX: number; worldZ: number; tileX: number; tileZ: number } | null {
        if (!this.ingame || !this.localPlayer) {
            return null;
        }

        const tileX = (this.localPlayer.x >> 7);
        const tileZ = (this.localPlayer.z >> 7);
        return {
            worldX: this.mapBuildBaseX + tileX,
            worldZ: this.mapBuildBaseZ + tileZ,
            tileX,
            tileZ
        };
    }

    /**
     * Project a world tile coordinate to screen pixel coordinates.
     */
    projectTileToScreen(worldX: number, worldZ: number): { x: number; y: number } | null {
        if (!this.ingame) return null;

        const sceneX = ((worldX - this.mapBuildBaseX) << 7) + 64;
        const sceneZ = ((worldZ - this.mapBuildBaseZ) << 7) + 64;

        if (sceneX < 128 || sceneZ < 128 || sceneX > 13056 || sceneZ > 13056) return null;

        const y = this.getAvH(sceneX, sceneZ, this.minusedlevel);
        this.getOverlayPos(sceneX, y, sceneZ);

        if (this.projectX > -1) {
            return { x: this.projectX, y: this.projectY };
        }
        return null;
    }

    /**
     * Project an NPC's current position to screen pixel coordinates.
     */
    projectNpcToScreen(npcIndex: number): { x: number; y: number } | null {
        if (!this.ingame) return null;

        const n = this.npc[npcIndex];
        if (!n) return null;

        this.getOverlayPosEntity(n, (n.height / 2) | 0);

        if (this.projectX > -1) {
            return { x: this.projectX, y: this.projectY };
        }
        return null;
    }

    /**
     * Project a player's current position to screen pixel coordinates.
     */
    projectPlayerToScreen(playerIndex: number): { x: number; y: number } | null {
        if (!this.ingame) return null;

        const player = this.players[playerIndex];
        if (!player) return null;

        this.getOverlayPosEntity(player, (player.height / 2) | 0);

        if (this.projectX > -1) {
            return { x: this.projectX, y: this.projectY };
        }
        return null;
    }

    /**
     * Set the click cross visual at a specific screen position.
     */
    setBotClickVisual(screenX: number, screenY: number, mode: number): void {
        this.crossX = screenX;
        this.crossY = screenY;
        this.crossMode = mode;
        this.crossCycle = 0;
    }

    /**
     * Interact with a location/object in the world (doors, trees, etc.)
     */
    interactLoc(worldX: number, worldZ: number, locId: number, optionIndex: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer || optionIndex < 1 || optionIndex > 5) {
            return false;
        }

        // Walk to the loc first so the server receives a movement path. In 274's
        // client-routefinder mode (Environment.node.clientRoutefinder) the server does
        // NOT pathfind to interaction targets itself — it expects the client to send the
        // route. Sending OPLOC alone never moves the player, so the server replies
        // "I can't reach that!" whenever we aren't already adjacent. Mirrors useItemOnLoc.
        const destSceneX = worldX - this.mapBuildBaseX;
        const destSceneZ = worldZ - this.mapBuildBaseZ;
        if (destSceneX >= 0 && destSceneX <= 103 && destSceneZ >= 0 && destSceneZ <= 103) {
            const loc = LocType.list(locId);
            if (loc) {
                this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], destSceneX, destSceneZ, false, loc.width, loc.length, 0, 0, 0, 2);
            }
        }

        const opcodes = [
            ClientProt.OPLOC1,
            ClientProt.OPLOC2,
            ClientProt.OPLOC3,
            ClientProt.OPLOC4,
            ClientProt.OPLOC5
        ];
        this.writePacketOpcode(opcodes[optionIndex - 1]);
        this.out.p2(worldX);
        this.out.p2(worldZ);
        this.out.p2(locId);

        return true;
    }

    /**
     * Click a dialog continue button or select a dialog option
     */
    clickDialogOption(optionIndex: number = 0): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        if (optionIndex === 0) {
            if (!this.resumedPauseButton && this.chatModalId !== -1) {
                this.writePacketOpcode(ClientProt.RESUME_PAUSEBUTTON);
                this.out.p2(this.chatModalId);
                this.resumedPauseButton = true;
                return true;
            }
            return false;
        }

        if (this.chatModalId !== -1) {
            const dialogOptions = this.getDialogOptions();
            if (optionIndex > 0 && optionIndex <= dialogOptions.length) {
                const option = dialogOptions[optionIndex - 1];

                if (option.buttonType === ButtonType.BUTTON_CONTINUE) {
                    if (!this.resumedPauseButton) {
                        this.writePacketOpcode(ClientProt.RESUME_PAUSEBUTTON);
                        this.out.p2(option.componentId);
                        this.resumedPauseButton = true;
                        return true;
                    }
                    return false;
                } else {
                    this.writePacketOpcode(ClientProt.IF_BUTTON);
                    this.out.p2(option.componentId);
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get available dialog options from the current chat interface
     */
    getDialogOptions(): Array<{ index: number; text: string; componentId: number; buttonType: number }> {
        const options: Array<{ index: number; text: string; componentId: number; buttonType: number }> = [];

        if (this.chatModalId === -1) {
            return options;
        }

        const scanComponent = (comId: number): void => {
            const com = IfType.list[comId];
            if (!com) return;

            if ((com.buttonType === ButtonType.BUTTON_OK || com.buttonType === ButtonType.BUTTON_CONTINUE) && com.buttonText) {
                const displayText = com.text || com.buttonText;
                options.push({
                    index: options.length + 1,
                    text: displayText,
                    componentId: comId,
                    buttonType: com.buttonType
                });
            }

            if (com.children) {
                for (const childId of com.children) {
                    scanComponent(childId);
                }
            }
        };

        scanComponent(this.chatModalId);
        return options;
    }

    /**
     * Debug: Get all components in the current chat interface
     */
    debugDialogComponents(): Array<{ id: number; type: number; buttonType: number; option: string; text: string; scripts?: string; scriptOperand?: string }> {
        const components: Array<{ id: number; type: number; buttonType: number; option: string; text: string; scripts?: string; scriptOperand?: string }> = [];

        if (this.chatModalId === -1) {
            return components;
        }

        const scanComponent = (comId: number, depth: number = 0): void => {
            if (depth > 5) return;
            const com = IfType.list[comId];
            if (!com) return;

            components.push({
                id: comId,
                type: com.type,
                buttonType: com.buttonType,
                option: com.buttonText || '',
                text: (com.text || '').substring(0, 50),
                scripts: com.scripts ? JSON.stringify(com.scripts) : undefined,
                scriptOperand: com.scriptOperand ? JSON.stringify(com.scriptOperand) : undefined,
                clientCode: com.clientCode || undefined
            } as any);

            if (com.children) {
                for (const childId of com.children) {
                    scanComponent(childId, depth + 1);
                }
            }
        };

        scanComponent(this.chatModalId);
        return components;
    }

    /**
     * Get all text content from the current dialog (resolves %1, %2 placeholders)
     */
    getDialogText(): string[] {
        const texts: string[] = [];

        if (this.chatModalId === -1) {
            return texts;
        }

        const scanComponent = (comId: number, depth: number = 0): void => {
            if (depth > 10) return;
            const com = IfType.list[comId];
            if (!com) return;

            if (com.type === ComponentType.TYPE_TEXT && com.text) {
                let text = com.text;

                if (text.indexOf('%') !== -1) {
                    for (let i = 0; i < 5; i++) {
                        const placeholder = `%${i + 1}`;
                        while (text.indexOf(placeholder) !== -1) {
                            const index = text.indexOf(placeholder);
                            const value = this.getIfVar(com, i);
                            const replacement = this.inf(value);
                            text = text.substring(0, index) + replacement + text.substring(index + 2);
                        }
                    }
                }

                const trimmed = text.trim();
                if (trimmed &&
                    trimmed !== 'Please wait...' &&
                    trimmed !== 'Click here to continue' &&
                    !trimmed.startsWith('Select an Option')) {
                    const cleaned = trimmed.replace(/@\w{3}@/g, '');
                    if (cleaned) {
                        texts.push(cleaned);
                    }
                }
            }

            if (com.children) {
                for (const childId of com.children) {
                    scanComponent(childId, depth + 1);
                }
            }
        };

        scanComponent(this.chatModalId);
        return texts;
    }

    /**
     * Capture the current dialog text to history
     */
    captureDialogToHistory(): void {
        if (this.chatModalId === -1) return;
        if (this.chatModalId === this.lastCapturedDialogId) return;

        const texts = this.getDialogText();
        if (texts.length === 0) return;

        this.dialogHistory.unshift({
            text: texts,
            tick: Client.loopCycle,
            interfaceId: this.chatModalId
        });

        if (this.dialogHistory.length > this.dialogHistoryMax) {
            this.dialogHistory.pop();
        }

        this.lastCapturedDialogId = this.chatModalId;
    }

    /**
     * Get recent dialog history
     */
    getDialogHistory(): Array<{ text: string[]; tick: number; interfaceId: number }> {
        return this.dialogHistory;
    }

    /**
     * Check if a modal interface (like character design or dialog) is open
     */
    isModalOpen(): boolean {
        return this.mainModalId !== -1;
    }

    /**
     * Check if a dialog/chat interface is currently open
     */
    isDialogOpen(): boolean {
        return this.chatModalId !== -1;
    }

    /**
     * Get the currently open modal interface ID
     */
    getModalInterface(): number {
        return this.mainModalId;
    }

    /**
     * Get the currently open chat/dialog interface ID
     */
    getChatInterface(): number {
        return this.chatModalId;
    }

    /**
     * Check if a count/input dialog is open (P_COUNTDIALOG)
     */
    isChatBackInputOpen(): boolean {
        return this.dialogInputOpen;
    }

    /**
     * Check if we're waiting for dialog response (already clicked continue)
     */
    isWaitingForDialog(): boolean {
        return this.resumedPauseButton;
    }

    /**
     * Check if a viewport interface (like crafting/fletching menus) is open
     */
    isViewportInterfaceOpen(): boolean {
        return this.mainModalId !== -1;
    }

    /**
     * Get the currently open viewport interface ID
     */
    getViewportInterface(): number {
        return this.mainModalId;
    }

    /**
     * Get available interface options from the current viewport interface
     */
    getInterfaceOptions(): Array<{ index: number; text: string; componentId: number }> {
        const options: Array<{ index: number; text: string; componentId: number }> = [];

        if (this.mainModalId === -1) {
            return options;
        }

        const scanComponent = (comId: number, depth: number = 0): void => {
            if (depth > 10) return;
            const com = IfType.list[comId];
            if (!com) {
                if (depth === 0) {
                    console.log(`[Interface ${this.mainModalId}] Root component not found, scanning range...`);
                    for (let i = 0; i < 50; i++) {
                        const childId = this.mainModalId * 1000 + i;
                        const childCom = IfType.list[childId];
                        if (childCom && childCom.buttonType && childCom.buttonType > 0) {
                            console.log(`  Found ${childId}: buttonType=${childCom.buttonType}, option="${childCom.buttonText}"`);
                        }
                    }
                }
                return;
            }

            const isClickable = com.buttonType === ButtonType.BUTTON_OK ||
                               com.buttonType === ButtonType.BUTTON_TARGET ||
                               com.buttonType === ButtonType.BUTTON_SELECT;

            if (isClickable && (com.buttonText || com.text)) {
                options.push({
                    index: options.length + 1,
                    text: com.buttonText || com.text || `Option ${options.length + 1}`,
                    componentId: comId
                });
            }

            if (com.children) {
                for (const childId of com.children) {
                    scanComponent(childId, depth + 1);
                }
            }
        };

        scanComponent(this.mainModalId);
        return options;
    }

    /**
     * Click an option in a viewport interface
     */
    clickInterfaceOption(optionIndex: number): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        if (this.mainModalId === -1) {
            return false;
        }

        const interfaceOptions = this.getInterfaceOptions();
        if (optionIndex > 0 && optionIndex <= interfaceOptions.length) {
            const option = interfaceOptions[optionIndex - 1];
            this.writePacketOpcode(ClientProt.IF_BUTTON);
            this.out.p2(option.componentId);
            return true;
        }
        return false;
    }

    /**
     * Click a specific component by its ID
     */
    clickComponent(componentId: number): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        this.writePacketOpcode(ClientProt.IF_BUTTON);
        this.out.p2(componentId);
        return true;
    }

    /**
     * Switch to a specific tab (0-13)
     */
    setTab(tabIndex: number): boolean {
        if (!this.ingame || tabIndex < 0 || tabIndex > 13) {
            return false;
        }
        if (this.sideIcon[tabIndex] === -1) {
            return false;
        }
        this.activeIcon = tabIndex;
        this.redrawSide = true;
        this.redrawIcons = true;
        return true;
    }

    /**
     * Click on an interface component with iop (inventory operations) like smithing menu
     */
    clickInterfaceIop(componentId: number, optionIndex: number = 1, slot: number = 0): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        const com = IfType.list[componentId];
        if (!com) {
            console.log(`[clickInterfaceIop] Component ${componentId} not found`);
            return false;
        }

        let itemId = 0;
        if (com.linkObjType && com.linkObjType[slot]) {
            const rawId = com.linkObjType[slot];
            const obj = ObjType.list(rawId - 1);
            itemId = obj.id;
        }

        const opcodes = [
            ClientProt.INV_BUTTON1,
            ClientProt.INV_BUTTON2,
            ClientProt.INV_BUTTON3,
            ClientProt.INV_BUTTON4,
            ClientProt.INV_BUTTON5
        ];

        const opcode = opcodes[Math.min(optionIndex - 1, opcodes.length - 1)];

        this.writePacketOpcode(opcode);
        this.out.p2(itemId);
        this.out.p2(slot);
        this.out.p2(componentId);

        console.log(`[clickInterfaceIop] Sent ${opcode} for component ${componentId}, slot=${slot}, itemId=${itemId}`);
        return true;
    }

    /**
     * Get debug info about an interface's components
     */
    getInterfaceDebugInfo(interfaceId: number): string[] {
        const lines: string[] = [];
        const root = IfType.list[interfaceId];

        if (!root) {
            lines.push(`Interface ${interfaceId}: Component not found`);
            return lines;
        }

        lines.push(`Interface ${interfaceId}: ${root.children?.length || 0} children`);

        const scan = (comId: number, depth: number): void => {
            if (depth > 3) return;
            const com = IfType.list[comId];
            if (!com) return;

            const indent = '  '.repeat(depth);

            const hasButton = com.buttonType && com.buttonType > 0;
            const hasIop = com.iop && com.iop.some((op: string | null) => op);
            const hasOption = com.buttonText;

            if (hasButton || hasIop || hasOption) {
                let info = `${indent}${comId}:`;
                if (hasButton) info += ` buttonType=${com.buttonType}`;
                if (hasOption) info += ` option="${com.buttonText}"`;
                if (hasIop && com.iop) {
                    const ops = com.iop.filter((op: string | null) => op).join(', ');
                    info += ` iop=[${ops}]`;
                }
                if (com.text) info += ` text="${com.text}"`;
                lines.push(info);
            }

            if (com.children) {
                for (const childId of com.children) {
                    scan(childId, depth + 1);
                }
            }
        };

        scan(interfaceId, 0);
        return lines;
    }

    // === AGENT MODE PUBLIC METHODS ===

    /**
     * @deprecated Agent UI has been removed
     */
    enableAgentMode(): void {
        // Agent UI removed
    }

    /**
     * @deprecated Agent UI has been removed
     */
    toggleAgentMode(): void {
        // Agent UI removed
    }

    /**
     * @deprecated Agent UI has been removed
     */
    isAgentModeEnabled(): boolean {
        return false;
    }

    // === END AGENT MODE PUBLIC METHODS ===

    // === END BOT SDK PUBLIC METHODS ===

    static setLowMem(): void {
        World.lowMem = true;
        Pix3D.lowMem = true;
        Client.lowMem = true;
        ClientBuild.lowMem = true;
    }

    static setHighMem(): void {
        World.lowMem = false;
        Pix3D.lowMem = false;
        Client.lowMem = false;
        ClientBuild.lowMem = false;
    }

    saveMidi(data: Uint8Array, fading: boolean) {
        playMidi(data, this.midiVolume, fading);
    }

    private getIntParam(name: string, fallback: number = 0): number {
        const value: string | null = this.searchParams.get(name);
        if (value === null || !/^[+-]?\d+$/.test(value)) {
            return fallback;
        }

        const parsed: number = Number(value);
        return Number.isSafeInteger(parsed) ? parsed : fallback;
    }

    private drawError(): void {
        canvas2d.fillStyle = 'black';
        canvas2d.fillRect(0, 0, this.sWid, this.sHei);

        this.setFramerate(1);

        this.titleFlames?.close();
        let y: number = 0;

        if (this.errorLoading) {
            canvas2d.font = 'bold 16px helvetica, sans-serif';
            canvas2d.textAlign = 'left';
            canvas2d.fillStyle = 'yellow';
            y = 35;
            canvas2d.fillText('Sorry, an error has occured whilst loading RuneScape', 30, y);

            y += 50;
            canvas2d.fillStyle = 'white';
            canvas2d.fillText('To fix this try the following (in order):', 30, y);

            y += 50;
            canvas2d.font = 'bold 12px helvetica, sans-serif';
            canvas2d.fillText('1: Try closing ALL open web-browser windows, and reloading', 30, y);

            y += 30;
            canvas2d.fillText('2: Try clearing your web-browsers cache', 30, y); // "2: Try clearing your web-browsers cache from tools->internet options"

            y += 30;
            canvas2d.fillText('3: Try using a different game-world', 30, y);

            y += 30;
            canvas2d.fillText('4: Try rebooting your computer', 30, y);

            y += 30;
            canvas2d.fillText('5: Try selecting a different method from the play-game menu', 30, y); // "5: Try selecting a different version of Java from the play-game menu"
        } else if (this.errorHost) {
            canvas2d.font = 'bold 20px helvetica, sans-serif';
            canvas2d.textAlign = 'left';
            canvas2d.fillStyle = 'white';

            y = 50;
            canvas2d.fillText('Error - unable to load game!', 50, y);

            y += 50;
            canvas2d.fillText('To play RuneScape make sure you play from', 50, y);

            y += 50;
            canvas2d.fillText('An approved domain', 50, y); // "http://www.runescape.com"
        } else if (this.errorStarted) {
            canvas2d.font = 'bold 13px helvetica, sans-serif';
            canvas2d.textAlign = 'left';
            canvas2d.fillStyle = 'yellow';

            y = 35;
            canvas2d.fillText('Error a copy of RuneScape already appears to be loaded', 30, y);

            y += 50;
            canvas2d.fillStyle = 'white';
            canvas2d.fillText('To fix this try the following (in order):', 30, y);

            y += 50;
            canvas2d.font = 'bold 12px helvetica, sans-serif';
            canvas2d.fillText('1: Try closing ALL open web-browser windows, and reloading', 30, y);

            y += 30;
            canvas2d.fillText('2: Try rebooting your computer, and reloading', 30, y);
        }

        if (this.errorMessage) {
            y += 50;
            canvas2d.fillStyle = 'red';
            canvas2d.fillText(this.errorMessage, 30, y);
        }
    }

    private async getJagChecksums() {
        let wait = 5;
        let retries = 0;

        this.jagChecksum[8] = 0;

        while (this.jagChecksum[8] === 0) {
            let error = 'Unknown problem';
            await this.drawProgress('Connecting to web server', 10);

            try {
                const checksums: Packet = new Packet(await downloadUrl('/crc'));
                for (let i: number = 0; i < 9; i++) {
                    this.jagChecksum[i] = checksums.g4();
                }

                const expected = checksums.g4();
                let calculated = 1234;
                for (let i = 0; i < 9; i++) {
                    calculated = ((calculated << 1) + this.jagChecksum[i]) | 0;
                }

                if (expected !== calculated) {
                    error = 'checksum problem';
                    this.jagChecksum[8] = 0;
                }
            } catch (err) {
                error = 'connection problem';
                this.jagChecksum[8] = 0;
            }

            if (this.jagChecksum[8] === 0) {
                retries++;

                for (let remaining = wait; remaining > 0; remaining--) {
                    if (retries >= 10) {
                        await this.drawProgress('Game updated - please reload page', 10);
                        remaining = 10;
                    } else {
                        await this.drawProgress(`${error} - Will retry in ${remaining} secs.`, 10);
                    }

                    await sleep(1000);
                }

                wait *= 2;
                if (wait > 60) {
                    wait = 60;
                }

                // the java client toggles a "JAGGRAB" HTTP fallback here
            }
        }
    }

    private async getJagFile(displayName: string, progress: number, filename: string, index: number): Promise<JagFile> {
        const crc = this.jagChecksum[index];

        let data: Uint8Array | undefined;
        let retry: number = 5;

        try {
            if (this.db) {
                data = await this.db.read(0, index);
            }
        } catch (_e) {
            // empty
        }

        if (data && Packet.getcrc(data, 0, data.length) !== crc) {
            data = undefined;
        }

        if (data) {
            return new JagFile(data);
        }

        let loops = 0;
        while (!data) {
            await this.drawProgress(`Requesting ${displayName}`, progress);

            try {
                data = await downloadUrl(`/${filename}${crc}`);

                const checksum = Packet.getcrc(data, 0, data.length);
                if (crc === checksum) {
                    try {
                        if (this.db) {
                            await this.db.write(0, index, data);
                        }
                    } catch (_e) {
                        // empty
                    }
                } else {
                    data = undefined;
                    loops++;
                }
            } catch (_e) {
                data = undefined;
            }

            if (!data) {
                for (let i: number = retry; i > 0; i--) {
                    if (loops >= 3) {
                        await this.drawProgress('Game updated - please reload page', progress);
                        i = 10;
                    } else {
                        await this.drawProgress(`Error loading - Will retry in ${i} secs.`, progress);
                    }

                    await sleep(1000);
                }

                retry *= 2;
                if (retry > 60) {
                    retry = 60;
                }
            }
        }

        return new JagFile(data);
    }

    // ----

    override async maininit() {
        if (this.isMobile && Client.lowMem) {
            // force mobile on low detail mode to 30 fps
            this.setTargetedFramerate(30);
        }

        if (this.alreadyStarted) {
            this.errorStarted = true;
            return;
        }

        this.alreadyStarted = true;

        if (typeof process.env.SECURE_ORIGIN !== 'undefined' && process.env.SECURE_ORIGIN !== 'false' && window.location.hostname !== process.env.SECURE_ORIGIN) {
            this.errorHost = true;
        }

        try {
            this.db = new Database(await Database.openDatabase());
        } catch (_e) {
            // possibly incognito mode
            this.db = null;
        }

        try {
            await this.getJagChecksums();

            this.title = await this.getJagFile('title screen', 25, 'title', 1);
            this.p11 = PixFont.depack(this.title, 'p11_full', false);
            this.p12 = PixFont.depack(this.title, 'p12_full', false);
            this.b12 = PixFont.depack(this.title, 'b12_full', false);
            this.q8 = PixFont.depack(this.title, 'q8_full', true);

            await this.loadTitleBackground();
            this.loadTitleImages();

            const config: JagFile = await this.getJagFile('config', 30, 'config', 2);
            const interfaces: JagFile = await this.getJagFile('interface', 35, 'interface', 3);
            const media: JagFile = await this.getJagFile('2d graphics', 40, 'media', 4);
            const textures: JagFile = await this.getJagFile('textures', 45, 'textures', 6);
            const wordenc: JagFile = await this.getJagFile('chat system', 50, 'wordenc', 7);
            const sounds: JagFile = await this.getJagFile('sound effects', 55, 'sounds', 8);

            this.mapl = new Uint8Array3d(BuildArea.LEVELS, BuildArea.SIZE, BuildArea.SIZE);
            this.groundh = new Int32Array3d(BuildArea.LEVELS, BuildArea.SIZE + 1, BuildArea.SIZE + 1);
            this.world = new World(this.groundh, BuildArea.SIZE, BuildArea.LEVELS, BuildArea.SIZE);
            for (let level: number = 0; level < BuildArea.LEVELS; level++) {
                this.collision[level] = new CollisionMap();
            }
            this.minimap = new Pix32(512, 512);

            const versionlist: JagFile = await this.getJagFile('update list', 60, 'versionlist', 5);

            await this.drawProgress('Connecting to update server', 60);

            this.onDemand = new OnDemand(versionlist, this);
            AnimFrame.init(this.onDemand.getAnimFrameCount());
            Model.init(this.onDemand.getFileCount(0), this.onDemand);

            if (!Client.lowMem) {
                this.midiSong = 0; // scape_main
                this.midiSong = this.getIntParam('music', this.midiSong);
                this.midiFading = true;
                this.onDemand.request(2, this.midiSong);

                while (this.onDemand.remaining() > 0) {
                    await this.onDemandLoop();
                    await sleep(100);
                }
            }

            await this.drawProgress('Requesting animations', 65);

            const animCount = this.onDemand.getFileCount(1);
            for (let i = 0; i < animCount; i++) {
                this.onDemand.request(1, i);
            }

            while (this.onDemand.remaining() > 0) {
                const progress = animCount - this.onDemand.remaining();
                if (progress > 0) {
                    await this.drawProgress('Loading animations - ' + (((progress * 100) / animCount) | 0) + '%', 65);
                }

                await this.onDemandLoop();
                await sleep(100);
            }

            await this.drawProgress('Requesting models', 70);

            const modelCount = this.onDemand.getFileCount(0);
            for (let i = 0; i < modelCount; i++) {
                const flags = this.onDemand.getModelUse(i);
                if ((flags & 0x1) != 0) {
                    this.onDemand.request(0, i);
                }
            }

            const modelPrefetch = this.onDemand.remaining();
            while (this.onDemand.remaining() > 0) {
                const progress = modelPrefetch - this.onDemand.remaining();
                if (progress > 0) {
                    await this.drawProgress('Loading models - ' + (((progress * 100) / modelPrefetch) | 0) + '%', 70);
                }

                await this.onDemandLoop();
                await sleep(100);
            }

            if (this.db) {
                await this.drawProgress('Requesting maps', 75);

                this.onDemand.request(3, this.onDemand.getMapFile(48, 47, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(48, 47, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(48, 48, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(48, 48, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(48, 49, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(48, 49, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(47, 47, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(47, 47, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(47, 48, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(47, 48, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(48, 148, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(48, 148, 1));

                const mapPrefetch = this.onDemand.remaining();
                while (this.onDemand.remaining() > 0) {
                    const progress = mapPrefetch - this.onDemand.remaining();
                    if (progress > 0) {
                        await this.drawProgress('Loading maps - ' + (((progress * 100) / mapPrefetch) | 0) + '%', 75);
                    }

                    await this.onDemandLoop();
                    await sleep(100);
                }
            }

            const modelCount2 = this.onDemand.getFileCount(0);
            for (let i = 0; i < modelCount2; i++) {
                const flags = this.onDemand.getModelUse(i);

                let priority = 0;
                if ((flags & 0x8) != 0) {
                    priority = 10;
                } else if ((flags & 0x20) != 0) {
                    priority = 9;
                } else if ((flags & 0x10) != 0) {
                    priority = 8;
                } else if ((flags & 0x40) != 0) {
                    priority = 7;
                } else if ((flags & 0x80) != 0) {
                    priority = 6;
                } else if ((flags & 0x2) != 0) {
                    priority = 5;
                } else if ((flags & 0x4) != 0) {
                    priority = 4;
                }

                if ((flags & 0x1) != 0) {
                    priority = 3;
                }

                if (priority != 0) {
                    await this.onDemand.prefetchPriority(0, i, priority);
                }
            }

            await this.onDemand.prefetchMaps(Client.memServer);

            if (!Client.lowMem) {
                const midiCount = this.onDemand.getFileCount(2);
                for (let i = 1; i < midiCount; i++) {
                    if (this.onDemand.isMidiJingle(i)) {
                        await this.onDemand.prefetchPriority(2, i, 1);
                    }
                }
            }

            await this.drawProgress('Unpacking media', 80);

            this.invback = Pix8.depack(media, 'invback', 0);
            this.chatback = Pix8.depack(media, 'chatback', 0);
            this.mapback = Pix8.depack(media, 'mapback', 0);

            this.backbase1 = Pix8.depack(media, 'backbase1', 0);
            this.backbase2 = Pix8.depack(media, 'backbase2', 0);
            this.backhmid1 = Pix8.depack(media, 'backhmid1', 0);

            for (let i: number = 0; i < 13; i++) {
                this.sideicons[i] = Pix8.depack(media, 'sideicons', i);
            }

            this.compass = Pix32.depack(media, 'compass', 0);

            this.mapedge = Pix32.depack(media, 'mapedge', 0);
            this.mapedge.trim();

            try {
                for (let i: number = 0; i < 50; i++) {
                    this.mapscene[i] = Pix8.depack(media, 'mapscene', i);
                }
            } catch (_e) {
                // empty
            }

            try {
                for (let i: number = 0; i < 50; i++) {
                    this.mapfunction[i] = Pix32.depack(media, 'mapfunction', i);
                }
            } catch (_e) {
                // empty
            }

            try {
                for (let i: number = 0; i < 20; i++) {
                    this.hitmarks[i] = Pix32.depack(media, 'hitmarks', i);
                }
            } catch (_e) {
                // empty
            }

            try {
                for (let i: number = 0; i < 20; i++) {
                    this.headicons[i] = Pix32.depack(media, 'headicons', i);
                }
            } catch (_e) {
                // empty
            }

            this.mapmarker1 = Pix32.depack(media, 'mapmarker', 0);
            this.mapmarker2 = Pix32.depack(media, 'mapmarker', 1);

            for (let i: number = 0; i < 8; i++) {
                this.cross[i] = Pix32.depack(media, 'cross', i);
            }

            this.mapdots1 = Pix32.depack(media, 'mapdots', 0);
            this.mapdots2 = Pix32.depack(media, 'mapdots', 1);
            this.mapdots3 = Pix32.depack(media, 'mapdots', 2);
            this.mapdots4 = Pix32.depack(media, 'mapdots', 3);

            this.scrollbar1 = Pix8.depack(media, 'scrollbar', 0);
            this.scrollbar2 = Pix8.depack(media, 'scrollbar', 1);

            this.redstone1 = Pix8.depack(media, 'redstone1', 0);
            this.redstone2 = Pix8.depack(media, 'redstone2', 0);
            this.redstone3 = Pix8.depack(media, 'redstone3', 0);

            this.redstone1h = Pix8.depack(media, 'redstone1', 0);
            this.redstone1h?.hflip();

            this.redstone2h = Pix8.depack(media, 'redstone2', 0);
            this.redstone2h?.hflip();

            this.redstone1v = Pix8.depack(media, 'redstone1', 0);
            this.redstone1v?.vflip();

            this.redstone2v = Pix8.depack(media, 'redstone2', 0);
            this.redstone2v?.vflip();

            this.redstone3v = Pix8.depack(media, 'redstone3', 0);
            this.redstone3v?.vflip();

            this.redstone1hv = Pix8.depack(media, 'redstone1', 0);
            this.redstone1hv?.hflip();
            this.redstone1hv?.vflip();

            this.redstone2hv = Pix8.depack(media, 'redstone2', 0);
            this.redstone2hv?.hflip();
            this.redstone2hv?.vflip();

            for (let i = 0; i < 2; i++) {
                this.modIcons[i] = Pix8.depack(media, 'mod_icons', i);
            }

            const backleft1: Pix32 = Pix32.depack(media, 'backleft1', 0);
            this.areaBackleft1 = new PixMap(backleft1.wi, backleft1.hi);
            backleft1.quickPlotSprite(0, 0);

            const backleft2: Pix32 = Pix32.depack(media, 'backleft2', 0);
            this.areaBackleft2 = new PixMap(backleft2.wi, backleft2.hi);
            backleft2.quickPlotSprite(0, 0);

            const backright1: Pix32 = Pix32.depack(media, 'backright1', 0);
            this.areaBackright1 = new PixMap(backright1.wi, backright1.hi);
            backright1.quickPlotSprite(0, 0);

            const backright2: Pix32 = Pix32.depack(media, 'backright2', 0);
            this.areaBackright2 = new PixMap(backright2.wi, backright2.hi);
            backright2.quickPlotSprite(0, 0);

            const backtop1: Pix32 = Pix32.depack(media, 'backtop1', 0);
            this.areaBacktop1 = new PixMap(backtop1.wi, backtop1.hi);
            backtop1.quickPlotSprite(0, 0);

            const backvmid1: Pix32 = Pix32.depack(media, 'backvmid1', 0);
            this.areaBackvmid1 = new PixMap(backvmid1.wi, backvmid1.hi);
            backvmid1.quickPlotSprite(0, 0);

            const backvmid2: Pix32 = Pix32.depack(media, 'backvmid2', 0);
            this.areaBackvmid2 = new PixMap(backvmid2.wi, backvmid2.hi);
            backvmid2.quickPlotSprite(0, 0);

            const backvmid3: Pix32 = Pix32.depack(media, 'backvmid3', 0);
            this.areaBackvmid3 = new PixMap(backvmid3.wi, backvmid3.hi);
            backvmid3.quickPlotSprite(0, 0);

            const backhmid2: Pix32 = Pix32.depack(media, 'backhmid2', 0);
            this.areaBackhmid2 = new PixMap(backhmid2.wi, backhmid2.hi);
            backhmid2.quickPlotSprite(0, 0);

            const randR: number = ((Math.random() * 21.0) | 0) - 10;
            const randG: number = ((Math.random() * 21.0) | 0) - 10;
            const randB: number = ((Math.random() * 21.0) | 0) - 10;
            const rand: number = ((Math.random() * 41.0) | 0) - 20;

            for (let i: number = 0; i < 50; i++) {
                if (this.mapfunction[i]) {
                    this.mapfunction[i]?.rgbAdjust(randR + rand, randG + rand, randB + rand);
                }

                if (this.mapscene[i]) {
                    this.mapscene[i]?.rgbAdjust(randR + rand, randG + rand, randB + rand);
                }
            }

            await this.drawProgress('Unpacking textures', 83);

            Pix3D.unpackTextures(textures);
            Pix3D.initColourTable(0.8);
            Pix3D.initPool(20);

            await this.drawProgress('Unpacking config', 86);

            SeqType.init(config);
            LocType.init(config);
            FloType.init(config);
            ObjType.init(config, Client.memServer);
            NpcType.init(config);
            IdkType.init(config);
            SpotType.init(config);
            VarpType.init(config);
            VarBitType.init(config);

            if (!Client.lowMem) {
                await this.drawProgress('Unpacking sounds', 90);
                const soundsDat = sounds.read('sounds.dat');
                JagFX.init(new Packet(soundsDat));
            }

            await this.drawProgress('Unpacking interfaces', 95);

            IfType.init(interfaces, media, [this.p11, this.p12, this.b12, this.q8]);

            await this.drawProgress('Preparing game engine', 100);

            for (let y: number = 0; y < 33; y++) {
                let left: number = 999;
                let right: number = 0;

                for (let x: number = 0; x < 34; x++) {
                    if (this.mapback.data[x + y * this.mapback.wi] === 0) {
                        if (left === 999) {
                            left = x;
                        }
                    } else if (left !== 999) {
                        right = x;
                        break;
                    }
                }

                this.compassMaskLineOffsets[y] = left;
                this.compassMaskLineLengths[y] = right - left;
            }

            for (let y: number = 5; y < 156; y++) {
                let left: number = 999;
                let right: number = 0;

                for (let x: number = 25; x < 172; x++) {
                    if (this.mapback.data[x + y * this.mapback.wi] === 0 && (x > 34 || y > 34)) {
                        if (left === 999) {
                            left = x;
                        }
                    } else if (left !== 999) {
                        right = x;
                        break;
                    }
                }

                this.minimapMaskLineOffsets[y - 5] = left - 25;
                this.minimapMaskLineLengths[y - 5] = right - left;
            }

            Pix3D.setClipping(479, 96);
            this.chatScanline = Pix3D.scanline;

            Pix3D.setClipping(190, 261);
            this.sideScanline = Pix3D.scanline;

            Pix3D.setClipping(512, 334);
            this.gameScanline = Pix3D.scanline;

            const distance: Int32Array = new Int32Array(9);
            for (let x: number = 0; x < 9; x++) {
                const angle: number = x * 32 + 128 + 15;
                const offset: number = angle * 3 + 600;
                const sin: number = Pix3D.sinTable[angle];
                distance[x] = (offset * sin) >> 16;
            }

            World.resetVisCalc(distance, 500, 800, 512, 334);
            WordFilter.unpack(wordenc);

            if (!this.mouseTrackingInterval) {
                this.mouseTrackingInterval = setInterval(() => {
                    this.mouseTracking.cycle();
                }, 50);
            }
        } catch (e) {
            console.error(e);

            if (e instanceof Error) {
                this.errorMessage = `loaderror - ${this.lastProgressMessage} ${this.lastProgressPercent}%: ${e.message}`;
            }

            this.errorLoading = true;
        }
    }

    override async mainloop() {
        if (this.errorStarted || this.errorLoading || this.errorHost) {
            return;
        }

        Client.loopCycle++;

        if (!this.ingame) {
            await this.titleScreenLoop();
        } else {
            await this.gameLoop();
        }

        await this.onDemandLoop();
    }

    override async mainredraw() {
        if (this.errorStarted || this.errorLoading || this.errorHost) {
            this.drawError();
            return;
        }

        Client.drawCycle++;

        if (!this.ingame) {
            await this.titleScreenDraw();
        } else {
            this.gameDraw();
        }

        if (this.isMobile) {
            MobileKeyboard.draw();
        }

        this.scrollCycle = 0;
    }

    override refresh() {
        this.redrawFrame = true;
    }

    protected override mainquit(): void {
        this.stream?.close();
        this.stream = null;

        if (this.mouseTrackingInterval) {
            clearInterval(this.mouseTrackingInterval);
            this.mouseTrackingInterval = null;
        }

        this.onDemand?.stop();
        this.onDemand = null;

        this.unloadTitle();
        this.drawArea = null;
    }

    // ----

    async onDemandLoop() {
        if (!this.onDemand) {
            return;
        }

        await this.onDemand.run();

        while (true) {
            const req = this.onDemand.loop();
            if (req === null) {
                return;
            }

            if (!req.data) {
                continue;
            }

            if (req.archive === 0) {
                Model.unpack(req.file, req.data);

                if ((this.onDemand.getModelUse(req.file) & 0x62) != 0) {
                    this.redrawSide = true;

                    if (this.chatModalId !== -1) {
                        this.redrawChat = true;
                    }
                }
            } else if (req.archive === 1) {
                AnimFrame.unpack(req.data);
            } else if (req.archive === 2) {
                if (this.midiSong === req.file) {
                    this.saveMidi(req.data, this.midiFading);
                }
            } else if (req.archive === 3) {
                if (this.mapBuildGroundData && this.mapBuildLocationData && this.sceneState === 1) {
                    for (let i = 0; i < this.mapBuildGroundData.length; i++) {
                        if (this.mapBuildGroundFile[i] == req.file) {
                            this.mapBuildGroundData[i] = req.data;

                            if (req.data == null) {
                                this.mapBuildGroundFile[i] = -1;
                            }

                            break;
                        }

                        if (this.mapBuildLocationFile[i] == req.file) {
                            this.mapBuildLocationData[i] = req.data;

                            if (req.data == null) {
                                this.mapBuildLocationFile[i] = -1;
                            }

                            break;
                        }
                    }
                }
            } else if (req.archive === 93) {
                if (this.onDemand.hasMapLocFile(req.file)) {
                    ClientBuild.prefetchLocations(new Packet(req.data), this.onDemand);
                }
            }
        }
    }

    private async titleScreenLoop(): Promise<void> {
        if (this.loginscreen === 0) {
            let x: number = ((this.sWid / 2) | 0) - 80;
            let y: number = ((this.sHei / 2) | 0) + 20;

            y += 20;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.loginscreen = 3;
                this.loginSelect = 0;
            }

            x = ((this.sWid / 2) | 0) + 80;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.loginMes1 = '';
                this.loginMes2 = 'Enter your username & password.';
                this.loginscreen = 2;
                this.loginSelect = 0;
            }
        } else if (this.loginscreen === 2) {
            let y: number = ((this.sHei / 2) | 0) - 40;
            y += 30;

            y += 25;
            if (this.mouseClickButton === 1 && this.mouseClickY >= y - 15 && this.mouseClickY < y) {
                this.loginSelect = 0;
            }

            y += 15;
            if (this.mouseClickButton === 1 && this.mouseClickY >= y - 15 && this.mouseClickY < y) {
                this.loginSelect = 1;
            }
            // y += 15; dead code

            let x = ((this.sWid / 2) | 0) - 80;
            y = ((this.sHei / 2) | 0) + 50;
            y += 20;

            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                await this.login(this.loginUser, this.loginPass, false);

                if (this.ingame) {
                    return;
                }
            }

            x = ((this.sWid / 2) | 0) + 80;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.loginscreen = 0;
                this.loginUser = '';
                this.loginPass = '';
            }

            while (true) {
                const key: number = this.pollKey();
                if (key === -1) {
                    return;
                }

                let valid: boolean = false;
                for (let i: number = 0; i < Client.CHARSET.length; i++) {
                    if (String.fromCharCode(key) === Client.CHARSET.charAt(i)) {
                        valid = true;
                        break;
                    }
                }

                if (this.loginSelect === 0) {
                    if (key === 8 && this.loginUser.length > 0) {
                        this.loginUser = this.loginUser.substring(0, this.loginUser.length - 1);
                    }

                    if (key === 9 || key === 10 || key === 13) {
                        this.loginSelect = 1;
                    }

                    if (valid) {
                        this.loginUser = this.loginUser + String.fromCharCode(key);
                    }

                    if (this.loginUser.length > 12) {
                        this.loginUser = this.loginUser.substring(0, 12);
                    }
                } else if (this.loginSelect === 1) {
                    if (key === 8 && this.loginPass.length > 0) {
                        this.loginPass = this.loginPass.substring(0, this.loginPass.length - 1);
                    }

                    if (key === 9 || key === 10 || key === 13) {
                        this.loginSelect = 0;
                    }

                    if (valid) {
                        this.loginPass = this.loginPass + String.fromCharCode(key);
                    }

                    if (this.loginPass.length > 20) {
                        this.loginPass = this.loginPass.substring(0, 20);
                    }
                }
            }
        } else if (this.loginscreen === 3) {
            const x: number = (this.sWid / 2) | 0;
            let y: number = ((this.sHei / 2) | 0) + 50;

            y += 20;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.loginscreen = 0;
            }
        }
    }

    private async titleScreenDraw(): Promise<void> {
        // Auto-login from URL params when bot SDK is enabled
        if (ENABLE_BOT_SDK && !this.botAutoLoginAttempted && this.lastProgressPercent >= 100) {
            const botUsername = BotSDKModule.getBotUsername();
            const botPassword = BotSDKModule.getBotPassword();
            if (botUsername !== 'default' && botPassword) {
                this.botAutoLoginAttempted = true;
                console.log(`[Client] Auto-login triggered for bot: ${botUsername}`);
                // Don't await - let it run async so we don't block drawing
                // Engine handles session takeover if another session exists
                this.autoLogin(botUsername, botPassword).catch(e => {
                    console.error('[Client] Auto-login failed:', e);
                });
            }
        }

        await this.prepareTitle();
        this.imageTitle4?.setPixels();
        this.imageTitlebox?.plotSprite(0, 0);

        const w: number = 360;
        const h: number = 200;

        if (this.loginscreen === 0) {
            const extraY: number = ((h / 2) | 0) + 80;
            let y: number = ((h / 2) | 0) - 20;

            if (this.onDemand) {
                this.p11?.centreStringTag(this.onDemand.message, w / 2, extraY, 0x75a9a9, true);
            }

            this.b12?.centreStringTag('Welcome to RuneScape', w / 2, y, Colour.YELLOW, true);
            y += 30;

            let x = ((w / 2) | 0) - 80;
            y = ((h / 2) | 0) + 20;
            this.imageTitlebutton?.plotSprite(x - 73, y - 20);
            this.b12?.centreStringTag('New User', x, y + 5, Colour.WHITE, true);

            x = ((w / 2) | 0) + 80;
            this.imageTitlebutton?.plotSprite(x - 73, y - 20);
            this.b12?.centreStringTag('Existing User', x, y + 5, Colour.WHITE, true);
        } else if (this.loginscreen === 2) {
            let x: number = ((w / 2) | 0) - 80;
            let y: number = ((h / 2) | 0) - 40;
            if (this.loginMes1.length > 0) {
                this.b12?.centreStringTag(this.loginMes1, w / 2, y - 15, Colour.YELLOW, true);
                this.b12?.centreStringTag(this.loginMes2, w / 2, y, Colour.YELLOW, true);
                y += 30;
            } else {
                this.b12?.centreStringTag(this.loginMes2, w / 2, y - 7, Colour.YELLOW, true);
                y += 30;
            }

            this.b12?.drawStringTag(`Username: ${this.loginUser}${this.loginSelect === 0 && Client.loopCycle % 40 < 20 ? '@yel@|' : ''}`, w / 2 - 90, y, Colour.WHITE, true);
            y += 15;

            this.b12?.drawStringTag(`Password: ${JString.getRepeatedCharacter(this.loginPass)}${this.loginSelect === 1 && Client.loopCycle % 40 < 20 ? '@yel@|' : ''}`, w / 2 - 88, y, Colour.WHITE, true);
            y += 15;

            x = ((w / 2) | 0) - 80;
            y = ((h / 2) | 0) + 50;
            this.imageTitlebutton?.plotSprite(x - 73, y - 20);
            this.b12?.centreStringTag('Login', x, y + 5, Colour.WHITE, true);

            x = ((w / 2) | 0) + 80;
            this.imageTitlebutton?.plotSprite(x - 73, y - 20);
            this.b12?.centreStringTag('Cancel', x, y + 5, Colour.WHITE, true);
        } else if (this.loginscreen === 3) {
            let x: number = (w / 2) | 0;
            let y: number = ((h / 2) | 0) - 60;
            this.b12?.centreStringTag('Create a free account', x, y, Colour.YELLOW, true);

            y = ((h / 2) | 0) - 35;
            this.b12?.centreStringTag('To create a new account you need to', x, y, Colour.WHITE, true);
            y += 15;

            this.b12?.centreStringTag('go back to the main RuneScape webpage', x, y, Colour.WHITE, true);
            y += 15;

            this.b12?.centreStringTag("and choose the red 'create account'", x, y, Colour.WHITE, true);
            y += 15;

            this.b12?.centreStringTag('button at the top right of that page.', x, y, Colour.WHITE, true);
            y += 15;

            x = (w / 2) | 0;
            y = ((h / 2) | 0) + 50;
            this.imageTitlebutton?.plotSprite(x - 73, y - 20);
            this.b12?.centreStringTag('Cancel', x, y + 5, Colour.WHITE, true);
        }

        this.imageTitle4?.draw(202, 171);

        if (this.redrawFrame) {
            this.redrawFrame = false;
            this.imageTitle2?.draw(128, 0);
            this.imageTitle3?.draw(202, 371);
            this.imageTitle5?.draw(0, 265);
            this.imageTitle6?.draw(562, 265);
            this.imageTitle7?.draw(128, 171);
            this.imageTitle8?.draw(562, 171);
        }
    }

    private async prepareTitle(): Promise<void> {
        if (this.imageTitle2) {
            return;
        }

        this.drawArea = null;
        this.areaChat = null;
        this.areaMap = null;
        this.areaSide = null;
        this.areaGame = null;
        this.areaBackbase1 = null;
        this.areaBackbase2 = null;
        this.areaBackhmid1 = null;

        this.imageTitle0 = new PixMap(128, 265);
        Pix2D.cls();

        this.imageTitle1 = new PixMap(128, 265);
        Pix2D.cls();

        this.imageTitle2 = new PixMap(509, 171);
        Pix2D.cls();

        this.imageTitle3 = new PixMap(360, 132);
        Pix2D.cls();

        this.imageTitle4 = new PixMap(360, 200);
        Pix2D.cls();

        this.imageTitle5 = new PixMap(202, 238);
        Pix2D.cls();

        this.imageTitle6 = new PixMap(203, 238);
        Pix2D.cls();

        this.imageTitle7 = new PixMap(74, 94);
        Pix2D.cls();

        this.imageTitle8 = new PixMap(75, 94);
        Pix2D.cls();

        if (this.title) {
            await this.loadTitleBackground();
            this.loadTitleImages();
        }

        this.redrawFrame = true;
    }

    private async loadTitleBackground(): Promise<void> {
        if (!this.title) {
            return;
        }

        const background: Pix32 = await Pix32.fromJpeg(this.title, 'title.dat');

        this.imageTitle0?.setPixels();
        background.quickPlotSprite(0, 0);

        this.imageTitle1?.setPixels();
        background.quickPlotSprite(-637, 0);

        this.imageTitle2?.setPixels();
        background.quickPlotSprite(-128, 0);

        this.imageTitle3?.setPixels();
        background.quickPlotSprite(-202, -371);

        this.imageTitle4?.setPixels();
        background.quickPlotSprite(-202, -171);

        this.imageTitle5?.setPixels();
        background.quickPlotSprite(0, -265);

        this.imageTitle6?.setPixels();
        background.quickPlotSprite(-562, -265);

        this.imageTitle7?.setPixels();
        background.quickPlotSprite(-128, -171);

        this.imageTitle8?.setPixels();
        background.quickPlotSprite(-562, -171);

        // draw right side (mirror image)
        background.hflip();

        this.imageTitle0?.setPixels();
        background.quickPlotSprite(382, 0);

        this.imageTitle1?.setPixels();
        background.quickPlotSprite(-255, 0);

        this.imageTitle2?.setPixels();
        background.quickPlotSprite(254, 0);

        this.imageTitle3?.setPixels();
        background.quickPlotSprite(180, -371);

        this.imageTitle4?.setPixels();
        background.quickPlotSprite(180, -171);

        this.imageTitle5?.setPixels();
        background.quickPlotSprite(382, -265);

        this.imageTitle6?.setPixels();
        background.quickPlotSprite(-180, -265);

        this.imageTitle7?.setPixels();
        background.quickPlotSprite(254, -171);

        this.imageTitle8?.setPixels();
        background.quickPlotSprite(-180, -171);

        const logo: Pix32 = Pix32.depack(this.title, 'logo');
        this.imageTitle2?.setPixels();
        logo.plotSprite(((this.sWid / 2) | 0) - ((logo.wi / 2) | 0) - 128, 18);
    }

    private loadTitleImages(): void {
        if (!this.title) {
            return;
        }

        this.imageTitlebox = Pix8.depack(this.title, 'titlebox');
        this.imageTitlebutton = Pix8.depack(this.title, 'titlebutton');

        const flameIcon: number = this.getIntParam('fl_icon');
        for (let i: number = 0; i < 12; i++) {
            this.imageRunes[i] = Pix8.depack(this.title, 'runes', flameIcon === 0 ? i : (i & 0x3) + 12);
        }

        this.drawProgress('Connecting to fileserver', 10).then((): void => {
            if (!this.titleFlames && this.imageTitle0 && this.imageTitle1) {
                this.titleFlames = new TitleFlames(this.imageRunes);
                this.titleFlames.setupFire(this.imageTitle0, this.imageTitle1);
                this.titleFlames.start();
            }
        });
    }

    private async login(username: string, password: string, reconnect: boolean): Promise<void> {
        try {
            if (username.length < 1 || username.length > 12) {
                this.loginMes1 = '';
                this.loginMes2 = 'Username must be 1-12 characters.';
                return;
            }

            if (password.length < 1 || password.length > 20) {
                this.loginMes1 = '';
                this.loginMes2 = 'Password must be 1-20 characters.';
                return;
            }

            if (!reconnect) {
                this.loginMes1 = '';
                this.loginMes2 = 'Connecting to server...';
                await this.titleScreenDraw();
            }

            this.stream = new ClientStream(await ClientStream.openSocket(window.location.host, window.location.protocol === 'https:'));

            const userhash = JString.toUserhash(username);
            const loginServer = Number(userhash >> 16n) & 0x1f;

            this.out.pos = 0;
            this.out.p1(14);
            this.out.p1(loginServer);

            this.stream.write(this.out.data, 2);
            for (let i = 0; i < 8; i++) {
                await this.stream.read();
            }

            let response: number = await this.stream.read();
            if (response === 0) {
                await this.stream.readBytes(this.in.data, 0, 8);
                this.in.pos = 0;

                this.loginSeed = this.in.g8();
                const seed: Int32Array = new Int32Array([
                    Math.floor(Math.random() * 99999999), 
                    Math.floor(Math.random() * 99999999),
                    Number(this.loginSeed >> 32n),
                    Number(this.loginSeed & BigInt(0xffffffff))
                ]);

                this.out.pos = 0;
                this.out.p1(10);
                this.out.p4(seed[0]);
                this.out.p4(seed[1]);
                this.out.p4(seed[2]);
                this.out.p4(seed[3]);
                this.out.p4(1337); // uid
                this.out.pjstr(username);
                this.out.pjstr(password);
                this.out.rsaenc(BigInt(process.env.LOGIN_RSAN!), BigInt(process.env.LOGIN_RSAE!));

                this.loginout.pos = 0;
                if (reconnect) {
                    this.loginout.p1(18);
                } else {
                    this.loginout.p1(16);
                }

                this.loginout.p1(this.out.pos + 36 + 1 + 2 + 1);
                this.loginout.p1(255);
                this.loginout.p2(CLIENT_VERSION);
                this.loginout.p1(Client.lowMem ? 1 : 0);

                for (let i: number = 0; i < 9; i++) {
                    this.loginout.p4(this.jagChecksum[i]);
                }

                this.loginout.pdata(this.out.data, 0, this.out.pos);
                this.out.random = new Isaac(seed);
                for (let i: number = 0; i < 4; i++) {
                    seed[i] += 50;
                }
                this.randomIn = new Isaac(seed);
                this.stream?.write(this.loginout.data, this.loginout.pos);

                response = await this.stream.read();
            }

            if (response === 1) {
                await sleep(2000);
                await this.login(username, password, reconnect);
            } else if (response === 2) {
                this.staffmodlevel = await this.stream.read();
                this.mouseTracked = (await this.stream.read()) === 1;

                this.prevMouseClickTime = 0;
                this.mouseTrackDelta = 0;
                this.mouseTracking.length = 0;
                this.focus = true;
                this.focusIn = true;
                this.ingame = true;
                this.out.pos = 0;
                this.in.pos = 0;
                this.ptype = -1;
                this.ptype0 = -1;
                this.ptype1 = -1;
                this.ptype2 = -1;
                this.psize = 0;
                this.timeoutTimer = performance.now();
                this.rebootTimer = 0;
                this.logoutTimer = 0;
                this.hintType = 0;
                this.menuNumEntries = 0;
                this.isMenuOpen = false;
                this.idleTimer = performance.now();

                for (let i: number = 0; i < 100; i++) {
                    this.chatText[i] = null;
                }

                this.useMode = 0;
                this.targetMode = 0;
                this.sceneState = 0;
                this.waveCount = 0;

                this.macroCameraX = ((Math.random() * 100.0) | 0) - 50;
                this.macroCameraZ = ((Math.random() * 110.0) | 0) - 55;
                this.macroCameraAngle = ((Math.random() * 80.0) | 0) - 40;
                this.macroMinimapAngle = ((Math.random() * 120.0) | 0) - 60;
                this.macroMinimapZoom = ((Math.random() * 30.0) | 0) - 20;
                this.orbitCameraYaw = (((Math.random() * 20.0) | 0) - 10) & 0x7ff;

                this.minimapState = 0;
                this.minimapLevel = -1;
                this.minimapFlagX = 0;
                this.minimapFlagZ = 0;

                this.playerCount = 0;
                this.npcCount = 0;

                for (let i: number = 0; i < MAX_PLAYER_COUNT; i++) {
                    this.players[i] = null;
                    this.playerAppearanceBuffer[i] = null;
                }

                for (let i: number = 0; i < 16384; i++) {
                    this.npc[i] = null;
                }

                this.localPlayer = this.players[LOCAL_PLAYER_INDEX] = new ClientPlayer();

                this.projectiles.clear();
                this.spotanims.clear();

                for (let level: number = 0; level < BuildArea.LEVELS; level++) {
                    for (let x: number = 0; x < BuildArea.SIZE; x++) {
                        for (let z: number = 0; z < BuildArea.SIZE; z++) {
                            this.groundObj[level][x][z] = null;
                        }
                    }
                }

                this.locChanges = new LinkList();
                this.friendServerStatus = 0;
                this.friendCount = 0;
                this.tutComId = -1;
                this.chatModalId = -1;
                this.mainModalId = -1;
                this.sideModalId = -1;
                this.mainOverlayId = -1;
                this.resumedPauseButton = false;
                this.activeIcon = 3;
                this.dialogInputOpen = false;
                this.isMenuOpen = false;
                this.socialInputOpen = false;
                this.tutComMessage = null;
                this.inMultizone = 0;
                this.tutFlashIcon = -1;

                this.idkDesignGender = true;
                this.validateIdkDesign();
                for (let i: number = 0; i < 5; i++) {
                    this.idkDesignColour[i] = 0;
                }

                this.orbitCameraPitch = 383; // max pitch for overhead view

                // Initialize Bot SDK overlay (only if enabled)
                if (ENABLE_BOT_SDK && BotOverlay && !this.botOverlay) {
                    this.botOverlay = new BotOverlay(this);
                }

                for (let i = 0; i < 5; i++) {
                    this.playerOp[i] = null;
                    this.playerOpPriority[i] = false;
                }

                Client.oplogic1 = 0;
                Client.oplogic2 = 0;
                Client.oplogic3 = 0;
                Client.oplogic4 = 0;
                Client.oplogic5 = 0;
                Client.oplogic6 = 0;
                Client.oplogic7 = 0;
                Client.oplogic8 = 0;
                Client.oplogic9 = 0;
                Client.oplogic10 = 0;

                this.prepareGame();
            } else if (response === 3) {
                this.loginMes1 = '';
                this.loginMes2 = 'Invalid username or password.';
            } else if (response === 4) {
                this.loginMes1 = 'Your account has been disabled.';
                this.loginMes2 = 'Please check your message-centre for details.';
            } else if (response === 5) {
                this.loginMes1 = 'Your account is already logged in.';
                this.loginMes2 = 'Try again in 60 secs...';
            } else if (response === 6) {
                this.loginMes1 = 'RuneScape has been updated!';
                this.loginMes2 = 'Please reload this page.';
            } else if (response === 7) {
                this.loginMes1 = 'This world is full.';
                this.loginMes2 = 'Please use a different world.';
            } else if (response === 8) {
                this.loginMes1 = 'Unable to connect.';
                this.loginMes2 = 'Login server offline.';
            } else if (response === 9) {
                this.loginMes1 = 'Login limit exceeded.';
                this.loginMes2 = 'Too many connections from your address.';
            } else if (response === 10) {
                this.loginMes1 = 'Unable to connect.';
                this.loginMes2 = 'Bad session id.';
            } else if (response === 11) {
                this.loginMes2 = 'Login server rejected session.'; // [sic] loginMes2
                this.loginMes2 = 'Please try again.';
            } else if (response === 12) {
                this.loginMes1 = 'You need a members account to login to this world.';
                this.loginMes2 = 'Please subscribe, or use a different world.';
            } else if (response === 13) {
                this.loginMes1 = 'Could not complete login.';
                this.loginMes2 = 'Please try using a different world.';
            } else if (response === 14) {
                this.loginMes1 = 'The server is being updated.';
                this.loginMes2 = 'Please wait 1 minute and try again.';
            } else if (response === 15) {
                this.ingame = true;
                this.out.pos = 0;
                this.in.pos = 0;
                this.ptype = -1;
                this.ptype0 = -1;
                this.ptype1 = -1;
                this.ptype2 = -1;
                this.psize = 0;
                this.timeoutTimer = performance.now();
                this.rebootTimer = 0;
                this.menuNumEntries = 0;
                this.isMenuOpen = false;
                this.sceneLoadStartTime = performance.now();

                // Show Bot SDK overlay on reconnection
                if (this.botOverlay) {
                    this.botOverlay.show();
                }
            } else if (response === 16) {
                this.loginMes1 = 'Login attempts exceeded.';
                this.loginMes2 = 'Please wait 1 minute and try again.';
            } else if (response === 17) {
                this.loginMes1 = 'You are standing in a members-only area.';
                this.loginMes2 = 'To play on this world move to a free area first';
            } else if (response === 20) {
                this.loginMes1 = 'Invalid loginserver requested';
                this.loginMes2 = 'Please try using a different world.';
            } else if (response === 21) {
                for (let remaining = await this.stream.read(); remaining >= 0; remaining--) {
                    this.loginMes1 = 'You have only just left another world';
                    this.loginMes2 = 'Your profile will be transferred in: ' + remaining + ' seconds';
                    await this.titleScreenDraw();

                    await sleep(1000);
                }

                await this.login(username, password, reconnect);
            } else {
                console.log('response:' + response);
                this.loginMes1 = 'Unexpected server response';
                this.loginMes2 = 'Please try using a different world.';
            }
        } catch (e) {
            if (e instanceof WebSocket && e.readyState === 3) {
                // IO error
                this.loginMes1 = '';
                this.loginMes2 = 'Error connecting to server.';
            } else {
                // exceptions in Java get stuck permanently on "Connecting to server..."
                throw e;
            }
        }
    }

    private unloadTitle(): void {
        this.titleFlames?.close();
        this.titleFlames = null;

        this.imageTitlebox = null;
        this.imageTitlebutton = null;
        this.imageRunes = [];
    }

    private prepareGame(): void {
        if (this.areaChat) {
            return;
        }

        this.unloadTitle();

        this.drawArea = null;
        this.imageTitle2 = null;
        this.imageTitle3 = null;
        this.imageTitle4 = null;
        this.imageTitle0 = null;
        this.imageTitle1 = null;
        this.imageTitle5 = null;
        this.imageTitle6 = null;
        this.imageTitle7 = null;
        this.imageTitle8 = null;

        this.areaChat = new PixMap(479, 96);

        this.areaMap = new PixMap(172, 156);
        Pix2D.cls();
        this.mapback?.plotSprite(0, 0);

        this.areaSide = new PixMap(190, 261);

        this.areaGame = new PixMap(512, 334);
        Pix2D.cls();

        this.areaBackbase1 = new PixMap(496, 50);
        this.areaBackbase2 = new PixMap(269, 37);
        this.areaBackhmid1 = new PixMap(249, 45);

        this.redrawFrame = true;
    }

    private async gameLoop(): Promise<void> {
        if (this.players === null) {
            // client is unloading asynchronously
            return;
        }

        if (this.rebootTimer > 1) {
            this.rebootTimer--;
        }

        if (this.logoutTimer > 0) {
            this.logoutTimer--;
        }

        for (let i: number = 0; i < 5 && (await this.tcpIn()); i++) {
            // empty
        }

        const now = performance.now();

        if (!this.ingame) {
            return;
        }

        if (!this.mouseTracked) {
            this.mouseTracking.length = 0;
        } else if (this.mouseClickButton !== 0 || this.mouseTracking.length >= 40) {
            this.out.p1Enc(ClientProt.EVENT_MOUSE_MOVE);
            this.out.p1(0);
            const start = this.out.pos;
            let count = 0;

            // custom: Java client checks `start - this.out.pos < 240` but this is obviously wrong
            //   and will lead to an invalid packet if the user is buffering a lot of mouse movements (i.e. while disconnected)
            for (let i = 0; i < this.mouseTracking.length && this.out.pos - start < 240; i++) {
                count++;

                let y = this.mouseTracking.y[i];
                if (y < 0) {
                    y = 0;
                } else if (y > 502) {
                    y = 502;
                }

                let x = this.mouseTracking.x[i];
                if (x < 0) {
                    x = 0;
                } else if (x > 764) {
                    x = 764;
                }

                let pos = y * 765 + x;
                if (this.mouseTracking.y[i] === -1 && this.mouseTracking.x[i] === -1) {
                    x = -1;
                    y = -1;
                    pos = 0x7ffff;
                }

                if (x !== this.mouseTrackedX || y !== this.mouseTrackedY) {
                    let dx = x - this.mouseTrackedX;
                    this.mouseTrackedX = x;
                    let dy = y - this.mouseTrackedY;
                    this.mouseTrackedY = y;

                    if (this.mouseTrackDelta < 8 && dx >= -32 && dx <= 31 && dy >= -32 && dy <= 31) {
                        dx += 32;
                        dy += 32;
                        this.out.p2((this.mouseTrackDelta << 12) + (dx << 6) + dy);
                        this.mouseTrackDelta = 0;
                    } else if (this.mouseTrackDelta < 8) {
                        this.out.p3(0x800000 + (this.mouseTrackDelta << 19) + pos);
                        this.mouseTrackDelta = 0;
                    } else {
                        this.out.p4(0xc0000000 + (this.mouseTrackDelta << 19) + pos);
                        this.mouseTrackDelta = 0;
                    }
                } else if (this.mouseTrackDelta < 2047) {
                    this.mouseTrackDelta++;
                }
            }

            this.out.psize1(this.out.pos - start);

            if (count >= this.mouseTracking.length) {
                this.mouseTracking.length = 0;
            } else {
                this.mouseTracking.length -= count;

                for (let i = 0; i < this.mouseTracking.length; i++) {
                    this.mouseTracking.x[i] = this.mouseTracking.x[i + count];
                    this.mouseTracking.y[i] = this.mouseTracking.y[i + count];
                }
            }
        }

        if (this.mouseClickButton !== 0) {
            let delta = ((this.mouseClickTime - this.prevMouseClickTime) / 50) | 0;
            if (delta > 4095) {
                delta = 4095;
            }

            this.prevMouseClickTime = this.mouseClickTime;

            let y = this.mouseClickY;
            if (y < 0) {
                y = 0;
            } else if (y > 502) {
                y = 502;
            }

            let x = this.mouseClickX;
            if (x < 0) {
                x = 0;
            } else if (x > 764) {
                x = 764;
            }

            const pos = y * 765 + x;

            let button = 0;
            if (this.mouseClickButton === 2) {
                button = 1;
            }

            this.out.p1Enc(ClientProt.EVENT_MOUSE_CLICK);
            this.out.p4((delta << 20) + (button << 19) + pos);
        }

        if (this.sendCameraDelay > 0) {
            this.sendCameraDelay--;
        }

        if (this.keyHeld[1] === 1 || this.keyHeld[2] === 1 || this.keyHeld[3] === 1 || this.keyHeld[4] === 1) {
            this.sendCamera = true;
        }

        if (this.sendCamera && this.sendCameraDelay <= 0) {
            this.sendCameraDelay = 20;
            this.sendCamera = false;
            this.out.p1Enc(ClientProt.EVENT_CAMERA_POSITION);
            this.out.p2(this.orbitCameraPitch);
            this.out.p2(this.orbitCameraYaw);
        }

        if (this.focus && !this.focusIn) {
            this.focusIn = true;
            this.out.p1Enc(ClientProt.EVENT_APPLET_FOCUS);
            this.out.p1(1);
        } else if (!this.focus && this.focusIn) {
            this.focusIn = false;
            this.out.p1Enc(ClientProt.EVENT_APPLET_FOCUS);
            this.out.p1(0);
        }

        this.checkMinimap();
        this.locChangeDoQueue();
        await this.soundsDoQueue();

        if (now - this.timeoutTimer > 15_000) {
            // no packets received recently, connection lost
            await this.lostCon();
        }

        this.movePlayers();
        this.moveNpcs();
        this.timeoutChat();

        this.worldUpdateNum++;

        if (this.crossMode !== 0) {
            this.crossCycle += 20;

            if (this.crossCycle >= 400) {
                this.crossMode = 0;
            }
        }

        if (this.selectedArea !== 0) {
            this.selectedCycle++;

            if (this.selectedCycle >= 15) {
                if (this.selectedArea === 2) {
                    this.redrawSide = true;
                }
                if (this.selectedArea === 3) {
                    this.redrawChat = true;
                }

                this.selectedArea = 0;
            }
        }

        if (this.objDragArea !== 0) {
            this.objDragCycles++;

            if (this.mouseX > this.objGrabX + 5 || this.mouseX < this.objGrabX - 5 || this.mouseY > this.objGrabY + 5 || this.mouseY < this.objGrabY - 5) {
                this.objGrabThreshold = true;
            }

            if (this.mouseButton === 0) {
                if (this.objDragArea === 2) {
                    this.redrawSide = true;
                }
                if (this.objDragArea === 3) {
                    this.redrawChat = true;
                }

                this.objDragArea = 0;

                if (this.objGrabThreshold && this.objDragCycles >= 5) {
                    this.hoveredSlotComId = -1;
                    this.buildMinimenu();

                    if (this.hoveredSlotComId === this.objDragComId && this.hoveredSlot !== this.objDragSlot) {
                        const com: IfType = IfType.list[this.objDragComId];

                        let mode = 0;
                        if (this.bankArrangeMode == 1 && com.clientCode == ClientCode.CC_BANKMODE) {
                            mode = 1;
                        }
                        if (com.linkObjType && com.linkObjType[this.hoveredSlot] <= 0) {
                            mode = 0;
                        }

                        if (com.objReplace && com.linkObjType && com.linkObjNumber) {
                            const src = this.objDragSlot;
                            const dst = this.hoveredSlot;

                            com.linkObjType[dst] = com.linkObjType[src];
                            com.linkObjNumber[dst] = com.linkObjNumber[src];
                            com.linkObjType[src] = -1;
                            com.linkObjNumber[src] = 0;
                        } else if (mode == 1) {
                            let src = this.objDragSlot;
                            const dst = this.hoveredSlot;

                            while (src != dst) {
                                if (src > dst) {
                                    com.swapSlots(src, src - 1);
                                    src--;
                                } else if (src < dst) {
                                    com.swapSlots(src, src + 1);
                                    src++;
                                }
                            }
                        } else {
                            com.swapSlots(this.objDragSlot, this.hoveredSlot);
                        }

                        this.out.p1Enc(ClientProt.INV_BUTTOND);
                        this.out.p2(this.objDragComId);
                        this.out.p2(this.objDragSlot);
                        this.out.p2(this.hoveredSlot);
                        this.out.p1(mode);
                    }
                } else if ((this.oneMouseButton === 1 || this.isAddFriendOption(this.menuNumEntries - 1)) && this.menuNumEntries > 2) {
                    this.openMenu();
                } else if (this.menuNumEntries > 0) {
                    this.doAction(this.menuNumEntries - 1);
                }

                this.selectedCycle = 10;
                this.mouseClickButton = 0;
            }
        }

        Client.cyclelogic7++;
        if (Client.cyclelogic7 > 62) {
            Client.cyclelogic7 = 0;

            this.out.p1Enc(ClientProt.ANTICHEAT_CYCLELOGIC7);
        }

        if (World.groundX !== -1) {
            if (this.localPlayer) {
                const x: number = World.groundX;
                const z: number = World.groundZ;
                const success: boolean = this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], x, z, true, 0, 0, 0, 0, 0, 0);
                World.groundX = -1;

                if (success) {
                    this.crossX = this.mouseClickX;
                    this.crossY = this.mouseClickY;
                    this.crossMode = 1;
                    this.crossCycle = 0;
                }
            }
        }

        if (this.mouseClickButton === 1 && this.tutComMessage) {
            this.tutComMessage = null;
            this.redrawChat = true;
            this.mouseClickButton = 0;
        }

        const checkClickInput = !this.isMobile || (this.isMobile && !MobileKeyboard.isWithinCanvasKeyboard(this.mouseClickX, this.mouseClickY));

        if (checkClickInput) {
            this.mouseLoop();
            this.minimapLoop();
            this.iconLoop();
            this.chatModeLoop();
        }

        if (this.mouseButton === 1 || this.mouseClickButton === 1) {
            this.scrollCycle++;
        }

        if (this.sceneState === 2) {
            this.followCamera();
        }
        if (this.sceneState === 2 && this.cinemaCam) {
            this.cinemaCamera();
        }

        for (let i: number = 0; i < 5; i++) {
            this.camShakeCycle[i]++;
        }

        await this.handleInputKey();

        if (now - this.idleTimer > 600_000) {
            // afk logout after 10 minutes of no activity (extended from 90s for bot use).
            // SDK actions also reset this timer via BotOverlay.onAction().
            console.warn('[LOGOUT DEBUG] AFK timeout triggered (10 min no input) - setting idleTimeout=250');
            this.logoutTimer = 250;
            this.idleTimer += 10_000; // 10s backoff

            this.out.p1Enc(ClientProt.IDLE_TIMER);
        }

        this.macroCameraCycle++;
        if (this.macroCameraCycle > 500) {
            this.macroCameraCycle = 0;

            const rand: number = (Math.random() * 8.0) | 0;
            if ((rand & 0x1) === 1) {
                this.macroCameraX += this.macroCameraXModifier;
            }
            if ((rand & 0x2) === 2) {
                this.macroCameraZ += this.macroCameraZModifier;
            }
            if ((rand & 0x4) === 4) {
                this.macroCameraAngle += this.macroCameraAngleModifier;
            }
        }

        if (this.macroCameraX < -50) {
            this.macroCameraXModifier = 2;
        }
        if (this.macroCameraX > 50) {
            this.macroCameraXModifier = -2;
        }

        if (this.macroCameraZ < -55) {
            this.macroCameraZModifier = 2;
        }
        if (this.macroCameraZ > 55) {
            this.macroCameraZModifier = -2;
        }

        if (this.macroCameraAngle < -40) {
            this.macroCameraAngleModifier = 1;
        }
        if (this.macroCameraAngle > 40) {
            this.macroCameraAngleModifier = -1;
        }

        this.macroMinimapCycle++;
        if (this.macroMinimapCycle > 500) {
            this.macroMinimapCycle = 0;

            const rand: number = (Math.random() * 8.0) | 0;
            if ((rand & 0x1) === 1) {
                this.macroMinimapAngle += this.macroMinimapAngleModifier;
            }
            if ((rand & 0x2) === 2) {
                this.macroMinimapZoom += this.macroMinimapZoomModifier;
            }
        }

        if (this.macroMinimapAngle < -60) {
            this.macroMinimapAngleModifier = 2;
        }
        if (this.macroMinimapAngle > 60) {
            this.macroMinimapAngleModifier = -2;
        }

        if (this.macroMinimapZoom < -20) {
            this.macroMinimapZoomModifier = 1;
        }
        if (this.macroMinimapZoom > 10) {
            this.macroMinimapZoomModifier = -1;
        }

        if (now - this.noTimeoutTimer > 1_000) {
            // nothing sent in the last 1s, keep the client connected
            this.out.p1Enc(ClientProt.NO_TIMEOUT);
        }

        try {
            if (this.stream && this.out.pos > 0) {
                // Log packet data before sending (for debugging)
                if (this.packetLogEnabled) {
                    const dataBytes = Array.from(this.out.data.slice(0, this.out.pos));
                    // First byte is the encrypted opcode - try to get the last known opcode
                    this.logPacket(this.currentPacketOpcode, dataBytes);
                }

                this.stream.write(this.out.data, this.out.pos);
                this.out.pos = 0;
                this.noTimeoutTimer = now;
            }
        } catch (e) {
            if (e instanceof WebSocket && e.readyState === 3) {
                // IO error
                console.warn('[LOGOUT DEBUG] I/O error during packet send - calling lostCon()');
                await this.lostCon();
            } else {
                // logic error
                await this.logout();
            }
        }
    }

    private async logout(): Promise<void> {
        console.warn('[LOGOUT DEBUG] Client.logout() called - stack trace:', new Error().stack);

        // Hide Bot SDK overlay on logout
        if (this.botOverlay) {
            this.botOverlay.hide();
        }

        if (this.stream) {
            this.stream.close();
        }

        this.stream = null;
        this.ingame = false;
        this.loginscreen = 0;
        this.loginUser = '';
        this.loginPass = '';

        this.clearCaches();
        this.world?.resetMap();

        for (let level: number = 0; level < BuildArea.LEVELS; level++) {
            this.collision[level]?.reset();
        }

        stopMidi(false);
        this.nextMidiSong = -1;
        this.midiSong = -1;
        this.nextMusicDelay = 0;
    }

    private clearCaches(): void {
        LocType.mc1?.clear();
        LocType.mc2?.clear();
        NpcType.modelCache?.clear();
        ObjType.modelCache?.clear();
        ObjType.spriteCache?.clear();
        ClientPlayer.modelCache?.clear();
        SpotType.modelCache?.clear();
    }

    private async lostCon() {
        if (this.logoutTimer > 0) {
            console.warn(`[LOGOUT DEBUG] lostCon() called but logoutTimer=${this.logoutTimer} > 0, logging out instead`);
            await this.logout();
            return;
        }
        console.warn('[LOGOUT DEBUG] lostCon() attempting reconnection...');

        this.areaGame?.setPixels();
        this.p12?.centreString('Connection lost', 257, 144, Colour.BLACK);
        this.p12?.centreString('Connection lost', 256, 143, Colour.WHITE);
        this.p12?.centreString('Please wait - attempting to reestablish', 257, 159, Colour.BLACK);
        this.p12?.centreString('Please wait - attempting to reestablish', 256, 158, Colour.WHITE);
        this.areaGame?.draw(4, 4);

        this.minimapState = 0;
        this.minimapFlagX = 0;

        const oldStream = this.stream;

        this.ingame = false;
        await this.login(this.loginUser, this.loginPass, true);
        if (!this.ingame) {
            await this.logout();
        }

        oldStream?.close();
    }

    // todo: order
    private buildMinimenu(): void {
        if (this.objDragArea !== 0) {
            return;
        }

        this.menuOption[0] = 'Cancel';
        this.menuAction[0] = MiniMenuAction.CANCEL;
        this.menuNumEntries = 1;

        this.addPrivateChatOptions();
        this.lastOverComId = 0;

        if (this.mouseX > 4 && this.mouseY > 4 && this.mouseX < 516 && this.mouseY < 338) {
            if (this.mainModalId === -1) {
                this.addWorldOptions();
            } else {
                this.addComponentOptions(IfType.list[this.mainModalId], this.mouseX, this.mouseY, 4, 4, 0);
            }
        }

        if (this.lastOverComId !== this.overMainComId) {
            this.overMainComId = this.lastOverComId;
        }

        this.lastOverComId = 0;

        if (this.mouseX > 553 && this.mouseY > 205 && this.mouseX < 743 && this.mouseY < 466) {
            if (this.sideModalId !== -1) {
                this.addComponentOptions(IfType.list[this.sideModalId], this.mouseX, this.mouseY, 553, 205, 0);
            } else if (this.sideIcon[this.activeIcon] !== -1) {
                this.addComponentOptions(IfType.list[this.sideIcon[this.activeIcon]], this.mouseX, this.mouseY, 553, 205, 0);
            }
        }

        if (this.lastOverComId !== this.overSideComId) {
            this.redrawSide = true;
            this.overSideComId = this.lastOverComId;
        }

        this.lastOverComId = 0;

        if (this.mouseX > 17 && this.mouseY > 357 && this.mouseX < 496 && this.mouseY < 453) {
            if (this.chatModalId !== -1) {
                this.addComponentOptions(IfType.list[this.chatModalId], this.mouseX, this.mouseY, 17, 357, 0);
            } else if (this.mouseY < 434 && this.mouseX < 426) {
                this.addChatOptions(this.mouseX - 17, this.mouseY - 357);
            }
        }

        if (this.chatModalId !== -1 && this.lastOverComId !== this.overChatComId) {
            this.redrawChat = true;
            this.overChatComId = this.lastOverComId;
        }

        let sorted: boolean = false;
        while (!sorted) {
            sorted = true;

            for (let i: number = 0; i < this.menuNumEntries - 1; i++) {
                if (this.menuAction[i] < 1000 && this.menuAction[i + 1] > 1000) {
                    const tmp0: string = this.menuOption[i];
                    this.menuOption[i] = this.menuOption[i + 1];
                    this.menuOption[i + 1] = tmp0;

                    const tmp1: number = this.menuAction[i];
                    this.menuAction[i] = this.menuAction[i + 1];
                    this.menuAction[i + 1] = tmp1;

                    const tmp2: number = this.menuParamB[i];
                    this.menuParamB[i] = this.menuParamB[i + 1];
                    this.menuParamB[i + 1] = tmp2;

                    const tmp3: number = this.menuParamC[i];
                    this.menuParamC[i] = this.menuParamC[i + 1];
                    this.menuParamC[i + 1] = tmp3;

                    const tmp4: number = this.menuParamA[i];
                    this.menuParamA[i] = this.menuParamA[i + 1];
                    this.menuParamA[i + 1] = tmp4;

                    sorted = false;
                }
            }
        }
    }

    // todo: order
    private addPrivateChatOptions(): void {
        if (this.splitPrivateChat === 0) {
            return;
        }

        let line: number = 0;
        if (this.rebootTimer !== 0) {
            line = 1;
        }

        for (let i: number = 0; i < 100; i++) {
            if (this.chatText[i] !== null) {
                const type: number = this.chatType[i];
                let sender = this.chatUsername[i];

                let _mod = false;
                if (sender && sender.startsWith('@cr1@')) {
                    sender = sender.substring(5);
                    _mod = true;
                } else if (sender && sender.startsWith('@cr2@')) {
                    sender = sender.substring(5);
                    _mod = true;
                }

                if ((type === 3 || type === 7) && (type === 7 || this.chatPrivateMode === 0 || (this.chatPrivateMode === 1 && this.isFriend(sender)))) {
                    const y: number = 329 - line * 13;

                    if (this.mouseX > 4 && this.mouseX < 516 && this.mouseY - 4 > y - 10 && this.mouseY - 4 <= y + 3) {
                        if (this.staffmodlevel) {
                            this.menuOption[this.menuNumEntries] = 'Report abuse @whi@' + sender;
                            this.menuAction[this.menuNumEntries] = MiniMenuAction._PRIORITY + MiniMenuAction.ABUSE_REPORT;
                            this.menuNumEntries++;
                        }

                        this.menuOption[this.menuNumEntries] = 'Add ignore @whi@' + sender;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction._PRIORITY + MiniMenuAction.IGNORELIST_ADD;
                        this.menuNumEntries++;

                        this.menuOption[this.menuNumEntries] = 'Add friend @whi@' + sender;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction._PRIORITY + MiniMenuAction.FRIENDLIST_ADD;
                        this.menuNumEntries++;
                    }

                    line++;
                    if (line >= 5) {
                        return;
                    }
                } else if ((type === 5 || type === 6) && this.chatPrivateMode < 2) {
                    line++;
                    if (line >= 5) {
                        return;
                    }
                }
            }
        }
    }

    // todo: order
    private addChatOptions(_mouseX: number, mouseY: number): void {
        let line: number = 0;
        for (let i: number = 0; i < 100; i++) {
            if (!this.chatText[i]) {
                continue;
            }

            const type: number = this.chatType[i];
            const y: number = this.chatScrollPos + 70 + 4 - line * 14;
            if (y < -20) {
                break;
            }

            let sender = this.chatUsername[i];
            let _mod = false;
            if (sender && sender.startsWith('@cr1@')) {
                sender = sender.substring(5);
                _mod = true;
            } else if (sender && sender.startsWith('@cr2@')) {
                sender = sender.substring(5);
                _mod = true;
            }

            if (type === 0) {
                line++;
            } else if ((type == 1 || type == 2) && (type == 1 || this.chatPublicMode == 0 || (this.chatPublicMode == 1 && this.isFriend(sender)))) {
                if (mouseY > y - 14 && mouseY <= y && this.localPlayer && sender !== this.localPlayer.name) {
                    if (this.staffmodlevel >= 1) {
                        this.menuOption[this.menuNumEntries] = 'Report abuse @whi@' + sender;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.ABUSE_REPORT;
                        this.menuNumEntries++;
                    }

                    this.menuOption[this.menuNumEntries] = 'Add ignore @whi@' + sender;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.IGNORELIST_ADD;
                    this.menuNumEntries++;

                    this.menuOption[this.menuNumEntries] = 'Add friend @whi@' + sender;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.FRIENDLIST_ADD;
                    this.menuNumEntries++;
                }

                line++;
            } else if ((type === 3 || type === 7) && this.splitPrivateChat === 0 && (type === 7 || this.chatPrivateMode === 0 || (this.chatPrivateMode === 1 && this.isFriend(sender)))) {
                if (mouseY > y - 14 && mouseY <= y) {
                    if (this.staffmodlevel >= 1) {
                        this.menuOption[this.menuNumEntries] = 'Report abuse @whi@' + sender;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.ABUSE_REPORT;
                        this.menuNumEntries++;
                    }

                    this.menuOption[this.menuNumEntries] = 'Add ignore @whi@' + sender;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.IGNORELIST_ADD;
                    this.menuNumEntries++;

                    this.menuOption[this.menuNumEntries] = 'Add friend @whi@' + sender;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.FRIENDLIST_ADD;
                    this.menuNumEntries++;
                }

                line++;
            } else if (type === 4 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                if (mouseY > y - 14 && mouseY <= y) {
                    this.menuOption[this.menuNumEntries] = 'Accept trade @whi@' + sender;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.ACCEPT_TRADEREQ;
                    this.menuNumEntries++;
                }

                line++;
            } else if ((type === 5 || type === 6) && this.splitPrivateChat === 0 && this.chatPrivateMode < 2) {
                line++;
            } else if (type === 8 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                if (mouseY > y - 14 && mouseY <= y) {
                    this.menuOption[this.menuNumEntries] = 'Accept duel @whi@' + sender;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.ACCEPT_DUELREQ;
                    this.menuNumEntries++;
                }

                line++;
            }
        }
    }

    minimapLoop(): void {
        if (this.minimapState !== 0 || this.mouseClickButton !== 1 || !this.localPlayer) {
            return;
        }

        let x: number = this.mouseClickX - 25 - 550;
        let y: number = this.mouseClickY - 4 - 4;

        if (x < 0 || y < 0 || x >= 146 || y >= 151) {
            return;
        }

        x -= 73;
        y -= 75;

        const yaw: number = (this.orbitCameraYaw + this.macroMinimapAngle) & 0x7ff;
        let sinYaw: number = Pix3D.sinTable[yaw];
        let cosYaw: number = Pix3D.cosTable[yaw];

        sinYaw = (sinYaw * (this.macroMinimapZoom + 256)) >> 8;
        cosYaw = (cosYaw * (this.macroMinimapZoom + 256)) >> 8;

        const relX: number = (y * sinYaw + x * cosYaw) >> 11;
        const relY: number = (y * cosYaw - x * sinYaw) >> 11;

        const tileX: number = (this.localPlayer.x + relX) >> 7;
        const tileZ: number = (this.localPlayer.z - relY) >> 7;

        if (this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], tileX, tileZ, true, 0, 0, 0, 0, 0, 1)) {
            // the additional 14-bytes in MOVE_MINIMAPCLICK
            this.out.p1(x);
            this.out.p1(y);
            this.out.p2(this.orbitCameraYaw);
            this.out.p1(57);
            this.out.p1(this.macroMinimapAngle);
            this.out.p1(this.macroMinimapZoom);
            this.out.p1(89);
            this.out.p2(this.localPlayer.x);
            this.out.p2(this.localPlayer.z);
            this.out.p1(this.tryMoveNearest);
            this.out.p1(63);
        }
    }

    // todo: order
    private iconLoop(): void {
        if (this.mouseClickButton !== 1) {
            return;
        }

        if (this.mouseClickX >= 539 && this.mouseClickX <= 573 && this.mouseClickY >= 169 && this.mouseClickY < 205 && this.sideIcon[0] != -1) {
            this.redrawSide = true;
            this.activeIcon = 0;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 569 && this.mouseClickX <= 599 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.sideIcon[1] != -1) {
            this.redrawSide = true;
            this.activeIcon = 1;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 597 && this.mouseClickX <= 627 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.sideIcon[2] != -1) {
            this.redrawSide = true;
            this.activeIcon = 2;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 625 && this.mouseClickX <= 669 && this.mouseClickY >= 168 && this.mouseClickY < 203 && this.sideIcon[3] != -1) {
            this.redrawSide = true;
            this.activeIcon = 3;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 666 && this.mouseClickX <= 696 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.sideIcon[4] != -1) {
            this.redrawSide = true;
            this.activeIcon = 4;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 694 && this.mouseClickX <= 724 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.sideIcon[5] != -1) {
            this.redrawSide = true;
            this.activeIcon = 5;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 722 && this.mouseClickX <= 756 && this.mouseClickY >= 169 && this.mouseClickY < 205 && this.sideIcon[6] != -1) {
            this.redrawSide = true;
            this.activeIcon = 6;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 540 && this.mouseClickX <= 574 && this.mouseClickY >= 466 && this.mouseClickY < 502 && this.sideIcon[7] != -1) {
            this.redrawSide = true;
            this.activeIcon = 7;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 572 && this.mouseClickX <= 602 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.sideIcon[8] != -1) {
            this.redrawSide = true;
            this.activeIcon = 8;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 599 && this.mouseClickX <= 629 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.sideIcon[9] != -1) {
            this.redrawSide = true;
            this.activeIcon = 9;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 627 && this.mouseClickX <= 671 && this.mouseClickY >= 467 && this.mouseClickY < 502 && this.sideIcon[10] != -1) {
            this.redrawSide = true;
            this.activeIcon = 10;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 669 && this.mouseClickX <= 699 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.sideIcon[11] != -1) {
            this.redrawSide = true;
            this.activeIcon = 11;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 696 && this.mouseClickX <= 726 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.sideIcon[12] != -1) {
            this.redrawSide = true;
            this.activeIcon = 12;
            this.redrawIcons = true;
        } else if (this.mouseClickX >= 724 && this.mouseClickX <= 758 && this.mouseClickY >= 466 && this.mouseClickY < 502 && this.sideIcon[13] != -1) {
            this.redrawSide = true;
            this.activeIcon = 13;
            this.redrawIcons = true;
        }
    }

    // todo: order
    private chatModeLoop(): void {
        if (this.mouseClickButton !== 1) {
            return;
        }

        if (this.mouseClickX >= 6 && this.mouseClickX <= 106 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.chatPublicMode = (this.chatPublicMode + 1) % 4;
            this.redrawChatMode = true;
            this.redrawChat = true;

            this.out.p1Enc(ClientProt.CHAT_SETMODE);
            this.out.p1(this.chatPublicMode);
            this.out.p1(this.chatPrivateMode);
            this.out.p1(this.chatTradeMode);
        } else if (this.mouseClickX >= 135 && this.mouseClickX <= 235 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.chatPrivateMode = (this.chatPrivateMode + 1) % 3;
            this.redrawChatMode = true;
            this.redrawChat = true;

            this.out.p1Enc(ClientProt.CHAT_SETMODE);
            this.out.p1(this.chatPublicMode);
            this.out.p1(this.chatPrivateMode);
            this.out.p1(this.chatTradeMode);
        } else if (this.mouseClickX >= 273 && this.mouseClickX <= 373 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.chatTradeMode = (this.chatTradeMode + 1) % 3;
            this.redrawChatMode = true;
            this.redrawChat = true;

            this.out.p1Enc(ClientProt.CHAT_SETMODE);
            this.out.p1(this.chatPublicMode);
            this.out.p1(this.chatPrivateMode);
            this.out.p1(this.chatTradeMode);
        } else if (this.mouseClickX >= 412 && this.mouseClickX <= 512 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.closeModal();

            this.reportAbuseInput = '';
            this.reportAbuseMuteOption = false;

            for (let i: number = 0; i < IfType.list.length; i++) {
                if (IfType.list[i] && IfType.list[i].clientCode === ClientCode.CC_REPORT_INPUT) {
                    this.reportAbuseComId = this.mainModalId = IfType.list[i].layerId;
                    break;
                }
            }

            if (this.isMobile) {
                MobileKeyboard.show();
            }
        }
    }

    private timeoutChat(): void {
        for (let i: number = -1; i < this.playerCount; i++) {
            let index: number;
            if (i === -1) {
                index = LOCAL_PLAYER_INDEX;
            } else {
                index = this.playerIds[i];
            }

            const player: ClientPlayer | null = this.players[index];
            if (player && player.chatTimer > 0) {
                player.chatTimer--;

                if (player.chatTimer === 0) {
                    player.chatMessage = null;
                }
            }
        }

        for (let i: number = 0; i < this.npcCount; i++) {
            const index: number = this.npcIds[i];
            const npc: ClientNpc | null = this.npc[index];

            if (npc && npc.chatTimer > 0) {
                npc.chatTimer--;

                if (npc.chatTimer === 0) {
                    npc.chatMessage = null;
                }
            }
        }
    }

    // todo: order
    private async handleInputKey(): Promise<void> {
        Client.cyclelogic4++;
        if (Client.cyclelogic4 > 192) {
            Client.cyclelogic4 = 0;

            this.out.p1Enc(ClientProt.ANTICHEAT_CYCLELOGIC4);
            this.out.p1(232);
        }

        while (true) {
            let key: number;
            do {
                while (true) {
                    key = this.pollKey();
                    if (key === -1) {
                        return;
                    }

                    if (this.mainModalId !== -1 && this.mainModalId === this.reportAbuseComId) {
                        if (key === 8 && this.reportAbuseInput.length > 0) {
                            this.reportAbuseInput = this.reportAbuseInput.substring(0, this.reportAbuseInput.length - 1);
                        }
                        break;
                    }

                    if (this.socialInputOpen) {
                        if (key >= 32 && key <= 122 && this.socialInput.length < 80) {
                            this.socialInput = this.socialInput + String.fromCharCode(key);
                            this.redrawChat = true;
                        }

                        if (key === 8 && this.socialInput.length > 0) {
                            this.socialInput = this.socialInput.substring(0, this.socialInput.length - 1);
                            this.redrawChat = true;
                        }

                        if (key === 13 || key === 10) {
                            this.socialInputOpen = false;
                            this.redrawChat = true;

                            let userhash: bigint;
                            if (this.socialInputType === 1) {
                                userhash = JString.toUserhash(this.socialInput);
                                this.addFriend(userhash);
                            }

                            if (this.socialInputType === 2 && this.friendCount > 0) {
                                userhash = JString.toUserhash(this.socialInput);
                                this.delFriend(userhash);
                            }

                            if (this.socialInputType === 3 && this.socialInput.length > 0 && this.socialUserhash) {
                                this.out.p1Enc(ClientProt.MESSAGE_PRIVATE);
                                this.out.p1(0);
                                const start: number = this.out.pos;

                                this.out.p8(this.socialUserhash);
                                WordPack.pack(this.out, this.socialInput);
                                this.out.psize1(this.out.pos - start);

                                this.socialInput = JString.toSentenceCase(this.socialInput);
                                this.socialInput = WordFilter.filter(this.socialInput);
                                this.addChat(6, this.socialInput, JString.toScreenName(JString.toRawUsername(this.socialUserhash)));

                                if (this.chatPrivateMode === 2) {
                                    this.chatPrivateMode = 1;
                                    this.redrawChatMode = true;

                                    this.out.p1Enc(ClientProt.CHAT_SETMODE);
                                    this.out.p1(this.chatPublicMode);
                                    this.out.p1(this.chatPrivateMode);
                                    this.out.p1(this.chatTradeMode);
                                }
                            }

                            if (this.socialInputType === 4 && this.ignoreCount < 100) {
                                userhash = JString.toUserhash(this.socialInput);
                                this.addIgnore(userhash);
                            }

                            if (this.socialInputType === 5 && this.ignoreCount > 0) {
                                userhash = JString.toUserhash(this.socialInput);
                                this.delIgnore(userhash);
                            }
                        }
                    } else if (this.dialogInputOpen) {
                        if (key >= 48 && key <= 57 && this.dialogInput.length < 10) {
                            this.dialogInput = this.dialogInput + String.fromCharCode(key);
                            this.redrawChat = true;
                        }

                        if (key === 8 && this.dialogInput.length > 0) {
                            this.dialogInput = this.dialogInput.substring(0, this.dialogInput.length - 1);
                            this.redrawChat = true;
                        }

                        if (key === 13 || key === 10) {
                            if (this.dialogInput.length > 0) {
                                let value: number = 0;
                                try {
                                    value = parseInt(this.dialogInput, 10);
                                } catch (_e) {
                                    // empty
                                }

                                this.out.p1Enc(ClientProt.RESUME_P_COUNTDIALOG);
                                this.out.p4(value);
                            }

                            this.dialogInputOpen = false;
                            this.redrawChat = true;
                        }
                    } else if (this.chatModalId === -1) {
                        // custom: when typing a command, you can use the debugproc character (tilde)
                        if (key >= 32 && (key <= 122 || (this.chatInput.startsWith('::') && key <= 126)) && this.chatInput.length < 80) {
                            this.chatInput = this.chatInput + String.fromCharCode(key);
                            this.redrawChat = true;
                        }

                        if (key === 8 && this.chatInput.length > 0) {
                            this.chatInput = this.chatInput.substring(0, this.chatInput.length - 1);
                            this.redrawChat = true;
                        }

                        if ((key === 13 || key === 10) && this.chatInput.length > 0) {
                            if (this.staffmodlevel === 2) {
                                if (this.chatInput === '::clientdrop') {
                                    await this.lostCon();
                                } else if (this.chatInput === '::prefetchmusic') {
                                    if (this.onDemand) {
                                        for (let i = 0; i < this.onDemand.getFileCount(2); i++) {
                                            await this.onDemand.prefetchPriority(2, i, 1);
                                        }
                                    }
                                } else if (this.chatInput === '::lag') {
                                    this.lag();
                                }
                            }

                            // custom: player-facing commands
                            if (this.chatInput === '::fpson') {
                                // authentic in later revs
                                this.showFps = true;
                            } else if (this.chatInput === '::fpsoff') {
                                // authentic in later revs
                                this.showFps = false;
                            } else if (this.chatInput.startsWith('::fps ')) {
                                // authentic in later revs
                                try {
                                    const desiredFps = parseInt(this.chatInput.substring(6)) || 50;
                                    this.setTargetedFramerate(desiredFps);
                                } catch (_e) {
                                    // empty
                                }
                            } else if (this.chatInput.startsWith('::')) {
                                this.out.p1Enc(ClientProt.CLIENT_CHEAT);
                                this.out.p1(this.chatInput.length - 2 + 1);
                                this.out.pjstr(this.chatInput.substring(2));
                            } else {
                                let colour: number = 0;
                                if (this.chatInput.startsWith('yellow:')) {
                                    colour = 0;
                                    this.chatInput = this.chatInput.substring(7);
                                }
                                if (this.chatInput.startsWith('red:')) {
                                    colour = 1;
                                    this.chatInput = this.chatInput.substring(4);
                                }
                                if (this.chatInput.startsWith('green:')) {
                                    colour = 2;
                                    this.chatInput = this.chatInput.substring(6);
                                }
                                if (this.chatInput.startsWith('cyan:')) {
                                    colour = 3;
                                    this.chatInput = this.chatInput.substring(5);
                                }
                                if (this.chatInput.startsWith('purple:')) {
                                    colour = 4;
                                    this.chatInput = this.chatInput.substring(7);
                                }
                                if (this.chatInput.startsWith('white:')) {
                                    colour = 5;
                                    this.chatInput = this.chatInput.substring(6);
                                }
                                if (this.chatInput.startsWith('flash1:')) {
                                    colour = 6;
                                    this.chatInput = this.chatInput.substring(7);
                                }
                                if (this.chatInput.startsWith('flash2:')) {
                                    colour = 7;
                                    this.chatInput = this.chatInput.substring(7);
                                }
                                if (this.chatInput.startsWith('flash3:')) {
                                    colour = 8;
                                    this.chatInput = this.chatInput.substring(7);
                                }
                                if (this.chatInput.startsWith('glow1:')) {
                                    colour = 9;
                                    this.chatInput = this.chatInput.substring(6);
                                }
                                if (this.chatInput.startsWith('glow2:')) {
                                    colour = 10;
                                    this.chatInput = this.chatInput.substring(6);
                                }
                                if (this.chatInput.startsWith('glow3:')) {
                                    colour = 11;
                                    this.chatInput = this.chatInput.substring(6);
                                }

                                let effect: number = 0;
                                if (this.chatInput.startsWith('wave:')) {
                                    effect = 1;
                                    this.chatInput = this.chatInput.substring(5);
                                }
                                if (this.chatInput.startsWith('scroll:')) {
                                    effect = 2;
                                    this.chatInput = this.chatInput.substring(7);
                                }

                                this.out.p1Enc(ClientProt.MESSAGE_PUBLIC);
                                this.out.p1(0);
                                const start: number = this.out.pos;

                                this.out.p1(colour);
                                this.out.p1(effect);
                                WordPack.pack(this.out, this.chatInput);
                                this.out.psize1(this.out.pos - start);

                                this.chatInput = JString.toSentenceCase(this.chatInput);
                                this.chatInput = WordFilter.filter(this.chatInput);

                                if (this.localPlayer && this.localPlayer.name) {
                                    this.localPlayer.chatMessage = this.chatInput;
                                    this.localPlayer.chatColour = colour;
                                    this.localPlayer.chatEffect = effect;
                                    this.localPlayer.chatTimer = 150;

                                    if (this.staffmodlevel === 2) {
                                        this.addChat(2, this.localPlayer.chatMessage, '@cr2@' + this.localPlayer.name);
                                    } else if (this.staffmodlevel === 1) {
                                        this.addChat(2, this.localPlayer.chatMessage, '@cr1@' + this.localPlayer.name);
                                    } else {
                                        this.addChat(2, this.localPlayer.chatMessage, this.localPlayer.name);
                                    }
                                }

                                if (this.chatPublicMode === 2) {
                                    this.chatPublicMode = 3;
                                    this.redrawChatMode = true;

                                    this.out.p1Enc(ClientProt.CHAT_SETMODE);
                                    this.out.p1(this.chatPublicMode);
                                    this.out.p1(this.chatPrivateMode);
                                    this.out.p1(this.chatTradeMode);
                                }
                            }

                            this.chatInput = '';
                            this.redrawChat = true;
                        }
                    }
                }
            } while ((key < 97 || key > 122) && (key < 65 || key > 90) && (key < 48 || key > 57) && key !== 32);

            if (this.reportAbuseInput.length < 12) {
                this.reportAbuseInput = this.reportAbuseInput + String.fromCharCode(key);
            }
        }
    }

    // todo: order
    private lag() {
        console.log('============');
        console.log(`flame-cycle:${this.titleFlames?.coolingCycle ?? 0}`);
        if (this.onDemand) {
            console.log(`od-cycle:${this.onDemand.cycle}`);
        }
        console.log(`loop-cycle:${Client.loopCycle}`);
        console.log(`draw-cycle:${Client.drawCycle}`);
        console.log(`ptype:${this.ptype}`);
        console.log(`psize:${this.psize}`);
        // this.stream?.debug();
        this.debug = true;
    }

    private followCamera(): void {
        if (!this.localPlayer) {
            return; // custom
        }

        const orbitX: number = this.localPlayer.x + this.macroCameraX;
        const orbitZ: number = this.localPlayer.z + this.macroCameraZ;

        if (this.orbitCameraX - orbitX < -500 || this.orbitCameraX - orbitX > 500 || this.orbitCameraZ - orbitZ < -500 || this.orbitCameraZ - orbitZ > 500) {
            this.orbitCameraX = orbitX;
            this.orbitCameraZ = orbitZ;
        }

        if (this.orbitCameraX !== orbitX) {
            this.orbitCameraX += ((orbitX - this.orbitCameraX) / 16) | 0;
        }

        if (this.orbitCameraZ !== orbitZ) {
            this.orbitCameraZ += ((orbitZ - this.orbitCameraZ) / 16) | 0;
        }

        if (this.keyHeld[1] === 1) {
            this.orbitCameraYawVelocity += ((-this.orbitCameraYawVelocity - 24) / 2) | 0;
        } else if (this.keyHeld[2] === 1) {
            this.orbitCameraYawVelocity += ((24 - this.orbitCameraYawVelocity) / 2) | 0;
        } else {
            this.orbitCameraYawVelocity = (this.orbitCameraYawVelocity / 2) | 0;
        }

        if (this.keyHeld[3] === 1) {
            this.orbitCameraPitchVelocity += ((12 - this.orbitCameraPitchVelocity) / 2) | 0;
        } else if (this.keyHeld[4] === 1) {
            this.orbitCameraPitchVelocity += ((-this.orbitCameraPitchVelocity - 12) / 2) | 0;
        } else {
            this.orbitCameraPitchVelocity = (this.orbitCameraPitchVelocity / 2) | 0;
        }

        this.orbitCameraYaw = ((this.orbitCameraYaw + this.orbitCameraYawVelocity / 2) | 0) & 0x7ff;
        this.orbitCameraPitch += (this.orbitCameraPitchVelocity / 2) | 0;

        if (this.orbitCameraPitch < 128) {
            this.orbitCameraPitch = 128;
        } else if (this.orbitCameraPitch > 383) {
            this.orbitCameraPitch = 383;
        }

        const orbitTileX: number = this.orbitCameraX >> 7;
        const orbitTileZ: number = this.orbitCameraZ >> 7;
        const orbitY: number = this.getAvH(this.orbitCameraX, this.orbitCameraZ, this.minusedlevel);
        let maxY: number = 0;

        if (this.groundh) {
            if (orbitTileX > 3 && orbitTileZ > 3 && orbitTileX < 100 && orbitTileZ < 100) {
                for (let x: number = orbitTileX - 4; x <= orbitTileX + 4; x++) {
                    for (let z: number = orbitTileZ - 4; z <= orbitTileZ + 4; z++) {
                        let level: number = this.minusedlevel;
                        if (level < 3 && this.mapl && (this.mapl[1][x][z] & MapFlag.VisBelow) !== 0) {
                            level++;
                        }

                        const y: number = orbitY - this.groundh[level][x][z];
                        if (y > maxY) {
                            maxY = y;
                        }
                    }
                }
            }
        }

        let clamp: number = maxY * 192;
        if (clamp > 98048) {
            clamp = 98048;
        } else if (clamp < 32768) {
            clamp = 32768;
        }

        if (clamp > this.cameraPitchClamp) {
            this.cameraPitchClamp += ((clamp - this.cameraPitchClamp) / 24) | 0;
        } else if (clamp < this.cameraPitchClamp) {
            this.cameraPitchClamp += ((clamp - this.cameraPitchClamp) / 80) | 0;
        }
    }

    private cinemaCamera(): void {
        let x: number = this.camMoveToLx * 128 + 64;
        let z: number = this.camMoveToLz * 128 + 64;
        let y: number = this.getAvH(x, z, this.minusedlevel) - this.camMoveToHei;

        if (this.camX < x) {
            this.camX += this.camMoveToRate + ((((x - this.camX) * this.camMoveToRate2) / 1000) | 0);
            if (this.camX > x) {
                this.camX = x;
            }
        }

        if (this.camX > x) {
            this.camX -= this.camMoveToRate + ((((this.camX - x) * this.camMoveToRate2) / 1000) | 0);
            if (this.camX < x) {
                this.camX = x;
            }
        }

        if (this.camY < y) {
            this.camY += this.camMoveToRate + ((((y - this.camY) * this.camMoveToRate2) / 1000) | 0);
            if (this.camY > y) {
                this.camY = y;
            }
        }

        if (this.camY > y) {
            this.camY -= this.camMoveToRate + ((((this.camY - y) * this.camMoveToRate2) / 1000) | 0);
            if (this.camY < y) {
                this.camY = y;
            }
        }

        if (this.camZ < z) {
            this.camZ += this.camMoveToRate + ((((z - this.camZ) * this.camMoveToRate2) / 1000) | 0);
            if (this.camZ > z) {
                this.camZ = z;
            }
        }

        if (this.camZ > z) {
            this.camZ -= this.camMoveToRate + ((((this.camZ - z) * this.camMoveToRate2) / 1000) | 0);
            if (this.camZ < z) {
                this.camZ = z;
            }
        }

        x = this.camLookAtLx * 128 + 64;
        z = this.camLookAtLz * 128 + 64;
        y = this.getAvH(x, z, this.minusedlevel) - this.camLookAtHei;

        const dx: number = x - this.camX;
        const dy: number = y - this.camY;
        const dz: number = z - this.camZ;

        const distance: number = Math.sqrt(dx * dx + dz * dz) | 0;
        let pitch: number = ((Math.atan2(dy, distance) * 325.949) | 0) & 0x7ff;
        const yaw: number = ((Math.atan2(dx, dz) * -325.949) | 0) & 0x7ff;

        if (pitch < 128) {
            pitch = 128;
        } else if (pitch > 383) {
            pitch = 383;
        }

        if (this.camPitch < pitch) {
            this.camPitch += this.camLookAtRate + ((((pitch - this.camPitch) * this.camLookAtRate2) / 1000) | 0);
            if (this.camPitch > pitch) {
                this.camPitch = pitch;
            }
        }

        if (this.camPitch > pitch) {
            this.camPitch -= this.camLookAtRate + ((((this.camPitch - pitch) * this.camLookAtRate2) / 1000) | 0);
            if (this.camPitch < pitch) {
                this.camPitch = pitch;
            }
        }

        let deltaYaw: number = yaw - this.camYaw;
        if (deltaYaw > 1024) {
            deltaYaw -= 2048;
        } else if (deltaYaw < -1024) {
            deltaYaw += 2048;
        }

        if (deltaYaw > 0) {
            this.camYaw += this.camLookAtRate + (((deltaYaw * this.camLookAtRate2) / 1000) | 0);
            this.camYaw &= 0x7ff;
        }

        if (deltaYaw < 0) {
            this.camYaw -= this.camLookAtRate + (((-deltaYaw * this.camLookAtRate2) / 1000) | 0);
            this.camYaw &= 0x7ff;
        }

        let tmp: number = yaw - this.camYaw;
        if (tmp > 1024) {
            tmp -= 2048;
        } else if (tmp < -1024) {
            tmp += 2048;
        }

        if ((tmp < 0 && deltaYaw > 0) || (tmp > 0 && deltaYaw < 0)) {
            this.camYaw = yaw;
        }
    }

    async soundsDoQueue() {
        for (let wave: number = 0; wave < this.waveCount; wave++) {
            if (this.waveDelay[wave] <= 0) {
                try {
                    const buf: Packet | null = JagFX.generate(this.waveIds[wave], this.waveLoops[wave]);
                    if (!buf) {
                        throw new Error();
                    }

                    if (performance.now() + ((buf.pos / 22) | 0) > this.lastWaveStartTime + ((this.lastWaveLength / 22) | 0)) {
                        this.lastWaveLength = buf.pos;
                        this.lastWaveStartTime = performance.now();
                        this.lastWaveId = this.waveIds[wave];
                        this.lastWaveLoops = this.waveLoops[wave];
                        await playWave(buf.data.slice(0, buf.pos));
                    }
                } catch (_e) {
                    // empty
                }

                this.waveCount--;
                for (let i: number = wave; i < this.waveCount; i++) {
                    this.waveIds[i] = this.waveIds[i + 1];
                    this.waveLoops[i] = this.waveLoops[i + 1];
                    this.waveDelay[i] = this.waveDelay[i + 1];
                }
                wave--;
            } else {
                this.waveDelay[wave]--;
            }
        }

        if (this.nextMusicDelay > 0) {
            this.nextMusicDelay -= 20;

            if (this.nextMusicDelay < 0) {
                this.nextMusicDelay = 0;
            }

            if (this.nextMusicDelay === 0 && this.midiActive && !Client.lowMem) {
                this.midiSong = this.nextMidiSong;
                this.midiFading = true;
                this.onDemand?.request(2, this.midiSong);
            }
        }
    }

    private movePlayers(): void {
        for (let i: number = -1; i < this.playerCount; i++) {
            let index: number;
            if (i === -1) {
                index = LOCAL_PLAYER_INDEX;
            } else {
                index = this.playerIds[i];
            }

            const player: ClientPlayer | null = this.players[index];
            if (player) {
                this.moveEntity(player);
            }
        }
    }

    private moveNpcs(): void {
        for (let i: number = 0; i < this.npcCount; i++) {
            const id: number = this.npcIds[i];
            const npc: ClientNpc | null = this.npc[id];

            if (npc && npc.type) {
                this.moveEntity(npc);
            }
        }
    }

    private moveEntity(e: ClientEntity): void {
        if (e.x < 128 || e.z < 128 || e.x >= 13184 || e.z >= 13184) {
            e.primaryAnim = -1;
            e.spotanimId = -1;
            e.exactMoveEnd = 0;
            e.exactMoveStart = 0;
            e.x = e.routeX[0] * 128 + e.size * 64;
            e.z = e.routeZ[0] * 128 + e.size * 64;
            e.abortRoute();
        }

        if (e === this.localPlayer && (e.x < 1536 || e.z < 1536 || e.x >= 11776 || e.z >= 11776)) {
            e.primaryAnim = -1;
            e.spotanimId = -1;
            e.exactMoveEnd = 0;
            e.exactMoveStart = 0;
            e.x = e.routeX[0] * 128 + e.size * 64;
            e.z = e.routeZ[0] * 128 + e.size * 64;
            e.abortRoute();
        }

        if (e.exactMoveEnd > Client.loopCycle) {
            this.exactMove1(e);
        } else if (e.exactMoveStart >= Client.loopCycle) {
            this.exactMove2(e);
        } else {
            this.routeMove(e);
        }

        this.entityFace(e);
        this.entityAnim(e);
    }

    private exactMove1(e: ClientEntity): void {
        const delta: number = e.exactMoveEnd - Client.loopCycle;
        const dstX: number = e.exactStartX * 128 + e.size * 64;
        const dstZ: number = e.exactStartZ * 128 + e.size * 64;

        e.x += ((dstX - e.x) / delta) | 0;
        e.z += ((dstZ - e.z) / delta) | 0;

        e.animDelayMove = 0;

        if (e.exactMoveFacing === 0) {
            e.dstYaw = 1024;
        } else if (e.exactMoveFacing === 1) {
            e.dstYaw = 1536;
        } else if (e.exactMoveFacing === 2) {
            e.dstYaw = 0;
        } else if (e.exactMoveFacing === 3) {
            e.dstYaw = 512;
        }
    }

    private exactMove2(e: ClientEntity): void {
        if (e.exactMoveStart === Client.loopCycle || e.primaryAnim === -1 || e.primaryAnimDelay !== 0 || e.primaryAnimCycle + 1 > SeqType.list[e.primaryAnim].getDelay(e.primaryAnimFrame)) {
            const duration: number = e.exactMoveStart - e.exactMoveEnd;
            const delta: number = Client.loopCycle - e.exactMoveEnd;
            const dx0: number = e.exactStartX * 128 + e.size * 64;
            const dz0: number = e.exactStartZ * 128 + e.size * 64;
            const dx1: number = e.exactEndX * 128 + e.size * 64;
            const dz1: number = e.exactEndZ * 128 + e.size * 64;
            e.x = ((dx0 * (duration - delta) + dx1 * delta) / duration) | 0;
            e.z = ((dz0 * (duration - delta) + dz1 * delta) / duration) | 0;
        }

        e.animDelayMove = 0;

        if (e.exactMoveFacing === 0) {
            e.dstYaw = 1024;
        } else if (e.exactMoveFacing === 1) {
            e.dstYaw = 1536;
        } else if (e.exactMoveFacing === 2) {
            e.dstYaw = 0;
        } else if (e.exactMoveFacing === 3) {
            e.dstYaw = 512;
        }

        e.yaw = e.dstYaw;
    }

    private routeMove(e: ClientEntity): void {
        e.secondaryAnim = e.readyanim;

        if (e.routeLength === 0) {
            e.animDelayMove = 0;
            return;
        }

        if (e.primaryAnim !== -1 && e.primaryAnimDelay === 0) {
            const seq: SeqType = SeqType.list[e.primaryAnim];
            if (e.preanimRouteLength > 0 && seq.preanim_move === PreanimMove.DELAYMOVE) {
                e.animDelayMove++;
                return;
            }

            if (e.preanimRouteLength <= 0 && seq.postanim_move === PostanimMove.DELAYMOVE) {
                e.animDelayMove++;
                return;
            }
        }

        const x: number = e.x;
        const z: number = e.z;
        const dstX: number = e.routeX[e.routeLength - 1] * 128 + e.size * 64;
        const dstZ: number = e.routeZ[e.routeLength - 1] * 128 + e.size * 64;

        if (dstX - x > 256 || dstX - x < -256 || dstZ - z > 256 || dstZ - z < -256) {
            e.x = dstX;
            e.z = dstZ;
            return;
        }

        if (x < dstX) {
            if (z < dstZ) {
                e.dstYaw = 1280;
            } else if (z > dstZ) {
                e.dstYaw = 1792;
            } else {
                e.dstYaw = 1536;
            }
        } else if (x > dstX) {
            if (z < dstZ) {
                e.dstYaw = 768;
            } else if (z > dstZ) {
                e.dstYaw = 256;
            } else {
                e.dstYaw = 512;
            }
        } else if (z < dstZ) {
            e.dstYaw = 1024;
        } else {
            e.dstYaw = 0;
        }

        let deltaYaw: number = (e.dstYaw - e.yaw) & 0x7ff;
        if (deltaYaw > 1024) {
            deltaYaw -= 2048;
        }

        let seqId: number = e.walkanim_b;
        if (deltaYaw >= -256 && deltaYaw <= 256) {
            seqId = e.walkanim;
        } else if (deltaYaw >= 256 && deltaYaw < 768) {
            seqId = e.walkanim_r;
        } else if (deltaYaw >= -768 && deltaYaw <= -256) {
            seqId = e.walkanim_l;
        }

        if (seqId === -1) {
            seqId = e.walkanim;
        }

        e.secondaryAnim = seqId;

        let moveSpeed: number = 4;
        if (e.yaw !== e.dstYaw && e.faceEntity === -1 && e.turnspeed !== 0) {
            moveSpeed = 2;
        }
        if (e.routeLength > 2) {
            moveSpeed = 6;
        }
        if (e.routeLength > 3) {
            moveSpeed = 8;
        }
        if (e.animDelayMove > 0 && e.routeLength > 1) {
            moveSpeed = 8;
            e.animDelayMove--;
        }
        if (e.routeRun[e.routeLength - 1]) {
            moveSpeed <<= 0x1;
        }

        if (moveSpeed >= 8 && e.secondaryAnim === e.walkanim && e.runanim !== -1) {
            e.secondaryAnim = e.runanim;
        }

        // Scale movement speed to match server tick rate
        moveSpeed = Math.ceil(moveSpeed * this.tickSpeedMultiplier);

        if (x < dstX) {
            e.x += moveSpeed;
            if (e.x > dstX) {
                e.x = dstX;
            }
        } else if (x > dstX) {
            e.x -= moveSpeed;
            if (e.x < dstX) {
                e.x = dstX;
            }
        }
        if (z < dstZ) {
            e.z += moveSpeed;
            if (e.z > dstZ) {
                e.z = dstZ;
            }
        } else if (z > dstZ) {
            e.z -= moveSpeed;
            if (e.z < dstZ) {
                e.z = dstZ;
            }
        }

        if (e.x === dstX && e.z === dstZ) {
            e.routeLength--;
            if (e.preanimRouteLength > 0) {
                e.preanimRouteLength--;
            }
        }
    }

    private entityFace(e: ClientEntity): void {
        if (e.turnspeed === 0) {
            return;
        }

        if (e.faceEntity !== -1 && e.faceEntity < 32768) {
            const npc: ClientNpc | null = this.npc[e.faceEntity];
            if (npc) {
                const dstX: number = e.x - npc.x;
                const dstZ: number = e.z - npc.z;

                if (dstX !== 0 || dstZ !== 0) {
                    e.dstYaw = ((Math.atan2(dstX, dstZ) * 325.949) | 0) & 0x7ff;
                }
            }
        }

        if (e.faceEntity >= 32768) {
            let index: number = e.faceEntity - 32768;
            if (index === this.selfSlot) {
                index = LOCAL_PLAYER_INDEX;
            }

            const player: ClientPlayer | null = this.players[index];
            if (player) {
                const dstX: number = e.x - player.x;
                const dstZ: number = e.z - player.z;

                if (dstX !== 0 || dstZ !== 0) {
                    e.dstYaw = ((Math.atan2(dstX, dstZ) * 325.949) | 0) & 0x7ff;
                }
            }
        }

        if ((e.faceSquareX !== 0 || e.faceSquareZ !== 0) && (e.routeLength === 0 || e.animDelayMove > 0)) {
            const dstX: number = e.x - (e.faceSquareX - this.mapBuildBaseX - this.mapBuildBaseX) * 64;
            const dstZ: number = e.z - (e.faceSquareZ - this.mapBuildBaseZ - this.mapBuildBaseZ) * 64;

            if (dstX !== 0 || dstZ !== 0) {
                e.dstYaw = ((Math.atan2(dstX, dstZ) * 325.949) | 0) & 0x7ff;
            }

            e.faceSquareX = 0;
            e.faceSquareZ = 0;
        }

        const turnSpeed: number = Math.ceil(e.turnspeed * this.tickSpeedMultiplier);
        const remainingYaw: number = (e.dstYaw - e.yaw) & 0x7ff;
        if (remainingYaw !== 0) {
            if (remainingYaw < turnSpeed || remainingYaw > (2048 - turnSpeed)) {
                e.yaw = e.dstYaw;
            } else if (remainingYaw > 1024) {
                e.yaw -= turnSpeed;
            } else {
                e.yaw += turnSpeed;
            }

            e.yaw &= 0x7ff;

            if (e.secondaryAnim === e.readyanim && e.yaw !== e.dstYaw) {
                if (e.turnanim != -1) {
                    e.secondaryAnim = e.turnanim;
                } else {
                    e.secondaryAnim = e.walkanim;
                }
            }
        }
    }

    private entityAnim(e: ClientEntity): void {
        e.needsForwardDrawPadding = false;
        const animSpeed: number = Math.ceil(this.tickSpeedMultiplier);

        let seq: SeqType | null;
        if (e.secondaryAnim !== -1) {
            seq = SeqType.list[e.secondaryAnim];
            e.secondaryAnimCycle += animSpeed;

            if (e.secondaryAnimFrame < seq.numFrames && e.secondaryAnimCycle > seq.getDelay(e.secondaryAnimFrame)) {
                e.secondaryAnimCycle = 0;
                e.secondaryAnimFrame++;
            }

            if (e.secondaryAnimFrame >= seq.numFrames) {
                e.secondaryAnimCycle = 0;
                e.secondaryAnimFrame = 0;
            }
        }

        if (e.spotanimId !== -1 && Client.loopCycle >= e.spotanimLastCycle) {
            if (e.spotanimFrame < 0) {
                e.spotanimFrame = 0;
            }

            seq = SpotType.list[e.spotanimId].seq;
            e.spotanimCycle += animSpeed;

            while (seq && e.spotanimFrame < seq.numFrames && e.spotanimCycle > seq.getDelay(e.spotanimFrame)) {
                e.spotanimCycle -= seq.getDelay(e.spotanimFrame);
                e.spotanimFrame++;
            }

            if (seq && e.spotanimFrame >= seq.numFrames) {
                if (e.spotanimFrame < 0 || e.spotanimFrame >= seq.numFrames) {
                    e.spotanimId = -1;
                }
            }
        }

        if (e.primaryAnim != -1 && e.primaryAnimDelay <= 1) {
            seq = SeqType.list[e.primaryAnim];
            if (seq.preanim_move === PreanimMove.DELAYANIM && e.preanimRouteLength > 0 && Client.loopCycle >= e.exactMoveStart && Client.loopCycle > e.exactMoveEnd) {
                e.primaryAnimDelay = 1;
                return;
            }
        }

        if (e.primaryAnim !== -1 && e.primaryAnimDelay === 0) {
            seq = SeqType.list[e.primaryAnim];
            e.primaryAnimCycle += animSpeed;

            while (e.primaryAnimFrame < seq.numFrames && e.primaryAnimCycle > seq.getDelay(e.primaryAnimFrame)) {
                e.primaryAnimCycle -= seq.getDelay(e.primaryAnimFrame);
                e.primaryAnimFrame++;
            }

            if (e.primaryAnimFrame >= seq.numFrames) {
                e.primaryAnimFrame -= seq.loops;
                e.primaryAnimLoop++;

                if (e.primaryAnimLoop >= seq.maxloops) {
                    e.primaryAnim = -1;
                }

                if (e.primaryAnimFrame < 0 || e.primaryAnimFrame >= seq.numFrames) {
                    e.primaryAnim = -1;
                }
            }

            e.needsForwardDrawPadding = seq.reachforward;
        }

        if (e.primaryAnimDelay > 0) {
            e.primaryAnimDelay -= animSpeed;
            if (e.primaryAnimDelay < 0) {
                e.primaryAnimDelay = 0;
            }
        }
    }

    override async drawProgress(message: string, progress: number): Promise<void> {
        console.log(`${progress}%: ${message}`);

        this.lastProgressPercent = progress;
        this.lastProgressMessage = message;

        await this.prepareTitle();

        if (!this.title) {
            await super.drawProgress(message, progress);
            return;
        }

        this.imageTitle4?.setPixels();

        const x: number = 360;
        const y: number = 200;

        const offsetY: number = 20;
        this.b12?.centreString('RuneScape is loading - please wait...', (x / 2) | 0, ((y / 2) | 0) - offsetY - 26, Colour.WHITE);

        const midY: number = ((y / 2) | 0) - 18 - offsetY;
        Pix2D.drawRect(((x / 2) | 0) - 152, midY, 304, 34, 0x8c1111);
        Pix2D.drawRect(((x / 2) | 0) - 151, midY + 1, 302, 32, Colour.BLACK);
        Pix2D.fillRect(((x / 2) | 0) - 150, midY + 2, progress * 3, 30, 0x8c1111);
        Pix2D.fillRect(((x / 2) | 0) - 150 + progress * 3, midY + 2, 300 - progress * 3, 30, Colour.BLACK);
        this.b12?.centreString(message, (x / 2) | 0, ((y / 2) | 0) + 5 - offsetY, Colour.WHITE);

        this.imageTitle4?.draw(202, 171);

        if (this.redrawFrame) {
            this.redrawFrame = false;

            if (!this.titleFlames?.active) {
                this.imageTitle0?.draw(0, 0);
                this.imageTitle1?.draw(637, 0);
            }

            this.imageTitle2?.draw(128, 0);
            this.imageTitle3?.draw(202, 371);
            this.imageTitle5?.draw(0, 265);
            this.imageTitle6?.draw(562, 265);
            this.imageTitle7?.draw(128, 171);
            this.imageTitle8?.draw(562, 171);
        }

        await sleep(5); // return a slice of time to the main loop so it can update the progress bar
    }

    // todo: order
    private gameDraw(): void {
        if (this.players === null) {
            // client is unloading asynchronously
            return;
        }

        if (this.redrawFrame) {
            this.redrawFrame = false;

            this.areaBackleft1?.draw(0, 4);
            this.areaBackleft2?.draw(0, 357);
            this.areaBackright1?.draw(722, 4);
            this.areaBackright2?.draw(743, 205);
            this.areaBacktop1?.draw(0, 0);
            this.areaBackvmid1?.draw(516, 4);
            this.areaBackvmid2?.draw(516, 205);
            this.areaBackvmid3?.draw(496, 357);
            this.areaBackhmid2?.draw(0, 338);

            this.redrawSide = true;
            this.redrawChat = true;
            this.redrawIcons = true;
            this.redrawChatMode = true;

            if (this.sceneState !== 2) {
                this.areaGame?.draw(4, 4);
                this.areaMap?.draw(550, 4);
            }
        }

        if (this.sceneState === 2) {
            this.gameDrawMain();
        }

        if (this.isMenuOpen && this.menuArea === 1) {
            this.redrawSide = true;
        }

        if (this.sideModalId !== -1) {
            const redraw = this.animateInterface(this.sideModalId, this.worldUpdateNum);
            if (redraw) {
                this.redrawSide = true;
            }
        }

        if (this.selectedArea === 2) {
            this.redrawSide = true;
        }

        if (this.objDragArea === 2) {
            this.redrawSide = true;
        }

        if (this.redrawSide) {
            this.drawSide();
            this.redrawSide = false;
        }

        if (this.chatModalId === -1) {
            this.chatInterface.scrollPos = this.chatScrollHeight - this.chatScrollPos - 77;

            if (this.mouseX > 448 && this.mouseX < 560 && this.mouseY > 332) {
                this.doScrollbar(this.mouseX - 17, this.mouseY - 357, this.chatScrollHeight, 77, false, 463, 0, this.chatInterface);
            }

            let offset: number = this.chatScrollHeight - this.chatInterface.scrollPos - 77;
            if (offset < 0) {
                offset = 0;
            }

            if (offset > this.chatScrollHeight - 77) {
                offset = this.chatScrollHeight - 77;
            }

            if (this.chatScrollPos !== offset) {
                this.chatScrollPos = offset;
                this.redrawChat = true;
            }
        }

        if (this.chatModalId !== -1) {
            const redraw = this.animateInterface(this.chatModalId, this.worldUpdateNum);
            if (redraw) {
                this.redrawChat = true;
            }
        }

        if (this.selectedArea === 3) {
            this.redrawChat = true;
        }

        if (this.objDragArea === 3) {
            this.redrawChat = true;
        }

        if (this.tutComMessage) {
            this.redrawChat = true;
        }

        if (this.isMenuOpen && this.menuArea === 2) {
            this.redrawChat = true;
        }

        if (this.redrawChat) {
            this.drawChat();
            this.redrawChat = false;
        }

        if (this.sceneState === 2) {
            this.minimapDraw();
            this.areaMap?.draw(550, 4);
        }

        if (this.tutFlashIcon !== -1) {
            this.redrawIcons = true;
        }

        if (this.redrawIcons) {
            if (this.tutFlashIcon !== -1 && this.tutFlashIcon === this.activeIcon) {
                this.tutFlashIcon = -1;
                this.out.p1Enc(ClientProt.TUT_CLICKSIDE);
                this.out.p1(this.activeIcon);
            }

            this.redrawIcons = false;
            this.areaBackhmid1?.setPixels();
            this.backhmid1?.plotSprite(0, 0);

            if (this.sideModalId === -1) {
                if (this.sideIcon[this.activeIcon] !== -1) {
                    if (this.activeIcon === 0) {
                        this.redstone1?.plotSprite(22, 10);
                    } else if (this.activeIcon === 1) {
                        this.redstone2?.plotSprite(54, 8);
                    } else if (this.activeIcon === 2) {
                        this.redstone2?.plotSprite(82, 8);
                    } else if (this.activeIcon === 3) {
                        this.redstone3?.plotSprite(110, 8);
                    } else if (this.activeIcon === 4) {
                        this.redstone2h?.plotSprite(153, 8);
                    } else if (this.activeIcon === 5) {
                        this.redstone2h?.plotSprite(181, 8);
                    } else if (this.activeIcon === 6) {
                        this.redstone1h?.plotSprite(209, 9);
                    }
                }

                if (this.sideIcon[0] !== -1 && (this.tutFlashIcon !== 0 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[0]?.plotSprite(29, 13);
                }

                if (this.sideIcon[1] !== -1 && (this.tutFlashIcon !== 1 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[1]?.plotSprite(53, 11);
                }

                if (this.sideIcon[2] !== -1 && (this.tutFlashIcon !== 2 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[2]?.plotSprite(82, 11);
                }

                if (this.sideIcon[3] !== -1 && (this.tutFlashIcon !== 3 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[3]?.plotSprite(115, 12);
                }

                if (this.sideIcon[4] !== -1 && (this.tutFlashIcon !== 4 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[4]?.plotSprite(153, 13);
                }

                if (this.sideIcon[5] !== -1 && (this.tutFlashIcon !== 5 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[5]?.plotSprite(180, 11);
                }

                if (this.sideIcon[6] !== -1 && (this.tutFlashIcon !== 6 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[6]?.plotSprite(208, 13);
                }
            }

            this.areaBackhmid1?.draw(516, 160);

            this.areaBackbase2?.setPixels();
            this.backbase2?.plotSprite(0, 0);

            if (this.sideModalId === -1) {
                if (this.sideIcon[this.activeIcon] !== -1) {
                    if (this.activeIcon === 7) {
                        this.redstone1v?.plotSprite(42, 0);
                    } else if (this.activeIcon === 8) {
                        this.redstone2v?.plotSprite(74, 0);
                    } else if (this.activeIcon === 9) {
                        this.redstone2v?.plotSprite(102, 0);
                    } else if (this.activeIcon === 10) {
                        this.redstone3v?.plotSprite(130, 1);
                    } else if (this.activeIcon === 11) {
                        this.redstone2hv?.plotSprite(173, 0);
                    } else if (this.activeIcon === 12) {
                        this.redstone2hv?.plotSprite(201, 0);
                    } else if (this.activeIcon === 13) {
                        this.redstone1hv?.plotSprite(229, 0);
                    }
                }

                if (this.sideIcon[8] !== -1 && (this.tutFlashIcon !== 8 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[7]?.plotSprite(74, 2);
                }

                if (this.sideIcon[9] !== -1 && (this.tutFlashIcon !== 9 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[8]?.plotSprite(102, 3);
                }

                if (this.sideIcon[10] !== -1 && (this.tutFlashIcon !== 10 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[9]?.plotSprite(137, 4);
                }

                if (this.sideIcon[11] !== -1 && (this.tutFlashIcon !== 11 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[10]?.plotSprite(174, 2);
                }

                if (this.sideIcon[12] !== -1 && (this.tutFlashIcon !== 12 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[11]?.plotSprite(201, 2);
                }

                if (this.sideIcon[13] !== -1 && (this.tutFlashIcon !== 13 || Client.loopCycle % 20 < 10)) {
                    this.sideicons[12]?.plotSprite(226, 2);
                }
            }

            this.areaBackbase2?.draw(496, 466);

            this.areaGame?.setPixels();
        }

        if (this.redrawChatMode) {
            this.redrawChatMode = false;

            this.areaBackbase1?.setPixels();
            this.backbase1?.plotSprite(0, 0);

            this.p12?.centreStringTag('Public chat', 55, 28, Colour.WHITE, true);
            if (this.chatPublicMode === 0) {
                this.p12?.centreStringTag('On', 55, 41, Colour.GREEN, true);
            }
            if (this.chatPublicMode === 1) {
                this.p12?.centreStringTag('Friends', 55, 41, Colour.YELLOW, true);
            }
            if (this.chatPublicMode === 2) {
                this.p12?.centreStringTag('Off', 55, 41, Colour.RED, true);
            }
            if (this.chatPublicMode === 3) {
                this.p12?.centreStringTag('Hide', 55, 41, Colour.CYAN, true);
            }

            this.p12?.centreStringTag('Private chat', 184, 28, Colour.WHITE, true);
            if (this.chatPrivateMode === 0) {
                this.p12?.centreStringTag('On', 184, 41, Colour.GREEN, true);
            }
            if (this.chatPrivateMode === 1) {
                this.p12?.centreStringTag('Friends', 184, 41, Colour.YELLOW, true);
            }
            if (this.chatPrivateMode === 2) {
                this.p12?.centreStringTag('Off', 184, 41, Colour.RED, true);
            }

            this.p12?.centreStringTag('Trade/duel', 324, 28, Colour.WHITE, true);
            if (this.chatTradeMode === 0) {
                this.p12?.centreStringTag('On', 324, 41, Colour.GREEN, true);
            }
            if (this.chatTradeMode === 1) {
                this.p12?.centreStringTag('Friends', 324, 41, Colour.YELLOW, true);
            }
            if (this.chatTradeMode === 2) {
                this.p12?.centreStringTag('Off', 324, 41, Colour.RED, true);
            }

            this.p12?.centreStringTag('Report abuse', 458, 33, Colour.WHITE, true);

            this.areaBackbase1?.draw(0, 453);

            this.areaGame?.setPixels();
        }

        // Update Bot SDK overlay
        if (this.botOverlay) {
            this.botOverlay.update();
            this.botOverlay.tick();
        }

        this.worldUpdateNum = 0;
    }

    private gameDrawMain(): void {
        this.sceneCycle++;

        this.addPlayers(true);
        this.addNpcs(true);
        this.addPlayers(false);
        this.addNpcs(false);
        this.addProjectiles();
        this.addMapAnim();

        if (!this.cinemaCam) {
            let pitch: number = this.orbitCameraPitch;
            if (((this.cameraPitchClamp / 256) | 0) > pitch) {
                pitch = (this.cameraPitchClamp / 256) | 0;
            }
            if (this.camShake[4] && this.camShakeRan[4] + 128 > pitch) {
                pitch = this.camShakeRan[4] + 128;
            }

            const yaw: number = (this.orbitCameraYaw + this.macroCameraAngle) & 0x7ff;

            if (this.localPlayer) {
                this.camFollow(pitch, yaw, this.orbitCameraX, this.getAvH(this.localPlayer.x, this.localPlayer.z, this.minusedlevel) - 50, this.orbitCameraZ, pitch * 3 + 600);
            }
        }

        let level: number;
        if (this.cinemaCam) {
            level = this.roofCheck2();
        } else {
            level = this.roofCheck();
        }

        const camX: number = this.camX;
        const camY: number = this.camY;
        const camZ: number = this.camZ;
        const camPitch: number = this.camPitch;
        const camYaw: number = this.camYaw;

        for (let axis: number = 0; axis < 5; axis++) {
            if (!this.camShake[axis]) {
                continue;
            }

            const jitter = (Math.random() * (this.camShakeAxis[axis] * 2 + 1) - this.camShakeAxis[axis] + Math.sin(this.camShakeCycle[axis] * (this.camShakeAmp[axis] / 100.0)) * this.camShakeRan[axis]) | 0;
            if (axis === 0) {
                this.camX += jitter;
            } else if (axis === 1) {
                this.camY += jitter;
            } else if (axis === 2) {
                this.camZ += jitter;
            } else if (axis === 3) {
                this.camYaw = (this.camYaw + jitter) & 0x7ff;
            } else if (axis === 4) {
                this.camPitch += jitter;

                if (this.camPitch < 128) {
                    this.camPitch = 128;
                }

                if (this.camPitch > 383) {
                    this.camPitch = 383;
                }
            }
        }

        const cycle = Pix3D.cycle;
        Model.mouseCheck = true;
        Model.pickedCount = 0;
        Model.mouseX = this.mouseX - 4;
        Model.mouseY = this.mouseY - 4;

        Pix2D.cls();
        this.world?.renderAll(this.camX, this.camY, this.camZ, level, this.camYaw, this.camPitch);
        this.world?.removeSprites();
        this.entityOverlays();
        this.coordArrow();
        this.textureRunAnims(cycle);
        this.otherOverlays();
        this.areaGame?.draw(4, 4);

        this.camX = camX;
        this.camY = camY;
        this.camZ = camZ;
        this.camPitch = camPitch;
        this.camYaw = camYaw;
    }

    private addPlayers(self: boolean): void {
        if (!this.localPlayer) {
            return;
        }

        if (this.localPlayer.x >> 7 === this.minimapFlagX && this.localPlayer.z >> 7 === this.minimapFlagZ) {
            this.minimapFlagX = 0;

            Client.cyclelogic6++;
            if (Client.cyclelogic6 > 122) {
                Client.cyclelogic6 = 0;

                this.out.p1Enc(ClientProt.ANTICHEAT_CYCLELOGIC6);
                this.out.p1(62);
            }
        }

        let count = this.playerCount;
        if (self) {
            count = 1;
        }

        for (let i: number = 0; i < count; i++) {
            let player: ClientPlayer | null;
            let id: number;
            if (self) {
                player = this.localPlayer;
                id = LOCAL_PLAYER_INDEX << 14;
            } else {
                player = this.players[this.playerIds[i]];
                id = this.playerIds[i] << 14;
            }

            if (!player || !player.isReady()) {
                continue;
            }

            player.lowMemory = false;
            if (((Client.lowMem && this.playerCount > 50) || this.playerCount > 200) && !self && player.secondaryAnim == player.readyanim) {
                player.lowMemory = true;
            }

            const stx: number = player.x >> 7;
            const stz: number = player.z >> 7;

            if (stx < 0 || stx >= BuildArea.SIZE || stz < 0 || stz >= BuildArea.SIZE) {
                continue;
            }

            if (!player.locModel || Client.loopCycle < player.locStartCycle || Client.loopCycle >= player.locStopCycle) {
                if ((player.x & 0x7f) === 64 && (player.z & 0x7f) === 64) {
                    if (this.tileLastOccupiedCycle[stx][stz] == this.sceneCycle && i != -1) {
                        continue;
                    }

                    this.tileLastOccupiedCycle[stx][stz] = this.sceneCycle;
                }

                player.y = this.getAvH(player.x, player.z, this.minusedlevel);
                this.world?.addDynamic(this.minusedlevel, player.x, player.y, player.z, player, id, player.yaw, 60, player.needsForwardDrawPadding);
            } else {
                player.lowMemory = false;
                player.y = this.getAvH(player.x, player.z, this.minusedlevel);
                this.world?.addDynamic2(this.minusedlevel, player.x, player.y, player.z, player.minTileX, player.minTileZ, player.maxTileX, player.maxTileZ, player, id, player.yaw);
            }
        }
    }

    private addNpcs(alwaysontop: boolean): void {
        for (let i: number = 0; i < this.npcCount; i++) {
            const npc: ClientNpc | null = this.npc[this.npcIds[i]];
            const typecode: number = ((this.npcIds[i] << 14) + 0x20000000) | 0;

            if (!npc || !npc.isReady() || npc.type?.alwaysontop !== alwaysontop) {
                continue;
            }

            const x: number = npc.x >> 7;
            const z: number = npc.z >> 7;

            if (x < 0 || x >= BuildArea.SIZE || z < 0 || z >= BuildArea.SIZE) {
                continue;
            }

            if (npc.size === 1 && (npc.x & 0x7f) === 64 && (npc.z & 0x7f) === 64) {
                if (this.tileLastOccupiedCycle[x][z] === this.sceneCycle) {
                    continue;
                }

                this.tileLastOccupiedCycle[x][z] = this.sceneCycle;
            }

            this.world?.addDynamic(this.minusedlevel, npc.x, this.getAvH(npc.x, npc.z, this.minusedlevel), npc.z, npc, typecode, npc.yaw, (npc.size - 1) * 64 + 60, npc.needsForwardDrawPadding);
        }
    }

    private addProjectiles(): void {
        for (let proj = this.projectiles.head(); proj !== null; proj = this.projectiles.next()) {
            if (proj.level !== this.minusedlevel || Client.loopCycle > proj.t2) {
                proj.unlink();
            } else if (Client.loopCycle >= proj.t1) {
                if (proj.target > 0) {
                    const npc: ClientNpc | null = this.npc[proj.target - 1];
                    if (npc) {
                        proj.setTarget(npc.x, this.getAvH(npc.x, npc.z, proj.level) - proj.h2, npc.z, Client.loopCycle);
                    }
                }

                if (proj.target < 0) {
                    const index: number = -proj.target - 1;
                    let player: ClientPlayer | null;
                    if (index === this.selfSlot) {
                        player = this.localPlayer;
                    } else {
                        player = this.players[index];
                    }

                    if (player) {
                        proj.setTarget(player.x, this.getAvH(player.x, player.z, proj.level) - proj.h2, player.z, Client.loopCycle);
                    }
                }

                proj.move(this.worldUpdateNum);
                this.world?.addDynamic(this.minusedlevel, proj.x | 0, proj.y | 0, proj.z | 0, proj, -1, proj.yaw, 60, false);
            }
        }

        Client.cyclelogic1++;
        if (Client.cyclelogic1 > 1174) {
            Client.cyclelogic1 = 0;

            this.out.p1Enc(ClientProt.ANTICHEAT_CYCLELOGIC1);
            this.out.p1(0);
            const start = this.out.pos;
            if (((Math.random() * 2.0) | 0) === 0) {
                this.out.p2(11499);
            }
            this.out.p2(10548);
            if (((Math.random() * 2.0) | 0) == 0) {
                this.out.p1(139);
            }
            if (((Math.random() * 2.0) | 0) == 0) {
                this.out.p1(94);
            }
            this.out.p2(51693);
            this.out.p1(16);
            this.out.p2(15036);
            if (((Math.random() * 2.0) | 0) == 0) {
                this.out.p1(65);
            }
            this.out.p1((Math.random() * 256.0) | 0);
            this.out.p2(22990);
            this.out.psize1(this.out.pos - start);
        }
    }

    private addMapAnim(): void {
        for (let spot = this.spotanims.head(); spot !== null; spot = this.spotanims.next()) {
            if (spot.level !== this.minusedlevel || spot.animComplete) {
                spot.unlink();
            } else if (Client.loopCycle >= spot.startCycle) {
                spot.update(this.worldUpdateNum);

                if (spot.animComplete) {
                    spot.unlink();
                } else {
                    this.world?.addDynamic(spot.level, spot.x, spot.y, spot.z, spot, -1, 0, 60, false);
                }
            }
        }
    }

    private camFollow(pitch: number, yaw: number, targetX: number, targetY: number, targetZ: number, distance: number): void {
        const invPitch: number = (2048 - pitch) & 0x7ff;
        const invYaw: number = (2048 - yaw) & 0x7ff;

        let x: number = 0;
        let y: number = 0;
        let z: number = distance;

        let sin: number;
        let cos: number;
        let tmp: number;

        if (invPitch !== 0) {
            sin = Pix3D.sinTable[invPitch];
            cos = Pix3D.cosTable[invPitch];
            tmp = (y * cos - distance * sin) >> 16;
            z = (y * sin + distance * cos) >> 16;
            y = tmp;
        }

        if (invYaw !== 0) {
            sin = Pix3D.sinTable[invYaw];
            cos = Pix3D.cosTable[invYaw];
            tmp = (z * sin + x * cos) >> 16;
            z = (z * cos - x * sin) >> 16;
            x = tmp;
        }

        this.camX = targetX - x;
        this.camY = targetY - y;
        this.camZ = targetZ - z;
        this.camPitch = pitch;
        this.camYaw = yaw;
    }

    private roofCheck2(): number {
        if (!this.mapl) {
            return 0; // custom
        }

        const y: number = this.getAvH(this.camX, this.camZ, this.minusedlevel);
        return y - this.camY >= 800 || (this.mapl[this.minusedlevel][this.camX >> 7][this.camZ >> 7] & MapFlag.RemoveRoof) === 0 ? 3 : this.minusedlevel;
    }

    private roofCheck(): number {
        let top: number = 3;

        if (this.camPitch < 310 && this.localPlayer) {
            let cameraLocalTileX: number = this.camX >> 7;
            let cameraLocalTileZ: number = this.camZ >> 7;
            const playerLocalTileX: number = this.localPlayer.x >> 7;
            const playerLocalTileZ: number = this.localPlayer.z >> 7;

            if (this.mapl && (this.mapl[this.minusedlevel][cameraLocalTileX][cameraLocalTileZ] & MapFlag.RemoveRoof) !== 0) {
                top = this.minusedlevel;
            }

            let tileDeltaX: number;
            if (playerLocalTileX > cameraLocalTileX) {
                tileDeltaX = playerLocalTileX - cameraLocalTileX;
            } else {
                tileDeltaX = cameraLocalTileX - playerLocalTileX;
            }

            let tileDeltaZ: number;
            if (playerLocalTileZ > cameraLocalTileZ) {
                tileDeltaZ = playerLocalTileZ - cameraLocalTileZ;
            } else {
                tileDeltaZ = cameraLocalTileZ - playerLocalTileZ;
            }

            if (tileDeltaX > tileDeltaZ) {
                const delta = ((tileDeltaZ * 65536) / tileDeltaX) | 0;
                let accumulator = 32768;

                while (cameraLocalTileX !== playerLocalTileX) {
                    if (cameraLocalTileX < playerLocalTileX) {
                        cameraLocalTileX++;
                    } else if (cameraLocalTileX > playerLocalTileX) {
                        cameraLocalTileX--;
                    }

                    if (this.mapl && (this.mapl[this.minusedlevel][cameraLocalTileX][cameraLocalTileZ] & MapFlag.RemoveRoof) !== 0) {
                        top = this.minusedlevel;
                    }

                    accumulator += delta;
                    if (accumulator >= 65536) {
                        accumulator -= 65536;

                        if (cameraLocalTileZ < playerLocalTileZ) {
                            cameraLocalTileZ++;
                        } else if (cameraLocalTileZ > playerLocalTileZ) {
                            cameraLocalTileZ--;
                        }

                        if (this.mapl && (this.mapl[this.minusedlevel][cameraLocalTileX][cameraLocalTileZ] & MapFlag.RemoveRoof) !== 0) {
                            top = this.minusedlevel;
                        }
                    }
                }
            } else {
                const delta = ((tileDeltaX * 65536) / tileDeltaZ) | 0;
                let accumulator = 32768;

                while (cameraLocalTileZ !== playerLocalTileZ) {
                    if (cameraLocalTileZ < playerLocalTileZ) {
                        cameraLocalTileZ++;
                    } else if (cameraLocalTileZ > playerLocalTileZ) {
                        cameraLocalTileZ--;
                    }

                    if (this.mapl && (this.mapl[this.minusedlevel][cameraLocalTileX][cameraLocalTileZ] & MapFlag.RemoveRoof) !== 0) {
                        top = this.minusedlevel;
                    }

                    accumulator += delta;
                    if (accumulator >= 65536) {
                        accumulator -= 65536;

                        if (cameraLocalTileX < playerLocalTileX) {
                            cameraLocalTileX++;
                        } else if (cameraLocalTileX > playerLocalTileX) {
                            cameraLocalTileX--;
                        }

                        if (this.mapl && (this.mapl[this.minusedlevel][cameraLocalTileX][cameraLocalTileZ] & MapFlag.RemoveRoof) !== 0) {
                            top = this.minusedlevel;
                        }
                    }
                }
            }
        }

        if (this.localPlayer && this.mapl && (this.mapl[this.minusedlevel][this.localPlayer.x >> 7][this.localPlayer.z >> 7] & MapFlag.RemoveRoof) !== 0) {
            top = this.minusedlevel;
        }

        return top;
    }

    private entityOverlays(): void {
        this.chatCount = 0;

        for (let index: number = -1; index < this.playerCount + this.npcCount; index++) {
            let entity: ClientEntity | null = null;
            if (index === -1) {
                entity = this.localPlayer;
            } else if (index < this.playerCount) {
                entity = this.players[this.playerIds[index]];
            } else {
                entity = this.npc[this.npcIds[index - this.playerCount]];
            }

            if (!entity || !entity.isReady()) {
                continue;
            }

            if (index >= this.playerCount) {
                const npc = (entity as ClientNpc).type;

                if (npc && npc.headicon >= 0 && npc.headicon < this.headicons.length) {
                    this.getOverlayPosEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        this.headicons[npc.headicon]?.plotSprite(this.projectX - 12, this.projectY - 30);
                    }
                }

                if (this.hintType === 1 && this.hintNpc === this.npcIds[index - this.playerCount] && Client.loopCycle % 20 < 10) {
                    this.getOverlayPosEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        this.headicons[2]?.plotSprite(this.projectX - 12, this.projectY - 28);
                    }
                }
            } else {
                let y: number = 30;

                const player: ClientPlayer = entity as ClientPlayer;
                if (player.headicons !== 0) {
                    this.getOverlayPosEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        for (let icon: number = 0; icon < 8; icon++) {
                            if ((player.headicons & (0x1 << icon)) !== 0) {
                                this.headicons[icon]?.plotSprite(this.projectX - 12, this.projectY - y);
                                y -= 25;
                            }
                        }
                    }
                }

                if (index >= 0 && this.hintType === 10 && this.hintPlayer === this.playerIds[index]) {
                    this.getOverlayPosEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        this.headicons[7]?.plotSprite(this.projectX - 12, this.projectY - y);
                    }
                }
            }

            if (entity.chatMessage && (index >= this.playerCount || this.chatPublicMode === 0 || this.chatPublicMode === 3 || (this.chatPublicMode === 1 && this.isFriend((entity as ClientPlayer).name)))) {
                this.getOverlayPosEntity(entity, entity.height);

                if (this.projectX > -1 && this.chatCount < MAX_CHATS && this.b12) {
                    this.chatWidth[this.chatCount] = (this.b12.stringWid(entity.chatMessage) / 2) | 0;
                    this.chatHeight[this.chatCount] = this.b12.height;
                    this.chatX[this.chatCount] = this.projectX;
                    this.chatY[this.chatCount] = this.projectY;

                    this.chatColour[this.chatCount] = entity.chatColour;
                    this.chatEffect[this.chatCount] = entity.chatEffect;
                    this.chatTimer[this.chatCount] = entity.chatTimer;
                    this.chats[this.chatCount++] = entity.chatMessage as string;

                    if (this.chatEffects === 0 && entity.chatEffect === 1) {
                        this.chatHeight[this.chatCount] += 10;
                        this.chatY[this.chatCount] += 5;
                    }

                    if (this.chatEffects === 0 && entity.chatEffect === 2) {
                        this.chatWidth[this.chatCount] = 60;
                    }
                }
            }

            if (entity.combatCycle > Client.loopCycle + 100) {
                this.getOverlayPosEntity(entity, entity.height + 15);

                if (this.projectX > -1) {
                    let w: number = ((entity.health * 30) / entity.totalHealth) | 0;
                    if (w > 30) {
                        w = 30;
                    }
                    Pix2D.fillRect(this.projectX - 15, this.projectY - 3, w, 5, Colour.GREEN);
                    Pix2D.fillRect(this.projectX - 15 + w, this.projectY - 3, 30 - w, 5, Colour.RED);
                }
            }

            for (let i = 0; i < 4; ++i) {
                if (entity.damageCycles[i] <= Client.loopCycle) {
                    continue;
                }

                this.getOverlayPosEntity(entity, (entity.height / 2) | 0);

                if (this.projectX <= -1) {
                    continue;
                }

                if (i == 1) {
                    this.projectY -= 20;
                } else if (i == 2) {
                    this.projectX -= 15;
                    this.projectY -= 10;
                } else if (i == 3) {
                    this.projectX += 15;
                    this.projectY -= 10;
                }

                this.hitmarks[entity.damageTypes[i]]?.plotSprite(this.projectX - 12, this.projectY - 12);
                this.p11?.centreString(entity.damageValues[i].toString(), this.projectX, this.projectY + 4, Colour.BLACK);
                this.p11?.centreString(entity.damageValues[i].toString(), this.projectX - 1, this.projectY + 3, Colour.WHITE);
            }
        }

        for (let i: number = 0; i < this.chatCount; i++) {
            const x: number = this.chatX[i];
            let y: number = this.chatY[i];
            const padding: number = this.chatWidth[i];
            const height: number = this.chatHeight[i];

            let sorting: boolean = true;
            while (sorting) {
                sorting = false;
                for (let j: number = 0; j < i; j++) {
                    if (y + 2 > this.chatY[j] - this.chatHeight[j] && y - height < this.chatY[j] + 2 && x - padding < this.chatX[j] + this.chatWidth[j] && x + padding > this.chatX[j] - this.chatWidth[j] && this.chatY[j] - this.chatHeight[j] < y) {
                        y = this.chatY[j] - this.chatHeight[j];
                        sorting = true;
                    }
                }
            }

            this.projectX = this.chatX[i];
            this.projectY = this.chatY[i] = y;

            const message: string | null = this.chats[i];

            if (this.chatEffects !== 0) {
                this.b12?.centreString(message, this.projectX, this.projectY + 1, Colour.BLACK);
                this.b12?.centreString(message, this.projectX, this.projectY, Colour.YELLOW);
            } else {
                let colour: number = Colour.YELLOW;
                if (this.chatColour[i] < 6) {
                    colour = CHAT_COLOURS[this.chatColour[i]];
                } else if (this.chatColour[i] === 6) {
                    colour = this.sceneCycle % 20 < 10 ? Colour.RED : Colour.YELLOW;
                } else if (this.chatColour[i] === 7) {
                    colour = this.sceneCycle % 20 < 10 ? Colour.BLUE : Colour.CYAN;
                } else if (this.chatColour[i] === 8) {
                    colour = this.sceneCycle % 20 < 10 ? 0xb000 : 0x80ff80;
                } else if (this.chatColour[i] === 9) {
                    const delta: number = 150 - this.chatTimer[i];
                    if (delta < 50) {
                        colour = delta * 1280 + Colour.RED;
                    } else if (delta < 100) {
                        colour = Colour.YELLOW - (delta - 50) * 327680;
                    } else if (delta < 150) {
                        colour = (delta - 100) * 5 + Colour.GREEN;
                    }
                } else if (this.chatColour[i] === 10) {
                    const delta: number = 150 - this.chatTimer[i];
                    if (delta < 50) {
                        colour = delta * 5 + Colour.RED;
                    } else if (delta < 100) {
                        colour = Colour.MAGENTA - (delta - 50) * 327680;
                    } else if (delta < 150) {
                        colour = (delta - 100) * 327680 + Colour.BLUE - (delta - 100) * 5;
                    }
                } else if (this.chatColour[i] === 11) {
                    const delta: number = 150 - this.chatTimer[i];
                    if (delta < 50) {
                        colour = Colour.WHITE - delta * 327685;
                    } else if (delta < 100) {
                        colour = (delta - 50) * 327685 + Colour.GREEN;
                    } else if (delta < 150) {
                        colour = Colour.WHITE - (delta - 100) * 327680;
                    }
                }

                if (this.chatEffect[i] === 0) {
                    this.b12?.centreString(message, this.projectX, this.projectY + 1, Colour.BLACK);
                    this.b12?.centreString(message, this.projectX, this.projectY, colour);
                } else if (this.chatEffect[i] === 1) {
                    this.b12?.centreStringWave(message, this.projectX, this.projectY + 1, Colour.BLACK, this.sceneCycle);
                    this.b12?.centreStringWave(message, this.projectX, this.projectY, colour, this.sceneCycle);
                } else if (this.chatEffect[i] === 2) {
                    const w: number = this.b12?.stringWid(message) ?? 0;
                    const offsetX: number = ((150 - this.chatTimer[i]) * (w + 100)) / 150;
                    Pix2D.setClipping(this.projectX - 50, 0, this.projectX + 50, 334);
                    this.b12?.drawString(message, this.projectX + 50 - offsetX, this.projectY + 1, Colour.BLACK);
                    this.b12?.drawString(message, this.projectX + 50 - offsetX, this.projectY, colour);
                    Pix2D.resetClipping();
                }
            }
        }
    }

    private coordArrow(): void {
        if (this.hintType !== 2 || !this.headicons[2]) {
            return;
        }

        this.getOverlayPos(((this.hintTileX - this.mapBuildBaseX) << 7) + this.hintOffsetX, ((this.hintTileZ - this.mapBuildBaseZ) << 7) + this.hintOffsetZ, this.hintHeight * 2);

        if (this.projectX > -1 && Client.loopCycle % 20 < 10) {
            this.headicons[2].plotSprite(this.projectX - 12, this.projectY - 28);
        }
    }

    // todo: order
    private textureRunAnims(cycle: number): void {
        if (!Client.lowMem) {
            if (Pix3D.texCycle[17] >= cycle) {
                const texture: Pix8 | null = Pix3D.textures[17];
                if (!texture) {
                    return;
                }

                const bottom: number = texture.wi * texture.hi - 1;
                const adjustment: number = texture.wi * this.worldUpdateNum * 2;

                const src: Int8Array = texture.data;
                const dst: Int8Array = this.textureBuffer;
                for (let i: number = 0; i <= bottom; i++) {
                    dst[i] = src[(i - adjustment) & bottom];
                }

                texture.data = dst;
                this.textureBuffer = src;
                Pix3D.pushTexture(17);
            }

            if (Pix3D.texCycle[24] >= cycle) {
                const texture: Pix8 | null = Pix3D.textures[24];
                if (!texture) {
                    return;
                }
                const bottom: number = texture.wi * texture.hi - 1;
                const adjustment: number = texture.wi * this.worldUpdateNum * 2;

                const src: Int8Array = texture.data;
                const dst: Int8Array = this.textureBuffer;
                for (let i: number = 0; i <= bottom; i++) {
                    dst[i] = src[(i - adjustment) & bottom];
                }

                texture.data = dst;
                this.textureBuffer = src;
                Pix3D.pushTexture(24);
            }
        }
    }

    private otherOverlays(): void {
        this.drawPrivateMessages();

        if (this.crossMode === 1) {
            this.cross[(this.crossCycle / 100) | 0]?.plotSprite(this.crossX - 8 - 4, this.crossY - 8 - 4);
        } else if (this.crossMode === 2) {
            this.cross[((this.crossCycle / 100) | 0) + 4]?.plotSprite(this.crossX - 8 - 4, this.crossY - 8 - 4);

            Client.cyclelogic5++;
            if (Client.cyclelogic5 > 57) {
                Client.cyclelogic5 = 0;

                this.out.p1Enc(ClientProt.ANTICHEAT_CYCLELOGIC5);
            }
        }

        if (this.mainOverlayId !== -1) {
            this.animateInterface(this.mainOverlayId, this.worldUpdateNum);
            this.drawInterface(IfType.list[this.mainOverlayId], 0, 0, 0);
        }

        if (this.mainModalId !== -1) {
            this.animateInterface(this.mainModalId, this.worldUpdateNum);
            this.drawInterface(IfType.list[this.mainModalId], 0, 0, 0);
        }

        this.getSpecialArea();

        if (!this.isMenuOpen) {
            this.buildMinimenu();
            this.drawFeedback();
        } else if (this.menuArea === 0) {
            this.drawMinimenu();
        }

        if (this.inMultizone === 1) {
            this.headicons[1]?.plotSprite(472, 296);
        }

        // custom: taken from later client
        if (this.showFps) {
            const x: number = 507;
            let y: number = 20;

            let colour: number = Colour.YELLOW;
            if (this.fps < 15) {
                colour = Colour.RED;
            }

            this.p12?.drawStringRight('Fps:' + this.fps, x, y, colour);
            y += 15;

            let memoryUsage = -1;
            if (typeof window.performance['memory' as keyof Performance] !== 'undefined') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const memory = window.performance['memory' as keyof Performance] as any;
                memoryUsage = (memory.usedJSHeapSize / 1024) | 0;
            }

            if (memoryUsage !== -1) {
                this.p12?.drawStringRight('Mem:' + memoryUsage + 'k', x, y, Colour.YELLOW);
            }
        }

        if (this.rebootTimer !== 0) {
            let seconds: number = (this.rebootTimer / 50) | 0;
            const minutes: number = (seconds / 60) | 0;
            seconds %= 60;

            if (seconds < 10) {
                this.p12?.drawString('System update in: ' + minutes + ':0' + seconds, 4, 329, Colour.YELLOW);
            } else {
                this.p12?.drawString('System update in: ' + minutes + ':' + seconds, 4, 329, Colour.YELLOW);
            }
        }
    }

    // todo: order
    private drawPrivateMessages(): void {
        if (this.splitPrivateChat === 0) {
            return;
        }

        const font: PixFont | null = this.p12;
        let lineOffset: number = 0;
        if (this.rebootTimer !== 0) {
            lineOffset = 1;
        }

        for (let i: number = 0; i < 100; i++) {
            if (!this.chatText[i]) {
                continue;
            }

            const type: number = this.chatType[i];
            let sender = this.chatUsername[i];

            let modlevel = 0;
            if (sender && sender.startsWith('@cr1@')) {
                sender = sender.substring(5);
                modlevel = 1;
            } else if (sender && sender.startsWith('@cr2@')) {
                sender = sender.substring(5);
                modlevel = 2;
            }

            if ((type == 3 || type == 7) && (type == 7 || this.chatPrivateMode == 0 || (this.chatPrivateMode == 1 && this.isFriend(sender)))) {
                const y = 329 - lineOffset * 13;
                let x = 4;

                font?.drawString('From', 4, y, Colour.BLACK);
                font?.drawString('From', 4, y - 1, Colour.CYAN);
                x += font?.stringWid('From ') ?? 0;

                if (modlevel == 1) {
                    this.modIcons[0].plotSprite(x, y - 12);
                    x += 14;
                } else if (modlevel == 2) {
                    this.modIcons[1].plotSprite(x, y - 12);
                    x += 14;
                }

                font?.drawString(sender + ': ' + this.chatText[i], x, y, Colour.BLACK);
                font?.drawString(sender + ': ' + this.chatText[i], x, y - 1, Colour.CYAN);

                lineOffset++;
                if (lineOffset >= 5) {
                    return;
                }
            } else if (type === 5 && this.chatPrivateMode < 2) {
                const y = 329 - lineOffset * 13;

                font?.drawString(this.chatText[i], 4, y, Colour.BLACK);
                font?.drawString(this.chatText[i], 4, y - 1, Colour.CYAN);

                lineOffset++;
                if (lineOffset >= 5) {
                    return;
                }
            } else if (type === 6 && this.chatPrivateMode < 2) {
                const y = 329 - lineOffset * 13;

                font?.drawString('To ' + sender + ': ' + this.chatText[i], 4, y, Colour.BLACK);
                font?.drawString('To ' + sender + ': ' + this.chatText[i], 4, y - 1, Colour.CYAN);

                lineOffset++;
                if (lineOffset >= 5) {
                    return;
                }
            }
        }
    }

    // todo: order
    private getSpecialArea(): void {
        if (!this.localPlayer) {
            return;
        }

        const x: number = (this.localPlayer.x >> 7) + this.mapBuildBaseX;
        const z: number = (this.localPlayer.z >> 7) + this.mapBuildBaseZ;

        this.chatDisabled = 0;

        // tutorial island
        if (x >= 3053 && x <= 3156 && z >= 3056 && z <= 3136) {
            this.chatDisabled = 1;
        } else if (x >= 3072 && x <= 3118 && z >= 9492 && z <= 9535) {
            this.chatDisabled = 1;
        }

        if (this.chatDisabled === 1 && x >= 3139 && x <= 3199 && z >= 3008 && z <= 3062) {
            this.chatDisabled = 0;
        }
    }

    private getOverlayPosEntity(entity: ClientEntity, height: number): void {
        this.getOverlayPos(entity.x, entity.z, height);
    }

    private getOverlayPos(x: number, z: number, height: number): void {
        if (x < 128 || z < 128 || x > 13056 || z > 13056) {
            this.projectX = -1;
            this.projectY = -1;
            return;
        }

        const y: number = this.getAvH(x, z, this.minusedlevel) - height;

        let dx: number = x - this.camX;
        let dy: number = y - this.camY;
        let dz: number = z - this.camZ;

        const sinPitch: number = Pix3D.sinTable[this.camPitch];
        const cosPitch: number = Pix3D.cosTable[this.camPitch];
        const sinYaw: number = Pix3D.sinTable[this.camYaw];
        const cosYaw: number = Pix3D.cosTable[this.camYaw];

        let tmp: number = (dz * sinYaw + dx * cosYaw) >> 16;
        dz = (dz * cosYaw - dx * sinYaw) >> 16;
        dx = tmp;

        tmp = (dy * cosPitch - dz * sinPitch) >> 16;
        dz = (dy * sinPitch + dz * cosPitch) >> 16;
        dy = tmp;

        if (dz >= 50) {
            this.projectX = Pix3D.originX + (((dx << 9) / dz) | 0);
            this.projectY = Pix3D.originY + (((dy << 9) / dz) | 0);
        } else {
            this.projectX = -1;
            this.projectY = -1;
        }
    }

    private getAvH(sceneX: number, sceneZ: number, level: number): number {
        if (!this.groundh) {
            return 0; // custom
        }

        const tileX: number = sceneX >> 7;
        const tileZ: number = sceneZ >> 7;

        if (tileX < 0 || tileZ < 0 || tileX > 103 || tileZ > 103) {
            return 0;
        }

        let realLevel: number = level;
        if (level < 3 && this.mapl && (this.mapl[1][tileX][tileZ] & MapFlag.LinkBelow) !== 0) {
            realLevel = level + 1;
        }

        const tileLocalX: number = sceneX & 0x7f;
        const tileLocalZ: number = sceneZ & 0x7f;
        const y00: number = (this.groundh[realLevel][tileX][tileZ] * (128 - tileLocalX) + this.groundh[realLevel][tileX + 1][tileZ] * tileLocalX) >> 7;
        const y11: number = (this.groundh[realLevel][tileX][tileZ + 1] * (128 - tileLocalX) + this.groundh[realLevel][tileX + 1][tileZ + 1] * tileLocalX) >> 7;
        return (y00 * (128 - tileLocalZ) + y11 * tileLocalZ) >> 7;
    }

    private checkMinimap(): void {
        if (Client.lowMem && this.sceneState === 2 && ClientBuild.minusedlevel !== this.minusedlevel) {
            this.areaGame?.setPixels();
            this.p12?.centreString('Loading - please wait.', 257, 151, Colour.BLACK);
            this.p12?.centreString('Loading - please wait.', 256, 150, Colour.WHITE);
            this.areaGame?.draw(4, 4);
            this.sceneState = 1;
            this.sceneLoadStartTime = performance.now();
        }

        if (this.sceneState === 1) {
            const status = this.checkScene();
            if (status != 0 && performance.now() - this.sceneLoadStartTime > 360000) {
                // "game loop check ..."
                console.log(`${this.loginUser} glcfb ${this.loginSeed},${status},${Client.lowMem},${this.db !== null},${this.onDemand?.remaining()},${this.minusedlevel},${this.mapBuildCentreZoneX},${this.mapBuildCentreZoneZ}`);
                this.sceneLoadStartTime = performance.now();
            }
        }

        if (this.sceneState === 2 && this.minusedlevel !== this.minimapLevel) {
            this.minimapLevel = this.minusedlevel;
            this.minimapBuildBuffer(this.minusedlevel);
        }
    }

    private checkScene(): number {
        if (!this.mapBuildIndex || !this.mapBuildGroundData || !this.mapBuildLocationData) {
            return -1000; // custom
        }

        for (let i = 0; i < this.mapBuildGroundData.length; i++) {
            if (this.mapBuildGroundData[i] == null && this.mapBuildGroundFile[i] !== -1) {
                return -1;
            }

            if (this.mapBuildLocationData[i] == null && this.mapBuildLocationFile[i] !== -1) {
                return -2;
            }
        }

        let ready = true;
        for (let i = 0; i < this.mapBuildGroundData.length; i++) {
            const data = this.mapBuildLocationData[i];
            if (data != null) {
                const x = (this.mapBuildIndex[i] >> 8) * 64 - this.mapBuildBaseX;
                const z = (this.mapBuildIndex[i] & 0xff) * 64 - this.mapBuildBaseZ;
                if (!ClientBuild.checkLocations(data, x, z)) {
                    ready = false;
                }
            }
        }

        if (!ready) {
            return -3;
        } else if (this.awaitingPlayerInfo) {
            return -4;
        }

        this.sceneState = 2;
        ClientBuild.minusedlevel = this.minusedlevel;
        this.mapBuild();
        this.out.p1Enc(ClientProt.MAP_BUILD_COMPLETE);
        return 0;
    }

    private mapBuild(): void {
        try {
            this.minimapLevel = -1;
            this.spotanims.clear();
            this.projectiles.clear();
            Pix3D.clearTexels();
            this.clearCaches();
            this.world?.resetMap();

            for (let level: number = 0; level < BuildArea.LEVELS; level++) {
                this.collision[level]?.reset();
            }

            const build: ClientBuild = new ClientBuild(BuildArea.SIZE, BuildArea.SIZE, this.groundh!, this.mapl!);
            const maps: number = this.mapBuildGroundData?.length ?? 0;

            ClientBuild.lowMem = World.lowMem;

            if (this.mapBuildIndex) {
                for (let index: number = 0; index < maps; index++) {
                    const x: number = this.mapBuildIndex[index] >> 8;
                    const z: number = this.mapBuildIndex[index] & 0xff;

                    // underground pass check
                    if (x === 33 && z >= 71 && z <= 73) {
                        ClientBuild.lowMem = false;
                        break;
                    }
                }
            }

            if (ClientBuild.lowMem) {
                this.world?.fillBaseLevel(this.minusedlevel);
            } else {
                this.world?.fillBaseLevel(0);
            }

            if (this.mapBuildIndex && this.mapBuildGroundData) {
                this.out.p1Enc(ClientProt.NO_TIMEOUT);

                for (let i: number = 0; i < maps; i++) {
                    const x: number = (this.mapBuildIndex[i] >> 8) * 64 - this.mapBuildBaseX;
                    const z: number = (this.mapBuildIndex[i] & 0xff) * 64 - this.mapBuildBaseZ;
                    const data: Uint8Array | null = this.mapBuildGroundData[i];

                    if (data) {
                        build.loadGround(data, (this.mapBuildCentreZoneX - 6) * 8, (this.mapBuildCentreZoneZ - 6) * 8, x, z);
                    }
                }

                for (let i: number = 0; i < maps; i++) {
                    const x: number = (this.mapBuildIndex[i] >> 8) * 64 - this.mapBuildBaseX;
                    const z: number = (this.mapBuildIndex[i] & 0xff) * 64 - this.mapBuildBaseZ;
                    const data: Uint8Array | null = this.mapBuildGroundData[i];

                    if (!data && this.mapBuildCentreZoneZ < 800) {
                        build.fadeAdjacent(z, x, 64, 64);
                    }
                }
            }

            if (this.mapBuildIndex && this.mapBuildLocationData) {
                this.out.p1Enc(ClientProt.NO_TIMEOUT);

                for (let i: number = 0; i < maps; i++) {
                    const data: Uint8Array | null = this.mapBuildLocationData[i];

                    if (data) {
                        const x: number = (this.mapBuildIndex[i] >> 8) * 64 - this.mapBuildBaseX;
                        const z: number = (this.mapBuildIndex[i] & 0xff) * 64 - this.mapBuildBaseZ;
                        build.loadLocations(data, x, z, this.world, this.collision);
                    }
                }
            }

            this.out.p1Enc(ClientProt.NO_TIMEOUT);

            build.finishBuild(this.world, this.collision);
            this.areaGame?.setPixels();

            this.out.p1Enc(ClientProt.NO_TIMEOUT);

            for (let x: number = 0; x < BuildArea.SIZE; x++) {
                for (let z: number = 0; z < BuildArea.SIZE; z++) {
                    this.showObject(x, z);
                }
            }

            this.locChangePostBuildCorrect();
        } catch (e) {
            console.error(e);
        }

        LocType.mc1?.clear();

        if (Client.lowMem && this.db) {
            const modelCount = this.onDemand?.getFileCount(0) ?? 0;

            for (let i = 0; i < modelCount; i++) {
                const flags = this.onDemand?.getModelUse(i) ?? 0;

                if ((flags & 0x79) == 0) {
                    Model.unload(i);
                }
            }
        }

        Pix3D.initPool(20);
        this.onDemand?.clearPrefetches();

        let left = (((this.mapBuildCentreZoneX - 6) / 8) | 0) - 1;
        let right = (((this.mapBuildCentreZoneX + 6) / 8) | 0) + 1;
        let bottom = (((this.mapBuildCentreZoneZ - 6) / 8) | 0) - 1;
        let top = (((this.mapBuildCentreZoneZ + 6) / 8) | 0) + 1;

        if (this.withinTutorialIsland) {
            left = 49;
            right = 50;
            bottom = 49;
            top = 50;
        }

        for (let x = left; x <= right; x++) {
            for (let z = bottom; z <= top; z++) {
                if (left == x || right == x || bottom == z || top == z) {
                    const land = this.onDemand?.getMapFile(x, z, 0) ?? -1;
                    if (land != -1) {
                        this.onDemand?.prefetch(3, land);
                    }

                    const loc = this.onDemand?.getMapFile(x, z, 1) ?? -1;
                    if (loc != -1) {
                        this.onDemand?.prefetch(3, loc);
                    }
                }
            }
        }
    }

    private minimapBuildBuffer(level: number): void {
        if (!this.minimap) {
            return;
        }

        const pixels: Int32Array = this.minimap.data;
        const length: number = pixels.length;
        for (let i: number = 0; i < length; i++) {
            pixels[i] = 0;
        }

        for (let z: number = 1; z < BuildArea.SIZE - 1; z++) {
            let offset: number = (BuildArea.SIZE - 1 - z) * 512 * 4 + 24628;

            for (let x: number = 1; x < BuildArea.SIZE - 1; x++) {
                if (this.mapl && (this.mapl[level][x][z] & (MapFlag.VisBelow | MapFlag.ForceHighDetail)) === 0) {
                    this.world?.render2DGround(level, x, z, pixels, offset, 512);
                }

                if (level < 3 && this.mapl && (this.mapl[level + 1][x][z] & MapFlag.VisBelow) !== 0) {
                    this.world?.render2DGround(level + 1, x, z, pixels, offset, 512);
                }

                offset += 4;
            }
        }

        const inactiveRgb: number = ((((Math.random() * 20.0) | 0) + 238 - 10) << 16) + ((((Math.random() * 20.0) | 0) + 238 - 10) << 8) + ((Math.random() * 20.0) | 0) + 238 - 10;
        const activeRgb: number = (((Math.random() * 20.0) | 0) + 238 - 10) << 16;

        this.minimap.setPixels();

        for (let z: number = 1; z < BuildArea.SIZE - 1; z++) {
            for (let x: number = 1; x < BuildArea.SIZE - 1; x++) {
                if (this.mapl && (this.mapl[level][x][z] & (MapFlag.VisBelow | MapFlag.ForceHighDetail)) === 0) {
                    this.drawDetail(level, x, z, inactiveRgb, activeRgb);
                }

                if (level < 3 && this.mapl && (this.mapl[level + 1][x][z] & MapFlag.VisBelow) !== 0) {
                    this.drawDetail(level + 1, x, z, inactiveRgb, activeRgb);
                }
            }
        }

        this.areaGame?.setPixels();

        this.activeMapFunctionCount = 0;

        for (let x: number = 0; x < BuildArea.SIZE; x++) {
            for (let z: number = 0; z < BuildArea.SIZE; z++) {
                const typecode: number = this.world?.gdType(this.minusedlevel, x, z) ?? 0;
                if (typecode === 0) {
                    continue;
                }

                const locId = (typecode >> 14) & 0x7fff;
                const func: number = LocType.list(locId).mapfunction;
                if (func < 0) {
                    continue;
                }

                let stx: number = x;
                let stz: number = z;

                if (func !== 22 && func !== 29 && func !== 34 && func !== 36 && func !== 46 && func !== 47 && func !== 48) {
                    const maxX: number = BuildArea.SIZE;
                    const maxZ: number = BuildArea.SIZE;
                    const collisionMap: CollisionMap | null = this.collision[this.minusedlevel];

                    if (collisionMap) {
                        const flags: Int32Array = collisionMap.flags;

                        for (let i: number = 0; i < 10; i++) {
                            const rand: number = (Math.random() * 4.0) | 0;
                            if (rand === 0 && stx > 0 && stx > x - 3 && (flags[CollisionMap.index(stx - 1, stz)] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN) {
                                stx--;
                            }

                            if (rand === 1 && stx < maxX - 1 && stx < x + 3 && (flags[CollisionMap.index(stx + 1, stz)] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN) {
                                stx++;
                            }

                            if (rand === 2 && stz > 0 && stz > z - 3 && (flags[CollisionMap.index(stx, stz - 1)] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN) {
                                stz--;
                            }

                            if (rand === 3 && stz < maxZ - 1 && stz < z + 3 && (flags[CollisionMap.index(stx, stz + 1)] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN) {
                                stz++;
                            }
                        }
                    }
                }

                this.activeMapFunctions[this.activeMapFunctionCount] = this.mapfunction[func];
                this.activeMapFunctionX[this.activeMapFunctionCount] = stx;
                this.activeMapFunctionZ[this.activeMapFunctionCount] = stz;
                this.activeMapFunctionCount++;
            }
        }

        Client.cyclelogic3++;
        if (Client.cyclelogic3 > 112) {
            Client.cyclelogic3 = 0;

            this.out.p1Enc(ClientProt.ANTICHEAT_CYCLELOGIC3);
            this.out.p1(50);
        }
    }

    private drawDetail(level: number, tileX: number, tileZ: number, inactiveRgb: number, activeRgb: number): void {
        if (!this.world || !this.minimap) {
            return;
        }

        const wallType: number = this.world.wallType(level, tileX, tileZ);
        if (wallType !== 0) {
            const info: number = this.world.typeCode2(level, tileX, tileZ, wallType);
            const angle: number = (info >> 6) & 0x3;
            const shape: number = info & 0x1f;
            let rgb: number = inactiveRgb;
            if (wallType > 0) {
                rgb = activeRgb;
            }

            const dst: Int32Array = this.minimap.data;
            const offset: number = tileX * 4 + (103 - tileZ) * 512 * 4 + 24624;
            const locId: number = (wallType >> 14) & 0x7fff;

            const loc: LocType = LocType.list(locId);
            if (loc.mapscene !== -1) {
                const scene: Pix8 | null = this.mapscene[loc.mapscene];
                if (scene) {
                    const offsetX: number = ((loc.width * 4 - scene.wi) / 2) | 0;
                    const offsetY: number = ((loc.length * 4 - scene.hi) / 2) | 0;
                    scene.plotSprite(tileX * 4 + 48 + offsetX, (BuildArea.SIZE - tileZ - loc.length) * 4 + offsetY + 48);
                }
            } else {
                if (shape === LocShape.WALL_STRAIGHT || shape === LocShape.WALL_L) {
                    if (angle === LocAngle.WEST) {
                        dst[offset] = rgb;
                        dst[offset + 512] = rgb;
                        dst[offset + 1024] = rgb;
                        dst[offset + 1536] = rgb;
                    } else if (angle === LocAngle.NORTH) {
                        dst[offset] = rgb;
                        dst[offset + 1] = rgb;
                        dst[offset + 2] = rgb;
                        dst[offset + 3] = rgb;
                    } else if (angle === LocAngle.EAST) {
                        dst[offset + 3] = rgb;
                        dst[offset + 3 + 512] = rgb;
                        dst[offset + 3 + 1024] = rgb;
                        dst[offset + 3 + 1536] = rgb;
                    } else if (angle === LocAngle.SOUTH) {
                        dst[offset + 1536] = rgb;
                        dst[offset + 1536 + 1] = rgb;
                        dst[offset + 1536 + 2] = rgb;
                        dst[offset + 1536 + 3] = rgb;
                    }
                }

                if (shape === LocShape.WALL_SQUARE_CORNER) {
                    if (angle === LocAngle.WEST) {
                        dst[offset] = rgb;
                    } else if (angle === LocAngle.NORTH) {
                        dst[offset + 3] = rgb;
                    } else if (angle === LocAngle.EAST) {
                        dst[offset + 3 + 1536] = rgb;
                    } else if (angle === LocAngle.SOUTH) {
                        dst[offset + 1536] = rgb;
                    }
                }

                if (shape === LocShape.WALL_L) {
                    if (angle === LocAngle.SOUTH) {
                        dst[offset] = rgb;
                        dst[offset + 512] = rgb;
                        dst[offset + 1024] = rgb;
                        dst[offset + 1536] = rgb;
                    } else if (angle === LocAngle.WEST) {
                        dst[offset] = rgb;
                        dst[offset + 1] = rgb;
                        dst[offset + 2] = rgb;
                        dst[offset + 3] = rgb;
                    } else if (angle === LocAngle.NORTH) {
                        dst[offset + 3] = rgb;
                        dst[offset + 3 + 512] = rgb;
                        dst[offset + 3 + 1024] = rgb;
                        dst[offset + 3 + 1536] = rgb;
                    } else if (angle === LocAngle.EAST) {
                        dst[offset + 1536] = rgb;
                        dst[offset + 1536 + 1] = rgb;
                        dst[offset + 1536 + 2] = rgb;
                        dst[offset + 1536 + 3] = rgb;
                    }
                }
            }
        }

        const sceneType = this.world.sceneType(level, tileX, tileZ);
        if (sceneType !== 0) {
            const info: number = this.world.typeCode2(level, tileX, tileZ, sceneType);
            const angle: number = (info >> 6) & 0x3;
            const shape: number = info & 0x1f;
            const locId: number = (sceneType >> 14) & 0x7fff;

            const loc: LocType = LocType.list(locId);
            if (loc.mapscene !== -1) {
                const scene: Pix8 | null = this.mapscene[loc.mapscene];
                if (scene) {
                    const offsetX: number = ((loc.width * 4 - scene.wi) / 2) | 0;
                    const offsetY: number = ((loc.length * 4 - scene.hi) / 2) | 0;
                    scene.plotSprite(tileX * 4 + 48 + offsetX, (BuildArea.SIZE - tileZ - loc.length) * 4 + offsetY + 48);
                }
            } else {
                if (shape === LocShape.WALL_DIAGONAL) {
                    let rgb: number = 0xeeeeee;
                    if (sceneType > 0) {
                        rgb = 0xee0000;
                    }

                    const dst: Int32Array = this.minimap.data;
                    const offset: number = tileX * 4 + (BuildArea.SIZE - 1 - tileZ) * 512 * 4 + 24624;

                    if (angle === LocAngle.WEST || angle === LocAngle.EAST) {
                        dst[offset + 1536] = rgb;
                        dst[offset + 1024 + 1] = rgb;
                        dst[offset + 512 + 2] = rgb;
                        dst[offset + 3] = rgb;
                    } else {
                        dst[offset] = rgb;
                        dst[offset + 512 + 1] = rgb;
                        dst[offset + 1024 + 2] = rgb;
                        dst[offset + 1536 + 3] = rgb;
                    }
                }
            }
        }

        const gdType = this.world.gdType(level, tileX, tileZ);
        if (gdType !== 0) {
            const locId = (gdType >> 14) & 0x7fff;

            const loc: LocType = LocType.list(locId);
            if (loc.mapscene !== -1) {
                const scene: Pix8 | null = this.mapscene[loc.mapscene];
                if (scene) {
                    const offsetX: number = ((loc.width * 4 - scene.wi) / 2) | 0;
                    const offsetY: number = ((loc.length * 4 - scene.hi) / 2) | 0;
                    scene.plotSprite(tileX * 4 + 48 + offsetX, (BuildArea.SIZE - tileZ - loc.length) * 4 + offsetY + 48);
                }
            }
        }
    }

    private interactWithLoc(x: number, z: number, typecode: number, opcode: number): boolean {
        if (!this.localPlayer || !this.world) {
            return false;
        }

        const locId: number = (typecode >> 14) & 0x7fff;
        const info: number = this.world.typeCode2(this.minusedlevel, x, z, typecode);
        if (info === -1) {
            return false;
        }

        const shape: number = info & 0x1f;
        const angle: number = (info >> 6) & 0x3;

        Client.cyclelogic2++;
        if (Client.cyclelogic2 > 1086) {
            Client.cyclelogic2 = 0;

            this.out.p1Enc(ClientProt.ANTICHEAT_CYCLELOGIC2);
            this.out.p1(0);
            const start = this.out.pos;
            if (((Math.random() * 2.0) | 0) == 0) {
                this.out.p2(16791);
            }
            this.out.p1(254);
            this.out.p2((Math.random() * 65536.0) | 0);
            this.out.p2(16128);
            this.out.p2(52610);
            this.out.p2((Math.random() * 65536.0) | 0);
            this.out.p2(55420);
            if (((Math.random() * 2.0) | 0) == 0) {
                this.out.p2(35025);
            }
            this.out.p2(46628);
            this.out.p1((Math.random() * 256.0) | 0);
            this.out.psize1(this.out.pos - start);
        }

        if (shape === LocShape.CENTREPIECE_STRAIGHT || shape === LocShape.CENTREPIECE_DIAGONAL || shape === LocShape.GROUND_DECOR) {
            const loc: LocType = LocType.list(locId);

            let width: number;
            let height: number;
            if (angle === LocAngle.WEST || angle === LocAngle.EAST) {
                width = loc.width;
                height = loc.length;
            } else {
                width = loc.length;
                height = loc.width;
            }

            let forceapproach: number = loc.forceapproach;
            if (angle !== 0) {
                forceapproach = ((forceapproach << angle) & 0xf) + (forceapproach >> (4 - angle));
            }

            this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], x, z, false, width, height, 0, 0, forceapproach, 2);
        } else {
            this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], x, z, false, 0, 0, angle, shape + 1, 0, 2);
        }

        this.crossX = this.mouseClickX;
        this.crossY = this.mouseClickY;
        this.crossMode = 2;
        this.crossCycle = 0;

        this.out.p1Enc(opcode);
        this.out.p2(x + this.mapBuildBaseX);
        this.out.p2(z + this.mapBuildBaseZ);
        this.out.p2(locId);
        return true;
    }

    private tryMove(srcX: number, srcZ: number, dx: number, dz: number, tryNearest: boolean, locWidth: number, locLength: number, locAngle: number, locShape: number, forceapproach: number, type: number): boolean {
        const collisionMap: CollisionMap | null = this.collision[this.minusedlevel];
        if (!collisionMap) {
            return false;
        }

        const sceneWidth: number = BuildArea.SIZE;
        const sceneLength: number = BuildArea.SIZE;

        for (let x: number = 0; x < sceneWidth; x++) {
            for (let z: number = 0; z < sceneLength; z++) {
                const index: number = CollisionMap.index(x, z);
                this.dirMap[index] = 0;
                this.distMap[index] = 99999999;
            }
        }

        let x: number = srcX;
        let z: number = srcZ;

        const srcIndex: number = CollisionMap.index(srcX, srcZ);
        this.dirMap[srcIndex] = 99;
        this.distMap[srcIndex] = 0;

        let steps: number = 0;
        let length: number = 0;

        this.routeX[steps] = srcX;
        this.routeZ[steps++] = srcZ;

        let arrived: boolean = false;
        let bufferSize: number = this.routeX.length;
        const flags: Int32Array = collisionMap.flags;

        while (length !== steps) {
            x = this.routeX[length];
            z = this.routeZ[length];
            length = (length + 1) % bufferSize;

            if (x === dx && z === dz) {
                arrived = true;
                break;
            }

            if (locShape !== LocShape.WALL_STRAIGHT) {
                if ((locShape < LocShape.WALLDECOR_STRAIGHT_OFFSET || locShape === LocShape.CENTREPIECE_STRAIGHT) && collisionMap.testWall(x, z, dx, dz, locShape - 1, locAngle)) {
                    arrived = true;
                    break;
                }

                if (locShape < LocShape.CENTREPIECE_STRAIGHT && collisionMap.testWDecor(x, z, dx, dz, locShape - 1, locAngle)) {
                    arrived = true;
                    break;
                }
            }

            if (locWidth !== 0 && locLength !== 0 && collisionMap.testLoc(x, z, dx, dz, locWidth, locLength, forceapproach)) {
                arrived = true;
                break;
            }

            const nextCost: number = this.distMap[CollisionMap.index(x, z)] + 1;
            let index: number = CollisionMap.index(x - 1, z);
            if (x > 0 && this.dirMap[index] === 0 && (flags[index] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN) {
                this.routeX[steps] = x - 1;
                this.routeZ[steps] = z;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 2;
                this.distMap[index] = nextCost;
            }

            index = CollisionMap.index(x + 1, z);
            if (x < sceneWidth - 1 && this.dirMap[index] === 0 && (flags[index] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN) {
                this.routeX[steps] = x + 1;
                this.routeZ[steps] = z;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 8;
                this.distMap[index] = nextCost;
            }

            index = CollisionMap.index(x, z - 1);
            if (z > 0 && this.dirMap[index] === 0 && (flags[index] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN) {
                this.routeX[steps] = x;
                this.routeZ[steps] = z - 1;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 1;
                this.distMap[index] = nextCost;
            }

            index = CollisionMap.index(x, z + 1);
            if (z < sceneLength - 1 && this.dirMap[index] === 0 && (flags[index] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN) {
                this.routeX[steps] = x;
                this.routeZ[steps] = z + 1;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 4;
                this.distMap[index] = nextCost;
            }

            index = CollisionMap.index(x - 1, z - 1);
            if (
                x > 0 &&
                z > 0 &&
                this.dirMap[index] === 0 &&
                (flags[index] & CollisionFlag.PL_WALK_NE) === 0 &&
                (flags[CollisionMap.index(x - 1, z)] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN &&
                (flags[CollisionMap.index(x, z - 1)] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN
            ) {
                this.routeX[steps] = x - 1;
                this.routeZ[steps] = z - 1;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 3;
                this.distMap[index] = nextCost;
            }

            index = CollisionMap.index(x + 1, z - 1);
            if (
                x < sceneWidth - 1 &&
                z > 0 &&
                this.dirMap[index] === 0 &&
                (flags[index] & CollisionFlag.PL_WALK_NW) === 0 &&
                (flags[CollisionMap.index(x + 1, z)] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN &&
                (flags[CollisionMap.index(x, z - 1)] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN
            ) {
                this.routeX[steps] = x + 1;
                this.routeZ[steps] = z - 1;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 9;
                this.distMap[index] = nextCost;
            }

            index = CollisionMap.index(x - 1, z + 1);
            if (
                x > 0 &&
                z < sceneLength - 1 &&
                this.dirMap[index] === 0 &&
                (flags[index] & CollisionFlag.PL_WALK_SE) === 0 &&
                (flags[CollisionMap.index(x - 1, z)] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN &&
                (flags[CollisionMap.index(x, z + 1)] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN
            ) {
                this.routeX[steps] = x - 1;
                this.routeZ[steps] = z + 1;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 6;
                this.distMap[index] = nextCost;
            }

            index = CollisionMap.index(x + 1, z + 1);
            if (
                x < sceneWidth - 1 &&
                z < sceneLength - 1 &&
                this.dirMap[index] === 0 &&
                (flags[index] & CollisionFlag.PL_WALK_SW) === 0 &&
                (flags[CollisionMap.index(x + 1, z)] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN &&
                (flags[CollisionMap.index(x, z + 1)] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN
            ) {
                this.routeX[steps] = x + 1;
                this.routeZ[steps] = z + 1;
                steps = (steps + 1) % bufferSize;
                this.dirMap[index] = 12;
                this.distMap[index] = nextCost;
            }
        }

        this.tryMoveNearest = 0;

        if (!arrived) {
            if (tryNearest) {
                let min: number = 100;
                for (let padding: number = 1; padding < 2; padding++) {
                    for (let px: number = dx - padding; px <= dx + padding; px++) {
                        for (let pz: number = dz - padding; pz <= dz + padding; pz++) {
                            const index: number = CollisionMap.index(px, pz);
                            if (px >= 0 && pz >= 0 && px < BuildArea.SIZE && pz < BuildArea.SIZE && this.distMap[index] < min) {
                                min = this.distMap[index];
                                x = px;
                                z = pz;
                                this.tryMoveNearest = 1;
                                arrived = true;
                            }
                        }
                    }

                    if (arrived) {
                        break;
                    }
                }
            }

            if (!arrived) {
                return false;
            }
        }

        length = 0;
        this.routeX[length] = x;
        this.routeZ[length++] = z;

        let dir: number = this.dirMap[CollisionMap.index(x, z)];
        let next: number = dir;
        while (x !== srcX || z !== srcZ) {
            if (next !== dir) {
                dir = next;
                this.routeX[length] = x;
                this.routeZ[length++] = z;
            }

            if ((next & DirectionFlag.EAST) !== 0) {
                x++;
            } else if ((next & DirectionFlag.WEST) !== 0) {
                x--;
            }

            if ((next & DirectionFlag.NORTH) !== 0) {
                z++;
            } else if ((next & DirectionFlag.SOUTH) !== 0) {
                z--;
            }

            next = this.dirMap[CollisionMap.index(x, z)];
        }

        if (length > 0) {
            bufferSize = Math.min(length, 25); // max number of turns in a single pf request
            length--;

            const startX: number = this.routeX[length];
            const startZ: number = this.routeZ[length];

            if (type === 0) {
                this.out.p1Enc(ClientProt.MOVE_GAMECLICK);
                this.out.p1(bufferSize + bufferSize + 3);
            } else if (type === 1) {
                this.out.p1Enc(ClientProt.MOVE_MINIMAPCLICK);
                this.out.p1(bufferSize + bufferSize + 3 + 14);
            } else if (type === 2) {
                this.out.p1Enc(ClientProt.MOVE_OPCLICK);
                this.out.p1(bufferSize + bufferSize + 3);
            }

            // Always run (previously: this.keyHeld[5] === 1)
            this.out.p1(1);

            this.out.p2(startX + this.mapBuildBaseX);
            this.out.p2(startZ + this.mapBuildBaseZ);

            this.minimapFlagX = this.routeX[0];
            this.minimapFlagZ = this.routeZ[0];

            for (let i: number = 1; i < bufferSize; i++) {
                length--;
                this.out.p1(this.routeX[length] - startX);
                this.out.p1(this.routeZ[length] - startZ);
            }

            return true;
        }

        return type !== 1;
    }

    private async tcpIn(): Promise<boolean> {
        if (!this.stream) {
            return false;
        }

        try {
            let available: number = this.stream.available;
            if (available === 0) {
                return false;
            }

            if (this.ptype === -1) {
                await this.stream.readBytes(this.in.data, 0, 1);
                this.ptype = this.in.data[0] & 0xff;
                if (this.randomIn) {
                    this.ptype = (this.ptype - this.randomIn.nextInt) & 0xff;
                }
                this.psize = ServerProtSizes[this.ptype];
                available--;
            }

            if (this.psize === -1) {
                if (available <= 0) {
                    return false;
                }

                await this.stream.readBytes(this.in.data, 0, 1);
                this.psize = this.in.data[0] & 0xff;
                available--;
            }

            if (this.psize === -2) {
                if (available <= 1) {
                    return false;
                }

                await this.stream.readBytes(this.in.data, 0, 2);
                this.in.pos = 0;
                this.psize = this.in.g2();
                available -= 2;
            }

            if (available < this.psize) {
                return false;
            }

            this.in.pos = 0;
            await this.stream.readBytes(this.in.data, 0, this.psize);

            this.timeoutTimer = performance.now();
            this.ptype2 = this.ptype1;
            this.ptype1 = this.ptype0;
            this.ptype0 = this.ptype;

            if (this.ptype === ServerProt.IF_OPENCHAT) {
                const comId: number = this.in.g2();
                this.ifAnimReset(comId);

                if (this.sideModalId !== -1) {
                    this.sideModalId = -1;
                    this.redrawSide = true;
                    this.redrawIcons = true;
                }

                this.chatModalId = comId;
                this.redrawChat = true;
                this.mainModalId = -1;
                this.resumedPauseButton = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_OPENMAIN_SIDE) {
                const mainComId: number = this.in.g2();
                const sideComId: number = this.in.g2();

                if (this.chatModalId !== -1) {
                    this.chatModalId = -1;
                    this.redrawChat = true;
                }

                if (this.dialogInputOpen) {
                    this.dialogInputOpen = false;
                    this.redrawChat = true;
                }

                this.mainModalId = mainComId;
                this.sideModalId = sideComId;
                this.redrawSide = true;
                this.redrawIcons = true;
                this.resumedPauseButton = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_CLOSE) {
                if (this.sideModalId !== -1) {
                    this.sideModalId = -1;
                    this.redrawSide = true;
                    this.redrawIcons = true;
                }

                if (this.chatModalId !== -1) {
                    this.chatModalId = -1;
                    this.redrawChat = true;
                }

                if (this.dialogInputOpen) {
                    this.dialogInputOpen = false;
                    this.redrawChat = true;
                }

                this.mainModalId = -1;
                this.resumedPauseButton = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETICON) {
                let comId: number = this.in.g2();
                const icon: number = this.in.g1();
                if (comId === 65535) {
                    comId = -1;
                }
                this.sideIcon[icon] = comId;

                this.redrawSide = true;
                this.redrawIcons = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_OPENMAIN) {
                const comId: number = this.in.g2();
                this.ifAnimReset(comId);

                if (this.sideModalId !== -1) {
                    this.sideModalId = -1;
                    this.redrawSide = true;
                    this.redrawIcons = true;
                }

                if (this.chatModalId !== -1) {
                    this.chatModalId = -1;
                    this.redrawChat = true;
                }

                if (this.dialogInputOpen) {
                    this.dialogInputOpen = false;
                    this.redrawChat = true;
                }

                this.mainModalId = comId;
                this.resumedPauseButton = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_OPENSIDE) {
                const comId: number = this.in.g2();
                this.ifAnimReset(comId);

                if (this.chatModalId !== -1) {
                    this.chatModalId = -1;
                    this.redrawChat = true;
                }

                if (this.dialogInputOpen) {
                    this.dialogInputOpen = false;
                    this.redrawChat = true;
                }

                this.sideModalId = comId;
                this.redrawSide = true;
                this.redrawIcons = true;
                this.mainModalId = -1;
                this.resumedPauseButton = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SHOWICON) {
                this.activeIcon = this.in.g1();

                this.redrawSide = true;
                this.redrawIcons = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_OPENOVERLAY) {
                const comId: number = this.in.g2b();
                if (comId >= 0) {
                    this.ifAnimReset(comId);
                }
                this.mainOverlayId = comId;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETCOLOUR) {
                const comId: number = this.in.g2();
                const colour: number = this.in.g2();

                const r: number = (colour >> 10) & 0x1f;
                const g: number = (colour >> 5) & 0x1f;
                const b: number = colour & 0x1f;
                IfType.list[comId].colour = (r << 19) + (g << 11) + (b << 3);

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETHIDE) {
                const comId: number = this.in.g2();
                const hide = this.in.g1() === 1;

                IfType.list[comId].hide = hide;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETOBJECT) {
                const comId: number = this.in.g2();
                const objId: number = this.in.g2();
                const zoom: number = this.in.g2();

                const type: ObjType = ObjType.list(objId);
                IfType.list[comId].model1Type = 4;
                IfType.list[comId].model1Id = objId;
                IfType.list[comId].modelXAn = type.xan2d;
                IfType.list[comId].modelYAn = type.yan2d;
                IfType.list[comId].modelZoom = ((type.zoom2d * 100) / zoom) | 0;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETMODEL) {
                const comId: number = this.in.g2();
                const modelId: number = this.in.g2();

                IfType.list[comId].model1Type = 1;
                IfType.list[comId].model1Id = modelId;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETANIM) {
                const comId: number = this.in.g2();
                const seqId: number = this.in.g2b();

                const com: IfType = IfType.list[comId];
                com.modelAnim = seqId;
                if (seqId === -1) {
                    com.animFrame = 0;
                    com.animCycle = 0;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETPLAYERHEAD) {
                const comId = this.in.g2();

                if (this.localPlayer) {
                    IfType.list[comId].model1Type = 3;
                    IfType.list[comId].model1Id = (this.localPlayer.appearance[8] << 6) + (this.localPlayer.appearance[0] << 12) + (this.localPlayer.colour[0] << 24) + (this.localPlayer.colour[4] << 18) + this.localPlayer.appearance[11];
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETTEXT) {
                const comId: number = this.in.g2();
                const text = this.in.gjstr();

                IfType.list[comId].text = text;

                if (IfType.list[comId].layerId === this.sideIcon[this.activeIcon]) {
                    this.redrawSide = true;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETNPCHEAD) {
                const comId: number = this.in.g2();
                const npcId: number = this.in.g2();

                IfType.list[comId].model1Type = 2;
                IfType.list[comId].model1Id = npcId;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETPOSITION) {
                const comId: number = this.in.g2();
                const x: number = this.in.g2b();
                const y: number = this.in.g2b();

                const com: IfType = IfType.list[comId];
                com.x = x;
                com.y = y;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETSCROLLPOS) {
                const comId: number = this.in.g2();
                let pos: number = this.in.g2();

                const com = IfType.list[comId];
                if (typeof com !== 'undefined' && com.type === ComponentType.TYPE_LAYER) {
                    if (pos < 0) {
                        pos = 0;
                    }

                    if (pos > com.scrollHeight - com.height) {
                        pos = com.scrollHeight - com.height;
                    }

                    com.scrollPos = pos;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.TUT_FLASH) {
                this.tutFlashIcon = this.in.g1();

                if (this.tutFlashIcon === this.activeIcon) {
                    if (this.tutFlashIcon === 3) {
                        this.activeIcon = 1;
                    } else {
                        this.activeIcon = 3;
                    }

                    this.redrawSide = true;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.TUT_OPEN) {
                this.tutComId = this.in.g2b();
                this.redrawChat = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_INV_STOP_TRANSMIT) {
                const comId = this.in.g2();
                const inv: IfType = IfType.list[comId];

                if (!inv.linkObjType || !inv.linkObjNumber) {
                    throw new Error();
                }

                for (let i: number = 0; i < inv.linkObjType.length; i++) {
                    // [sic] redundant assignment
                    inv.linkObjType[i] = -1;
                    inv.linkObjType[i] = 0;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_INV_FULL) {
                this.redrawSide = true;

                const comId: number = this.in.g2();
                const inv: IfType = IfType.list[comId];

                if (!inv.linkObjType || !inv.linkObjNumber) {
                    throw new Error();
                }

                const size: number = this.in.g1();
                for (let i: number = 0; i < size; i++) {
                    inv.linkObjType[i] = this.in.g2();

                    let count: number = this.in.g1();
                    if (count === 255) {
                        count = this.in.g4();
                    }

                    inv.linkObjNumber[i] = count;
                }

                for (let i: number = size; i < inv.linkObjType.length; i++) {
                    inv.linkObjType[i] = 0;
                    inv.linkObjNumber[i] = 0;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_INV_PARTIAL) {
                this.redrawSide = true;

                const comId: number = this.in.g2();
                const inv: IfType = IfType.list[comId];

                if (!inv.linkObjType || !inv.linkObjNumber) {
                    throw new Error();
                }

                while (this.in.pos < this.psize) {
                    const slot: number = this.in.g1();
                    const id: number = this.in.g2();

                    let count: number = this.in.g1();
                    if (count === 255) {
                        count = this.in.g4();
                    }

                    if (slot >= 0 && slot < inv.linkObjType.length) {
                        inv.linkObjType[slot] = id;
                        inv.linkObjNumber[slot] = count;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_LOOKAT) {
                this.cinemaCam = true;

                this.camLookAtLx = this.in.g1();
                this.camLookAtLz = this.in.g1();
                this.camLookAtHei = this.in.g2();
                this.camLookAtRate = this.in.g1();
                this.camLookAtRate2 = this.in.g1();

                if (this.camLookAtRate2 >= 100) {
                    const sceneX: number = this.camLookAtLx * 128 + 64;
                    const sceneZ: number = this.camLookAtLz * 128 + 64;
                    const sceneY: number = this.getAvH(sceneX, sceneZ, this.minusedlevel) - this.camLookAtHei;

                    const deltaX: number = sceneX - this.camX;
                    const deltaY: number = sceneY - this.camY;
                    const deltaZ: number = sceneZ - this.camZ;

                    const distance: number = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ) | 0;

                    this.camPitch = ((Math.atan2(deltaY, distance) * 325.949) | 0) & 0x7ff;
                    this.camYaw = ((Math.atan2(deltaX, deltaZ) * -325.949) | 0) & 0x7ff;

                    if (this.camPitch < 128) {
                        this.camPitch = 128;
                    } else if (this.camPitch > 383) {
                        this.camPitch = 383;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_SHAKE) {
                const axis: number = this.in.g1();
                const ran: number = this.in.g1();
                const amp: number = this.in.g1();
                const rate: number = this.in.g1();

                this.camShake[axis] = true;
                this.camShakeAxis[axis] = ran;
                this.camShakeRan[axis] = amp;
                this.camShakeAmp[axis] = rate;
                this.camShakeCycle[axis] = 0;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_MOVETO) {
                this.cinemaCam = true;

                this.camMoveToLx = this.in.g1();
                this.camMoveToLz = this.in.g1();
                this.camMoveToHei = this.in.g2();
                this.camMoveToRate = this.in.g1();
                this.camMoveToRate2 = this.in.g1();

                if (this.camMoveToRate2 >= 100) {
                    this.camX = this.camMoveToLx * 128 + 64;
                    this.camZ = this.camMoveToLz * 128 + 64;
                    this.camY = this.getAvH(this.camX, this.camZ, this.minusedlevel) - this.camMoveToHei;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_RESET) {
                this.cinemaCam = false;

                for (let i: number = 0; i < 5; i++) {
                    this.camShake[i] = false;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.NPC_INFO) {
                this.getNpcPos(this.in, this.psize);

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.PLAYER_INFO) {
                // Measure real server tick interval for adaptive movement speed
                const now: number = performance.now();
                if (this.lastTickTime > 0) {
                    const interval: number = now - this.lastTickTime;
                    this.measuredTickInterval = this.measuredTickInterval * 0.8 + interval * 0.2;
                    this.tickSpeedMultiplier = Math.max(1, 420 / this.measuredTickInterval);
                }
                this.lastTickTime = now;

                // Notify SDK of game tick (PLAYER_INFO arrives once per server tick)
                if (this.onGameTickCallback) {
                    this.onGameTickCallback();
                }

                this.getPlayerPos(this.in, this.psize);
                this.awaitingPlayerInfo = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MESSAGE_GAME) {
                const message: string = this.in.gjstr();

                if (message.endsWith(':tradereq:')) {
                    const player: string = message.substring(0, message.indexOf(':'));
                    const username = JString.toUserhash(player);

                    let ignored: boolean = false;
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreUserhash[i] === username) {
                            ignored = true;
                            break;
                        }
                    }

                    if (!ignored && this.chatDisabled === 0) {
                        this.addChat(4, 'wishes to trade with you.', player);
                    }
                } else if (message.endsWith(':duelreq:')) {
                    const player: string = message.substring(0, message.indexOf(':'));
                    const username = JString.toUserhash(player);

                    let ignored: boolean = false;
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreUserhash[i] === username) {
                            ignored = true;
                            break;
                        }
                    }

                    if (!ignored && this.chatDisabled === 0) {
                        this.addChat(8, 'wishes to duel with you.', player);
                    }
                } else {
                    this.addChat(0, message, '');
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_IGNORELIST) {
                this.ignoreCount = (this.psize / 8) | 0;
                for (let i: number = 0; i < this.ignoreCount; i++) {
                    this.ignoreUserhash[i] = this.in.g8();
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CHAT_FILTER_SETTINGS) {
                this.chatPublicMode = this.in.g1();
                this.chatPrivateMode = this.in.g1();
                this.chatTradeMode = this.in.g1();

                this.redrawChatMode = true;
                this.redrawChat = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MESSAGE_PRIVATE) {
                const from: bigint = this.in.g8();
                const messageId: number = this.in.g4();
                const staffModLevel: number = this.in.g1();

                let ignored: boolean = false;
                for (let i: number = 0; i < 100; i++) {
                    if (this.privateMessageIds[i] === messageId) {
                        ignored = true;
                        break;
                    }
                }

                if (staffModLevel <= 1) {
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreUserhash[i] === from) {
                            ignored = true;
                            break;
                        }
                    }
                }

                if (!ignored && this.chatDisabled === 0) {
                    try {
                        this.privateMessageIds[this.privateMessageCount] = messageId;
                        this.privateMessageCount = (this.privateMessageCount + 1) % 100;

                        const uncompressed: string = WordPack.unpack(this.in, this.psize - 13);
                        const filtered: string = WordFilter.filter(uncompressed);

                        if (staffModLevel === 2 || staffModLevel === 3) {
                            this.addChat(7, filtered, '@cr2@' + JString.toScreenName(JString.toRawUsername(from)));
                        } else if (staffModLevel === 1) {
                            this.addChat(7, filtered, '@cr1@' + JString.toScreenName(JString.toRawUsername(from)));
                        } else {
                            this.addChat(3, filtered, JString.toScreenName(JString.toRawUsername(from)));
                        }
                    } catch (_e) {
                        // signlink.reporterror('cde1'); TODO?
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.FRIENDLIST_LOADED) {
                this.friendServerStatus = this.in.g1();
                this.redrawSide = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_FRIENDLIST) {
                const username: bigint = this.in.g8();
                const world: number = this.in.g1();

                let displayName: string | null = JString.toScreenName(JString.toRawUsername(username));
                for (let i: number = 0; i < this.friendCount; i++) {
                    if (username === this.friendUserhash[i]) {
                        if (this.friendNodeId[i] !== world) {
                            this.friendNodeId[i] = world;
                            this.redrawSide = true;
                            if (world > 0) {
                                this.addChat(5, displayName + ' has logged in.', '');
                            }
                            if (world === 0) {
                                this.addChat(5, displayName + ' has logged out.', '');
                            }
                        }

                        displayName = null;
                        break;
                    }
                }

                if (displayName && this.friendCount < 200) {
                    this.friendUserhash[this.friendCount] = username;
                    this.friendUsername[this.friendCount] = displayName;
                    this.friendNodeId[this.friendCount] = world;
                    this.friendCount++;
                    this.redrawSide = true;
                }

                let sorted: boolean = false;
                while (!sorted) {
                    sorted = true;

                    for (let i: number = 0; i < this.friendCount - 1; i++) {
                        if ((this.friendNodeId[i] !== Client.nodeId && this.friendNodeId[i + 1] === Client.nodeId) || (this.friendNodeId[i] === 0 && this.friendNodeId[i + 1] !== 0)) {
                            const oldWorld: number = this.friendNodeId[i];
                            this.friendNodeId[i] = this.friendNodeId[i + 1];
                            this.friendNodeId[i + 1] = oldWorld;

                            const oldName: string | null = this.friendUsername[i];
                            this.friendUsername[i] = this.friendUsername[i + 1];
                            this.friendUsername[i + 1] = oldName;

                            const oldUserhash: bigint = this.friendUserhash[i];
                            this.friendUserhash[i] = this.friendUserhash[i + 1];
                            this.friendUserhash[i + 1] = oldUserhash;
                            this.redrawSide = true;
                            sorted = false;
                        }
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UNSET_MAP_FLAG) {
                this.minimapFlagX = 0;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_RUNWEIGHT) {
                if (this.activeIcon === 12) {
                    this.redrawSide = true;
                }

                this.runweight = this.in.g2b();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.HINT_ARROW) {
                this.hintType = this.in.g1();

                if (this.hintType === 1) {
                    this.hintNpc = this.in.g2();
                }

                if (this.hintType >= 2 && this.hintType <= 6) {
                    if (this.hintType === 2) {
                        this.hintOffsetX = 64;
                        this.hintOffsetZ = 64;
                    } else if (this.hintType === 3) {
                        this.hintOffsetX = 0;
                        this.hintOffsetZ = 64;
                    } else if (this.hintType === 4) {
                        this.hintOffsetX = 128;
                        this.hintOffsetZ = 64;
                    } else if (this.hintType === 5) {
                        this.hintOffsetX = 64;
                        this.hintOffsetZ = 0;
                    } else if (this.hintType === 6) {
                        this.hintOffsetX = 64;
                        this.hintOffsetZ = 128;
                    }

                    this.hintType = 2;
                    this.hintTileX = this.in.g2();
                    this.hintTileZ = this.in.g2();
                    this.hintHeight = this.in.g1();
                }

                if (this.hintType === 10) {
                    this.hintPlayer = this.in.g2();
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_REBOOT_TIMER) {
                this.rebootTimer = this.in.g2() * 30;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_STAT) {
                this.redrawSide = true;

                const stat: number = this.in.g1();
                const xp: number = this.in.g4();
                const level: number = this.in.g1();

                this.statXP[stat] = xp;
                this.statEffectiveLevel[stat] = level;
                this.statBaseLevel[stat] = 1;

                for (let i: number = 0; i < 98; i++) {
                    if (xp >= Client.levelExperience[i]) {
                        this.statBaseLevel[stat] = i + 2;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_RUNENERGY) {
                if (this.activeIcon === 12) {
                    this.redrawSide = true;
                }

                this.runenergy = this.in.g1();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.RESET_ANIMS) {
                for (let i: number = 0; i < this.players.length; i++) {
                    const player: ClientPlayer | null = this.players[i];
                    if (!player) {
                        continue;
                    }

                    player.primaryAnim = -1;
                }

                for (let i: number = 0; i < this.npc.length; i++) {
                    const npc: ClientNpc | null = this.npc[i];
                    if (!npc) {
                        continue;
                    }

                    npc.primaryAnim = -1;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_PID) {
                this.selfSlot = this.in.g2();
                this.membersAccount = this.in.g1();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.LAST_LOGIN_INFO) {
                this.lastAddress = this.in.g4();
                this.daysSinceLastLogin = this.in.g2();
                this.daysSinceRecoveriesChanged = this.in.g1();
                this.unreadMessages = this.in.g2();
                this.warnMembersInNonMembers = this.in.g1();

                if (this.lastAddress !== 0 && this.mainModalId === -1) {
                    // custom: we don't have access to the user's DNS resolver in a browser, but we can use DNS over HTTPS (DoH)
                    this.dnsReq = null;
                    let ipStr = JString.formatIPv4(this.lastAddress);
                    if (!ipStr.startsWith('127.')) {
                        // we're using localhost as a privacy flag for now
                        reverseDnsLookup(ipStr).then(results => {
                            this.dnsReq = results[0];
                        });
                    }

                    this.closeModal();

                    let contentType: number = 650;
                    if (this.daysSinceRecoveriesChanged !== 201 || this.warnMembersInNonMembers == 1) {
                        contentType = 655;
                    }

                    this.reportAbuseInput = '';
                    this.reportAbuseMuteOption = false;

                    for (let i: number = 0; i < IfType.list.length; i++) {
                        if (IfType.list[i] && IfType.list[i].clientCode === contentType) {
                            this.mainModalId = IfType.list[i].layerId;
                            break;
                        }
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.LOGOUT) {
                console.warn('[LOGOUT DEBUG] Received ServerProt.LOGOUT packet from server');
                await this.logout();

                this.ptype = -1;
                return false;
            }

            if (this.ptype === ServerProt.P_COUNTDIALOG) {
                this.socialInputOpen = false;
                this.dialogInputOpen = true;
                this.dialogInput = '';
                this.redrawChat = true;

                if (this.isMobile) {
                    MobileKeyboard.show();
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.SET_MULTIWAY) {
                this.inMultizone = this.in.g1();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.SET_PLAYER_OP) {
                const index = this.in.g1();
                const priority = this.in.g1();
                let op: string | null = this.in.gjstr();

                if (index >= 1 && index <= 5) {
                    if (op.toLowerCase() === 'null') {
                        op = null;
                    }

                    this.playerOp[index - 1] = op;
                    this.playerOpPriority[index - 1] = priority === 0;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MINIMAP_TOGGLE) {
                this.minimapState = this.in.g1();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.REBUILD_NORMAL) {
                const zoneX: number = this.in.g2();
                const zoneZ: number = this.in.g2();

                if (this.mapBuildCentreZoneX === zoneX && this.mapBuildCentreZoneZ === zoneZ && this.sceneState === 2) {
                    this.ptype = -1;
                    return true;
                }

                this.mapBuildCentreZoneX = zoneX;
                this.mapBuildCentreZoneZ = zoneZ;
                this.mapBuildBaseX = (this.mapBuildCentreZoneX - 6) * 8;
                this.mapBuildBaseZ = (this.mapBuildCentreZoneZ - 6) * 8;

                this.withinTutorialIsland = false;
                if ((this.mapBuildCentreZoneX / 8 == 48 || this.mapBuildCentreZoneX / 8 == 49) && this.mapBuildCentreZoneZ / 8 == 48) {
                    this.withinTutorialIsland = true;
                } else if (this.mapBuildCentreZoneX / 8 == 48 && this.mapBuildCentreZoneZ / 8 == 148) {
                    this.withinTutorialIsland = true;
                }

                this.sceneState = 1;
                this.sceneLoadStartTime = performance.now();

                this.areaGame?.setPixels();
                this.p12?.centreString('Loading - please wait.', 257, 151, Colour.BLACK);
                this.p12?.centreString('Loading - please wait.', 256, 150, Colour.WHITE);
                this.areaGame?.draw(4, 4);

                let regions = 0;
                for (let x = ((this.mapBuildCentreZoneX - 6) / 8) | 0; x <= (((this.mapBuildCentreZoneX + 6) / 8) | 0); x++) {
                    for (let z = ((this.mapBuildCentreZoneZ - 6) / 8) | 0; z <= (((this.mapBuildCentreZoneZ + 6) / 8) | 0); z++) {
                        regions++;
                    }
                }

                this.mapBuildGroundData = new TypedArray1d(regions, null);
                this.mapBuildLocationData = new TypedArray1d(regions, null);
                this.mapBuildIndex = new Int32Array(regions);
                this.mapBuildGroundFile = new Array(regions);
                this.mapBuildLocationFile = new Array(regions);

                let mapCount = 0;
                for (let x = ((this.mapBuildCentreZoneX - 6) / 8) | 0; x <= (((this.mapBuildCentreZoneX + 6) / 8) | 0); x++) {
                    for (let z = ((this.mapBuildCentreZoneZ - 6) / 8) | 0; z <= (((this.mapBuildCentreZoneZ + 6) / 8) | 0); z++) {
                        this.mapBuildIndex[mapCount] = (x << 8) + z;

                        if (this.withinTutorialIsland && (z == 49 || z == 149 || z == 147 || x == 50 || (x == 49 && z == 47))) {
                            this.mapBuildGroundFile[mapCount] = -1;
                            this.mapBuildLocationFile[mapCount] = -1;
                            mapCount++;
                        } else if (this.onDemand) {
                            const landFile = (this.mapBuildGroundFile[mapCount] = this.onDemand.getMapFile(x, z, 0));
                            if (landFile != -1) {
                                this.onDemand.request(3, landFile);
                            }

                            const locFile = (this.mapBuildLocationFile[mapCount] = this.onDemand.getMapFile(x, z, 1));
                            if (locFile != -1) {
                                this.onDemand.request(3, locFile);
                            }

                            mapCount++;
                        }
                    }
                }

                const dx: number = this.mapBuildBaseX - this.mapBuildPrevBaseX;
                const dz: number = this.mapBuildBaseZ - this.mapBuildPrevBaseZ;
                this.mapBuildPrevBaseX = this.mapBuildBaseX;
                this.mapBuildPrevBaseZ = this.mapBuildBaseZ;

                for (let i: number = 0; i < 16384; i++) {
                    const npc: ClientNpc | null = this.npc[i];
                    if (npc) {
                        for (let j: number = 0; j < 10; j++) {
                            npc.routeX[j] -= dx;
                            npc.routeZ[j] -= dz;
                        }

                        npc.x -= dx * 128;
                        npc.z -= dz * 128;
                    }
                }

                for (let i: number = 0; i < MAX_PLAYER_COUNT; i++) {
                    const player: ClientPlayer | null = this.players[i];
                    if (player) {
                        for (let j: number = 0; j < 10; j++) {
                            player.routeX[j] -= dx;
                            player.routeZ[j] -= dz;
                        }

                        player.x -= dx * 128;
                        player.z -= dz * 128;
                    }
                }

                this.awaitingPlayerInfo = true;

                let startTileX: number = 0;
                let endTileX: number = BuildArea.SIZE;
                let dirX: number = 1;
                if (dx < 0) {
                    startTileX = BuildArea.SIZE - 1;
                    endTileX = -1;
                    dirX = -1;
                }

                let startTileZ: number = 0;
                let endTileZ: number = BuildArea.SIZE;
                let dirZ: number = 1;
                if (dz < 0) {
                    startTileZ = BuildArea.SIZE - 1;
                    endTileZ = -1;
                    dirZ = -1;
                }

                for (let x: number = startTileX; x !== endTileX; x += dirX) {
                    for (let z: number = startTileZ; z !== endTileZ; z += dirZ) {
                        const lastX: number = x + dx;
                        const lastZ: number = z + dz;

                        for (let level: number = 0; level < BuildArea.LEVELS; level++) {
                            if (lastX >= 0 && lastZ >= 0 && lastX < BuildArea.SIZE && lastZ < BuildArea.SIZE) {
                                this.groundObj[level][x][z] = this.groundObj[level][lastX][lastZ];
                            } else {
                                this.groundObj[level][x][z] = null;
                            }
                        }
                    }
                }

                for (let loc = this.locChanges.head(); loc !== null; loc = this.locChanges.next()) {
                    loc.x -= dx;
                    loc.z -= dz;

                    if (loc.x < 0 || loc.z < 0 || loc.x >= BuildArea.SIZE || loc.z >= BuildArea.SIZE) {
                        loc.unlink();
                    }
                }

                if (this.minimapFlagX !== 0) {
                    this.minimapFlagX -= dx;
                    this.minimapFlagZ -= dz;
                }

                this.cinemaCam = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.VARP_SMALL) {
                const varpId: number = this.in.g2();
                const value: number = this.in.g1b();

                this.varServ[varpId] = value;

                if (this.var[varpId] !== value) {
                    this.var[varpId] = value;
                    this.clientVar(varpId);

                    this.redrawSide = true;

                    if (this.tutComId !== -1) {
                        this.redrawChat = true;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.VARP_LARGE) {
                const varpId: number = this.in.g2();
                const value: number = this.in.g4();

                this.varServ[varpId] = value;

                if (this.var[varpId] !== value) {
                    this.var[varpId] = value;
                    this.clientVar(varpId);

                    this.redrawSide = true;

                    if (this.tutComId !== -1) {
                        this.redrawChat = true;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.VARP_SYNC) {
                // "Resetting variables to authoritative set"
                for (let i: number = 0; i < this.var.length; i++) {
                    if (this.var[i] !== this.varServ[i]) {
                        this.var[i] = this.varServ[i];
                        this.clientVar(i);

                        this.redrawSide = true;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.SYNTH_SOUND) {
                const soundId: number = this.in.g2();
                const loops: number = this.in.g1();
                const delay: number = this.in.g2();

                if (this.waveEnabled && !Client.lowMem && this.waveCount < 50) {
                    this.waveIds[this.waveCount] = soundId;
                    this.waveLoops[this.waveCount] = loops;
                    this.waveDelay[this.waveCount] = delay + JagFX.delays[soundId];
                    this.waveCount++;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MIDI_SONG) {
                let songId: number = this.in.g2();
                if (songId == 65535) {
                    songId = -1;
                }

                if (this.nextMidiSong != songId && this.midiActive && !Client.lowMem && this.nextMusicDelay === 0) {
                    this.midiSong = songId;
                    this.midiFading = true;
                    this.onDemand?.request(2, this.midiSong);
                }

                this.nextMidiSong = songId;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MIDI_JINGLE) {
                const jingleId: number = this.in.g2();
                const delay: number = this.in.g2();

                if (this.midiActive && !Client.lowMem) {
                    this.midiSong = jingleId;
                    this.midiFading = false;
                    this.onDemand?.request(2, this.midiSong);
                    this.nextMusicDelay = delay;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS) {
                this.zoneUpdateX = this.in.g1();
                this.zoneUpdateZ = this.in.g1();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_ZONE_FULL_FOLLOWS) {
                this.zoneUpdateX = this.in.g1();
                this.zoneUpdateZ = this.in.g1();

                for (let x: number = this.zoneUpdateX; x < this.zoneUpdateX + 8; x++) {
                    for (let z: number = this.zoneUpdateZ; z < this.zoneUpdateZ + 8; z++) {
                        if (this.groundObj[this.minusedlevel][x][z]) {
                            this.groundObj[this.minusedlevel][x][z] = null;
                            this.showObject(x, z);
                        }
                    }
                }

                for (let loc = this.locChanges.head(); loc !== null; loc = this.locChanges.next()) {
                    if (loc.x >= this.zoneUpdateX && loc.x < this.zoneUpdateX + 8 && loc.z >= this.zoneUpdateZ && loc.z < this.zoneUpdateZ + 8 && loc.level === this.minusedlevel) {
                        loc.endTime = 0;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED) {
                this.zoneUpdateX = this.in.g1();
                this.zoneUpdateZ = this.in.g1();

                while (this.in.pos < this.psize) {
                    const opcode: number = this.in.g1();
                    this.zonePacket(this.in, opcode);
                }

                this.ptype = -1;
                return true;
            }

            if (
                this.ptype === ServerProt.OBJ_COUNT ||
                this.ptype === ServerProt.P_LOCMERGE ||
                this.ptype === ServerProt.OBJ_REVEAL ||
                this.ptype === ServerProt.MAP_ANIM ||
                this.ptype === ServerProt.MAP_PROJANIM ||
                this.ptype === ServerProt.OBJ_DEL ||
                this.ptype === ServerProt.OBJ_ADD ||
                this.ptype === ServerProt.LOC_ANIM ||
                this.ptype === ServerProt.LOC_DEL ||
                this.ptype === ServerProt.LOC_ADD_CHANGE
            ) {
                this.zonePacket(this.in, this.ptype);

                this.ptype = -1;
                return true;
            }

            // (java tries to report this to the world)
            console.error(`T1 - ${this.ptype},${this.psize} - ${this.ptype1},${this.ptype2}`);
            console.warn('[LOGOUT DEBUG] T1 packet parse error - unknown packet type, logging out');
            await this.logout();
        } catch (e) {
            if (e instanceof WebSocket && e.readyState === 3) {
                // IO error
                await this.lostCon();
            } else {
                // logic error
                console.error(e);

                let str = `T2 - ${this.ptype},${this.psize} - ${this.ptype1},${this.ptype2} - ${this.psize},${(this.localPlayer?.routeX[0] ?? 0) + this.mapBuildBaseX},${(this.localPlayer?.routeZ[0] ?? 0) + this.mapBuildBaseZ} -`;
                for (let i = 0; i < this.psize && i < 50; i++) {
                    str += this.in.data[i] + ',';
                }
                // (java tries to report this to the world)
                console.error(str);
                console.warn('[LOGOUT DEBUG] T2 packet exception - error during packet processing, logging out');
                await this.logout();
            }
        }

        return true;
    }

    private zonePacket(buf: Packet, opcode: number): void {
        const pos: number = buf.g1();
        let x: number = this.zoneUpdateX + ((pos >> 4) & 0x7);
        let z: number = this.zoneUpdateZ + (pos & 0x7);

        if (opcode === ServerProt.LOC_ADD_CHANGE) {
            const info: number = buf.g1();
            const id: number = buf.g2();

            const shape: number = info >> 2;
            const rotate: number = info & 0x3;
            const layer: number = LOC_SHAPE_TO_LAYER[shape];

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE) {
                this.locChangeCreate(this.minusedlevel, x, z, layer, id, shape, rotate, 0, -1);
            }
        } else if (opcode === ServerProt.LOC_DEL) {
            const info: number = buf.g1();

            const shape: number = info >> 2;
            const rotate: number = info & 0x3;
            const layer: number = LOC_SHAPE_TO_LAYER[shape];

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE) {
                this.locChangeCreate(this.minusedlevel, x, z, layer, -1, shape, rotate, 0, -1);
            }
        } else if (opcode === ServerProt.LOC_ANIM) {
            const info: number = buf.g1();
            const seq: number = buf.g2();

            let shape: number = info >> 2;
            const rotate = info & 0x3;
            const layer: number = LOC_SHAPE_TO_LAYER[shape];

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE && this.world && this.groundh) {
                const heightSW = this.groundh[this.minusedlevel][x][z];
                const heightSE = this.groundh[this.minusedlevel][x + 1][z];
                const heightNE = this.groundh[this.minusedlevel][x + 1][z + 1];
                const heightNW = this.groundh[this.minusedlevel][x][z + 1];

                if (layer == 0) {
                    const wall = this.world.getWall(this.minusedlevel, x, z);
                    if (wall) {
                        const locId = (wall.typecode >> 14) & 0x7fff;
                        if (shape == 2) {
                            wall.model1 = new ClientLocAnim(locId, 2, rotate + 4, heightSW, heightSE, heightNE, heightNW, seq, false);
                            wall.model2 = new ClientLocAnim(locId, 2, (rotate + 1) & 0x3, heightSW, heightSE, heightNE, heightNW, seq, false);
                        } else {
                            wall.model1 = new ClientLocAnim(locId, shape, rotate, heightSW, heightSE, heightNE, heightNW, seq, false);
                        }
                    }
                } else if (layer == 1) {
                    const decor = this.world.getDecor(this.minusedlevel, z, x);
                    if (decor) {
                        decor.model = new ClientLocAnim((decor.typecode >> 14) & 0x7fff, 4, 0, heightSW, heightNE, heightNE, heightNW, seq, false);
                    }
                } else if (layer == 2) {
                    const sprite = this.world.getScene(this.minusedlevel, x, z);
                    if (shape == 11) {
                        shape = 10;
                    }

                    if (sprite) {
                        sprite.model = new ClientLocAnim((sprite.typecode >> 14) & 0x7fff, shape, rotate, heightSW, heightSE, heightNE, heightNW, seq, false);
                    }
                } else if (layer == 3) {
                    const decor = this.world.getGd(this.minusedlevel, x, z);
                    if (decor) {
                        decor.model = new ClientLocAnim((decor.typecode >> 14) & 0x7fff, 22, rotate, heightSW, heightSE, heightNE, heightNW, seq, false);
                    }
                }
            }
        } else if (opcode === ServerProt.OBJ_ADD) {
            const type: number = buf.g2();
            const count: number = buf.g2();

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE) {
                const obj: ClientObj = new ClientObj(type, count);
                if (!this.groundObj[this.minusedlevel][x][z]) {
                    this.groundObj[this.minusedlevel][x][z] = new LinkList();
                }

                this.groundObj[this.minusedlevel][x][z]?.push(obj);
                this.showObject(x, z);
            }
        } else if (opcode === ServerProt.OBJ_DEL) {
            const type: number = buf.g2();

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE) {
                const objs = this.groundObj[this.minusedlevel][x][z];
                if (objs) {
                    for (let obj = objs.head(); obj !== null; obj = objs.next()) {
                        if (obj.id === (type & 0x7fff)) {
                            obj.unlink();
                            break;
                        }
                    }

                    if (objs.head() === null) {
                        this.groundObj[this.minusedlevel][x][z] = null;
                    }

                    this.showObject(x, z);
                }
            }
        } else if (opcode === ServerProt.MAP_PROJANIM) {
            let x2: number = x + buf.g1b();
            let z2: number = z + buf.g1b();
            const targetEntity: number = buf.g2b();
            const spotanim: number = buf.g2();
            const h1: number = buf.g1() * 4;
            const h2: number = buf.g1() * 4;
            const t1: number = buf.g2();
            const t2: number = buf.g2();
            const angle: number = buf.g1();
            const startpos: number = buf.g1();

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE && x2 >= 0 && z2 >= 0 && x2 < BuildArea.SIZE && z2 < BuildArea.SIZE) {
                x = x * 128 + 64;
                z = z * 128 + 64;
                x2 = x2 * 128 + 64;
                z2 = z2 * 128 + 64;

                const proj: ClientProj = new ClientProj(spotanim, this.minusedlevel, x, this.getAvH(x, z, this.minusedlevel) - h1, z, t1 + Client.loopCycle, t2 + Client.loopCycle, angle, startpos, targetEntity, h2);
                proj.setTarget(x2, this.getAvH(x2, z2, this.minusedlevel) - h2, z2, t1 + Client.loopCycle);
                this.projectiles.push(proj);
            }
        } else if (opcode === ServerProt.MAP_ANIM) {
            const spotanim: number = buf.g2();
            const height: number = buf.g1();
            const time: number = buf.g2();

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE) {
                x = x * 128 + 64;
                z = z * 128 + 64;

                const spot: MapSpotAnim = new MapSpotAnim(spotanim, this.minusedlevel, x, z, this.getAvH(x, z, this.minusedlevel) - height, Client.loopCycle, time);
                this.spotanims.push(spot);
            }
        } else if (opcode === ServerProt.OBJ_REVEAL) {
            const id: number = buf.g2();
            const count: number = buf.g2();
            const pid: number = buf.g2();

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE && pid !== this.selfSlot) {
                if (!this.groundObj[this.minusedlevel][x][z]) {
                    this.groundObj[this.minusedlevel][x][z] = new LinkList();
                }

                const obj: ClientObj = new ClientObj(id, count);
                this.groundObj[this.minusedlevel][x][z]?.push(obj);
                this.showObject(x, z);
            }
        } else if (opcode === ServerProt.P_LOCMERGE) {
            const info: number = buf.g1();
            const shape: number = info >> 2;
            const rotate: number = info & 0x3;
            const layer: number = LOC_SHAPE_TO_LAYER[shape];

            const id: number = buf.g2();
            const t1: number = buf.g2();
            const t2: number = buf.g2();
            const pid: number = buf.g2();
            let east: number = buf.g1b();
            let south: number = buf.g1b();
            let west: number = buf.g1b();
            let north: number = buf.g1b();

            let player: ClientPlayer | null;
            if (pid === this.selfSlot) {
                player = this.localPlayer;
            } else {
                player = this.players[pid];
            }

            if (player && this.groundh) {
                const loc: LocType = LocType.list(id);

                const heightSW: number = this.groundh[this.minusedlevel][x][z];
                const heightSE: number = this.groundh[this.minusedlevel][x + 1][z];
                const heightNE: number = this.groundh[this.minusedlevel][x + 1][z + 1];
                const heightNW: number = this.groundh[this.minusedlevel][x][z + 1];

                const model = loc.getModel(shape, rotate, heightSW, heightSE, heightNE, heightNW, -1);
                if (model) {
                    this.locChangeCreate(this.minusedlevel, x, z, layer, -1, 0, 0, t1 + 1, t2 + 1);

                    player.locStartCycle = t1 + Client.loopCycle;
                    player.locStopCycle = t2 + Client.loopCycle;
                    player.locModel = model;

                    let width: number = loc.width;
                    let height: number = loc.length;
                    if (rotate === LocAngle.NORTH || rotate === LocAngle.SOUTH) {
                        width = loc.length;
                        height = loc.width;
                    }

                    player.locOffsetX = x * 128 + width * 64;
                    player.locOffsetZ = z * 128 + height * 64;
                    player.locOffsetY = this.getAvH(player.locOffsetX, player.locOffsetZ, this.minusedlevel);

                    let tmp: number;
                    if (east > west) {
                        tmp = east;
                        east = west;
                        west = tmp;
                    }

                    if (south > north) {
                        tmp = south;
                        south = north;
                        north = tmp;
                    }

                    player.minTileX = x + east;
                    player.maxTileX = x + west;
                    player.minTileZ = z + south;
                    player.maxTileZ = z + north;
                }
            }
        } else if (opcode === ServerProt.OBJ_COUNT) {
            const type: number = buf.g2();
            const ocount: number = buf.g2();
            const count: number = buf.g2();

            if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE) {
                const objs = this.groundObj[this.minusedlevel][x][z];
                if (objs) {
                    for (let obj = objs.head(); obj !== null; obj = objs.next()) {
                        if (obj.id === (type & 0x7fff) && obj.count === ocount) {
                            obj.count = count;
                            break;
                        }
                    }

                    this.showObject(x, z);
                }
            }
        }
    }

    private locChangeCreate(level: number, x: number, z: number, layer: number, type: number, shape: number, angle: number, startTime: number, endTime: number): void {
        let loc: LocChange | null = null;
        for (let next = this.locChanges.head(); next !== null; next = this.locChanges.next()) {
            if (next.level === this.minusedlevel && next.x === x && next.z === z && next.layer === layer) {
                loc = next;
                break;
            }
        }

        if (!loc) {
            loc = new LocChange();
            loc.level = level;
            loc.layer = layer;
            loc.x = x;
            loc.z = z;
            this.locChangeSetOld(loc);
            this.locChanges.push(loc);
        }

        loc.newType = type;
        loc.newShape = shape;
        loc.newAngle = angle;
        loc.startTime = startTime;
        loc.endTime = endTime;
    }

    private locChangePostBuildCorrect(): void {
        for (let loc = this.locChanges.head(); loc !== null; loc = this.locChanges.next()) {
            if (loc.endTime === -1) {
                loc.startTime = 0;
                this.locChangeSetOld(loc);
            } else {
                loc.unlink();
            }
        }
    }

    private locChangeSetOld(loc: LocChange): void {
        if (!this.world) {
            return;
        }

        let typecode: number = 0;
        let otherId: number = -1;
        let otherShape: number = 0;
        let otherAngle: number = 0;

        if (loc.layer === LocLayer.WALL) {
            typecode = this.world.wallType(loc.level, loc.x, loc.z);
        } else if (loc.layer === LocLayer.WALL_DECOR) {
            typecode = this.world.decorType(loc.level, loc.z, loc.x);
        } else if (loc.layer === LocLayer.GROUND) {
            typecode = this.world.sceneType(loc.level, loc.x, loc.z);
        } else if (loc.layer === LocLayer.GROUND_DECOR) {
            typecode = this.world.gdType(loc.level, loc.x, loc.z);
        }

        if (typecode !== 0) {
            const otherInfo: number = this.world.typeCode2(loc.level, loc.x, loc.z, typecode);
            otherId = (typecode >> 14) & 0x7fff;
            otherShape = otherInfo & 0x1f;
            otherAngle = otherInfo >> 6;
        }

        loc.oldType = otherId;
        loc.oldShape = otherShape;
        loc.oldAngle = otherAngle;
    }

    private locChangeDoQueue(): void {
        if (this.sceneState !== 2) {
            return;
        }

        for (let loc = this.locChanges.head(); loc !== null; loc = this.locChanges.next()) {
            if (loc.endTime > 0) {
                loc.endTime--;
            }

            if (loc.endTime != 0) {
                if (loc.startTime > 0) {
                    loc.startTime--;
                }

                if (loc.startTime === 0 && loc.x >= 1 && loc.z >= 1 && loc.x <= 102 && loc.z <= 102 && (loc.newType < 0 || ClientBuild.changeLocAvailable(loc.newType, loc.newShape))) {
                    this.locChangeUnchecked(loc.level, loc.layer, loc.x, loc.z, loc.newType, loc.newShape, loc.newAngle);
                    loc.startTime = -1;

                    if (loc.oldType === loc.newType && loc.oldType === -1) {
                        loc.unlink();
                    } else if (loc.oldType === loc.newType && loc.oldAngle === loc.newAngle && loc.oldShape === loc.newShape) {
                        loc.unlink();
                    }
                }
            } else if (loc.oldType < 0 || ClientBuild.changeLocAvailable(loc.oldType, loc.oldShape)) {
                this.locChangeUnchecked(loc.level, loc.layer, loc.x, loc.z, loc.oldType, loc.oldShape, loc.oldAngle);
                loc.unlink();
            }
        }
    }

    private locChangeUnchecked(level: number, layer: number, x: number, z: number, id: number, shape: number, angle: number): void {
        if (x < 1 || z < 1 || x > 102 || z > 102) {
            return;
        }

        if (Client.lowMem && level !== this.minusedlevel) {
            return;
        }

        if (!this.world) {
            return;
        }

        let typecode: number = 0;
        if (layer === LocLayer.WALL) {
            typecode = this.world.wallType(level, x, z);
        } else if (layer === LocLayer.WALL_DECOR) {
            typecode = this.world.decorType(level, z, x);
        } else if (layer === LocLayer.GROUND) {
            typecode = this.world.sceneType(level, x, z);
        } else if (layer === LocLayer.GROUND_DECOR) {
            typecode = this.world.gdType(level, x, z);
        }

        if (typecode !== 0) {
            const otherInfo: number = this.world.typeCode2(level, x, z, typecode);
            const otherId: number = (typecode >> 14) & 0x7fff;
            const otherShape: number = otherInfo & 0x1f;
            const otherAngle: number = otherInfo >> 6;

            if (layer === LocLayer.WALL) {
                this.world?.delWall(level, x, z);

                const type: LocType = LocType.list(otherId);
                if (type.blockwalk) {
                    this.collision[level]?.delWall(x, z, otherShape, otherAngle, type.blockrange);
                }
            } else if (layer === LocLayer.WALL_DECOR) {
                this.world?.delDecor(level, x, z);
            } else if (layer === LocLayer.GROUND) {
                this.world.delLoc(level, x, z);

                const type: LocType = LocType.list(otherId);
                if (x + type.width > BuildArea.SIZE - 1 || z + type.width > BuildArea.SIZE - 1 || x + type.length > BuildArea.SIZE - 1 || z + type.length > BuildArea.SIZE - 1) {
                    return;
                }

                if (type.blockwalk) {
                    this.collision[level]?.delLoc(x, z, type.width, type.length, otherAngle, type.blockrange);
                }
            } else if (layer === LocLayer.GROUND_DECOR) {
                this.world?.delGroundDecor(level, x, z);

                const type: LocType = LocType.list(otherId);
                if (type.blockwalk && type.active) {
                    this.collision[level]?.unblockGround(x, z);
                }
            }
        }

        if (id >= 0) {
            let tileLevel: number = level;
            if (this.mapl && level < 3 && (this.mapl[1][x][z] & MapFlag.LinkBelow) !== 0) {
                tileLevel = level + 1;
            }

            if (this.groundh) {
                ClientBuild.changeLocUnchecked(level, x, z, id, shape, angle, tileLevel, this.groundh, this.world, this.collision[level]);
            }
        }
    }

    private showObject(x: number, z: number): void {
        const objs = this.groundObj[this.minusedlevel][x][z];
        if (!objs) {
            this.world?.delObj(this.minusedlevel, x, z);
            return;
        }

        let topCost: number = -99999999;
        let topObj: ClientObj | null = null;

        for (let obj = objs.head(); obj !== null; obj = objs.next()) {
            const type: ObjType = ObjType.list(obj.id);
            let cost: number = type.cost;

            if (type.stackable) {
                cost *= obj.count + 1;
            }

            if (cost > topCost) {
                topCost = cost;
                topObj = obj;
            }
        }

        if (!topObj) {
            return; // custom
        }

        objs.pushFront(topObj);

        let bottomObj: ClientObj | null = null;
        let middleObj: ClientObj | null = null;
        for (let obj = objs.head(); obj !== null; obj = objs.next()) {
            if (obj.id !== topObj.id && bottomObj === null) {
                bottomObj = obj;
            }

            if (obj.id !== topObj.id && bottomObj && obj.id !== bottomObj.id && middleObj === null) {
                middleObj = obj;
            }
        }

        const typecode: number = (x + (z << 7) + 0x60000000) | 0;
        this.world?.setObj(x, z, this.getAvH(x * 128 + 64, z * 128 + 64, this.minusedlevel), this.minusedlevel, typecode, topObj, middleObj, bottomObj);
    }

    private getPlayerPos(buf: Packet, size: number): void {
        this.entityRemovalCount = 0;
        this.entityUpdateCount = 0;

        this.getPlayerPosLocal(buf, size);
        this.getPlayerPosOldVis(buf, size);
        this.getPlayerPosNewVis(buf, size);
        this.getPlayerPosExtended(buf, size);

        for (let i: number = 0; i < this.entityRemovalCount; i++) {
            const index: number = this.entityRemovalIds[i];
            const player: ClientPlayer | null = this.players[index];
            if (!player) {
                continue;
            }

            if (player.cycle !== Client.loopCycle) {
                this.players[index] = null;
            }
        }

        if (buf.pos !== size) {
            console.error(`Error packet size mismatch in getplayer pos:${buf.pos} psize:${size}`);
            throw new Error('eek');
        }

        for (let index: number = 0; index < this.playerCount; index++) {
            if (!this.players[this.playerIds[index]]) {
                console.error(`${this.loginUser} null entry in pl list - pos:${index} size:${this.playerCount}`);
                throw new Error('eek');
            }
        }
    }

    private getPlayerPosLocal(buf: Packet, _size: number): void {
        buf.gBitStart();

        const info: number = buf.gBit(1);
        if (info !== 0) {
            const op: number = buf.gBit(2);

            if (op === 0) {
                this.entityUpdateIds[this.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
            } else if (op === 1) {
                const walkDir: number = buf.gBit(3);
                this.localPlayer?.moveCode(false, walkDir);

                const extendedInfo: number = buf.gBit(1);
                if (extendedInfo === 1) {
                    this.entityUpdateIds[this.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
                }
            } else if (op === 2) {
                const walkDir: number = buf.gBit(3);
                this.localPlayer?.moveCode(true, walkDir);

                const runDir: number = buf.gBit(3);
                this.localPlayer?.moveCode(true, runDir);

                const extendedInfo: number = buf.gBit(1);
                if (extendedInfo === 1) {
                    this.entityUpdateIds[this.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
                }
            } else if (op === 3) {
                this.minusedlevel = buf.gBit(2);
                const localX: number = buf.gBit(7);
                const localZ: number = buf.gBit(7);
                const jump: number = buf.gBit(1);

                this.localPlayer?.teleport(jump === 1, localX, localZ);

                const extendedInfo: number = buf.gBit(1);
                if (extendedInfo === 1) {
                    this.entityUpdateIds[this.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
                }
            }
        }
    }

    private getPlayerPosOldVis(buf: Packet, _size: number): void {
        const count: number = buf.gBit(8);

        if (count < this.playerCount) {
            for (let i: number = count; i < this.playerCount; i++) {
                this.entityRemovalIds[this.entityRemovalCount++] = this.playerIds[i];
            }
        }

        if (count > this.playerCount) {
            console.error(`eek! ${this.loginUser} Too many players`);
            throw new Error();
        }

        this.playerCount = 0;
        for (let i: number = 0; i < count; i++) {
            const index: number = this.playerIds[i];
            const player: ClientPlayer | null = this.players[index];

            const info: number = buf.gBit(1);
            if (info === 0) {
                this.playerIds[this.playerCount++] = index;
                if (player) {
                    player.cycle = Client.loopCycle;
                }
            } else {
                const op: number = buf.gBit(2);

                if (op === 0) {
                    this.playerIds[this.playerCount++] = index;
                    if (player) {
                        player.cycle = Client.loopCycle;
                    }
                    this.entityUpdateIds[this.entityUpdateCount++] = index;
                } else if (op === 1) {
                    this.playerIds[this.playerCount++] = index;
                    if (player) {
                        player.cycle = Client.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    player?.moveCode(false, walkDir);

                    const extendedInfo: number = buf.gBit(1);
                    if (extendedInfo === 1) {
                        this.entityUpdateIds[this.entityUpdateCount++] = index;
                    }
                } else if (op === 2) {
                    this.playerIds[this.playerCount++] = index;
                    if (player) {
                        player.cycle = Client.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    player?.moveCode(true, walkDir);

                    const runDir: number = buf.gBit(3);
                    player?.moveCode(true, runDir);

                    const extendedInfo: number = buf.gBit(1);
                    if (extendedInfo === 1) {
                        this.entityUpdateIds[this.entityUpdateCount++] = index;
                    }
                } else if (op === 3) {
                    this.entityRemovalIds[this.entityRemovalCount++] = index;
                }
            }
        }
    }

    private getPlayerPosNewVis(buf: Packet, size: number): void {
        while (buf.bitPos + 10 < size * 8) {
            const index = buf.gBit(11);
            if (index === 2047) {
                break;
            }

            if (!this.players[index]) {
                this.players[index] = new ClientPlayer();

                const appearance: Packet | null = this.playerAppearanceBuffer[index];
                if (appearance) {
                    this.players[index]?.setAppearance(appearance);
                }
            }

            this.playerIds[this.playerCount++] = index;
            const player: ClientPlayer | null = this.players[index];
            if (player) {
                player.cycle = Client.loopCycle;
            }

            let dx: number = buf.gBit(5);
            if (dx > 15) {
                dx -= 32;
            }

            let dz: number = buf.gBit(5);
            if (dz > 15) {
                dz -= 32;
            }

            const jump: number = buf.gBit(1);

            if (this.localPlayer) {
                player?.teleport(jump === 1, this.localPlayer.routeX[0] + dx, this.localPlayer.routeZ[0] + dz);
            }

            const extendedInfo: number = buf.gBit(1);
            if (extendedInfo === 1) {
                this.entityUpdateIds[this.entityUpdateCount++] = index;
            }
        }

        buf.gBitEnd();
    }

    private getPlayerPosExtended(buf: Packet, _size: number): void {
        for (let i: number = 0; i < this.entityUpdateCount; i++) {
            const index: number = this.entityUpdateIds[i];
            const player: ClientPlayer | null = this.players[index];
            if (!player) {
                continue;
            }

            let mask: number = buf.g1();
            if ((mask & PlayerUpdate.BIG_UPDATE) !== 0) {
                mask += buf.g1() << 8;
            }

            this.getPlayerPosDecodeExtended(player, index, mask, buf);
        }
    }

    private getPlayerPosDecodeExtended(player: ClientPlayer, index: number, mask: number, buf: Packet): void {
        if ((mask & PlayerUpdate.APPEARANCE) !== 0) {
            const length: number = buf.g1();

            const data: Uint8Array = new Uint8Array(length);
            const appearance: Packet = new Packet(data);
            buf.gdata(length, 0, data);

            this.playerAppearanceBuffer[index] = appearance;
            player.setAppearance(appearance);
        }

        if ((mask & PlayerUpdate.ANIM) !== 0) {
            let seqId: number = buf.g2();
            if (seqId === 65535) {
                seqId = -1;
            }

            if (seqId === player.primaryAnim) {
                player.primaryAnimLoop = 0;
            }

            const delay: number = buf.g1();
            if (player.primaryAnim === seqId && seqId !== -1) {
                const restartMode = SeqType.list[seqId].duplicatebehaviour;

                if (restartMode == RestartMode.RESET) {
                    player.primaryAnimFrame = 0;
                    player.primaryAnimCycle = 0;
                    player.primaryAnimDelay = delay;
                    player.primaryAnimLoop = 0;
                } else if (restartMode == RestartMode.RESETLOOP) {
                    player.primaryAnimLoop = 0;
                }
            } else if (seqId === -1 || player.primaryAnim === -1 || SeqType.list[seqId].priority >= SeqType.list[player.primaryAnim].priority) {
                player.primaryAnim = seqId;
                player.primaryAnimFrame = 0;
                player.primaryAnimCycle = 0;
                player.primaryAnimDelay = delay;
                player.primaryAnimLoop = 0;
                player.preanimRouteLength = player.routeLength;
            }
        }

        if ((mask & PlayerUpdate.FACEENTITY) !== 0) {
            player.faceEntity = buf.g2();
            if (player.faceEntity === 65535) {
                player.faceEntity = -1;
            }
        }

        if ((mask & PlayerUpdate.SAY) !== 0) {
            player.chatMessage = buf.gjstr();
            player.chatColour = 0;
            player.chatEffect = 0;
            player.chatTimer = 150;

            if (player.name) {
                this.addChat(2, player.chatMessage, player.name);
            }
        }

        if ((mask & PlayerUpdate.HITMARK) !== 0) {
            const damage = buf.g1();
            const damageType = buf.g1();

            player.addHitmark(Client.loopCycle, damageType, damage);
            player.combatCycle = Client.loopCycle + 400;
            player.health = buf.g1();
            player.totalHealth = buf.g1();
        }

        if ((mask & PlayerUpdate.FACESQUARE) !== 0) {
            player.faceSquareX = buf.g2();
            player.faceSquareZ = buf.g2();
        }

        if ((mask & PlayerUpdate.CHAT) !== 0) {
            const colourEffect: number = buf.g2();
            const type: number = buf.g1();
            const length: number = buf.g1();
            const start: number = buf.pos;

            if (player.name && player.ready) {
                const username: bigint = JString.toUserhash(player.name);
                let ignored: boolean = false;

                if (type <= 1) {
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreUserhash[i] === username) {
                            ignored = true;
                            break;
                        }
                    }
                }

                if (!ignored && this.chatDisabled === 0) {
                    try {
                        const uncompressed: string = WordPack.unpack(buf, length);
                        const filtered: string = WordFilter.filter(uncompressed);
                        player.chatMessage = filtered;
                        player.chatColour = colourEffect >> 8;
                        player.chatEffect = colourEffect & 0xff;
                        player.chatTimer = 150;

                        if (type === 2 || type === 3) {
                            this.addChat(1, filtered, '@cr2@' + player.name);
                        } else if (type === 1) {
                            this.addChat(1, filtered, '@cr1@' + player.name);
                        } else {
                            this.addChat(2, filtered, player.name);
                        }
                    } catch (_e) {
                        // signlink.reporterror('cde2');
                    }
                }
            }

            buf.pos = start + length;
        }

        if ((mask & PlayerUpdate.SPOTANIM) !== 0) {
            player.spotanimId = buf.g2();
            const heightDelay: number = buf.g4();

            player.spotanimHeight = heightDelay >> 16;
            player.spotanimLastCycle = Client.loopCycle + (heightDelay & 0xffff);
            player.spotanimFrame = 0;
            player.spotanimCycle = 0;

            if (player.spotanimLastCycle > Client.loopCycle) {
                player.spotanimFrame = -1;
            }

            if (player.spotanimId === 65535) {
                player.spotanimId = -1;
            }
        }

        if ((mask & PlayerUpdate.EXACTMOVE) !== 0) {
            player.exactStartX = buf.g1();
            player.exactStartZ = buf.g1();
            player.exactEndX = buf.g1();
            player.exactEndZ = buf.g1();
            player.exactMoveEnd = buf.g2() + Client.loopCycle;
            player.exactMoveStart = buf.g2() + Client.loopCycle;
            player.exactMoveFacing = buf.g1();

            player.abortRoute();
        }

        if ((mask & PlayerUpdate.HITMARK2) !== 0) {
            const damage = buf.g1();
            const damageType = buf.g1();

            player.addHitmark(Client.loopCycle, damageType, damage);
            player.combatCycle = Client.loopCycle + 400;
            player.health = buf.g1();
            player.totalHealth = buf.g1();
        }
    }

    private getNpcPos(buf: Packet, size: number): void {
        this.entityRemovalCount = 0;
        this.entityUpdateCount = 0;

        this.getNpcPosOldVis(buf, size);
        this.getNpcPosNewVis(buf, size);
        this.getNpcPosExtended(buf, size);

        for (let i: number = 0; i < this.entityRemovalCount; i++) {
            const index: number = this.entityRemovalIds[i];
            const npc: ClientNpc | null = this.npc[index];
            if (!npc) {
                continue;
            }

            if (npc.cycle !== Client.loopCycle) {
                npc.type = null;
                this.npc[index] = null;
            }
        }

        if (buf.pos !== size) {
            console.error(`eek! ${this.loginUser} size mismatch in getnpcpos - pos:${buf.pos} psize:${size}`);
            throw new Error('eek');
        }

        for (let i: number = 0; i < this.npcCount; i++) {
            if (!this.npc[this.npcIds[i]]) {
                console.error(`eek! ${this.loginUser} null entry in npc list - pos:${i} size:${this.npcCount}`);
                throw new Error('eek');
            }
        }
    }

    private getNpcPosOldVis(buf: Packet, size: number): void {
        buf.gBitStart();

        const count: number = buf.gBit(8);
        if (count < this.npcCount) {
            for (let i: number = count; i < this.npcCount; i++) {
                this.entityRemovalIds[this.entityRemovalCount++] = this.npcIds[i];
            }
        }

        if (count > this.npcCount) {
            console.error(`eek! ${this.loginUser} Too many npcs`);
            throw new Error('eek');
        }

        this.npcCount = 0;
        for (let i: number = 0; i < count; i++) {
            const index: number = this.npcIds[i];
            const npc: ClientNpc | null = this.npc[index];

            const info: number = buf.gBit(1);
            if (info === 0) {
                this.npcIds[this.npcCount++] = index;
                if (npc) {
                    npc.cycle = Client.loopCycle;
                }
            } else {
                const op: number = buf.gBit(2);

                if (op === 0) {
                    this.npcIds[this.npcCount++] = index;
                    if (npc) {
                        npc.cycle = Client.loopCycle;
                    }
                    this.entityUpdateIds[this.entityUpdateCount++] = index;
                } else if (op === 1) {
                    this.npcIds[this.npcCount++] = index;
                    if (npc) {
                        npc.cycle = Client.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    npc?.moveCode(false, walkDir);

                    const extendedInfo: number = buf.gBit(1);
                    if (extendedInfo === 1) {
                        this.entityUpdateIds[this.entityUpdateCount++] = index;
                    }
                } else if (op === 2) {
                    this.npcIds[this.npcCount++] = index;
                    if (npc) {
                        npc.cycle = Client.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    npc?.moveCode(true, walkDir);

                    const runDir: number = buf.gBit(3);
                    npc?.moveCode(true, runDir);

                    const extendedInfo: number = buf.gBit(1);
                    if (extendedInfo === 1) {
                        this.entityUpdateIds[this.entityUpdateCount++] = index;
                    }
                } else if (op === 3) {
                    this.entityRemovalIds[this.entityRemovalCount++] = index;
                }
            }
        }
    }

    private getNpcPosNewVis(buf: Packet, size: number): void {
        while (buf.bitPos + 21 < size * 8) {
            const index: number = buf.gBit(14);
            if (index === 16383) {
                break;
            }

            if (!this.npc[index]) {
                this.npc[index] = new ClientNpc();
            }

            const npc: ClientNpc | null = this.npc[index];
            this.npcIds[this.npcCount++] = index;

            if (npc) {
                npc.cycle = Client.loopCycle;
                npc.type = NpcType.list(buf.gBit(11));
                npc.size = npc.type.size;
                npc.turnspeed = npc.type.turnspeed;
                npc.walkanim = npc.type.walkanim;
                npc.walkanim_b = npc.type.walkanim_b;
                npc.walkanim_l = npc.type.walkanim_r;
                npc.walkanim_r = npc.type.walkanim_l;
                npc.readyanim = npc.type.readyanim;
            } else {
                buf.gBit(11);
            }

            let dx: number = buf.gBit(5);
            if (dx > 15) {
                dx -= 32;
            }

            let dz: number = buf.gBit(5);
            if (dz > 15) {
                dz -= 32;
            }

            const jump = buf.gBit(1);
            if (this.localPlayer) {
                npc?.teleport(jump === 1, this.localPlayer.routeX[0] + dx, this.localPlayer.routeZ[0] + dz);
            }

            const extendedInfo: number = buf.gBit(1);
            if (extendedInfo === 1) {
                this.entityUpdateIds[this.entityUpdateCount++] = index;
            }
        }

        buf.gBitEnd();
    }

    private getNpcPosExtended(buf: Packet, _size: number): void {
        for (let i: number = 0; i < this.entityUpdateCount; i++) {
            const id: number = this.entityUpdateIds[i];
            const npc: ClientNpc | null = this.npc[id];
            if (!npc) {
                continue;
            }

            const mask: number = buf.g1();

            if ((mask & NpcUpdate.HITMARK2) !== 0) {
                const damage = buf.g1();
                const damageType = buf.g1();

                npc.addHitmark(Client.loopCycle, damageType, damage);
                npc.combatCycle = Client.loopCycle + 400;
                npc.health = buf.g1();
                npc.totalHealth = buf.g1();
            }

            if ((mask & NpcUpdate.ANIM) !== 0) {
                let anim: number = buf.g2();
                if (anim === 65535) {
                    anim = -1;
                }

                if (anim === npc.primaryAnim) {
                    npc.primaryAnimLoop = 0;
                }

                const delay: number = buf.g1();
                if (npc.primaryAnim === anim && anim !== -1) {
                    const restartMode = SeqType.list[anim].duplicatebehaviour;

                    if (restartMode == RestartMode.RESET) {
                        npc.primaryAnimFrame = 0;
                        npc.primaryAnimCycle = 0;
                        npc.primaryAnimDelay = delay;
                        npc.primaryAnimLoop = 0;
                    } else if (restartMode == RestartMode.RESETLOOP) {
                        npc.primaryAnimLoop = 0;
                    }
                } else if (anim === -1 || npc.primaryAnim === -1 || SeqType.list[anim].priority >= SeqType.list[npc.primaryAnim].priority) {
                    npc.primaryAnim = anim;
                    npc.primaryAnimFrame = 0;
                    npc.primaryAnimCycle = 0;
                    npc.primaryAnimDelay = delay;
                    npc.primaryAnimLoop = 0;
                    npc.preanimRouteLength = npc.routeLength;
                }
            }

            if ((mask & NpcUpdate.FACEENTITY) !== 0) {
                npc.faceEntity = buf.g2();
                if (npc.faceEntity === 65535) {
                    npc.faceEntity = -1;
                }
            }

            if ((mask & NpcUpdate.SAY) !== 0) {
                npc.chatMessage = buf.gjstr();
                npc.chatTimer = 100;
            }

            if ((mask & NpcUpdate.HITMARK) !== 0) {
                const damage = buf.g1();
                const damageType = buf.g1();

                npc.addHitmark(Client.loopCycle, damageType, damage);
                npc.combatCycle = Client.loopCycle + 400;
                npc.health = buf.g1();
                npc.totalHealth = buf.g1();
            }

            if ((mask & NpcUpdate.CHANGETYPE) !== 0) {
                npc.type = NpcType.list(buf.g2());
                npc.size = npc.type.size;
                npc.turnspeed = npc.type.turnspeed;
                npc.walkanim = npc.type.walkanim;
                npc.walkanim_b = npc.type.walkanim_b;
                npc.walkanim_l = npc.type.walkanim_r;
                npc.walkanim_r = npc.type.walkanim_l;
                npc.readyanim = npc.type.readyanim;
            }

            if ((mask & NpcUpdate.SPOTANIM) !== 0) {
                npc.spotanimId = buf.g2();
                const info: number = buf.g4();

                npc.spotanimHeight = info >> 16;
                npc.spotanimLastCycle = Client.loopCycle + (info & 0xffff);
                npc.spotanimFrame = 0;
                npc.spotanimCycle = 0;

                if (npc.spotanimLastCycle > Client.loopCycle) {
                    npc.spotanimFrame = -1;
                }

                if (npc.spotanimId === 65535) {
                    npc.spotanimId = -1;
                }
            }

            if ((mask & NpcUpdate.FACESQUARE) !== 0) {
                npc.faceSquareX = buf.g2();
                npc.faceSquareZ = buf.g2();
            }
        }
    }

    private mouseLoop(): void {
        if (this.objDragArea !== 0) {
            return;
        }

        if (this.isMobile && this.dialogInputOpen && this.insideChatPopup()) {
            return;
        }

        let button: number = this.mouseClickButton;
        if (this.targetMode === 1 && this.mouseClickX >= 516 && this.mouseClickY >= 160 && this.mouseClickX <= 765 && this.mouseClickY <= 205) {
            button = 0;
        }

        if (this.isMenuOpen) {
            if (button === 1) {
                const menuX: number = this.menuX;
                const menuY: number = this.menuY;
                const menuWidth: number = this.menuWidth;

                let clickX: number = this.mouseClickX;
                let clickY: number = this.mouseClickY;

                if (this.menuArea === 0) {
                    clickX -= 4;
                    clickY -= 4;
                } else if (this.menuArea === 1) {
                    clickX -= 553;
                    clickY -= 205;
                } else if (this.menuArea === 2) {
                    clickX -= 17;
                    clickY -= 357;
                }

                let option: number = -1;
                for (let i: number = 0; i < this.menuNumEntries; i++) {
                    const optionY: number = menuY + (this.menuNumEntries - 1 - i) * 15 + 31;
                    if (clickX > menuX && clickX < menuX + menuWidth && clickY > optionY - 13 && clickY < optionY + 3) {
                        option = i;
                    }
                }

                if (option !== -1) {
                    this.doAction(option);
                }

                this.isMenuOpen = false;

                if (this.menuArea === 1) {
                    this.redrawSide = true;
                } else if (this.menuArea === 2) {
                    this.redrawChat = true;
                }
            } else {
                let x: number = this.mouseX;
                let y: number = this.mouseY;

                if (this.menuArea === 0) {
                    x -= 4;
                    y -= 4;
                } else if (this.menuArea === 1) {
                    x -= 553;
                    y -= 205;
                } else if (this.menuArea === 2) {
                    x -= 17;
                    y -= 357;
                }

                if (x < this.menuX - 10 || x > this.menuX + this.menuWidth + 10 || y < this.menuY - 10 || y > this.menuY + this.menuHeight + 10) {
                    this.isMenuOpen = false;

                    if (this.menuArea === 1) {
                        this.redrawSide = true;
                    }

                    if (this.menuArea === 2) {
                        this.redrawChat = true;
                    }
                }
            }
        } else {
            if (button === 1 && this.menuNumEntries > 0) {
                const action: number = this.menuAction[this.menuNumEntries - 1];

                if (
                    action == MiniMenuAction.INV_BUTTON1 || action == MiniMenuAction.INV_BUTTON2 || action == MiniMenuAction.INV_BUTTON3 || action == MiniMenuAction.INV_BUTTON4 || action == MiniMenuAction.INV_BUTTON5 ||
                    action == MiniMenuAction.OP_HELD1 || action == MiniMenuAction.OP_HELD2 || action == MiniMenuAction.OP_HELD3 || action == MiniMenuAction.OP_HELD4 || action == MiniMenuAction.OP_HELD5 ||
                    action == MiniMenuAction.USEHELD_START || action === MiniMenuAction.OP_HELD6
                ) {
                    const slot: number = this.menuParamB[this.menuNumEntries - 1];
                    const comId: number = this.menuParamC[this.menuNumEntries - 1];
                    const com: IfType = IfType.list[comId];

                    if (com.objSwap || com.objReplace) {
                        this.objGrabThreshold = false;
                        this.objDragCycles = 0;
                        this.objDragComId = comId;
                        this.objDragSlot = slot;
                        this.objDragArea = 2;
                        this.objGrabX = this.mouseClickX;
                        this.objGrabY = this.mouseClickY;

                        if (IfType.list[comId].layerId === this.mainModalId) {
                            this.objDragArea = 1;
                        }

                        if (IfType.list[comId].layerId === this.chatModalId) {
                            this.objDragArea = 3;
                        }

                        return;
                    }
                }
            }

            if (button === 1 && (this.oneMouseButton === 1 || this.isAddFriendOption(this.menuNumEntries - 1)) && this.menuNumEntries > 2) {
                button = 2;
            }

            if (button === 1 && this.menuNumEntries > 0) {
                this.doAction(this.menuNumEntries - 1);
            } else if (button == 2 && this.menuNumEntries > 0) {
                this.openMenu();
            }
        }
    }

    private drawMinimenu(): void {
        const x: number = this.menuX;
        const y: number = this.menuY;
        const w: number = this.menuWidth;
        const h: number = this.menuHeight;
        const background: number = 0x5d5447;

        Pix2D.fillRect(x, y, w, h, background);
        Pix2D.fillRect(x + 1, y + 1, w - 2, 16, Colour.BLACK);
        Pix2D.drawRect(x + 1, y + 18, w - 2, h - 19, Colour.BLACK);

        this.b12?.drawString('Choose Option', x + 3, y + 14, background);

        let mouseX: number = this.mouseX;
        let mouseY: number = this.mouseY;
        if (this.menuArea === 0) {
            mouseX -= 4;
            mouseY -= 4;
        } else if (this.menuArea === 1) {
            mouseX -= 553;
            mouseY -= 205;
        } else if (this.menuArea === 2) {
            mouseX -= 17;
            mouseY -= 357;
        }

        for (let i: number = 0; i < this.menuNumEntries; i++) {
            const optionY: number = y + (this.menuNumEntries - 1 - i) * 15 + 31;

            let rgb: number = Colour.WHITE;
            if (mouseX > x && mouseX < x + w && mouseY > optionY - 13 && mouseY < optionY + 3) {
                rgb = Colour.YELLOW;
            }

            this.b12?.drawStringTag(this.menuOption[i], x + 3, optionY, rgb, true);
        }
    }

    private drawFeedback(): void {
        if (this.menuNumEntries < 2 && this.useMode === 0 && this.targetMode === 0) {
            return;
        }

        let tooltip: string;
        if (this.useMode === 1 && this.menuNumEntries < 2) {
            tooltip = 'Use ' + this.objSelectedName + ' with...';
        } else if (this.targetMode === 1 && this.menuNumEntries < 2) {
            tooltip = this.targetOp + '...';
        } else {
            tooltip = this.menuOption[this.menuNumEntries - 1];
        }

        if (this.menuNumEntries > 2) {
            tooltip = tooltip + '@whi@ / ' + (this.menuNumEntries - 2) + ' more options';
        }

        this.b12?.drawStringAntiMacro(tooltip, 4, 15, Colour.WHITE, true, (Client.loopCycle / 1000) | 0);
    }

    private openMenu(): void {
        let width: number = 0;
        if (this.b12) {
            width = this.b12.stringWid('Choose Option');
            let maxWidth: number;
            for (let i: number = 0; i < this.menuNumEntries; i++) {
                maxWidth = this.b12.stringWid(this.menuOption[i]);
                if (maxWidth > width) {
                    width = maxWidth;
                }
            }
        }
        width += 8;

        const height: number = this.menuNumEntries * 15 + 21;

        let x: number;
        let y: number;

        if (this.mouseClickX > 4 && this.mouseClickY > 4 && this.mouseClickX < 516 && this.mouseClickY < 338) {
            x = this.mouseClickX - ((width / 2) | 0) - 4;
            if (x + width > 512) {
                x = 512 - width;
            }
            if (x < 0) {
                x = 0;
            }

            y = this.mouseClickY - 4;
            if (y + height > 334) {
                y = 334 - height;
            }
            if (y < 0) {
                y = 0;
            }

            this.isMenuOpen = true;
            this.menuArea = 0;
            this.menuX = x;
            this.menuY = y;
            this.menuWidth = width;
            this.menuHeight = this.menuNumEntries * 15 + 22;
        }

        // the sidebar/tabs area
        if (this.mouseClickX > 553 && this.mouseClickY > 205 && this.mouseClickX < 743 && this.mouseClickY < 466) {
            x = this.mouseClickX - ((width / 2) | 0) - 553;
            if (x < 0) {
                x = 0;
            } else if (x + width > 190) {
                x = 190 - width;
            }

            y = this.mouseClickY - 205;
            if (y < 0) {
                y = 0;
            } else if (y + height > 261) {
                y = 261 - height;
            }

            this.isMenuOpen = true;
            this.menuArea = 1;
            this.menuX = x;
            this.menuY = y;
            this.menuWidth = width;
            this.menuHeight = this.menuNumEntries * 15 + 22;
        }

        // the chatbox area
        if (this.mouseClickX > 17 && this.mouseClickY > 357 && this.mouseClickX < 496 && this.mouseClickY < 453) {
            x = this.mouseClickX - ((width / 2) | 0) - 17;
            if (x < 0) {
                x = 0;
            } else if (x + width > 479) {
                x = 479 - width;
            }

            y = this.mouseClickY - 357;
            if (y < 0) {
                y = 0;
            } else if (y + height > 96) {
                y = 96 - height;
            }

            this.isMenuOpen = true;
            this.menuArea = 2;
            this.menuX = x;
            this.menuY = y;
            this.menuWidth = width;
            this.menuHeight = this.menuNumEntries * 15 + 22;
        }
    }

    private isAddFriendOption(option: number): boolean {
        if (option < 0) {
            return false;
        }

        let action: number = this.menuAction[option];
        if (action >= MiniMenuAction._PRIORITY) {
            action -= MiniMenuAction._PRIORITY;
        }

        return action === MiniMenuAction.FRIENDLIST_ADD;
    }

    private doAction(optionId: number): void {
        if (optionId < 0) {
            return;
        }

        if (this.dialogInputOpen) {
            this.dialogInputOpen = false;
            this.redrawChat = true;
        }

        let action: number = this.menuAction[optionId];
        const a: number = this.menuParamA[optionId];
        const b: number = this.menuParamB[optionId];
        const c: number = this.menuParamC[optionId];

        if (action >= MiniMenuAction._PRIORITY) {
            action -= MiniMenuAction._PRIORITY;
        }

        if (action === MiniMenuAction.OP_OBJ1 || action === MiniMenuAction.OP_OBJ2 || action === MiniMenuAction.OP_OBJ3 || action === MiniMenuAction.OP_OBJ4 || action === MiniMenuAction.OP_OBJ5) {
            if (this.localPlayer) {
                const success: boolean = this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], b, c, false, 0, 0, 0, 0, 0, 2);
                if (!success) {
                    this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], b, c, false, 1, 1, 0, 0, 0, 2);
                }

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                if (action === MiniMenuAction.OP_OBJ1) {
                    if ((b & 0x3) == 0) {
                        Client.oplogic7++;
                    }
                    if (Client.oplogic7 >= 123) {
                        this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC7);
                        this.out.p4(0);
                    }

                    this.out.p1Enc(ClientProt.OPOBJ1);
                }

                if (action === MiniMenuAction.OP_OBJ2) {
                    this.out.p1Enc(ClientProt.OPOBJ2);
                }

                if (action === MiniMenuAction.OP_OBJ3) {
                    this.out.p1Enc(ClientProt.OPOBJ3);
                }

                if (action === MiniMenuAction.OP_OBJ4) {
                    Client.oplogic8 += c;
                    if (Client.oplogic8 >= 75) {
                        this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC8);
                        this.out.p1(19);
                    }

                    this.out.p1Enc(ClientProt.OPOBJ4);
                }

                if (action === MiniMenuAction.OP_OBJ5) {
                    Client.oplogic3 += this.mapBuildBaseZ;
                    if (Client.oplogic3 >= 118) {
                        this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC3);
                        this.out.p4(0);
                    }

                    this.out.p1Enc(ClientProt.OPOBJ5);
                }

                this.out.p2(b + this.mapBuildBaseX);
                this.out.p2(c + this.mapBuildBaseZ);
                this.out.p2(a);
            }
        }

        if (action === MiniMenuAction.OP_OBJ6) {
            const obj: ObjType = ObjType.list(a);
            let examine: string;

            if (!obj.desc) {
                examine = "It's a " + obj.name + '.';
            } else {
                examine = obj.desc;
            }

            this.addChat(0, examine, '');
        }

        if (action === MiniMenuAction.TGT_OBJ) {
            if (this.localPlayer) {
                const success: boolean = this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], b, c, false, 0, 0, 0, 0, 0, 2);
                if (!success) {
                    this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], b, c, false, 1, 1, 0, 0, 0, 2);
                }

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1Enc(ClientProt.OPOBJT);
                this.out.p2(b + this.mapBuildBaseX);
                this.out.p2(c + this.mapBuildBaseZ);
                this.out.p2(a);
                this.out.p2(this.targetComId);
            }
        }

        if (action === MiniMenuAction.USEHELD_ONOBJ) {
            if (this.localPlayer) {
                const success: boolean = this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], b, c, false, 0, 0, 0, 0, 0, 2);
                if (!success) {
                    this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], b, c, false, 1, 1, 0, 0, 0, 2);
                }

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1Enc(ClientProt.OPOBJU);
                this.out.p2(b + this.mapBuildBaseX);
                this.out.p2(c + this.mapBuildBaseZ);
                this.out.p2(a);
                this.out.p2(this.objComId);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedComId);
            }
        }

        if (action === MiniMenuAction.OP_NPC1 || action === MiniMenuAction.OP_NPC2 || action === MiniMenuAction.OP_NPC3 || action === MiniMenuAction.OP_NPC4 || action === MiniMenuAction.OP_NPC5) {
            const npc: ClientNpc | null = this.npc[a];
            if (npc && this.localPlayer) {
                this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], npc.routeX[0], npc.routeZ[0], false, 1, 1, 0, 0, 0, 2);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                if (action === MiniMenuAction.OP_NPC1) {
                    this.out.p1Enc(ClientProt.OPNPC1);
                }

                if (action === MiniMenuAction.OP_NPC2) {
                    this.out.p1Enc(ClientProt.OPNPC2);
                }

                if (action === MiniMenuAction.OP_NPC3) {
                    this.out.p1Enc(ClientProt.OPNPC3);
                }

                if (action === MiniMenuAction.OP_NPC4) {
                    this.out.p1Enc(ClientProt.OPNPC4);
                }

                if (action === MiniMenuAction.OP_NPC5) {
                    this.out.p1Enc(ClientProt.OPNPC5);
                }

                this.out.p2(a);
            }
        }

        if (action === MiniMenuAction.OP_NPC6) {
            const npc: ClientNpc | null = this.npc[a];
            if (npc && npc.type) {
                let examine: string;

                if (!npc.type.desc) {
                    examine = "It's a " + npc.type.name + '.';
                } else {
                    examine = npc.type.desc;
                }

                this.addChat(0, examine, '');
            }
        }

        if (action === MiniMenuAction.TGT_NPC) {
            const npc: ClientNpc | null = this.npc[a];
            if (npc && this.localPlayer) {
                this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], npc.routeX[0], npc.routeZ[0], false, 1, 1, 0, 0, 0, 2);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1Enc(ClientProt.OPNPCT);
                this.out.p2(a);
                this.out.p2(this.targetComId);
            }
        }

        if (action === MiniMenuAction.USEHELD_ONNPC) {
            const npc: ClientNpc | null = this.npc[a];

            if (npc && this.localPlayer) {
                this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], npc.routeX[0], npc.routeZ[0], false, 1, 1, 0, 0, 0, 2);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1Enc(ClientProt.OPNPCU);
                this.out.p2(a);
                this.out.p2(this.objComId);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedComId);
            }
        }

        if (action === MiniMenuAction.OP_LOC1) {
            this.interactWithLoc(b, c, a, ClientProt.OPLOC1);
        }

        if (action === MiniMenuAction.OP_LOC2) {
            Client.oplogic1 += c;
            if (Client.oplogic1 >= 139) {
                this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC1);
                this.out.p4(0);
            }

            this.interactWithLoc(b, c, a, ClientProt.OPLOC2);
        }

        if (action === MiniMenuAction.OP_LOC3) {
            Client.oplogic2++;
            if (Client.oplogic2 >= 124) {
                this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC2);
                this.out.p2(37954);
            }

            this.interactWithLoc(b, c, a, ClientProt.OPLOC3);
        }

        if (action === MiniMenuAction.OP_LOC4) {
            this.interactWithLoc(b, c, a, ClientProt.OPLOC4);
        }

        if (action === MiniMenuAction.OP_LOC5) {
            this.interactWithLoc(b, c, a, ClientProt.OPLOC5);
        }

        if (action === MiniMenuAction.OP_LOC6) {
            const locId: number = (a >> 14) & 0x7fff;
            const loc: LocType = LocType.list(locId);

            let examine: string;
            if (!loc.desc) {
                examine = "It's a " + loc.name + '.';
            } else {
                examine = loc.desc;
            }

            this.addChat(0, examine, '');
        }

        if (action === MiniMenuAction.TGT_LOC) {
            if (this.interactWithLoc(b, c, a, ClientProt.OPLOCT)) {
                this.out.p2(this.targetComId);
            }
        }

        if (action === MiniMenuAction.USEHELD_ONLOC) {
            if (this.interactWithLoc(b, c, a, ClientProt.OPLOCU)) {
                this.out.p2(this.objComId);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedComId);
            }
        }

        if (action === MiniMenuAction.OP_PLAYER1 || action === MiniMenuAction.OP_PLAYER2 || action === MiniMenuAction.OP_PLAYER3 || action === MiniMenuAction.OP_PLAYER4 || action === MiniMenuAction.OP_PLAYER5) {
            const player: ClientPlayer | null = this.players[a];
            if (player && this.localPlayer) {
                this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], player.routeX[0], player.routeZ[0], false, 1, 1, 0, 0, 0, 2);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                if (action === MiniMenuAction.OP_PLAYER1) {
                    Client.oplogic4++;
                    if (Client.oplogic4 >= 52) {
                        this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC4);
                        this.out.p1(131);
                    }

                    this.out.p1Enc(ClientProt.OPPLAYER1);
                }

                if (action === MiniMenuAction.OP_PLAYER2) {
                    this.out.p1Enc(ClientProt.OPPLAYER2);
                }

                if (action === MiniMenuAction.OP_PLAYER3) {
                    this.out.p1Enc(ClientProt.OPPLAYER3);
                }

                if (action === MiniMenuAction.OP_PLAYER4) {
                    Client.oplogic5 += a;
                    if (Client.oplogic5 >= 66) {
                        this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC5);
                        this.out.p1(154);
                    }

                    this.out.p1Enc(ClientProt.OPPLAYER4);
                }

                if (action === MiniMenuAction.OP_PLAYER5) {
                    this.out.p1Enc(ClientProt.OPPLAYER5);
                }

                this.out.p2(a);
            }
        }

        if (action === MiniMenuAction.ACCEPT_TRADEREQ || action === MiniMenuAction.ACCEPT_DUELREQ) {
            let option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                option = option.substring(tag + 5).trim();
                const name: string = JString.toScreenName(JString.toRawUsername(JString.toUserhash(option)));
                let found: boolean = false;

                for (let i: number = 0; i < this.playerCount; i++) {
                    const player: ClientPlayer | null = this.players[this.playerIds[i]];

                    if (player && player.name && player.name.toLowerCase() === name.toLowerCase() && this.localPlayer) {
                        this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], player.routeX[0], player.routeZ[0], false, 1, 1, 0, 0, 0, 2);

                        if (action === MiniMenuAction.ACCEPT_TRADEREQ) {
                            Client.oplogic5 += a;
                            if (Client.oplogic5 >= 66) {
                                this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC5);
                                this.out.p1(154);
                            }

                            this.out.p1Enc(ClientProt.OPPLAYER4);
                        }

                        if (action === MiniMenuAction.ACCEPT_DUELREQ) {
                            Client.oplogic4++;
                            if (Client.oplogic4 >= 52) {
                                this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC4);
                                this.out.p1(131);
                            }

                            this.out.p1Enc(ClientProt.OPPLAYER1);
                        }

                        this.out.p2(this.playerIds[i]);
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    this.addChat(0, 'Unable to find ' + name, '');
                }
            }
        }

        if (action === MiniMenuAction.TGT_PLAYER) {
            const player: ClientPlayer | null = this.players[a];

            if (player && this.localPlayer) {
                this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], player.routeX[0], player.routeZ[0], false, 1, 1, 0, 0, 0, 2);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1Enc(ClientProt.OPPLAYERT);
                this.out.p2(a);
                this.out.p2(this.targetComId);
            }
        }

        if (action === MiniMenuAction.USEHELD_ONPLAYER) {
            const player: ClientPlayer | null = this.players[a];
            if (player && this.localPlayer) {
                this.tryMove(this.localPlayer.routeX[0], this.localPlayer.routeZ[0], player.routeX[0], player.routeZ[0], false, 1, 1, 0, 0, 0, 2);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1Enc(ClientProt.OPPLAYERU);
                this.out.p2(a);
                this.out.p2(this.objComId);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedComId);
            }
        }

        if (action === MiniMenuAction.OP_HELD1 || action === MiniMenuAction.OP_HELD2 || action === MiniMenuAction.OP_HELD3 || action === MiniMenuAction.OP_HELD4 || action === MiniMenuAction.OP_HELD5) {
            if (action === MiniMenuAction.OP_HELD1) {
                this.out.p1Enc(ClientProt.OPHELD1);
            }

            if (action === MiniMenuAction.OP_HELD2) {
                this.out.p1Enc(ClientProt.OPHELD2);
            }

            if (action === MiniMenuAction.OP_HELD3) {
                this.out.p1Enc(ClientProt.OPHELD3);
            }

            if (action === MiniMenuAction.OP_HELD4) {
                Client.oplogic9++;
                if (Client.oplogic9 >= 116) {
                    this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC9);
                    this.out.p3(13018169);
                }

                this.out.p1Enc(ClientProt.OPHELD4);
            }

            if (action === MiniMenuAction.OP_HELD5) {
                this.out.p1Enc(ClientProt.OPHELD5);
            }

            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);

            this.selectedCycle = 0;
            this.selectedComId = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (IfType.list[c].layerId === this.mainModalId) {
                this.selectedArea = 1;
            }

            if (IfType.list[c].layerId === this.chatModalId) {
                this.selectedArea = 3;
            }
        }

        if (action === MiniMenuAction.OP_HELD6) {
            const obj: ObjType = ObjType.list(a);
            const com = IfType.list[c];
            let examine: string;

            if (com && com.linkObjNumber && com.linkObjNumber[b] >= 100000) {
                examine = com.linkObjNumber[b] + ' x ' + obj.name;
            } else if (!obj.desc) {
                examine = "It's a " + obj.name + '.';
            } else {
                examine = obj.desc;
            }

            this.addChat(0, examine, '');
        }

        if (action === MiniMenuAction.USEHELD_START) {
            this.useMode = 1;
            this.objSelectedSlot = b;
            this.objSelectedComId = c;
            this.objComId = a;
            this.objSelectedName = ObjType.list(a).name;
            this.targetMode = 0;
            this.redrawSide = true;
            return;
        }

        if (action === MiniMenuAction.TGT_BUTTON) {
            const com: IfType = IfType.list[c];
            this.targetMode = 1;
            this.targetComId = c;
            this.targetMask = com.targetMask;
            this.useMode = 0;
            this.redrawSide = true;

            let prefix: string | null = com.targetVerb;
            if (prefix && prefix.indexOf(' ') !== -1) {
                prefix = prefix.substring(0, prefix.indexOf(' '));
            }

            let suffix: string | null = com.targetVerb;
            if (suffix && suffix.indexOf(' ') !== -1) {
                suffix = suffix.substring(suffix.indexOf(' ') + 1);
            }

            this.targetOp = prefix + ' ' + com.targetBase + ' ' + suffix;

            if (this.targetMask === 0x10) {
                this.redrawSide = true;
                this.activeIcon = 3;
                this.redrawIcons = true;
            }

            return;
        }

        if (action === MiniMenuAction.TGT_HELD) {
            this.out.p1Enc(ClientProt.OPHELDT);
            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);
            this.out.p2(this.targetComId);

            this.selectedCycle = 0;
            this.selectedComId = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (IfType.list[c].layerId === this.mainModalId) {
                this.selectedArea = 1;
            }

            if (IfType.list[c].layerId === this.chatModalId) {
                this.selectedArea = 3;
            }
        }

        if (action === MiniMenuAction.USEHELD_ONHELD) {
            this.out.p1Enc(ClientProt.OPHELDU);
            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);
            this.out.p2(this.objComId);
            this.out.p2(this.objSelectedSlot);
            this.out.p2(this.objSelectedComId);

            this.selectedCycle = 0;
            this.selectedComId = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (IfType.list[c].layerId === this.mainModalId) {
                this.selectedArea = 1;
            }

            if (IfType.list[c].layerId === this.chatModalId) {
                this.selectedArea = 3;
            }
        }

        if (action === MiniMenuAction.INV_BUTTON1 || action === MiniMenuAction.INV_BUTTON2 || action === MiniMenuAction.INV_BUTTON3 || action === MiniMenuAction.INV_BUTTON4 || action === MiniMenuAction.INV_BUTTON5) {
            if (action === MiniMenuAction.INV_BUTTON1) {
                if ((a & 0x3) == 0) {
                    Client.oplogic6++;
                }
                if (Client.oplogic6 >= 133) {
                    this.out.p1Enc(ClientProt.ANTICHEAT_OPLOGIC6);
                    this.out.p2(6118);
                }

                this.out.p1Enc(ClientProt.INV_BUTTON1);
            }

            if (action === MiniMenuAction.INV_BUTTON2) {
                this.out.p1Enc(ClientProt.INV_BUTTON2);
            }

            if (action === MiniMenuAction.INV_BUTTON3) {
                this.out.p1Enc(ClientProt.INV_BUTTON3);
            }

            if (action === MiniMenuAction.INV_BUTTON4) {
                this.out.p1Enc(ClientProt.INV_BUTTON4);
            }

            if (action === MiniMenuAction.INV_BUTTON5) {
                this.out.p1Enc(ClientProt.INV_BUTTON5);
            }

            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);

            this.selectedCycle = 0;
            this.selectedComId = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (IfType.list[c].layerId === this.mainModalId) {
                this.selectedArea = 1;
            }

            if (IfType.list[c].layerId === this.chatModalId) {
                this.selectedArea = 3;
            }
        }

        if (action === MiniMenuAction.IF_BUTTON) {
            const com: IfType = IfType.list[c];
            let notify: boolean = true;

            if (com.clientCode > 0) {
                notify = this.clientButton(com);
            }

            if (notify) {
                this.out.p1Enc(ClientProt.IF_BUTTON);
                this.out.p2(c);
            }
        }

        if (action === MiniMenuAction.TOGGLE_BUTTON) {
            this.out.p1Enc(ClientProt.IF_BUTTON);
            this.out.p2(c);

            const com: IfType = IfType.list[c];
            if (com.scripts && com.scripts[0] && com.scripts[0][0] === 5) {
                const varp: number = com.scripts[0][1];
                this.var[varp] = 1 - this.var[varp];
                this.clientVar(varp);
                this.redrawSide = true;
            }
        }

        if (action === MiniMenuAction.SELECT_BUTTON) {
            this.out.p1Enc(ClientProt.IF_BUTTON);
            this.out.p2(c);

            const com: IfType = IfType.list[c];
            if (com.scripts && com.scripts[0] && com.scripts[0][0] === 5) {
                const varp: number = com.scripts[0][1];
                if (com.scriptOperand && this.var[varp] !== com.scriptOperand[0]) {
                    this.var[varp] = com.scriptOperand[0];
                    this.clientVar(varp);
                    this.redrawSide = true;
                }
            }
        }

        if (action === MiniMenuAction.PAUSE_BUTTON) {
            if (!this.resumedPauseButton) {
                this.out.p1Enc(ClientProt.RESUME_PAUSEBUTTON);
                this.out.p2(c);
                this.resumedPauseButton = true;
            }
        }

        if (action === MiniMenuAction.CLOSE_BUTTON) {
            this.closeModal();
        }

        if (action === MiniMenuAction.ABUSE_REPORT) {
            const option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                this.closeModal();

                this.reportAbuseInput = option.substring(tag + 5).trim();
                this.reportAbuseMuteOption = false;

                for (let i: number = 0; i < IfType.list.length; i++) {
                    if (IfType.list[i] && IfType.list[i].clientCode === ClientCode.CC_REPORT_INPUT) {
                        this.reportAbuseComId = this.mainModalId = IfType.list[i].layerId;
                        break;
                    }
                }
            }
        }

        if (action === MiniMenuAction.WALK) {
            if (this.isMenuOpen) {
                this.world?.updateMousePicking(b - 4, c - 4);
            } else {
                this.world?.updateMousePicking(this.mouseClickX - 4, this.mouseClickY - 4);
            }
        }

        if (action === MiniMenuAction.FRIENDLIST_ADD || action === MiniMenuAction.IGNORELIST_ADD || action === MiniMenuAction.FRIENDLIST_DEL || action === MiniMenuAction.IGNORELIST_DEL) {
            const option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                const username: bigint = JString.toUserhash(option.substring(tag + 5).trim());
                if (action === MiniMenuAction.FRIENDLIST_ADD) {
                    this.addFriend(username);
                } else if (action === MiniMenuAction.IGNORELIST_ADD) {
                    this.addIgnore(username);
                } else if (action === MiniMenuAction.FRIENDLIST_DEL) {
                    this.delFriend(username);
                } else if (action === MiniMenuAction.IGNORELIST_DEL) {
                    this.delIgnore(username);
                }
            }
        }

        if (action === MiniMenuAction.MESSAGE_PRIVATE) {
            const option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                const userhash: bigint = JString.toUserhash(option.substring(tag + 5).trim());
                let friend: number = -1;

                for (let i: number = 0; i < this.friendCount; i++) {
                    if (this.friendUserhash[i] === userhash) {
                        friend = i;
                        break;
                    }
                }

                if (friend !== -1 && this.friendNodeId[friend] > 0) {
                    this.redrawChat = true;
                    this.dialogInputOpen = false;
                    this.socialInputOpen = true;
                    this.socialInput = '';
                    this.socialInputType = 3;
                    this.socialUserhash = this.friendUserhash[friend];
                    this.socialInputHeader = 'Enter message to send to ' + this.friendUsername[friend];
                }
            }
        }

        this.useMode = 0;
        this.targetMode = 0;
        this.redrawSide = true;
    }

    private addWorldOptions(): void {
        if (this.useMode === 0 && this.targetMode === 0) {
            this.menuOption[this.menuNumEntries] = 'Walk here';
            this.menuAction[this.menuNumEntries] = MiniMenuAction.WALK;
            this.menuParamB[this.menuNumEntries] = this.mouseX;
            this.menuParamC[this.menuNumEntries] = this.mouseY;
            this.menuNumEntries++;
        }

        let lastTypecode: number = -1;
        for (let picked: number = 0; picked < Model.pickedCount; picked++) {
            const typecode: number = Model.pickedEntityTypecode[picked];
            const x: number = typecode & 0x7f;
            const z: number = (typecode >> 7) & 0x7f;
            const entityType: number = (typecode >> 29) & 0x3;
            const typeId: number = (typecode >> 14) & 0x7fff;

            if (typecode === lastTypecode) {
                continue;
            }

            lastTypecode = typecode;

            if (entityType === 2 && this.world && this.world.typeCode2(this.minusedlevel, x, z, typecode) >= 0) {
                const loc: LocType = LocType.list(typeId);

                if (this.useMode === 1) {
                    this.menuOption[this.menuNumEntries] = 'Use ' + this.objSelectedName + ' with @cya@' + loc.name;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.USEHELD_ONLOC;
                    this.menuParamA[this.menuNumEntries] = typecode;
                    this.menuParamB[this.menuNumEntries] = x;
                    this.menuParamC[this.menuNumEntries] = z;
                    this.menuNumEntries++;
                } else if (this.targetMode === 1) {
                    if ((this.targetMask & 0x4) === 4) {
                        this.menuOption[this.menuNumEntries] = this.targetOp + ' @cya@' + loc.name;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.TGT_LOC;
                        this.menuParamA[this.menuNumEntries] = typecode;
                        this.menuParamB[this.menuNumEntries] = x;
                        this.menuParamC[this.menuNumEntries] = z;
                        this.menuNumEntries++;
                    }
                } else {
                    if (loc.op) {
                        for (let i: number = 4; i >= 0; i--) {
                            if (loc.op[i] === null) {
                                continue;
                            }

                            this.menuOption[this.menuNumEntries] = loc.op[i] + ' @cya@' + loc.name;

                            if (i === 0) {
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_LOC1;
                            } else if (i === 1) {
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_LOC2;
                            } else if (i === 2) {
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_LOC3;
                            } else if (i === 3) {
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_LOC4;
                            } else if (i === 4) {
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_LOC5;
                            }

                            this.menuParamA[this.menuNumEntries] = typecode;
                            this.menuParamB[this.menuNumEntries] = x;
                            this.menuParamC[this.menuNumEntries] = z;
                            this.menuNumEntries++;
                        }
                    }

                    this.menuOption[this.menuNumEntries] = 'Examine @cya@' + loc.name;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_LOC6;
                    this.menuParamA[this.menuNumEntries] = typecode;
                    this.menuParamB[this.menuNumEntries] = x;
                    this.menuParamC[this.menuNumEntries] = z;
                    this.menuNumEntries++;
                }
            } else if (entityType === 1) {
                const npc: ClientNpc | null = this.npc[typeId];

                if (npc && npc.type && npc.type.size === 1 && (npc.x & 0x7f) === 64 && (npc.z & 0x7f) === 64) {
                    for (let i: number = 0; i < this.npcCount; i++) {
                        const other: ClientNpc | null = this.npc[this.npcIds[i]];

                        if (other && other !== npc && other.type && other.type.size === 1 && other.x === npc.x && other.z === npc.z) {
                            this.addNpcOptions(other.type, this.npcIds[i], x, z);
                        }
                    }
                }

                if (npc && npc.type) {
                    this.addNpcOptions(npc.type, typeId, x, z);
                }
            } else if (entityType === 0) {
                const player: ClientPlayer | null = this.players[typeId];

                if (player && (player.x & 0x7f) === 64 && (player.z & 0x7f) === 64) {
                    for (let i: number = 0; i < this.npcCount; i++) {
                        const other: ClientNpc | null = this.npc[this.npcIds[i]];

                        if (other && other.type && other.type.size === 1 && other.x === player.x && other.z === player.z) {
                            this.addNpcOptions(other.type, this.npcIds[i], x, z);
                        }
                    }

                    for (let i: number = 0; i < this.playerCount; i++) {
                        const other: ClientPlayer | null = this.players[this.playerIds[i]];

                        if (other && other !== player && other.x === player.x && other.z === player.z) {
                            this.addPlayerOptions(other, this.playerIds[i], x, z);
                        }
                    }
                }

                if (player) {
                    this.addPlayerOptions(player, typeId, x, z);
                }
            } else if (entityType === 3) {
                const objs = this.groundObj[this.minusedlevel][x][z];
                if (!objs) {
                    continue;
                }

                for (let obj = objs.tail(); obj !== null; obj = objs.prev()) {
                    const type: ObjType = ObjType.list(obj.id);
                    if (this.useMode === 1) {
                        this.menuOption[this.menuNumEntries] = 'Use ' + this.objSelectedName + ' with @lre@' + type.name;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.USEHELD_ONOBJ;
                        this.menuParamA[this.menuNumEntries] = obj.id;
                        this.menuParamB[this.menuNumEntries] = x;
                        this.menuParamC[this.menuNumEntries] = z;
                        this.menuNumEntries++;
                    } else if (this.targetMode === 1) {
                        if ((this.targetMask & 0x1) === 1) {
                            this.menuOption[this.menuNumEntries] = this.targetOp + ' @lre@' + type.name;
                            this.menuAction[this.menuNumEntries] = MiniMenuAction.TGT_OBJ;
                            this.menuParamA[this.menuNumEntries] = obj.id;
                            this.menuParamB[this.menuNumEntries] = x;
                            this.menuParamC[this.menuNumEntries] = z;
                            this.menuNumEntries++;
                        }
                    } else {
                        for (let op: number = 4; op >= 0; op--) {
                            if (type.op && type.op[op]) {
                                this.menuOption[this.menuNumEntries] = type.op[op] + ' @lre@' + type.name;

                                if (op === 0) {
                                    this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_OBJ1;
                                } else if (op === 1) {
                                    this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_OBJ2;
                                } else if (op === 2) {
                                    this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_OBJ3;
                                } else if (op === 3) {
                                    this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_OBJ4;
                                } else if (op === 4) {
                                    this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_OBJ5;
                                }

                                this.menuParamA[this.menuNumEntries] = obj.id;
                                this.menuParamB[this.menuNumEntries] = x;
                                this.menuParamC[this.menuNumEntries] = z;
                                this.menuNumEntries++;
                            } else if (op === 2) {
                                this.menuOption[this.menuNumEntries] = 'Take @lre@' + type.name;
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_OBJ3;
                                this.menuParamA[this.menuNumEntries] = obj.id;
                                this.menuParamB[this.menuNumEntries] = x;
                                this.menuParamC[this.menuNumEntries] = z;
                                this.menuNumEntries++;
                            }
                        }

                        this.menuOption[this.menuNumEntries] = 'Examine @lre@' + type.name;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_OBJ6;
                        this.menuParamA[this.menuNumEntries] = obj.id;
                        this.menuParamB[this.menuNumEntries] = x;
                        this.menuParamC[this.menuNumEntries] = z;
                        this.menuNumEntries++;
                    }
                }
            }
        }
    }

    private addNpcOptions(npc: NpcType, a: number, b: number, c: number): void {
        if (this.menuNumEntries >= 400) {
            return;
        }

        let tooltip: string | null = npc.name;
        if (npc.vislevel !== 0 && this.localPlayer) {
            tooltip = tooltip + this.combatColourCode(this.localPlayer.combatLevel, npc.vislevel) + ' (level-' + npc.vislevel + ')';
        }

        if (this.useMode === 1) {
            this.menuOption[this.menuNumEntries] = 'Use ' + this.objSelectedName + ' with @yel@' + tooltip;
            this.menuAction[this.menuNumEntries] = MiniMenuAction.USEHELD_ONNPC;
            this.menuParamA[this.menuNumEntries] = a;
            this.menuParamB[this.menuNumEntries] = b;
            this.menuParamC[this.menuNumEntries] = c;
            this.menuNumEntries++;
        } else if (this.targetMode === 1) {
            if ((this.targetMask & 0x2) === 2) {
                this.menuOption[this.menuNumEntries] = this.targetOp + ' @yel@' + tooltip;
                this.menuAction[this.menuNumEntries] = MiniMenuAction.TGT_NPC;
                this.menuParamA[this.menuNumEntries] = a;
                this.menuParamB[this.menuNumEntries] = b;
                this.menuParamC[this.menuNumEntries] = c;
                this.menuNumEntries++;
            }
        } else {
            if (npc.op) {
                for (let i = 4; i >= 0; i--) {
                    if (npc.op[i] === null || npc.op[i]?.toLowerCase() === 'attack') {
                        continue;
                    }

                    this.menuOption[this.menuNumEntries] = npc.op[i] + ' @yel@' + tooltip;

                    if (i === 0) {
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_NPC1;
                    } else if (i === 1) {
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_NPC2;
                    } else if (i === 2) {
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_NPC3;
                    } else if (i === 3) {
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_NPC4;
                    } else if (i === 4) {
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_NPC5;
                    }

                    this.menuParamA[this.menuNumEntries] = a;
                    this.menuParamB[this.menuNumEntries] = b;
                    this.menuParamC[this.menuNumEntries] = c;
                    this.menuNumEntries++;
                }
            }

            if (npc.op) {
                for (let i = 4; i >= 0; i--) {
                    if (npc.op[i] === null || npc.op[i]?.toLowerCase() !== 'attack') {
                        continue;
                    }

                    let priority: number = 0;
                    if (this.localPlayer && npc.vislevel > this.localPlayer.combatLevel) {
                        priority = MiniMenuAction._PRIORITY;
                    }

                    this.menuOption[this.menuNumEntries] = npc.op[i] + ' @yel@' + tooltip;

                    if (i === 0) {
                        this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_NPC1;
                    } else if (i === 1) {
                        this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_NPC2;
                    } else if (i === 2) {
                        this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_NPC3;
                    } else if (i === 3) {
                        this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_NPC4;
                    } else if (i === 4) {
                        this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_NPC5;
                    }

                    this.menuParamA[this.menuNumEntries] = a;
                    this.menuParamB[this.menuNumEntries] = b;
                    this.menuParamC[this.menuNumEntries] = c;
                    this.menuNumEntries++;
                }
            }

            this.menuOption[this.menuNumEntries] = 'Examine @yel@' + tooltip;
            this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_NPC6;
            this.menuParamA[this.menuNumEntries] = a;
            this.menuParamB[this.menuNumEntries] = b;
            this.menuParamC[this.menuNumEntries] = c;
            this.menuNumEntries++;
        }
    }

    private addPlayerOptions(player: ClientPlayer, a: number, b: number, c: number): void {
        if (player === this.localPlayer || this.menuNumEntries >= 400) {
            return;
        }

        let tooltip: string | null = null;
        if (player.skillLevel === 0 && this.localPlayer) {
            tooltip = player.name + this.combatColourCode(this.localPlayer.combatLevel, player.combatLevel) + ' (level-' + player.combatLevel + ')';
        } else {
            tooltip = player.name + ' (skill-' + player.skillLevel + ')';
        }

        if (this.useMode === 1) {
            this.menuOption[this.menuNumEntries] = 'Use ' + this.objSelectedName + ' with @whi@' + tooltip;
            this.menuAction[this.menuNumEntries] = MiniMenuAction.USEHELD_ONPLAYER;
            this.menuParamA[this.menuNumEntries] = a;
            this.menuParamB[this.menuNumEntries] = b;
            this.menuParamC[this.menuNumEntries] = c;
            this.menuNumEntries++;
        } else if (this.targetMode === 1) {
            if ((this.targetMask & 0x8) === 8) {
                this.menuOption[this.menuNumEntries] = this.targetOp + ' @whi@' + tooltip;
                this.menuAction[this.menuNumEntries] = MiniMenuAction.TGT_PLAYER;
                this.menuParamA[this.menuNumEntries] = a;
                this.menuParamB[this.menuNumEntries] = b;
                this.menuParamC[this.menuNumEntries] = c;
                this.menuNumEntries++;
            }
        } else {
            for (let i = 4; i >= 0; i--) {
                const op = this.playerOp[i];
                if (op === null || !this.localPlayer) {
                    continue;
                }

                this.menuOption[this.menuNumEntries] = op + ' @whi@' + tooltip;

                let priority = 0;
                if (op.toLowerCase() === 'attack') {
                    if (player.combatLevel > this.localPlayer.combatLevel) {
                        priority = MiniMenuAction._PRIORITY;
                    }
                } else if (this.playerOpPriority[i]) {
                    priority = MiniMenuAction._PRIORITY;
                }

                if (i === 0) {
                    this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_PLAYER1;
                } else if (i === 1) {
                    this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_PLAYER2;
                } else if (i === 2) {
                    this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_PLAYER3;
                } else if (i === 3) {
                    this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_PLAYER4;
                } else if (i === 4) {
                    this.menuAction[this.menuNumEntries] = priority + MiniMenuAction.OP_PLAYER5;
                }

                this.menuParamA[this.menuNumEntries] = a;
                this.menuParamB[this.menuNumEntries] = b;
                this.menuParamC[this.menuNumEntries] = c;
                this.menuNumEntries++;
            }
        }

        for (let i: number = 0; i < this.menuNumEntries; i++) {
            if (this.menuAction[i] === MiniMenuAction.WALK) {
                this.menuOption[i] = 'Walk here @whi@' + tooltip;
                break;
            }
        }
    }

    // todo: order
    private addComponentOptions(com: IfType, mouseX: number, mouseY: number, x: number, y: number, scrollPosition: number): void {
        if (com.type !== 0 || !com.children || com.hide || mouseX < x || mouseY < y || mouseX > x + com.width || mouseY > y + com.height || !com.childX || !com.childY) {
            return;
        }

        const children: number = com.children.length;
        for (let i: number = 0; i < children; i++) {
            let childX: number = com.childX[i] + x;
            let childY: number = com.childY[i] + y - scrollPosition;
            const child: IfType = IfType.list[com.children[i]];

            childX += child.x;
            childY += child.y;

            if ((child.overLayerId >= 0 || child.colourOver !== 0) && mouseX >= childX && mouseY >= childY && mouseX < childX + child.width && mouseY < childY + child.height) {
                if (child.overLayerId >= 0) {
                    this.lastOverComId = child.overLayerId;
                } else {
                    this.lastOverComId = child.id;
                }
            }

            if (child.type === 0) {
                this.addComponentOptions(child, mouseX, mouseY, childX, childY, child.scrollPos);

                if (child.scrollHeight > child.height) {
                    this.doScrollbar(mouseX, mouseY, child.scrollHeight, child.height, true, childX + child.width, childY, child);
                }
            } else if (child.type === 2) {
                let slot: number = 0;

                for (let row: number = 0; row < child.height; row++) {
                    for (let col: number = 0; col < child.width; col++) {
                        let slotX: number = childX + col * (child.marginX + 32);
                        let slotY: number = childY + row * (child.marginY + 32);

                        if (slot < 20 && child.invBackgroundX && child.invBackgroundY) {
                            slotX += child.invBackgroundX[slot];
                            slotY += child.invBackgroundY[slot];
                        }

                        if (mouseX < slotX || mouseY < slotY || mouseX >= slotX + 32 || mouseY >= slotY + 32) {
                            slot++;
                            continue;
                        }

                        this.hoveredSlot = slot;
                        this.hoveredSlotComId = child.id;

                        if (!child.linkObjType || child.linkObjType[slot] <= 0) {
                            slot++;
                            continue;
                        }

                        const obj: ObjType = ObjType.list(child.linkObjType[slot] - 1);

                        if (this.useMode === 1 && child.objOps) {
                            if (child.id !== this.objSelectedComId || slot !== this.objSelectedSlot) {
                                this.menuOption[this.menuNumEntries] = 'Use ' + this.objSelectedName + ' with @lre@' + obj.name;
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.USEHELD_ONHELD;
                                this.menuParamA[this.menuNumEntries] = obj.id;
                                this.menuParamB[this.menuNumEntries] = slot;
                                this.menuParamC[this.menuNumEntries] = child.id;
                                this.menuNumEntries++;
                            }
                        } else if (this.targetMode === 1 && child.objOps) {
                            if ((this.targetMask & 0x10) === 16) {
                                this.menuOption[this.menuNumEntries] = this.targetOp + ' @lre@' + obj.name;
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.TGT_HELD;
                                this.menuParamA[this.menuNumEntries] = obj.id;
                                this.menuParamB[this.menuNumEntries] = slot;
                                this.menuParamC[this.menuNumEntries] = child.id;
                                this.menuNumEntries++;
                            }
                        } else {
                            if (child.objOps) {
                                for (let op: number = 4; op >= 3; op--) {
                                    if (obj.iop && obj.iop[op]) {
                                        this.menuOption[this.menuNumEntries] = obj.iop[op] + ' @lre@' + obj.name;

                                        if (op === 3) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_HELD4;
                                        } else if (op === 4) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_HELD5;
                                        }

                                        this.menuParamA[this.menuNumEntries] = obj.id;
                                        this.menuParamB[this.menuNumEntries] = slot;
                                        this.menuParamC[this.menuNumEntries] = child.id;
                                        this.menuNumEntries++;
                                    } else if (op === 4) {
                                        this.menuOption[this.menuNumEntries] = 'Drop @lre@' + obj.name;
                                        this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_HELD5;
                                        this.menuParamA[this.menuNumEntries] = obj.id;
                                        this.menuParamB[this.menuNumEntries] = slot;
                                        this.menuParamC[this.menuNumEntries] = child.id;
                                        this.menuNumEntries++;
                                    }
                                }
                            }

                            if (child.objUse) {
                                this.menuOption[this.menuNumEntries] = 'Use @lre@' + obj.name;
                                this.menuAction[this.menuNumEntries] = MiniMenuAction.USEHELD_START;
                                this.menuParamA[this.menuNumEntries] = obj.id;
                                this.menuParamB[this.menuNumEntries] = slot;
                                this.menuParamC[this.menuNumEntries] = child.id;
                                this.menuNumEntries++;
                            }

                            if (child.objOps && obj.iop) {
                                for (let op: number = 2; op >= 0; op--) {
                                    if (obj.iop[op]) {
                                        this.menuOption[this.menuNumEntries] = obj.iop[op] + ' @lre@' + obj.name;

                                        if (op === 0) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_HELD1;
                                        } else if (op === 1) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_HELD2;
                                        } else if (op === 2) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_HELD3;
                                        }

                                        this.menuParamA[this.menuNumEntries] = obj.id;
                                        this.menuParamB[this.menuNumEntries] = slot;
                                        this.menuParamC[this.menuNumEntries] = child.id;
                                        this.menuNumEntries++;
                                    }
                                }
                            }

                            if (child.iop) {
                                for (let op: number = 4; op >= 0; op--) {
                                    if (child.iop[op]) {
                                        this.menuOption[this.menuNumEntries] = child.iop[op] + ' @lre@' + obj.name;

                                        if (op === 0) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.INV_BUTTON1;
                                        } else if (op === 1) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.INV_BUTTON2;
                                        } else if (op === 2) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.INV_BUTTON3;
                                        } else if (op === 3) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.INV_BUTTON4;
                                        } else if (op === 4) {
                                            this.menuAction[this.menuNumEntries] = MiniMenuAction.INV_BUTTON5;
                                        }

                                        this.menuParamA[this.menuNumEntries] = obj.id;
                                        this.menuParamB[this.menuNumEntries] = slot;
                                        this.menuParamC[this.menuNumEntries] = child.id;
                                        this.menuNumEntries++;
                                    }
                                }
                            }

                            this.menuOption[this.menuNumEntries] = 'Examine @lre@' + obj.name;
                            this.menuAction[this.menuNumEntries] = MiniMenuAction.OP_HELD6;
                            this.menuParamA[this.menuNumEntries] = obj.id;
                            this.menuParamB[this.menuNumEntries] = slot;
                            this.menuParamC[this.menuNumEntries] = child.id;
                            this.menuNumEntries++;
                        }

                        slot++;
                    }
                }
            } else if (mouseX >= childX && mouseY >= childY && mouseX < childX + child.width && mouseY < childY + child.height) {
                if (child.buttonType === ButtonType.BUTTON_OK) {
                    let override: boolean = false;
                    if (child.clientCode !== 0) {
                        override = this.addSocialOptions(child);
                    }

                    if (!override && child.buttonText) {
                        this.menuOption[this.menuNumEntries] = child.buttonText;
                        this.menuAction[this.menuNumEntries] = MiniMenuAction.IF_BUTTON;
                        this.menuParamC[this.menuNumEntries] = child.id;
                        this.menuNumEntries++;
                    }
                } else if (child.buttonType === ButtonType.BUTTON_TARGET && this.targetMode === 0) {
                    let prefix: string | null = child.targetVerb;
                    if (prefix && prefix.indexOf(' ') !== -1) {
                        prefix = prefix.substring(0, prefix.indexOf(' '));
                    }

                    this.menuOption[this.menuNumEntries] = prefix + ' @gre@' + child.targetBase;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.TGT_BUTTON;
                    this.menuParamC[this.menuNumEntries] = child.id;
                    this.menuNumEntries++;
                } else if (child.buttonType === ButtonType.BUTTON_CLOSE) {
                    this.menuOption[this.menuNumEntries] = 'Close';
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.CLOSE_BUTTON;
                    this.menuParamC[this.menuNumEntries] = child.id;
                    this.menuNumEntries++;
                } else if (child.buttonType === ButtonType.BUTTON_TOGGLE && child.buttonText) {
                    this.menuOption[this.menuNumEntries] = child.buttonText;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.TOGGLE_BUTTON;
                    this.menuParamC[this.menuNumEntries] = child.id;
                    this.menuNumEntries++;
                } else if (child.buttonType === ButtonType.BUTTON_SELECT && child.buttonText) {
                    this.menuOption[this.menuNumEntries] = child.buttonText;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.SELECT_BUTTON;
                    this.menuParamC[this.menuNumEntries] = child.id;
                    this.menuNumEntries++;
                } else if (child.buttonType === ButtonType.BUTTON_CONTINUE && !this.resumedPauseButton && child.buttonText) {
                    this.menuOption[this.menuNumEntries] = child.buttonText;
                    this.menuAction[this.menuNumEntries] = MiniMenuAction.PAUSE_BUTTON;
                    this.menuParamC[this.menuNumEntries] = child.id;
                    this.menuNumEntries++;
                }
            }
        }
    }

    // todo: order
    private addSocialOptions(component: IfType): boolean {
        let clientCode: number = component.clientCode;

        if ((clientCode >= ClientCode.CC_FRIENDS_START && clientCode <= ClientCode.CC_FRIENDS_UPDATE_END) || !(clientCode < 701 || clientCode > 900)) {
            if (clientCode >= 801) {
                clientCode -= 701;
            } else if (clientCode >= 701) {
                clientCode -= 601;
            } else if (clientCode >= ClientCode.CC_FRIENDS_UPDATE_START) {
                clientCode -= ClientCode.CC_FRIENDS_UPDATE_START;
            } else {
                clientCode--;
            }

            this.menuOption[this.menuNumEntries] = 'Remove @whi@' + this.friendUsername[clientCode];
            this.menuAction[this.menuNumEntries] = MiniMenuAction.FRIENDLIST_DEL;
            this.menuNumEntries++;

            this.menuOption[this.menuNumEntries] = 'Message @whi@' + this.friendUsername[clientCode];
            this.menuAction[this.menuNumEntries] = MiniMenuAction.MESSAGE_PRIVATE;
            this.menuNumEntries++;
            return true;
        } else if (clientCode >= ClientCode.CC_IGNORES_START && clientCode <= ClientCode.CC_IGNORES_END) {
            this.menuOption[this.menuNumEntries] = 'Remove @whi@' + component.text;
            this.menuAction[this.menuNumEntries] = MiniMenuAction.IGNORELIST_DEL;
            this.menuNumEntries++;
            return true;
        }

        return false;
    }

    // todo: order
    private combatColourCode(viewerLevel: number, otherLevel: number): string {
        const diff: number = viewerLevel - otherLevel;
        if (diff < -9) {
            return '@red@';
        } else if (diff < -6) {
            return '@or3@';
        } else if (diff < -3) {
            return '@or2@';
        } else if (diff < 0) {
            return '@or1@';
        } else if (diff > 9) {
            return '@gre@';
        } else if (diff > 6) {
            return '@gr3@';
        } else if (diff > 3) {
            return '@gr2@';
        } else if (diff > 0) {
            return '@gr1@';
        } else {
            return '@yel@';
        }
    }

    private drawInterface(com: IfType, x: number, y: number, scrollY: number): void {
        if (com.type !== 0 || !com.children || (com.hide && this.overMainComId !== com.id && this.overSideComId !== com.id && this.overChatComId !== com.id)) {
            return;
        }

        const left: number = Pix2D.clipMinX;
        const top: number = Pix2D.clipMinY;
        const right: number = Pix2D.clipMaxX;
        const bottom: number = Pix2D.clipMaxY;

        Pix2D.setClipping(x, y, x + com.width, y + com.height);

        const children: number = com.children.length;
        for (let i: number = 0; i < children; i++) {
            if (!com.childX || !com.childY) {
                continue;
            }

            let childX: number = com.childX[i] + x;
            let childY: number = com.childY[i] + y - scrollY;

            const child: IfType = IfType.list[com.children[i]];
            childX += child.x;
            childY += child.y;

            if (child.clientCode > 0) {
                this.clientComponent(child);
            }

            if (child.type === ComponentType.TYPE_LAYER) {
                if (child.scrollPos > child.scrollHeight - child.height) {
                    child.scrollPos = child.scrollHeight - child.height;
                }

                if (child.scrollPos < 0) {
                    child.scrollPos = 0;
                }

                this.drawInterface(child, childX, childY, child.scrollPos);

                if (child.scrollHeight > child.height) {
                    this.drawScrollbar(childX + child.width, childY, child.scrollPos, child.scrollHeight, child.height);
                }
            } else if (child.type === ComponentType.TYPE_INV) {
                let slot: number = 0;

                for (let row: number = 0; row < child.height; row++) {
                    for (let col: number = 0; col < child.width; col++) {
                        if (!child.invBackgroundX || !child.invBackgroundY || !child.linkObjType || !child.linkObjNumber) {
                            continue;
                        }

                        let slotX: number = childX + col * (child.marginX + 32);
                        let slotY: number = childY + row * (child.marginY + 32);

                        if (slot < 20) {
                            slotX += child.invBackgroundX[slot];
                            slotY += child.invBackgroundY[slot];
                        }

                        if (child.linkObjType[slot] > 0) {
                            let dx: number = 0;
                            let dy: number = 0;
                            const id: number = child.linkObjType[slot] - 1;

                            if ((slotX > Pix2D.clipMinX - 32 && slotX < Pix2D.clipMaxX && slotY > Pix2D.clipMinY - 32 && slotY < Pix2D.clipMaxY) || (this.objDragArea !== 0 && this.objDragSlot === slot)) {
                                let outline = 0;
                                if (this.useMode == 1 && this.objSelectedSlot == slot && this.objSelectedComId == child.id) {
                                    outline = 16777215;
                                }

                                const icon: Pix32 | null = ObjType.getSprite(id, child.linkObjNumber[slot], outline);
                                if (icon) {
                                    if (this.objDragArea !== 0 && this.objDragSlot === slot && this.objDragComId === child.id) {
                                        dx = this.mouseX - this.objGrabX;
                                        dy = this.mouseY - this.objGrabY;

                                        if (dx < 5 && dx > -5) {
                                            dx = 0;
                                        }

                                        if (dy < 5 && dy > -5) {
                                            dy = 0;
                                        }

                                        if (this.objDragCycles < 5) {
                                            dx = 0;
                                            dy = 0;
                                        }

                                        icon.transPlotSprite(slotX + dx, slotY + dy, 128);

                                        if (slotY + dy < Pix2D.clipMinY && com.scrollPos > 0) {
                                            let autoscroll = ((Pix2D.clipMinY - slotY - dy) * this.worldUpdateNum) / 3;
                                            if (autoscroll > this.worldUpdateNum * 10) {
                                                autoscroll = this.worldUpdateNum * 10;
                                            }

                                            if (autoscroll > com.scrollPos) {
                                                autoscroll = com.scrollPos;
                                            }

                                            com.scrollPos -= autoscroll;
                                            this.objGrabY += autoscroll;
                                        }

                                        if (slotY + dy + 32 > Pix2D.clipMaxY && com.scrollPos < com.scrollHeight - com.height) {
                                            let autoscroll = ((slotY + dy + 32 - Pix2D.clipMaxY) * this.worldUpdateNum) / 3;
                                            if (autoscroll > this.worldUpdateNum * 10) {
                                                autoscroll = this.worldUpdateNum * 10;
                                            }

                                            if (autoscroll > com.scrollHeight - com.height - com.scrollPos) {
                                                autoscroll = com.scrollHeight - com.height - com.scrollPos;
                                            }

                                            com.scrollPos += autoscroll;
                                            this.objGrabY -= autoscroll;
                                        }
                                    } else if (this.selectedArea !== 0 && this.selectedItem === slot && this.selectedComId === child.id) {
                                        icon.transPlotSprite(slotX, slotY, 128);
                                    } else {
                                        icon.plotSprite(slotX, slotY);
                                    }

                                    if (icon.owi === 33 || child.linkObjNumber[slot] !== 1) {
                                        const count: number = child.linkObjNumber[slot];
                                        this.p11?.drawString(this.invNumber(count), slotX + dx + 1, slotY + 10 + dy, Colour.BLACK);
                                        this.p11?.drawString(this.invNumber(count), slotX + dx, slotY + 9 + dy, Colour.YELLOW);
                                    }
                                }
                            }
                        } else if (child.invBackground && slot < 20) {
                            const image: Pix32 | null = child.invBackground[slot];
                            image?.plotSprite(slotX, slotY);
                        }

                        slot++;
                    }
                }
            } else if (child.type === ComponentType.TYPE_RECT) {
                let hovered: boolean = false;
                if (this.overChatComId === child.id || this.overSideComId === child.id || this.overMainComId === child.id) {
                    hovered = true;
                }

                let colour: number = 0;
                if (this.getIfActive(child)) {
                    colour = child.colour2;

                    if (hovered && child.colour2Over !== 0) {
                        colour = child.colour2Over;
                    }
                } else {
                    colour = child.colour;

                    if (hovered && child.colourOver !== 0) {
                        colour = child.colourOver;
                    }
                }

                if (child.trans === 0) {
                    if (child.fill) {
                        Pix2D.fillRect(childX, childY, child.width, child.height, colour);
                    } else {
                        Pix2D.drawRect(childX, childY, child.width, child.height, colour);
                    }
                } else if (child.fill) {
                    Pix2D.fillRectTrans(childX, childY, child.width, child.height, colour, 256 - (child.trans & 0xff));
                } else {
                    Pix2D.drawRect(childX, childY, child.width, child.height, colour);
                    Pix2D.drawRectTrans(childX, childY, child.width, child.height, colour, 256 - (child.trans & 0xff));
                }
            } else if (child.type === ComponentType.TYPE_TEXT) {
                const font: PixFont | null = child.font;
                let text: string | null = child.text;

                let hovered: boolean = false;
                if (this.overChatComId === child.id || this.overSideComId === child.id || this.overMainComId === child.id) {
                    hovered = true;
                }

                let colour: number = 0;
                if (this.getIfActive(child)) {
                    colour = child.colour2;

                    if (hovered && child.colour2Over !== 0) {
                        colour = child.colour2Over;
                    }

                    if (child.text2 && child.text2.length > 0) {
                        text = child.text2;
                    }
                } else {
                    colour = child.colour;

                    if (hovered && child.colourOver !== 0) {
                        colour = child.colourOver;
                    }
                }

                if (child.buttonType === ButtonType.BUTTON_CONTINUE && this.resumedPauseButton) {
                    text = 'Please wait...';
                    colour = child.colour;
                }

                if (Pix2D.width == 479) {
                    if (colour == 0xffff00) {
                        colour = 0x0000ff;
                    }

                    if (colour == 0x00c000) {
                        colour = 0xffffff;
                    }
                }

                if (!font || !text) {
                    continue;
                }

                for (let lineY: number = childY + font.height; text.length > 0; lineY += font.height) {
                    if (text.indexOf('%') !== -1) {
                        do {
                            const index: number = text.indexOf('%1');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.inf(this.getIfVar(child, 0)) + text.substring(index + 2);
                        } while (true);

                        do {
                            const index: number = text.indexOf('%2');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.inf(this.getIfVar(child, 1)) + text.substring(index + 2);
                        } while (true);

                        do {
                            const index: number = text.indexOf('%3');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.inf(this.getIfVar(child, 2)) + text.substring(index + 2);
                        } while (true);

                        do {
                            const index: number = text.indexOf('%4');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.inf(this.getIfVar(child, 3)) + text.substring(index + 2);
                        } while (true);

                        do {
                            const index: number = text.indexOf('%5');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.inf(this.getIfVar(child, 4)) + text.substring(index + 2);
                        } while (true);
                    }

                    const newline: number = text.indexOf('\\n');
                    let split: string;
                    if (newline !== -1) {
                        split = text.substring(0, newline);
                        text = text.substring(newline + 2);
                    } else {
                        split = text;
                        text = '';
                    }

                    if (child.centre) {
                        font.centreStringTag(split, childX + ((child.width / 2) | 0), lineY, colour, child.shadow);
                    } else {
                        font.drawStringTag(split, childX, lineY, colour, child.shadow);
                    }
                }
            } else if (child.type === ComponentType.TYPE_GRAPHIC) {
                let image: Pix32 | null;
                if (this.getIfActive(child)) {
                    image = child.graphic2;
                } else {
                    image = child.graphic;
                }

                image?.plotSprite(childX, childY);
            } else if (child.type === ComponentType.TYPE_MODEL) {
                const tmpX: number = Pix3D.originX;
                const tmpY: number = Pix3D.originY;

                Pix3D.originX = childX + ((child.width / 2) | 0);
                Pix3D.originY = childY + ((child.height / 2) | 0);

                const eyeY: number = (Pix3D.sinTable[child.modelXAn] * child.modelZoom) >> 16;
                const eyeZ: number = (Pix3D.cosTable[child.modelXAn] * child.modelZoom) >> 16;

                const active: boolean = this.getIfActive(child);

                let seqId: number;
                if (active) {
                    seqId = child.modelAnim2;
                } else {
                    seqId = child.modelAnim;
                }

                let model: Model | null = null;
                if (seqId === -1) {
                    model = child.getTempModel(-1, -1, active, this.localPlayer);
                } else {
                    const seq: SeqType = SeqType.list[seqId];
                    if (seq.frames && seq.iframes) {
                        model = child.getTempModel(seq.frames[child.animFrame], seq.iframes[child.animFrame], active, this.localPlayer);
                    }
                }

                if (model) {
                    model.objRender(0, child.modelYAn, 0, child.modelXAn, 0, eyeY, eyeZ);
                }

                Pix3D.originX = tmpX;
                Pix3D.originY = tmpY;
            } else if (child.type === ComponentType.TYPE_INV_TEXT) {
                const font: PixFont | null = child.font;
                if (!font || !child.linkObjType || !child.linkObjNumber) {
                    continue;
                }

                let slot: number = 0;
                for (let row: number = 0; row < child.height; row++) {
                    for (let col: number = 0; col < child.width; col++) {
                        if (child.linkObjType[slot] > 0) {
                            const obj: ObjType = ObjType.list(child.linkObjType[slot] - 1);
                            let text: string | null = obj.name;
                            if (obj.stackable || child.linkObjNumber[slot] !== 1) {
                                text = text + ' x' + this.niceNumber(child.linkObjNumber[slot]);
                            }

                            if (!text) {
                                continue;
                            }

                            const textX: number = childX + col * (child.marginX + 115);
                            const textY: number = childY + row * (child.marginY + 12);

                            if (child.centre) {
                                font.centreStringTag(text, textX + ((child.width / 2) | 0), textY, child.colour, child.shadow);
                            } else {
                                font.drawStringTag(text, textX, textY, child.colour, child.shadow);
                            }
                        }

                        slot++;
                    }
                }
            }
        }

        Pix2D.setClipping(left, top, right, bottom);
    }

    // todo: order
    private invNumber(amount: number): string {
        if (amount < 100000) {
            return String(amount);
        } else if (amount < 10000000) {
            return ((amount / 1000) | 0) + 'K';
        } else {
            return ((amount / 1000000) | 0) + 'M';
        }
    }

    private niceNumber(amount: number): string {
        let s: string = String(amount);
        for (let i: number = s.length - 3; i > 0; i -= 3) {
            s = s.substring(0, i) + ',' + s.substring(i);
        }
        if (s.length > 8) {
            s = '@gre@' + s.substring(0, s.length - 8) + ' million @whi@(' + s + ')';
        } else if (s.length > 4) {
            s = '@cya@' + s.substring(0, s.length - 4) + 'K @whi@(' + s + ')';
        }
        return ' ' + s;
    }

    private doScrollbar(x: number, y: number, scrollableHeight: number, height: number, redraw: boolean, left: number, top: number, com: IfType): void {
        if (this.scrollGrabbed) {
            this.scrollInputPadding = 32;
        } else {
            this.scrollInputPadding = 0;
        }

        this.scrollGrabbed = false;

        if (x >= left && x < left + 16 && y >= top && y < top + 16) {
            com.scrollPos -= this.scrollCycle * 4;

            if (redraw) {
                this.redrawSide = true;
            }
        } else if (x >= left && x < left + 16 && y >= top + height - 16 && y < top + height) {
            com.scrollPos += this.scrollCycle * 4;

            if (redraw) {
                this.redrawSide = true;
            }
        } else if (x >= left - this.scrollInputPadding && x < left + this.scrollInputPadding + 16 && y >= top + 16 && y < top + height - 16 && this.scrollCycle > 0) {
            let gripSize: number = (((height - 32) * height) / scrollableHeight) | 0;
            if (gripSize < 8) {
                gripSize = 8;
            }

            const gripY: number = y - top - ((gripSize / 2) | 0) - 16;
            const maxY: number = height - gripSize - 32;

            com.scrollPos = (((scrollableHeight - height) * gripY) / maxY) | 0;

            if (redraw) {
                this.redrawSide = true;
            }

            this.scrollGrabbed = true;
        }
    }

    private drawScrollbar(x: number, y: number, scrollY: number, scrollHeight: number, height: number): void {
        this.scrollbar1?.plotSprite(x, y);
        this.scrollbar2?.plotSprite(x, y + height - 16);
        Pix2D.fillRect(x, y + 16, 16, height - 32, SCROLLBAR_TRACK);

        let gripSize: number = (((height - 32) * height) / scrollHeight) | 0;
        if (gripSize < 8) {
            gripSize = 8;
        }

        const gripY: number = (((height - gripSize - 32) * scrollY) / (scrollHeight - height)) | 0;
        Pix2D.fillRect(x, y + gripY + 16, 16, gripSize, SCROLLBAR_GRIP_FOREGROUND);

        Pix2D.vline(x, y + gripY + 16, gripSize, SCROLLBAR_GRIP_HIGHLIGHT);
        Pix2D.vline(x + 1, y + gripY + 16, gripSize, SCROLLBAR_GRIP_HIGHLIGHT);

        Pix2D.hline(x, y + gripY + 16, 16, SCROLLBAR_GRIP_HIGHLIGHT);
        Pix2D.hline(x, y + gripY + 17, 16, SCROLLBAR_GRIP_HIGHLIGHT);

        Pix2D.vline(x + 15, y + gripY + 16, gripSize, SCROLLBAR_GRIP_LOWLIGHT);
        Pix2D.vline(x + 14, y + gripY + 17, gripSize - 1, SCROLLBAR_GRIP_LOWLIGHT);

        Pix2D.hline(x, y + gripY + gripSize + 15, 16, SCROLLBAR_GRIP_LOWLIGHT);
        Pix2D.hline(x + 1, y + gripY + gripSize + 14, 15, SCROLLBAR_GRIP_LOWLIGHT);
    }

    private inf(value: number): string {
        return value < 999999999 ? String(value) : '*';
    }

    private getIfActive(com: IfType): boolean {
        if (!com.scriptComparator) {
            return false;
        }

        for (let i: number = 0; i < com.scriptComparator.length; i++) {
            if (!com.scriptOperand) {
                return false;
            }

            const value: number = this.getIfVar(com, i);
            const operand: number = com.scriptOperand[i];

            if (com.scriptComparator[i] === 2) {
                if (value >= operand) {
                    return false;
                }
            } else if (com.scriptComparator[i] === 3) {
                if (value <= operand) {
                    return false;
                }
            } else if (com.scriptComparator[i] === 4) {
                if (value === operand) {
                    return false;
                }
            } else if (value !== operand) {
                return false;
            }
        }

        return true;
    }

    private getIfVar(com: IfType, scriptId: number): number {
        if (!com.scripts || scriptId >= com.scripts.length) {
            return -2;
        }

        try {
            const script: Uint16Array | null = com.scripts[scriptId];
            if (!script) {
                return -1;
            }

            let acc = 0;
            let pc: number = 0;
            let arithmetic = 0;

            while (true) {
                let register: number = 0;
                let nextArithmetic: number = 0;

                const opcode: number = script[pc++];
                if (opcode === 0) {
                    return acc;
                }

                if (opcode === 1) {
                    // stat_level {skill}
                    register = this.statEffectiveLevel[script[pc++]];
                } else if (opcode === 2) {
                    // stat_base_level {skill}
                    register = this.statBaseLevel[script[pc++]];
                } else if (opcode === 3) {
                    // stat_xp {skill}
                    register = this.statXP[script[pc++]];
                } else if (opcode === 4) {
                    // inv_count {interface id} {obj id}
                    const com: IfType = IfType.list[script[pc++]];
                    const obj: number = script[pc++] + 1;

                    if (com.linkObjType && com.linkObjNumber && obj >= 0 && obj < ObjType.numDefinitions && (!ObjType.list(obj).members || Client.memServer)) {
                        for (let i: number = 0; i < com.linkObjType.length; i++) {
                            if (com.linkObjType[i] === obj) {
                                register += com.linkObjNumber[i];
                            }
                        }
                    }
                } else if (opcode === 5) {
                    // pushvar {id}
                    register = this.var[script[pc++]];
                } else if (opcode === 6) {
                    // stat_xp_remaining {skill}
                    register = Client.levelExperience[this.statBaseLevel[script[pc++]] - 1];
                } else if (opcode === 7) {
                    register = ((this.var[script[pc++]] * 100) / 46875) | 0;
                } else if (opcode === 8) {
                    // combat level
                    register = this.localPlayer?.combatLevel || 0;
                } else if (opcode === 9) {
                    // total level
                    for (let i: number = 0; i < Skill.count; i++) {
                        if (Skill.used[i]) {
                            register += this.statBaseLevel[i];
                        }
                    }
                } else if (opcode === 10) {
                    // inv_contains {interface id} {obj id}
                    const com: IfType = IfType.list[script[pc++]];
                    const obj: number = script[pc++] + 1;

                    if (com.linkObjType && obj >= 0 && obj < ObjType.numDefinitions && (!ObjType.list(obj).members || Client.memServer)) {
                        for (let i: number = 0; i < com.linkObjType.length; i++) {
                            if (com.linkObjType[i] === obj) {
                                register = 999999999;
                                break;
                            }
                        }
                    }
                } else if (opcode === 11) {
                    // runenergy
                    register = this.runenergy;
                } else if (opcode === 12) {
                    // runweight
                    register = this.runweight;
                } else if (opcode === 13) {
                    // testbit {varp} {bit: 0..31}
                    const varp: number = this.var[script[pc++]];
                    const lsb: number = script[pc++];

                    register = (varp & (0x1 << lsb)) === 0 ? 0 : 1;
                } else if (opcode === 14) {
                    // push_varbit {varbit}
                    const varbit: VarBitType = VarBitType.list[script[pc++]];
                    const { basevar, startbit, endbit } = varbit;

                    const mask = Client.readbit[endbit - startbit];
                    register = (this.var[basevar] >> startbit) & mask;
                } else if (opcode === 15) {
                    // subtract
                    nextArithmetic = 1;
                } else if (opcode === 16) {
                    // divide
                    nextArithmetic = 2;
                } else if (opcode === 17) {
                    // multiply
                    nextArithmetic = 3;
                } else if (opcode === 18) {
                    // coordx
                    if (this.localPlayer) {
                        register = (this.localPlayer.x >> 7) + this.mapBuildBaseX;
                    }
                } else if (opcode === 19) {
                    // coordz
                    if (this.localPlayer) {
                        register = (this.localPlayer.z >> 7) + this.mapBuildBaseZ;
                    }
                } else if (opcode === 20) {
                    // push_constant
                    register = script[pc++];
                }

                if (nextArithmetic === 0) {
                    if (arithmetic === 0) {
                        acc += register;
                    } else if (arithmetic === 1) {
                        acc -= register;
                    } else if (arithmetic === 2 && register !== 0) {
                        acc = (acc / register) | 0;
                    } else if (arithmetic === 3) {
                        acc = (acc * register) | 0;
                    }

                    arithmetic = 0;
                } else {
                    arithmetic = nextArithmetic;
                }
            }
        } catch (_e) {
            return -1;
        }
    }

    private ifAnimReset(id: number): void {
        const parent: IfType = IfType.list[id];
        if (!parent.children) {
            return;
        }

        for (let i: number = 0; i < parent.children.length && parent.children[i] !== -1; i++) {
            const child: IfType = IfType.list[parent.children[i]];

            if (child.type === 1) {
                this.ifAnimReset(child.id);
            }

            child.animFrame = 0;
            child.animCycle = 0;
        }
    }

    private animateInterface(id: number, delta: number): boolean {
        const parent: IfType = IfType.list[id];
        if (!parent.children) {
            return false;
        }

        let updated: boolean = false;

        for (let i: number = 0; i < parent.children.length && parent.children[i] !== -1; i++) {
            const child: IfType = IfType.list[parent.children[i]];
            if (child.type === 1) {
                updated ||= this.animateInterface(child.id, delta);
            }

            if (child.type === 6 && (child.modelAnim !== -1 || child.modelAnim2 !== -1)) {
                const active: boolean = this.getIfActive(child);

                let seqId: number;
                if (active) {
                    seqId = child.modelAnim2;
                } else {
                    seqId = child.modelAnim;
                }

                if (seqId !== -1) {
                    const type: SeqType = SeqType.list[seqId];
                    child.animCycle += delta;

                    while (child.animCycle > type.getDelay(child.animFrame)) {
                        child.animCycle -= type.getDelay(child.animFrame) + 1;
                        child.animFrame++;

                        if (child.animFrame >= type.numFrames) {
                            child.animFrame -= type.loops;

                            if (child.animFrame < 0 || child.animFrame >= type.numFrames) {
                                child.animFrame = 0;
                            }
                        }

                        updated = true;
                    }
                }
            }
        }

        return updated;
    }

    private clientVar(id: number): void {
        const clientcode: number = VarpType.list[id].clientcode;
        if (clientcode === 0) {
            return;
        }

        const value: number = this.var[id];
        if (clientcode === 1) {
            if (value === 1) {
                Pix3D.initColourTable(0.9);
            } else if (value === 2) {
                Pix3D.initColourTable(0.8);
            } else if (value === 3) {
                Pix3D.initColourTable(0.7);
            } else if (value === 4) {
                Pix3D.initColourTable(0.6);
            }

            ObjType.spriteCache?.clear();
            this.redrawFrame = true;
        } else if (clientcode === 3) {
            const lastMidiActive: boolean = this.midiActive;

            if (value === 0) {
                this.midiVolume = 0; // +0 dB
                this.midiActive = true;
            } else if (value === 1) {
                this.midiVolume = -4; // -4 dB
                this.midiActive = true;
            } else if (value === 2) {
                this.midiVolume = -8; // -8 dB
                this.midiActive = true;
            } else if (value === 3) {
                this.midiVolume = -12; // -12 dB
                this.midiActive = true;
            } else if (value === 4) {
                this.midiActive = false;
            }

            if (this.midiActive) {
                setMidiVolume(this.midiVolume);
            }

            if (this.midiActive !== lastMidiActive) {
                if (this.midiActive) {
                    this.midiSong = this.nextMidiSong;
                    this.midiFading = true;
                    this.onDemand?.request(2, this.midiSong);
                } else {
                    stopMidi(false);
                }

                this.nextMusicDelay = 0;
            }
        } else if (clientcode === 4) {
            if (value === 0) {
                this.waveVolume = 0; // +0 dB
                this.waveEnabled = true;
            } else if (value === 1) {
                this.waveVolume = -4; // -4 dB
                this.waveEnabled = true;
            } else if (value === 2) {
                this.waveVolume = -8; // -8 dB
                this.waveEnabled = true;
            } else if (value === 3) {
                this.waveVolume = -12; // -12 dB
                this.waveEnabled = true;
            } else if (value === 4) {
                this.waveEnabled = false;
            }

            if (this.waveEnabled) {
                setWaveVolume(this.waveVolume);
            }
        } else if (clientcode === 5) {
            this.oneMouseButton = value;
        } else if (clientcode === 6) {
            this.chatEffects = value;
        } else if (clientcode === 8) {
            this.splitPrivateChat = value;
            this.redrawChat = true;
        } else if (clientcode === 9) {
            this.bankArrangeMode = value;
        }
    }

    private clientComponent(com: IfType): void {
        let clientCode: number = com.clientCode;

        if ((clientCode >= ClientCode.CC_FRIENDS_START && clientCode <= ClientCode.CC_FRIENDS_END) || (clientCode >= ClientCode.CC_FRIENDS2_START && clientCode <= ClientCode.CC_FRIENDS2_END)) {
            if (clientCode === ClientCode.CC_FRIENDS_START && this.friendServerStatus === 0) {
                com.text = 'Loading friend list';
                com.buttonType = 0;
            } else if (clientCode === ClientCode.CC_FRIENDS_START && this.friendServerStatus === 1) {
                com.text = 'Connecting to friendserver';
                com.buttonType = 0;
            } else if (clientCode === 2 && this.friendServerStatus !== 2) {
                com.text = 'Please wait...';
                com.buttonType = 0;
            } else {
                let count = this.friendCount;
                if (this.friendServerStatus != 2) {
                    count = 0;
                }

                if (clientCode > 700) {
                    clientCode -= 601;
                } else {
                    clientCode -= 1;
                }

                if (clientCode >= count) {
                    com.text = '';
                    com.buttonType = 0;
                } else {
                    com.text = this.friendUsername[clientCode];
                    com.buttonType = 1;
                }
            }
        } else if ((clientCode >= ClientCode.CC_FRIENDS_UPDATE_START && clientCode <= ClientCode.CC_FRIENDS_UPDATE_END) || (clientCode >= ClientCode.CC_FRIENDS2_UPDATE_START && clientCode <= ClientCode.CC_FRIENDS2_UPDATE_END)) {
            let count = this.friendCount;
            if (this.friendServerStatus != 2) {
                count = 0;
            }

            if (clientCode > 800) {
                clientCode -= 701;
            } else {
                clientCode -= 101;
            }

            if (clientCode >= count) {
                com.text = '';
                com.buttonType = 0;
            } else {
                if (this.friendNodeId[clientCode] === 0) {
                    com.text = '@red@Offline';
                } else if (this.friendNodeId[clientCode] === Client.nodeId) {
                    com.text = '@gre@World-' + (this.friendNodeId[clientCode] - 9);
                } else {
                    com.text = '@yel@World-' + (this.friendNodeId[clientCode] - 9);
                }

                com.buttonType = 1;
            }
        } else if (clientCode === ClientCode.CC_FRIENDS_SIZE) {
            let count = this.friendCount;
            if (this.friendServerStatus != 2) {
                count = 0;
            }

            com.scrollHeight = count * 15 + 20;

            if (com.scrollHeight <= com.height) {
                com.scrollHeight = com.height + 1;
            }
        } else if (clientCode >= ClientCode.CC_IGNORES_START && clientCode <= ClientCode.CC_IGNORES_END) {
            clientCode -= ClientCode.CC_IGNORES_START;

            if (clientCode >= this.ignoreCount) {
                com.text = '';
                com.buttonType = 0;
            } else {
                com.text = JString.toScreenName(JString.toRawUsername(this.ignoreUserhash[clientCode]));
                com.buttonType = 1;
            }
        } else if (clientCode === ClientCode.CC_IGNORES_SIZE) {
            com.scrollHeight = this.ignoreCount * 15 + 20;

            if (com.scrollHeight <= com.height) {
                com.scrollHeight = com.height + 1;
            }
        } else if (clientCode === ClientCode.CC_DESIGN_PREVIEW) {
            com.modelXAn = 150;
            com.modelYAn = ((Math.sin(Client.loopCycle / 40.0) * 256.0) | 0) & 0x7ff;

            if (this.idkDesignRedraw) {
                for (let i = 0; i < 7; i++) {
                    const kit = this.idkDesignPart[i];
                    if (kit >= 0 && !IdkType.list[kit].checkModel()) {
                        return;
                    }
                }

                this.idkDesignRedraw = false;

                const models: (Model | null)[] = new TypedArray1d(7, null);
                let modelCount: number = 0;
                for (let part: number = 0; part < 7; part++) {
                    const kit: number = this.idkDesignPart[part];
                    if (kit >= 0) {
                        models[modelCount++] = IdkType.list[kit].getModelNoCheck();
                    }
                }

                const model: Model = Model.combineForAnim(models, modelCount);
                for (let part: number = 0; part < 5; part++) {
                    if (this.idkDesignColour[part] !== 0) {
                        model.recolour(ClientPlayer.recol1d[part][0], ClientPlayer.recol1d[part][this.idkDesignColour[part]]);

                        if (part === 1) {
                            model.recolour(ClientPlayer.recol2d[0], ClientPlayer.recol2d[this.idkDesignColour[part]]);
                        }
                    }
                }

                model.prepareAnim();
                model.calculateNormals(64, 850, -30, -50, -30, true);

                if (this.localPlayer) {
                    const frames: Int16Array | null = SeqType.list[this.localPlayer.readyanim].frames;
                    if (frames) {
                        model.animate(frames[0]);
                    }
                }

                com.model1Type = 5;
                com.model1Id = 0;
                IfType.cacheModel(model, 5, 0);
            }
        } else if (clientCode === ClientCode.CC_SWITCH_TO_MALE) {
            if (!this.idkDesignButton1) {
                this.idkDesignButton1 = com.graphic;
                this.idkDesignButton2 = com.graphic2;
            }

            if (this.idkDesignGender) {
                com.graphic = this.idkDesignButton2;
            } else {
                com.graphic = this.idkDesignButton1;
            }
        } else if (clientCode === ClientCode.CC_SWITCH_TO_FEMALE) {
            if (!this.idkDesignButton1) {
                this.idkDesignButton1 = com.graphic;
                this.idkDesignButton2 = com.graphic2;
            }

            if (this.idkDesignGender) {
                com.graphic = this.idkDesignButton1;
            } else {
                com.graphic = this.idkDesignButton2;
            }
        } else if (clientCode === ClientCode.CC_REPORT_INPUT) {
            com.text = this.reportAbuseInput;

            if (Client.loopCycle % 20 < 10) {
                com.text = com.text + '|';
            } else {
                com.text = com.text + ' ';
            }
        } else if (clientCode === ClientCode.CC_MOD_MUTE) {
            if (this.staffmodlevel < 1) {
                com.text = '';
            } else if (this.reportAbuseMuteOption) {
                com.colour = Colour.RED;
                com.text = 'Moderator option: Mute player for 48 hours: <ON>';
            } else {
                com.colour = Colour.WHITE;
                com.text = 'Moderator option: Mute player for 48 hours: <OFF>';
            }
        } else if (clientCode === ClientCode.CC_LAST_LOGIN_INFO || clientCode === ClientCode.CC_LAST_LOGIN_INFO2) {
            if (this.lastAddress === 0) {
                com.text = '';
            } else {
                let text: string;
                if (this.daysSinceLastLogin === 0) {
                    text = 'earlier today';
                } else if (this.daysSinceLastLogin === 1) {
                    text = 'yesterday';
                } else {
                    text = this.daysSinceLastLogin + ' days ago';
                }

                com.text = `You last logged in ${text}`;

                // custom: we're using localhost as a privacy flag for now
                let ipStr = JString.formatIPv4(this.lastAddress);
                if (!ipStr.startsWith('127.')) {
                    com.text += ` from: ${this.dnsReq ?? ipStr}`;
                }
            }
        } else if (clientCode === ClientCode.CC_UNREAD_MESSAGES) {
            if (this.unreadMessages === 0) {
                com.text = '0 unread messages';
                com.colour = Colour.YELLOW;
            } else if (this.unreadMessages === 1) {
                com.text = '1 unread message';
                com.colour = Colour.GREEN;
            } else if (this.unreadMessages > 1) {
                com.text = this.unreadMessages + ' unread messages';
                com.colour = Colour.GREEN;
            }
        } else if (clientCode === ClientCode.CC_RECOVERY1) {
            if (this.daysSinceRecoveriesChanged === 201) {
                if (this.warnMembersInNonMembers == 1) {
                    com.text = '@yel@This is a non-members world: @whi@Since you are a member we';
                } else {
                    com.text = '';
                }
            } else if (this.daysSinceRecoveriesChanged === 200) {
                com.text = 'You have not yet set any password recovery questions.';
            } else {
                let text: string;
                if (this.daysSinceRecoveriesChanged === 0) {
                    text = 'Earlier today';
                } else if (this.daysSinceRecoveriesChanged === 1) {
                    text = 'Yesterday';
                } else {
                    text = this.daysSinceRecoveriesChanged + ' days ago';
                }

                com.text = text + ' you changed your recovery questions';
            }
        } else if (clientCode === ClientCode.CC_RECOVERY2) {
            if (this.daysSinceRecoveriesChanged === 201) {
                if (this.warnMembersInNonMembers == 1) {
                    com.text = '@whi@recommend you use a members world instead. You may use';
                } else {
                    com.text = '';
                }
            } else if (this.daysSinceRecoveriesChanged === 200) {
                com.text = 'We strongly recommend you do so now to secure your account.';
            } else {
                com.text = 'If you do not remember making this change then cancel it immediately';
            }
        } else if (clientCode === ClientCode.CC_RECOVERY3) {
            if (this.daysSinceRecoveriesChanged === 201) {
                if (this.warnMembersInNonMembers == 1) {
                    com.text = '@whi@this world but member benefits are unavailable whilst here.';
                } else {
                    com.text = '';
                }
            } else if (this.daysSinceRecoveriesChanged === 200) {
                com.text = "Do this from the 'account management' area on our front webpage";
            } else {
                com.text = "Do this from the 'account management' area on our front webpage";
            }
        }
    }

    private closeModal(): void {
        this.out.p1Enc(ClientProt.CLOSE_MODAL);

        if (this.sideModalId !== -1) {
            this.sideModalId = -1;
            this.redrawSide = true;
            this.resumedPauseButton = false;
            this.redrawIcons = true;
        }

        if (this.chatModalId !== -1) {
            this.chatModalId = -1;
            this.redrawChat = true;
            this.resumedPauseButton = false;
        }

        this.mainModalId = -1;
    }

    private clientButton(com: IfType): boolean {
        const clientCode: number = com.clientCode;

        if (this.friendServerStatus === 2) {
            if (clientCode === ClientCode.CC_ADD_FRIEND) {
                this.redrawChat = true;
                this.dialogInputOpen = false;
                this.socialInputOpen = true;
                this.socialInput = '';
                this.socialInputType = 1;
                this.socialInputHeader = 'Enter name of friend to add to list';
            } else if (clientCode === ClientCode.CC_DEL_FRIEND) {
                this.redrawChat = true;
                this.dialogInputOpen = false;
                this.socialInputOpen = true;
                this.socialInput = '';
                this.socialInputType = 2;
                this.socialInputHeader = 'Enter name of friend to delete from list';
            }
        }

        if (clientCode === ClientCode.CC_LOGOUT) {
            console.warn('[LOGOUT DEBUG] User clicked logout button (CC_LOGOUT) - setting idleTimeout=250');
            this.logoutTimer = 250;
            return true;
        } else if (clientCode === ClientCode.CC_ADD_IGNORE) {
            this.redrawChat = true;
            this.dialogInputOpen = false;
            this.socialInputOpen = true;
            this.socialInput = '';
            this.socialInputType = 4;
            this.socialInputHeader = 'Enter name of player to add to list';
        } else if (clientCode === ClientCode.CC_DEL_IGNORE) {
            this.redrawChat = true;
            this.dialogInputOpen = false;
            this.socialInputOpen = true;
            this.socialInput = '';
            this.socialInputType = 5;
            this.socialInputHeader = 'Enter name of player to delete from list';
        } else if (clientCode >= ClientCode.CC_CHANGE_HEAD_L && clientCode <= ClientCode.CC_CHANGE_FEET_R) {
            const part: number = ((clientCode - 300) / 2) | 0;
            const direction: number = clientCode & 0x1;
            let kit: number = this.idkDesignPart[part];

            if (kit !== -1) {
                while (true) {
                    if (direction === 0) {
                        kit--;
                        if (kit < 0) {
                            kit = IdkType.numDefinitions - 1;
                        }
                    }

                    if (direction === 1) {
                        kit++;
                        if (kit >= IdkType.numDefinitions) {
                            kit = 0;
                        }
                    }

                    if (!IdkType.list[kit].disable && IdkType.list[kit].part === part + (this.idkDesignGender ? 0 : 7)) {
                        this.idkDesignPart[part] = kit;
                        this.idkDesignRedraw = true;
                        break;
                    }
                }
            }
        } else if (clientCode >= ClientCode.CC_RECOLOUR_HAIR_L && clientCode <= ClientCode.CC_RECOLOUR_SKIN_R) {
            const part: number = ((clientCode - 314) / 2) | 0;
            const direction: number = clientCode & 0x1;
            let colour: number = this.idkDesignColour[part];

            if (direction === 0) {
                colour--;
                if (colour < 0) {
                    colour = ClientPlayer.recol1d[part].length - 1;
                }
            }

            if (direction === 1) {
                colour++;
                if (colour >= ClientPlayer.recol1d[part].length) {
                    colour = 0;
                }
            }

            this.idkDesignColour[part] = colour;
            this.idkDesignRedraw = true;
        } else if (clientCode === ClientCode.CC_SWITCH_TO_MALE && !this.idkDesignGender) {
            this.idkDesignGender = true;
            this.validateIdkDesign();
        } else if (clientCode === ClientCode.CC_SWITCH_TO_FEMALE && this.idkDesignGender) {
            this.idkDesignGender = false;
            this.validateIdkDesign();
        } else if (clientCode === ClientCode.CC_ACCEPT_DESIGN) {
            this.out.p1Enc(ClientProt.IDK_SAVEDESIGN);
            this.out.p1(this.idkDesignGender ? 0 : 1);

            for (let i: number = 0; i < 7; i++) {
                this.out.p1(this.idkDesignPart[i]);
            }

            for (let i: number = 0; i < 5; i++) {
                this.out.p1(this.idkDesignColour[i]);
            }

            return true;
        } else if (clientCode === ClientCode.CC_MOD_MUTE) {
            this.reportAbuseMuteOption = !this.reportAbuseMuteOption;
        } else if (clientCode >= ClientCode.CC_REPORT_RULE1 && clientCode <= ClientCode.CC_REPORT_RULE12) {
            this.closeModal();

            if (this.reportAbuseInput.length > 0) {
                this.out.p1Enc(ClientProt.SEND_SNAPSHOT);
                this.out.p8(JString.toUserhash(this.reportAbuseInput));
                this.out.p1(clientCode - 601);
                this.out.p1(this.reportAbuseMuteOption ? 1 : 0);
            }
        }

        return false;
    }

    private validateIdkDesign(): void {
        this.idkDesignRedraw = true;

        for (let i: number = 0; i < 7; i++) {
            this.idkDesignPart[i] = -1;

            for (let j: number = 0; j < IdkType.numDefinitions; j++) {
                if (!IdkType.list[j].disable && IdkType.list[j].part === i + (this.idkDesignGender ? 0 : 7)) {
                    this.idkDesignPart[i] = j;
                    break;
                }
            }
        }
    }

    // todo: order
    private drawSide(): void {
        this.areaSide?.setPixels();
        if (this.sideScanline) {
            Pix3D.scanline = this.sideScanline;
        }

        this.invback?.plotSprite(0, 0);

        if (this.sideModalId !== -1) {
            this.drawInterface(IfType.list[this.sideModalId], 0, 0, 0);
        } else if (this.sideIcon[this.activeIcon] !== -1) {
            this.drawInterface(IfType.list[this.sideIcon[this.activeIcon]], 0, 0, 0);
        }

        if (this.isMenuOpen && this.menuArea === 1) {
            this.drawMinimenu();
        }

        this.areaSide?.draw(553, 205);

        this.areaGame?.setPixels();
        if (this.gameScanline) {
            Pix3D.scanline = this.gameScanline;
        }
    }

    // todo: order
    private drawChat(): void {
        this.areaChat?.setPixels();
        if (this.chatScanline) {
            Pix3D.scanline = this.chatScanline;
        }

        this.chatback?.plotSprite(0, 0);

        if (this.socialInputOpen) {
            this.b12?.centreString(this.socialInputHeader, 239, 40, Colour.BLACK);
            this.b12?.centreString(this.socialInput + '*', 239, 60, Colour.DARKBLUE);
        } else if (this.dialogInputOpen) {
            this.b12?.centreString('Enter amount:', 239, 40, Colour.BLACK);
            this.b12?.centreString(this.dialogInput + '*', 239, 60, Colour.DARKBLUE);
        } else if (this.tutComMessage) {
            this.b12?.centreString(this.tutComMessage, 239, 40, Colour.BLACK);
            this.b12?.centreString('Click to continue', 239, 60, Colour.DARKBLUE);
        } else if (this.chatModalId !== -1) {
            this.drawInterface(IfType.list[this.chatModalId], 0, 0, 0);
        } else if (this.tutComId !== -1) {
            this.drawInterface(IfType.list[this.tutComId], 0, 0, 0);
        } else {
            const font: PixFont | null = this.p12;
            let line: number = 0;

            Pix2D.setClipping(0, 0, 463, 77);

            for (let i: number = 0; i < 100; i++) {
                const message: string | null = this.chatText[i];
                if (!message) {
                    continue;
                }

                const type: number = this.chatType[i];
                const y: number = this.chatScrollPos + 70 - line * 14;

                let sender = this.chatUsername[i];
                let modlevel = 0;
                if (sender && sender.startsWith('@cr1@')) {
                    sender = sender.substring(5);
                    modlevel = 1;
                } else if (sender && sender.startsWith('@cr2@')) {
                    sender = sender.substring(5);
                    modlevel = 2;
                }

                if (type === 0) {
                    if (y > 0 && y < 110) {
                        font?.drawString(message, 4, y, Colour.BLACK);
                    }

                    line++;
                } else if ((type === 1 || type === 2) && (type === 1 || this.chatPublicMode === 0 || (this.chatPublicMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        let x = 4;
                        if (modlevel == 1) {
                            this.modIcons[0].plotSprite(x, y - 12);
                            x += 14;
                        } else if (modlevel == 2) {
                            this.modIcons[1].plotSprite(x, y - 12);
                            x += 14;
                        }

                        font?.drawString(sender + ':', x, y, Colour.BLACK);
                        x += (font?.stringWid(sender) ?? 0) + 8;

                        font?.drawString(message, x, y, Colour.BLUE);
                    }

                    line++;
                } else if ((type === 3 || type === 7) && this.splitPrivateChat === 0 && (type === 7 || this.chatPrivateMode === 0 || (this.chatPrivateMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        let x = 4;

                        font?.drawString('From', x, y, Colour.BLACK);
                        x += font?.stringWid('From ') ?? 0;

                        if (modlevel == 1) {
                            this.modIcons[0].plotSprite(x, y - 12);
                            x += 14;
                        } else if (modlevel == 2) {
                            this.modIcons[1].plotSprite(x, y - 12);
                            x += 14;
                        }

                        font?.drawString(sender + ':', x, y, Colour.BLACK);
                        x += (font?.stringWid(sender) ?? 0) + 8;

                        font?.drawString(message, x, y, Colour.DARKRED);
                    }

                    line++;
                } else if (type === 4 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        font?.drawString(sender + ' ' + this.chatText[i], 4, y, 0x800080);
                    }

                    line++;
                } else if (type === 5 && this.splitPrivateChat === 0 && this.chatPrivateMode < 2) {
                    if (y > 0 && y < 110) {
                        font?.drawString(message, 4, y, Colour.DARKRED);
                    }

                    line++;
                } else if (type === 6 && this.splitPrivateChat === 0 && this.chatPrivateMode < 2) {
                    if (y > 0 && y < 110) {
                        font?.drawString('To ' + sender + ':', 4, y, Colour.BLACK);
                        font?.drawString(message, font.stringWid('To ' + sender) + 12, y, Colour.DARKRED);
                    }

                    line++;
                } else if (type === 8 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        font?.drawString(sender + ' ' + this.chatText[i], 4, y, 0x7e3200);
                    }

                    line++;
                }
            }

            Pix2D.resetClipping();

            this.chatScrollHeight = line * 14 + 7;
            if (this.chatScrollHeight < 78) {
                this.chatScrollHeight = 78;
            }

            this.drawScrollbar(463, 0, this.chatScrollHeight - this.chatScrollPos - 77, this.chatScrollHeight, 77);

            let username;
            if (this.localPlayer == null || this.localPlayer.name == null) {
                username = JString.toScreenName(this.loginUser);
            } else {
                username = this.localPlayer.name;
            }

            font?.drawString(username + ':', 4, 90, Colour.BLACK);
            font?.drawString(this.chatInput + '*', font.stringWid(username + ': ') + 6, 90, Colour.BLUE);

            Pix2D.hline(0, 77, 479, Colour.BLACK);
        }

        if (this.isMenuOpen && this.menuArea === 2) {
            this.drawMinimenu();
        }

        this.areaChat?.draw(17, 357);

        this.areaGame?.setPixels();
        if (this.gameScanline) {
            Pix3D.scanline = this.gameScanline;
        }
    }

    private minimapDraw(): void {
        if (!this.localPlayer) {
            return;
        }

        this.areaMap?.setPixels();

        if (this.minimapState == 2) {
            if (this.mapback !== null) {
                const mask = this.mapback.data;
                const pixels = Pix2D.pixels;
                const len = mask.length;
                for (let i = 0; i < len; i++) {
                    if (mask[i] === 0) {
                        pixels[i] = 0;
                    }
                }
            }

            this.compass?.scanlineRotatePlotSprite(0, 0, 33, 33, 25, 25, this.orbitCameraYaw, 256, this.compassMaskLineOffsets, this.compassMaskLineLengths);

            this.areaGame?.setPixels();
            return;
        }

        const angle: number = (this.orbitCameraYaw + this.macroMinimapAngle) & 0x7ff;
        let anchorX: number = ((this.localPlayer.x / 32) | 0) + 48;
        let anchorY: number = 464 - ((this.localPlayer.z / 32) | 0);

        this.minimap?.scanlineRotatePlotSprite(25, 5, 146, 151, anchorX, anchorY, angle, this.macroMinimapZoom + 256, this.minimapMaskLineOffsets, this.minimapMaskLineLengths);
        this.compass?.scanlineRotatePlotSprite(0, 0, 33, 33, 25, 25, this.orbitCameraYaw, 256, this.compassMaskLineOffsets, this.compassMaskLineLengths);

        for (let i: number = 0; i < this.activeMapFunctionCount; i++) {
            anchorX = this.activeMapFunctionX[i] * 4 + 2 - ((this.localPlayer.x / 32) | 0);
            anchorY = this.activeMapFunctionZ[i] * 4 + 2 - ((this.localPlayer.z / 32) | 0);
            this.minimapDrawDot(anchorY, this.activeMapFunctions[i], anchorX);
        }

        for (let ltx: number = 0; ltx < BuildArea.SIZE; ltx++) {
            for (let ltz: number = 0; ltz < BuildArea.SIZE; ltz++) {
                const objs = this.groundObj[this.minusedlevel][ltx][ltz];
                if (objs) {
                    anchorX = ltx * 4 + 2 - ((this.localPlayer.x / 32) | 0);
                    anchorY = ltz * 4 + 2 - ((this.localPlayer.z / 32) | 0);
                    this.minimapDrawDot(anchorY, this.mapdots1, anchorX);
                }
            }
        }

        for (let i: number = 0; i < this.npcCount; i++) {
            const npc: ClientNpc | null = this.npc[this.npcIds[i]];
            if (npc && npc.isReady() && npc.type && npc.type.minimap) {
                anchorX = ((npc.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                anchorY = ((npc.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);
                this.minimapDrawDot(anchorY, this.mapdots2, anchorX);
            }
        }

        for (let i: number = 0; i < this.playerCount; i++) {
            const player: ClientPlayer | null = this.players[this.playerIds[i]];
            if (player && player.isReady() && player.name) {
                anchorX = ((player.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                anchorY = ((player.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);

                let friend: boolean = false;
                const userhash: bigint = JString.toUserhash(player.name);
                for (let j: number = 0; j < this.friendCount; j++) {
                    if (userhash === this.friendUserhash[j] && this.friendNodeId[j] !== 0) {
                        friend = true;
                        break;
                    }
                }

                if (friend) {
                    this.minimapDrawDot(anchorY, this.mapdots4, anchorX);
                } else {
                    this.minimapDrawDot(anchorY, this.mapdots3, anchorX);
                }
            }
        }

        if (this.hintType != 0 && Client.loopCycle % 20 < 10) {
            if (this.hintType == 1 && this.hintNpc >= 0 && this.hintNpc < this.npc.length) {
                const npc = this.npc[this.hintNpc];

                if (npc != null) {
                    const x = ((npc.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                    const y = ((npc.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);
                    this.minimapDrawArrow(x, y, this.mapmarker2);
                }
            } else if (this.hintType == 2) {
                const x = (this.hintTileX - this.mapBuildBaseX) * 4 + 2 - ((this.localPlayer.x / 32) | 0);
                const y = (this.hintTileZ - this.mapBuildBaseZ) * 4 + 2 - ((this.localPlayer.z / 32) | 0);
                this.minimapDrawArrow(x, y, this.mapmarker2);
            } else if (this.hintType == 10 && this.hintPlayer >= 0 && this.hintPlayer < this.players.length) {
                const player = this.players[this.hintPlayer];

                if (player != null) {
                    const x = ((player.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                    const y = ((player.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);
                    this.minimapDrawArrow(x, y, this.mapmarker2);
                }
            }
        }

        if (this.minimapFlagX !== 0) {
            anchorX = ((this.minimapFlagX * 4) + 2) - ((this.localPlayer.x / 32) | 0);
            anchorY = ((this.minimapFlagZ * 4) + 2) - ((this.localPlayer.z / 32) | 0);
            this.minimapDrawDot(anchorY, this.mapmarker1, anchorX);
        }

        // the white square local player position in the center of the minimap.
        Pix2D.fillRect(97, 78, 3, 3, Colour.WHITE);

        this.areaGame?.setPixels();
    }

    minimapDrawArrow(dx: number, dy: number, image: Pix32 | null) {
        if (!image) {
            return;
        }

        const distance = dx * dx + dy * dy;
        if (distance <= 4225 || distance >= 90000) {
            this.minimapDrawDot(dy, image, dx);
            return;
        }

        const angle: number = (this.orbitCameraYaw + this.macroMinimapAngle) & 0x7ff;

        let sinAngle: number = Pix3D.sinTable[angle];
        let cosAngle: number = Pix3D.cosTable[angle];

        sinAngle = ((sinAngle * 256) / (this.macroMinimapZoom + 256)) | 0;
        cosAngle = ((cosAngle * 256) / (this.macroMinimapZoom + 256)) | 0;

        const x: number = (dy * sinAngle + dx * cosAngle) >> 16;
        const y: number = (dy * cosAngle - dx * sinAngle) >> 16;

        const var13 = Math.atan2(x, y);
        const var15 = (Math.sin(var13) * 63.0) | 0;
        const var16 = (Math.cos(var13) * 57.0) | 0;

        this.mapedge?.rotatePlotSprite(var15 + 94 + 4 - 10, 83 - var16 - 20, 20, 20, 15, 15, var13, 256);
    }

    private minimapDrawDot(dy: number, image: Pix32 | null, dx: number): void {
        if (!image) {
            return;
        }

        const distance: number = dx * dx + dy * dy;
        if (distance > 6400) {
            return;
        }

        const angle: number = (this.orbitCameraYaw + this.macroMinimapAngle) & 0x7ff;

        let sinAngle: number = Pix3D.sinTable[angle];
        let cosAngle: number = Pix3D.cosTable[angle];

        sinAngle = ((sinAngle * 256) / (this.macroMinimapZoom + 256)) | 0;
        cosAngle = ((cosAngle * 256) / (this.macroMinimapZoom + 256)) | 0;

        const x: number = (dy * sinAngle + dx * cosAngle) >> 16;
        const y: number = (dy * cosAngle - dx * sinAngle) >> 16;

        if (distance > 2500 && this.mapback) {
            image.scanlinePlotSprite(this.mapback, x + 94 - ((image.owi / 2) | 0) + 4, 83 - y - ((image.ohi / 2) | 0) - 4);
        } else {
            image.plotSprite(x + 94 - ((image.owi / 2) | 0) + 4, 83 - y - ((image.ohi / 2) | 0) - 4);
        }
    }

    private addChat(type: number, text: string, sender: string): void {
        if (type === 0 && this.tutComId !== -1) {
            this.tutComMessage = text;
            this.mouseClickButton = 0;
        }

        if (this.chatModalId === -1) {
            this.redrawChat = true;
        }

        for (let i: number = 99; i > 0; i--) {
            this.chatType[i] = this.chatType[i - 1];
            this.chatUsername[i] = this.chatUsername[i - 1];
            this.chatText[i] = this.chatText[i - 1];
            this.messageTick[i] = this.messageTick[i - 1];
        }

        this.chatType[0] = type;
        this.chatUsername[0] = sender;
        this.chatText[0] = text;
        this.messageTick[0] = Client.loopCycle;
    }

    private isFriend(username: string | null): boolean {
        if (!username) {
            return false;
        }

        for (let i: number = 0; i < this.friendCount; i++) {
            if (username.toLowerCase() === this.friendUsername[i]?.toLowerCase()) {
                return true;
            }
        }

        if (!this.localPlayer) {
            return false;
        }

        return username.toLowerCase() === this.localPlayer.name?.toLowerCase();
    }

    private addFriend(userhash: bigint): void {
        if (userhash === 0n) {
            return;
        }

        if (this.friendCount >= 100 && this.membersAccount != 1) {
            this.addChat(0, 'Your friendlist is full. Max of 100 for free users, and 200 for members', '');
            return;
        } else if (this.friendCount >= 200) {
            this.addChat(0, 'Your friendlist is full. Max of 100 for free users, and 200 for members', '');
            return;
        }

        const displayName: string = JString.toScreenName(JString.toRawUsername(userhash));
        for (let i: number = 0; i < this.friendCount; i++) {
            if (this.friendUserhash[i] === userhash) {
                this.addChat(0, displayName + ' is already on your friend list', '');
                return;
            }
        }

        for (let i: number = 0; i < this.ignoreCount; i++) {
            if (this.ignoreUserhash[i] === userhash) {
                this.addChat(0, 'Please remove ' + displayName + ' from your ignore list first', '');
                return;
            }
        }

        if (!this.localPlayer || !this.localPlayer.name) {
            return;
        }

        if (displayName !== this.localPlayer.name) {
            this.friendUsername[this.friendCount] = displayName;
            this.friendUserhash[this.friendCount] = userhash;
            this.friendNodeId[this.friendCount] = 0;
            this.friendCount++;

            this.redrawSide = true;

            this.out.p1Enc(ClientProt.FRIENDLIST_ADD);
            this.out.p8(userhash);
        }
    }

    private addIgnore(userhash: bigint): void {
        if (userhash === 0n) {
            return;
        }

        if (this.ignoreCount >= 100) {
            this.addChat(0, 'Your ignore list is full. Max of 100 hit', '');
            return;
        }

        const displayName: string = JString.toScreenName(JString.toRawUsername(userhash));
        for (let i: number = 0; i < this.ignoreCount; i++) {
            if (this.ignoreUserhash[i] === userhash) {
                this.addChat(0, displayName + ' is already on your ignore list', '');
                return;
            }
        }

        for (let i: number = 0; i < this.friendCount; i++) {
            if (this.friendUserhash[i] === userhash) {
                this.addChat(0, 'Please remove ' + displayName + ' from your friend list first', '');
                return;
            }
        }

        this.ignoreUserhash[this.ignoreCount++] = userhash;
        this.redrawSide = true;

        this.out.p1Enc(ClientProt.IGNORELIST_ADD);
        this.out.p8(userhash);
    }

    private delFriend(userhash: bigint): void {
        if (userhash === 0n) {
            return;
        }

        for (let i: number = 0; i < this.friendCount; i++) {
            if (this.friendUserhash[i] === userhash) {
                this.friendCount--;
                this.redrawSide = true;

                for (let j: number = i; j < this.friendCount; j++) {
                    this.friendUsername[j] = this.friendUsername[j + 1];
                    this.friendNodeId[j] = this.friendNodeId[j + 1];
                    this.friendUserhash[j] = this.friendUserhash[j + 1];
                }

                this.out.p1Enc(ClientProt.FRIENDLIST_DEL);
                this.out.p8(userhash);
                return;
            }
        }
    }

    private delIgnore(userhash: bigint): void {
        if (userhash === 0n) {
            return;
        }

        for (let i: number = 0; i < this.ignoreCount; i++) {
            if (this.ignoreUserhash[i] === userhash) {
                this.ignoreCount--;
                this.redrawSide = true;

                for (let j: number = i; j < this.ignoreCount; j++) {
                    this.ignoreUserhash[j] = this.ignoreUserhash[j + 1];
                }

                this.out.p1Enc(ClientProt.IGNORELIST_DEL);
                this.out.p8(userhash);
                return;
            }
        }
    }

    // ----

    /// touch controls
    private startedInGame: boolean = false;
    private startedInSide: boolean = false;
    private startedInChat: boolean = false;
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

    override pointerDown(x: number, y: number, e: PointerEvent) {
        if (MobileKeyboard.isWithinCanvasKeyboard(x, y) && !this.exceedsGrabThreshold(20)) {
            MobileKeyboard.captureMouseDown(x, y);
            return;
        }

        if (e.pointerType !== 'mouse') {
            // custom: touchscreen support
            // we don't acknowledge the first press as a click, instead we interpret the user's gesture on release

            this.idleTimer = performance.now();
            this.nextMouseClickX = -1;
            this.nextMouseClickY = -1;
            this.nextMouseClickButton = 0;
            this.mouseX = x;
            this.mouseY = y;
            this.mouseButton = 0;

            this.sx = this.nx = this.mx = e.screenX | 0;
            this.sy = this.ny = this.my = e.screenY | 0;
            this.ttime = e.timeStamp;

            this.startedInGame = this.insideGame();
            this.startedInSide = this.insideSide();
            this.startedInChat = this.insideChat();
        }
    }

    override mouseUp(x: number, y: number, e: MouseEvent) {
        this.idleTimer = performance.now();
        this.mouseButton = 0;

        // custom: up event comes before and potentially without move event
        this.mouseX = x;
        this.mouseY = y;
    }

    override pointerUp(x: number, y: number, e: PointerEvent) {
        if (MobileKeyboard.isWithinCanvasKeyboard(x, y) && !this.exceedsGrabThreshold(20)) {
            MobileKeyboard.captureMouseUp(x, y);
            return;
        }

        if (e.pointerType !== 'mouse') {
            // custom: touchscreen support
            // we don't acknowledge the first press as a click, instead we interpret the user's gesture on release

            this.idleTimer = performance.now();
            this.mouseX = x;
            this.mouseY = y;

            if (this.dragging) {
                this.dragging = false;

                this.nextMouseClickX = -1;
                this.nextMouseClickY = -1;
                this.nextMouseClickButton = 0;
                this.mouseButton = 0;
            } else if (this.panning) {
                // ignore up events if the player was moving the camera
                this.panning = false;

                // release all arrow keys
                this.keyHeld[1] = 0;
                this.keyHeld[2] = 0;
                this.keyHeld[3] = 0;
                this.keyHeld[4] = 0;
                return;
            } else {
                if (!MobileKeyboard.isDisplayed() && this.insideMobileInput()) {
                    // show keyboard when tapping in an input area
                    MobileKeyboard.show(x, y, e.clientX, e.clientY);
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

                // release after a client cycle has passed
                setTimeout(() => {
                    this.mouseButton = 0;
                }, 40);
            }
        }
    }

    override pointerEnter(x: number, y: number, e: PointerEvent) {
        if (e.pointerType === 'mouse') {
            this.mouseX = x;
            this.mouseY = y;
        } else {
            // custom: touchscreen support

            this.idleTimer = performance.now();
            this.nextMouseClickX = -1;
            this.nextMouseClickY = -1;
            this.nextMouseClickButton = 0;
            this.mouseX = x;
            this.mouseY = y;
            this.mouseButton = 0;

            this.sx = this.nx = this.mx = e.screenX | 0;
            this.sy = this.ny = this.my = e.screenY | 0;
            this.ttime = e.timeStamp;

            this.startedInGame = this.insideGame();
            this.startedInSide = this.insideSide();
        }
    }

    override pointerLeave(e: PointerEvent) {
        if (e.pointerType === 'mouse') {
            this.idleTimer = performance.now();
            this.mouseX = -1;
            this.mouseY = -1;

            // custom: moving off-canvas may have a stuck mouse event
            this.nextMouseClickX = -1;
            this.nextMouseClickY = -1;
            this.nextMouseClickButton = 0;
            this.mouseButton = 0;
        } else {
            // custom: touchscreen support
            this.idleTimer = performance.now();

            // release all arrow keys
            this.keyHeld[1] = 0;
            this.keyHeld[2] = 0;
            this.keyHeld[3] = 0;
            this.keyHeld[4] = 0;
        }
    }

    override pointerMove(x: number, y: number, e: PointerEvent) {
        if (e.pointerType === 'mouse') {
            this.idleTimer = performance.now();
            this.mouseX = x;
            this.mouseY = y;
        } else {
            // custom: touchscreen support
            this.idleTimer = performance.now();
            this.mouseX = x;
            this.mouseY = y;

            this.nx = e.screenX | 0;
            this.ny = e.screenY | 0;

            if (this.dragging) {
                // no-op
            } else if (MobileKeyboard.isWithinCanvasKeyboard(x, y) && this.exceedsGrabThreshold(20)) {
                MobileKeyboard.notifyTouchMove(x, y);
            } else if (this.startedInGame && !this.isGameObscured() && this.exceedsGrabThreshold(20)) {
                // moving camera
                this.panning = true;

                // emulate arrow keys:
                if (this.mx - this.nx > 0) {
                    // right
                    this.keyHeld[1] = 0;
                    this.keyHeld[2] = 1;
                } else if (this.mx - this.nx < 0) {
                    // left
                    this.keyHeld[1] = 1;
                    this.keyHeld[2] = 0;
                }

                if (this.my - this.ny > 0) {
                    // down
                    this.keyHeld[3] = 0;
                    this.keyHeld[4] = 1;
                } else if (this.my - this.ny < 0) {
                    // up
                    this.keyHeld[3] = 1;
                    this.keyHeld[4] = 0;
                }
            } else if (this.startedInSide || this.startedInChat || this.isGameObscured()) {
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

    private exceedsGrabThreshold(size: number) {
        return Math.abs(this.sx - this.nx) > size || Math.abs(this.sy - this.ny) > size;
    }

    private isGameObscured(): boolean {
        return this.mainModalId !== -1;
    }

    private insideMobileInput(): boolean {
        return this.insideChatInput() || this.insideChatPopup() || this.insideLoginUser() || this.insideLoginPass() || this.insideReportAbuse();
    }

    private insideGame() {
        const x1: number = 4;
        const y1: number = 4;
        const x2: number = x1 + 512;
        const y2: number = y1 + 334;
        return this.ingame && this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    private insideSide() {
        const x1: number = 553;
        const y1: number = 205;
        const x2: number = x1 + 190;
        const y2: number = y1 + 261;
        return this.ingame && this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    private insideChat() {
        const x1: number = 480;
        const y1: number = 357;
        const x2: number = x1 + 16;
        const y2: number = y1 + 77;
        return this.ingame && !this.dialogInputOpen && !this.socialInputOpen && this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    private insideChatInput() {
        const x1: number = 17;
        const y1: number = 434;
        const x2: number = x1 + 479;
        const y2: number = y1 + 26;
        return this.ingame && this.chatModalId === -1 && !this.dialogInputOpen && !this.socialInputOpen && this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    protected insideChatPopup() {
        const x1: number = 17;
        const y1: number = 357;
        const x2: number = x1 + 479;
        const y2: number = y1 + 96;
        return this.ingame && (this.dialogInputOpen || this.socialInputOpen) && this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    private insideReportAbuse() {
        if (!this.ingame) {
            return false;
        }

        if (this.mainModalId === -1 || this.reportAbuseComId === -1) {
            return false;
        }

        if (this.mainModalId !== this.reportAbuseComId) {
            return false;
        }

        const x1: number = 87;
        const y1: number = 119;
        const x2: number = x1 + 348;
        const y2: number = y1 + 37;
        return this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    private insideLoginUser() {
        const x1: number = 280;
        const y1: number = 233;
        const x2: number = x1 + 190;
        const y2: number = y1 + 31;
        return !this.ingame && this.loginscreen === 2 && this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    private insideLoginPass() {
        const x1: number = 280;
        const y1: number = 264;
        const x2: number = x1 + 278;
        const y2: number = y1 + 20;
        return !this.ingame && this.loginscreen === 2 && this.mouseX >= x1 && this.mouseX <= x2 && this.mouseY >= y1 && this.mouseY <= y2;
    }

    /**
     * Get the full bot state (for external automation/testing)
     */
    getBotState(): any {
        if (this.botOverlay) {
            return this.botOverlay.getState();
        }
        return null;
    }
}
