import { playWave, setWaveVolume, stopMidi, setMidiVolume, playMidi } from '#3rdparty/deps.js';

import GameShell from '#/client/GameShell.js';
import InputTracking from '#/client/InputTracking.js';
import { ClientCode } from '#/client/ClientCode.js';

import FloType from '#/config/FloType.js';
import SeqType, { PostanimMove, PreanimMove, RestartMode } from '#/config/SeqType.js';
import LocType from '#/config/LocType.js';
import ObjType from '#/config/ObjType.js';
import NpcType from '#/config/NpcType.js';
import IdkType from '#/config/IdkType.js';
import SpotAnimType from '#/config/SpotAnimType.js';
import VarpType from '#/config/VarpType.js';
import Component from '#/config/Component.js';
import { ComponentType, ButtonType } from '#/config/Component.js';

import CollisionMap, { CollisionConstants } from '#/dash3d/CollisionMap.js';
import { CollisionFlag } from '#/dash3d/CollisionFlag.js';
import { DirectionFlag } from '#/dash3d/DirectionFlag.js';
import { LocAngle } from '#/dash3d/LocAngle.js';
import { LocLayer } from '#/dash3d/LocLayer.js';
import LocShape from '#/dash3d/LocShape.js';
import World from '#/dash3d/World.js';
import World3D from '#/dash3d/World3D.js';

import ClientNpc, { NpcUpdate } from '#/dash3d/ClientNpc.js';
import ClientPlayer, { PlayerUpdate } from '#/dash3d/ClientPlayer.js';

import LocChange from '#/dash3d/LocChange.js';

import ClientLocAnim from '#/dash3d/ClientLocAnim.js';
import ClientObj from '#/dash3d/ClientObj.js';
import ClientEntity from '#/dash3d/ClientEntity.js';
import ClientProj from '#/dash3d/ClientProj.js';
import MapSpotAnim from '#/dash3d/MapSpotAnim.js';

import JString from '#/datastruct/JString.js';
import LinkList from '#/datastruct/LinkList.js';

import { Int32Array2d, TypedArray1d, TypedArray3d, Int32Array3d, Uint8Array3d } from '#/util/Arrays.js';
import { downloadUrl, sleep, arraycopy } from '#/util/JsUtil.js';

import AnimFrame from '#/dash3d/AnimFrame.js';
import { canvas2d } from '#/graphics/Canvas.js';
import { Colors } from '#/graphics/Colors.js';
import Pix2D from '#/graphics/Pix2D.js';
import Pix3D from '#/graphics/Pix3D.js';
import Model from '#/dash3d/Model.js';
import Pix8 from '#/graphics/Pix8.js';
import Pix32 from '#/graphics/Pix32.js';
import PixFont from '#/graphics/PixFont.js';
import PixMap from '#/graphics/PixMap.js';

import ClientStream from '#/io/ClientStream.js';
import { ClientProt } from '#/io/ClientProt.js';
import Database from '#/io/Database.js';
import Isaac from '#/io/Isaac.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import { ServerProt, ServerProtSizes } from '#/io/ServerProt.js';

import WordFilter from '#/wordenc/WordFilter.js';
import WordPack from '#/wordenc/WordPack.js';

import Wave from '#/sound/Wave.js';
import OnDemand from '#/io/OnDemand.js';
import MobileKeyboard from '#/client/MobileKeyboard.js';

// Bot SDK is conditionally included based on build flag
declare const process: { env: { ENABLE_BOT_SDK?: string; SECURE_ORIGIN?: string; LOGIN_RSAN?: string; LOGIN_RSAE?: string } };
const ENABLE_BOT_SDK = process.env.ENABLE_BOT_SDK === 'true';

// Conditional Bot SDK import - will be tree-shaken in standard build
import * as BotSDKModule from '#/bot/index.js';
const BotOverlay = ENABLE_BOT_SDK ? BotSDKModule.BotOverlay : null;

const enum Constants {
    CLIENT_VERSION = 245,
    MAX_CHATS = 50,
    MAX_PLAYER_COUNT = 2048,
    LOCAL_PLAYER_INDEX = 2047
}

export class Client extends GameShell {
    static nodeId: number = 10;
    static membersWorld: boolean = true;
    static lowMemory: boolean = false;

    static cyclelogic1: number = 0;
    static cyclelogic2: number = 0;
    static cyclelogic3: number = 0;
    static cyclelogic4: number = 0;
    static cyclelogic5: number = 0;
    static cyclelogic6: number = 0;

    static oplogic1: number = 0;
    static oplogic2: number = 0;
    static oplogic3: number = 0;
    static oplogic4: number = 0;
    static oplogic5: number = 0;
    static oplogic6: number = 0;
    static oplogic7: number = 0;
    static oplogic8: number = 0;
    static oplogic9: number = 0;

    private alreadyStarted: boolean = false;
    private errorStarted: boolean = false;
    private errorLoading: boolean = false;
    private errorHost: boolean = false;
    private errorMessage: string | null = null;

    // important client stuff
    public db: Database | null = null;
    private loopCycle: number = 0;
    private jagChecksum: number[] = [];
    private stream: ClientStream | null = null;
    private in: Packet = Packet.alloc(1);
    private out: Packet = Packet.alloc(1);
    private loginout: Packet = Packet.alloc(1);
    private serverSeed: bigint = 0n;
    private idleNetCycles: number = 0;
    private idleTimeout: number = 0;
    private systemUpdateTimer: number = 0;
    private randomIn: Isaac | null = null;
    private ptype: number = 0;
    private psize: number = 0;
    private ptype0: number = 0;
    private ptype1: number = 0;
    private ptype2: number = 0;

    // archives
    private jagTitle: Jagfile | null = null;

    // login screen properties
    private redrawFrame: boolean = true;
    private titleScreenState: number = 0;
    private titleLoginField: number = 0;
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
    private loginMessage0: string = '';
    private loginMessage1: string = '';
    private username: string = '';
    private password: string = '';

    // fonts
    private fontPlain11: PixFont | null = null;
    private fontPlain12: PixFont | null = null;
    private fontBold12: PixFont | null = null;
    private fontQuill8: PixFont | null = null;

    // login screen pillar flames properties
    private imageRunes: Pix8[] = [];
    private flameActive: boolean = false;
    private imageFlamesLeft: Pix32 | null = null;
    private imageFlamesRight: Pix32 | null = null;
    private flameBuffer1: Int32Array | null = null;
    private flameBuffer0: Int32Array | null = null;
    private flameBuffer3: Int32Array | null = null;
    private flameBuffer2: Int32Array | null = null;
    private flameGradient: Int32Array | null = null;
    private flameGradient0: Int32Array | null = null;
    private flameGradient1: Int32Array | null = null;
    private flameGradient2: Int32Array | null = null;
    private flameLineOffset: Int32Array = new Int32Array(256);
    private flameCycle0: number = 0;
    private flameGradientCycle0: number = 0;
    private flameGradientCycle1: number = 0;
    private flamesInterval: Timer | null = null;

    // game world properties
    private areaSidebar: PixMap | null = null;
    private areaMapback: PixMap | null = null;
    private areaViewport: PixMap | null = null;
    private areaChatback: PixMap | null = null;
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
    private areaChatbackOffsets: Int32Array | null = null;
    private areaSidebarOffsets: Int32Array | null = null;
    private areaViewportOffsets: Int32Array | null = null;
    private compassMaskLineOffsets: Int32Array = new Int32Array(33);
    private compassMaskLineLengths: Int32Array = new Int32Array(33);
    private minimapMaskLineOffsets: Int32Array = new Int32Array(151);
    private minimapMaskLineLengths: Int32Array = new Int32Array(151);

    private imageInvback: Pix8 | null = null;
    private imageChatback: Pix8 | null = null;
    private imageMapback: Pix8 | null = null;
    private imageBackbase1: Pix8 | null = null;
    private imageBackbase2: Pix8 | null = null;
    private imageBackhmid1: Pix8 | null = null;
    private imageSideicons: (Pix8 | null)[] = new TypedArray1d(13, null);
    private imageMinimap: Pix32 | null = null;
    private imageCompass: Pix32 | null = null;
    private imageMapedge: Pix32 | null = null;
    private imageMapscene: (Pix8 | null)[] = new TypedArray1d(50, null);
    private imageMapfunction: (Pix32 | null)[] = new TypedArray1d(50, null);
    private imageHitmarks: (Pix32 | null)[] = new TypedArray1d(20, null);
    private imageHeadicon: (Pix32 | null)[] = new TypedArray1d(20, null);
    private imageMapmarker0: Pix32 | null = null;
    private imageMapmarker1: Pix32 | null = null;
    private imageCrosses: (Pix32 | null)[] = new TypedArray1d(8, null);
    private imageMapdot0: Pix32 | null = null;
    private imageMapdot1: Pix32 | null = null;
    private imageMapdot2: Pix32 | null = null;
    private imageMapdot3: Pix32 | null = null;
    private imageScrollbar0: Pix8 | null = null;
    private imageScrollbar1: Pix8 | null = null;
    private imageRedstone1: Pix8 | null = null;
    private imageRedstone2: Pix8 | null = null;
    private imageRedstone3: Pix8 | null = null;
    private imageRedstone1h: Pix8 | null = null;
    private imageRedstone2h: Pix8 | null = null;
    private imageRedstone1v: Pix8 | null = null;
    private imageRedstone2v: Pix8 | null = null;
    private imageRedstone3v: Pix8 | null = null;
    private imageRedstone1hv: Pix8 | null = null;
    private imageRedstone2hv: Pix8 | null = null;

    private genderButtonImage0: Pix32 | null = null;
    private genderButtonImage1: Pix32 | null = null;

    private activeMapFunctions: (Pix32 | null)[] = new TypedArray1d(1000, null);

    private redrawSidebar: boolean = false;
    private redrawChatback: boolean = false;
    private redrawSideicons: boolean = false;
    private redrawPrivacySettings: boolean = false;
    private viewportInterfaceId: number = -1;
    private dragCycles: number = 0;
    private crossMode: number = 0;
    private crossCycle: number = 0;
    private crossX: number = 0;
    private crossY: number = 0;
    private overrideChat: number = 0;
    private menuVisible: boolean = false;
    private menuArea: number = 0;
    private menuX: number = 0;
    private menuY: number = 0;
    private menuWidth: number = 0;
    private menuHeight: number = 0;
    private menuSize: number = 0;
    private menuOption: string[] = [];
    private sidebarInterfaceId: number = -1;
    private chatInterfaceId: number = -1;
    private chatInterface: Component = new Component();
    // Dialog history storage (similar to message history)
    private dialogHistory: Array<{ text: string[]; tick: number; interfaceId: number }> = [];
    private dialogHistoryMax: number = 10;
    private lastCapturedDialogId: number = -1;
    private chatScrollHeight: number = 78;
    private chatScrollOffset: number = 0;
    private ignoreCount: number = 0;
    private ignoreName37: bigint[] = [];
    private hintType: number = 0;
    private hintNpc: number = 0;
    private hintOffsetX: number = 0;
    private hintOffsetZ: number = 0;
    private hintPlayer: number = 0;
    private hintTileX: number = 0;
    private hintTileZ: number = 0;
    private hintHeight: number = 0;
    private skillExperience: number[] = [];
    private skillLevel: number[] = [];
    private skillBaseLevel: number[] = [];
    private levelExperience: number[] = [];
    private modalMessage: string | null = null;
    private flashingTab: number = -1;
    private selectedTab: number = 3;
    private tabInterfaceId: number[] = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    private chatPublicMode: number = 0;
    private chatPrivateMode: number = 0;
    private chatTradeMode: number = 0;
    private scrollGrabbed: boolean = false;
    private scrollInputPadding: number = 0;
    private showSocialInput: boolean = false;
    private socialMessage: string = '';
    private socialInput: string = '';
    private socialInputType: number = 0;
    private chatbackInput: string = '';
    private chatbackInputOpen: boolean = false;
    private stickyChatInterfaceId: number = -1;
    private messageText: (string | null)[] = new TypedArray1d(100, null);
    private messageSender: (string | null)[] = new TypedArray1d(100, null);
    private messageType: Int32Array = new Int32Array(100);
    private messageTick: Int32Array = new Int32Array(100);  // Track when each message arrived
    private messageTextIds: Int32Array = new Int32Array(100);
    private privateMessageCount: number = 0;
    private splitPrivateChat: number = 0;
    private chatEffects: number = 0;
    private chatTyped: string = '';
    private viewportHoveredInterfaceIndex: number = 0;
    private sidebarHoveredInterfaceIndex: number = 0;
    private chatHoveredInterfaceIndex: number = 0;
    private objDragInterfaceId: number = 0;
    private objDragSlot: number = 0;
    private objDragArea: number = 0;
    private objGrabX: number = 0;
    private objGrabY: number = 0;
    private objDragCycles: number = 0;
    private objGrabThreshold: boolean = false;
    private objSelected: number = 0;
    private objSelectedSlot: number = 0;
    private objSelectedInterface: number = 0;
    private objInterface: number = 0;
    private objSelectedName: string | null = null;
    private selectedArea: number = 0;
    private selectedItem: number = 0;
    private selectedInterface: number = 0;
    private selectedCycle: number = 0;
    private pressedContinueOption: boolean = false;
    private varps: number[] = [];
    private varCache: number[] = [];
    private spellSelected: number = 0;
    private activeSpellId: number = 0;
    private activeSpellFlags: number = 0;
    private spellCaption: string | null = null;
    private oneMouseButton: number = 0;
    private menuAction: Int32Array = new Int32Array(500);
    private menuParamA: Int32Array = new Int32Array(500);
    private menuParamB: Int32Array = new Int32Array(500);
    private menuParamC: Int32Array = new Int32Array(500);
    private hoveredSlotParentId: number = 0;
    private hoveredSlot: number = 0;
    private lastHoveredInterfaceId: number = 0;
    private reportAbuseInput: string = '';
    private reportAbuseMuteOption: boolean = false;
    private reportAbuseInterfaceId: number = -1;
    private lastAddress: number = 0;
    private daysSinceLastLogin: number = 0;
    private daysSinceRecoveriesChanged: number = 0;
    private unreadMessages: number = 0;
    private activeMapFunctionCount: number = 0;
    private activeMapFunctionX: Int32Array = new Int32Array(1000);
    private activeMapFunctionZ: Int32Array = new Int32Array(1000);

    // scene
    private scene: World3D | null = null;
    private sceneState: number = 0;
    private sceneDelta: number = 0;
    private sceneCycle: number = 0;
    private flagSceneTileX: number = 0;
    private flagSceneTileZ: number = 0;
    private cutscene: boolean = false;
    private macroCameraCycle: number = 0;
    private macroCameraX: number = 0;
    private macroCameraZ: number = 0;
    private macroCameraAngle: number = 0;
    private macroCameraXModifier: number = 2;
    private macroCameraZModifier: number = 2;
    private macroCameraAngleModifier: number = 1;
    private cameraModifierCycle: Int32Array = new Int32Array(5);
    private cameraModifierEnabled: boolean[] = new TypedArray1d(5, false);
    private cameraModifierJitter: Int32Array = new Int32Array(5);
    private cameraModifierWobbleScale: Int32Array = new Int32Array(5);
    private cameraModifierWobbleSpeed: Int32Array = new Int32Array(5);
    private cameraX: number = 0;
    private cameraY: number = 0;
    private cameraZ: number = 0;
    private cameraPitch: number = 0;
    private cameraYaw: number = 0;
    private cameraPitchClamp: number = 0;
    private macroMinimapCycle: number = 0;
    private macroMinimapAngle: number = 0;
    private macroMinimapZoom: number = 0;
    private macroMinimapZoomModifier: number = 1;
    private macroMinimapAngleModifier: number = 2;
    private minimapLevel: number = -1;
    private baseX: number = 0;
    private baseZ: number = 0;
    private sceneCenterZoneX: number = 0;
    private sceneCenterZoneZ: number = 0;
    private sceneBaseTileX: number = 0;
    private sceneBaseTileZ: number = 0;
    private sceneMapLandData: (Uint8Array | null)[] | null = null;
    private sceneMapLandFile: number[] = [];
    private sceneMapLocData: (Uint8Array | null)[] | null = null;
    private sceneMapLocFile: number[] = [];
    private sceneMapIndex: Int32Array | null = null;
    private withinTutorialIsland: boolean = false;
    private awaitingSync: boolean = false;
    private scenePrevBaseTileX: number = 0;
    private scenePrevBaseTileZ: number = 0;
    private textureBuffer: Int8Array = new Int8Array(16384);
    private levelCollisionMap: (CollisionMap | null)[] = new TypedArray1d(CollisionConstants.LEVELS, null);
    private currentLevel: number = 0;
    private orbitCameraPitch: number = 128;
    private orbitCameraYaw: number = 0;
    private orbitCameraYawVelocity: number = 0;
    private orbitCameraPitchVelocity: number = 0;
    private orbitCameraX: number = 0;
    private orbitCameraZ: number = 0;
    private levelHeightmap: Int32Array[][] | null = null;
    private levelTileFlags: Uint8Array[][] | null = null;
    private tileLastOccupiedCycle: Int32Array[] = new Int32Array2d(CollisionConstants.SIZE, CollisionConstants.SIZE);
    private projectX: number = 0;
    private projectY: number = 0;
    private cutsceneDstLocalTileX: number = 0;
    private cutsceneDstLocalTileZ: number = 0;
    private cutsceneDstHeight: number = 0;
    private cutsceneRotateSpeed: number = 0;
    private cutsceneRotateAcceleration: number = 0;
    private cutsceneSrcLocalTileX: number = 0;
    private cutsceneSrcLocalTileZ: number = 0;
    private cutsceneSrcHeight: number = 0;
    private cutsceneMoveSpeed: number = 0;
    private cutsceneMoveAcceleration: number = 0;

    // entities
    private players: (ClientPlayer | null)[] = new TypedArray1d(Constants.MAX_PLAYER_COUNT, null);
    private playerCount: number = 0;
    private playerIds: Int32Array = new Int32Array(Constants.MAX_PLAYER_COUNT);
    private entityUpdateCount: number = 0;
    private entityRemovalCount: number = 0;
    private entityUpdateIds: Int32Array = new Int32Array(Constants.MAX_PLAYER_COUNT);
    private entityRemovalIds: Int32Array = new Int32Array(1000);
    private playerAppearanceBuffer: (Packet | null)[] = new TypedArray1d(Constants.MAX_PLAYER_COUNT, null);
    private npcs: (ClientNpc | null)[] = new TypedArray1d(8192, null);
    private npcCount: number = 0;
    private npcIds: Int32Array = new Int32Array(8192);
    private projectiles: LinkList = new LinkList();
    private spotanims: LinkList = new LinkList();
    private objStacks: (LinkList | null)[][][] = new TypedArray3d(CollisionConstants.LEVELS, CollisionConstants.SIZE, CollisionConstants.SIZE, null);
    private locChanges: LinkList = new LinkList();

    // bfs pathfinder
    private bfsStepX: Int32Array = new Int32Array(4000);
    private bfsStepZ: Int32Array = new Int32Array(4000);
    private bfsDirection: Int32Array = new Int32Array(CollisionConstants.SIZE * CollisionConstants.SIZE);
    private bfsCost: Int32Array = new Int32Array(CollisionConstants.SIZE * CollisionConstants.SIZE);
    private tryMoveNearest: number = 0;

    // player
    private localPlayer: ClientPlayer | null = null;
    private runenergy: number = 0;
    private inMultizone: number = 0;
    private localPid: number = -1;
    private runweight: number = 0;
    private noTimeoutCycle: number = 0;
    private wildernessLevel: number = 0;
    private worldLocationState: number = 0;
    private staffmodlevel: number = 0;
    private designGender: boolean = true;
    private updateDesignModel: boolean = false;
    private designKits: Int32Array = new Int32Array(7);
    private designColours: Int32Array = new Int32Array(5);

    // friends/chats
    static readonly CHAT_COLORS = Int32Array.of(Colors.YELLOW, Colors.RED, Colors.GREEN, Colors.CYAN, Colors.MAGENTA, Colors.WHITE);
    private friendCount: number = 0;
    private chatCount: number = 0;
    private chatX: Int32Array = new Int32Array(Constants.MAX_CHATS);
    private chatY: Int32Array = new Int32Array(Constants.MAX_CHATS);
    private chatHeight: Int32Array = new Int32Array(Constants.MAX_CHATS);
    private chatWidth: Int32Array = new Int32Array(Constants.MAX_CHATS);
    private chatColors: Int32Array = new Int32Array(Constants.MAX_CHATS);
    private chatEffect: Int32Array = new Int32Array(Constants.MAX_CHATS);
    private chatTimers: Int32Array = new Int32Array(Constants.MAX_CHATS);
    private chats: (string | null)[] = new TypedArray1d(Constants.MAX_CHATS, null);
    private friendName: (string | null)[] = new TypedArray1d(200, null);
    private friendName37: BigInt64Array = new BigInt64Array(200);
    private friendWorld: Int32Array = new Int32Array(200);
    private socialName37: bigint | null = null;

    // audio
    private waveCount: number = 0;
    private waveEnabled: boolean = true;
    private waveIds: Int32Array = new Int32Array(50);
    private waveLoops: Int32Array = new Int32Array(50);
    private waveDelay: Int32Array = new Int32Array(50);
    private waveVolume: number = 64;
    private lastWaveId: number = -1;
    private lastWaveLoops: number = -1;
    private lastWaveLength: number = 0;
    private lastWaveStartTime: number = 0;
    private nextMusicDelay: number = 0;
    private midiActive: boolean = true;
    private midiVolume: number = 64;
    private midiSong: number = -1;
    private midiFading: boolean = false;
    private nextMidiSong: number = -1;

    private displayFps: boolean = false;

    // Bot SDK overlay for bot development (dynamically loaded when enabled)
    private botOverlay: InstanceType<typeof import('#/bot/index.js').BotOverlay> | null = null;
    private botAutoLoginAttempted: boolean = false;

    // Callback fired when a game tick is received (PLAYER_INFO packet processed)
    private onGameTickCallback: (() => void) | null = null;

    // Adaptive tick speed: measures real server tick interval to scale client movement
    private lastTickTime: number = 0;
    private measuredTickInterval: number = 420;
    tickSpeedMultiplier: number = 1;

    private onDemand: OnDemand | null = null;
    ingame: boolean = false;
    imageModIcons: Pix8[] = [];
    lastProgressPercent: number = 0;
    lastProgressMessage: string = '';
    drawCycle: number = 0;
    sceneLoadStartTime: number = 0;
    viewportOverlayInterfaceId: number = -1;
    bankArrangeMode: number = 0;
    field1264: number = 0;
    warnMembersInNonMembers: number = 0;
    membersAccount: number = 0;
    flameCycle: number = 0;

    // ----

    private initializeLevelExperience(): void {
        let acc: number = 0;
        for (let i: number = 0; i < 99; i++) {
            const level: number = i + 1;
            const delta: number = (level + Math.pow(2.0, level / 10.0) * 300.0) | 0;
            acc += delta;
            this.levelExperience[i] = (acc / 4) | 0;
        }
    }

    constructor(nodeid: number, lowmem: boolean, members: boolean) {
        super();

        if (typeof nodeid === 'undefined' || typeof lowmem === 'undefined' || typeof members === 'undefined') {
            return;
        }

        console.log(`RS2 user client - release #${Constants.CLIENT_VERSION}`);

        Client.nodeId = nodeid;
        Client.membersWorld = members;

        if (lowmem) {
            Client.setLowMemory();
        } else {
            Client.setHighMemory();
        }

        if (typeof process.env.SECURE_ORIGIN !== 'undefined' && process.env.SECURE_ORIGIN !== 'false' && window.location.hostname !== process.env.SECURE_ORIGIN) {
            this.errorHost = true;
        }

        this.run();
    }

    // === BOT SDK PUBLIC METHODS ===

    // Packet logging for debugging
    private packetLog: Array<{ timestamp: number; opcode: number; name: string; size: number; data: string }> = [];
    private packetLogEnabled: boolean = false;
    private packetLogCallback: ((entry: { timestamp: number; opcode: number; name: string; size: number; data: string }) => void) | null = null;
    private static readonly PACKET_NAMES: { [key: number]: string } = {
        206: 'NO_TIMEOUT', 102: 'IDLE_TIMER', 19: 'EVENT_TRACKING',
        113: 'OPOBJ1', 238: 'OPOBJ2', 55: 'OPOBJ3', 17: 'OPOBJ4', 247: 'OPOBJ5', 122: 'OPOBJT', 143: 'OPOBJU',
        180: 'OPNPC1', 252: 'OPNPC2', 196: 'OPNPC3', 107: 'OPNPC4', 43: 'OPNPC5', 141: 'OPNPCT', 14: 'OPNPCU',
        1: 'OPLOC1', 219: 'OPLOC2', 226: 'OPLOC3', 204: 'OPLOC4', 86: 'OPLOC5', 208: 'OPLOCT', 147: 'OPLOCU',
        135: 'OPPLAYER1', 165: 'OPPLAYER2', 172: 'OPPLAYER3', 54: 'OPPLAYER4', 52: 'OPPLAYERT', 210: 'OPPLAYERU',
        104: 'OPHELD1', 193: 'OPHELD2', 115: 'OPHELD3', 194: 'OPHELD4', 9: 'OPHELD5', 188: 'OPHELDT', 126: 'OPHELDU',
        13: 'INV_BUTTON1', 58: 'INV_BUTTON2', 48: 'INV_BUTTON3', 183: 'INV_BUTTON4', 242: 'INV_BUTTON5',
        177: 'IF_BUTTON', 239: 'RESUME_PAUSEBUTTON', 245: 'CLOSE_MODAL', 241: 'RESUME_P_COUNTDIALOG', 243: 'TUTORIAL_CLICKSIDE',
        216: 'MOVE_OPCLICK', 205: 'REPORT_ABUSE', 198: 'MOVE_MINIMAPCLICK', 7: 'INV_BUTTOND',
        4: 'IGNORELIST_DEL', 20: 'IGNORELIST_ADD', 150: 'IF_PLAYERDESIGN', 8: 'CHAT_SETMODE',
        99: 'MESSAGE_PRIVATE', 61: 'FRIENDLIST_DEL', 116: 'FRIENDLIST_ADD', 11: 'CLIENT_CHEAT',
        78: 'MESSAGE_PUBLIC', 182: 'MOVE_GAMECLICK'
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
     * Use this instead of direct p1isaac for bot SDK methods
     */
    private writePacketOpcode(opcode: number): void {
        this.currentPacketOpcode = opcode;
        this.currentPacketStart = this.out.pos;
        this.out.p1isaac(opcode);
    }

    /**
     * Set login credentials for auto-login functionality
     * Used by bot SDK to programmatically log in
     */
    setCredentials(username: string, password: string): void {
        this.username = username;
        this.password = password;
    }

    /**
     * Get current login credentials
     */
    getCredentials(): { username: string; password: string } {
        return { username: this.username, password: this.password };
    }

    /**
     * Trigger login attempt with current credentials
     * Call setCredentials first, then call this when on the login screen
     */
    async triggerLogin(): Promise<void> {
        if (this.username && this.password && !this.ingame) {
            await this.login(this.username, this.password, false);
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
        return this.titleScreenState;
    }

    /**
     * Navigate to the login form (simulates clicking "Existing User")
     * Only works when on title screen state 0
     */
    goToLoginScreen(): boolean {
        if (this.titleScreenState === 0) {
            this.titleScreenState = 2;
            this.titleLoginField = 0;
            return true;
        }
        return false;
    }

    /**
     * Fully autonomous login - handles all states automatically
     * Sets credentials, navigates to login screen, and logs in
     */
    async autoLogin(username: string, password: string): Promise<void> {
        this.username = username;
        this.password = password;

        // If already in game, nothing to do
        if (this.ingame) {
            return;
        }

        // Wait for loading to complete (100%) before triggering login
        // This prevents a race condition where login completes while assets are still unpacking
        while (this.lastProgressPercent < 100) {
            await sleep(100);
        }

        // If on main menu (state 0), go to login screen
        if (this.titleScreenState === 0) {
            this.titleScreenState = 2;
            this.titleLoginField = 0;
        }

        // If on login screen (state 2), trigger login
        if (this.titleScreenState === 2) {
            await this.login(this.username, this.password, false);
        }
    }

    /**
     * Accept character design with current settings
     * Sends the IF_PLAYERDESIGN packet to finalize the character
     */
    acceptCharacterDesign(): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        this.writePacketOpcode(ClientProt.IF_PLAYERDESIGN);
        this.out.p1(this.designGender ? 0 : 1);

        for (let i = 0; i < 7; i++) {
            this.out.p1(this.designKits[i]);
        }

        for (let i = 0; i < 5; i++) {
            this.out.p1(this.designColours[i]);
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
        this.designGender = gender;
        this.validateCharacterDesign();

        if (body && body.length === 7) {
            for (let i = 0; i < 7; i++) {
                this.designKits[i] = body[i];
            }
        }

        if (colors && colors.length === 5) {
            for (let i = 0; i < 5; i++) {
                this.designColours[i] = colors[i];
            }
        }

        this.updateDesignModel = true;
        return true;
    }

    /**
     * Randomize character design with valid random values
     * @param gender optional gender (true=male, false=female), random if not provided
     */
    randomizeCharacterDesign(gender?: boolean): boolean {
        // Randomize gender if not specified
        this.designGender = gender ?? Math.random() < 0.5;

        // First validate to get default kits for this gender
        this.validateCharacterDesign();

        // Now randomize each body part from valid options
        for (let part = 0; part < 7; part++) {
            const validKits: number[] = [];
            for (let j = 0; j < IdkType.count; j++) {
                if (!IdkType.types[j].disable && IdkType.types[j].type === part + (this.designGender ? 0 : 7)) {
                    validKits.push(j);
                }
            }
            if (validKits.length > 0) {
                this.designKits[part] = validKits[Math.floor(Math.random() * validKits.length)];
            }
        }

        // Randomize colors (using known color counts: 12, 16, 16, 6, 8)
        const colorCounts = [12, 16, 16, 6, 8];
        for (let i = 0; i < 5; i++) {
            this.designColours[i] = Math.floor(Math.random() * colorCounts[i]);
        }

        this.updateDesignModel = true;
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
            const npc = this.npcs[npcIndex];

            if (npc && npc.type && npc.type.name) {
                if (npc.type.name.toLowerCase().includes(nameLower)) {
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
            const npc = this.npcs[npcIndex];

            if (npc && npc.type) {
                const options: string[] = [];
                if (npc.type.op) {
                    for (const op of npc.type.op) {
                        if (op) options.push(op);
                    }
                }

                result.push({
                    index: npcIndex,
                    name: npc.type.name || 'Unknown',
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
        if (!this.ingame || !this.out || npcIndex < 0) {
            return false;
        }

        const npc = this.npcs[npcIndex];
        if (!npc) {
            return false;
        }

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
        if (!this.ingame || !this.out || npcIndex < 0 || optionIndex < 1 || optionIndex > 5) {
            return false;
        }

        const npc = this.npcs[npcIndex];
        if (!npc) {
            return false;
        }

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
     * Option 4 is usually "Trade with"
     * Use getNearbyPlayers() to see available players
     */
    interactPlayer(playerIndex: number, optionIndex: number): boolean {
        if (!this.ingame || !this.out || playerIndex < 0 || optionIndex < 1 || optionIndex > 4) {
            return false;
        }

        const player = this.players[playerIndex];
        if (!player) {
            return false;
        }

        // Send the appropriate OPPLAYER packet based on option index
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

        const npc = this.npcs[npcIndex];
        if (!npc) {
            return false;
        }

        // Try to move towards the NPC
        this.tryMove(
            this.localPlayer.routeTileX[0],
            this.localPlayer.routeTileZ[0],
            npc.routeTileX[0],
            npc.routeTileZ[0],
            2,      // type 2 = MOVE_OPCLICK
            1, 1,   // NPC size
            0, 0,   // angle, shape
            0,      // forceapproach
            false   // tryNearest
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
        const component = Component.types[interfaceId];
        if (!component || !component.invSlotObjId) {
            return false;
        }

        // Get item in slot
        const rawItemId = component.invSlotObjId[slot];
        if (!rawItemId || rawItemId === 0) {
            return false;
        }
        const itemObj = ObjType.get(rawItemId - 1);
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
     * Pick up a ground item at the specified world coordinates
     * Use the groundItems from BotState to get item locations
     */
    pickupGroundItem(worldX: number, worldZ: number, itemId: number): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            return false;
        }

        // Convert world coordinates to scene coordinates
        const sceneX = worldX - this.sceneBaseTileX;
        const sceneZ = worldZ - this.sceneBaseTileZ;

        // Validate scene coordinates
        if (sceneX < 0 || sceneX >= 104 || sceneZ < 0 || sceneZ >= 104) {
            return false;
        }

        // First send MOVE_OPCLICK via tryMove (type=2) to walk to the item
        this.tryMove(
            this.localPlayer.routeTileX[0],
            this.localPlayer.routeTileZ[0],
            sceneX,
            sceneZ,
            2,      // type 2 = MOVE_OPCLICK (for interacting with something)
            0, 0,   // locWidth, locLength
            0, 0,   // locAngle, locShape
            0,      // forceapproach
            false   // tryNearest
        );

        // Then send OPOBJ3 packet (Take is option 3, not option 1)
        // Ground item options: op[0]=OPOBJ1, op[1]=OPOBJ2, op[2]=OPOBJ3(Take), op[3]=OPOBJ4, op[4]=OPOBJ5
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
        const sceneX = worldX - this.sceneBaseTileX;
        const sceneZ = worldZ - this.sceneBaseTileZ;

        // Validate scene coordinates
        if (sceneX < 0 || sceneX >= 104 || sceneZ < 0 || sceneZ >= 104) {
            return false;
        }

        // First send MOVE_OPCLICK via tryMove (type=2) to walk to the item
        this.tryMove(
            this.localPlayer.routeTileX[0],
            this.localPlayer.routeTileZ[0],
            sceneX,
            sceneZ,
            2,      // type 2 = MOVE_OPCLICK (for interacting with something)
            0, 0,   // locWidth, locLength
            0, 0,   // locAngle, locShape
            0,      // forceapproach
            false   // tryNearest
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
        const component = Component.types[interfaceId];
        if (!component || !component.invSlotObjId) {
            console.log(`[Client] useInventoryItem FAILED - component not found or no invSlotObjId for interfaceId: ${interfaceId}`);
            return false;
        }

        const rawItemId = component.invSlotObjId[slot];
        console.log(`[Client] useInventoryItem - rawItemId at slot ${slot}: ${rawItemId}`);

        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] useInventoryItem FAILED - no item at slot ${slot} (rawItemId: ${rawItemId})`);
            return false;
        }

        // Must use ObjType.get().id like the original menu code does
        const obj = ObjType.get(rawItemId - 1);
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
        const component = Component.types[EQUIPMENT_INTERFACE_ID];
        if (!component || !component.invSlotObjId) {
            console.log(`[Client] clickEquipmentSlot FAILED - component not found`);
            return false;
        }

        const rawItemId = component.invSlotObjId[slot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] clickEquipmentSlot FAILED - no item at slot ${slot}`);
            return false;
        }

        const obj = ObjType.get(rawItemId - 1);
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
        return this.viewportInterfaceId === 3824 && this.sidebarInterfaceId === 3822;
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
            const titleComponent = Component.types[3901];
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
        const component = Component.types[SHOP_INV_ID];
        if (!component || !component.invSlotObjId) {
            return false;
        }

        const rawItemId = component.invSlotObjId[slot];
        if (!rawItemId || rawItemId <= 0) {
            return false;
        }

        // Must use ObjType.get().id like the original menu code does
        const obj = ObjType.get(rawItemId - 1);
        const itemId = obj.id;

        // Map amount to option index: 1->2 (Buy 1), 5->3 (Buy 5), 10->4 (Buy 10)
        let optionIndex = 2; // Default to Buy 1
        if (amount === 5) optionIndex = 3;
        else if (amount === 10) optionIndex = 4;

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
        const component = Component.types[SHOP_SIDE_INV_ID];
        if (!component || !component.invSlotObjId) {
            return false;
        }

        const rawItemId = component.invSlotObjId[slot];
        if (!rawItemId || rawItemId <= 0) {
            return false;
        }

        // Must use ObjType.get().id like the original menu code does
        const obj = ObjType.get(rawItemId - 1);
        const itemId = obj.id;

        // Map amount to option index: 1->2 (Sell 1), 5->3 (Sell 5), 10->4 (Sell 10)
        let optionIndex = 2; // Default to Sell 1
        if (amount === 5) optionIndex = 3;
        else if (amount === 10) optionIndex = 4;

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

        // Send CLOSE_MODAL to server (same as pressing ESC or clicking X)
        this.out.p1isaac(ClientProt.CLOSE_MODAL);

        // Also locally reset the interface state immediately
        // This ensures isShopOpen() and isViewportInterfaceOpen() return false
        if (this.sidebarInterfaceId !== -1) {
            this.sidebarInterfaceId = -1;
            this.redrawSidebar = true;
            this.redrawSideicons = true;
        }
        this.viewportInterfaceId = -1;
        this.pressedContinueOption = false;

        return true;
    }

    /**
     * Close any modal interface (bank, shop, etc.)
     * Unlike closeShop(), this works for any open modal interface.
     */
    closeModal(): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        // Check if any modal is open
        if (this.viewportInterfaceId === -1 && this.sidebarInterfaceId === -1) {
            return true; // Already closed
        }

        // Send CLOSE_MODAL to server
        this.out.p1isaac(ClientProt.CLOSE_MODAL);

        // Locally reset the interface state
        if (this.sidebarInterfaceId !== -1) {
            this.sidebarInterfaceId = -1;
            this.redrawSidebar = true;
            this.redrawSideicons = true;
        }
        this.viewportInterfaceId = -1;
        this.pressedContinueOption = false;

        return true;
    }

    /**
     * Check if bank interface is open
     */
    isBankOpen(): boolean {
        // Bank uses viewportInterfaceId = 5292 (bank_main)
        // or we can check if bank_side:inv (2006) is visible
        const BANK_MAIN_ID = 5292;
        const BANK_SIDE_INV_ID = 2006;

        // Check if the bank main interface is open
        if (this.viewportInterfaceId === BANK_MAIN_ID) {
            return true;
        }

        // Also check if bank_side:inv component has items (indicates bank is open)
        const component = Component.types[BANK_SIDE_INV_ID];
        if (component && component.invSlotObjId) {
            // If this component has items, bank is likely open
            for (let i = 0; i < component.invSlotObjId.length; i++) {
                if (component.invSlotObjId[i] > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Deposit item from inventory into bank
     * slot: the slot number in player's inventory (0-based)
     * amount: 1, 5, 10, or -1 for all
     * Bank side panel interface ID: 2006 (bank_side:inv)
     */
    bankDeposit(slot: number, amount: number = 1): boolean {
        if (!this.ingame || !this.out) {
            console.log('[Client] bankDeposit failed - not in game');
            return false;
        }

        const BANK_SIDE_INV_ID = 2006;
        const component = Component.types[BANK_SIDE_INV_ID];
        if (!component || !component.invSlotObjId) {
            console.log('[Client] bankDeposit failed - bank_side:inv component not found');
            return false;
        }

        const rawItemId = component.invSlotObjId[slot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] bankDeposit failed - no item at slot ${slot}`);
            return false;
        }

        // Must use ObjType.get().id like the original menu code does
        const obj = ObjType.get(rawItemId - 1);
        const itemId = obj.id;

        // Map amount to option index:
        // inv_button1 -> deposit 1
        // inv_button2 -> deposit 5
        // inv_button3 -> deposit 10
        // inv_button4 -> deposit all
        let optionIndex = 1; // Default to deposit 1
        if (amount === 5) optionIndex = 2;
        else if (amount === 10) optionIndex = 3;
        else if (amount === -1 || amount >= 2147483647) optionIndex = 4; // All

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
     * slot: the slot number in bank (0-based)
     * amount: 1, 5, 10, or -1 for all
     * Bank main interface ID: 5382 (bank_main:inv)
     */
    bankWithdraw(slot: number, amount: number = 1): boolean {
        if (!this.ingame || !this.out) {
            console.log('[Client] bankWithdraw failed - not in game');
            return false;
        }

        const BANK_MAIN_INV_ID = 5382;
        const component = Component.types[BANK_MAIN_INV_ID];
        if (!component || !component.invSlotObjId) {
            console.log('[Client] bankWithdraw failed - bank_main:inv component not found');
            return false;
        }

        const rawItemId = component.invSlotObjId[slot];
        if (!rawItemId || rawItemId <= 0) {
            console.log(`[Client] bankWithdraw failed - no item at slot ${slot}`);
            return false;
        }

        // Must use ObjType.get().id like the original menu code does
        const obj = ObjType.get(rawItemId - 1);
        const itemId = obj.id;

        // Map amount to option index:
        // inv_button1 -> withdraw 1
        // inv_button2 -> withdraw 5
        // inv_button3 -> withdraw 10
        // inv_button4 -> withdraw all
        let optionIndex = 1; // Default to withdraw 1
        if (amount === 5) optionIndex = 2;
        else if (amount === 10) optionIndex = 3;
        else if (amount === -1 || amount >= 2147483647) optionIndex = 4; // All

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
     * Get items in bank (from bank_main:inv component)
     */
    getBankItems(): Array<{ slot: number; id: number; name: string; count: number }> {
        const BANK_MAIN_INV_ID = 5382;
        const component = Component.types[BANK_MAIN_INV_ID];
        const items: Array<{ slot: number; id: number; name: string; count: number }> = [];

        if (!component || !component.invSlotObjId || !component.invSlotObjCount) {
            return items;
        }

        for (let slot = 0; slot < component.invSlotObjId.length; slot++) {
            const rawId = component.invSlotObjId[slot];
            if (rawId && rawId > 0) {
                const obj = ObjType.get(rawId - 1);
                items.push({
                    slot,
                    id: obj.id,
                    name: obj.name || `Unknown(${obj.id})`,
                    count: component.invSlotObjCount[slot] || 1
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
     * Finds the current combat interface in tab 0 and clicks the appropriate button
     */
    setCombatStyle(style: number): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        // Get the combat interface from tab 0
        const combatInterfaceId = this.tabInterfaceId[0];
        if (combatInterfaceId === -1) {
            console.log('[Client] No combat interface in tab 0');
            return false;
        }

        const combatInterface = Component.types[combatInterfaceId];
        if (!combatInterface || !combatInterface.children) {
            console.log('[Client] Combat interface has no children');
            return false;
        }

        // Find the button component that corresponds to the desired style
        // Combat buttons have buttonType=5 (SELECT) and scriptOperand that equals the style
        for (const childId of combatInterface.children) {
            const child = Component.types[childId];
            if (!child) continue;

            // Check if this is a SELECT button
            if (child.buttonType === 5) { // BUTTON_SELECT
                // Check if this button is for the desired style
                // The scriptOperand[0] contains the value that's compared with com_mode
                if (child.scriptOperand && child.scriptOperand[0] === style) {
                    // Click this button
                    this.writePacketOpcode(ClientProt.IF_BUTTON);
                    this.out.p2(childId);
                    console.log(`[Client] Clicked combat style button ${childId} for style ${style}`);
                    return true;
                }
            }

            // Also check nested children (combat buttons might be in a layer)
            if (child.children) {
                for (const grandchildId of child.children) {
                    const grandchild = Component.types[grandchildId];
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
     * Returns the currently selected attack style from the combat interface
     */
    getCombatStyle(): number {
        // The combat style is stored in varps (com_mode varp)
        // Try common varp indices
        for (const tryIndex of [43, 11, 12, 13, 42, 44]) {
            const val = this.varps[tryIndex];
            if (val !== undefined && val >= 0 && val <= 3) {
                return val;
            }
        }
        return 0;
    }

    /**
     * Send a public chat message in-game
     * The message will appear above the player's head and in the chat log
     * @param message The message to send (max 80 characters)
     * @returns true if successful, false otherwise
     */
    say(message: string): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            return false;
        }

        // Truncate message to 80 characters max
        let text = message.substring(0, 80);

        // Send MESSAGE_PUBLIC packet
        this.out.p1isaac(ClientProt.MESSAGE_PUBLIC);
        this.out.p1(0); // size placeholder
        const start: number = this.out.pos;

        // No color or effect (0, 0)
        this.out.p1(0); // color
        this.out.p1(0); // effect
        WordPack.pack(this.out, text);
        this.out.psize1(this.out.pos - start);

        // Update local display
        text = JString.toSentenceCase(text);
        text = WordFilter.filter(text);

        if (this.localPlayer) {
            this.localPlayer.chatMessage = text;
            this.localPlayer.chatColour = 0;
            this.localPlayer.chatEffect = 0;
            this.localPlayer.chatTimer = 150;

            // Add to chat log
            this.addMessage(2, this.localPlayer.chatMessage, this.localPlayer.name ?? '');
        }

        return true;
    }

    /**
     * Use one inventory item on another inventory item (OPHELDU)
     * Used for things like: tinderbox on logs, knife on logs, etc.
     *
     * sourceSlot: the slot of the item being used (e.g., tinderbox)
     * targetSlot: the slot of the item being used on (e.g., logs)
     * interfaceId: usually 3214 for main inventory
     */
    useItemOnItem(sourceSlot: number, targetSlot: number, interfaceId: number = 3214): boolean {
        if (!this.ingame || !this.out) {
            console.log('[Client] useItemOnItem failed - not in game');
            return false;
        }

        // Get the interface component
        const component = Component.types[interfaceId];
        if (!component || !component.invSlotObjId) {
            console.log('[Client] useItemOnItem failed - invalid interface');
            return false;
        }

        // Get source item - must use ObjType.get().id like the original menu code does
        const sourceRawId = component.invSlotObjId[sourceSlot];
        if (!sourceRawId || sourceRawId === 0) {
            console.log(`[Client] useItemOnItem failed - no item in source slot ${sourceSlot}`);
            return false;
        }
        const sourceObj = ObjType.get(sourceRawId - 1);
        const sourceItemId = sourceObj.id;

        // Get target item - must use ObjType.get().id like the original menu code does
        const targetRawId = component.invSlotObjId[targetSlot];
        if (!targetRawId || targetRawId === 0) {
            console.log(`[Client] useItemOnItem failed - no item in target slot ${targetSlot}`);
            return false;
        }
        const targetObj = ObjType.get(targetRawId - 1);
        const targetItemId = targetObj.id;

        console.log(`[Client] Using item ${sourceObj.name} (id:${sourceItemId}, slot ${sourceSlot}) on item ${targetObj.name} (id:${targetItemId}, slot ${targetSlot})`);

        // Send OPHELDU packet
        // Format: targetItemId, targetSlot, targetInterface, sourceItemId, sourceSlot, sourceInterface
        this.writePacketOpcode(ClientProt.OPHELDU);
        this.out.p2(targetItemId);       // Target item ID
        this.out.p2(targetSlot);         // Target slot
        this.out.p2(interfaceId);        // Target interface
        this.out.p2(sourceItemId);       // Source item ID
        this.out.p2(sourceSlot);         // Source slot
        this.out.p2(interfaceId);        // Source interface

        return true;
    }

    /**
     * Use an inventory item on an NPC (OPNPCU)
     * Used for things like: using bones on altar NPC, using item on NPC, etc.
     *
     * itemSlot: the slot of the item being used
     * npcIndex: the NPC index to use the item on
     * interfaceId: usually 3214 for main inventory
     */
    useItemOnNpc(itemSlot: number, npcIndex: number, interfaceId: number = 3214): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            console.log('[Client] useItemOnNpc failed - not in game');
            return false;
        }

        // Get the interface component
        const component = Component.types[interfaceId];
        if (!component || !component.invSlotObjId) {
            console.log('[Client] useItemOnNpc failed - invalid interface');
            return false;
        }

        // Get item
        const rawItemId = component.invSlotObjId[itemSlot];
        if (!rawItemId || rawItemId === 0) {
            console.log(`[Client] useItemOnNpc failed - no item in slot ${itemSlot}`);
            return false;
        }
        const itemObj = ObjType.get(rawItemId - 1);
        const itemId = itemObj.id;

        // Check NPC exists
        const npc = this.npcs[npcIndex];
        if (!npc) {
            console.log(`[Client] useItemOnNpc failed - NPC ${npcIndex} not found`);
            return false;
        }

        // Try to move towards the NPC
        this.tryMove(
            this.localPlayer.routeTileX[0],
            this.localPlayer.routeTileZ[0],
            npc.routeTileX[0],
            npc.routeTileZ[0],
            2, 1, 1, 0, 0, 0, false
        );

        console.log(`[Client] Using item ${itemObj.name} (id:${itemId}, slot ${itemSlot}) on NPC ${npcIndex}`);

        // Send OPNPCU packet
        // Format: npcIndex, itemId, itemSlot, itemInterface
        this.writePacketOpcode(ClientProt.OPNPCU);
        this.out.p2(npcIndex);
        this.out.p2(itemId);
        this.out.p2(itemSlot);
        this.out.p2(interfaceId);

        return true;
    }

    /**
     * Use an inventory item on a location (OPLOCU)
     * Used for things like: using axe on tree, using item on object, etc.
     *
     * itemSlot: the slot of the item being used
     * worldX, worldZ: world coordinates of the location
     * locId: the location/object ID to interact with
     * interfaceId: usually 3214 for main inventory
     */
    useItemOnLoc(itemSlot: number, worldX: number, worldZ: number, locId: number, interfaceId: number = 3214): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            console.log('[Client] useItemOnLoc failed - not in game');
            return false;
        }

        // Get the interface component
        const component = Component.types[interfaceId];
        if (!component || !component.invSlotObjId) {
            console.log('[Client] useItemOnLoc failed - invalid interface');
            return false;
        }

        // Get item - must use ObjType.get().id like the original menu code does
        const rawItemId = component.invSlotObjId[itemSlot];
        if (!rawItemId || rawItemId === 0) {
            console.log(`[Client] useItemOnLoc failed - no item in slot ${itemSlot}`);
            return false;
        }
        const itemObj = ObjType.get(rawItemId - 1);
        const itemId = itemObj.id;

        // Convert world coordinates to scene coordinates for pathfinding
        const destSceneX = worldX - this.sceneBaseTileX;
        const destSceneZ = worldZ - this.sceneBaseTileZ;

        // Check if location is in scene bounds
        if (destSceneX < 0 || destSceneX > 103 || destSceneZ < 0 || destSceneZ > 103) {
            console.log(`[Client] useItemOnLoc failed - location out of scene bounds`);
            return false;
        }

        // Try to pathfind to the location
        const loc = LocType.get(locId);
        if (loc) {
            let width = loc.width;
            let height = loc.length;
            this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], destSceneX, destSceneZ, 2, width, height, 0, 0, 0, false);
        }

        console.log(`[Client] Using item ${itemObj.name} (id:${itemId}, slot ${itemSlot}) on loc ${loc?.name || locId} at (${worldX}, ${worldZ})`);

        // Send OPLOCU packet
        // Format: x, z, locId, itemId, itemSlot, itemInterface
        this.writePacketOpcode(ClientProt.OPLOCU);
        this.out.p2(worldX);         // World X
        this.out.p2(worldZ);         // World Z
        this.out.p2(locId);          // Location ID
        this.out.p2(itemId);         // Item ID
        this.out.p2(itemSlot);       // Item slot
        this.out.p2(interfaceId);    // Item interface

        return true;
    }

    /**
     * Walk to a world coordinate using proper client-side pathfinding
     * worldX, worldZ: absolute world tile coordinates
     * running: if true, hold ctrl to run
     *
     * Emulates GUI click behavior:
     * - Out-of-scene destinations are clamped to scene edge
     * - Blocked destinations snap to nearest reachable tile
     */
    walkTo(worldX: number, worldZ: number, running: boolean = false): boolean {
        if (!this.ingame || !this.out || !this.localPlayer) {
            return false;
        }

        // Convert world coordinates to scene coordinates
        let destSceneX = worldX - this.sceneBaseTileX;
        let destSceneZ = worldZ - this.sceneBaseTileZ;

        // Clamp to scene bounds (1-102 to stay safely within 0-103 range)
        // This emulates the GUI behavior of clicking outside the visible area
        const minBound = 1;
        const maxBound = 102;
        const wasClamped = destSceneX < minBound || destSceneX > maxBound || destSceneZ < minBound || destSceneZ > maxBound;

        destSceneX = Math.max(minBound, Math.min(maxBound, destSceneX));
        destSceneZ = Math.max(minBound, Math.min(maxBound, destSceneZ));

        if (wasClamped) {
            console.log(`[Walk] Destination clamped to scene bounds: (${destSceneX + this.sceneBaseTileX}, ${destSceneZ + this.sceneBaseTileZ})`);
        }

        // Set running state temporarily via actionKey[5] (ctrl key)
        const prevActionKey = this.actionKey[5];
        this.actionKey[5] = running ? 1 : 0;

        // Use tryMove with proper pathfinding (type 0 = MOVE_GAMECLICK)
        // Parameters: srcX, srcZ, destX, destZ, type, locWidth, locLength, locAngle, locShape, forceapproach, tryNearest
        // tryNearest=true means if exact tile is blocked, find nearest reachable tile (emulates GUI click behavior)
        const success = this.tryMove(
            this.localPlayer.routeTileX[0],
            this.localPlayer.routeTileZ[0],
            destSceneX,
            destSceneZ,
            0,      // type 0 = MOVE_GAMECLICK
            0, 0,   // locWidth, locLength (not targeting a loc)
            0, 0,   // locAngle, locShape
            0,      // forceapproach
            true    // tryNearest - find nearest reachable tile if exact is blocked
        );

        // Restore action key
        this.actionKey[5] = prevActionKey;

        if (success) {
            this.crossX = 256; // center of screen
            this.crossY = 166;
            this.crossMode = 1;
            this.crossCycle = 0;
        }

        return success;
    }

    /**
     * Walk relative to current position
     * deltaX, deltaZ: tiles to move (positive = east/north, negative = west/south)
     */
    walkRelative(deltaX: number, deltaZ: number, running: boolean = false): boolean {
        if (!this.ingame || !this.localPlayer) {
            return false;
        }

        // Get current world tile position
        const currentTileX = (this.localPlayer.x >> 7);
        const currentTileZ = (this.localPlayer.z >> 7);
        const worldX = this.sceneBaseTileX + currentTileX + deltaX;
        const worldZ = this.sceneBaseTileZ + currentTileZ + deltaZ;

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
            worldX: this.sceneBaseTileX + tileX,
            worldZ: this.sceneBaseTileZ + tileZ,
            tileX,
            tileZ
        };
    }

    /**
     * Interact with a location/object in the world (doors, trees, etc.)
     * optionIndex: 1-5 for different options
     */
    interactLoc(worldX: number, worldZ: number, locId: number, optionIndex: number): boolean {
        if (!this.ingame || !this.out || optionIndex < 1 || optionIndex > 5) {
            return false;
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
     * optionIndex: 0 = click to continue, 1-5 = dialog options (1-based)
     */
    clickDialogOption(optionIndex: number = 0): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        // For "click to continue" or resume dialog
        if (optionIndex === 0) {
            if (!this.pressedContinueOption && this.chatInterfaceId !== -1) {
                this.writePacketOpcode(ClientProt.RESUME_PAUSEBUTTON);
                this.out.p2(this.chatInterfaceId);
                this.pressedContinueOption = true;
                return true;
            }
            return false;
        }

        // For numbered dialog options, find and click the button
        // Dialog options are child components of the chat interface
        if (this.chatInterfaceId !== -1) {
            const dialogOptions = this.getDialogOptions();
            if (optionIndex > 0 && optionIndex <= dialogOptions.length) {
                const option = dialogOptions[optionIndex - 1];

                // Use the correct packet based on button type:
                // BUTTON_OK (1) uses IF_BUTTON
                // BUTTON_CONTINUE (6) uses RESUME_PAUSEBUTTON
                if (option.buttonType === ButtonType.BUTTON_CONTINUE) {
                    if (!this.pressedContinueOption) {
                        this.writePacketOpcode(ClientProt.RESUME_PAUSEBUTTON);
                        this.out.p2(option.componentId);
                        this.pressedContinueOption = true;
                        return true;
                    }
                    return false;
                } else {
                    // BUTTON_OK - just send IF_BUTTON packet
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

        if (this.chatInterfaceId === -1) {
            return options;
        }

        const scanComponent = (comId: number): void => {
            const com = Component.types[comId];
            if (!com) return;

            // Check if this component is a clickable button with option text
            // Dialog options can be:
            // - BUTTON_OK (1) - standard clickable buttons, uses IF_BUTTON
            // - BUTTON_CONTINUE (6) - dialog continue/choice buttons, uses RESUME_PAUSEBUTTON
            // The 'option' field must be set for the button to be clickable
            if ((com.buttonType === ButtonType.BUTTON_OK || com.buttonType === ButtonType.BUTTON_CONTINUE) && com.option) {
                // Use 'text' for display if available, otherwise use 'option'
                const displayText = com.text || com.option;
                options.push({
                    index: options.length + 1,
                    text: displayText,
                    componentId: comId,
                    buttonType: com.buttonType
                });
            }

            // Recursively scan children
            if (com.children) {
                for (const childId of com.children) {
                    scanComponent(childId);
                }
            }
        };

        scanComponent(this.chatInterfaceId);
        return options;
    }

    /**
     * Debug: Get all components in the current chat interface
     */
    debugDialogComponents(): Array<{ id: number; type: number; buttonType: number; option: string; text: string; scripts?: string; scriptOperand?: string }> {
        const components: Array<{ id: number; type: number; buttonType: number; option: string; text: string; scripts?: string; scriptOperand?: string }> = [];

        if (this.chatInterfaceId === -1) {
            return components;
        }

        const scanComponent = (comId: number, depth: number = 0): void => {
            if (depth > 5) return; // Prevent infinite recursion
            const com = Component.types[comId];
            if (!com) return;

            // Log ALL components for debugging, including scripts
            components.push({
                id: comId,
                type: com.type,
                buttonType: com.buttonType,
                option: com.option || '',
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

        scanComponent(this.chatInterfaceId);
        return components;
    }

    /**
     * Get all text content from the current dialog (resolves %1, %2 placeholders)
     */
    getDialogText(): string[] {
        const texts: string[] = [];

        if (this.chatInterfaceId === -1) {
            return texts;
        }

        const scanComponent = (comId: number, depth: number = 0): void => {
            if (depth > 10) return; // Prevent infinite recursion
            const com = Component.types[comId];
            if (!com) return;

            // Extract text from TYPE_TEXT components (type 4)
            if (com.type === ComponentType.TYPE_TEXT && com.text) {
                let text = com.text;

                // Resolve %1-%5 placeholders using executeClientScript
                if (text.indexOf('%') !== -1) {
                    for (let i = 0; i < 5; i++) {
                        const placeholder = `%${i + 1}`;
                        while (text.indexOf(placeholder) !== -1) {
                            const index = text.indexOf(placeholder);
                            const value = this.executeClientScript(com, i);
                            const replacement = value < 999999999 ? String(value) : '*';
                            text = text.substring(0, index) + replacement + text.substring(index + 2);
                        }
                    }
                }

                // Skip empty text, "Please wait...", and common button labels
                const trimmed = text.trim();
                if (trimmed &&
                    trimmed !== 'Please wait...' &&
                    trimmed !== 'Click here to continue' &&
                    !trimmed.startsWith('Select an Option')) {
                    // Strip color codes like @yel@, @whi@, etc.
                    const cleaned = trimmed.replace(/@\w{3}@/g, '');
                    if (cleaned) {
                        texts.push(cleaned);
                    }
                }
            }

            // Recursively scan children
            if (com.children) {
                for (const childId of com.children) {
                    scanComponent(childId, depth + 1);
                }
            }
        };

        scanComponent(this.chatInterfaceId);
        return texts;
    }

    /**
     * Capture the current dialog text to history
     */
    captureDialogToHistory(): void {
        if (this.chatInterfaceId === -1) return;
        if (this.chatInterfaceId === this.lastCapturedDialogId) return; // Already captured

        const texts = this.getDialogText();
        if (texts.length === 0) return;

        // Add to history
        this.dialogHistory.unshift({
            text: texts,
            tick: this.loopCycle,
            interfaceId: this.chatInterfaceId
        });

        // Trim to max size
        if (this.dialogHistory.length > this.dialogHistoryMax) {
            this.dialogHistory.pop();
        }

        this.lastCapturedDialogId = this.chatInterfaceId;
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
        return this.viewportInterfaceId !== -1;
    }

    /**
     * Check if a dialog/chat interface is currently open
     */
    isDialogOpen(): boolean {
        return this.chatInterfaceId !== -1;
    }

    /**
     * Get the currently open modal interface ID
     */
    getModalInterface(): number {
        return this.viewportInterfaceId;
    }

    /**
     * Get the currently open chat/dialog interface ID
     */
    getChatInterface(): number {
        return this.chatInterfaceId;
    }

    /**
     * Check if we're waiting for dialog response (already clicked continue)
     */
    isWaitingForDialog(): boolean {
        return this.pressedContinueOption;
    }

    /**
     * Check if a viewport interface (like crafting/fletching menus) is open
     */
    isViewportInterfaceOpen(): boolean {
        return this.viewportInterfaceId !== -1;
    }

    /**
     * Get the currently open viewport interface ID
     */
    getViewportInterface(): number {
        return this.viewportInterfaceId;
    }

    /**
     * Get available interface options from the current viewport interface
     * This includes BUTTON_SELECT options used in crafting menus (like fletching)
     */
    getInterfaceOptions(): Array<{ index: number; text: string; componentId: number }> {
        const options: Array<{ index: number; text: string; componentId: number }> = [];

        if (this.viewportInterfaceId === -1) {
            return options;
        }

        const scanComponent = (comId: number, depth: number = 0): void => {
            if (depth > 10) return; // Prevent infinite recursion
            const com = Component.types[comId];
            if (!com) {
                // Debug: try scanning a range of child IDs for this interface
                if (depth === 0) {
                    console.log(`[Interface ${this.viewportInterfaceId}] Root component not found, scanning range...`);
                    for (let i = 0; i < 50; i++) {
                        const childId = this.viewportInterfaceId * 1000 + i;
                        const childCom = Component.types[childId];
                        if (childCom && childCom.buttonType && childCom.buttonType > 0) {
                            console.log(`  Found ${childId}: buttonType=${childCom.buttonType}, option="${childCom.option}"`);
                        }
                    }
                }
                return;
            }

            // Debug: log component info
            // (we may need to bring these back for introspection skill  development and debugging new this.closeInterfaces)
            // if (depth === 0) {
            //     console.log(`[Interface ${this.viewportInterfaceId}] Root has ${com.children?.length || 0} children`);
            // }

            // // Debug: log all components with button types
            // if (com.buttonType && com.buttonType > 0) {
            //     console.log(`[Interface ${this.viewportInterfaceId}] Component ${comId}: buttonType=${com.buttonType}, option="${com.option}", text="${com.text}"`);
            // }

            // Check for various button types used in interfaces
            // BUTTON_OK (1), BUTTON_TARGET (2), BUTTON_SELECT (5) - all can be clickable options
            const isClickable = com.buttonType === ButtonType.BUTTON_OK ||
                               com.buttonType === ButtonType.BUTTON_TARGET ||
                               com.buttonType === ButtonType.BUTTON_SELECT;

            if (isClickable && (com.option || com.text)) {
                options.push({
                    index: options.length + 1,
                    text: com.option || com.text || `Option ${options.length + 1}`,
                    componentId: comId
                });
            }

            // Recursively scan children
            if (com.children) {
                for (const childId of com.children) {
                    scanComponent(childId, depth + 1);
                }
            }
        };

        scanComponent(this.viewportInterfaceId);
        return options;
    }

    /**
     * Click an option in a viewport interface (like crafting/fletching menus)
     * optionIndex: 1-based index of the option to click
     */
    clickInterfaceOption(optionIndex: number): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        if (this.viewportInterfaceId === -1) {
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
     * Click a specific component by its ID (for interfaces without scanned options)
     */
    clickComponent(componentId: number): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        // Send the IF_BUTTON packet - server handles any state changes
        this.writePacketOpcode(ClientProt.IF_BUTTON);
        this.out.p2(componentId);
        return true;
    }

    /**
     * Switch to a specific tab (0-13)
     * Tab 6 = Magic/Spellbook
     */
    setTab(tabIndex: number): boolean {
        if (!this.ingame || tabIndex < 0 || tabIndex > 13) {
            return false;
        }
        if (this.tabInterfaceId[tabIndex] === -1) {
            return false; // Tab not available
        }
        this.selectedTab = tabIndex;
        this.redrawSidebar = true;
        this.redrawSideicons = true;
        return true;
    }

    /**
     * Click on an interface component with iop (inventory operations) like smithing menu
     * componentId: the component ID (e.g., 1119 for first smithing column)
     * optionIndex: 1-based index (1=Make, 2=Make 5, 3=Make 10 typically)
     * slot: 0-based slot within the component (e.g., 0=dagger, 2=scimitar in column 1)
     */
    clickInterfaceIop(componentId: number, optionIndex: number = 1, slot: number = 0): boolean {
        if (!this.ingame || !this.out) {
            return false;
        }

        const com = Component.types[componentId];
        if (!com) {
            console.log(`[clickInterfaceIop] Component ${componentId} not found`);
            return false;
        }

        // Get the item ID from the component's slot
        let itemId = 0;
        if (com.invSlotObjId && com.invSlotObjId[slot]) {
            const rawId = com.invSlotObjId[slot];
            const obj = ObjType.get(rawId - 1);
            itemId = obj.id;
        }

        // INV_BUTTON opcodes
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
        const root = Component.types[interfaceId];

        if (!root) {
            lines.push(`Interface ${interfaceId}: Component not found`);
            return lines;
        }

        lines.push(`Interface ${interfaceId}: ${root.children?.length || 0} children`);

        const scan = (comId: number, depth: number): void => {
            if (depth > 3) return; // Limit depth for readability
            const com = Component.types[comId];
            if (!com) return;

            const indent = '  '.repeat(depth);

            // Show components with: buttonType, iop (inventory operations), or option text
            const hasButton = com.buttonType && com.buttonType > 0;
            const hasIop = com.iop && com.iop.some((op: string | null) => op);
            const hasOption = com.option;

            if (hasButton || hasIop || hasOption) {
                let info = `${indent}${comId}:`;
                if (hasButton) info += ` buttonType=${com.buttonType}`;
                if (hasOption) info += ` option="${com.option}"`;
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
     * Enable AI agent mode - shows agent panel and connects to sync service
     * @deprecated Agent UI has been removed
     */
    enableAgentMode(): void {
        // Agent UI removed
    }

    /**
     * Toggle AI agent mode on/off
     * @deprecated Agent UI has been removed
     */
    toggleAgentMode(): void {
        // Agent UI removed
    }

    /**
     * Check if AI agent mode is enabled (panel visible)
     * @deprecated Agent UI has been removed
     */
    isAgentModeEnabled(): boolean {
        return false;
    }

    // === END AGENT MODE PUBLIC METHODS ===

    // === END BOT SDK PUBLIC METHODS ===

    static setLowMemory(): void {
        World3D.lowMemory = true;
        Pix3D.lowMemory = true;
        Client.lowMemory = true;
        World.lowMemory = true;
    }

    static setHighMemory(): void {
        World3D.lowMemory = false;
        Pix3D.lowMemory = false;
        Client.lowMemory = false;
        World.lowMemory = false;
    }

    saveMidi(fading: boolean, data: Uint8Array) {
        playMidi(data, this.midiVolume, fading);
    }

    // ----

    async load() {
        if (this.isMobile && Client.lowMemory) {
            // force mobile on low detail mode to 30 fps
            this.setTargetedFramerate(30);
        }

        if (this.alreadyStarted) {
            this.errorStarted = true;
            return;
        }

        this.alreadyStarted = true;

        try {
            this.db = new Database(await Database.openDatabase());
        } catch (err) {
            // possibly incognito mode
            this.db = null;
        }

        try {
            await this.drawProgress(10, 'Connecting to web server');

            const checksums: Packet = new Packet(await downloadUrl('/crc'));
            for (let i: number = 0; i < 9; i++) {
                this.jagChecksum[i] = checksums.g4();
            }

            this.jagTitle = await this.getJagFile('title', 'title screen', 1, 25);
            this.fontPlain11 = PixFont.fromArchive(this.jagTitle, 'p11');
            this.fontPlain12 = PixFont.fromArchive(this.jagTitle, 'p12');
            this.fontBold12 = PixFont.fromArchive(this.jagTitle, 'b12');
            this.fontQuill8 = PixFont.fromArchive(this.jagTitle, 'q8');

            await this.loadTitleBackground();
            this.loadTitleImages();

            const jagConfig: Jagfile = await this.getJagFile('config', 'config', 2, 30);
            const jagInterface: Jagfile = await this.getJagFile('interface', 'interface', 3, 35);
            const jagMedia: Jagfile = await this.getJagFile('media', '2d graphics', 4, 40);
            const jagTextures: Jagfile = await this.getJagFile('textures', 'textures', 6, 45);
            const jagWordenc: Jagfile = await this.getJagFile('wordenc', 'chat system', 7, 50);
            const jagSounds: Jagfile = await this.getJagFile('sounds', 'sound effects', 8, 55);

            this.levelTileFlags = new Uint8Array3d(CollisionConstants.LEVELS, CollisionConstants.SIZE, CollisionConstants.SIZE);
            this.levelHeightmap = new Int32Array3d(CollisionConstants.LEVELS, CollisionConstants.SIZE + 1, CollisionConstants.SIZE + 1);
            this.scene = new World3D(this.levelHeightmap, CollisionConstants.SIZE, CollisionConstants.LEVELS, CollisionConstants.SIZE);
            for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
                this.levelCollisionMap[level] = new CollisionMap();
            }
            this.imageMinimap = new Pix32(512, 512);

            const versionlist: Jagfile = await this.getJagFile('versionlist', 'update list', 5, 60);

            await this.drawProgress(60, 'Connecting to update server');

            this.onDemand = new OnDemand(versionlist, this);
            AnimFrame.init(this.onDemand.getAnimCount());
            Model.init(this.onDemand.getFileCount(0), this.onDemand);

            await this.drawProgress(62, 'Preloading cache');
            await this.onDemand.prefetchAll();

            if (!Client.lowMemory) {
                this.midiSong = 0; // scape_main
                this.midiFading = false;
                this.onDemand.request(2, this.midiSong);

                while (this.onDemand.remaining() > 0) {
                    await this.updateOnDemand();
                    await sleep(100);
                }
            }

            await this.drawProgress(65, 'Requesting animations');

            const animCount = this.onDemand.getFileCount(1);
            for (let i = 0; i < animCount; i++) {
                this.onDemand.request(1, i);
            }

            while (this.onDemand.remaining() > 0) {
                const progress = animCount - this.onDemand.remaining();
                if (progress > 0) {
                    await this.drawProgress(65, 'Loading animations - ' + ((progress * 100 / animCount) | 0) + '%');
                }

                await this.updateOnDemand();
                await sleep(100);
            }

            await this.drawProgress(70, 'Requesting models');

            const modelCount = this.onDemand.getFileCount(0);
            for (let i = 0; i < modelCount; i++) {
                const flags = this.onDemand.getModelFlags(i);
                if ((flags & 0x1) != 0) {
                    this.onDemand.request(0, i);
                }
            }

            const modelPrefetch = this.onDemand.remaining();
            while (this.onDemand.remaining() > 0) {
                const progress = modelPrefetch - this.onDemand.remaining();
                if (progress > 0) {
                    await this.drawProgress(70, 'Loading models - ' + ((progress * 100 / modelPrefetch) | 0) + '%');
                }

                await this.updateOnDemand();
                await sleep(100);
            }

            if (this.db) {
                await this.drawProgress(75, 'Requesting maps');

                this.onDemand.request(3, this.onDemand.getMapFile(47, 48, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(47, 48, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(48, 48, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(48, 48, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(49, 48, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(49, 48, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(47, 47, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(47, 47, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(48, 47, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(48, 47, 1));

                this.onDemand.request(3, this.onDemand.getMapFile(148, 48, 0));
                this.onDemand.request(3, this.onDemand.getMapFile(148, 48, 1));

                const mapPrefetch = this.onDemand.remaining();
                while (this.onDemand.remaining() > 0) {
                    const progress = mapPrefetch - this.onDemand.remaining();
                    if (progress > 0) {
                        await this.drawProgress(75, 'Loading maps - ' + ((progress * 100 / mapPrefetch) | 0) + '%');
                    }

                    await this.updateOnDemand();
                    await sleep(100);
                }
            }

            const modelCount2 = this.onDemand.getFileCount(0);
            for (let i = 0; i < modelCount2; i++) {
                let flags = this.onDemand.getModelFlags(i);

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

            await this.onDemand.prefetchMaps(Client.membersWorld);

            if (!Client.lowMemory) {
                const midiCount = this.onDemand.getFileCount(2);
                for (let i = 0; i < midiCount; i++) {
                    if (this.onDemand.shouldPrefetchMidi(i)) {
                        this.onDemand.prefetchPriority(2, i, 1);
                    }
                }
            }

            await this.drawProgress(80, 'Unpacking media');

            this.imageInvback = Pix8.fromArchive(jagMedia, 'invback', 0);
            this.imageChatback = Pix8.fromArchive(jagMedia, 'chatback', 0);
            this.imageMapback = Pix8.fromArchive(jagMedia, 'mapback', 0);

            this.imageBackbase1 = Pix8.fromArchive(jagMedia, 'backbase1', 0);
            this.imageBackbase2 = Pix8.fromArchive(jagMedia, 'backbase2', 0);
            this.imageBackhmid1 = Pix8.fromArchive(jagMedia, 'backhmid1', 0);

            for (let i: number = 0; i < 13; i++) {
                this.imageSideicons[i] = Pix8.fromArchive(jagMedia, 'sideicons', i);
            }

            this.imageCompass = Pix32.fromArchive(jagMedia, 'compass', 0);

            this.imageMapedge = Pix32.fromArchive(jagMedia, 'mapedge', 0);
            this.imageMapedge.crop();

            try {
                for (let i: number = 0; i < 50; i++) {
                    this.imageMapscene[i] = Pix8.fromArchive(jagMedia, 'mapscene', i);
                }
            } catch (e) {
                /* empty */
            }

            try {
                for (let i: number = 0; i < 50; i++) {
                    this.imageMapfunction[i] = Pix32.fromArchive(jagMedia, 'mapfunction', i);
                }
            } catch (e) {
                /* empty */
            }

            try {
                for (let i: number = 0; i < 20; i++) {
                    this.imageHitmarks[i] = Pix32.fromArchive(jagMedia, 'hitmarks', i);
                }
            } catch (e) {
                /* empty */
            }

            try {
                for (let i: number = 0; i < 20; i++) {
                    this.imageHeadicon[i] = Pix32.fromArchive(jagMedia, 'headicons', i);
                }
            } catch (e) {
                /* empty */
            }

            this.imageMapmarker0 = Pix32.fromArchive(jagMedia, 'mapmarker', 0);
            this.imageMapmarker1 = Pix32.fromArchive(jagMedia, 'mapmarker', 1);

            for (let i: number = 0; i < 8; i++) {
                this.imageCrosses[i] = Pix32.fromArchive(jagMedia, 'cross', i);
            }

            this.imageMapdot0 = Pix32.fromArchive(jagMedia, 'mapdots', 0);
            this.imageMapdot1 = Pix32.fromArchive(jagMedia, 'mapdots', 1);
            this.imageMapdot2 = Pix32.fromArchive(jagMedia, 'mapdots', 2);
            this.imageMapdot3 = Pix32.fromArchive(jagMedia, 'mapdots', 3);

            this.imageScrollbar0 = Pix8.fromArchive(jagMedia, 'scrollbar', 0);
            this.imageScrollbar1 = Pix8.fromArchive(jagMedia, 'scrollbar', 1);

            this.imageRedstone1 = Pix8.fromArchive(jagMedia, 'redstone1', 0);
            this.imageRedstone2 = Pix8.fromArchive(jagMedia, 'redstone2', 0);
            this.imageRedstone3 = Pix8.fromArchive(jagMedia, 'redstone3', 0);

            this.imageRedstone1h = Pix8.fromArchive(jagMedia, 'redstone1', 0);
            this.imageRedstone1h?.flipHorizontally();

            this.imageRedstone2h = Pix8.fromArchive(jagMedia, 'redstone2', 0);
            this.imageRedstone2h?.flipHorizontally();

            this.imageRedstone1v = Pix8.fromArchive(jagMedia, 'redstone1', 0);
            this.imageRedstone1v?.flipVertically();

            this.imageRedstone2v = Pix8.fromArchive(jagMedia, 'redstone2', 0);
            this.imageRedstone2v?.flipVertically();

            this.imageRedstone3v = Pix8.fromArchive(jagMedia, 'redstone3', 0);
            this.imageRedstone3v?.flipVertically();

            this.imageRedstone1hv = Pix8.fromArchive(jagMedia, 'redstone1', 0);
            this.imageRedstone1hv?.flipHorizontally();
            this.imageRedstone1hv?.flipVertically();

            this.imageRedstone2hv = Pix8.fromArchive(jagMedia, 'redstone2', 0);
            this.imageRedstone2hv?.flipHorizontally();
            this.imageRedstone2hv?.flipVertically();

            for (let i = 0; i < 2; i++) {
                this.imageModIcons[i] = Pix8.fromArchive(jagMedia, 'mod_icons', i);
            }

            const backleft1: Pix32 = Pix32.fromArchive(jagMedia, 'backleft1', 0);
            this.areaBackleft1 = new PixMap(backleft1.cropRight, backleft1.cropBottom);
            backleft1.blitOpaque(0, 0);

            const backleft2: Pix32 = Pix32.fromArchive(jagMedia, 'backleft2', 0);
            this.areaBackleft2 = new PixMap(backleft2.cropRight, backleft2.cropBottom);
            backleft2.blitOpaque(0, 0);

            const backright1: Pix32 = Pix32.fromArchive(jagMedia, 'backright1', 0);
            this.areaBackright1 = new PixMap(backright1.cropRight, backright1.cropBottom);
            backright1.blitOpaque(0, 0);

            const backright2: Pix32 = Pix32.fromArchive(jagMedia, 'backright2', 0);
            this.areaBackright2 = new PixMap(backright2.cropRight, backright2.cropBottom);
            backright2.blitOpaque(0, 0);

            const backtop1: Pix32 = Pix32.fromArchive(jagMedia, 'backtop1', 0);
            this.areaBacktop1 = new PixMap(backtop1.cropRight, backtop1.cropBottom);
            backtop1.blitOpaque(0, 0);

            const backvmid1: Pix32 = Pix32.fromArchive(jagMedia, 'backvmid1', 0);
            this.areaBackvmid1 = new PixMap(backvmid1.cropRight, backvmid1.cropBottom);
            backvmid1.blitOpaque(0, 0);

            const backvmid2: Pix32 = Pix32.fromArchive(jagMedia, 'backvmid2', 0);
            this.areaBackvmid2 = new PixMap(backvmid2.cropRight, backvmid2.cropBottom);
            backvmid2.blitOpaque(0, 0);

            const backvmid3: Pix32 = Pix32.fromArchive(jagMedia, 'backvmid3', 0);
            this.areaBackvmid3 = new PixMap(backvmid3.cropRight, backvmid3.cropBottom);
            backvmid3.blitOpaque(0, 0);

            const backhmid2: Pix32 = Pix32.fromArchive(jagMedia, 'backhmid2', 0);
            this.areaBackhmid2 = new PixMap(backhmid2.cropRight, backhmid2.cropBottom);
            backhmid2.blitOpaque(0, 0);

            const randR: number = ((Math.random() * 21.0) | 0) - 10;
            const randG: number = ((Math.random() * 21.0) | 0) - 10;
            const randB: number = ((Math.random() * 21.0) | 0) - 10;
            const rand: number = ((Math.random() * 41.0) | 0) - 20;

            for (let i: number = 0; i < 50; i++) {
                if (this.imageMapfunction[i]) {
                    this.imageMapfunction[i]?.translate2d(randR + rand, randG + rand, randB + rand);
                }

                if (this.imageMapscene[i]) {
                    this.imageMapscene[i]?.translate2d(randR + rand, randG + rand, randB + rand);
                }
            }

            await this.drawProgress(83, 'Unpacking textures');

            Pix3D.unpackTextures(jagTextures);
            Pix3D.initColourTable(0.8);
            Pix3D.initPool(20);

            await this.drawProgress(86, 'Unpacking config');

            SeqType.unpack(jagConfig);
            LocType.unpack(jagConfig);
            FloType.unpack(jagConfig);
            ObjType.unpack(jagConfig, Client.membersWorld);
            NpcType.unpack(jagConfig);
            IdkType.unpack(jagConfig);
            SpotAnimType.unpack(jagConfig);
            VarpType.unpack(jagConfig);

            if (!Client.lowMemory) {
                await this.drawProgress(90, 'Unpacking sounds');
                Wave.unpack(jagSounds);
            }

            await this.drawProgress(95, 'Unpacking interfaces');

            Component.unpack(jagInterface, jagMedia, [this.fontPlain11, this.fontPlain12, this.fontBold12, this.fontQuill8]);

            await this.drawProgress(100, 'Preparing game engine');

            for (let y: number = 0; y < 33; y++) {
                let left: number = 999;
                let right: number = 0;

                for (let x: number = 0; x < 34; x++) {
                    if (this.imageMapback.pixels[x + y * this.imageMapback.width2d] === 0) {
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
                    if (this.imageMapback.pixels[x + y * this.imageMapback.width2d] === 0 && (x > 34 || y > 34)) {
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

            Pix3D.init3D(479, 96);
            this.areaChatbackOffsets = Pix3D.lineOffset;

            Pix3D.init3D(190, 261);
            this.areaSidebarOffsets = Pix3D.lineOffset;

            Pix3D.init3D(512, 334);
            this.areaViewportOffsets = Pix3D.lineOffset;

            const distance: Int32Array = new Int32Array(9);
            for (let x: number = 0; x < 9; x++) {
                const angle: number = x * 32 + 128 + 15;
                const offset: number = angle * 3 + 600;
                const sin: number = Pix3D.sinTable[angle];
                distance[x] = (offset * sin) >> 16;
            }

            World3D.init(512, 334, 500, 800, distance);
            WordFilter.unpack(jagWordenc);

            this.initializeLevelExperience();
        } catch (err) {
            console.error(err);

            if (err instanceof Error) {
                this.errorMessage = `loaderror - ${this.lastProgressMessage} ${this.lastProgressPercent}%: ${err.message}`;
            }

            this.errorLoading = true;
        }
    }

    async update() {
        if (this.errorStarted || this.errorLoading || this.errorHost) {
            return;
        }

        this.loopCycle++;

        if (this.ingame) {
            await this.updateGame();
        } else {
            await this.updateTitle();
        }

        await this.updateOnDemand();
    }

    async draw() {
        if (this.errorStarted || this.errorLoading || this.errorHost) {
            this.drawError();
            return;
        }

        this.drawCycle++;

        if (this.ingame) {
            this.drawGame();
        } else {
            await this.drawTitle();
        }

        this.dragCycles = 0;
    }

    refresh() {
        this.redrawFrame = true;
    }

    // ----

    async drawProgress(percent: number, message: string): Promise<void> {
        console.log(`${percent}%: ${message}`);

        this.lastProgressPercent = percent;
        this.lastProgressMessage = message;

        await this.loadTitle();

        if (!this.jagTitle) {
            await super.drawProgress(percent, message);
            return;
        }

        this.imageTitle4?.bind();

        const x: number = 360;
        const y: number = 200;

        const offsetY: number = 20;
        this.fontBold12?.drawStringCenter((x / 2) | 0, ((y / 2) | 0) - offsetY - 26, 'RuneScape is loading - please wait...', Colors.WHITE);

        const midY: number = ((y / 2) | 0) - 18 - offsetY;
        Pix2D.drawRect(((x / 2) | 0) - 152, midY, 304, 34, Colors.PROGRESS_RED);
        Pix2D.drawRect(((x / 2) | 0) - 151, midY + 1, 302, 32, Colors.BLACK);
        Pix2D.fillRect2d(((x / 2) | 0) - 150, midY + 2, percent * 3, 30, Colors.PROGRESS_RED);
        Pix2D.fillRect2d(((x / 2) | 0) - 150 + percent * 3, midY + 2, 300 - percent * 3, 30, Colors.BLACK);
        this.fontBold12?.drawStringCenter((x / 2) | 0, ((y / 2) | 0) + 5 - offsetY, message, Colors.WHITE);

        this.imageTitle4?.draw(202, 171);

        if (this.redrawFrame) {
            this.redrawFrame = false;

            if (!this.flameActive) {
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

    private drawError(): void {
        canvas2d.fillStyle = 'black';
        canvas2d.fillRect(0, 0, this.width, this.height);

        this.setFramerate(1);

        this.flameActive = false;
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

    private async getJagFile(filename: string, displayName: string, index: number, progress: number): Promise<Jagfile> {
        const crc = this.jagChecksum[index];

        let data: Uint8Array | undefined;
        let retry: number = 5;

        try {
            if (this.db) {
                data = await this.db.read(0, index);
            }
        } catch (err) {
        }

        if (data && Packet.getcrc(data, 0, data.length) !== crc) {
            data = undefined;
        }

        if (data) {
            return new Jagfile(data);
        }

        let loops = 0;
        while (!data) {
            await this.drawProgress(progress, `Requesting ${displayName}`);

            try {
                data = await downloadUrl(`/${filename}${crc}`);

                const checksum = Packet.getcrc(data, 0, data.length);
                if (crc === checksum) {
                    try {
                        if (this.db) {
                            await this.db.write(0, index, data);
                        }
                    } catch (e) {
                    }
                } else {
                    data = undefined;
                    loops++;
                }
            } catch (e) {
                data = undefined;
            }

            if (!data) {
                for (let i: number = retry; i > 0; i--) {
                    if (loops >= 3) {
                        await this.drawProgress(progress, 'Game updated - please reload page');
                        i = 10;
                    } else {
                        await this.drawProgress(progress, `Error loading - Will retry in ${i} secs.`);
                    }

                    await sleep(1000);
                }

                retry *= 2;
                if (retry > 60) {
                    retry = 60;
                }
            }
        }

        return new Jagfile(data);
    }

    async updateOnDemand() {
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

                if ((this.onDemand.getModelFlags(req.file) & 0x62) != 0) {
                    this.redrawSidebar = true;

                    if (this.chatInterfaceId !== -1) {
                        this.redrawChatback = true;
                    }
                }
            } else if (req.archive === 1) {
                AnimFrame.unpack(req.data);
            } else if (req.archive === 2) {
                if (this.midiSong === req.file) {
                    this.saveMidi(this.midiFading, req.data);
                }
            } else if (req.archive === 3) {
                if (this.sceneMapLandData && this.sceneMapLocData && this.sceneState === 1) {
                    for (let i = 0; i < this.sceneMapLandData.length; i++) {
                        if (this.sceneMapLandFile[i] == req.file) {
                            this.sceneMapLandData[i] = req.data;

                            if (req.data == null) {
                                this.sceneMapLandFile[i] = -1;
                            }

                            break;
                        }

                        if (this.sceneMapLocFile[i] == req.file) {
                            this.sceneMapLocData[i] = req.data;

                            if (req.data == null) {
                                this.sceneMapLocFile[i] = -1;
                            }

                            break;
                        }
                    }
                }
            } else if (req.archive === 93) {
                if (this.onDemand.hasMapLocFile(req.file)) {
                    World.prefetchLocs(new Packet(req.data), this.onDemand);
                }
            }
        }
    }

    private async updateTitle(): Promise<void> {
        if (this.titleScreenState === 0) {
            let x: number = ((this.width / 2) | 0) - 80;
            let y: number = ((this.height / 2) | 0) + 20;

            y += 20;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.titleScreenState = 3;
                this.titleLoginField = 0;
            }

            x = ((this.width / 2) | 0) + 80;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.loginMessage0 = '';
                this.loginMessage1 = 'Enter your username & password.';
                this.titleScreenState = 2;
                this.titleLoginField = 0;
            }
        } else if (this.titleScreenState === 2) {
            let y: number = ((this.height / 2) | 0) - 40;
            y += 30;

            y += 25;
            if (this.mouseClickButton === 1 && this.mouseClickY >= y - 15 && this.mouseClickY < y) {
                this.titleLoginField = 0;
            }

            y += 15;
            if (this.mouseClickButton === 1 && this.mouseClickY >= y - 15 && this.mouseClickY < y) {
                this.titleLoginField = 1;
            }
            // y += 15; dead code

            let x = ((this.width / 2) | 0) - 80;
            y = ((this.height / 2) | 0) + 50;
            y += 20;

            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                await this.login(this.username, this.password, false);

                if (this.ingame) {
                    return;
                }
            }

            x = ((this.width / 2) | 0) + 80;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.titleScreenState = 0;
                this.username = '';
                this.password = '';
            }

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const key: number = this.pollKey();
                if (key === -1) {
                    return;
                }

                let valid: boolean = false;
                for (let i: number = 0; i < PixFont.CHARSET.length; i++) {
                    if (String.fromCharCode(key) === PixFont.CHARSET.charAt(i)) {
                        valid = true;
                        break;
                    }
                }

                if (this.titleLoginField === 0) {
                    if (key === 8 && this.username.length > 0) {
                        this.username = this.username.substring(0, this.username.length - 1);
                    }

                    if (key === 9 || key === 10 || key === 13) {
                        this.titleLoginField = 1;
                    }

                    if (valid) {
                        this.username = this.username + String.fromCharCode(key);
                    }

                    if (this.username.length > 12) {
                        this.username = this.username.substring(0, 12);
                    }
                } else if (this.titleLoginField === 1) {
                    if (key === 8 && this.password.length > 0) {
                        this.password = this.password.substring(0, this.password.length - 1);
                    }

                    if (key === 9 || key === 10 || key === 13) {
                        this.titleLoginField = 0;
                    }

                    if (valid) {
                        this.password = this.password + String.fromCharCode(key);
                    }

                    if (this.password.length > 20) {
                        this.password = this.password.substring(0, 20);
                    }
                }
            }
        } else if (this.titleScreenState === 3) {
            const x: number = (this.width / 2) | 0;
            let y: number = ((this.height / 2) | 0) + 50;

            y += 20;
            if (this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20) {
                this.titleScreenState = 0;
            }
        }
    }

    private async login(username: string, password: string, reconnect: boolean): Promise<void> {
        try {
            if (!reconnect) {
                if (username.length < 1 || username.length > 12) {
                    this.loginMessage0 = '';
                    this.loginMessage1 = 'Username must be 1-12 characters.';
                    return;
                }

                if (password.length < 1 || password.length > 20) {
                    this.loginMessage0 = '';
                    this.loginMessage1 = 'Password must be 1-20 characters.';
                    return;
                }

                this.loginMessage0 = '';
                this.loginMessage1 = 'Connecting to server...';
                await this.drawTitle();
            }

            this.stream = new ClientStream(await ClientStream.openSocket(window.location.host, window.location.protocol === 'https:'));

            const username37 = JString.toBase37(username);
            const loginServer = Number(username37 >> 16n) & 0x1F;

            this.out.pos = 0;
            this.out.p1(14);
            this.out.p1(loginServer);

            this.stream.write(this.out.data, 2);
            for (let i = 0; i < 8; i++) {
                await this.stream.read();
            }

            let reply: number = await this.stream.read();
            if (reply === 0) {
                await this.stream.readBytes(this.in.data, 0, 8);
                this.in.pos = 0;

                this.serverSeed = this.in.g8();
                const seed: Int32Array = new Int32Array([Math.floor(Math.random() * 99999999), Math.floor(Math.random() * 99999999), Number(this.serverSeed >> 32n), Number(this.serverSeed & BigInt(0xffffffff))]);

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

                this.loginout.p1(this.out.pos + 36 + 1 + 1);
                this.loginout.p1(Constants.CLIENT_VERSION);
                this.loginout.p1(Client.lowMemory ? 1 : 0);

                for (let i: number = 0; i < 9; i++) {
                    this.loginout.p4(this.jagChecksum[i]);
                }

                this.loginout.pdata(this.out.data, this.out.pos, 0);
                this.out.random = new Isaac(seed);
                for (let i: number = 0; i < 4; i++) {
                    seed[i] += 50;
                }
                this.randomIn = new Isaac(seed);
                this.stream?.write(this.loginout.data, this.loginout.pos);

                reply = await this.stream.read();
            }

            if (reply === 1) {
                await sleep(2000);
                await this.login(username, password, reconnect);
            } else if (reply === 2 || reply === 18 || reply === 19) {
                this.staffmodlevel = 0;
                if (reply === 18) {
                    this.staffmodlevel = 1;
                } else if (reply === 19) {
                    this.staffmodlevel = 2;
                }

                InputTracking.setDisabled();
                // this.field1402 = 0L;
                // this.field1403 = 0;
                // this.mouseTracking.length = 0;
                this.hasFocus = true;
                // this.field1252 = true;
                this.ingame = true;
                this.out.pos = 0;
                this.in.pos = 0;
                this.ptype = -1;
                this.ptype0 = -1;
                this.ptype1 = -1;
                this.ptype2 = -1;
                this.psize = 0;
                this.idleNetCycles = 0;
                this.systemUpdateTimer = 0;
                this.idleTimeout = 0;
                this.hintType = 0;
                this.field1264 = 0;
                this.menuSize = 0;
                this.menuVisible = false;
                this.idleCycles = performance.now();

                for (let i: number = 0; i < 100; i++) {
                    this.messageText[i] = null;
                }

                this.objSelected = 0;
                this.spellSelected = 0;
                this.sceneState = 0;
                this.waveCount = 0;

                this.macroCameraX = ((Math.random() * 100.0) | 0) - 50;
                this.macroCameraZ = ((Math.random() * 110.0) | 0) - 55;
                this.macroCameraAngle = ((Math.random() * 80.0) | 0) - 40;
                this.macroMinimapAngle = ((Math.random() * 120.0) | 0) - 60;
                this.macroMinimapZoom = ((Math.random() * 30.0) | 0) - 20;
                this.orbitCameraYaw = (((Math.random() * 20.0) | 0) - 10) & 0x7ff;
                this.orbitCameraPitch = 383; // max pitch for overhead view

                this.minimapLevel = -1;
                this.flagSceneTileX = 0;
                this.flagSceneTileZ = 0;

                this.playerCount = 0;
                this.npcCount = 0;

                for (let i: number = 0; i < Constants.MAX_PLAYER_COUNT; i++) {
                    this.players[i] = null;
                    this.playerAppearanceBuffer[i] = null;
                }

                for (let i: number = 0; i < 8192; i++) {
                    this.npcs[i] = null;
                }

                this.localPlayer = this.players[Constants.LOCAL_PLAYER_INDEX] = new ClientPlayer();

                this.projectiles.clear();
                this.spotanims.clear();

                for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
                    for (let x: number = 0; x < CollisionConstants.SIZE; x++) {
                        for (let z: number = 0; z < CollisionConstants.SIZE; z++) {
                            this.objStacks[level][x][z] = null;
                        }
                    }
                }

                this.locChanges = new LinkList();
                this.friendCount = 0;
                this.stickyChatInterfaceId = -1;
                this.chatInterfaceId = -1;
                this.viewportInterfaceId = -1;
                this.sidebarInterfaceId = -1;
                this.viewportOverlayInterfaceId = -1;
                this.pressedContinueOption = false;
                this.selectedTab = 3;
                this.chatbackInputOpen = false;
                this.menuVisible = false;
                this.showSocialInput = false;
                this.modalMessage = null;
                this.inMultizone = 0;
                this.flashingTab = -1;

                this.designGender = true;
                this.validateCharacterDesign();
                for (let i: number = 0; i < 5; i++) {
                    this.designColours[i] = 0;
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

                // Initialize Bot SDK overlay (only if enabled)
                if (ENABLE_BOT_SDK && BotOverlay && !this.botOverlay) {
                    this.botOverlay = new BotOverlay(this);
                }

                this.prepareGame();
            } else if (reply === 3) {
                this.loginMessage0 = '';
                this.loginMessage1 = 'Invalid username or password.';
            } else if (reply === 4) {
                this.loginMessage0 = 'Your account has been disabled.';
                this.loginMessage1 = 'Please check your message-centre for details.';
            } else if (reply === 5) {
                this.loginMessage0 = 'Your account is already logged in.';
                this.loginMessage1 = 'Try again in 60 secs...';
            } else if (reply === 6) {
                this.loginMessage0 = 'RuneScape has been updated!';
                this.loginMessage1 = 'Please reload this page.';
            } else if (reply === 7) {
                this.loginMessage0 = 'This world is full.';
                this.loginMessage1 = 'Please use a different world.';
            } else if (reply === 8) {
                this.loginMessage0 = 'Unable to connect.';
                this.loginMessage1 = 'Login server offline.';
            } else if (reply === 9) {
                this.loginMessage0 = 'Login limit exceeded.';
                this.loginMessage1 = 'Too many connections from your address.';
            } else if (reply === 10) {
                this.loginMessage0 = 'Unable to connect.';
                this.loginMessage1 = 'Bad session id.';
            } else if (reply === 11) {
                this.loginMessage1 = 'Login server rejected session.'; // intentionally loginMessage1
                this.loginMessage1 = 'Please try again.';
            } else if (reply === 12) {
                this.loginMessage0 = 'You need a members account to login to this world.';
                this.loginMessage1 = 'Please subscribe, or use a different world.';
            } else if (reply === 13) {
                this.loginMessage0 = 'Could not complete login.';
                this.loginMessage1 = 'Please try using a different world.';
            } else if (reply === 14) {
                this.loginMessage0 = 'The server is being updated.';
                this.loginMessage1 = 'Please wait 1 minute and try again.';
            } else if (reply === 15) {
                this.ingame = true;
                this.out.pos = 0;
                this.in.pos = 0;
                this.ptype = -1;
                this.ptype0 = -1;
                this.ptype1 = -1;
                this.ptype2 = -1;
                this.psize = 0;
                this.idleNetCycles = 0;
                this.systemUpdateTimer = 0;
                this.menuSize = 0;
                this.menuVisible = false;
                this.sceneLoadStartTime = performance.now();

                // Show Bot SDK overlay on reconnection
                if (this.botOverlay) {
                    this.botOverlay.show();
                }
            } else if (reply === 16) {
                this.loginMessage0 = 'Login attempts exceeded.';
                this.loginMessage1 = 'Please wait 1 minute and try again.';
            } else if (reply === 17) {
                this.loginMessage0 = 'You are standing in a members-only area.';
                this.loginMessage1 = 'To play on this world move to a free area first';
            } else if (reply === 20) {
                this.loginMessage0 = 'Invalid loginserver requested';
                this.loginMessage1 = 'Please try using a different world.';
            } else {
                this.loginMessage0 = 'Unexpected server response';
                this.loginMessage1 = 'Please try using a different world.';
            }
        } catch (err) {
            console.error(err);

            this.loginMessage0 = '';
            this.loginMessage1 = 'Error connecting to server.';
        }
    }

    private async logout(): Promise<void> {
        console.warn('[LOGOUT DEBUG] Client.logout() called - stack trace:', new Error().stack);
        if (this.stream) {
            this.stream.close();
        }

        this.stream = null;
        this.ingame = false;
        this.titleScreenState = 0;
        this.username = '';
        this.password = '';

        // Hide Bot SDK overlay on logout
        if (this.botOverlay) {
            this.botOverlay.hide();
        }

        InputTracking.setDisabled();
        this.clearCache();
        this.scene?.reset();

        for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
            this.levelCollisionMap[level]?.reset();
        }

        stopMidi(false);
        this.nextMidiSong = -1;
        this.midiSong = -1;
        this.nextMusicDelay = 0;
    }

    private clearCache(): void {
        LocType.modelCacheStatic?.clear();
        LocType.modelCacheDynamic?.clear();
        NpcType.modelCache?.clear();
        ObjType.modelCache?.clear();
        ObjType.iconCache?.clear();
        ClientPlayer.modelCache?.clear();
        SpotAnimType.modelCache?.clear();
    }

    private prepareGame(): void {
        if (this.areaChatback) {
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

        this.areaChatback = new PixMap(479, 96);

        this.areaMapback = new PixMap(172, 156);
        Pix2D.clear();
        this.imageMapback?.draw(0, 0);

        this.areaSidebar = new PixMap(190, 261);

        this.areaViewport = new PixMap(512, 334);
        Pix2D.clear();

        this.areaBackbase1 = new PixMap(496, 50);
        this.areaBackbase2 = new PixMap(269, 37);
        this.areaBackhmid1 = new PixMap(249, 45);

        this.redrawFrame = true;
    }

    private async updateGame(): Promise<void> {
        if (this.players === null) {
            // client is unloading asynchronously
            return;
        }

        if (this.systemUpdateTimer > 1) {
            this.systemUpdateTimer--;
        }

        if (this.idleTimeout > 0) {
            this.idleTimeout--;
        }

        if (this.field1264 > 0) {
            this.field1264 -= 2;
        }

        for (let i: number = 0; i < 5 && (await this.readPacket()); i++) {
            /* empty */
        }

        if (this.ingame) {
            this.updateSceneState();
            this.updateLocChanges();
            await this.updateAudio();

            const tracking: Packet | null = InputTracking.flush();
            if (tracking) {
                this.out.p1isaac(ClientProt.EVENT_TRACKING);
                this.out.p2(tracking.pos);
                this.out.pdata(tracking.data, tracking.pos, 0);
                tracking.release();
            }

            this.idleNetCycles++;
            if (this.idleNetCycles > 250) {
                // custom: originally 15s (750) but due to a cloudflare issue, lowered to 5s as a patch
                await this.tryReconnect();
            }

            this.updatePlayers();
            this.updateNpcs();
            this.updateEntityChats();

            this.sceneDelta++;

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
                        this.redrawSidebar = true;
                    } else if (this.selectedArea === 3) {
                        this.redrawChatback = true;
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
                        this.redrawSidebar = true;
                    } else if (this.objDragArea === 3) {
                        this.redrawChatback = true;
                    }

                    this.objDragArea = 0;

                    if (this.objGrabThreshold && this.objDragCycles >= 5) {
                        this.hoveredSlotParentId = -1;
                        this.handleInput();

                        if (this.hoveredSlotParentId === this.objDragInterfaceId && this.hoveredSlot !== this.objDragSlot) {
                            const com: Component = Component.types[this.objDragInterfaceId];

                            let mode = 0;
                            if (this.bankArrangeMode == 1 && com.clientCode == 206) {
                                mode = 1;
                            }
                            if (com.invSlotObjId && com.invSlotObjId[this.hoveredSlot] <= 0) {
                                mode = 0;
                            }

                            if (com.swappable && com.invSlotObjId && com.invSlotObjCount) {
                                const src = this.objDragSlot;
                                const dst = this.hoveredSlot;

                                com.invSlotObjId[dst] = com.invSlotObjId[src];
                                com.invSlotObjCount[dst] = com.invSlotObjCount[src];
                                com.invSlotObjId[src] = -1;
                                com.invSlotObjCount[src] = 0;
                            } else if (mode == 1) {
                                let src = this.objDragSlot;
                                let dst = this.hoveredSlot;

                                while (src != dst) {
                                    if (src > dst) {
                                        com.swapObj(src, src - 1);
                                        src--;
                                    } else if (src < dst) {
                                        com.swapObj(src, src + 1);
                                        src++;
                                    }
                                }
                            } else {
                                com.swapObj(this.objDragSlot, this.hoveredSlot);
                            }

                            this.out.p1isaac(ClientProt.INV_BUTTOND);
                            this.out.p2(this.objDragInterfaceId);
                            this.out.p2(this.objDragSlot);
                            this.out.p2(this.hoveredSlot);
                            this.out.p1(mode);
                        }
                    } else if ((this.oneMouseButton === 1 || this.isAddFriendOption(this.menuSize - 1)) && this.menuSize > 2) {
                        this.showContextMenu();
                    } else if (this.menuSize > 0) {
                        this.useMenuOption(this.menuSize - 1);
                    }

                    this.selectedCycle = 10;
                    this.mouseClickButton = 0;
                }
            }

            Client.cyclelogic3++;
            if (Client.cyclelogic3 > 127) {
                Client.cyclelogic3 = 0;
                this.out.p1isaac(ClientProt.ANTICHEAT_CYCLELOGIC3);
                this.out.p3(4991788);
            }

            if (World3D.clickTileX !== -1) {
                if (this.localPlayer) {
                    const x: number = World3D.clickTileX;
                    const z: number = World3D.clickTileZ;
                    const success: boolean = this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], x, z, 0, 0, 0, 0, 0, 0, true);
                    World3D.clickTileX = -1;

                    if (success) {
                        this.crossX = this.mouseClickX;
                        this.crossY = this.mouseClickY;
                        this.crossMode = 1;
                        this.crossCycle = 0;
                    }
                }
            }

            if (this.mouseClickButton === 1 && this.modalMessage) {
                this.modalMessage = null;
                this.redrawChatback = true;
                this.mouseClickButton = 0;
            }

            const checkClickInput = !this.isMobile || (this.isMobile && !MobileKeyboard.isWithinCanvasKeyboard(this.mouseClickX, this.mouseClickY));

            if (checkClickInput) {
                this.handleMouseInput();
                this.handleMinimapInput();
                this.handleTabInput();
                this.handleChatModeInput();
            }

            if (this.mouseButton === 1 || this.mouseClickButton === 1) {
                this.dragCycles++;
            }

            if (this.sceneState === 2) {
                this.updateOrbitCamera();
            }

            if (this.sceneState === 2 && this.cutscene) {
                this.applyCutscene();
            }

            for (let i: number = 0; i < 5; i++) {
                this.cameraModifierCycle[i]++;
            }

            await this.handleInputKey();

            // idlecycles refactored to use date to circumvent browser throttling the
            // timers when a different tab is active, or the window has been minimized.
            // afk logout after 10 minutes of no activity (extended from 90s for bot use).
            // SDK actions also reset this timer via BotOverlay.onAction().
            // https://developer.chrome.com/blog/timer-throttling-in-chrome-88/
            if (performance.now() - this.idleCycles > 600_000) {
                // 600_000ms = 10 minutes
                console.warn('[LOGOUT DEBUG] AFK timeout triggered (10 min no input) - setting idleTimeout=250');
                this.idleTimeout = 250;
                // 500 ticks * 20ms = 10000ms
                this.idleCycles = performance.now() - 10_000;

                this.out.p1isaac(ClientProt.IDLE_TIMER);
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
            } else if (this.macroCameraX > 50) {
                this.macroCameraXModifier = -2;
            }

            if (this.macroCameraZ < -55) {
                this.macroCameraZModifier = 2;
            } else if (this.macroCameraZ > 55) {
                this.macroCameraZModifier = -2;
            }

            if (this.macroCameraAngle < -40) {
                this.macroCameraAngleModifier = 1;
            } else if (this.macroCameraAngle > 40) {
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
            } else if (this.macroMinimapAngle > 60) {
                this.macroMinimapAngleModifier = -2;
            }

            if (this.macroMinimapZoom < -20) {
                this.macroMinimapZoomModifier = 1;
            } else if (this.macroMinimapZoom > 10) {
                this.macroMinimapZoomModifier = -1;
            }

            Client.cyclelogic4++;
            if (Client.cyclelogic4 > 110) {
                Client.cyclelogic4 = 0;
                this.out.p1isaac(ClientProt.ANTICHEAT_CYCLELOGIC4);
                this.out.p4(0);
            }

            this.noTimeoutCycle++;
            if (this.noTimeoutCycle > 50) {
                this.out.p1isaac(ClientProt.NO_TIMEOUT);
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
                    this.noTimeoutCycle = 0;
                }
            } catch (e) {
                console.error(e);
                console.warn('[LOGOUT DEBUG] I/O error during packet send - calling tryReconnect()');
                // todo: reconnect on IO error, logout on other error
                await this.tryReconnect();
            }
        }
    }

    private async tryReconnect() {
        if (this.idleTimeout > 0) {
            console.warn(`[LOGOUT DEBUG] tryReconnect() called but idleTimeout=${this.idleTimeout} > 0, logging out instead`);
            await this.logout();
            return;
        }
        console.warn('[LOGOUT DEBUG] tryReconnect() attempting reconnection...');

        this.areaViewport?.bind();
        this.fontPlain12?.drawStringCenter(257, 144, 'Connection lost', Colors.BLACK);
        this.fontPlain12?.drawStringCenter(256, 143, 'Connection lost', Colors.WHITE);
        this.fontPlain12?.drawStringCenter(257, 159, 'Please wait - attempting to reestablish', Colors.BLACK);
        this.fontPlain12?.drawStringCenter(256, 158, 'Please wait - attempting to reestablish', Colors.WHITE);
        this.areaViewport?.draw(4, 4);

        this.flagSceneTileX = 0;

        this.stream?.close();

        this.ingame = false;
        await this.login(this.username, this.password, true);
        if (!this.ingame) {
            await this.logout();
        }
    }

    private updateSceneState(): void {
        if (Client.lowMemory && this.sceneState === 2 && World.levelBuilt !== this.currentLevel) {
            this.areaViewport?.bind();
            this.fontPlain12?.drawStringCenter(257, 151, 'Loading - please wait.', Colors.BLACK);
            this.fontPlain12?.drawStringCenter(256, 150, 'Loading - please wait.', Colors.WHITE);
            this.areaViewport?.draw(4, 4);
            this.sceneState = 1;
        }

        if (this.sceneState === 1) {
            const status = this.checkScene();
            if (status != 0 && performance.now() - this.sceneLoadStartTime > 360000) {
                console.log(`${this.username} glcfb ${this.serverSeed},${status},${Client.lowMemory},${this.db},${this.onDemand?.remaining()},${this.currentLevel},${this.sceneCenterZoneX},${this.sceneCenterZoneZ}`);
                this.sceneLoadStartTime = performance.now();
            }
        }

        if (this.sceneState === 2 && this.currentLevel !== this.minimapLevel) {
            this.minimapLevel = this.currentLevel;
            this.createMinimap(this.currentLevel);
        }
    }

    private checkScene(): number {
        if (!this.sceneMapIndex || !this.sceneMapLandData || !this.sceneMapLocData) {
            return -1000; // custom
        }

        for (let i = 0; i < this.sceneMapLandData.length; i++) {
            if (this.sceneMapLandData[i] == null && this.sceneMapLandFile[i] !== -1) {
                return -1;
            }

            if (this.sceneMapLocData[i] == null && this.sceneMapLocFile[i] !== -1) {
                return -2;
            }
        }

        let ready = true;
        for (let i = 0; i < this.sceneMapLandData.length; i++) {
            const data = this.sceneMapLocData[i];
            if (data != null) {
                const x = (this.sceneMapIndex[i] >> 8) * 64 - this.sceneBaseTileX;
                const z = (this.sceneMapIndex[i] & 0xFF) * 64 - this.sceneBaseTileZ;
                ready &&= World.locsAreReady(data, x, z);
            }
        }

        if (!ready) {
            return -3;
        } else if (this.awaitingSync) {
            return -4;
        }

        this.sceneState = 2;
        World.levelBuilt = this.currentLevel;
        this.buildScene();
        return 0;
    }

    private buildScene(): void {
        try {
            this.minimapLevel = -1;
            this.spotanims.clear();
            this.projectiles.clear();
            Pix3D.clearTexels();
            this.clearCache();
            this.scene?.reset();

            for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
                this.levelCollisionMap[level]?.reset();
            }

            const world: World = new World(CollisionConstants.SIZE, CollisionConstants.SIZE, this.levelHeightmap!, this.levelTileFlags!);
            World.lowMemory = World3D.lowMemory;

            const maps: number = this.sceneMapLandData?.length ?? 0;

            if (this.sceneMapIndex) {
                for (let index: number = 0; index < maps; index++) {
                    const x: number = this.sceneMapIndex[index] >> 8;
                    const z: number = this.sceneMapIndex[index] & 0xff;

                    // underground pass check
                    if (x === 33 && z >= 71 && z <= 73) {
                        World.lowMemory = false;
                        break;
                    }
                }
            }

            if (Client.lowMemory) {
                this.scene?.setMinLevel(this.currentLevel);
            } else {
                this.scene?.setMinLevel(0);
            }

            if (this.sceneMapIndex && this.sceneMapLandData) {
                this.out.p1isaac(ClientProt.NO_TIMEOUT);

                for (let i: number = 0; i < maps; i++) {
                    const x: number = (this.sceneMapIndex[i] >> 8) * 64 - this.sceneBaseTileX;
                    const z: number = (this.sceneMapIndex[i] & 0xff) * 64 - this.sceneBaseTileZ;
                    const data: Uint8Array | null = this.sceneMapLandData[i];

                    if (data) {
                        world.loadGround((this.sceneCenterZoneX - 6) * 8, (this.sceneCenterZoneZ - 6) * 8, x, z, data);
                    }
                }

                for (let i: number = 0; i < maps; i++) {
                    const x: number = (this.sceneMapIndex[i] >> 8) * 64 - this.sceneBaseTileX;
                    const z: number = (this.sceneMapIndex[i] & 0xff) * 64 - this.sceneBaseTileZ;
                    const data: Uint8Array | null = this.sceneMapLandData[i];

                    if (!data && this.sceneCenterZoneZ < 800) {
                        world.spreadHeight(z, x, 64, 64);
                    }
                }
            }

            if (this.sceneMapIndex && this.sceneMapLocData) {
                this.out.p1isaac(ClientProt.NO_TIMEOUT);

                for (let i: number = 0; i < maps; i++) {
                    const data: Uint8Array | null = this.sceneMapLocData[i];

                    if (data) {
                        const x: number = (this.sceneMapIndex[i] >> 8) * 64 - this.sceneBaseTileX;
                        const z: number = (this.sceneMapIndex[i] & 0xff) * 64 - this.sceneBaseTileZ;
                        world.loadLocations(this.loopCycle, this.scene, this.levelCollisionMap, data, x, z);
                    }
                }
            }

            this.out.p1isaac(ClientProt.NO_TIMEOUT);

            world.build(this.scene, this.levelCollisionMap);
            this.areaViewport?.bind();

            this.out.p1isaac(ClientProt.NO_TIMEOUT);

            for (let x: number = 0; x < CollisionConstants.SIZE; x++) {
                for (let z: number = 0; z < CollisionConstants.SIZE; z++) {
                    this.sortObjStacks(x, z);
                }
            }

            this.clearLocChanges();
        } catch (err) {
            console.error(err);
        }

        LocType.modelCacheStatic?.clear();

        if (Client.lowMemory && this.db) {
            const modelCount = this.onDemand?.getFileCount(0) ?? 0;

            for (let i = 0; i < modelCount; i++) {
                const flags = this.onDemand?.getModelFlags(i) ?? 0;

                if ((flags & 0x79) == 0) {
                    Model.unload(i);
                }
            }
        }

        Pix3D.initPool(20);
        this.onDemand?.clearPrefetches();

        let left = (this.sceneCenterZoneX - 6) / 8 - 1;
        let right = (this.sceneCenterZoneX + 6) / 8 + 1;
        let bottom = (this.sceneCenterZoneZ - 6) / 8 - 1;
        let top = (this.sceneCenterZoneZ + 6) / 8 + 1;

        if (this.withinTutorialIsland) {
            left = 49;
            right = 50;
            bottom = 49;
            top = 50;
        }

        for (let x = left; x <= right; x++) {
            for (let z = bottom; z <= top; z++) {
                if (left == x || right == x || bottom == z || top == z) {
                    const land = this.onDemand?.getMapFile(z, x, 0) ?? -1;
                    if (land != -1) {
                        this.onDemand?.prefetch(3, land);
                    }

                    const loc = this.onDemand?.getMapFile(z, x, 1) ?? -1;
                    if (loc != -1) {
                        this.onDemand?.prefetch(3, loc);
                    }
                }
            }
        }
    }

    private clearLocChanges(): void {
        for (let loc: LocChange | null = this.locChanges.head() as LocChange | null; loc; loc = this.locChanges.next() as LocChange | null) {
            if (loc.endTime === -1) {
                loc.startTime = 0;
                this.storeLoc(loc);
            } else {
                loc.unlink();
            }
        }
    }

    private createMinimap(level: number): void {
        if (!this.imageMinimap) {
            return;
        }

        const pixels: Int32Array = this.imageMinimap.pixels;
        const length: number = pixels.length;
        for (let i: number = 0; i < length; i++) {
            pixels[i] = 0;
        }

        for (let z: number = 1; z < CollisionConstants.SIZE - 1; z++) {
            let offset: number = (CollisionConstants.SIZE - 1 - z) * 512 * 4 + 24628;

            for (let x: number = 1; x < CollisionConstants.SIZE - 1; x++) {
                if (this.levelTileFlags && (this.levelTileFlags[level][x][z] & 0x18) === 0) {
                    this.scene?.drawMinimapTile(level, x, z, pixels, offset, 512);
                }

                if (level < 3 && this.levelTileFlags && (this.levelTileFlags[level + 1][x][z] & 0x8) !== 0) {
                    this.scene?.drawMinimapTile(level + 1, x, z, pixels, offset, 512);
                }

                offset += 4;
            }
        }

        const wallRgb: number = ((((Math.random() * 20.0) | 0) + 238 - 10) << 16) + ((((Math.random() * 20.0) | 0) + 238 - 10) << 8) + ((Math.random() * 20.0) | 0) + 238 - 10;
        const doorRgb: number = (((Math.random() * 20.0) | 0) + 238 - 10) << 16;

        this.imageMinimap.bind();

        for (let z: number = 1; z < CollisionConstants.SIZE - 1; z++) {
            for (let x: number = 1; x < CollisionConstants.SIZE - 1; x++) {
                if (this.levelTileFlags && (this.levelTileFlags[level][x][z] & 0x18) === 0) {
                    this.drawMinimapLoc(x, z, level, wallRgb, doorRgb);
                }

                if (level < 3 && this.levelTileFlags && (this.levelTileFlags[level + 1][x][z] & 0x8) !== 0) {
                    this.drawMinimapLoc(x, z, level + 1, wallRgb, doorRgb);
                }
            }
        }

        this.areaViewport?.bind();

        this.activeMapFunctionCount = 0;

        for (let x: number = 0; x < CollisionConstants.SIZE; x++) {
            for (let z: number = 0; z < CollisionConstants.SIZE; z++) {
                let typecode: number = this.scene?.getGroundDecorTypecode(this.currentLevel, x, z) ?? 0;
                if (typecode === 0) {
                    continue;
                }

                const locId = (typecode >> 14) & 0x7fff;
                const func: number = LocType.get(locId).mapfunction;
                if (func < 0) {
                    continue;
                }

                let stx: number = x;
                let stz: number = z;

                if (func !== 22 && func !== 29 && func !== 34 && func !== 36 && func !== 46 && func !== 47 && func !== 48) {
                    const maxX: number = CollisionConstants.SIZE;
                    const maxZ: number = CollisionConstants.SIZE;
                    const collisionmap: CollisionMap | null = this.levelCollisionMap[this.currentLevel];

                    if (collisionmap) {
                        const flags: Int32Array = collisionmap.flags;

                        for (let i: number = 0; i < 10; i++) {
                            const rand: number = (Math.random() * 4.0) | 0;
                            if (rand === 0 && stx > 0 && stx > x - 3 && (flags[CollisionMap.index(stx - 1, stz)] & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) {
                                stx--;
                            }

                            if (rand === 1 && stx < maxX - 1 && stx < x + 3 && (flags[CollisionMap.index(stx + 1, stz)] & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN) {
                                stx++;
                            }

                            if (rand === 2 && stz > 0 && stz > z - 3 && (flags[CollisionMap.index(stx, stz - 1)] & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN) {
                                stz--;
                            }

                            if (rand === 3 && stz < maxZ - 1 && stz < z + 3 && (flags[CollisionMap.index(stx, stz + 1)] & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) {
                                stz++;
                            }
                        }
                    }
                }

                this.activeMapFunctions[this.activeMapFunctionCount] = this.imageMapfunction[func];
                this.activeMapFunctionX[this.activeMapFunctionCount] = stx;
                this.activeMapFunctionZ[this.activeMapFunctionCount] = stz;
                this.activeMapFunctionCount++;
            }
        }
    }

    private updateLocChanges(): void {
        if (this.sceneState !== 2) {
            return;
        }

        for (let loc: LocChange | null = this.locChanges.head() as LocChange | null; loc; loc = this.locChanges.next() as LocChange | null) {
            if (loc.endTime > 0) {
                loc.endTime--;
            }

            if (loc.endTime != 0) {
                if (loc.startTime > 0) {
                    loc.startTime--;
                }

                if (loc.startTime === 0 && loc.x >= 1 && loc.z >= 1 && loc.x <= 102 && loc.z <= 102 && (loc.newType < 0 || World.isLocReady(loc.newType, loc.newShape))) {
                    this.addLoc(loc.level, loc.x, loc.z, loc.newType, loc.newAngle, loc.newShape, loc.layer);
                    loc.startTime = -1;

                    if (loc.oldType === loc.newType && loc.oldType === -1) {
                        loc.unlink();
                    } else if (loc.oldType === loc.newType && loc.oldAngle === loc.newAngle && loc.oldShape === loc.newShape) {
                        loc.unlink();
                    }
                }
            } else if (loc.oldType < 0 || World.isLocReady(loc.oldType, loc.oldShape)) {
                this.addLoc(loc.level, loc.x, loc.z, loc.oldType, loc.oldAngle, loc.oldShape, loc.layer);
                loc.unlink();
            }
        }

        Client.cyclelogic5++;
        if (Client.cyclelogic5 > 85) {
            Client.cyclelogic5 = 0;
            this.out.p1isaac(ClientProt.ANTICHEAT_CYCLELOGIC5);
        }
    }

    async updateAudio() {
        for (let wave: number = 0; wave < this.waveCount; wave++) {
            if (this.waveDelay[wave] <= 0) {
                try {
                    const buf: Packet | null = Wave.generate(this.waveIds[wave], this.waveLoops[wave]);
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
                } catch (e) {
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

            if (this.nextMusicDelay === 0 && this.midiActive && !Client.lowMemory) {
                this.midiSong = this.nextMidiSong;
                this.midiFading = false;
                this.onDemand?.request(2, this.midiSong);
            }
        }
    }

    private handleInput(): void {
        if (this.objDragArea !== 0) {
            return;
        }

        this.menuOption[0] = 'Cancel';
        this.menuAction[0] = 1252;
        this.menuSize = 1;

        this.handlePrivateChatInput();
        this.lastHoveredInterfaceId = 0;

        // the main viewport area
        if (this.mouseX > 4 && this.mouseY > 4 && this.mouseX < 516 && this.mouseY < 338) {
            if (this.viewportInterfaceId === -1) {
                this.handleViewportOptions();
            } else {
                this.handleInterfaceInput(Component.types[this.viewportInterfaceId], this.mouseX, this.mouseY, 4, 4, 0);
            }
        }

        if (this.lastHoveredInterfaceId !== this.viewportHoveredInterfaceIndex) {
            this.viewportHoveredInterfaceIndex = this.lastHoveredInterfaceId;
        }

        this.lastHoveredInterfaceId = 0;

        // the sidebar/tabs area
        if (this.mouseX > 553 && this.mouseY > 205 && this.mouseX < 743 && this.mouseY < 466) {
            if (this.sidebarInterfaceId !== -1) {
                this.handleInterfaceInput(Component.types[this.sidebarInterfaceId], this.mouseX, this.mouseY, 553, 205, 0);
            } else if (this.tabInterfaceId[this.selectedTab] !== -1) {
                this.handleInterfaceInput(Component.types[this.tabInterfaceId[this.selectedTab]], this.mouseX, this.mouseY, 553, 205, 0);
            }
        }

        if (this.lastHoveredInterfaceId !== this.sidebarHoveredInterfaceIndex) {
            this.redrawSidebar = true;
            this.sidebarHoveredInterfaceIndex = this.lastHoveredInterfaceId;
        }

        this.lastHoveredInterfaceId = 0;

        // the chatbox area
        if (this.mouseX > 17 && this.mouseY > 357 && this.mouseX < 426 && this.mouseY < 453) {
            if (this.chatInterfaceId !== -1) {
                this.handleInterfaceInput(Component.types[this.chatInterfaceId], this.mouseX, this.mouseY, 17, 357, 0);
            } else if (this.mouseY < 434) {
                this.handleChatMouseInput(this.mouseX - 17, this.mouseY - 357);
            }
        }

        if (this.chatInterfaceId !== -1 && this.lastHoveredInterfaceId !== this.chatHoveredInterfaceIndex) {
            this.redrawChatback = true;
            this.chatHoveredInterfaceIndex = this.lastHoveredInterfaceId;
        }

        let done: boolean = false;
        while (!done) {
            done = true;

            for (let i: number = 0; i < this.menuSize - 1; i++) {
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

                    done = false;
                }
            }
        }
    }

    private handlePrivateChatInput(): void {
        if (this.splitPrivateChat === 0) {
            return;
        }

        let line: number = 0;
        if (this.systemUpdateTimer !== 0) {
            line = 1;
        }

        for (let i: number = 0; i < 100; i++) {
            if (this.messageText[i] !== null) {
                const type: number = this.messageType[i];
                let sender = this.messageSender[i];

                let mod = false;
                if (sender && sender.startsWith('@cr1@')) {
                    sender = sender.substring(5);
                    mod = true;
                } else if (sender && sender.startsWith('@cr2@')) {
                    sender = sender.substring(5);
                    mod = true;
                }

                if ((type === 3 || type === 7) && (type === 7 || this.chatPrivateMode === 0 || (this.chatPrivateMode === 1 && this.isFriend(sender)))) {
                    const y: number = 329 - line * 13;

                    if (this.mouseX > 4 && this.mouseX < 516 && this.mouseY - 4 > y - 10 && this.mouseY - 4 <= y + 3) {
                        if (this.staffmodlevel) {
                            this.menuOption[this.menuSize] = 'Report abuse @whi@' + sender;
                            this.menuAction[this.menuSize] = 2034;
                            this.menuSize++;
                        }

                        this.menuOption[this.menuSize] = 'Add ignore @whi@' + sender;
                        this.menuAction[this.menuSize] = 2436;
                        this.menuSize++;

                        this.menuOption[this.menuSize] = 'Add friend @whi@' + sender;
                        this.menuAction[this.menuSize] = 2406;
                        this.menuSize++;
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

    private handleChatMouseInput(_mouseX: number, mouseY: number): void {
        let line: number = 0;
        for (let i: number = 0; i < 100; i++) {
            if (!this.messageText[i]) {
                continue;
            }

            const type: number = this.messageType[i];
            const y: number = this.chatScrollOffset + 70 + 4 - line * 14;
            if (y < -20) {
                break;
            }

            let sender = this.messageSender[i];
            let mod = false;
            if (sender && sender.startsWith('@cr1@')) {
                sender = sender.substring(5);
                mod = true;
            } else if (sender && sender.startsWith('@cr2@')) {
                sender = sender.substring(5);
                mod = true;
            }

            if (type === 0) {
                line++;
            } else if ((type == 1 || type == 2) && (type == 1 || this.chatPublicMode == 0 || this.chatPublicMode == 1 && this.isFriend(sender))) {
                if (mouseY > y - 14 && mouseY <= y && this.localPlayer && sender !== this.localPlayer.name) {
                    if (this.staffmodlevel >= 1) {
                        this.menuOption[this.menuSize] = 'Report abuse @whi@' + sender;
                        this.menuAction[this.menuSize] = 34;
                        this.menuSize++;
                    }

                    this.menuOption[this.menuSize] = 'Add ignore @whi@' + sender;
                    this.menuAction[this.menuSize] = 436;
                    this.menuSize++;

                    this.menuOption[this.menuSize] = 'Add friend @whi@' + sender;
                    this.menuAction[this.menuSize] = 406;
                    this.menuSize++;
                }

                line++;
            } else if ((type === 3 || type === 7) && this.splitPrivateChat === 0 && (type === 7 || this.chatPrivateMode === 0 || (this.chatPrivateMode === 1 && this.isFriend(sender)))) {
                if (mouseY > y - 14 && mouseY <= y) {
                    if (this.staffmodlevel >= 1) {
                        this.menuOption[this.menuSize] = 'Report abuse @whi@' + sender;
                        this.menuAction[this.menuSize] = 34;
                        this.menuSize++;
                    }

                    this.menuOption[this.menuSize] = 'Add ignore @whi@' + sender;
                    this.menuAction[this.menuSize] = 436;
                    this.menuSize++;

                    this.menuOption[this.menuSize] = 'Add friend @whi@' + sender;
                    this.menuAction[this.menuSize] = 406;
                    this.menuSize++;
                }

                line++;
            } else if (type === 4 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                if (mouseY > y - 14 && mouseY <= y) {
                    this.menuOption[this.menuSize] = 'Accept trade @whi@' + sender;
                    this.menuAction[this.menuSize] = 903;
                    this.menuSize++;
                }

                line++;
            } else if ((type === 5 || type === 6) && this.splitPrivateChat === 0 && this.chatPrivateMode < 2) {
                line++;
            } else if (type === 8 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                if (mouseY > y - 14 && mouseY <= y) {
                    this.menuOption[this.menuSize] = 'Accept duel @whi@' + sender;
                    this.menuAction[this.menuSize] = 363;
                    this.menuSize++;
                }

                line++;
            }
        }
    }

    private handleViewportOptions(): void {
        if (this.objSelected === 0 && this.spellSelected === 0) {
            this.menuOption[this.menuSize] = 'Walk here';
            this.menuAction[this.menuSize] = 660;
            this.menuParamB[this.menuSize] = this.mouseX;
            this.menuParamC[this.menuSize] = this.mouseY;
            this.menuSize++;
        }

        let lastTypecode: number = -1;
        for (let picked: number = 0; picked < Model.pickedCount; picked++) {
            const typecode: number = Model.pickedBitsets[picked];
            const x: number = typecode & 0x7f;
            const z: number = (typecode >> 7) & 0x7f;
            const entityType: number = (typecode >> 29) & 0x3;
            const typeId: number = (typecode >> 14) & 0x7fff;

            if (typecode === lastTypecode) {
                continue;
            }

            lastTypecode = typecode;

            if (entityType === 2 && this.scene && this.scene.getInfo(this.currentLevel, x, z, typecode) >= 0) {
                const loc: LocType = LocType.get(typeId);

                if (this.objSelected === 1) {
                    this.menuOption[this.menuSize] = 'Use ' + this.objSelectedName + ' with @cya@' + loc.name;
                    this.menuAction[this.menuSize] = 450;
                    this.menuParamA[this.menuSize] = typecode;
                    this.menuParamB[this.menuSize] = x;
                    this.menuParamC[this.menuSize] = z;
                    this.menuSize++;
                } else if (this.spellSelected !== 1) {
                    if (loc.op) {
                        for (let i: number = 4; i >= 0; i--) {
                            if (loc.op[i]) {
                                this.menuOption[this.menuSize] = loc.op[i] + ' @cya@' + loc.name;

                                if (i === 0) {
                                    this.menuAction[this.menuSize] = 285;
                                } else if (i === 1) {
                                    this.menuAction[this.menuSize] = 504;
                                } else if (i === 2) {
                                    this.menuAction[this.menuSize] = 364;
                                } else if (i === 3) {
                                    this.menuAction[this.menuSize] = 581;
                                } else if (i === 4) {
                                    this.menuAction[this.menuSize] = 1501;
                                }

                                this.menuParamA[this.menuSize] = typecode;
                                this.menuParamB[this.menuSize] = x;
                                this.menuParamC[this.menuSize] = z;
                                this.menuSize++;
                            }
                        }
                    }

                    this.menuOption[this.menuSize] = 'Examine @cya@' + loc.name;
                    this.menuAction[this.menuSize] = 1175;
                    this.menuParamA[this.menuSize] = typecode;
                    this.menuParamB[this.menuSize] = x;
                    this.menuParamC[this.menuSize] = z;
                    this.menuSize++;
                } else if ((this.activeSpellFlags & 0x4) === 4) {
                    this.menuOption[this.menuSize] = this.spellCaption + ' @cya@' + loc.name;
                    this.menuAction[this.menuSize] = 55;
                    this.menuParamA[this.menuSize] = typecode;
                    this.menuParamB[this.menuSize] = x;
                    this.menuParamC[this.menuSize] = z;
                    this.menuSize++;
                }
            } else if (entityType === 1) {
                const npc: ClientNpc | null = this.npcs[typeId];

                if (npc && npc.type && npc.type.size === 1 && (npc.x & 0x7f) === 64 && (npc.z & 0x7f) === 64) {
                    for (let i: number = 0; i < this.npcCount; i++) {
                        const other: ClientNpc | null = this.npcs[this.npcIds[i]];

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
                        const other: ClientNpc | null = this.npcs[this.npcIds[i]];

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
                const objs: LinkList | null = this.objStacks[this.currentLevel][x][z];
                if (!objs) {
                    continue;
                }

                for (let obj: ClientObj | null = objs.tail() as ClientObj | null; obj; obj = objs.prev() as ClientObj | null) {
                    const type: ObjType = ObjType.get(obj.index);
                    if (this.objSelected === 1) {
                        this.menuOption[this.menuSize] = 'Use ' + this.objSelectedName + ' with @lre@' + type.name;
                        this.menuAction[this.menuSize] = 217;
                        this.menuParamA[this.menuSize] = obj.index;
                        this.menuParamB[this.menuSize] = x;
                        this.menuParamC[this.menuSize] = z;
                        this.menuSize++;
                    } else if (this.spellSelected !== 1) {
                        for (let op: number = 4; op >= 0; op--) {
                            if (type.op && type.op[op]) {
                                this.menuOption[this.menuSize] = type.op[op] + ' @lre@' + type.name;

                                if (op === 0) {
                                    this.menuAction[this.menuSize] = 224;
                                } else if (op === 1) {
                                    this.menuAction[this.menuSize] = 993;
                                } else if (op === 2) {
                                    this.menuAction[this.menuSize] = 99;
                                } else if (op === 3) {
                                    this.menuAction[this.menuSize] = 746;
                                } else if (op === 4) {
                                    this.menuAction[this.menuSize] = 877;
                                }

                                this.menuParamA[this.menuSize] = obj.index;
                                this.menuParamB[this.menuSize] = x;
                                this.menuParamC[this.menuSize] = z;
                                this.menuSize++;
                            } else if (op === 2) {
                                this.menuOption[this.menuSize] = 'Take @lre@' + type.name;
                                this.menuAction[this.menuSize] = 99;
                                this.menuParamA[this.menuSize] = obj.index;
                                this.menuParamB[this.menuSize] = x;
                                this.menuParamC[this.menuSize] = z;
                                this.menuSize++;
                            }
                        }

                        this.menuOption[this.menuSize] = 'Examine @lre@' + type.name;
                        this.menuAction[this.menuSize] = 1102;
                        this.menuParamA[this.menuSize] = obj.index;
                        this.menuParamB[this.menuSize] = x;
                        this.menuParamC[this.menuSize] = z;
                        this.menuSize++;
                    } else if ((this.activeSpellFlags & 0x1) === 1) {
                        this.menuOption[this.menuSize] = this.spellCaption + ' @lre@' + type.name;
                        this.menuAction[this.menuSize] = 965;
                        this.menuParamA[this.menuSize] = obj.index;
                        this.menuParamB[this.menuSize] = x;
                        this.menuParamC[this.menuSize] = z;
                        this.menuSize++;
                    }
                }
            }
        }
    }

    private handleMouseInput(): void {
        if (this.objDragArea !== 0) {
            return;
        }

        if (this.isMobile && this.chatbackInputOpen && this.insideChatPopupArea()) {
            return;
        }

        let button: number = this.mouseClickButton;
        if (this.spellSelected === 1 && this.mouseClickX >= 516 && this.mouseClickY >= 160 && this.mouseClickX <= 765 && this.mouseClickY <= 205) {
            button = 0;
        }

        if (!this.menuVisible) {
            if (button === 1 && this.menuSize > 0) {
                const action: number = this.menuAction[this.menuSize - 1];

                if (action == 602 || action == 596 || action == 22 || action == 892 || action == 415 || action == 405 || action == 38 || action == 422 || action == 478 || action == 347 || action == 188) {
                    const slot: number = this.menuParamB[this.menuSize - 1];
                    const comId: number = this.menuParamC[this.menuSize - 1];
                    const com: Component = Component.types[comId];

                    if (com.draggable || com.swappable) {
                        this.objGrabThreshold = false;
                        this.objDragCycles = 0;
                        this.objDragInterfaceId = comId;
                        this.objDragSlot = slot;
                        this.objDragArea = 2;
                        this.objGrabX = this.mouseClickX;
                        this.objGrabY = this.mouseClickY;

                        if (Component.types[comId].layer === this.viewportInterfaceId) {
                            this.objDragArea = 1;
                        }

                        if (Component.types[comId].layer === this.chatInterfaceId) {
                            this.objDragArea = 3;
                        }

                        return;
                    }
                }
            }

            if (button === 1 && (this.oneMouseButton === 1 || this.isAddFriendOption(this.menuSize - 1)) && this.menuSize > 2) {
                button = 2;
            }

            if (button === 1 && this.menuSize > 0) {
                this.useMenuOption(this.menuSize - 1);
            } else if (button == 2 && this.menuSize > 0) {
                this.showContextMenu();
            }

            return;
        }

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
            for (let i: number = 0; i < this.menuSize; i++) {
                const optionY: number = menuY + (this.menuSize - 1 - i) * 15 + 31;
                if (clickX > menuX && clickX < menuX + menuWidth && clickY > optionY - 13 && clickY < optionY + 3) {
                    option = i;
                }
            }

            if (option !== -1) {
                this.useMenuOption(option);
            }

            this.menuVisible = false;

            if (this.menuArea === 1) {
                this.redrawSidebar = true;
            } else if (this.menuArea === 2) {
                this.redrawChatback = true;
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
                this.menuVisible = false;

                if (this.menuArea === 1) {
                    this.redrawSidebar = true;
                }

                if (this.menuArea === 2) {
                    this.redrawChatback = true;
                }
            }
        }
    }

    handleMinimapInput(): void {
        if (this.mouseClickButton !== 1 || !this.localPlayer) {
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

        if (this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], tileX, tileZ, 1, 0, 0, 0, 0, 0, true)) {
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

    private handleTabInput(): void {
        if (this.mouseClickButton !== 1) {
            return;
        }

        if (this.mouseClickX >= 539 && this.mouseClickX <= 573 && this.mouseClickY >= 169 && this.mouseClickY < 205 && this.tabInterfaceId[0] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 0;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 569 && this.mouseClickX <= 599 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.tabInterfaceId[1] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 1;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 597 && this.mouseClickX <= 627 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.tabInterfaceId[2] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 2;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 625 && this.mouseClickX <= 669 && this.mouseClickY >= 168 && this.mouseClickY < 203 && this.tabInterfaceId[3] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 3;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 666 && this.mouseClickX <= 696 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.tabInterfaceId[4] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 4;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 694 && this.mouseClickX <= 724 && this.mouseClickY >= 168 && this.mouseClickY < 205 && this.tabInterfaceId[5] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 5;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 722 && this.mouseClickX <= 756 && this.mouseClickY >= 169 && this.mouseClickY < 205 && this.tabInterfaceId[6] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 6;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 540 && this.mouseClickX <= 574 && this.mouseClickY >= 466 && this.mouseClickY < 502 && this.tabInterfaceId[7] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 7;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 572 && this.mouseClickX <= 602 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.tabInterfaceId[8] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 8;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 599 && this.mouseClickX <= 629 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.tabInterfaceId[9] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 9;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 627 && this.mouseClickX <= 671 && this.mouseClickY >= 467 && this.mouseClickY < 502 && this.tabInterfaceId[10] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 10;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 669 && this.mouseClickX <= 699 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.tabInterfaceId[11] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 11;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 696 && this.mouseClickX <= 726 && this.mouseClickY >= 466 && this.mouseClickY < 503 && this.tabInterfaceId[12] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 12;
            this.redrawSideicons = true;
        } else if (this.mouseClickX >= 724 && this.mouseClickX <= 758 && this.mouseClickY >= 466 && this.mouseClickY < 502 && this.tabInterfaceId[13] != -1) {
            this.redrawSidebar = true;
            this.selectedTab = 13;
            this.redrawSideicons = true;
        }

        Client.cyclelogic1++;
        if (Client.cyclelogic1 > 150) {
            Client.cyclelogic1 = 0;
            this.out.p1isaac(ClientProt.ANTICHEAT_CYCLELOGIC1);
            this.out.p1(43);
        }
    }

    private handleChatModeInput(): void {
        if (this.mouseClickButton !== 1) {
            return;
        }

        if (this.mouseClickX >= 6 && this.mouseClickX <= 106 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.chatPublicMode = (this.chatPublicMode + 1) % 4;
            this.redrawPrivacySettings = true;
            this.redrawChatback = true;

            this.out.p1isaac(ClientProt.CHAT_SETMODE);
            this.out.p1(this.chatPublicMode);
            this.out.p1(this.chatPrivateMode);
            this.out.p1(this.chatTradeMode);
        } else if (this.mouseClickX >= 135 && this.mouseClickX <= 235 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.chatPrivateMode = (this.chatPrivateMode + 1) % 3;
            this.redrawPrivacySettings = true;
            this.redrawChatback = true;

            this.out.p1isaac(ClientProt.CHAT_SETMODE);
            this.out.p1(this.chatPublicMode);
            this.out.p1(this.chatPrivateMode);
            this.out.p1(this.chatTradeMode);
        } else if (this.mouseClickX >= 273 && this.mouseClickX <= 373 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.chatTradeMode = (this.chatTradeMode + 1) % 3;
            this.redrawPrivacySettings = true;
            this.redrawChatback = true;

            this.out.p1isaac(ClientProt.CHAT_SETMODE);
            this.out.p1(this.chatPublicMode);
            this.out.p1(this.chatPrivateMode);
            this.out.p1(this.chatTradeMode);
        } else if (this.mouseClickX >= 412 && this.mouseClickX <= 512 && this.mouseClickY >= 467 && this.mouseClickY <= 499) {
            this.closeInterfaces();

            this.reportAbuseInput = '';
            this.reportAbuseMuteOption = false;

            for (let i: number = 0; i < Component.types.length; i++) {
                if (Component.types[i] && Component.types[i].clientCode === 600) {
                    this.reportAbuseInterfaceId = this.viewportInterfaceId = Component.types[i].layer;
                    break;
                }
            }

            if (this.isMobile) {
                MobileKeyboard.show();
            }
        }
    }

    private closeInterfaces(): void {
        this.out.p1isaac(ClientProt.CLOSE_MODAL);

        if (this.sidebarInterfaceId !== -1) {
            this.sidebarInterfaceId = -1;
            this.redrawSidebar = true;
            this.pressedContinueOption = false;
            this.redrawSideicons = true;
        }

        if (this.chatInterfaceId !== -1) {
            this.chatInterfaceId = -1;
            this.redrawChatback = true;
            this.pressedContinueOption = false;
        }

        this.viewportInterfaceId = -1;
    }

    private updateEntityChats(): void {
        for (let i: number = -1; i < this.playerCount; i++) {
            let index: number;
            if (i === -1) {
                index = Constants.LOCAL_PLAYER_INDEX;
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
            const npc: ClientNpc | null = this.npcs[index];

            if (npc && npc.chatTimer > 0) {
                npc.chatTimer--;

                if (npc.chatTimer === 0) {
                    npc.chatMessage = null;
                }
            }
        }
    }

    private updateOrbitCamera(): void {
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

        if (this.actionKey[1] === 1) {
            this.orbitCameraYawVelocity += ((-this.orbitCameraYawVelocity - 24) / 2) | 0;
        } else if (this.actionKey[2] === 1) {
            this.orbitCameraYawVelocity += ((24 - this.orbitCameraYawVelocity) / 2) | 0;
        } else {
            this.orbitCameraYawVelocity = (this.orbitCameraYawVelocity / 2) | 0;
        }

        if (this.actionKey[3] === 1) {
            this.orbitCameraPitchVelocity += ((12 - this.orbitCameraPitchVelocity) / 2) | 0;
        } else if (this.actionKey[4] === 1) {
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
        const orbitY: number = this.getHeightmapY(this.currentLevel, this.orbitCameraX, this.orbitCameraZ);
        let maxY: number = 0;

        if (this.levelHeightmap) {
            if (orbitTileX > 3 && orbitTileZ > 3 && orbitTileX < 100 && orbitTileZ < 100) {
                for (let x: number = orbitTileX - 4; x <= orbitTileX + 4; x++) {
                    for (let z: number = orbitTileZ - 4; z <= orbitTileZ + 4; z++) {
                        let level: number = this.currentLevel;
                        if (level < 3 && this.levelTileFlags && (this.levelTileFlags[1][x][z] & 0x2) === 2) {
                            level++;
                        }

                        const y: number = orbitY - this.levelHeightmap[level][x][z];
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

    private applyCutscene(): void {
        let x: number = this.cutsceneSrcLocalTileX * 128 + 64;
        let z: number = this.cutsceneSrcLocalTileZ * 128 + 64;
        let y: number = this.getHeightmapY(this.currentLevel, this.cutsceneSrcLocalTileX, this.cutsceneSrcLocalTileZ) - this.cutsceneSrcHeight;

        if (this.cameraX < x) {
            this.cameraX += this.cutsceneMoveSpeed + ((((x - this.cameraX) * this.cutsceneMoveAcceleration) / 1000) | 0);
            if (this.cameraX > x) {
                this.cameraX = x;
            }
        }

        if (this.cameraX > x) {
            this.cameraX -= this.cutsceneMoveSpeed + ((((this.cameraX - x) * this.cutsceneMoveAcceleration) / 1000) | 0);
            if (this.cameraX < x) {
                this.cameraX = x;
            }
        }

        if (this.cameraY < y) {
            this.cameraY += this.cutsceneMoveSpeed + ((((y - this.cameraY) * this.cutsceneMoveAcceleration) / 1000) | 0);
            if (this.cameraY > y) {
                this.cameraY = y;
            }
        }

        if (this.cameraY > y) {
            this.cameraY -= this.cutsceneMoveSpeed + ((((this.cameraY - y) * this.cutsceneMoveAcceleration) / 1000) | 0);
            if (this.cameraY < y) {
                this.cameraY = y;
            }
        }

        if (this.cameraZ < z) {
            this.cameraZ += this.cutsceneMoveSpeed + ((((z - this.cameraZ) * this.cutsceneMoveAcceleration) / 1000) | 0);
            if (this.cameraZ > z) {
                this.cameraZ = z;
            }
        }

        if (this.cameraZ > z) {
            this.cameraZ -= this.cutsceneMoveSpeed + ((((this.cameraZ - z) * this.cutsceneMoveAcceleration) / 1000) | 0);
            if (this.cameraZ < z) {
                this.cameraZ = z;
            }
        }

        x = this.cutsceneDstLocalTileX * 128 + 64;
        z = this.cutsceneDstLocalTileZ * 128 + 64;
        y = this.getHeightmapY(this.currentLevel, this.cutsceneDstLocalTileX, this.cutsceneDstLocalTileZ) - this.cutsceneDstHeight;

        const dx: number = x - this.cameraX;
        const dy: number = y - this.cameraY;
        const dz: number = z - this.cameraZ;

        const distance: number = Math.sqrt(dx * dx + dz * dz) | 0;
        let pitch: number = ((Math.atan2(dy, distance) * 325.949) | 0) & 0x7ff;
        const yaw: number = ((Math.atan2(dx, dz) * -325.949) | 0) & 0x7ff;

        if (pitch < 128) {
            pitch = 128;
        } else if (pitch > 383) {
            pitch = 383;
        }

        if (this.cameraPitch < pitch) {
            this.cameraPitch += this.cutsceneRotateSpeed + ((((pitch - this.cameraPitch) * this.cutsceneRotateAcceleration) / 1000) | 0);
            if (this.cameraPitch > pitch) {
                this.cameraPitch = pitch;
            }
        }

        if (this.cameraPitch > pitch) {
            this.cameraPitch -= this.cutsceneRotateSpeed + ((((this.cameraPitch - pitch) * this.cutsceneRotateAcceleration) / 1000) | 0);
            if (this.cameraPitch < pitch) {
                this.cameraPitch = pitch;
            }
        }

        let deltaYaw: number = yaw - this.cameraYaw;
        if (deltaYaw > 1024) {
            deltaYaw -= 2048;
        } else if (deltaYaw < -1024) {
            deltaYaw += 2048;
        }

        if (deltaYaw > 0) {
            this.cameraYaw += this.cutsceneRotateSpeed + (((deltaYaw * this.cutsceneRotateAcceleration) / 1000) | 0);
            this.cameraYaw &= 0x7ff;
        }

        if (deltaYaw < 0) {
            this.cameraYaw -= this.cutsceneRotateSpeed + (((-deltaYaw * this.cutsceneRotateAcceleration) / 1000) | 0);
            this.cameraYaw &= 0x7ff;
        }

        let tmp: number = yaw - this.cameraYaw;
        if (tmp > 1024) {
            tmp -= 2048;
        } else if (tmp < -1024) {
            tmp += 2048;
        }

        if ((tmp < 0 && deltaYaw > 0) || (tmp > 0 && deltaYaw < 0)) {
            this.cameraYaw = yaw;
        }
    }

    private async handleInputKey(): Promise<void> {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            let key: number;
            do {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    key = this.pollKey();
                    if (key === -1) {
                        return;
                    }

                    if (this.viewportInterfaceId !== -1 && this.viewportInterfaceId === this.reportAbuseInterfaceId) {
                        if (key === 8 && this.reportAbuseInput.length > 0) {
                            this.reportAbuseInput = this.reportAbuseInput.substring(0, this.reportAbuseInput.length - 1);
                        }
                        break;
                    }

                    if (this.showSocialInput) {
                        if (key >= 32 && key <= 122 && this.socialInput.length < 80) {
                            this.socialInput = this.socialInput + String.fromCharCode(key);
                            this.redrawChatback = true;
                        }

                        if (key === 8 && this.socialInput.length > 0) {
                            this.socialInput = this.socialInput.substring(0, this.socialInput.length - 1);
                            this.redrawChatback = true;
                        }

                        if (key === 13 || key === 10) {
                            this.showSocialInput = false;
                            this.redrawChatback = true;

                            let username: bigint;
                            if (this.socialInputType === 1) {
                                username = JString.toBase37(this.socialInput);
                                this.addFriend(username);
                            }

                            if (this.socialInputType === 2 && this.friendCount > 0) {
                                username = JString.toBase37(this.socialInput);
                                this.removeFriend(username);
                            }

                            if (this.socialInputType === 3 && this.socialInput.length > 0 && this.socialName37) {
                                this.out.p1isaac(ClientProt.MESSAGE_PRIVATE);
                                this.out.p1(0);
                                const start: number = this.out.pos;

                                this.out.p8(this.socialName37);
                                WordPack.pack(this.out, this.socialInput);
                                this.out.psize1(this.out.pos - start);

                                this.socialInput = JString.toSentenceCase(this.socialInput);
                                this.socialInput = WordFilter.filter(this.socialInput);
                                this.addMessage(6, this.socialInput, JString.formatName(JString.fromBase37(this.socialName37)));

                                if (this.chatPrivateMode === 2) {
                                    this.chatPrivateMode = 1;
                                    this.redrawPrivacySettings = true;

                                    this.out.p1isaac(ClientProt.CHAT_SETMODE);
                                    this.out.p1(this.chatPublicMode);
                                    this.out.p1(this.chatPrivateMode);
                                    this.out.p1(this.chatTradeMode);
                                }
                            }

                            if (this.socialInputType === 4 && this.ignoreCount < 100) {
                                username = JString.toBase37(this.socialInput);
                                this.addIgnore(username);
                            }

                            if (this.socialInputType === 5 && this.ignoreCount > 0) {
                                username = JString.toBase37(this.socialInput);
                                this.removeIgnore(username);
                            }
                        }
                    } else if (this.chatbackInputOpen) {
                        if (key >= 48 && key <= 57 && this.chatbackInput.length < 10) {
                            this.chatbackInput = this.chatbackInput + String.fromCharCode(key);
                            this.redrawChatback = true;
                        }

                        if (key === 8 && this.chatbackInput.length > 0) {
                            this.chatbackInput = this.chatbackInput.substring(0, this.chatbackInput.length - 1);
                            this.redrawChatback = true;
                        }

                        if (key === 13 || key === 10) {
                            if (this.chatbackInput.length > 0) {
                                let value: number = 0;
                                try {
                                    value = parseInt(this.chatbackInput, 10);
                                } catch (e) {
                                }

                                this.out.p1isaac(ClientProt.RESUME_P_COUNTDIALOG);
                                this.out.p4(value);
                            }

                            this.chatbackInputOpen = false;
                            this.redrawChatback = true;
                        }
                    } else if (this.chatInterfaceId === -1) {
                        // custom: when typing a command, you can use the debugproc character (tilde)
                        if (key >= 32 && (key <= 122 || (this.chatTyped.startsWith('::') && key <= 126)) && this.chatTyped.length < 80) {
                            this.chatTyped = this.chatTyped + String.fromCharCode(key);
                            this.redrawChatback = true;
                        }

                        if (key === 8 && this.chatTyped.length > 0) {
                            this.chatTyped = this.chatTyped.substring(0, this.chatTyped.length - 1);
                            this.redrawChatback = true;
                        }

                        if ((key === 13 || key === 10) && this.chatTyped.length > 0) {
                            if (this.staffmodlevel === 2) {
                                if (this.chatTyped === '::clientdrop') {
                                    await this.tryReconnect();
                                } else if (this.chatTyped === '::prefetchmusic') {
                                    if (this.onDemand) {
                                        for (let i = 0; i < this.onDemand.getFileCount(2); i++) {
                                            this.onDemand.prefetchPriority(2, i, 1);
                                        }
                                    }
                                } else if (this.chatTyped === '::lag') {
                                    this.lag();
                                }
                            }

                            // custom: player-facing commands
                            if (this.chatTyped === '::fpson') {
                                // authentic in later revs
                                this.displayFps = true;
                            } else if (this.chatTyped === '::fpsoff') {
                                // authentic in later revs
                                this.displayFps = false;
                            } else if (this.chatTyped.startsWith('::fps ')) {
                                // custom ::fps command for setting a target framerate
                                try {
                                    const desiredFps = parseInt(this.chatTyped.substring(6)) || 50;
                                    this.setTargetedFramerate(desiredFps);
                                } catch (e) { }
                            } else if (this.chatTyped.startsWith('::')) {
                                this.out.p1isaac(ClientProt.CLIENT_CHEAT);
                                this.out.p1(this.chatTyped.length - 1);
                                this.out.pjstr(this.chatTyped.substring(2));
                            } else {
                                let color: number = 0;
                                if (this.chatTyped.startsWith('yellow:')) {
                                    color = 0;
                                    this.chatTyped = this.chatTyped.substring(7);
                                } else if (this.chatTyped.startsWith('red:')) {
                                    color = 1;
                                    this.chatTyped = this.chatTyped.substring(4);
                                } else if (this.chatTyped.startsWith('green:')) {
                                    color = 2;
                                    this.chatTyped = this.chatTyped.substring(6);
                                } else if (this.chatTyped.startsWith('cyan:')) {
                                    color = 3;
                                    this.chatTyped = this.chatTyped.substring(5);
                                } else if (this.chatTyped.startsWith('purple:')) {
                                    color = 4;
                                    this.chatTyped = this.chatTyped.substring(7);
                                } else if (this.chatTyped.startsWith('white:')) {
                                    color = 5;
                                    this.chatTyped = this.chatTyped.substring(6);
                                } else if (this.chatTyped.startsWith('flash1:')) {
                                    color = 6;
                                    this.chatTyped = this.chatTyped.substring(7);
                                } else if (this.chatTyped.startsWith('flash2:')) {
                                    color = 7;
                                    this.chatTyped = this.chatTyped.substring(7);
                                } else if (this.chatTyped.startsWith('flash3:')) {
                                    color = 8;
                                    this.chatTyped = this.chatTyped.substring(7);
                                } else if (this.chatTyped.startsWith('glow1:')) {
                                    color = 9;
                                    this.chatTyped = this.chatTyped.substring(6);
                                } else if (this.chatTyped.startsWith('glow2:')) {
                                    color = 10;
                                    this.chatTyped = this.chatTyped.substring(6);
                                } else if (this.chatTyped.startsWith('glow3:')) {
                                    color = 11;
                                    this.chatTyped = this.chatTyped.substring(6);
                                }

                                let effect: number = 0;
                                if (this.chatTyped.startsWith('wave:')) {
                                    effect = 1;
                                    this.chatTyped = this.chatTyped.substring(5);
                                }
                                if (this.chatTyped.startsWith('scroll:')) {
                                    effect = 2;
                                    this.chatTyped = this.chatTyped.substring(7);
                                }

                                this.out.p1isaac(ClientProt.MESSAGE_PUBLIC);
                                this.out.p1(0);
                                const start: number = this.out.pos;

                                this.out.p1(color);
                                this.out.p1(effect);
                                WordPack.pack(this.out, this.chatTyped);
                                this.out.psize1(this.out.pos - start);

                                this.chatTyped = JString.toSentenceCase(this.chatTyped);
                                this.chatTyped = WordFilter.filter(this.chatTyped);

                                if (this.localPlayer && this.localPlayer.name) {
                                    this.localPlayer.chatMessage = this.chatTyped;
                                    this.localPlayer.chatColour = color;
                                    this.localPlayer.chatEffect = effect;
                                    this.localPlayer.chatTimer = 150;

                                    if (this.staffmodlevel === 2) {
                                        this.addMessage(2, this.localPlayer.chatMessage, '@cr2@' + this.localPlayer.name);
                                    } else if (this.staffmodlevel === 1) {
                                        this.addMessage(2, this.localPlayer.chatMessage, '@cr1@' + this.localPlayer.name);
                                    } else {
                                        this.addMessage(2, this.localPlayer.chatMessage, this.localPlayer.name);
                                    }
                                }

                                if (this.chatPublicMode === 2) {
                                    this.chatPublicMode = 3;
                                    this.redrawPrivacySettings = true;

                                    this.out.p1isaac(ClientProt.CHAT_SETMODE);
                                    this.out.p1(this.chatPublicMode);
                                    this.out.p1(this.chatPrivateMode);
                                    this.out.p1(this.chatTradeMode);
                                }
                            }

                            this.chatTyped = '';
                            this.redrawChatback = true;
                        }
                    }
                }
            } while ((key < 97 || key > 122) && (key < 65 || key > 90) && (key < 48 || key > 57) && key !== 32);

            if (this.reportAbuseInput.length < 12) {
                this.reportAbuseInput = this.reportAbuseInput + String.fromCharCode(key);
            }
        }
    }

    private lag() {
        console.log('============');
        console.log(`flame-cycle:${this.flameCycle0}`);
        if (this.onDemand) {
            console.log(`od-cycle:${this.onDemand.cycle}`);
        }
        console.log(`loop-cycle:${this.loopCycle}`);
        console.log(`draw-cycle:${this.drawCycle}`);
        console.log(`ptype:${this.ptype}`);
        console.log(`psize:${this.psize}`);
        // stream.debug();
        // super.debug = true;
    }

    private updatePlayers(): void {
        for (let i: number = -1; i < this.playerCount; i++) {
            let index: number;
            if (i === -1) {
                index = Constants.LOCAL_PLAYER_INDEX;
            } else {
                index = this.playerIds[i];
            }

            const player: ClientPlayer | null = this.players[index];
            if (player) {
                this.updateEntity(player);
            }
        }

        Client.cyclelogic6++;
        if (Client.cyclelogic6 > 1406) {
            Client.cyclelogic6 = 0;

            this.out.p1isaac(ClientProt.ANTICHEAT_CYCLELOGIC6);
            this.out.p1(0);
            const start: number = this.out.pos;
            this.out.p1(162);
            this.out.p1(22);
            if (((Math.random() * 2.0) | 0) === 0) {
                this.out.p1(84);
            }
            this.out.p2(31824);
            this.out.p2(13490);
            if (((Math.random() * 2.0) | 0) === 0) {
                this.out.p1(123);
            }
            if (((Math.random() * 2.0) | 0) === 0) {
                this.out.p1(134);
            }
            this.out.p1(100);
            this.out.p1(94);
            this.out.p2(35521);
            this.out.psize1(this.out.pos - start);
        }
    }

    private updateNpcs(): void {
        for (let i: number = 0; i < this.npcCount; i++) {
            const id: number = this.npcIds[i];
            const npc: ClientNpc | null = this.npcs[id];

            if (npc && npc.type) {
                this.updateEntity(npc);
            }
        }
    }

    private updateEntity(e: ClientEntity): void {
        if (e.x < 128 || e.z < 128 || e.x >= 13184 || e.z >= 13184) {
            e.primarySeqId = -1;
            e.spotanimId = -1;
            e.forceMoveEndCycle = 0;
            e.forceMoveStartCycle = 0;
            e.x = e.routeTileX[0] * 128 + e.size * 64;
            e.z = e.routeTileZ[0] * 128 + e.size * 64;
            e.clearRoute();
        }

        if (e === this.localPlayer && (e.x < 1536 || e.z < 1536 || e.x >= 11776 || e.z >= 11776)) {
            e.primarySeqId = -1;
            e.spotanimId = -1;
            e.forceMoveEndCycle = 0;
            e.forceMoveStartCycle = 0;
            e.x = e.routeTileX[0] * 128 + e.size * 64;
            e.z = e.routeTileZ[0] * 128 + e.size * 64;
            e.clearRoute();
        }

        if (e.forceMoveEndCycle > this.loopCycle) {
            this.updateForceMovement(e);
        } else if (e.forceMoveStartCycle >= this.loopCycle) {
            this.startForceMovement(e);
        } else {
            this.updateMovement(e);
        }

        this.updateFacingDirection(e);
        this.updateSequences(e);
    }

    private updateForceMovement(e: ClientEntity): void {
        const delta: number = e.forceMoveEndCycle - this.loopCycle;
        const dstX: number = e.forceMoveStartSceneTileX * 128 + e.size * 64;
        const dstZ: number = e.forceMoveStartSceneTileZ * 128 + e.size * 64;

        e.x += ((dstX - e.x) / delta) | 0;
        e.z += ((dstZ - e.z) / delta) | 0;

        e.seqDelayMove = 0;

        if (e.forceMoveFaceDirection === 0) {
            e.dstYaw = 1024;
        } else if (e.forceMoveFaceDirection === 1) {
            e.dstYaw = 1536;
        } else if (e.forceMoveFaceDirection === 2) {
            e.dstYaw = 0;
        } else if (e.forceMoveFaceDirection === 3) {
            e.dstYaw = 512;
        }
    }

    private startForceMovement(e: ClientEntity): void {
        if (e.forceMoveStartCycle === this.loopCycle || e.primarySeqId === -1 || e.primarySeqDelay !== 0 || e.primarySeqCycle + 1 > SeqType.types[e.primarySeqId].getFrameDuration(e.primarySeqFrame)) {
            const duration: number = e.forceMoveStartCycle - e.forceMoveEndCycle;
            const delta: number = this.loopCycle - e.forceMoveEndCycle;
            const dx0: number = e.forceMoveStartSceneTileX * 128 + e.size * 64;
            const dz0: number = e.forceMoveStartSceneTileZ * 128 + e.size * 64;
            const dx1: number = e.forceMoveEndSceneTileX * 128 + e.size * 64;
            const dz1: number = e.forceMoveEndSceneTileZ * 128 + e.size * 64;
            e.x = ((dx0 * (duration - delta) + dx1 * delta) / duration) | 0;
            e.z = ((dz0 * (duration - delta) + dz1 * delta) / duration) | 0;
        }

        e.seqDelayMove = 0;

        if (e.forceMoveFaceDirection === 0) {
            e.dstYaw = 1024;
        } else if (e.forceMoveFaceDirection === 1) {
            e.dstYaw = 1536;
        } else if (e.forceMoveFaceDirection === 2) {
            e.dstYaw = 0;
        } else if (e.forceMoveFaceDirection === 3) {
            e.dstYaw = 512;
        }

        e.yaw = e.dstYaw;
    }

    private updateMovement(e: ClientEntity): void {
        e.secondarySeqId = e.readyanim;

        if (e.routeLength === 0) {
            e.seqDelayMove = 0;
            return;
        }

        if (e.primarySeqId !== -1 && e.primarySeqDelay === 0) {
            const seq: SeqType = SeqType.types[e.primarySeqId];
            if (e.preanimRouteLength > 0 && seq.preanim_move === PreanimMove.DELAYMOVE) {
                e.seqDelayMove++;
                return;
            }

            if (e.preanimRouteLength <= 0 && seq.postanim_move === PostanimMove.DELAYMOVE) {
                e.seqDelayMove++;
                return;
            }
        }

        const x: number = e.x;
        const z: number = e.z;
        const dstX: number = e.routeTileX[e.routeLength - 1] * 128 + e.size * 64;
        const dstZ: number = e.routeTileZ[e.routeLength - 1] * 128 + e.size * 64;

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

        e.secondarySeqId = seqId;

        let moveSpeed: number = 4;
        if (e.yaw !== e.dstYaw && e.targetId === -1) {
            moveSpeed = 2;
        }

        if (e.routeLength > 2) {
            moveSpeed = 6;
        }

        if (e.routeLength > 3) {
            moveSpeed = 8;
        }

        if (e.seqDelayMove > 0 && e.routeLength > 1) {
            moveSpeed = 8;
            e.seqDelayMove--;
        }

        if (e.routeRun[e.routeLength - 1]) {
            moveSpeed <<= 0x1;
        }

        // Scale movement speed to match server tick rate
        moveSpeed = Math.ceil(moveSpeed * this.tickSpeedMultiplier);

        if (moveSpeed >= 8 && e.secondarySeqId === e.walkanim && e.runanim !== -1) {
            e.secondarySeqId = e.runanim;
        }

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

    private updateFacingDirection(e: ClientEntity): void {
        if (e.targetId !== -1 && e.targetId < 32768) {
            const npc: ClientNpc | null = this.npcs[e.targetId];
            if (npc) {
                const dstX: number = e.x - npc.x;
                const dstZ: number = e.z - npc.z;

                if (dstX !== 0 || dstZ !== 0) {
                    e.dstYaw = ((Math.atan2(dstX, dstZ) * 325.949) | 0) & 0x7ff;
                }
            }
        }

        if (e.targetId >= 32768) {
            let index: number = e.targetId - 32768;
            if (index === this.localPid) {
                index = Constants.LOCAL_PLAYER_INDEX;
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

        if ((e.targetTileX !== 0 || e.targetTileZ !== 0) && (e.routeLength === 0 || e.seqDelayMove > 0)) {
            const dstX: number = e.x - (e.targetTileX - this.sceneBaseTileX - this.sceneBaseTileX) * 64;
            const dstZ: number = e.z - (e.targetTileZ - this.sceneBaseTileZ - this.sceneBaseTileZ) * 64;

            if (dstX !== 0 || dstZ !== 0) {
                e.dstYaw = ((Math.atan2(dstX, dstZ) * 325.949) | 0) & 0x7ff;
            }

            e.targetTileX = 0;
            e.targetTileZ = 0;
        }

        const remainingYaw: number = (e.dstYaw - e.yaw) & 0x7ff;
        const turnSpeed: number = Math.ceil(32 * this.tickSpeedMultiplier);
        if (remainingYaw !== 0) {
            if (remainingYaw < turnSpeed || remainingYaw > (2048 - turnSpeed)) {
                e.yaw = e.dstYaw;
            } else if (remainingYaw > 1024) {
                e.yaw -= turnSpeed;
            } else {
                e.yaw += turnSpeed;
            }

            e.yaw &= 0x7ff;

            if (e.secondarySeqId === e.readyanim && e.yaw !== e.dstYaw) {
                if (e.turnanim != -1) {
                    e.secondarySeqId = e.turnanim;
                } else {
                    e.secondarySeqId = e.walkanim;
                }
            }
        }
    }

    private updateSequences(e: ClientEntity): void {
        e.needsForwardDrawPadding = false;

        const animSpeed: number = Math.ceil(this.tickSpeedMultiplier);

        let seq: SeqType | null;
        if (e.secondarySeqId !== -1) {
            seq = SeqType.types[e.secondarySeqId];
            e.secondarySeqCycle += animSpeed;

            if (e.secondarySeqFrame < seq.frameCount && e.secondarySeqCycle > seq.getFrameDuration(e.secondarySeqFrame)) {
                e.secondarySeqCycle = 0;
                e.secondarySeqFrame++;
            }

            if (e.secondarySeqFrame >= seq.frameCount) {
                e.secondarySeqCycle = 0;
                e.secondarySeqFrame = 0;
            }
        }

        if (e.spotanimId !== -1 && this.loopCycle >= e.spotanimLastCycle) {
            if (e.spotanimFrame < 0) {
                e.spotanimFrame = 0;
            }

            seq = SpotAnimType.types[e.spotanimId].seq;
            e.spotanimCycle += animSpeed;

            while (seq && e.spotanimFrame < seq.frameCount && e.spotanimCycle > seq.getFrameDuration(e.spotanimFrame)) {
                e.spotanimCycle -= seq.getFrameDuration(e.spotanimFrame);
                e.spotanimFrame++;
            }

            if (seq && e.spotanimFrame >= seq.frameCount) {
                if (e.spotanimFrame < 0 || e.spotanimFrame >= seq.frameCount) {
                    e.spotanimId = -1;
                }
            }
        }

        if (e.primarySeqId != -1 && e.primarySeqDelay <= 1) {
            seq = SeqType.types[e.primarySeqId];
            if (seq.preanim_move === PreanimMove.DELAYANIM && e.preanimRouteLength > 0 && this.loopCycle >= e.forceMoveStartCycle && this.loopCycle > e.forceMoveEndCycle) {
                e.primarySeqDelay = 1;
                return;
            }
        }

        if (e.primarySeqId !== -1 && e.primarySeqDelay === 0) {
            seq = SeqType.types[e.primarySeqId];
            e.primarySeqCycle += animSpeed;

            while (e.primarySeqFrame < seq.frameCount && e.primarySeqCycle > seq.getFrameDuration(e.primarySeqFrame)) {
                e.primarySeqCycle -= seq.getFrameDuration(e.primarySeqFrame);
                e.primarySeqFrame++;
            }

            if (e.primarySeqFrame >= seq.frameCount) {
                e.primarySeqFrame -= seq.loops;
                e.primarySeqLoop++;

                if (e.primarySeqLoop >= seq.maxloops) {
                    e.primarySeqId = -1;
                }

                if (e.primarySeqFrame < 0 || e.primarySeqFrame >= seq.frameCount) {
                    e.primarySeqId = -1;
                }
            }

            e.needsForwardDrawPadding = seq.stretches;
        }

        if (e.primarySeqDelay > 0) {
            e.primarySeqDelay -= animSpeed;
            if (e.primarySeqDelay < 0) {
                e.primarySeqDelay = 0;
            }
        }
    }

    private async loadTitle(): Promise<void> {
        if (this.imageTitle2) {
            return;
        }

        this.drawArea = null;
        this.areaChatback = null;
        this.areaMapback = null;
        this.areaSidebar = null;
        this.areaViewport = null;
        this.areaBackbase1 = null;
        this.areaBackbase2 = null;
        this.areaBackhmid1 = null;

        this.imageTitle0 = new PixMap(128, 265);
        Pix2D.clear();

        this.imageTitle1 = new PixMap(128, 265);
        Pix2D.clear();

        this.imageTitle2 = new PixMap(509, 171);
        Pix2D.clear();

        this.imageTitle3 = new PixMap(360, 132);
        Pix2D.clear();

        this.imageTitle4 = new PixMap(360, 200);
        Pix2D.clear();

        this.imageTitle5 = new PixMap(202, 238);
        Pix2D.clear();

        this.imageTitle6 = new PixMap(203, 238);
        Pix2D.clear();

        this.imageTitle7 = new PixMap(74, 94);
        Pix2D.clear();

        this.imageTitle8 = new PixMap(75, 94);
        Pix2D.clear();

        if (this.jagTitle) {
            await this.loadTitleBackground();
            this.loadTitleImages();
        }

        this.redrawFrame = true;
    }

    private async loadTitleBackground(): Promise<void> {
        if (!this.jagTitle) {
            return;
        }

        const background: Pix32 = await Pix32.fromJpeg(this.jagTitle, 'title');

        this.imageTitle0?.bind();
        background.blitOpaque(0, 0);

        this.imageTitle1?.bind();
        background.blitOpaque(-637, 0);

        this.imageTitle2?.bind();
        background.blitOpaque(-128, 0);

        this.imageTitle3?.bind();
        background.blitOpaque(-202, -371);

        this.imageTitle4?.bind();
        background.blitOpaque(-202, -171);

        this.imageTitle5?.bind();
        background.blitOpaque(0, -265);

        this.imageTitle6?.bind();
        background.blitOpaque(-562, -265);

        this.imageTitle7?.bind();
        background.blitOpaque(-128, -171);

        this.imageTitle8?.bind();
        background.blitOpaque(-562, -171);

        // draw right side (mirror image)
        background.flipHorizontally();

        this.imageTitle0?.bind();
        background.blitOpaque(382, 0);

        this.imageTitle1?.bind();
        background.blitOpaque(-255, 0);

        this.imageTitle2?.bind();
        background.blitOpaque(254, 0);

        this.imageTitle3?.bind();
        background.blitOpaque(180, -371);

        this.imageTitle4?.bind();
        background.blitOpaque(180, -171);

        this.imageTitle5?.bind();
        background.blitOpaque(382, -265);

        this.imageTitle6?.bind();
        background.blitOpaque(-180, -265);

        this.imageTitle7?.bind();
        background.blitOpaque(254, -171);

        this.imageTitle8?.bind();
        background.blitOpaque(-180, -171);

        const logo: Pix32 = Pix32.fromArchive(this.jagTitle, 'logo');
        this.imageTitle2?.bind();
        logo.draw(((this.width / 2) | 0) - ((logo.cropRight / 2) | 0) - 128, 18);
    }

    private loadTitleImages(): void {
        if (!this.jagTitle) {
            return;
        }

        this.imageTitlebox = Pix8.fromArchive(this.jagTitle, 'titlebox');
        this.imageTitlebutton = Pix8.fromArchive(this.jagTitle, 'titlebutton');
        for (let i: number = 0; i < 12; i++) {
            this.imageRunes[i] = Pix8.fromArchive(this.jagTitle, 'runes', i);
        }
        this.imageFlamesLeft = new Pix32(128, 265);
        this.imageFlamesRight = new Pix32(128, 265);

        if (this.imageTitle0) arraycopy(this.imageTitle0.pixels, 0, this.imageFlamesLeft.pixels, 0, 33920);
        if (this.imageTitle1) arraycopy(this.imageTitle1.pixels, 0, this.imageFlamesRight.pixels, 0, 33920);

        this.flameGradient0 = new Int32Array(256);
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index] = index * 262144;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index + 64] = index * 1024 + Colors.RED;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index + 128] = index * 4 + Colors.YELLOW;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index + 192] = Colors.WHITE;
        }

        this.flameGradient1 = new Int32Array(256);
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index] = index * 1024;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index + 64] = index * 4 + Colors.GREEN;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index + 128] = index * 262144 + Colors.CYAN;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index + 192] = Colors.WHITE;
        }

        this.flameGradient2 = new Int32Array(256);
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index] = index * 4;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index + 64] = index * 262144 + Colors.BLUE;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index + 128] = index * 1024 + Colors.MAGENTA;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index + 192] = Colors.WHITE;
        }

        this.flameGradient = new Int32Array(256);
        this.flameBuffer0 = new Int32Array(32768);
        this.flameBuffer1 = new Int32Array(32768);
        this.updateFlameBuffer(null);
        this.flameBuffer3 = new Int32Array(32768);
        this.flameBuffer2 = new Int32Array(32768);

        this.drawProgress(10, 'Connecting to fileserver').then((): void => {
            if (!this.flameActive) {
                this.flameActive = true;
                this.flamesInterval = setInterval(this.runFlames.bind(this), 35);
            }
        });
    }

    private async drawTitle(): Promise<void> {
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

        await this.loadTitle();
        this.imageTitle4?.bind();
        this.imageTitlebox?.draw(0, 0);

        const w: number = 360;
        const h: number = 200;

        if (this.titleScreenState === 0) {
            const extraY: number = ((h / 2) | 0) + 80;
            let y: number = ((h / 2) | 0) - 20;

            if (this.onDemand) {
                this.fontPlain11?.drawStringTaggableCenter(w / 2, extraY, this.onDemand.message, 0x75a9a9, true);
            }

            this.fontBold12?.drawStringTaggableCenter(w / 2, y, 'Welcome to RuneScape', Colors.YELLOW, true);
            y += 30;

            let x = ((w / 2) | 0) - 80;
            y = ((h / 2) | 0) + 20;
            this.imageTitlebutton?.draw(x - 73, y - 20);
            this.fontBold12?.drawStringTaggableCenter(x, y + 5, 'New user', Colors.WHITE, true);

            x = ((w / 2) | 0) + 80;
            this.imageTitlebutton?.draw(x - 73, y - 20);
            this.fontBold12?.drawStringTaggableCenter(x, y + 5, 'Existing User', Colors.WHITE, true);
        } else if (this.titleScreenState === 2) {
            let x: number = ((w / 2) | 0) - 80;
            let y: number = ((h / 2) | 0) - 40;
            if (this.loginMessage0.length > 0) {
                this.fontBold12?.drawStringTaggableCenter(w / 2, y - 15, this.loginMessage0, Colors.YELLOW, true);
                this.fontBold12?.drawStringTaggableCenter(w / 2, y, this.loginMessage1, Colors.YELLOW, true);
                y += 30;
            } else {
                this.fontBold12?.drawStringTaggableCenter(w / 2, y - 7, this.loginMessage1, Colors.YELLOW, true);
                y += 30;
            }

            this.fontBold12?.drawStringTaggable(w / 2 - 90, y, `Username: ${this.username}${this.titleLoginField === 0 && this.loopCycle % 40 < 20 ? '@yel@|' : ''}`, Colors.WHITE, true);
            y += 15;

            this.fontBold12?.drawStringTaggable(w / 2 - 88, y, `Password: ${JString.toAsterisks(this.password)}${this.titleLoginField === 1 && this.loopCycle % 40 < 20 ? '@yel@|' : ''}`, Colors.WHITE, true);
            y += 15;

            x = ((w / 2) | 0) - 80;
            y = ((h / 2) | 0) + 50;
            this.imageTitlebutton?.draw(x - 73, y - 20);
            this.fontBold12?.drawStringTaggableCenter(x, y + 5, 'Login', Colors.WHITE, true);

            x = ((w / 2) | 0) + 80;
            this.imageTitlebutton?.draw(x - 73, y - 20);
            this.fontBold12?.drawStringTaggableCenter(x, y + 5, 'Cancel', Colors.WHITE, true);
        } else if (this.titleScreenState === 3) {
            let x: number = (w / 2) | 0;
            let y: number = ((h / 2) | 0) - 60;
            this.fontBold12?.drawStringTaggableCenter(x, y, 'Create a free account', Colors.YELLOW, true);

            y = ((h / 2) | 0) - 35;
            this.fontBold12?.drawStringTaggableCenter(x, y, 'To create a new account you need to', Colors.WHITE, true);
            y += 15;

            this.fontBold12?.drawStringTaggableCenter(x, y, 'go back to the main RuneScape webpage', Colors.WHITE, true);
            y += 15;

            this.fontBold12?.drawStringTaggableCenter(x, y, "and choose the red 'create account'", Colors.WHITE, true);
            y += 15;

            this.fontBold12?.drawStringTaggableCenter(x, y, 'button at the top right of that page.', Colors.WHITE, true);
            y += 15;

            x = (w / 2) | 0;
            y = ((h / 2) | 0) + 50;
            this.imageTitlebutton?.draw(x - 73, y - 20);
            this.fontBold12?.drawStringTaggableCenter(x, y + 5, 'Cancel', Colors.WHITE, true);
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

    private drawGame(): void {
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

            this.redrawSidebar = true;
            this.redrawChatback = true;
            this.redrawSideicons = true;
            this.redrawPrivacySettings = true;

            if (this.sceneState !== 2) {
                this.areaViewport?.draw(4, 4);
                this.areaMapback?.draw(550, 4);
            }
        }

        if (this.sceneState === 2) {
            this.drawScene();
        }

        if (this.menuVisible && this.menuArea === 1) {
            this.redrawSidebar = true;
        }

        if (this.sidebarInterfaceId !== -1) {
            let redraw = this.updateInterfaceAnimation(this.sidebarInterfaceId, this.sceneDelta);
            if (redraw) {
                this.redrawSidebar = true;
            }
        }

        if (this.selectedArea === 2) {
            this.redrawSidebar = true;
        }

        if (this.objDragArea === 2) {
            this.redrawSidebar = true;
        }

        if (this.redrawSidebar) {
            this.drawSidebar();
            this.redrawSidebar = false;
        }

        if (this.chatInterfaceId === -1) {
            this.chatInterface.scrollPosition = this.chatScrollHeight - this.chatScrollOffset - 77;

            if (this.mouseX > 448 && this.mouseX < 560 && this.mouseY > 332) {
                this.handleScrollInput(this.mouseX - 17, this.mouseY - 357, this.chatScrollHeight, 77, false, 463, 0, this.chatInterface);
            }

            let offset: number = this.chatScrollHeight - this.chatInterface.scrollPosition - 77;
            if (offset < 0) {
                offset = 0;
            }

            if (offset > this.chatScrollHeight - 77) {
                offset = this.chatScrollHeight - 77;
            }

            if (this.chatScrollOffset !== offset) {
                this.chatScrollOffset = offset;
                this.redrawChatback = true;
            }
        }

        if (this.chatInterfaceId !== -1) {
            let redraw = this.updateInterfaceAnimation(this.chatInterfaceId, this.sceneDelta);
            if (redraw) {
                this.redrawChatback = true;
            }
        }

        if (this.selectedArea === 3) {
            this.redrawChatback = true;
        }

        if (this.objDragArea === 3) {
            this.redrawChatback = true;
        }

        if (this.modalMessage) {
            this.redrawChatback = true;
        }

        if (this.menuVisible && this.menuArea === 2) {
            this.redrawChatback = true;
        }

        if (this.redrawChatback) {
            this.drawChat();
            this.redrawChatback = false;
        }

        if (this.sceneState === 2) {
            this.drawMinimap();
            this.areaMapback?.draw(550, 4);
        }

        if (this.flashingTab !== -1) {
            this.redrawSideicons = true;
        }

        if (this.redrawSideicons) {
            if (this.flashingTab !== -1 && this.flashingTab === this.selectedTab) {
                this.flashingTab = -1;
                this.out.p1isaac(ClientProt.TUTORIAL_CLICKSIDE);
                this.out.p1(this.selectedTab);
            }

            this.redrawSideicons = false;
            this.areaBackhmid1?.bind();
            this.imageBackhmid1?.draw(0, 0);

            if (this.sidebarInterfaceId === -1) {
                if (this.tabInterfaceId[this.selectedTab] !== -1) {
                    if (this.selectedTab === 0) {
                        this.imageRedstone1?.draw(22, 10);
                    } else if (this.selectedTab === 1) {
                        this.imageRedstone2?.draw(54, 8);
                    } else if (this.selectedTab === 2) {
                        this.imageRedstone2?.draw(82, 8);
                    } else if (this.selectedTab === 3) {
                        this.imageRedstone3?.draw(110, 8);
                    } else if (this.selectedTab === 4) {
                        this.imageRedstone2h?.draw(153, 8);
                    } else if (this.selectedTab === 5) {
                        this.imageRedstone2h?.draw(181, 8);
                    } else if (this.selectedTab === 6) {
                        this.imageRedstone1h?.draw(209, 9);
                    }
                }

                if (this.tabInterfaceId[0] !== -1 && (this.flashingTab !== 0 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[0]?.draw(29, 13);
                }

                if (this.tabInterfaceId[1] !== -1 && (this.flashingTab !== 1 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[1]?.draw(53, 11);
                }

                if (this.tabInterfaceId[2] !== -1 && (this.flashingTab !== 2 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[2]?.draw(82, 11);
                }

                if (this.tabInterfaceId[3] !== -1 && (this.flashingTab !== 3 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[3]?.draw(115, 12);
                }

                if (this.tabInterfaceId[4] !== -1 && (this.flashingTab !== 4 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[4]?.draw(153, 13);
                }

                if (this.tabInterfaceId[5] !== -1 && (this.flashingTab !== 5 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[5]?.draw(180, 11);
                }

                if (this.tabInterfaceId[6] !== -1 && (this.flashingTab !== 6 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[6]?.draw(208, 13);
                }
            }

            this.areaBackhmid1?.draw(516, 160);

            this.areaBackbase2?.bind();
            this.imageBackbase2?.draw(0, 0);

            if (this.sidebarInterfaceId === -1) {
                if (this.tabInterfaceId[this.selectedTab] !== -1) {
                    if (this.selectedTab === 7) {
                        this.imageRedstone1v?.draw(42, 0);
                    } else if (this.selectedTab === 8) {
                        this.imageRedstone2v?.draw(74, 0);
                    } else if (this.selectedTab === 9) {
                        this.imageRedstone2v?.draw(102, 0);
                    } else if (this.selectedTab === 10) {
                        this.imageRedstone3v?.draw(130, 1);
                    } else if (this.selectedTab === 11) {
                        this.imageRedstone2hv?.draw(173, 0);
                    } else if (this.selectedTab === 12) {
                        this.imageRedstone2hv?.draw(201, 0);
                    } else if (this.selectedTab === 13) {
                        this.imageRedstone1hv?.draw(229, 0);
                    }
                }

                if (this.tabInterfaceId[8] !== -1 && (this.flashingTab !== 8 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[7]?.draw(74, 2);
                }

                if (this.tabInterfaceId[9] !== -1 && (this.flashingTab !== 9 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[8]?.draw(102, 3);
                }

                if (this.tabInterfaceId[10] !== -1 && (this.flashingTab !== 10 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[9]?.draw(137, 4);
                }

                if (this.tabInterfaceId[11] !== -1 && (this.flashingTab !== 11 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[10]?.draw(174, 2);
                }

                if (this.tabInterfaceId[12] !== -1 && (this.flashingTab !== 12 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[11]?.draw(201, 2);
                }

                if (this.tabInterfaceId[13] !== -1 && (this.flashingTab !== 13 || this.loopCycle % 20 < 10)) {
                    this.imageSideicons[12]?.draw(226, 2);
                }
            }

            this.areaBackbase2?.draw(496, 466);

            this.areaViewport?.bind();
        }

        if (this.redrawPrivacySettings) {
            this.redrawPrivacySettings = false;

            this.areaBackbase1?.bind();
            this.imageBackbase1?.draw(0, 0);

            this.fontPlain12?.drawStringTaggableCenter(55, 28, 'Public chat', Colors.WHITE, true);
            if (this.chatPublicMode === 0) {
                this.fontPlain12?.drawStringTaggableCenter(55, 41, 'On', Colors.GREEN, true);
            }
            if (this.chatPublicMode === 1) {
                this.fontPlain12?.drawStringTaggableCenter(55, 41, 'Friends', Colors.YELLOW, true);
            }
            if (this.chatPublicMode === 2) {
                this.fontPlain12?.drawStringTaggableCenter(55, 41, 'Off', Colors.RED, true);
            }
            if (this.chatPublicMode === 3) {
                this.fontPlain12?.drawStringTaggableCenter(55, 41, 'Hide', Colors.CYAN, true);
            }

            this.fontPlain12?.drawStringTaggableCenter(184, 28, 'Private chat', Colors.WHITE, true);
            if (this.chatPrivateMode === 0) {
                this.fontPlain12?.drawStringTaggableCenter(184, 41, 'On', Colors.GREEN, true);
            }
            if (this.chatPrivateMode === 1) {
                this.fontPlain12?.drawStringTaggableCenter(184, 41, 'Friends', Colors.YELLOW, true);
            }
            if (this.chatPrivateMode === 2) {
                this.fontPlain12?.drawStringTaggableCenter(184, 41, 'Off', Colors.RED, true);
            }

            this.fontPlain12?.drawStringTaggableCenter(324, 28, 'Trade/duel', Colors.WHITE, true);
            if (this.chatTradeMode === 0) {
                this.fontPlain12?.drawStringTaggableCenter(324, 41, 'On', Colors.GREEN, true);
            }
            if (this.chatTradeMode === 1) {
                this.fontPlain12?.drawStringTaggableCenter(324, 41, 'Friends', Colors.YELLOW, true);
            }
            if (this.chatTradeMode === 2) {
                this.fontPlain12?.drawStringTaggableCenter(324, 41, 'Off', Colors.RED, true);
            }

            this.fontPlain12?.drawStringTaggableCenter(458, 33, 'Report abuse', Colors.WHITE, true);

            this.areaBackbase1?.draw(0, 453);

            this.areaViewport?.bind();
        }

        // Update Bot SDK overlay
        if (this.botOverlay) {
            this.botOverlay.update();
            this.botOverlay.tick();
        }

        this.sceneDelta = 0;
    }

    private drawScene(): void {
        this.sceneCycle++;

        this.pushNpcs(true);
        this.pushPlayers();
        this.pushNpcs(false);
        this.pushProjectiles();
        this.pushSpotanims();

        if (!this.cutscene) {
            let pitch: number = this.orbitCameraPitch;
            if (((this.cameraPitchClamp / 256) | 0) > pitch) {
                pitch = (this.cameraPitchClamp / 256) | 0;
            }
            if (this.cameraModifierEnabled[4] && this.cameraModifierWobbleScale[4] + 128 > pitch) {
                pitch = this.cameraModifierWobbleScale[4] + 128;
            }

            const yaw: number = (this.orbitCameraYaw + this.macroCameraAngle) & 0x7ff;

            if (this.localPlayer) {
                this.orbitCamera(this.orbitCameraX, this.getHeightmapY(this.currentLevel, this.localPlayer.x, this.localPlayer.z) - 50, this.orbitCameraZ, yaw, pitch, pitch * 3 + 600);
            }

            Client.cyclelogic2++;
            if (Client.cyclelogic2 > 1802) {
                Client.cyclelogic2 = 0;
                this.out.p1isaac(ClientProt.ANTICHEAT_CYCLELOGIC2);
                this.out.p1(0);
                const start: number = this.out.pos;
                this.out.p2(29711);
                this.out.p1(70);
                this.out.p1((Math.random() * 256.0) | 0);
                this.out.p1(242);
                this.out.p1(186);
                this.out.p1(39);
                this.out.p1(61);
                if (((Math.random() * 2.0) | 0) === 0) {
                    this.out.p1(13);
                }
                if (((Math.random() * 2.0) | 0) === 0) {
                    this.out.p2(57856);
                }
                this.out.p2((Math.random() * 65536.0) | 0);
                this.out.psize1(this.out.pos - start);
            }
        }

        let level: number;
        if (this.cutscene) {
            level = this.getTopLevelCutscene();
        } else {
            level = this.getTopLevel();
        }

        const cameraX: number = this.cameraX;
        const cameraY: number = this.cameraY;
        const cameraZ: number = this.cameraZ;
        const cameraPitch: number = this.cameraPitch;
        const cameraYaw: number = this.cameraYaw;

        for (let type: number = 0; type < 5; type++) {
            if (this.cameraModifierEnabled[type]) {
                const jitter = (Math.random() * (this.cameraModifierJitter[type] * 2 + 1) - this.cameraModifierJitter[type] + Math.sin(this.cameraModifierCycle[type] * (this.cameraModifierWobbleSpeed[type] / 100.0)) * this.cameraModifierWobbleScale[type]) | 0;

                if (type === 0) {
                    this.cameraX += jitter;
                } else if (type === 1) {
                    this.cameraY += jitter;
                } else if (type === 2) {
                    this.cameraZ += jitter;
                } else if (type === 3) {
                    this.cameraYaw = (this.cameraYaw + jitter) & 0x7ff;
                } else if (type === 4) {
                    this.cameraPitch += jitter;

                    if (this.cameraPitch < 128) {
                        this.cameraPitch = 128;
                    }

                    if (this.cameraPitch > 383) {
                        this.cameraPitch = 383;
                    }
                }
            }
        }

        const cycle = Pix3D.cycle;
        Model.checkHover = true;
        Model.pickedCount = 0;
        Model.mouseX = this.mouseX - 4;
        Model.mouseY = this.mouseY - 4;

        Pix2D.clear();
        this.scene?.draw(this.cameraX, this.cameraY, this.cameraZ, level, this.cameraYaw, this.cameraPitch, this.loopCycle);
        this.scene?.clearLocChanges();
        this.draw2DEntityElements();
        this.drawTileHint();
        this.updateTextures(cycle);
        this.draw3DEntityElements();
        this.areaViewport?.draw(4, 4);

        this.cameraX = cameraX;
        this.cameraY = cameraY;
        this.cameraZ = cameraZ;
        this.cameraPitch = cameraPitch;
        this.cameraYaw = cameraYaw;
    }

    private pushPlayers(): void {
        if (!this.localPlayer) {
            return;
        }

        if (this.localPlayer.x >> 7 === this.flagSceneTileX && this.localPlayer.z >> 7 === this.flagSceneTileZ) {
            this.flagSceneTileX = 0;
        }

        for (let i: number = -1; i < this.playerCount; i++) {
            let player: ClientPlayer | null;
            let id: number;
            if (i === -1) {
                player = this.localPlayer;
                id = Constants.LOCAL_PLAYER_INDEX << 14;
            } else {
                player = this.players[this.playerIds[i]];
                id = this.playerIds[i] << 14;
            }

            if (!player || !player.isVisible()) {
                continue;
            }

            player.lowMemory = false;
            if ((Client.lowMemory && this.playerCount > 50 || this.playerCount > 200) && i != -1 && player.secondarySeqId == player.readyanim) {
                player.lowMemory = true;
            }

            const stx: number = player.x >> 7;
            const stz: number = player.z >> 7;

            if (stx < 0 || stx >= CollisionConstants.SIZE || stz < 0 || stz >= CollisionConstants.SIZE) {
                continue;
            }

            if (!player.locModel || this.loopCycle < player.locStartCycle || this.loopCycle >= player.locStopCycle) {
                if ((player.x & 0x7f) === 64 && (player.z & 0x7f) === 64) {
                    if (this.tileLastOccupiedCycle[stx][stz] == this.sceneCycle && i != -1) {
                        continue;
                    }

                    this.tileLastOccupiedCycle[stx][stz] = this.sceneCycle;
                }

                player.y = this.getHeightmapY(this.currentLevel, player.x, player.z);
                this.scene?.changeLoc(this.currentLevel, player.x, player.y, player.z, player, id, player.yaw, 60, player.needsForwardDrawPadding);
            } else {
                player.lowMemory = false;
                player.y = this.getHeightmapY(this.currentLevel, player.x, player.z);
                this.scene?.changeLoc2(this.currentLevel, player.x, player.y, player.z, player.minTileX, player.minTileZ, player.maxTileX, player.maxTileZ, player, id, player.yaw);
            }
        }
    }

    private pushNpcs(alwaysontop: boolean): void {
        for (let i: number = 0; i < this.npcCount; i++) {
            const npc: ClientNpc | null = this.npcs[this.npcIds[i]];
            const typecode: number = ((this.npcIds[i] << 14) + 0x20000000) | 0;

            if (!npc || !npc.isVisible() || npc.type?.alwaysontop !== alwaysontop) {
                continue;
            }

            const x: number = npc.x >> 7;
            const z: number = npc.z >> 7;

            if (x < 0 || x >= CollisionConstants.SIZE || z < 0 || z >= CollisionConstants.SIZE) {
                continue;
            }

            if (npc.size === 1 && (npc.x & 0x7f) === 64 && (npc.z & 0x7f) === 64) {
                if (this.tileLastOccupiedCycle[x][z] === this.sceneCycle) {
                    continue;
                }

                this.tileLastOccupiedCycle[x][z] = this.sceneCycle;
            }

            this.scene?.changeLoc(this.currentLevel, npc.x, this.getHeightmapY(this.currentLevel, npc.x, npc.z), npc.z, npc, typecode, npc.yaw, (npc.size - 1) * 64 + 60, npc.needsForwardDrawPadding);
        }
    }

    private pushProjectiles(): void {
        for (let proj: ClientProj | null = this.projectiles.head() as ClientProj | null; proj; proj = this.projectiles.next() as ClientProj | null) {
            if (proj.projLevel !== this.currentLevel || this.loopCycle > proj.lastCycle) {
                proj.unlink();
            } else if (this.loopCycle >= proj.startCycle) {
                if (proj.projTarget > 0) {
                    const npc: ClientNpc | null = this.npcs[proj.projTarget - 1];
                    if (npc) {
                        proj.updateVelocity(npc.x, this.getHeightmapY(proj.projLevel, npc.x, npc.z) - proj.projOffsetY, npc.z, this.loopCycle);
                    }
                }

                if (proj.projTarget < 0) {
                    const index: number = -proj.projTarget - 1;
                    let player: ClientPlayer | null;
                    if (index === this.localPid) {
                        player = this.localPlayer;
                    } else {
                        player = this.players[index];
                    }

                    if (player) {
                        proj.updateVelocity(player.x, this.getHeightmapY(proj.projLevel, player.x, player.z) - proj.projOffsetY, player.z, this.loopCycle);
                    }
                }

                proj.update(this.sceneDelta);
                this.scene?.changeLoc(this.currentLevel, proj.x | 0, proj.y | 0, proj.z | 0, proj, -1, proj.yaw, 60, false);
            }
        }
    }

    private pushSpotanims(): void {
        for (let spot: MapSpotAnim | null = this.spotanims.head() as MapSpotAnim | null; spot; spot = this.spotanims.next() as MapSpotAnim | null) {
            if (spot.spotLevel !== this.currentLevel || spot.seqComplete) {
                spot.unlink();
            } else if (this.loopCycle >= spot.startCycle) {
                spot.update(this.sceneDelta);

                if (spot.seqComplete) {
                    spot.unlink();
                } else {
                    this.scene?.changeLoc(spot.spotLevel, spot.x, spot.y, spot.z, spot, -1, 0, 60, false);
                }
            }
        }
    }

    private orbitCamera(targetX: number, targetY: number, targetZ: number, yaw: number, pitch: number, distance: number): void {
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

        this.cameraX = targetX - x;
        this.cameraY = targetY - y;
        this.cameraZ = targetZ - z;
        this.cameraPitch = pitch;
        this.cameraYaw = yaw;
    }

    private getTopLevelCutscene(): number {
        if (!this.levelTileFlags) {
            return 0; // custom
        }

        const y: number = this.getHeightmapY(this.currentLevel, this.cameraX, this.cameraZ);
        return y - this.cameraY >= 800 || (this.levelTileFlags[this.currentLevel][this.cameraX >> 7][this.cameraZ >> 7] & 0x4) === 0 ? 3 : this.currentLevel;
    }

    private getTopLevel(): number {
        let top: number = 3;

        if (this.cameraPitch < 310 && this.localPlayer) {
            let cameraLocalTileX: number = this.cameraX >> 7;
            let cameraLocalTileZ: number = this.cameraZ >> 7;
            const playerLocalTileX: number = this.localPlayer.x >> 7;
            const playerLocalTileZ: number = this.localPlayer.z >> 7;

            if (this.levelTileFlags && (this.levelTileFlags[this.currentLevel][cameraLocalTileX][cameraLocalTileZ] & 0x4) !== 0) {
                top = this.currentLevel;
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
                let delta = ((tileDeltaZ * 65536) / tileDeltaX) | 0;
                let accumulator = 32768;

                while (cameraLocalTileX !== playerLocalTileX) {
                    if (cameraLocalTileX < playerLocalTileX) {
                        cameraLocalTileX++;
                    } else if (cameraLocalTileX > playerLocalTileX) {
                        cameraLocalTileX--;
                    }

                    if (this.levelTileFlags && (this.levelTileFlags[this.currentLevel][cameraLocalTileX][cameraLocalTileZ] & 0x4) !== 0) {
                        top = this.currentLevel;
                    }

                    accumulator += delta;
                    if (accumulator >= 65536) {
                        accumulator -= 65536;

                        if (cameraLocalTileZ < playerLocalTileZ) {
                            cameraLocalTileZ++;
                        } else if (cameraLocalTileZ > playerLocalTileZ) {
                            cameraLocalTileZ--;
                        }

                        if (this.levelTileFlags && (this.levelTileFlags[this.currentLevel][cameraLocalTileX][cameraLocalTileZ] & 0x4) !== 0) {
                            top = this.currentLevel;
                        }
                    }
                }
            } else {
                let delta = ((tileDeltaX * 65536) / tileDeltaZ) | 0;
                let accumulator = 32768;

                while (cameraLocalTileZ !== playerLocalTileZ) {
                    if (cameraLocalTileZ < playerLocalTileZ) {
                        cameraLocalTileZ++;
                    } else if (cameraLocalTileZ > playerLocalTileZ) {
                        cameraLocalTileZ--;
                    }

                    if (this.levelTileFlags && (this.levelTileFlags[this.currentLevel][cameraLocalTileX][cameraLocalTileZ] & 0x4) !== 0) {
                        top = this.currentLevel;
                    }

                    accumulator += delta;
                    if (accumulator >= 65536) {
                        accumulator -= 65536;

                        if (cameraLocalTileX < playerLocalTileX) {
                            cameraLocalTileX++;
                        } else if (cameraLocalTileX > playerLocalTileX) {
                            cameraLocalTileX--;
                        }

                        if (this.levelTileFlags && (this.levelTileFlags[this.currentLevel][cameraLocalTileX][cameraLocalTileZ] & 0x4) !== 0) {
                            top = this.currentLevel;
                        }
                    }
                }
            }
        }

        if (this.localPlayer && this.levelTileFlags && (this.levelTileFlags[this.currentLevel][this.localPlayer.x >> 7][this.localPlayer.z >> 7] & 0x4) !== 0) {
            top = this.currentLevel;
        }

        return top;
    }

    private draw2DEntityElements(): void {
        this.chatCount = 0;

        for (let index: number = -1; index < this.playerCount + this.npcCount; index++) {
            let entity: ClientEntity | null = null;
            if (index === -1) {
                entity = this.localPlayer;
            } else if (index < this.playerCount) {
                entity = this.players[this.playerIds[index]];
            } else {
                entity = this.npcs[this.npcIds[index - this.playerCount]];
            }

            if (!entity || !entity.isVisible()) {
                continue;
            }

            if (index >= this.playerCount) {
                const npc = (entity as ClientNpc).type;

                if (npc && npc.headicon >= 0 && npc.headicon < this.imageHeadicon.length) {
                    this.projectFromEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        this.imageHeadicon[npc.headicon]?.draw(this.projectX - 12, this.projectY - 30);
                    }
                }

                if (this.hintType === 1 && this.hintNpc === this.npcIds[index - this.playerCount] && this.loopCycle % 20 < 10) {
                    this.projectFromEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        this.imageHeadicon[2]?.draw(this.projectX - 12, this.projectY - 28);
                    }
                }
            } else {
                let y: number = 30;

                const player: ClientPlayer = entity as ClientPlayer;
                if (player.headicons !== 0) {
                    this.projectFromEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        for (let icon: number = 0; icon < 8; icon++) {
                            if ((player.headicons & (0x1 << icon)) !== 0) {
                                this.imageHeadicon[icon]?.draw(this.projectX - 12, this.projectY - y);
                                y -= 25;
                            }
                        }
                    }
                }

                if (index >= 0 && this.hintType === 10 && this.hintPlayer === this.playerIds[index]) {
                    this.projectFromEntity(entity, entity.height + 15);

                    if (this.projectX > -1) {
                        this.imageHeadicon[7]?.draw(this.projectX - 12, this.projectY - y);
                    }
                }
            }

            if (entity.chatMessage && (index >= this.playerCount || this.chatPublicMode === 0 || this.chatPublicMode === 3 || (this.chatPublicMode === 1 && this.isFriend((entity as ClientPlayer).name)))) {
                this.projectFromEntity(entity, entity.height);

                if (this.projectX > -1 && this.chatCount < Constants.MAX_CHATS && this.fontBold12) {
                    this.chatWidth[this.chatCount] = (this.fontBold12.stringWidth(entity.chatMessage) / 2) | 0;
                    this.chatHeight[this.chatCount] = this.fontBold12.height2d;
                    this.chatX[this.chatCount] = this.projectX;
                    this.chatY[this.chatCount] = this.projectY;

                    this.chatColors[this.chatCount] = entity.chatColour;
                    this.chatEffect[this.chatCount] = entity.chatEffect;
                    this.chatTimers[this.chatCount] = entity.chatTimer;
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

            if (entity.combatCycle > this.loopCycle + 100) {
                this.projectFromEntity(entity, entity.height + 15);

                if (this.projectX > -1) {
                    let w: number = ((entity.health * 30) / entity.totalHealth) | 0;
                    if (w > 30) {
                        w = 30;
                    }
                    Pix2D.fillRect2d(this.projectX - 15, this.projectY - 3, w, 5, Colors.GREEN);
                    Pix2D.fillRect2d(this.projectX - 15 + w, this.projectY - 3, 30 - w, 5, Colors.RED);
                }
            }

            for (let i = 0; i < 4; ++i) {
                if (entity.damageCycles[i] > this.loopCycle) {
                    this.projectFromEntity(entity, (entity.height / 2) | 0);

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

                    this.imageHitmarks[entity.damageTypes[i]]?.draw(this.projectX - 12, this.projectY - 12);
                    this.fontPlain11?.drawStringCenter(this.projectX, this.projectY + 4, entity.damageValues[i].toString(), Colors.BLACK);
                    this.fontPlain11?.drawStringCenter(this.projectX - 1, this.projectY + 3, entity.damageValues[i].toString(), Colors.WHITE);
                }
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
            if (this.chatEffects === 0) {
                let color: number = Colors.YELLOW;

                if (this.chatColors[i] < 6) {
                    color = Client.CHAT_COLORS[this.chatColors[i]];
                } else if (this.chatColors[i] === 6) {
                    color = this.sceneCycle % 20 < 10 ? Colors.RED : Colors.YELLOW;
                } else if (this.chatColors[i] === 7) {
                    color = this.sceneCycle % 20 < 10 ? Colors.BLUE : Colors.CYAN;
                } else if (this.chatColors[i] === 8) {
                    color = this.sceneCycle % 20 < 10 ? 0xb000 : 0x80ff80;
                } else if (this.chatColors[i] === 9) {
                    const delta: number = 150 - this.chatTimers[i];
                    if (delta < 50) {
                        color = delta * 1280 + Colors.RED;
                    } else if (delta < 100) {
                        color = Colors.YELLOW - (delta - 50) * 327680;
                    } else if (delta < 150) {
                        color = (delta - 100) * 5 + Colors.GREEN;
                    }
                } else if (this.chatColors[i] === 10) {
                    const delta: number = 150 - this.chatTimers[i];
                    if (delta < 50) {
                        color = delta * 5 + Colors.RED;
                    } else if (delta < 100) {
                        color = Colors.MAGENTA - (delta - 50) * 327680;
                    } else if (delta < 150) {
                        color = (delta - 100) * 327680 + Colors.BLUE - (delta - 100) * 5;
                    }
                }
                if (this.chatColors[i] === 11) {
                    const delta: number = 150 - this.chatTimers[i];
                    if (delta < 50) {
                        color = Colors.WHITE - delta * 327685;
                    } else if (delta < 100) {
                        color = (delta - 50) * 327685 + Colors.GREEN;
                    } else if (delta < 150) {
                        color = Colors.WHITE - (delta - 100) * 327680;
                    }
                }

                if (this.chatEffect[i] === 0) {
                    this.fontBold12?.drawStringCenter(this.projectX, this.projectY + 1, message, Colors.BLACK);
                    this.fontBold12?.drawStringCenter(this.projectX, this.projectY, message, color);
                } else if (this.chatEffect[i] === 1) {
                    this.fontBold12?.drawCenteredWave(this.projectX, this.projectY + 1, message, Colors.BLACK, this.sceneCycle);
                    this.fontBold12?.drawCenteredWave(this.projectX, this.projectY, message, color, this.sceneCycle);
                } else if (this.chatEffect[i] === 2) {
                    const w: number = this.fontBold12?.stringWidth(message) ?? 0;
                    const offsetX: number = ((150 - this.chatTimers[i]) * (w + 100)) / 150;
                    Pix2D.setBounds(this.projectX - 50, 0, this.projectX + 50, 334);
                    this.fontBold12?.drawString(this.projectX + 50 - offsetX, this.projectY + 1, message, Colors.BLACK);
                    this.fontBold12?.drawString(this.projectX + 50 - offsetX, this.projectY, message, color);
                    Pix2D.resetBounds();
                }
            } else {
                this.fontBold12?.drawStringCenter(this.projectX, this.projectY + 1, message, Colors.BLACK);
                this.fontBold12?.drawStringCenter(this.projectX, this.projectY, message, Colors.YELLOW);
            }
        }
    }

    private drawTileHint(): void {
        if (this.hintType !== 2 || !this.imageHeadicon[2]) {
            return;
        }

        this.projectFromGround(((this.hintTileX - this.sceneBaseTileX) << 7) + this.hintOffsetX, this.hintHeight * 2, ((this.hintTileZ - this.sceneBaseTileZ) << 7) + this.hintOffsetZ);

        if (this.projectX > -1 && this.loopCycle % 20 < 10) {
            this.imageHeadicon[2].draw(this.projectX - 12, this.projectY - 28);
        }
    }

    private projectFromEntity(entity: ClientEntity, height: number): void {
        this.projectFromGround(entity.x, height, entity.z);
    }

    private projectFromGround(x: number, height: number, z: number): void {
        if (x < 128 || z < 128 || x > 13056 || z > 13056) {
            this.projectX = -1;
            this.projectY = -1;
            return;
        }

        const y: number = this.getHeightmapY(this.currentLevel, x, z) - height;
        this.project(x, y, z);
    }

    // custom - broken out into reusable logic
    private project(x: number, y: number, z: number): void {
        let dx: number = x - this.cameraX;
        let dy: number = y - this.cameraY;
        let dz: number = z - this.cameraZ;

        const sinPitch: number = Pix3D.sinTable[this.cameraPitch];
        const cosPitch: number = Pix3D.cosTable[this.cameraPitch];
        const sinYaw: number = Pix3D.sinTable[this.cameraYaw];
        const cosYaw: number = Pix3D.cosTable[this.cameraYaw];

        let tmp: number = (dz * sinYaw + dx * cosYaw) >> 16;
        dz = (dz * cosYaw - dx * sinYaw) >> 16;
        dx = tmp;

        tmp = (dy * cosPitch - dz * sinPitch) >> 16;
        dz = (dy * sinPitch + dz * cosPitch) >> 16;
        dy = tmp;

        if (dz >= 50) {
            this.projectX = Pix3D.centerX + (((dx << 9) / dz) | 0);
            this.projectY = Pix3D.centerY + (((dy << 9) / dz) | 0);
        } else {
            this.projectX = -1;
            this.projectY = -1;
        }
    }

    private getHeightmapY(level: number, sceneX: number, sceneZ: number): number {
        if (!this.levelHeightmap) {
            return 0; // custom
        }

        const tileX: number = sceneX >> 7;
        const tileZ: number = sceneZ >> 7;

        if (tileX < 0 || tileZ < 0 || tileX > 103 || tileZ > 103) {
            return 0;
        }

        let realLevel: number = level;
        if (level < 3 && this.levelTileFlags && (this.levelTileFlags[1][tileX][tileZ] & 0x2) === 2) {
            realLevel = level + 1;
        }

        const tileLocalX: number = sceneX & 0x7f;
        const tileLocalZ: number = sceneZ & 0x7f;
        const y00: number = (this.levelHeightmap[realLevel][tileX][tileZ] * (128 - tileLocalX) + this.levelHeightmap[realLevel][tileX + 1][tileZ] * tileLocalX) >> 7;
        const y11: number = (this.levelHeightmap[realLevel][tileX][tileZ + 1] * (128 - tileLocalX) + this.levelHeightmap[realLevel][tileX + 1][tileZ + 1] * tileLocalX) >> 7;
        return (y00 * (128 - tileLocalZ) + y11 * tileLocalZ) >> 7;
    }

    private updateTextures(cycle: number): void {
        if (!Client.lowMemory) {
            if (Pix3D.textureCycle[17] >= cycle) {
                const texture: Pix8 | null = Pix3D.textures[17];
                if (!texture) {
                    return;
                }

                const bottom: number = texture.width2d * texture.height2d - 1;
                const adjustment: number = texture.width2d * this.sceneDelta * 2;

                const src: Int8Array = texture.pixels;
                const dst: Int8Array = this.textureBuffer;
                for (let i: number = 0; i <= bottom; i++) {
                    dst[i] = src[(i - adjustment) & bottom];
                }

                texture.pixels = dst;
                this.textureBuffer = src;
                Pix3D.pushTexture(17);
            }

            if (Pix3D.textureCycle[24] >= cycle) {
                const texture: Pix8 | null = Pix3D.textures[24];
                if (!texture) {
                    return;
                }
                const bottom: number = texture.width2d * texture.height2d - 1;
                const adjustment: number = texture.width2d * this.sceneDelta * 2;

                const src: Int8Array = texture.pixels;
                const dst: Int8Array = this.textureBuffer;
                for (let i: number = 0; i <= bottom; i++) {
                    dst[i] = src[(i - adjustment) & bottom];
                }

                texture.pixels = dst;
                this.textureBuffer = src;
                Pix3D.pushTexture(24);
            }
        }
    }

    private draw3DEntityElements(): void {
        this.drawPrivateMessages();

        if (this.crossMode === 1) {
            this.imageCrosses[(this.crossCycle / 100) | 0]?.draw(this.crossX - 8 - 4, this.crossY - 8 - 4);
        } else if (this.crossMode === 2) {
            this.imageCrosses[((this.crossCycle / 100) | 0) + 4]?.draw(this.crossX - 8 - 4, this.crossY - 8 - 4);
        }

        if (this.viewportOverlayInterfaceId !== -1) {
            this.updateInterfaceAnimation(this.viewportOverlayInterfaceId, this.sceneDelta);
            this.drawInterface(Component.types[this.viewportOverlayInterfaceId], 0, 0, 0);
        }

        if (this.field1264 > 0) {
            let offset = 302 - (Math.abs(Math.sin(this.field1264 / 10.0) * 10.0) | 0);

            for (let i = 0; i < 30; i++) {
                let w = (30 - i) * 16;
                Pix2D.drawHorizontalLineAlpha(256 - w / 2, offset + i, 16776960, w, this.field1264);
            }
        }

        if (this.viewportInterfaceId !== -1) {
            this.updateInterfaceAnimation(this.viewportInterfaceId, this.sceneDelta);
            this.drawInterface(Component.types[this.viewportInterfaceId], 0, 0, 0);
        }

        this.updateWorldLocation();

        if (!this.menuVisible) {
            this.handleInput();
            this.drawTooltip();
        } else if (this.menuArea === 0) {
            this.drawMenu();
        }

        if (this.inMultizone === 1) {
            if (this.wildernessLevel > 0 || this.worldLocationState === 1) {
                this.imageHeadicon[1]?.draw(472, 258);
            } else {
                this.imageHeadicon[1]?.draw(472, 296);
            }
        }

        if (this.wildernessLevel > 0) {
            this.imageHeadicon[0]?.draw(472, 296);
            this.fontPlain12?.drawStringCenter(484, 329, 'Level: ' + this.wildernessLevel, Colors.YELLOW);
        }

        if (this.worldLocationState === 1) {
            this.imageHeadicon[6]?.draw(472, 296);
            this.fontPlain12?.drawStringCenter(484, 329, 'Arena', Colors.YELLOW);
        }

        if (this.displayFps) {
            let x: number = 507;
            let y: number = 20;

            let color: number = Colors.YELLOW;
            if (this.fps < 15) {
                color = Colors.RED;
            }

            this.fontPlain12?.drawStringRight(x, y, 'Fps:' + this.fps, color);
            y += 15;

            let memoryUsage = -1;
            if (typeof window.performance['memory' as keyof Performance] !== 'undefined') {
                const memory = window.performance['memory' as keyof Performance] as any;
                memoryUsage = (memory.usedJSHeapSize / 1024) | 0;
            }

            if (memoryUsage !== -1) {
                this.fontPlain12?.drawStringRight(x, y, 'Mem:' + memoryUsage + 'k', Colors.YELLOW);
            }
        }

        if (this.systemUpdateTimer !== 0) {
            let seconds: number = (this.systemUpdateTimer / 50) | 0;
            const minutes: number = (seconds / 60) | 0;
            seconds %= 60;

            if (seconds < 10) {
                this.fontPlain12?.drawString(4, 329, 'System update in: ' + minutes + ':0' + seconds, Colors.YELLOW);
            } else {
                this.fontPlain12?.drawString(4, 329, 'System update in: ' + minutes + ':' + seconds, Colors.YELLOW);
            }
        }
    }

    private drawPrivateMessages(): void {
        if (this.splitPrivateChat === 0) {
            return;
        }

        const font: PixFont | null = this.fontPlain12;
        let lineOffset: number = 0;
        if (this.systemUpdateTimer !== 0) {
            lineOffset = 1;
        }

        for (let i: number = 0; i < 100; i++) {
            if (!this.messageText[i]) {
                continue;
            }

            const type: number = this.messageType[i];
            let sender = this.messageSender[i];

            let modlevel = 0;
            if (sender && sender.startsWith('@cr1@')) {
                sender = sender.substring(5);
                modlevel = 1;
            } else if (sender && sender.startsWith('@cr2@')) {
                sender = sender.substring(5);
                modlevel = 2;
            }

            if ((type == 3 || type == 7) && (type == 7 || this.chatPrivateMode == 0 || this.chatPrivateMode == 1 && this.isFriend(sender))) {
                const y = 329 - lineOffset * 13;
                let x = 4;

                font?.drawString(4, y, 'From', Colors.BLACK);
                font?.drawString(4, y - 1, 'From', Colors.CYAN);
                x += font?.stringWidth('From ') ?? 0;

                if (modlevel == 1) {
                    this.imageModIcons[0].draw(x, y - 12);
                    x += 14;
                } else if (modlevel == 2) {
                    this.imageModIcons[1].draw(x, y - 12);
                    x += 14;
                }

                font?.drawString(x, y, sender + ': ' + this.messageText[i], Colors.BLACK);
                font?.drawString(x, y - 1, sender + ': ' + this.messageText[i], Colors.CYAN);

                lineOffset++;
                if (lineOffset >= 5) {
                    return;
                }
            } else if (type === 5 && this.chatPrivateMode < 2) {
                const y = 329 - lineOffset * 13;

                font?.drawString(4, y, this.messageText[i], Colors.BLACK);
                font?.drawString(4, y - 1, this.messageText[i], Colors.CYAN);

                lineOffset++;
                if (lineOffset >= 5) {
                    return;
                }
            } else if (type === 6 && this.chatPrivateMode < 2) {
                const y = 329 - lineOffset * 13;

                font?.drawString(4, y, 'To ' + sender + ': ' + this.messageText[i], Colors.BLACK);
                font?.drawString(4, y - 1, 'To ' + sender + ': ' + this.messageText[i], Colors.CYAN);

                lineOffset++;
                if (lineOffset >= 5) {
                    return;
                }
            }
        }
    }

    private updateWorldLocation(): void {
        if (!this.localPlayer) {
            return;
        }

        const x: number = (this.localPlayer.x >> 7) + this.sceneBaseTileX;
        const z: number = (this.localPlayer.z >> 7) + this.sceneBaseTileZ;

        if (x >= 2944 && x < 3392 && z >= 3520 && z < 6400) {
            this.wildernessLevel = (((z - 3520) / 8) | 0) + 1;
        } else if (x >= 2944 && x < 3392 && z >= 9920 && z < 12800) {
            this.wildernessLevel = (((z - 9920) / 8) | 0) + 1;
        } else {
            this.wildernessLevel = 0;
        }

        this.worldLocationState = 0;
        if (x >= 3328 && x < 3392 && z >= 3200 && z < 3264) {
            const localX: number = x & 63;
            const localZ: number = z & 63;

            if (localX >= 4 && localX <= 29 && localZ >= 44 && localZ <= 58) {
                this.worldLocationState = 1;
            } else if (localX >= 36 && localX <= 61 && localZ >= 44 && localZ <= 58) {
                this.worldLocationState = 1;
            } else if (localX >= 4 && localX <= 29 && localZ >= 25 && localZ <= 39) {
                this.worldLocationState = 1;
            } else if (localX >= 36 && localX <= 61 && localZ >= 25 && localZ <= 39) {
                this.worldLocationState = 1;
            } else if (localX >= 4 && localX <= 29 && localZ >= 6 && localZ <= 20) {
                this.worldLocationState = 1;
            } else if (localX >= 36 && localX <= 61 && localZ >= 6 && localZ <= 20) {
                this.worldLocationState = 1;
            }
        }

        if (this.worldLocationState === 0 && x >= 3328 && x <= 3393 && z >= 3203 && z <= 3325) {
            this.worldLocationState = 2;
        }

        this.overrideChat = 0;
        if (x >= 3053 && x <= 3156 && z >= 3056 && z <= 3136) {
            this.overrideChat = 1;
        } else if (x >= 3072 && x <= 3118 && z >= 9492 && z <= 9535) {
            this.overrideChat = 1;
        }

        if (this.overrideChat === 1 && x >= 3139 && x <= 3199 && z >= 3008 && z <= 3062) {
            this.overrideChat = 0;
        }
    }

    private drawTooltip(): void {
        if (this.menuSize < 2 && this.objSelected === 0 && this.spellSelected === 0) {
            return;
        }

        let tooltip: string;
        if (this.objSelected === 1 && this.menuSize < 2) {
            tooltip = 'Use ' + this.objSelectedName + ' with...';
        } else if (this.spellSelected === 1 && this.menuSize < 2) {
            tooltip = this.spellCaption + '...';
        } else {
            tooltip = this.menuOption[this.menuSize - 1];
        }

        if (this.menuSize > 2) {
            tooltip = tooltip + '@whi@ / ' + (this.menuSize - 2) + ' more options';
        }

        this.fontBold12?.drawStringTooltip(4, 15, tooltip, Colors.WHITE, true, (this.loopCycle / 1000) | 0);
    }

    private drawMenu(): void {
        const x: number = this.menuX;
        const y: number = this.menuY;
        const w: number = this.menuWidth;
        const h: number = this.menuHeight;
        const background: number = Colors.OPTIONS_MENU;

        Pix2D.fillRect2d(x, y, w, h, background);
        Pix2D.fillRect2d(x + 1, y + 1, w - 2, 16, Colors.BLACK);
        Pix2D.drawRect(x + 1, y + 18, w - 2, h - 19, Colors.BLACK);

        this.fontBold12?.drawString(x + 3, y + 14, 'Choose Option', background);

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

        for (let i: number = 0; i < this.menuSize; i++) {
            const optionY: number = y + (this.menuSize - 1 - i) * 15 + 31;

            let rgb: number = Colors.WHITE;
            if (mouseX > x && mouseX < x + w && mouseY > optionY - 13 && mouseY < optionY + 3) {
                rgb = Colors.YELLOW;
            }

            this.fontBold12?.drawStringTaggable(x + 3, optionY, this.menuOption[i], rgb, true);
        }
    }

    private drawMinimapLoc(tileX: number, tileZ: number, level: number, wallRgb: number, doorRgb: number): void {
        if (!this.scene || !this.imageMinimap) {
            return;
        }

        let typecode: number = this.scene.getWallTypecode(level, tileX, tileZ);
        if (typecode !== 0) {
            const info: number = this.scene.getInfo(level, tileX, tileZ, typecode);
            const angle: number = (info >> 6) & 0x3;
            const shape: number = info & 0x1f;
            let rgb: number = wallRgb;
            if (typecode > 0) {
                rgb = doorRgb;
            }

            const dst: Int32Array = this.imageMinimap.pixels;
            const offset: number = tileX * 4 + (103 - tileZ) * 512 * 4 + 24624;
            const locId: number = (typecode >> 14) & 0x7fff;

            const loc: LocType = LocType.get(locId);
            if (loc.mapscene === -1) {
                if (shape === LocShape.WALL_STRAIGHT.id || shape === LocShape.WALL_L.id) {
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

                if (shape === LocShape.WALL_SQUARE_CORNER.id) {
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

                if (shape === LocShape.WALL_L.id) {
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
            } else {
                const scene: Pix8 | null = this.imageMapscene[loc.mapscene];
                if (scene) {
                    const offsetX: number = ((loc.width * 4 - scene.width2d) / 2) | 0;
                    const offsetY: number = ((loc.length * 4 - scene.height2d) / 2) | 0;
                    scene.draw(tileX * 4 + 48 + offsetX, (CollisionConstants.SIZE - tileZ - loc.length) * 4 + offsetY + 48);
                }
            }
        }

        typecode = this.scene.getLocTypecode(level, tileX, tileZ);
        if (typecode !== 0) {
            const info: number = this.scene.getInfo(level, tileX, tileZ, typecode);
            const angle: number = (info >> 6) & 0x3;
            const shape: number = info & 0x1f;
            const locId: number = (typecode >> 14) & 0x7fff;

            const loc: LocType = LocType.get(locId);
            if (loc.mapscene === -1) {
                if (shape === LocShape.WALL_DIAGONAL.id) {
                    let rgb: number = 0xeeeeee;
                    if (typecode > 0) {
                        rgb = 0xee0000;
                    }

                    const dst: Int32Array = this.imageMinimap.pixels;
                    const offset: number = tileX * 4 + (CollisionConstants.SIZE - 1 - tileZ) * 512 * 4 + 24624;

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
            } else {
                const scene: Pix8 | null = this.imageMapscene[loc.mapscene];
                if (scene) {
                    const offsetX: number = ((loc.width * 4 - scene.width2d) / 2) | 0;
                    const offsetY: number = ((loc.length * 4 - scene.height2d) / 2) | 0;
                    scene.draw(tileX * 4 + 48 + offsetX, (CollisionConstants.SIZE - tileZ - loc.length) * 4 + offsetY + 48);
                }
            }
        }

        typecode = this.scene.getGroundDecorTypecode(level, tileX, tileZ);
        if (typecode !== 0) {
            const locId = (typecode >> 14) & 0x7fff;

            const loc: LocType = LocType.get(locId);
            if (loc.mapscene !== -1) {
                const scene: Pix8 | null = this.imageMapscene[loc.mapscene];
                if (scene) {
                    const offsetX: number = ((loc.width * 4 - scene.width2d) / 2) | 0;
                    const offsetY: number = ((loc.length * 4 - scene.height2d) / 2) | 0;
                    scene.draw(tileX * 4 + 48 + offsetX, (CollisionConstants.SIZE - tileZ - loc.length) * 4 + offsetY + 48);
                }
            }
        }
    }

    private interactWithLoc(opcode: number, x: number, z: number, typecode: number): boolean {
        if (!this.localPlayer || !this.scene) {
            return false;
        }

        const locId: number = (typecode >> 14) & 0x7fff;
        const info: number = this.scene.getInfo(this.currentLevel, x, z, typecode);
        if (info === -1) {
            return false;
        }

        const shape: number = info & 0x1f;
        const angle: number = (info >> 6) & 0x3;
        if (shape === LocShape.CENTREPIECE_STRAIGHT.id || shape === LocShape.CENTREPIECE_DIAGONAL.id || shape === LocShape.GROUND_DECOR.id) {
            const loc: LocType = LocType.get(locId);

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

            this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], x, z, 2, width, height, 0, 0, forceapproach, false);
        } else {
            this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], x, z, 2, 0, 0, angle, shape + 1, 0, false);
        }

        this.crossX = this.mouseClickX;
        this.crossY = this.mouseClickY;
        this.crossMode = 2;
        this.crossCycle = 0;

        this.out.p1isaac(opcode);
        this.out.p2(x + this.sceneBaseTileX);
        this.out.p2(z + this.sceneBaseTileZ);
        this.out.p2(locId);
        return true;
    }

    private tryMove(srcX: number, srcZ: number, dx: number, dz: number, type: number, locWidth: number, locLength: number, locAngle: number, locShape: number, forceapproach: number, tryNearest: boolean): boolean {
        const collisionMap: CollisionMap | null = this.levelCollisionMap[this.currentLevel];
        if (!collisionMap) {
            return false;
        }

        const sceneWidth: number = CollisionConstants.SIZE;
        const sceneLength: number = CollisionConstants.SIZE;

        for (let x: number = 0; x < sceneWidth; x++) {
            for (let z: number = 0; z < sceneLength; z++) {
                const index: number = CollisionMap.index(x, z);
                this.bfsDirection[index] = 0;
                this.bfsCost[index] = 99999999;
            }
        }

        let x: number = srcX;
        let z: number = srcZ;

        const srcIndex: number = CollisionMap.index(srcX, srcZ);
        this.bfsDirection[srcIndex] = 99;
        this.bfsCost[srcIndex] = 0;

        let steps: number = 0;
        let length: number = 0;

        this.bfsStepX[steps] = srcX;
        this.bfsStepZ[steps++] = srcZ;

        let arrived: boolean = false;
        let bufferSize: number = this.bfsStepX.length;
        const flags: Int32Array = collisionMap.flags;

        while (length !== steps) {
            x = this.bfsStepX[length];
            z = this.bfsStepZ[length];
            length = (length + 1) % bufferSize;

            if (x === dx && z === dz) {
                arrived = true;
                break;
            }

            if (locShape !== LocShape.WALL_STRAIGHT.id) {
                if ((locShape < LocShape.WALLDECOR_STRAIGHT_OFFSET.id || locShape === LocShape.CENTREPIECE_STRAIGHT.id) && collisionMap.reachedWall(x, z, dx, dz, locShape - 1, locAngle)) {
                    arrived = true;
                    break;
                }

                if (locShape < LocShape.CENTREPIECE_STRAIGHT.id && collisionMap.reachedWallDecoration(x, z, dx, dz, locShape - 1, locAngle)) {
                    arrived = true;
                    break;
                }
            }

            if (locWidth !== 0 && locLength !== 0 && collisionMap.reachedLoc(x, z, dx, dz, locWidth, locLength, forceapproach)) {
                arrived = true;
                break;
            }

            const nextCost: number = this.bfsCost[CollisionMap.index(x, z)] + 1;
            let index: number = CollisionMap.index(x - 1, z);
            if (x > 0 && this.bfsDirection[index] === 0 && (flags[index] & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) {
                this.bfsStepX[steps] = x - 1;
                this.bfsStepZ[steps] = z;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 2;
                this.bfsCost[index] = nextCost;
            }

            index = CollisionMap.index(x + 1, z);
            if (x < sceneWidth - 1 && this.bfsDirection[index] === 0 && (flags[index] & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN) {
                this.bfsStepX[steps] = x + 1;
                this.bfsStepZ[steps] = z;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 8;
                this.bfsCost[index] = nextCost;
            }

            index = CollisionMap.index(x, z - 1);
            if (z > 0 && this.bfsDirection[index] === 0 && (flags[index] & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN) {
                this.bfsStepX[steps] = x;
                this.bfsStepZ[steps] = z - 1;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 1;
                this.bfsCost[index] = nextCost;
            }

            index = CollisionMap.index(x, z + 1);
            if (z < sceneLength - 1 && this.bfsDirection[index] === 0 && (flags[index] & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) {
                this.bfsStepX[steps] = x;
                this.bfsStepZ[steps] = z + 1;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 4;
                this.bfsCost[index] = nextCost;
            }

            index = CollisionMap.index(x - 1, z - 1);
            if (
                x > 0 &&
                z > 0 &&
                this.bfsDirection[index] === 0 &&
                (flags[index] & CollisionFlag.BLOCK_SOUTH_WEST) === 0 &&
                (flags[CollisionMap.index(x - 1, z)] & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN &&
                (flags[CollisionMap.index(x, z - 1)] & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN
            ) {
                this.bfsStepX[steps] = x - 1;
                this.bfsStepZ[steps] = z - 1;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 3;
                this.bfsCost[index] = nextCost;
            }

            index = CollisionMap.index(x + 1, z - 1);
            if (
                x < sceneWidth - 1 &&
                z > 0 &&
                this.bfsDirection[index] === 0 &&
                (flags[index] & CollisionFlag.BLOCK_SOUTH_EAST) === 0 &&
                (flags[CollisionMap.index(x + 1, z)] & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN &&
                (flags[CollisionMap.index(x, z - 1)] & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN
            ) {
                this.bfsStepX[steps] = x + 1;
                this.bfsStepZ[steps] = z - 1;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 9;
                this.bfsCost[index] = nextCost;
            }

            index = CollisionMap.index(x - 1, z + 1);
            if (
                x > 0 &&
                z < sceneLength - 1 &&
                this.bfsDirection[index] === 0 &&
                (flags[index] & CollisionFlag.BLOCK_NORTH_WEST) === 0 &&
                (flags[CollisionMap.index(x - 1, z)] & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN &&
                (flags[CollisionMap.index(x, z + 1)] & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN
            ) {
                this.bfsStepX[steps] = x - 1;
                this.bfsStepZ[steps] = z + 1;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 6;
                this.bfsCost[index] = nextCost;
            }

            index = CollisionMap.index(x + 1, z + 1);
            if (
                x < sceneWidth - 1 &&
                z < sceneLength - 1 &&
                this.bfsDirection[index] === 0 &&
                (flags[index] & CollisionFlag.BLOCK_NORTH_EAST) === 0 &&
                (flags[CollisionMap.index(x + 1, z)] & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN &&
                (flags[CollisionMap.index(x, z + 1)] & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN
            ) {
                this.bfsStepX[steps] = x + 1;
                this.bfsStepZ[steps] = z + 1;
                steps = (steps + 1) % bufferSize;
                this.bfsDirection[index] = 12;
                this.bfsCost[index] = nextCost;
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
                            if (px >= 0 && pz >= 0 && px < CollisionConstants.SIZE && pz < CollisionConstants.SIZE && this.bfsCost[index] < min) {
                                min = this.bfsCost[index];
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
        this.bfsStepX[length] = x;
        this.bfsStepZ[length++] = z;

        let dir: number = this.bfsDirection[CollisionMap.index(x, z)];
        let next: number = dir;
        while (x !== srcX || z !== srcZ) {
            if (next !== dir) {
                dir = next;
                this.bfsStepX[length] = x;
                this.bfsStepZ[length++] = z;
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

            next = this.bfsDirection[CollisionMap.index(x, z)];
        }

        if (length > 0) {
            bufferSize = Math.min(length, 25); // max number of turns in a single pf request
            length--;

            const startX: number = this.bfsStepX[length];
            const startZ: number = this.bfsStepZ[length];

            if (type === 0) {
                this.out.p1isaac(ClientProt.MOVE_GAMECLICK);
                this.out.p1(bufferSize + bufferSize + 3);
            } else if (type === 1) {
                this.out.p1isaac(ClientProt.MOVE_MINIMAPCLICK);
                this.out.p1(bufferSize + bufferSize + 3 + 14);
            } else if (type === 2) {
                this.out.p1isaac(ClientProt.MOVE_OPCLICK);
                this.out.p1(bufferSize + bufferSize + 3);
            }

            // Always run (previously: this.actionKey[5] === 1)
            this.out.p1(1);

            this.out.p2(startX + this.sceneBaseTileX);
            this.out.p2(startZ + this.sceneBaseTileZ);

            this.flagSceneTileX = this.bfsStepX[0];
            this.flagSceneTileZ = this.bfsStepZ[0];

            for (let i: number = 1; i < bufferSize; i++) {
                length--;
                this.out.p1(this.bfsStepX[length] - startX);
                this.out.p1(this.bfsStepZ[length] - startZ);
            }

            return true;
        }

        return type !== 1;
    }

    private async readPacket(): Promise<boolean> {
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

            this.idleNetCycles = 0;
            this.ptype2 = this.ptype1;
            this.ptype1 = this.ptype0;
            this.ptype0 = this.ptype;

            if (this.ptype === ServerProt.IF_OPENCHAT) {
                const comId: number = this.in.g2();

                this.resetInterfaceAnimation(comId);

                if (this.sidebarInterfaceId !== -1) {
                    this.sidebarInterfaceId = -1;
                    this.redrawSidebar = true;
                    this.redrawSideicons = true;
                }

                this.chatInterfaceId = comId;
                this.redrawChatback = true;
                this.viewportInterfaceId = -1;
                this.pressedContinueOption = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_OPENMAIN_SIDE) {
                const main: number = this.in.g2();
                const side: number = this.in.g2();

                if (this.chatInterfaceId !== -1) {
                    this.chatInterfaceId = -1;
                    this.redrawChatback = true;
                }

                if (this.chatbackInputOpen) {
                    this.chatbackInputOpen = false;
                    this.redrawChatback = true;
                }

                this.viewportInterfaceId = main;
                this.sidebarInterfaceId = side;
                this.redrawSidebar = true;
                this.redrawSideicons = true;
                this.pressedContinueOption = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_CLOSE) {
                if (this.sidebarInterfaceId !== -1) {
                    this.sidebarInterfaceId = -1;
                    this.redrawSidebar = true;
                    this.redrawSideicons = true;
                }

                if (this.chatInterfaceId !== -1) {
                    this.chatInterfaceId = -1;
                    this.redrawChatback = true;
                }

                if (this.chatbackInputOpen) {
                    this.chatbackInputOpen = false;
                    this.redrawChatback = true;
                }

                this.viewportInterfaceId = -1;
                this.pressedContinueOption = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETTAB) {
                let comId: number = this.in.g2();
                const tab: number = this.in.g1();

                if (comId === 65535) {
                    comId = -1;
                }

                this.tabInterfaceId[tab] = comId;
                this.redrawSidebar = true;
                this.redrawSideicons = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_OPENMAIN) {
                const comId: number = this.in.g2();

                this.resetInterfaceAnimation(comId);

                if (this.sidebarInterfaceId !== -1) {
                    this.sidebarInterfaceId = -1;
                    this.redrawSidebar = true;
                    this.redrawSideicons = true;
                }

                if (this.chatInterfaceId !== -1) {
                    this.chatInterfaceId = -1;
                    this.redrawChatback = true;
                }

                if (this.chatbackInputOpen) {
                    this.chatbackInputOpen = false;
                    this.redrawChatback = true;
                }

                this.viewportInterfaceId = comId;
                this.pressedContinueOption = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_OPENSIDE) {
                const com: number = this.in.g2();

                this.resetInterfaceAnimation(com);

                if (this.chatInterfaceId !== -1) {
                    this.chatInterfaceId = -1;
                    this.redrawChatback = true;
                }

                if (this.chatbackInputOpen) {
                    this.chatbackInputOpen = false;
                    this.redrawChatback = true;
                }

                this.sidebarInterfaceId = com;
                this.redrawSidebar = true;
                this.redrawSideicons = true;
                this.viewportInterfaceId = -1;
                this.pressedContinueOption = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETTAB_ACTIVE) {
                this.selectedTab = this.in.g1();

                this.redrawSidebar = true;
                this.redrawSideicons = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype == 115) {
                // IF_OPENOVERLAY
                const com = this.in.g2b();
                this.viewportOverlayInterfaceId = com;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETCOLOUR) {
                const com: number = this.in.g2();
                const color: number = this.in.g2();

                const r: number = (color >> 10) & 0x1f;
                const g: number = (color >> 5) & 0x1f;
                const b: number = color & 0x1f;
                Component.types[com].colour = (r << 19) + (g << 11) + (b << 3);

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETHIDE) {
                const comId: number = this.in.g2();
                const hide = this.in.g1() === 1;

                Component.types[comId].hide = hide;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETOBJECT) {
                const com: number = this.in.g2();
                const objId: number = this.in.g2();
                const zoom: number = this.in.g2();

                const obj: ObjType = ObjType.get(objId);
                Component.types[com].modelType = 4;
                Component.types[com].model = objId;
                Component.types[com].xan = obj.xan2d;
                Component.types[com].yan = obj.yan2d;
                Component.types[com].zoom = ((obj.zoom2d * 100) / zoom) | 0;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETMODEL) {
                const com: number = this.in.g2();
                const model: number = this.in.g2();

                Component.types[com].modelType = 1;
                Component.types[com].model = model;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETANIM) {
                const com: number = this.in.g2();
                Component.types[com].anim = this.in.g2();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETPLAYERHEAD) {
                const comId = this.in.g2();

                if (this.localPlayer) {
                    Component.types[comId].modelType = 3;
                    Component.types[comId].model = (this.localPlayer.appearance[8] << 6) + (this.localPlayer.appearance[0] << 12) + (this.localPlayer.colour[0] << 24) + (this.localPlayer.colour[4] << 18) + this.localPlayer.appearance[11];
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETTEXT) {
                const comId: number = this.in.g2();
                const text = this.in.gjstr();

                Component.types[comId].text = text;

                if (Component.types[comId].layer === this.tabInterfaceId[this.selectedTab]) {
                    this.redrawSidebar = true;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETNPCHEAD) {
                const com: number = this.in.g2();
                const npcId: number = this.in.g2();

                Component.types[com].modelType = 2;
                Component.types[com].model = npcId;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETPOSITION) {
                const comId: number = this.in.g2();
                const x: number = this.in.g2b();
                const z: number = this.in.g2b();

                const com: Component = Component.types[comId];
                com.x = x;
                com.y = z;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.IF_SETSCROLLPOS) {
                const com: number = this.in.g2();
                let pos: number = this.in.g2();

                const inter = Component.types[com];
                if (typeof inter !== 'undefined' && inter.type === ComponentType.TYPE_LAYER) {
                    if (pos < 0) {
                        pos = 0;
                    }

                    if (pos > inter.scroll - inter.height) {
                        pos = inter.scroll - inter.height;
                    }

                    inter.scrollPosition = pos;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.TUT_FLASH) {
                this.flashingTab = this.in.g1();

                if (this.flashingTab === this.selectedTab) {
                    if (this.flashingTab === 3) {
                        this.selectedTab = 1;
                    } else {
                        this.selectedTab = 3;
                    }

                    this.redrawSidebar = true;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.TUT_OPEN) {
                this.stickyChatInterfaceId = this.in.g2b();
                this.redrawChatback = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype == 108) {
                this.field1264 = 255;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_INV_STOP_TRANSMIT) {
                const comId = this.in.g2();
                const inv: Component = Component.types[comId];

                if (inv.invSlotObjId) {
                    for (let i: number = 0; i < inv.invSlotObjId.length; i++) {
                        inv.invSlotObjId[i] = -1;
                        inv.invSlotObjId[i] = 0;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_INV_FULL) {
                this.redrawSidebar = true;

                const com: number = this.in.g2();
                const inv: Component = Component.types[com];
                const size: number = this.in.g1();

                if (inv.invSlotObjId && inv.invSlotObjCount) {
                    for (let i: number = 0; i < size; i++) {
                        inv.invSlotObjId[i] = this.in.g2();

                        let count: number = this.in.g1();
                        if (count === 255) {
                            count = this.in.g4();
                        }

                        inv.invSlotObjCount[i] = count;
                    }

                    for (let i: number = size; i < inv.invSlotObjId.length; i++) {
                        inv.invSlotObjId[i] = 0;
                        inv.invSlotObjCount[i] = 0;
                    }
                } else {
                    for (let i: number = 0; i < size; i++) {
                        this.in.g2();

                        if (this.in.g1() === 255) {
                            this.in.g4();
                        }
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_INV_PARTIAL) {
                this.redrawSidebar = true;

                const com: number = this.in.g2();
                const inv: Component = Component.types[com];

                while (this.in.pos < this.psize) {
                    const slot: number = this.in.g1();
                    const id: number = this.in.g2();

                    let count: number = this.in.g1();
                    if (count === 255) {
                        count = this.in.g4();
                    }

                    if (inv.invSlotObjId && inv.invSlotObjCount && slot >= 0 && slot < inv.invSlotObjId.length) {
                        inv.invSlotObjId[slot] = id;
                        inv.invSlotObjCount[slot] = count;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_LOOKAT) {
                this.cutscene = true;

                this.cutsceneDstLocalTileX = this.in.g1();
                this.cutsceneDstLocalTileZ = this.in.g1();
                this.cutsceneDstHeight = this.in.g2();
                this.cutsceneRotateSpeed = this.in.g1();
                this.cutsceneRotateAcceleration = this.in.g1();

                if (this.cutsceneRotateAcceleration >= 100) {
                    const sceneX: number = this.cutsceneDstLocalTileX * 128 + 64;
                    const sceneZ: number = this.cutsceneDstLocalTileZ * 128 + 64;
                    const sceneY: number = this.getHeightmapY(this.currentLevel, this.cutsceneDstLocalTileX, this.cutsceneDstLocalTileZ) - this.cutsceneDstHeight;

                    const deltaX: number = sceneX - this.cameraX;
                    const deltaY: number = sceneY - this.cameraY;
                    const deltaZ: number = sceneZ - this.cameraZ;

                    const distance: number = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ) | 0;

                    this.cameraPitch = ((Math.atan2(deltaY, distance) * 325.949) | 0) & 0x7ff;
                    this.cameraYaw = ((Math.atan2(deltaX, deltaZ) * -325.949) | 0) & 0x7ff;

                    if (this.cameraPitch < 128) {
                        this.cameraPitch = 128;
                    } else if (this.cameraPitch > 383) {
                        this.cameraPitch = 383;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_SHAKE) {
                const type: number = this.in.g1();
                const jitter: number = this.in.g1();
                const wobbleScale: number = this.in.g1();
                const wobbleSpeed: number = this.in.g1();

                this.cameraModifierEnabled[type] = true;
                this.cameraModifierJitter[type] = jitter;
                this.cameraModifierWobbleScale[type] = wobbleScale;
                this.cameraModifierWobbleSpeed[type] = wobbleSpeed;
                this.cameraModifierCycle[type] = 0;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_MOVETO) {
                this.cutscene = true;

                this.cutsceneSrcLocalTileX = this.in.g1();
                this.cutsceneSrcLocalTileZ = this.in.g1();
                this.cutsceneSrcHeight = this.in.g2();
                this.cutsceneMoveSpeed = this.in.g1();
                this.cutsceneMoveAcceleration = this.in.g1();

                if (this.cutsceneMoveAcceleration >= 100) {
                    this.cameraX = this.cutsceneSrcLocalTileX * 128 + 64;
                    this.cameraZ = this.cutsceneSrcLocalTileZ * 128 + 64;
                    this.cameraY = this.getHeightmapY(this.currentLevel, this.cutsceneSrcLocalTileX, this.cutsceneSrcLocalTileZ) - this.cutsceneSrcHeight;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CAM_RESET) {
                this.cutscene = false;

                for (let i: number = 0; i < 5; i++) {
                    this.cameraModifierEnabled[i] = false;
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
                this.getPlayerPos(this.in, this.psize);
                this.awaitingSync = false;

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

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.FINISH_TRACKING) {
                const tracking: Packet | null = InputTracking.stop();
                if (tracking) {
                    this.out.p1isaac(ClientProt.EVENT_TRACKING);
                    this.out.p2(tracking.pos);
                    this.out.pdata(tracking.data, tracking.pos, 0);
                    tracking.release();
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.ENABLE_TRACKING) {
                InputTracking.setEnabled();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MESSAGE_GAME) {
                const message: string = this.in.gjstr();

                if (message.endsWith(':tradereq:')) {
                    const player: string = message.substring(0, message.indexOf(':'));
                    const username = JString.toBase37(player);

                    let ignored: boolean = false;
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreName37[i] === username) {
                            ignored = true;
                            break;
                        }
                    }

                    if (!ignored && this.overrideChat === 0) {
                        this.addMessage(4, 'wishes to trade with you.', player);
                    }
                } else if (message.endsWith(':duelreq:')) {
                    const player: string = message.substring(0, message.indexOf(':'));
                    const username = JString.toBase37(player);

                    let ignored: boolean = false;
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreName37[i] === username) {
                            ignored = true;
                            break;
                        }
                    }

                    if (!ignored && this.overrideChat === 0) {
                        this.addMessage(8, 'wishes to duel with you.', player);
                    }
                } else {
                    this.addMessage(0, message, '');
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_IGNORELIST) {
                this.ignoreCount = (this.psize / 8) | 0;
                for (let i: number = 0; i < this.ignoreCount; i++) {
                    this.ignoreName37[i] = this.in.g8();
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.CHAT_FILTER_SETTINGS) {
                this.chatPublicMode = this.in.g1();
                this.chatPrivateMode = this.in.g1();
                this.chatTradeMode = this.in.g1();

                this.redrawPrivacySettings = true;
                this.redrawChatback = true;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MESSAGE_PRIVATE) {
                const from: bigint = this.in.g8();
                const messageId: number = this.in.g4();
                const staffModLevel: number = this.in.g1();

                let ignored: boolean = false;
                for (let i: number = 0; i < 100; i++) {
                    if (this.messageTextIds[i] === messageId) {
                        ignored = true;
                        break;
                    }
                }

                if (staffModLevel <= 1) {
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreName37[i] === from) {
                            ignored = true;
                            break;
                        }
                    }
                }

                if (!ignored && this.overrideChat === 0) {
                    try {
                        this.messageTextIds[this.privateMessageCount] = messageId;
                        this.privateMessageCount = (this.privateMessageCount + 1) % 100;
                        const uncompressed: string = WordPack.unpack(this.in, this.psize - 13);
                        const filtered: string = WordFilter.filter(uncompressed);

                        if (staffModLevel === 2 || staffModLevel === 3) {
                            this.addMessage(7, filtered, '@cr2@' + JString.formatName(JString.fromBase37(from)));
                        } else if (staffModLevel === 1) {
                            this.addMessage(7, filtered, '@cr1@' + JString.formatName(JString.fromBase37(from)));
                        } else {
                            this.addMessage(3, filtered, JString.formatName(JString.fromBase37(from)));
                        }
                    } catch (e) {
                        // signlink.reporterror('cde1'); TODO?
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_FRIENDLIST) {
                const username: bigint = this.in.g8();
                const world: number = this.in.g1();

                let displayName: string | null = JString.formatName(JString.fromBase37(username));
                for (let i: number = 0; i < this.friendCount; i++) {
                    if (username === this.friendName37[i]) {
                        if (this.friendWorld[i] !== world) {
                            this.friendWorld[i] = world;
                            this.redrawSidebar = true;
                            if (world > 0) {
                                this.addMessage(5, displayName + ' has logged in.', '');
                            }
                            if (world === 0) {
                                this.addMessage(5, displayName + ' has logged out.', '');
                            }
                        }

                        displayName = null;
                        break;
                    }
                }

                if (displayName && this.friendCount < 200) {
                    this.friendName37[this.friendCount] = username;
                    this.friendName[this.friendCount] = displayName;
                    this.friendWorld[this.friendCount] = world;
                    this.friendCount++;
                    this.redrawSidebar = true;
                }

                let sorted: boolean = false;
                while (!sorted) {
                    sorted = true;

                    for (let i: number = 0; i < this.friendCount - 1; i++) {
                        if ((this.friendWorld[i] !== Client.nodeId && this.friendWorld[i + 1] === Client.nodeId) || (this.friendWorld[i] === 0 && this.friendWorld[i + 1] !== 0)) {
                            const oldWorld: number = this.friendWorld[i];
                            this.friendWorld[i] = this.friendWorld[i + 1];
                            this.friendWorld[i + 1] = oldWorld;

                            const oldName: string | null = this.friendName[i];
                            this.friendName[i] = this.friendName[i + 1];
                            this.friendName[i + 1] = oldName;

                            const oldName37: bigint = this.friendName37[i];
                            this.friendName37[i] = this.friendName37[i + 1];
                            this.friendName37[i + 1] = oldName37;
                            this.redrawSidebar = true;
                            sorted = false;
                        }
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UNSET_MAP_FLAG) {
                this.flagSceneTileX = 0;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_RUNWEIGHT) {
                if (this.selectedTab === 12) {
                    this.redrawSidebar = true;
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
                this.systemUpdateTimer = this.in.g2() * 30;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_STAT) {
                this.redrawSidebar = true;

                const stat: number = this.in.g1();
                const xp: number = this.in.g4();
                const level: number = this.in.g1();

                this.skillExperience[stat] = xp;
                this.skillLevel[stat] = level;
                this.skillBaseLevel[stat] = 1;

                for (let i: number = 0; i < 98; i++) {
                    if (xp >= this.levelExperience[i]) {
                        this.skillBaseLevel[stat] = i + 2;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_RUNENERGY) {
                if (this.selectedTab === 12) {
                    this.redrawSidebar = true;
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

                    player.primarySeqId = -1;
                }

                for (let i: number = 0; i < this.npcs.length; i++) {
                    const npc: ClientNpc | null = this.npcs[i];
                    if (!npc) {
                        continue;
                    }

                    npc.primarySeqId = -1;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_PID) {
                this.localPid = this.in.g2();
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

                if (this.lastAddress !== 0 && this.viewportInterfaceId === -1) {
                    this.closeInterfaces();

                    let contentType: number = 650;
                    if (this.daysSinceRecoveriesChanged !== 201 || this.warnMembersInNonMembers == 1) {
                        contentType = 655;
                    }

                    this.reportAbuseInput = '';
                    this.reportAbuseMuteOption = false;

                    for (let i: number = 0; i < Component.types.length; i++) {
                        if (Component.types[i] && Component.types[i].clientCode === contentType) {
                            this.viewportInterfaceId = Component.types[i].layer;
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
                this.showSocialInput = false;
                this.chatbackInputOpen = true;
                this.chatbackInput = '';
                this.redrawChatback = true;

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

            if (this.ptype === ServerProt.REBUILD_NORMAL) {
                const zoneX: number = this.in.g2();
                const zoneZ: number = this.in.g2();

                if (this.sceneCenterZoneX === zoneX && this.sceneCenterZoneZ === zoneZ && this.sceneState !== 0) {
                    this.ptype = -1;
                    return true;
                }

                this.sceneCenterZoneX = zoneX;
                this.sceneCenterZoneZ = zoneZ;
                this.sceneBaseTileX = (this.sceneCenterZoneX - 6) * 8;
                this.sceneBaseTileZ = (this.sceneCenterZoneZ - 6) * 8;

                this.withinTutorialIsland = false;
                if ((this.sceneCenterZoneX / 8 == 48 || this.sceneCenterZoneX / 8 == 49) && this.sceneCenterZoneZ / 8 == 48) {
                    this.withinTutorialIsland = true;
                } else if (this.sceneCenterZoneX / 8 == 48 && this.sceneCenterZoneZ / 8 == 148) {
                    this.withinTutorialIsland = true;
                }

                this.sceneState = 1;
                this.sceneLoadStartTime = performance.now();

                this.areaViewport?.bind();
                this.fontPlain12?.drawStringCenter(257, 151, 'Loading - please wait.', Colors.BLACK);
                this.fontPlain12?.drawStringCenter(256, 150, 'Loading - please wait.', Colors.WHITE);
                this.areaViewport?.draw(4, 4);

                let regions = 0;
                for (let x = ((this.sceneCenterZoneX - 6) / 8) | 0; x <= (((this.sceneCenterZoneX + 6) / 8) | 0); x++) {
                    for (let z = ((this.sceneCenterZoneZ - 6) / 8) | 0; z <= (((this.sceneCenterZoneZ + 6) / 8) | 0); z++) {
                        regions++;
                    }
                }

                this.sceneMapLandData = new TypedArray1d(regions, null);
                this.sceneMapLocData = new TypedArray1d(regions, null);
                this.sceneMapIndex = new Int32Array(regions);
                this.sceneMapLandFile = new Array(regions);
                this.sceneMapLocFile = new Array(regions);

                let mapCount = 0;
                for (let x = ((this.sceneCenterZoneX - 6) / 8) | 0; x <= (((this.sceneCenterZoneX + 6) / 8) | 0); x++) {
                    for (let z = ((this.sceneCenterZoneZ - 6) / 8) | 0; z <= (((this.sceneCenterZoneZ + 6) / 8) | 0); z++) {
                        this.sceneMapIndex[mapCount] = (x << 8) + z;

                        if (this.withinTutorialIsland && (z == 49 || z == 149 || z == 147 || x == 50 || x == 49 && z == 47)) {
                            this.sceneMapLandFile[mapCount] = -1;
                            this.sceneMapLocFile[mapCount] = -1;
                            mapCount++;
                        } else if (this.onDemand) {
                            let landFile = this.sceneMapLandFile[mapCount] = this.onDemand.getMapFile(x, z, 0);
                            if (landFile != -1) {
                                this.onDemand.request(3, landFile);
                            }

                            let locFile = this.sceneMapLocFile[mapCount] = this.onDemand.getMapFile(x, z, 1);
                            if (locFile != -1) {
                                this.onDemand.request(3, locFile);
                            }

                            mapCount++;
                        }
                    }
                }

                const dx: number = this.sceneBaseTileX - this.scenePrevBaseTileX;
                const dz: number = this.sceneBaseTileZ - this.scenePrevBaseTileZ;
                this.scenePrevBaseTileX = this.sceneBaseTileX;
                this.scenePrevBaseTileZ = this.sceneBaseTileZ;

                for (let i: number = 0; i < 8192; i++) {
                    const npc: ClientNpc | null = this.npcs[i];
                    if (npc) {
                        for (let j: number = 0; j < 10; j++) {
                            npc.routeTileX[j] -= dx;
                            npc.routeTileZ[j] -= dz;
                        }

                        npc.x -= dx * 128;
                        npc.z -= dz * 128;
                    }
                }

                for (let i: number = 0; i < Constants.MAX_PLAYER_COUNT; i++) {
                    const player: ClientPlayer | null = this.players[i];
                    if (player) {
                        for (let j: number = 0; j < 10; j++) {
                            player.routeTileX[j] -= dx;
                            player.routeTileZ[j] -= dz;
                        }

                        player.x -= dx * 128;
                        player.z -= dz * 128;
                    }
                }

                this.awaitingSync = true;

                let startTileX: number = 0;
                let endTileX: number = CollisionConstants.SIZE;
                let dirX: number = 1;
                if (dx < 0) {
                    startTileX = CollisionConstants.SIZE - 1;
                    endTileX = -1;
                    dirX = -1;
                }

                let startTileZ: number = 0;
                let endTileZ: number = CollisionConstants.SIZE;
                let dirZ: number = 1;
                if (dz < 0) {
                    startTileZ = CollisionConstants.SIZE - 1;
                    endTileZ = -1;
                    dirZ = -1;
                }

                for (let x: number = startTileX; x !== endTileX; x += dirX) {
                    for (let z: number = startTileZ; z !== endTileZ; z += dirZ) {
                        const lastX: number = x + dx;
                        const lastZ: number = z + dz;

                        for (let level: number = 0; level < CollisionConstants.LEVELS; level++) {
                            if (lastX >= 0 && lastZ >= 0 && lastX < CollisionConstants.SIZE && lastZ < CollisionConstants.SIZE) {
                                this.objStacks[level][x][z] = this.objStacks[level][lastX][lastZ];
                            } else {
                                this.objStacks[level][x][z] = null;
                            }
                        }
                    }
                }

                for (let loc: LocChange | null = this.locChanges.head() as LocChange | null; loc; loc = this.locChanges.next() as LocChange | null) {
                    loc.x -= dx;
                    loc.z -= dz;

                    if (loc.x < 0 || loc.z < 0 || loc.x >= CollisionConstants.SIZE || loc.z >= CollisionConstants.SIZE) {
                        loc.unlink();
                    }
                }

                if (this.flagSceneTileX !== 0) {
                    this.flagSceneTileX -= dx;
                    this.flagSceneTileZ -= dz;
                }

                this.cutscene = false;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.VARP_SMALL) {
                const varp: number = this.in.g2();
                const value: number = this.in.g1b();

                this.varCache[varp] = value;

                if (this.varps[varp] !== value) {
                    this.varps[varp] = value;
                    this.updateVarp(varp);

                    this.redrawSidebar = true;

                    if (this.stickyChatInterfaceId !== -1) {
                        this.redrawChatback = true;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.VARP_LARGE) {
                const varp: number = this.in.g2();
                const value: number = this.in.g4();

                this.varCache[varp] = value;

                if (this.varps[varp] !== value) {
                    this.varps[varp] = value;
                    this.updateVarp(varp);

                    this.redrawSidebar = true;

                    if (this.stickyChatInterfaceId !== -1) {
                        this.redrawChatback = true;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.RESET_CLIENT_VARCACHE) {
                for (let i: number = 0; i < this.varps.length; i++) {
                    if (this.varps[i] !== this.varCache[i]) {
                        this.varps[i] = this.varCache[i];
                        this.updateVarp(i);

                        this.redrawSidebar = true;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.SYNTH_SOUND) {
                const id: number = this.in.g2();
                const loop: number = this.in.g1();
                const delay: number = this.in.g2();

                if (this.waveEnabled && !Client.lowMemory && this.waveCount < 50) {
                    this.waveIds[this.waveCount] = id;
                    this.waveLoops[this.waveCount] = loop;
                    this.waveDelay[this.waveCount] = delay + Wave.delays[id];
                    this.waveCount++;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MIDI_SONG) {
                let id: number = this.in.g2();
                if (id == 65535) {
                    id = -1;
                }

                if (this.nextMidiSong != id && this.midiActive && !Client.lowMemory) {
                    this.midiSong = id;
                    this.midiFading = true;
                    this.onDemand?.request(2, this.midiSong);
                }

                this.nextMidiSong = id;
                this.nextMusicDelay = 0;

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.MIDI_JINGLE) {
                const id: number = this.in.g2();
                const delay: number = this.in.g2();

                if (this.midiActive && !Client.lowMemory) {
                    this.midiSong = id;
                    this.midiFading = false;
                    this.onDemand?.request(2, this.midiSong);
                    this.nextMusicDelay = delay;
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS) {
                this.baseX = this.in.g1();
                this.baseZ = this.in.g1();

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_ZONE_FULL_FOLLOWS) {
                this.baseX = this.in.g1();
                this.baseZ = this.in.g1();

                for (let x: number = this.baseX; x < this.baseX + 8; x++) {
                    for (let z: number = this.baseZ; z < this.baseZ + 8; z++) {
                        if (this.objStacks[this.currentLevel][x][z]) {
                            this.objStacks[this.currentLevel][x][z] = null;
                            this.sortObjStacks(x, z);
                        }
                    }
                }

                for (let loc: LocChange | null = this.locChanges.head() as LocChange | null; loc; loc = this.locChanges.next() as LocChange | null) {
                    if (loc.x >= this.baseX && loc.x < this.baseX + 8 && loc.z >= this.baseZ && loc.z < this.baseZ + 8 && loc.level === this.currentLevel) {
                        loc.endTime = 0;
                    }
                }

                this.ptype = -1;
                return true;
            }

            if (this.ptype === ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED) {
                this.baseX = this.in.g1();
                this.baseZ = this.in.g1();

                while (this.in.pos < this.psize) {
                    const opcode: number = this.in.g1();
                    this.readZonePacket(this.in, opcode);
                }

                this.ptype = -1;
                return true;
            }

            if (
                this.ptype === ServerProt.OBJ_COUNT ||
                this.ptype === ServerProt.LOC_MERGE ||
                this.ptype === ServerProt.OBJ_REVEAL ||
                this.ptype === ServerProt.MAP_ANIM ||
                this.ptype === ServerProt.MAP_PROJANIM ||
                this.ptype === ServerProt.OBJ_DEL ||
                this.ptype === ServerProt.OBJ_ADD ||
                this.ptype === ServerProt.LOC_ANIM ||
                this.ptype === ServerProt.LOC_DEL ||
                this.ptype === ServerProt.LOC_ADD_CHANGE
            ) {
                this.readZonePacket(this.in, this.ptype);

                this.ptype = -1;
                return true;
            }

            console.error(`T1 - ${this.ptype},${this.psize} - ${this.ptype1},${this.ptype2}`);
            console.warn('[LOGOUT DEBUG] T1 packet parse error - unknown packet type, logging out');
            await this.logout();
        } catch (e) {
            // todo: try reconnecting if there was an IO error
            console.error(e);

            let str = `T2 - ${this.ptype},${this.psize} - ${this.ptype1},${this.ptype2} - ${this.psize},${(this.localPlayer?.routeTileX[0] ?? 0) + this.sceneBaseTileX},${(this.localPlayer?.routeTileZ[0] ?? 0) + this.sceneBaseTileZ} -`;
            for (let i = 0; i < this.psize && i < 50; i++) {
                str += this.in.data[i] + ',';
            }
            console.error(str);
            console.warn('[LOGOUT DEBUG] T2 packet exception - error during packet processing, logging out');
            await this.logout();
        }

        return true;
    }

    private readZonePacket(buf: Packet, opcode: number): void {
        const pos: number = buf.g1();
        let x: number = this.baseX + ((pos >> 4) & 0x7);
        let z: number = this.baseZ + (pos & 0x7);

        if (opcode === ServerProt.LOC_ADD_CHANGE) {
            const info: number = buf.g1();
            const shape: number = info >> 2;
            const angle: number = info & 0x3;
            const layer: number = LocShape.of(shape).layer;

            const id: number = buf.g2();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE) {
                this.appendLoc(-1, id, angle, layer, z, shape, this.currentLevel, x, 0);
            }
        } else if (opcode === ServerProt.LOC_DEL) {
            const info: number = buf.g1();

            const shape: number = info >> 2;
            const angle: number = info & 0x3;
            const layer: number = LocShape.of(shape).layer;

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE) {
                this.appendLoc(-1, -1, angle, layer, z, shape, this.currentLevel, x, 0);
            }
        } else if (opcode === ServerProt.LOC_ANIM) {
            const info: number = buf.g1();
            let shape: number = info >> 2;
            const angle = info & 0x3;
            const layer: number = LocShape.of(shape).layer;

            const seqId: number = buf.g2();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE && this.scene && this.levelHeightmap) {
                const heightSW = this.levelHeightmap[this.currentLevel][x][z];
                const heightSE = this.levelHeightmap[this.currentLevel][x + 1][z];
                const heightNE = this.levelHeightmap[this.currentLevel][x + 1][z + 1];
                const heightNW = this.levelHeightmap[this.currentLevel][x][z + 1];

                if (layer == 0) {
                    const wall = this.scene.getWall(this.currentLevel, x, z);
                    if (wall) {
                        const locId = wall.typecode >> 14 & 0x7FFF;
                        if (shape == 2) {
                            wall.model1 = new ClientLocAnim(this.loopCycle, locId, 2, angle + 4, heightSW, heightSE, heightNE, heightNW, seqId, false);
                            wall.model2 = new ClientLocAnim(this.loopCycle, locId, 2, (angle + 1) & 0x3, heightSW, heightSE, heightNE, heightNW, seqId, false);
                        } else {
                            wall.model1 = new ClientLocAnim(this.loopCycle, locId, shape, angle, heightSW, heightSE, heightNE, heightNW, seqId, false);
                        }
                    }
                } else if (layer == 1) {
                    const decor = this.scene.getDecor(this.currentLevel, z, x);
                    if (decor) {
                        decor.model = new ClientLocAnim(this.loopCycle, decor.typecode >> 14 & 0x7FFF, 4, 0, heightSW, heightNE, heightNE, heightNW, seqId, false);
                    }
                } else if (layer == 2) {
                    const sprite = this.scene.getLoc(this.currentLevel, x, z);
                    if (shape == 11) {
                        shape = 10;
                    }

                    if (sprite) {
                        sprite.model = new ClientLocAnim(this.loopCycle, sprite.typecode >> 14 & 0x7FFF, shape, angle, heightSW, heightSE, heightNE, heightNW, seqId, false);
                    }
                } else if (layer == 3) {
                    const decor = this.scene.getGroundDecor(this.currentLevel, x, z);
                    if (decor) {
                        decor.model = new ClientLocAnim(this.loopCycle, decor.typecode >> 14 & 0x7FFF, 22, angle, heightSW, heightSE, heightNE, heightNW, seqId, false);
                    }
                }
            }
        } else if (opcode === ServerProt.OBJ_ADD) {
            const id: number = buf.g2();
            const count: number = buf.g2();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE) {
                const obj: ClientObj = new ClientObj(id, count);
                if (!this.objStacks[this.currentLevel][x][z]) {
                    this.objStacks[this.currentLevel][x][z] = new LinkList();
                }

                this.objStacks[this.currentLevel][x][z]?.push(obj);
                this.sortObjStacks(x, z);
            }
        } else if (opcode === ServerProt.OBJ_DEL) {
            const id: number = buf.g2();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE) {
                const list: LinkList | null = this.objStacks[this.currentLevel][x][z];
                if (list) {
                    for (let obj: ClientObj | null = list.head() as ClientObj | null; obj; obj = list.next() as ClientObj | null) {
                        if (obj.index === (id & 0x7fff)) {
                            obj.unlink();
                            break;
                        }
                    }

                    if (!list.head()) {
                        this.objStacks[this.currentLevel][x][z] = null;
                    }

                    this.sortObjStacks(x, z);
                }
            }
        } else if (opcode === ServerProt.MAP_PROJANIM) {
            let dx: number = x + buf.g1b();
            let dz: number = z + buf.g1b();
            const target: number = buf.g2b();
            const spotanim: number = buf.g2();
            const srcHeight: number = buf.g1();
            const dstHeight: number = buf.g1();
            const startDelay: number = buf.g2();
            const endDelay: number = buf.g2();
            const peak: number = buf.g1();
            const arc: number = buf.g1();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE && dx >= 0 && dz >= 0 && dx < CollisionConstants.SIZE && dz < CollisionConstants.SIZE) {
                x = x * 128 + 64;
                z = z * 128 + 64;
                dx = dx * 128 + 64;
                dz = dz * 128 + 64;

                const proj: ClientProj = new ClientProj(spotanim, this.currentLevel, x, this.getHeightmapY(this.currentLevel, x, z) - srcHeight, z, startDelay + this.loopCycle, endDelay + this.loopCycle, peak, arc, target, dstHeight);
                proj.updateVelocity(dx, this.getHeightmapY(this.currentLevel, dx, dz) - dstHeight, dz, startDelay + this.loopCycle);
                this.projectiles.push(proj);
            }
        } else if (opcode === ServerProt.MAP_ANIM) {
            const id: number = buf.g2();
            const height: number = buf.g1();
            const delay: number = buf.g2();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE) {
                x = x * 128 + 64;
                z = z * 128 + 64;

                const spot: MapSpotAnim = new MapSpotAnim(id, this.currentLevel, x, z, this.getHeightmapY(this.currentLevel, x, z) - height, this.loopCycle, delay);
                this.spotanims.push(spot);
            }
        } else if (opcode === ServerProt.OBJ_REVEAL) {
            const id: number = buf.g2();
            const count: number = buf.g2();
            const receiver: number = buf.g2();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE && receiver !== this.localPid) {
                const obj: ClientObj = new ClientObj(id, count);
                if (!this.objStacks[this.currentLevel][x][z]) {
                    this.objStacks[this.currentLevel][x][z] = new LinkList();
                }

                this.objStacks[this.currentLevel][x][z]?.push(obj);
                this.sortObjStacks(x, z);
            }
        } else if (opcode === ServerProt.LOC_MERGE) {
            const info: number = buf.g1();
            const shape: number = info >> 2;
            const angle: number = info & 0x3;
            const layer: number = LocShape.of(shape).layer;

            const id: number = buf.g2();
            const start: number = buf.g2();
            const end: number = buf.g2();
            const pid: number = buf.g2();
            let east: number = buf.g1b();
            let south: number = buf.g1b();
            let west: number = buf.g1b();
            let north: number = buf.g1b();

            let player: ClientPlayer | null;
            if (pid === this.localPid) {
                player = this.localPlayer;
            } else {
                player = this.players[pid];
            }

            if (player && this.levelHeightmap) {
                const loc: LocType = LocType.get(id);

                const heightSW: number = this.levelHeightmap[this.currentLevel][x][z];
                const heightSE: number = this.levelHeightmap[this.currentLevel][x + 1][z];
                const heightNE: number = this.levelHeightmap[this.currentLevel][x + 1][z + 1];
                const heightNW: number = this.levelHeightmap[this.currentLevel][x][z + 1];

                let model = loc.getModel(shape, angle, heightSW, heightSE, heightNE, heightNW, -1);
                if (model) {
                    this.appendLoc(end + 1, -1, 0, layer, z, 0, this.currentLevel, x, start + 1);

                    player.locStartCycle = start + this.loopCycle;
                    player.locStopCycle = end + this.loopCycle;
                    player.locModel = model;

                    let width: number = loc.width;
                    let height: number = loc.length;
                    if (angle === LocAngle.NORTH || angle === LocAngle.SOUTH) {
                        width = loc.length;
                        height = loc.width;
                    }

                    player.locOffsetX = x * 128 + width * 64;
                    player.locOffsetZ = z * 128 + height * 64;
                    player.locOffsetY = this.getHeightmapY(this.currentLevel, player.locOffsetX, player.locOffsetZ);

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
            const id: number = buf.g2();
            const oldCount: number = buf.g2();
            const newCount: number = buf.g2();

            if (x >= 0 && z >= 0 && x < CollisionConstants.SIZE && z < CollisionConstants.SIZE) {
                const list: LinkList | null = this.objStacks[this.currentLevel][x][z];
                if (list) {
                    for (let obj: ClientObj | null = list.head() as ClientObj | null; obj; obj = list.next() as ClientObj | null) {
                        if (obj.index === (id & 0x7fff) && obj.count === oldCount) {
                            obj.count = newCount;
                            break;
                        }
                    }

                    this.sortObjStacks(x, z);
                }
            }
        }
    }

    private appendLoc(endTime: number, type: number, angle: number, layer: number, z: number, shape: number, level: number, x: number, startTime: number): void {
        let loc: LocChange | null = null;
        for (let next: LocChange | null = this.locChanges.head() as LocChange | null; next; next = this.locChanges.next() as LocChange | null) {
            if (next.level === this.currentLevel && next.x === x && next.z === z && next.layer === layer) {
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
            this.storeLoc(loc);
            this.locChanges.push(loc);
        }

        loc.newType = type;
        loc.newShape = shape;
        loc.newAngle = angle;
        loc.startTime = startTime;
        loc.endTime = endTime;
    }

    private storeLoc(loc: LocChange): void {
        if (!this.scene) {
            return;
        }

        let typecode: number = 0;
        let otherId: number = -1;
        let otherShape: number = 0;
        let otherAngle: number = 0;

        if (loc.layer === LocLayer.WALL) {
            typecode = this.scene.getWallTypecode(loc.level, loc.x, loc.z);
        } else if (loc.layer === LocLayer.WALL_DECOR) {
            typecode = this.scene.getDecorTypecode(loc.level, loc.z, loc.x);
        } else if (loc.layer === LocLayer.GROUND) {
            typecode = this.scene.getLocTypecode(loc.level, loc.x, loc.z);
        } else if (loc.layer === LocLayer.GROUND_DECOR) {
            typecode = this.scene.getGroundDecorTypecode(loc.level, loc.x, loc.z);
        }

        if (typecode !== 0) {
            const otherInfo: number = this.scene.getInfo(loc.level, loc.x, loc.z, typecode);
            otherId = (typecode >> 14) & 0x7fff;
            otherShape = otherInfo & 0x1f;
            otherAngle = otherInfo >> 6;
        }

        loc.oldType = otherId;
        loc.oldShape = otherShape;
        loc.oldAngle = otherAngle;
    }

    private addLoc(level: number, x: number, z: number, id: number, angle: number, shape: number, layer: number): void {
        if (x < 1 || z < 1 || x > 102 || z > 102) {
            return;
        }

        if (Client.lowMemory && level !== this.currentLevel) {
            return;
        }

        if (!this.scene) {
            return;
        }

        let typecode: number = 0;
        if (layer === LocLayer.WALL) {
            typecode = this.scene.getWallTypecode(level, x, z);
        } else if (layer === LocLayer.WALL_DECOR) {
            typecode = this.scene.getDecorTypecode(level, z, x);
        } else if (layer === LocLayer.GROUND) {
            typecode = this.scene.getLocTypecode(level, x, z);
        } else if (layer === LocLayer.GROUND_DECOR) {
            typecode = this.scene.getGroundDecorTypecode(level, x, z);
        }

        if (typecode !== 0) {
            const otherInfo: number = this.scene.getInfo(level, x, z, typecode);
            const otherId: number = (typecode >> 14) & 0x7fff;
            const otherShape: number = otherInfo & 0x1f;
            const otherAngle: number = otherInfo >> 6;

            if (layer === LocLayer.WALL) {
                this.scene?.removeWall(level, x, z, 1);

                const type: LocType = LocType.get(otherId);
                if (type.blockwalk) {
                    this.levelCollisionMap[level]?.removeWall(x, z, otherShape, otherAngle, type.blockrange);
                }
            } else if (layer === LocLayer.WALL_DECOR) {
                this.scene?.removeWallDecoration(level, x, z);
            } else if (layer === LocLayer.GROUND) {
                this.scene.removeLoc(level, x, z);

                const type: LocType = LocType.get(otherId);
                if (x + type.width > CollisionConstants.SIZE - 1 || z + type.width > CollisionConstants.SIZE - 1 || x + type.length > CollisionConstants.SIZE - 1 || z + type.length > CollisionConstants.SIZE - 1) {
                    return;
                }

                if (type.blockwalk) {
                    this.levelCollisionMap[level]?.removeLoc(x, z, type.width, type.length, otherAngle, type.blockrange);
                }
            } else if (layer === LocLayer.GROUND_DECOR) {
                this.scene?.removeGroundDecoration(level, x, z);

                const type: LocType = LocType.get(otherId);
                if (type.blockwalk && type.active) {
                    this.levelCollisionMap[level]?.removeFloor(x, z);
                }
            }
        }

        if (id >= 0) {
            let tileLevel: number = level;
            if (this.levelTileFlags && level < 3 && (this.levelTileFlags[1][x][z] & 0x2) === 2) {
                tileLevel = level + 1;
            }

            if (this.levelHeightmap) {
                World.addLoc(this.loopCycle, level, x, z, this.scene, this.levelHeightmap, this.levelCollisionMap[level], id, shape, angle, tileLevel);
            }
        }
    }

    private sortObjStacks(x: number, z: number): void {
        const objStacks: LinkList | null = this.objStacks[this.currentLevel][x][z];
        if (!objStacks) {
            this.scene?.removeGroundObject(this.currentLevel, x, z);
            return;
        }

        let topCost: number = -99999999;
        let topObj: ClientObj | null = null;

        for (let obj: ClientObj | null = objStacks.head() as ClientObj | null; obj; obj = objStacks.next() as ClientObj | null) {
            const type: ObjType = ObjType.get(obj.index);
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

        objStacks.addHead(topObj);

        let bottomObj: ClientObj | null = null;
        let middleObj: ClientObj | null = null;
        for (let obj: ClientObj | null = objStacks.head() as ClientObj | null; obj; obj = objStacks.next() as ClientObj | null) {
            if (obj.index !== topObj.index && bottomObj === null) {
                bottomObj = obj;
            }

            if (obj.index !== topObj.index && bottomObj && obj.index !== bottomObj.index && middleObj === null) {
                middleObj = obj;
            }
        }

        const typecode: number = (x + (z << 7) + 0x60000000) | 0;
        this.scene?.addGroundObject(x, z, this.getHeightmapY(this.currentLevel, x * 128 + 64, z * 128 + 64), this.currentLevel, typecode, topObj, middleObj, bottomObj);
    }

    private getPlayerPos(buf: Packet, size: number): void {
        this.entityRemovalCount = 0;
        this.entityUpdateCount = 0;

        this.getPlayerLocal(buf);
        this.getPlayerOldVis(buf);
        this.getPlayerNewVis(buf, size);
        this.getPlayerExtended(buf);

        for (let i: number = 0; i < this.entityRemovalCount; i++) {
            const index: number = this.entityRemovalIds[i];
            const player: ClientPlayer | null = this.players[index];
            if (!player) {
                continue;
            }

            if (player.cycle !== this.loopCycle) {
                this.players[index] = null;
            }
        }

        if (buf.pos !== size) {
            console.error(`eek! Error packet size mismatch in getplayer pos:${buf.pos} psize:${size}`);
            throw new Error('eek');
        }

        for (let index: number = 0; index < this.playerCount; index++) {
            if (!this.players[this.playerIds[index]]) {
                console.error(`eek! ${this.username} null entry in pl list - pos:${index} size:${this.playerCount}`);
                throw new Error('eek');
            }
        }
    }

    private getPlayerLocal(buf: Packet): void {
        buf.bits();

        const info: number = buf.gBit(1);
        if (info !== 0) {
            const op: number = buf.gBit(2);

            if (op === 0) {
                this.entityUpdateIds[this.entityUpdateCount++] = Constants.LOCAL_PLAYER_INDEX;
            } else if (op === 1) {
                const walkDir: number = buf.gBit(3);
                this.localPlayer?.step(false, walkDir);

                const extendedInfo: number = buf.gBit(1);
                if (extendedInfo === 1) {
                    this.entityUpdateIds[this.entityUpdateCount++] = Constants.LOCAL_PLAYER_INDEX;
                }
            } else if (op === 2) {
                const walkDir: number = buf.gBit(3);
                this.localPlayer?.step(true, walkDir);

                const runDir: number = buf.gBit(3);
                this.localPlayer?.step(true, runDir);

                const extendedInfo: number = buf.gBit(1);
                if (extendedInfo === 1) {
                    this.entityUpdateIds[this.entityUpdateCount++] = Constants.LOCAL_PLAYER_INDEX;
                }
            } else if (op === 3) {
                this.currentLevel = buf.gBit(2);
                const localX: number = buf.gBit(7);
                const localZ: number = buf.gBit(7);
                const jump: number = buf.gBit(1);

                this.localPlayer?.move(jump === 1, localX, localZ);

                const extendedInfo: number = buf.gBit(1);
                if (extendedInfo === 1) {
                    this.entityUpdateIds[this.entityUpdateCount++] = Constants.LOCAL_PLAYER_INDEX;
                }
            }
        }
    }

    private getPlayerOldVis(buf: Packet): void {
        const count: number = buf.gBit(8);

        if (count < this.playerCount) {
            for (let i: number = count; i < this.playerCount; i++) {
                this.entityRemovalIds[this.entityRemovalCount++] = this.playerIds[i];
            }
        }

        if (count > this.playerCount) {
            console.error(`eek! ${this.username} Too many players`);
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
                    player.cycle = this.loopCycle;
                }
            } else {
                const op: number = buf.gBit(2);

                if (op === 0) {
                    this.playerIds[this.playerCount++] = index;
                    if (player) {
                        player.cycle = this.loopCycle;
                    }
                    this.entityUpdateIds[this.entityUpdateCount++] = index;
                } else if (op === 1) {
                    this.playerIds[this.playerCount++] = index;
                    if (player) {
                        player.cycle = this.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    player?.step(false, walkDir);

                    const extendedInfo: number = buf.gBit(1);
                    if (extendedInfo === 1) {
                        this.entityUpdateIds[this.entityUpdateCount++] = index;
                    }
                } else if (op === 2) {
                    this.playerIds[this.playerCount++] = index;
                    if (player) {
                        player.cycle = this.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    player?.step(true, walkDir);

                    const runDir: number = buf.gBit(3);
                    player?.step(true, runDir);

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

    private getPlayerNewVis(buf: Packet, size: number): void {
        while (buf.bitPos + 10 < size * 8) {
            let index = buf.gBit(11);
            if (index === 2047) {
                break;
            }

            if (!this.players[index]) {
                this.players[index] = new ClientPlayer();

                const appearance: Packet | null = this.playerAppearanceBuffer[index];
                if (appearance) {
                    this.players[index]?.read(appearance);
                }
            }

            this.playerIds[this.playerCount++] = index;
            const player: ClientPlayer | null = this.players[index];
            if (player) {
                player.cycle = this.loopCycle;
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
                player?.move(jump === 1, this.localPlayer.routeTileX[0] + dx, this.localPlayer.routeTileZ[0] + dz);
            }

            const extendedInfo: number = buf.gBit(1);
            if (extendedInfo === 1) {
                this.entityUpdateIds[this.entityUpdateCount++] = index;
            }
        }

        buf.bytes();
    }

    private getPlayerExtended(buf: Packet): void {
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

            this.getPlayerExtendedInfo(player, index, mask, buf);
        }
    }

    private getPlayerExtendedInfo(player: ClientPlayer, index: number, mask: number, buf: Packet): void {
        if ((mask & PlayerUpdate.APPEARANCE) !== 0) {
            const length: number = buf.g1();

            const data: Uint8Array = new Uint8Array(length);
            const appearance: Packet = new Packet(data);
            buf.gdata(length, 0, data);

            this.playerAppearanceBuffer[index] = appearance;
            player.read(appearance);
        }

        if ((mask & PlayerUpdate.ANIM) !== 0) {
            let seqId: number = buf.g2();
            if (seqId === 65535) {
                seqId = -1;
            }

            if (seqId === player.primarySeqId) {
                player.primarySeqLoop = 0;
            }

            const delay: number = buf.g1();
            if (player.primarySeqId === seqId && seqId !== -1) {
                const restartMode = SeqType.types[seqId].duplicatebehavior;

                if (restartMode == RestartMode.RESET) {
                    player.primarySeqFrame = 0;
                    player.primarySeqCycle = 0;
                    player.primarySeqDelay = delay;
                    player.primarySeqLoop = 0;
                } else if (restartMode == RestartMode.RESETLOOP) {
                    player.primarySeqLoop = 0;
                }
            } else if (seqId === -1 || player.primarySeqId === -1 || SeqType.types[seqId].priority > SeqType.types[player.primarySeqId].priority || SeqType.types[player.primarySeqId].priority === 0) {
                player.primarySeqId = seqId;
                player.primarySeqFrame = 0;
                player.primarySeqCycle = 0;
                player.primarySeqDelay = delay;
                player.primarySeqLoop = 0;
                player.preanimRouteLength = player.routeLength;
            }
        }

        if ((mask & PlayerUpdate.FACE_ENTITY) !== 0) {
            player.targetId = buf.g2();
            if (player.targetId === 65535) {
                player.targetId = -1;
            }
        }

        if ((mask & PlayerUpdate.SAY) !== 0) {
            player.chatMessage = buf.gjstr();
            player.chatColour = 0;
            player.chatEffect = 0;
            player.chatTimer = 150;

            if (player.name) {
                this.addMessage(2, player.chatMessage, player.name);
            }
        }

        if ((mask & PlayerUpdate.DAMAGE) !== 0) {
            const damage = buf.g1();
            const damageType = buf.g1();

            player.hit(this.loopCycle, damageType, damage);
            player.combatCycle = this.loopCycle + 400;
            player.health = buf.g1();
            player.totalHealth = buf.g1();
        }

        if ((mask & PlayerUpdate.FACE_COORD) !== 0) {
            player.targetTileX = buf.g2();
            player.targetTileZ = buf.g2();
        }

        if ((mask & PlayerUpdate.CHAT) !== 0) {
            const colourEffect: number = buf.g2();
            const type: number = buf.g1();
            const length: number = buf.g1();
            const start: number = buf.pos;

            if (player.name && player.visible) {
                const username: bigint = JString.toBase37(player.name);
                let ignored: boolean = false;

                if (type <= 1) {
                    for (let i: number = 0; i < this.ignoreCount; i++) {
                        if (this.ignoreName37[i] === username) {
                            ignored = true;
                            break;
                        }
                    }
                }

                if (!ignored && this.overrideChat === 0) {
                    try {
                        const uncompressed: string = WordPack.unpack(buf, length);
                        const filtered: string = WordFilter.filter(uncompressed);
                        player.chatMessage = filtered;
                        player.chatColour = colourEffect >> 8;
                        player.chatEffect = colourEffect & 0xff;
                        player.chatTimer = 150;

                        if (type === 2 || type === 3) {
                            this.addMessage(1, filtered, '@cr2@' + player.name);
                        } else if (type === 1) {
                            this.addMessage(1, filtered, '@cr1@' + player.name);
                        } else {
                            this.addMessage(2, filtered, player.name);
                        }
                    } catch (e) {
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
            player.spotanimLastCycle = this.loopCycle + (heightDelay & 0xffff);
            player.spotanimFrame = 0;
            player.spotanimCycle = 0;

            if (player.spotanimLastCycle > this.loopCycle) {
                player.spotanimFrame = -1;
            }

            if (player.spotanimId === 65535) {
                player.spotanimId = -1;
            }
        }

        if ((mask & PlayerUpdate.EXACT_MOVE) !== 0) {
            player.forceMoveStartSceneTileX = buf.g1();
            player.forceMoveStartSceneTileZ = buf.g1();
            player.forceMoveEndSceneTileX = buf.g1();
            player.forceMoveEndSceneTileZ = buf.g1();
            player.forceMoveEndCycle = buf.g2() + this.loopCycle;
            player.forceMoveStartCycle = buf.g2() + this.loopCycle;
            player.forceMoveFaceDirection = buf.g1();

            player.clearRoute();
        }

        if ((mask & PlayerUpdate.DAMAGE2) !== 0) {
            const damage = buf.g1();
            const damageType = buf.g1();

            player.hit(this.loopCycle, damageType, damage);
            player.combatCycle = this.loopCycle + 400;
            player.health = buf.g1();
            player.totalHealth = buf.g1();
        }
    }

    private getNpcPos(buf: Packet, size: number): void {
        this.entityRemovalCount = 0;
        this.entityUpdateCount = 0;

        this.getNpcPosOldVis(buf);
        this.getNpcPosNewVis(buf, size);
        this.getNpcPosExtended(buf);

        for (let i: number = 0; i < this.entityRemovalCount; i++) {
            const index: number = this.entityRemovalIds[i];
            const npc: ClientNpc | null = this.npcs[index];
            if (!npc) {
                continue;
            }

            if (npc.cycle !== this.loopCycle) {
                npc.type = null;
                this.npcs[index] = null;
            }
        }

        if (buf.pos !== size) {
            console.error(`eek! ${this.username} size mismatch in getnpcpos - pos:${buf.pos} psize:${size}`);
            throw new Error('eek');
        }

        for (let i: number = 0; i < this.npcCount; i++) {
            if (!this.npcs[this.npcIds[i]]) {
                console.error(`eek! ${this.username} null entry in npc list - pos:${i} size:${this.npcCount}`);
                throw new Error('eek');
            }
        }
    }

    private getNpcPosOldVis(buf: Packet): void {
        buf.bits();

        const count: number = buf.gBit(8);
        if (count < this.npcCount) {
            for (let i: number = count; i < this.npcCount; i++) {
                this.entityRemovalIds[this.entityRemovalCount++] = this.npcIds[i];
            }
        }

        if (count > this.npcCount) {
            console.error(`eek! ${this.username} Too many npcs`);
            throw new Error('eek');
        }

        this.npcCount = 0;
        for (let i: number = 0; i < count; i++) {
            const index: number = this.npcIds[i];
            const npc: ClientNpc | null = this.npcs[index];

            const info: number = buf.gBit(1);
            if (info === 0) {
                this.npcIds[this.npcCount++] = index;
                if (npc) {
                    npc.cycle = this.loopCycle;
                }
            } else {
                const op: number = buf.gBit(2);

                if (op === 0) {
                    this.npcIds[this.npcCount++] = index;
                    if (npc) {
                        npc.cycle = this.loopCycle;
                    }
                    this.entityUpdateIds[this.entityUpdateCount++] = index;
                } else if (op === 1) {
                    this.npcIds[this.npcCount++] = index;
                    if (npc) {
                        npc.cycle = this.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    npc?.step(false, walkDir);

                    const extendedInfo: number = buf.gBit(1);
                    if (extendedInfo === 1) {
                        this.entityUpdateIds[this.entityUpdateCount++] = index;
                    }
                } else if (op === 2) {
                    this.npcIds[this.npcCount++] = index;
                    if (npc) {
                        npc.cycle = this.loopCycle;
                    }

                    const walkDir: number = buf.gBit(3);
                    npc?.step(true, walkDir);

                    const runDir: number = buf.gBit(3);
                    npc?.step(true, runDir);

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
            const index: number = buf.gBit(13);
            if (index === 8191) {
                break;
            }

            if (!this.npcs[index]) {
                this.npcs[index] = new ClientNpc();
            }

            const npc: ClientNpc | null = this.npcs[index];
            this.npcIds[this.npcCount++] = index;

            if (npc) {
                npc.cycle = this.loopCycle;
                npc.type = NpcType.get(buf.gBit(11));
                npc.size = npc.type.size;
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

            if (this.localPlayer) {
                npc?.move(false, this.localPlayer.routeTileX[0] + dx, this.localPlayer.routeTileZ[0] + dz);
            }

            const extendedInfo: number = buf.gBit(1);
            if (extendedInfo === 1) {
                this.entityUpdateIds[this.entityUpdateCount++] = index;
            }
        }

        buf.bytes();
    }

    private getNpcPosExtended(buf: Packet): void {
        for (let i: number = 0; i < this.entityUpdateCount; i++) {
            const id: number = this.entityUpdateIds[i];
            const npc: ClientNpc | null = this.npcs[id];
            if (!npc) {
                continue;
            }

            const mask: number = buf.g1();

            if ((mask & NpcUpdate.DAMAGE2) !== 0) {
                const damage = buf.g1();
                const damageType = buf.g1();

                npc.hit(this.loopCycle, damageType, damage);
                npc.combatCycle = this.loopCycle + 400;
                npc.health = buf.g1();
                npc.totalHealth = buf.g1();
            }

            if ((mask & NpcUpdate.ANIM) !== 0) {
                let seqId: number = buf.g2();
                if (seqId === 65535) {
                    seqId = -1;
                }

                if (seqId === npc.primarySeqId) {
                    npc.primarySeqLoop = 0;
                }

                const delay: number = buf.g1();
                if (npc.primarySeqId === seqId && seqId !== -1) {
                    const restartMode = SeqType.types[seqId].duplicatebehavior;

                    if (restartMode == RestartMode.RESET) {
                        npc.primarySeqFrame = 0;
                        npc.primarySeqCycle = 0;
                        npc.primarySeqDelay = delay;
                        npc.primarySeqLoop = 0;
                    } else if (restartMode == RestartMode.RESETLOOP) {
                        npc.primarySeqLoop = 0;
                    }
                } else if (seqId === -1 || npc.primarySeqId === -1 || SeqType.types[seqId].priority > SeqType.types[npc.primarySeqId].priority || SeqType.types[npc.primarySeqId].priority === 0) {
                    npc.primarySeqId = seqId;
                    npc.primarySeqFrame = 0;
                    npc.primarySeqCycle = 0;
                    npc.primarySeqDelay = delay;
                    npc.primarySeqLoop = 0;
                    npc.preanimRouteLength = npc.routeLength;
                }
            }

            if ((mask & NpcUpdate.FACE_ENTITY) !== 0) {
                npc.targetId = buf.g2();
                if (npc.targetId === 65535) {
                    npc.targetId = -1;
                }
            }

            if ((mask & NpcUpdate.SAY) !== 0) {
                npc.chatMessage = buf.gjstr();
                npc.chatTimer = 100;
            }

            if ((mask & NpcUpdate.DAMAGE) !== 0) {
                const damage = buf.g1();
                const damageType = buf.g1();

                npc.hit(this.loopCycle, damageType, damage);
                npc.combatCycle = this.loopCycle + 400;
                npc.health = buf.g1();
                npc.totalHealth = buf.g1();
            }
            if ((mask & NpcUpdate.CHANGE_TYPE) !== 0) {
                npc.type = NpcType.get(buf.g2());

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
                npc.spotanimLastCycle = this.loopCycle + (info & 0xffff);
                npc.spotanimFrame = 0;
                npc.spotanimCycle = 0;

                if (npc.spotanimLastCycle > this.loopCycle) {
                    npc.spotanimFrame = -1;
                }

                if (npc.spotanimId === 65535) {
                    npc.spotanimId = -1;
                }
            }

            if ((mask & NpcUpdate.FACE_COORD) !== 0) {
                npc.targetTileX = buf.g2();
                npc.targetTileZ = buf.g2();
            }
        }
    }

    private showContextMenu(): void {
        let width: number = 0;
        if (this.fontBold12) {
            width = this.fontBold12.stringWidth('Choose Option');
            let maxWidth: number;
            for (let i: number = 0; i < this.menuSize; i++) {
                maxWidth = this.fontBold12.stringWidth(this.menuOption[i]);
                if (maxWidth > width) {
                    width = maxWidth;
                }
            }
        }
        width += 8;

        const height: number = this.menuSize * 15 + 21;

        let x: number;
        let y: number;

        // the main viewport area
        if (this.mouseClickX > 4 && this.mouseClickY > 4 && this.mouseClickX < 516 && this.mouseClickY < 338) {
            x = this.mouseClickX - ((width / 2) | 0) - 8;
            if (x + width > 512) {
                x = 512 - width;
            }
            if (x < 0) {
                x = 0;
            }

            y = this.mouseClickY - 11;
            if (y + height > 334) {
                y = 334 - height;
            }
            if (y < 0) {
                y = 0;
            }

            this.menuVisible = true;
            this.menuArea = 0;
            this.menuX = x;
            this.menuY = y;
            this.menuWidth = width;
            this.menuHeight = this.menuSize * 15 + 22;
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

            this.menuVisible = true;
            this.menuArea = 1;
            this.menuX = x;
            this.menuY = y;
            this.menuWidth = width;
            this.menuHeight = this.menuSize * 15 + 22;
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

            this.menuVisible = true;
            this.menuArea = 2;
            this.menuX = x;
            this.menuY = y;
            this.menuWidth = width;
            this.menuHeight = this.menuSize * 15 + 22;
        }
    }

    private isAddFriendOption(option: number): boolean {
        if (option < 0) {
            return false;
        }

        let action: number = this.menuAction[option];
        if (action >= 2000) {
            action -= 2000;
        }

        return action === 406;
    }

    private useMenuOption(optionId: number): void {
        if (optionId < 0) {
            return;
        }

        if (this.chatbackInputOpen) {
            this.chatbackInputOpen = false;
            this.redrawChatback = true;
        }

        let action: number = this.menuAction[optionId];
        const a: number = this.menuParamA[optionId];
        const b: number = this.menuParamB[optionId];
        const c: number = this.menuParamC[optionId];

        if (action >= 2000) {
            action -= 2000;
        }

        if (action === 224 || action === 993 || action === 99 || action === 746 || action === 877) {
            if (this.localPlayer) {
                const success: boolean = this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], b, c, 2, 0, 0, 0, 0, 0, false);
                if (!success) {
                    this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], b, c, 2, 1, 1, 0, 0, 0, false);
                }

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                if (action === 224) {
                    this.out.p1isaac(ClientProt.OPOBJ1);
                }

                if (action === 993) {
                    this.out.p1isaac(ClientProt.OPOBJ2);
                }

                if (action === 99) {
                    this.out.p1isaac(ClientProt.OPOBJ3);
                }

                if (action === 746) {
                    this.out.p1isaac(ClientProt.OPOBJ4);
                }

                if (action === 877) {
                    this.out.p1isaac(ClientProt.OPOBJ5);
                }

                this.out.p2(b + this.sceneBaseTileX);
                this.out.p2(c + this.sceneBaseTileZ);
                this.out.p2(a);
            }
        }

        if (action === 1102) {
            // obj examine
            const obj: ObjType = ObjType.get(a);
            let examine: string;

            if (!obj.desc) {
                examine = "It's a " + obj.name + '.';
            } else {
                examine = obj.desc;
            }

            this.addMessage(0, examine, '');
        }

        if (action === 965) {
            if (this.localPlayer) {
                const success: boolean = this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], b, c, 2, 0, 0, 0, 0, 0, false);
                if (!success) {
                    this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], b, c, 2, 1, 1, 0, 0, 0, false);
                }

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1isaac(ClientProt.OPOBJT);
                this.out.p2(b + this.sceneBaseTileX);
                this.out.p2(c + this.sceneBaseTileZ);
                this.out.p2(a);
                this.out.p2(this.activeSpellId);
            }
        }

        if (action === 217) {
            if (this.localPlayer) {
                const success: boolean = this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], b, c, 2, 0, 0, 0, 0, 0, false);
                if (!success) {
                    this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], b, c, 2, 1, 1, 0, 0, 0, false);
                }

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1isaac(ClientProt.OPOBJU);
                this.out.p2(b + this.sceneBaseTileX);
                this.out.p2(c + this.sceneBaseTileZ);
                this.out.p2(a);
                this.out.p2(this.objInterface);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedInterface);
            }
        }

        if (action === 728 || action === 542 || action === 6 || action === 963 || action === 245) {
            const npc: ClientNpc | null = this.npcs[a];
            if (npc && this.localPlayer) {
                this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], npc.routeTileX[0], npc.routeTileZ[0], 2, 1, 1, 0, 0, 0, false);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                if (action === 728) {
                    this.out.p1isaac(ClientProt.OPNPC1);
                }

                if (action === 542) {
                    this.out.p1isaac(ClientProt.OPNPC2);
                }

                if (action === 6) {
                    if ((a & 0x3) === 0) {
                        Client.oplogic2++;
                    }

                    if (Client.oplogic2 >= 124) {
                        this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC2);
                        this.out.p4(0);
                    }

                    this.out.p1isaac(ClientProt.OPNPC3);
                }

                if (action === 963) {
                    this.out.p1isaac(ClientProt.OPNPC4);
                }

                if (action === 245) {
                    if ((a & 0x3) === 0) {
                        Client.oplogic4++;
                    }

                    if (Client.oplogic4 >= 85) {
                        this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC4);
                        this.out.p2(39596);
                    }

                    this.out.p1isaac(ClientProt.OPNPC5);
                }

                this.out.p2(a);
            }
        }

        if (action === 1607) {
            // npc examine
            const npc: ClientNpc | null = this.npcs[a];
            if (npc && npc.type) {
                let examine: string;

                if (!npc.type.desc) {
                    examine = "It's a " + npc.type.name + '.';
                } else {
                    examine = npc.type.desc;
                }

                this.addMessage(0, examine, '');
            }
        }

        if (action === 265) {
            const npc: ClientNpc | null = this.npcs[a];
            if (npc && this.localPlayer) {
                this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], npc.routeTileX[0], npc.routeTileZ[0], 2, 1, 1, 0, 0, 0, false);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1isaac(ClientProt.OPNPCT);
                this.out.p2(a);
                this.out.p2(this.activeSpellId);
            }
        }

        if (action === 900) {
            const npc: ClientNpc | null = this.npcs[a];

            if (npc && this.localPlayer) {
                this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], npc.routeTileX[0], npc.routeTileZ[0], 2, 1, 1, 0, 0, 0, false);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1isaac(ClientProt.OPNPCU);
                this.out.p2(a);
                this.out.p2(this.objInterface);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedInterface);
            }
        }

        if (action === 285) {
            this.interactWithLoc(ClientProt.OPLOC1, b, c, a);
        }

        if (action === 504) {
            this.interactWithLoc(ClientProt.OPLOC2, b, c, a);
        }

        if (action === 364) {
            this.interactWithLoc(ClientProt.OPLOC3, b, c, a);
        }

        if (action === 581) {
            if ((a & 0x3) === 0) {
                Client.oplogic1++;
            }

            if (Client.oplogic1 >= 99) {
                this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC1);
                this.out.p4(0);
            }

            this.interactWithLoc(ClientProt.OPLOC4, b, c, a);
        }

        if (action === 1501) {
            Client.oplogic6 += this.sceneBaseTileZ;
            if (Client.oplogic6 >= 92) {
                this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC6);
                this.out.p4(0);
            }

            this.interactWithLoc(ClientProt.OPLOC5, b, c, a);
        }

        if (action === 1175) {
            // loc examine
            const locId: number = (a >> 14) & 0x7fff;
            const loc: LocType = LocType.get(locId);

            let examine: string;
            if (!loc.desc) {
                examine = "It's a " + loc.name + '.';
            } else {
                examine = loc.desc;
            }

            this.addMessage(0, examine, '');
        }

        if (action === 55) {
            if (this.interactWithLoc(ClientProt.OPLOCT, b, c, a)) {
                this.out.p2(this.activeSpellId);
            }
        }

        if (action === 450) {
            if (this.interactWithLoc(ClientProt.OPLOCU, b, c, a)) {
                this.out.p2(this.objInterface);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedInterface);
            }
        }

        if (action === 1373 || action === 1544 || action === 151 || action === 1101) {
            const player: ClientPlayer | null = this.players[a];
            if (player && this.localPlayer) {
                this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], player.routeTileX[0], player.routeTileZ[0], 2, 1, 1, 0, 0, 0, false);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                if (action === 1101) {
                    this.out.p1isaac(ClientProt.OPPLAYER1);
                }

                if (action === 151) {
                    Client.oplogic8++;
                    if (Client.oplogic8 >= 90) {
                        this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC8);
                        this.out.p2(31114);
                    }

                    this.out.p1isaac(ClientProt.OPPLAYER2);
                }

                if (action === 1544) {
                    this.out.p1isaac(ClientProt.OPPLAYER3);
                }

                if (action === 1373) {
                    this.out.p1isaac(ClientProt.OPPLAYER4);
                }

                this.out.p2(a);
            }
        }

        if (action === 903 || action === 363) {
            let option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                option = option.substring(tag + 5).trim();
                const name: string = JString.formatName(JString.fromBase37(JString.toBase37(option)));
                let found: boolean = false;

                for (let i: number = 0; i < this.playerCount; i++) {
                    const player: ClientPlayer | null = this.players[this.playerIds[i]];

                    if (player && player.name && player.name.toLowerCase() === name.toLowerCase() && this.localPlayer) {
                        this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], player.routeTileX[0], player.routeTileZ[0], 2, 1, 1, 0, 0, 0, false);

                        if (action === 363) {
                            this.out.p1isaac(ClientProt.OPPLAYER1);
                        }

                        if (action === 903) {
                            this.out.p1isaac(ClientProt.OPPLAYER4);
                        }

                        this.out.p2(this.playerIds[i]);
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    this.addMessage(0, 'Unable to find ' + name, '');
                }
            }
        }

        if (action === 651) {
            const player: ClientPlayer | null = this.players[a];

            if (player && this.localPlayer) {
                this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], player.routeTileX[0], player.routeTileZ[0], 2, 1, 1, 0, 0, 0, false);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1isaac(ClientProt.OPPLAYERT);
                this.out.p2(a);
                this.out.p2(this.activeSpellId);
            }
        }

        if (action === 367) {
            const player: ClientPlayer | null = this.players[a];
            if (player && this.localPlayer) {
                this.tryMove(this.localPlayer.routeTileX[0], this.localPlayer.routeTileZ[0], player.routeTileX[0], player.routeTileZ[0], 2, 1, 1, 0, 0, 0, false);

                this.crossX = this.mouseClickX;
                this.crossY = this.mouseClickY;
                this.crossMode = 2;
                this.crossCycle = 0;

                this.out.p1isaac(ClientProt.OPPLAYERU);
                this.out.p2(a);
                this.out.p2(this.objInterface);
                this.out.p2(this.objSelectedSlot);
                this.out.p2(this.objSelectedInterface);
            }
        }

        if (action === 405 || action === 38 || action === 422 || action === 478 || action === 347) {
            if (action === 405) {
                Client.oplogic3 += a;
                if (Client.oplogic3 >= 97) {
                    this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC3);
                    this.out.p3(14953816);
                }

                this.out.p1isaac(ClientProt.OPHELD1);
            }

            if (action === 38) {
                this.out.p1isaac(ClientProt.OPHELD2);
            }

            if (action === 422) {
                this.out.p1isaac(ClientProt.OPHELD3);
            }

            if (action === 478) {
                if ((b & 0x3) === 0) {
                    Client.oplogic5++;
                }

                if (Client.oplogic5 >= 90) {
                    this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC5);
                }

                this.out.p1isaac(ClientProt.OPHELD4);
            }

            if (action === 347) {
                this.out.p1isaac(ClientProt.OPHELD5);
            }

            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);

            this.selectedCycle = 0;
            this.selectedInterface = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (Component.types[c].layer === this.viewportInterfaceId) {
                this.selectedArea = 1;
            }

            if (Component.types[c].layer === this.chatInterfaceId) {
                this.selectedArea = 3;
            }
        }

        if (action === 1773) {
            // inv obj examine
            const obj: ObjType = ObjType.get(a);
            let examine: string;

            if (c >= 100000) {
                examine = c + ' x ' + obj.name;
            } else if (!obj.desc) {
                examine = "It's a " + obj.name + '.';
            } else {
                examine = obj.desc;
            }

            this.addMessage(0, examine, '');
        }

        if (action === 188) {
            // select obj interface
            this.objSelected = 1;
            this.objSelectedSlot = b;
            this.objSelectedInterface = c;
            this.objInterface = a;
            this.objSelectedName = ObjType.get(a).name;
            this.spellSelected = 0;
            this.redrawSidebar = true;
            return;
        }

        if (action === 930) {
            const com: Component = Component.types[c];
            this.spellSelected = 1;
            this.activeSpellId = c;
            this.activeSpellFlags = com.targetMask;
            this.objSelected = 0;
            this.redrawSidebar = true;

            let prefix: string | null = com.targetVerb;
            if (prefix && prefix.indexOf(' ') !== -1) {
                prefix = prefix.substring(0, prefix.indexOf(' '));
            }

            let suffix: string | null = com.targetVerb;
            if (suffix && suffix.indexOf(' ') !== -1) {
                suffix = suffix.substring(suffix.indexOf(' ') + 1);
            }

            this.spellCaption = prefix + ' ' + com.targetText + ' ' + suffix;

            if (this.activeSpellFlags === 16) {
                this.redrawSidebar = true;
                this.selectedTab = 3;
                this.redrawSideicons = true;
            }

            return;
        }

        if (action === 391) {
            this.out.p1isaac(ClientProt.OPHELDT);
            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);
            this.out.p2(this.activeSpellId);

            this.selectedCycle = 0;
            this.selectedInterface = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (Component.types[c].layer === this.viewportInterfaceId) {
                this.selectedArea = 1;
            }

            if (Component.types[c].layer === this.chatInterfaceId) {
                this.selectedArea = 3;
            }
        }

        if (action === 881) {
            this.out.p1isaac(ClientProt.OPHELDU);
            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);
            this.out.p2(this.objInterface);
            this.out.p2(this.objSelectedSlot);
            this.out.p2(this.objSelectedInterface);

            this.selectedCycle = 0;
            this.selectedInterface = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (Component.types[c].layer === this.viewportInterfaceId) {
                this.selectedArea = 1;
            }

            if (Component.types[c].layer === this.chatInterfaceId) {
                this.selectedArea = 3;
            }
        }

        if (action === 602 || action === 596 || action === 22 || action === 892 || action === 415) {
            if (action === 602) {
                this.out.p1isaac(ClientProt.INV_BUTTON1);
            }

            if (action === 596) {
                this.out.p1isaac(ClientProt.INV_BUTTON2);
            }

            if (action === 22) {
                this.out.p1isaac(ClientProt.INV_BUTTON3);
            }

            if (action === 892) {
                if ((b & 0x3) === 0) {
                    Client.oplogic9++;
                }

                if (Client.oplogic9 >= 130) {
                    this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC9);
                    this.out.p1(177);
                }

                this.out.p1isaac(ClientProt.INV_BUTTON4);
            }

            if (action === 415) {
                if ((c & 0x3) === 0) {
                    Client.oplogic7++;
                }

                if (Client.oplogic7 >= 55) {
                    this.out.p1isaac(ClientProt.ANTICHEAT_OPLOGIC7);
                    this.out.p4(0);
                }

                this.out.p1isaac(ClientProt.INV_BUTTON5);
            }

            this.out.p2(a);
            this.out.p2(b);
            this.out.p2(c);

            this.selectedCycle = 0;
            this.selectedInterface = c;
            this.selectedItem = b;
            this.selectedArea = 2;

            if (Component.types[c].layer === this.viewportInterfaceId) {
                this.selectedArea = 1;
            }

            if (Component.types[c].layer === this.chatInterfaceId) {
                this.selectedArea = 3;
            }
        }

        if (action === 465) {
            this.out.p1isaac(ClientProt.IF_BUTTON);
            this.out.p2(c);

            const com: Component = Component.types[c];
            if (com.scripts && com.scripts[0] && com.scripts[0][0] === 5) {
                const varp: number = com.scripts[0][1];
                this.varps[varp] = 1 - this.varps[varp];
                this.updateVarp(varp);
                this.redrawSidebar = true;
            }
        }

        if (action === 951) {
            const com: Component = Component.types[c];
            let notify: boolean = true;

            if (com.clientCode > 0) {
                notify = this.handleInterfaceAction(com);
            }

            if (notify) {
                this.out.p1isaac(ClientProt.IF_BUTTON);
                this.out.p2(c);
            }
        }

        if (action === 960) {
            this.out.p1isaac(ClientProt.IF_BUTTON);
            this.out.p2(c);

            const com: Component = Component.types[c];
            if (com.scripts && com.scripts[0] && com.scripts[0][0] === 5) {
                const varp: number = com.scripts[0][1];
                if (com.scriptOperand && this.varps[varp] !== com.scriptOperand[0]) {
                    this.varps[varp] = com.scriptOperand[0];
                    this.updateVarp(varp);
                    this.redrawSidebar = true;
                }
            }
        }

        if (action === 44) {
            if (!this.pressedContinueOption) {
                this.out.p1isaac(ClientProt.RESUME_PAUSEBUTTON);
                this.out.p2(c);
                this.pressedContinueOption = true;
            }
        }

        if (action === 947) {
            this.closeInterfaces();
        }

        if (action === 34) {
            // reportabuse input
            const option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                this.closeInterfaces();

                this.reportAbuseInput = option.substring(tag + 5).trim();
                this.reportAbuseMuteOption = false;

                for (let i: number = 0; i < Component.types.length; i++) {
                    if (Component.types[i] && Component.types[i].clientCode === ClientCode.CC_REPORT_INPUT) {
                        this.reportAbuseInterfaceId = this.viewportInterfaceId = Component.types[i].layer;
                        break;
                    }
                }
            }
        }

        if (action === 660) {
            if (this.menuVisible) {
                this.scene?.click(b - 8, c - 11);
            } else {
                this.scene?.click(this.mouseClickX - 8, this.mouseClickY - 11);
            }
        }

        if (action === 406 || action === 436 || action === 557 || action === 556) {
            const option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                const username: bigint = JString.toBase37(option.substring(tag + 5).trim());
                if (action === 406) {
                    this.addFriend(username);
                } else if (action === 436) {
                    this.addIgnore(username);
                } else if (action === 557) {
                    this.removeFriend(username);
                } else if (action === 556) {
                    this.removeIgnore(username);
                }
            }
        }

        if (action === 679) {
            const option: string = this.menuOption[optionId];
            const tag: number = option.indexOf('@whi@');

            if (tag !== -1) {
                const name37: bigint = JString.toBase37(option.substring(tag + 5).trim());
                let friend: number = -1;

                for (let i: number = 0; i < this.friendCount; i++) {
                    if (this.friendName37[i] === name37) {
                        friend = i;
                        break;
                    }
                }

                if (friend !== -1 && this.friendWorld[friend] > 0) {
                    this.redrawChatback = true;
                    this.chatbackInputOpen = false;
                    this.showSocialInput = true;
                    this.socialInput = '';
                    this.socialInputType = 3;
                    this.socialName37 = this.friendName37[friend];
                    this.socialMessage = 'Enter message to send to ' + this.friendName[friend];
                }
            }
        }

        this.objSelected = 0;
        this.spellSelected = 0;
        this.redrawSidebar = true;
    }

    private addNpcOptions(npc: NpcType, a: number, b: number, c: number): void {
        if (this.menuSize >= 400) {
            return;
        }

        let tooltip: string | null = npc.name;
        if (npc.vislevel !== 0 && this.localPlayer) {
            tooltip = tooltip + this.getCombatLevelTag(this.localPlayer.combatLevel, npc.vislevel) + ' (level-' + npc.vislevel + ')';
        }

        if (this.objSelected === 1) {
            this.menuOption[this.menuSize] = 'Use ' + this.objSelectedName + ' with @yel@' + tooltip;
            this.menuAction[this.menuSize] = 900;
            this.menuParamA[this.menuSize] = a;
            this.menuParamB[this.menuSize] = b;
            this.menuParamC[this.menuSize] = c;
            this.menuSize++;
        } else if (this.spellSelected !== 1) {
            let type: number;
            if (npc.op) {
                for (type = 4; type >= 0; type--) {
                    if (npc.op[type] && npc.op[type]?.toLowerCase() !== 'attack') {
                        this.menuOption[this.menuSize] = npc.op[type] + ' @yel@' + tooltip;

                        if (type === 0) {
                            this.menuAction[this.menuSize] = 728;
                        } else if (type === 1) {
                            this.menuAction[this.menuSize] = 542;
                        } else if (type === 2) {
                            this.menuAction[this.menuSize] = 6;
                        } else if (type === 3) {
                            this.menuAction[this.menuSize] = 963;
                        } else if (type === 4) {
                            this.menuAction[this.menuSize] = 245;
                        }

                        this.menuParamA[this.menuSize] = a;
                        this.menuParamB[this.menuSize] = b;
                        this.menuParamC[this.menuSize] = c;
                        this.menuSize++;
                    }
                }
            }

            if (npc.op) {
                for (type = 4; type >= 0; type--) {
                    if (npc.op[type] && npc.op[type]?.toLowerCase() === 'attack') {
                        let action: number = 0;
                        if (this.localPlayer && npc.vislevel > this.localPlayer.combatLevel) {
                            action = 2000;
                        }

                        this.menuOption[this.menuSize] = npc.op[type] + ' @yel@' + tooltip;

                        if (type === 0) {
                            this.menuAction[this.menuSize] = action + 728;
                        } else if (type === 1) {
                            this.menuAction[this.menuSize] = action + 542;
                        } else if (type === 2) {
                            this.menuAction[this.menuSize] = action + 6;
                        } else if (type === 3) {
                            this.menuAction[this.menuSize] = action + 963;
                        } else if (type === 4) {
                            this.menuAction[this.menuSize] = action + 245;
                        }

                        this.menuParamA[this.menuSize] = a;
                        this.menuParamB[this.menuSize] = b;
                        this.menuParamC[this.menuSize] = c;
                        this.menuSize++;
                    }
                }
            }

            this.menuOption[this.menuSize] = 'Examine @yel@' + tooltip;
            this.menuAction[this.menuSize] = 1607;
            this.menuParamA[this.menuSize] = a;
            this.menuParamB[this.menuSize] = b;
            this.menuParamC[this.menuSize] = c;
            this.menuSize++;
        } else if ((this.activeSpellFlags & 0x2) === 2) {
            this.menuOption[this.menuSize] = this.spellCaption + ' @yel@' + tooltip;
            this.menuAction[this.menuSize] = 265;
            this.menuParamA[this.menuSize] = a;
            this.menuParamB[this.menuSize] = b;
            this.menuParamC[this.menuSize] = c;
            this.menuSize++;
        }
    }

    private addPlayerOptions(player: ClientPlayer, a: number, b: number, c: number): void {
        if (player === this.localPlayer || this.menuSize >= 400) {
            return;
        }

        let tooltip: string | null = null;
        if (this.localPlayer) {
            tooltip = player.name + this.getCombatLevelTag(this.localPlayer.combatLevel, player.combatLevel) + ' (level-' + player.combatLevel + ')';
        }

        if (this.objSelected === 1) {
            this.menuOption[this.menuSize] = 'Use ' + this.objSelectedName + ' with @whi@' + tooltip;
            this.menuAction[this.menuSize] = 367;
            this.menuParamA[this.menuSize] = a;
            this.menuParamB[this.menuSize] = b;
            this.menuParamC[this.menuSize] = c;
            this.menuSize++;
        } else if (this.spellSelected !== 1) {
            this.menuOption[this.menuSize] = 'Follow @whi@' + tooltip;
            this.menuAction[this.menuSize] = 1544;
            this.menuParamA[this.menuSize] = a;
            this.menuParamB[this.menuSize] = b;
            this.menuParamC[this.menuSize] = c;
            this.menuSize++;

            if (this.overrideChat === 0) {
                this.menuOption[this.menuSize] = 'Trade with @whi@' + tooltip;
                this.menuAction[this.menuSize] = 1373;
                this.menuParamA[this.menuSize] = a;
                this.menuParamB[this.menuSize] = b;
                this.menuParamC[this.menuSize] = c;
                this.menuSize++;
            }

            if (this.wildernessLevel > 0) {
                this.menuOption[this.menuSize] = 'Attack @whi@' + tooltip;
                if (this.localPlayer && this.localPlayer.combatLevel >= player.combatLevel) {
                    this.menuAction[this.menuSize] = 151;
                } else {
                    this.menuAction[this.menuSize] = 2151;
                }
                this.menuParamA[this.menuSize] = a;
                this.menuParamB[this.menuSize] = b;
                this.menuParamC[this.menuSize] = c;
                this.menuSize++;
            }

            if (this.worldLocationState === 1) {
                this.menuOption[this.menuSize] = 'Fight @whi@' + tooltip;
                this.menuAction[this.menuSize] = 151;
                this.menuParamA[this.menuSize] = a;
                this.menuParamB[this.menuSize] = b;
                this.menuParamC[this.menuSize] = c;
                this.menuSize++;
            }

            if (this.worldLocationState === 2) {
                this.menuOption[this.menuSize] = 'Duel-with @whi@' + tooltip;
                this.menuAction[this.menuSize] = 1101;
                this.menuParamA[this.menuSize] = a;
                this.menuParamB[this.menuSize] = b;
                this.menuParamC[this.menuSize] = c;
                this.menuSize++;
            }
        } else if ((this.activeSpellFlags & 0x8) === 8) {
            this.menuOption[this.menuSize] = this.spellCaption + ' @whi@' + tooltip;
            this.menuAction[this.menuSize] = 651;
            this.menuParamA[this.menuSize] = a;
            this.menuParamB[this.menuSize] = b;
            this.menuParamC[this.menuSize] = c;
            this.menuSize++;
        }

        for (let i: number = 0; i < this.menuSize; i++) {
            if (this.menuAction[i] === 660) {
                this.menuOption[i] = 'Walk here @whi@' + tooltip;
                break;
            }
        }
    }

    private getCombatLevelTag(viewerLevel: number, otherLevel: number): string {
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

    private drawInterface(com: Component, x: number, y: number, scrollY: number): void {
        if (com.type !== 0 || !com.children || (com.hide && this.viewportHoveredInterfaceIndex !== com.id && this.sidebarHoveredInterfaceIndex !== com.id && this.chatHoveredInterfaceIndex !== com.id)) {
            return;
        }

        const left: number = Pix2D.left;
        const top: number = Pix2D.top;
        const right: number = Pix2D.right;
        const bottom: number = Pix2D.bottom;

        Pix2D.setBounds(x, y, x + com.width, y + com.height);
        const children: number = com.children.length;

        for (let i: number = 0; i < children; i++) {
            if (!com.childX || !com.childY) {
                continue;
            }

            let childX: number = com.childX[i] + x;
            let childY: number = com.childY[i] + y - scrollY;

            const child: Component = Component.types[com.children[i]];
            childX += child.x;
            childY += child.y;

            if (child.clientCode > 0) {
                this.updateInterfaceContent(child);
            }

            if (child.type === ComponentType.TYPE_LAYER) {
                if (child.scrollPosition > child.scroll - child.height) {
                    child.scrollPosition = child.scroll - child.height;
                }

                if (child.scrollPosition < 0) {
                    child.scrollPosition = 0;
                }

                this.drawInterface(child, childX, childY, child.scrollPosition);

                if (child.scroll > child.height) {
                    this.drawScrollbar(childX + child.width, childY, child.scrollPosition, child.scroll, child.height);
                }
            } else if (child.type === ComponentType.TYPE_INV) {
                let slot: number = 0;

                for (let row: number = 0; row < child.height; row++) {
                    for (let col: number = 0; col < child.width; col++) {
                        if (!child.invSlotOffsetX || !child.invSlotOffsetY || !child.invSlotObjId || !child.invSlotObjCount) {
                            continue;
                        }

                        let slotX: number = childX + col * (child.marginX + 32);
                        let slotY: number = childY + row * (child.marginY + 32);

                        if (slot < 20) {
                            slotX += child.invSlotOffsetX[slot];
                            slotY += child.invSlotOffsetY[slot];
                        }

                        if (child.invSlotObjId[slot] > 0) {
                            let dx: number = 0;
                            let dy: number = 0;
                            const id: number = child.invSlotObjId[slot] - 1;

                            if ((slotX > Pix2D.left - 32 && slotX < Pix2D.right && slotY > Pix2D.top - 32 && slotY < Pix2D.bottom) || (this.objDragArea !== 0 && this.objDragSlot === slot)) {
                                let outline = 0;
                                if (this.objSelected == 1 && this.objSelectedSlot == slot && this.objSelectedInterface == child.id) {
                                    outline = 16777215;
                                }

                                const icon: Pix32 | null = ObjType.getIcon(id, child.invSlotObjCount[slot], outline);
                                if (icon) {
                                    if (this.objDragArea !== 0 && this.objDragSlot === slot && this.objDragInterfaceId === child.id) {
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

                                        icon.drawAlpha(128, slotX + dx, slotY + dy);

                                        if (slotY + dy < Pix2D.top && com.scrollPosition > 0) {
                                            let autoscroll = (Pix2D.top - slotY - dy) * this.sceneDelta / 3;
                                            if (autoscroll > this.sceneDelta * 10) {
                                                autoscroll = this.sceneDelta * 10;
                                            }

                                            if (autoscroll > com.scrollPosition) {
                                                autoscroll = com.scrollPosition;
                                            }

                                            com.scrollPosition -= autoscroll;
                                            this.objGrabY += autoscroll;
                                        }

                                        if (slotY + dy + 32 > Pix2D.bottom && com.scrollPosition < com.scroll - com.height) {
                                            let autoscroll = (slotY + dy + 32 - Pix2D.bottom) * this.sceneDelta / 3;
                                            if (autoscroll > this.sceneDelta * 10) {
                                                autoscroll = this.sceneDelta * 10;
                                            }

                                            if (autoscroll > com.scroll - com.height - com.scrollPosition) {
                                                autoscroll = com.scroll - com.height - com.scrollPosition;
                                            }

                                            com.scrollPosition += autoscroll;
                                            this.objGrabY -= autoscroll;
                                        }
                                    } else if (this.selectedArea !== 0 && this.selectedItem === slot && this.selectedInterface === child.id) {
                                        icon.drawAlpha(128, slotX, slotY);
                                    } else {
                                        icon.draw(slotX, slotY);
                                    }

                                    if (icon.width === 33 || child.invSlotObjCount[slot] !== 1) {
                                        const count: number = child.invSlotObjCount[slot];
                                        this.fontPlain11?.drawString(slotX + dx + 1, slotY + 10 + dy, this.formatObjCount(count), Colors.BLACK);
                                        this.fontPlain11?.drawString(slotX + dx, slotY + 9 + dy, this.formatObjCount(count), Colors.YELLOW);
                                    }
                                }
                            }
                        } else if (child.invSlotGraphic && slot < 20) {
                            const image: Pix32 | null = child.invSlotGraphic[slot];
                            image?.draw(slotX, slotY);
                        }

                        slot++;
                    }
                }
            } else if (child.type === ComponentType.TYPE_RECT) {
                let hovered: boolean = false;
                if (this.chatHoveredInterfaceIndex === child.id || this.sidebarHoveredInterfaceIndex === child.id || this.viewportHoveredInterfaceIndex === child.id) {
                    hovered = true;
                }

                let colour: number = 0;
                if (this.executeInterfaceScript(child)) {
                    colour = child.activeColour;

                    if (hovered && child.activeOverColour !== 0) {
                        colour = child.activeOverColour;
                    }
                } else {
                    colour = child.colour;

                    if (hovered && child.overColour !== 0) {
                        colour = child.overColour;
                    }
                }

                if (child.alpha === 0) {
                    if (child.fill) {
                        Pix2D.fillRect2d(childX, childY, child.width, child.height, colour);
                    } else {
                        Pix2D.drawRect(childX, childY, child.width, child.height, colour);
                    }
                } else if (child.fill) {
                    Pix2D.fillRectAlpha(childX, childY, child.width, child.height, colour, 256 - (child.alpha & 0xFF));
                } else {
                    Pix2D.drawRect(childX, childY, child.width, child.height, colour);
                    Pix2D.drawRectAlpha(childX, childY, child.width, child.height, colour, 256 - (child.alpha & 0xFF));
                }
            } else if (child.type === ComponentType.TYPE_TEXT) {
                const font: PixFont | null = child.font;
                let text: string | null = child.text;

                let hovered: boolean = false;
                if (this.chatHoveredInterfaceIndex === child.id || this.sidebarHoveredInterfaceIndex === child.id || this.viewportHoveredInterfaceIndex === child.id) {
                    hovered = true;
                }

                let colour: number = 0;
                if (this.executeInterfaceScript(child)) {
                    colour = child.activeColour;

                    if (hovered && child.activeOverColour !== 0) {
                        colour = child.activeOverColour;
                    }

                    if (child.activeText && child.activeText.length > 0) {
                        text = child.activeText;
                    }
                } else {
                    colour = child.colour;

                    if (hovered && child.overColour !== 0) {
                        colour = child.overColour;
                    }
                }

                if (child.buttonType === ButtonType.BUTTON_CONTINUE && this.pressedContinueOption) {
                    text = 'Please wait...';
                    colour = child.colour;
                }

                if (Pix2D.width2d == 479) {
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

                for (let lineY: number = childY + font.height2d; text.length > 0; lineY += font.height2d) {
                    if (text.indexOf('%') !== -1) {
                        do {
                            const index: number = text.indexOf('%1');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.getIntString(this.executeClientScript(child, 0)) + text.substring(index + 2);
                            // eslint-disable-next-line no-constant-condition
                        } while (true);

                        do {
                            const index: number = text.indexOf('%2');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.getIntString(this.executeClientScript(child, 1)) + text.substring(index + 2);
                            // eslint-disable-next-line no-constant-condition
                        } while (true);

                        do {
                            const index: number = text.indexOf('%3');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.getIntString(this.executeClientScript(child, 2)) + text.substring(index + 2);
                            // eslint-disable-next-line no-constant-condition
                        } while (true);

                        do {
                            const index: number = text.indexOf('%4');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.getIntString(this.executeClientScript(child, 3)) + text.substring(index + 2);
                            // eslint-disable-next-line no-constant-condition
                        } while (true);

                        do {
                            const index: number = text.indexOf('%5');
                            if (index === -1) {
                                break;
                            }

                            text = text.substring(0, index) + this.getIntString(this.executeClientScript(child, 4)) + text.substring(index + 2);
                            // eslint-disable-next-line no-constant-condition
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

                    if (child.center) {
                        font.drawStringTaggableCenter(childX + ((child.width / 2) | 0), lineY, split, colour, child.shadowed);
                    } else {
                        font.drawStringTaggable(childX, lineY, split, colour, child.shadowed);
                    }
                }
            } else if (child.type === ComponentType.TYPE_GRAPHIC) {
                let image: Pix32 | null;
                if (this.executeInterfaceScript(child)) {
                    image = child.activeGraphic;
                } else {
                    image = child.graphic;
                }

                image?.draw(childX, childY);
            } else if (child.type === ComponentType.TYPE_MODEL) {
                const tmpX: number = Pix3D.centerX;
                const tmpY: number = Pix3D.centerY;

                Pix3D.centerX = childX + ((child.width / 2) | 0);
                Pix3D.centerY = childY + ((child.height / 2) | 0);

                const eyeY: number = (Pix3D.sinTable[child.xan] * child.zoom) >> 16;
                const eyeZ: number = (Pix3D.cosTable[child.xan] * child.zoom) >> 16;

                const active: boolean = this.executeInterfaceScript(child);

                let seqId: number;
                if (active) {
                    seqId = child.activeAnim;
                } else {
                    seqId = child.anim;
                }

                let model: Model | null = null;
                if (seqId === -1) {
                    model = child.getModel(-1, -1, active, this.localPlayer);
                } else {
                    const seq: SeqType = SeqType.types[seqId];
                    if (seq.frames && seq.iframes) {
                        model = child.getModel(seq.frames[child.seqFrame], seq.iframes[child.seqFrame], active, this.localPlayer);
                    }
                }

                if (model) {
                    model.drawSimple(0, child.yan, 0, child.xan, 0, eyeY, eyeZ);
                }

                Pix3D.centerX = tmpX;
                Pix3D.centerY = tmpY;
            } else if (child.type === ComponentType.TYPE_INV_TEXT) {
                const font: PixFont | null = child.font;
                if (!font || !child.invSlotObjId || !child.invSlotObjCount) {
                    continue;
                }

                let slot: number = 0;
                for (let row: number = 0; row < child.height; row++) {
                    for (let col: number = 0; col < child.width; col++) {
                        if (child.invSlotObjId[slot] > 0) {
                            const obj: ObjType = ObjType.get(child.invSlotObjId[slot] - 1);
                            let text: string | null = obj.name;
                            if (obj.stackable || child.invSlotObjCount[slot] !== 1) {
                                text = text + ' x' + this.formatObjCountTagged(child.invSlotObjCount[slot]);
                            }

                            if (!text) {
                                continue;
                            }

                            const textX: number = childX + col * (child.marginX + 115);
                            const textY: number = childY + row * (child.marginY + 12);

                            if (child.center) {
                                font.drawStringTaggableCenter(textX + ((child.width / 2) | 0), textY, text, child.colour, child.shadowed);
                            } else {
                                font.drawStringTaggable(textX, textY, text, child.colour, child.shadowed);
                            }
                        }

                        slot++;
                    }
                }
            }
        }

        Pix2D.setBounds(left, top, right, bottom);
    }

    private drawScrollbar(x: number, y: number, scrollY: number, scrollHeight: number, height: number): void {
        this.imageScrollbar0?.draw(x, y);
        this.imageScrollbar1?.draw(x, y + height - 16);
        Pix2D.fillRect2d(x, y + 16, 16, height - 32, Colors.SCROLLBAR_TRACK);

        let gripSize: number = (((height - 32) * height) / scrollHeight) | 0;
        if (gripSize < 8) {
            gripSize = 8;
        }

        const gripY: number = (((height - gripSize - 32) * scrollY) / (scrollHeight - height)) | 0;
        Pix2D.fillRect2d(x, y + gripY + 16, 16, gripSize, Colors.SCROLLBAR_GRIP_FOREGROUND);

        Pix2D.drawVerticalLine(x, y + gripY + 16, Colors.SCROLLBAR_GRIP_HIGHLIGHT, gripSize);
        Pix2D.drawVerticalLine(x + 1, y + gripY + 16, Colors.SCROLLBAR_GRIP_HIGHLIGHT, gripSize);

        Pix2D.drawHorizontalLine(x, y + gripY + 16, Colors.SCROLLBAR_GRIP_HIGHLIGHT, 16);
        Pix2D.drawHorizontalLine(x, y + gripY + 17, Colors.SCROLLBAR_GRIP_HIGHLIGHT, 16);

        Pix2D.drawVerticalLine(x + 15, y + gripY + 16, Colors.SCROLLBAR_GRIP_LOWLIGHT, gripSize);
        Pix2D.drawVerticalLine(x + 14, y + gripY + 17, Colors.SCROLLBAR_GRIP_LOWLIGHT, gripSize - 1);

        Pix2D.drawHorizontalLine(x, y + gripY + gripSize + 15, Colors.SCROLLBAR_GRIP_LOWLIGHT, 16);
        Pix2D.drawHorizontalLine(x + 1, y + gripY + gripSize + 14, Colors.SCROLLBAR_GRIP_LOWLIGHT, 15);
    }

    private formatObjCount(amount: number): string {
        if (amount < 100000) {
            return String(amount);
        } else if (amount < 10000000) {
            return ((amount / 1000) | 0) + 'K';
        } else {
            return ((amount / 1000000) | 0) + 'M';
        }
    }

    private formatObjCountTagged(amount: number): string {
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

    private handleScrollInput(mouseX: number, mouseY: number, scrollableHeight: number, height: number, redraw: boolean, left: number, top: number, component: Component): void {
        if (this.scrollGrabbed) {
            this.scrollInputPadding = 32;
        } else {
            this.scrollInputPadding = 0;
        }

        this.scrollGrabbed = false;

        if (mouseX >= left && mouseX < left + 16 && mouseY >= top && mouseY < top + 16) {
            component.scrollPosition -= this.dragCycles * 4;

            if (redraw) {
                this.redrawSidebar = true;
            }
        } else if (mouseX >= left && mouseX < left + 16 && mouseY >= top + height - 16 && mouseY < top + height) {
            component.scrollPosition += this.dragCycles * 4;

            if (redraw) {
                this.redrawSidebar = true;
            }
        } else if (mouseX >= left - this.scrollInputPadding && mouseX < left + this.scrollInputPadding + 16 && mouseY >= top + 16 && mouseY < top + height - 16 && this.dragCycles > 0) {
            let gripSize: number = (((height - 32) * height) / scrollableHeight) | 0;
            if (gripSize < 8) {
                gripSize = 8;
            }

            const gripY: number = mouseY - top - ((gripSize / 2) | 0) - 16;
            const maxY: number = height - gripSize - 32;

            component.scrollPosition = (((scrollableHeight - height) * gripY) / maxY) | 0;

            if (redraw) {
                this.redrawSidebar = true;
            }

            this.scrollGrabbed = true;
        }
    }

    private getIntString(value: number): string {
        return value < 999999999 ? String(value) : '*';
    }

    private executeInterfaceScript(com: Component): boolean {
        if (!com.scriptComparator) {
            return false;
        }

        for (let i: number = 0; i < com.scriptComparator.length; i++) {
            if (!com.scriptOperand) {
                return false;
            }

            const value: number = this.executeClientScript(com, i);
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

    private executeClientScript(component: Component, scriptId: number): number {
        if (!component.scripts || scriptId >= component.scripts.length) {
            return -2;
        }

        try {
            const script: Uint16Array | null = component.scripts[scriptId];
            if (!script) {
                return -1;
            }

            let register: number = 0;
            let pc: number = 0;

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const opcode: number = script[pc++];
                if (opcode === 0) {
                    return register;
                }

                if (opcode === 1) {
                    // load_skill_level {skill}
                    register += this.skillLevel[script[pc++]];
                } else if (opcode === 2) {
                    // load_skill_base_level {skill}
                    register += this.skillBaseLevel[script[pc++]];
                } else if (opcode === 3) {
                    // load_skill_exp {skill}
                    register += this.skillExperience[script[pc++]];
                } else if (opcode === 4) {
                    // load_inv_count {interface id} {obj id}
                    const com: Component = Component.types[script[pc++]];
                    const obj: number = script[pc++] + 1;

                    if (com.invSlotObjId && com.invSlotObjCount) {
                        for (let i: number = 0; i < com.invSlotObjId.length; i++) {
                            if (com.invSlotObjId[i] === obj) {
                                register += com.invSlotObjCount[i];
                            }
                        }
                    } else {
                        register += 0; // TODO this is custom bcos idk if it can fall 'out of sync' if u dont add to register...
                    }
                } else if (opcode === 5) {
                    // load_var {id}
                    register += this.varps[script[pc++]];
                } else if (opcode === 6) {
                    // load_next_level_xp {skill}
                    register += this.levelExperience[this.skillBaseLevel[script[pc++]] - 1];
                } else if (opcode === 7) {
                    register += ((this.varps[script[pc++]] * 100) / 46875) | 0;
                } else if (opcode === 8) {
                    // load_combat_level
                    register += this.localPlayer?.combatLevel || 0;
                } else if (opcode === 9) {
                    // load_total_level
                    for (let i: number = 0; i < 19; i++) {
                        if (i === 18) {
                            // runecrafting
                            i = 20;
                        }

                        register += this.skillBaseLevel[i];
                    }
                } else if (opcode === 10) {
                    // load_inv_contains {interface id} {obj id}
                    const com: Component = Component.types[script[pc++]];
                    const obj: number = script[pc++] + 1;

                    if (com.invSlotObjId) {
                        for (let i: number = 0; i < com.invSlotObjId.length; i++) {
                            if (com.invSlotObjId[i] === obj) {
                                register += 999999999;
                                break;
                            }
                        }
                    }
                } else if (opcode === 11) {
                    // load_energy
                    register += this.runenergy;
                } else if (opcode === 12) {
                    // load_weight
                    register += this.runweight;
                } else if (opcode === 13) {
                    // load_bool {varp} {bit: 0..31}
                    const varp: number = this.varps[script[pc++]];
                    const lsb: number = script[pc++];

                    register += (varp & (0x1 << lsb)) === 0 ? 0 : 1;
                }
            }
        } catch (e) {
            return -1;
        }
    }

    private handleInterfaceInput(com: Component, mouseX: number, mouseY: number, x: number, y: number, scrollPosition: number): void {
        if (com.type !== 0 || !com.children || com.hide || mouseX < x || mouseY < y || mouseX > x + com.width || mouseY > y + com.height || !com.childX || !com.childY) {
            return;
        }

        const children: number = com.children.length;
        for (let i: number = 0; i < children; i++) {
            let childX: number = com.childX[i] + x;
            let childY: number = com.childY[i] + y - scrollPosition;
            const child: Component = Component.types[com.children[i]];

            childX += child.x;
            childY += child.y;

            if ((child.overlayer >= 0 || child.overColour !== 0) && mouseX >= childX && mouseY >= childY && mouseX < childX + child.width && mouseY < childY + child.height) {
                if (child.overlayer >= 0) {
                    this.lastHoveredInterfaceId = child.overlayer;
                } else {
                    this.lastHoveredInterfaceId = child.id;
                }
            }

            if (child.type === 0) {
                this.handleInterfaceInput(child, mouseX, mouseY, childX, childY, child.scrollPosition);

                if (child.scroll > child.height) {
                    this.handleScrollInput(mouseX, mouseY, child.scroll, child.height, true, childX + child.width, childY, child);
                }
            } else if (child.type === 2) {
                let slot: number = 0;

                for (let row: number = 0; row < child.height; row++) {
                    for (let col: number = 0; col < child.width; col++) {
                        let slotX: number = childX + col * (child.marginX + 32);
                        let slotY: number = childY + row * (child.marginY + 32);

                        if (slot < 20 && child.invSlotOffsetX && child.invSlotOffsetY) {
                            slotX += child.invSlotOffsetX[slot];
                            slotY += child.invSlotOffsetY[slot];
                        }

                        if (mouseX < slotX || mouseY < slotY || mouseX >= slotX + 32 || mouseY >= slotY + 32) {
                            slot++;
                            continue;
                        }

                        this.hoveredSlot = slot;
                        this.hoveredSlotParentId = child.id;

                        if (!child.invSlotObjId || child.invSlotObjId[slot] <= 0) {
                            slot++;
                            continue;
                        }

                        const obj: ObjType = ObjType.get(child.invSlotObjId[slot] - 1);

                        if (this.objSelected === 1 && child.interactable) {
                            if (child.id !== this.objSelectedInterface || slot !== this.objSelectedSlot) {
                                this.menuOption[this.menuSize] = 'Use ' + this.objSelectedName + ' with @lre@' + obj.name;
                                this.menuAction[this.menuSize] = 881;
                                this.menuParamA[this.menuSize] = obj.id;
                                this.menuParamB[this.menuSize] = slot;
                                this.menuParamC[this.menuSize] = child.id;
                                this.menuSize++;
                            }
                        } else if (this.spellSelected === 1 && child.interactable) {
                            if ((this.activeSpellFlags & 0x10) === 16) {
                                this.menuOption[this.menuSize] = this.spellCaption + ' @lre@' + obj.name;
                                this.menuAction[this.menuSize] = 391;
                                this.menuParamA[this.menuSize] = obj.id;
                                this.menuParamB[this.menuSize] = slot;
                                this.menuParamC[this.menuSize] = child.id;
                                this.menuSize++;
                            }
                        } else {
                            if (child.interactable) {
                                for (let op: number = 4; op >= 3; op--) {
                                    if (obj.iop && obj.iop[op]) {
                                        this.menuOption[this.menuSize] = obj.iop[op] + ' @lre@' + obj.name;

                                        if (op === 3) {
                                            this.menuAction[this.menuSize] = 478;
                                        } else if (op === 4) {
                                            this.menuAction[this.menuSize] = 347;
                                        }

                                        this.menuParamA[this.menuSize] = obj.id;
                                        this.menuParamB[this.menuSize] = slot;
                                        this.menuParamC[this.menuSize] = child.id;
                                        this.menuSize++;
                                    } else if (op === 4) {
                                        this.menuOption[this.menuSize] = 'Drop @lre@' + obj.name;
                                        this.menuAction[this.menuSize] = 347;
                                        this.menuParamA[this.menuSize] = obj.id;
                                        this.menuParamB[this.menuSize] = slot;
                                        this.menuParamC[this.menuSize] = child.id;
                                        this.menuSize++;
                                    }
                                }
                            }

                            if (child.usable) {
                                this.menuOption[this.menuSize] = 'Use @lre@' + obj.name;
                                this.menuAction[this.menuSize] = 188;
                                this.menuParamA[this.menuSize] = obj.id;
                                this.menuParamB[this.menuSize] = slot;
                                this.menuParamC[this.menuSize] = child.id;
                                this.menuSize++;
                            }

                            if (child.interactable && obj.iop) {
                                for (let op: number = 2; op >= 0; op--) {
                                    if (obj.iop[op]) {
                                        this.menuOption[this.menuSize] = obj.iop[op] + ' @lre@' + obj.name;

                                        if (op === 0) {
                                            this.menuAction[this.menuSize] = 405;
                                        } else if (op === 1) {
                                            this.menuAction[this.menuSize] = 38;
                                        } else if (op === 2) {
                                            this.menuAction[this.menuSize] = 422;
                                        }

                                        this.menuParamA[this.menuSize] = obj.id;
                                        this.menuParamB[this.menuSize] = slot;
                                        this.menuParamC[this.menuSize] = child.id;
                                        this.menuSize++;
                                    }
                                }
                            }

                            if (child.iop) {
                                for (let op: number = 4; op >= 0; op--) {
                                    if (child.iop[op]) {
                                        this.menuOption[this.menuSize] = child.iop[op] + ' @lre@' + obj.name;

                                        if (op === 0) {
                                            this.menuAction[this.menuSize] = 602;
                                        } else if (op === 1) {
                                            this.menuAction[this.menuSize] = 596;
                                        } else if (op === 2) {
                                            this.menuAction[this.menuSize] = 22;
                                        } else if (op === 3) {
                                            this.menuAction[this.menuSize] = 892;
                                        } else if (op === 4) {
                                            this.menuAction[this.menuSize] = 415;
                                        }

                                        this.menuParamA[this.menuSize] = obj.id;
                                        this.menuParamB[this.menuSize] = slot;
                                        this.menuParamC[this.menuSize] = child.id;
                                        this.menuSize++;
                                    }
                                }
                            }

                            this.menuOption[this.menuSize] = 'Examine @lre@' + obj.name;
                            this.menuAction[this.menuSize] = 1773;
                            this.menuParamA[this.menuSize] = obj.id;
                            if (child.invSlotObjCount) {
                                this.menuParamC[this.menuSize] = child.invSlotObjCount[slot];
                            }
                            this.menuSize++;
                        }

                        slot++;
                    }
                }
            } else if (mouseX >= childX && mouseY >= childY && mouseX < childX + child.width && mouseY < childY + child.height) {
                if (child.buttonType === ButtonType.BUTTON_OK) {
                    let override: boolean = false;
                    if (child.clientCode !== 0) {
                        override = this.handleSocialMenuOption(child);
                    }

                    if (!override && child.option) {
                        this.menuOption[this.menuSize] = child.option;
                        this.menuAction[this.menuSize] = 951;
                        this.menuParamC[this.menuSize] = child.id;
                        this.menuSize++;
                    }
                } else if (child.buttonType === ButtonType.BUTTON_TARGET && this.spellSelected === 0) {
                    let prefix: string | null = child.targetVerb;
                    if (prefix && prefix.indexOf(' ') !== -1) {
                        prefix = prefix.substring(0, prefix.indexOf(' '));
                    }

                    this.menuOption[this.menuSize] = prefix + ' @gre@' + child.targetText;
                    this.menuAction[this.menuSize] = 930;
                    this.menuParamC[this.menuSize] = child.id;
                    this.menuSize++;
                } else if (child.buttonType === ButtonType.BUTTON_CLOSE) {
                    this.menuOption[this.menuSize] = 'Close';
                    this.menuAction[this.menuSize] = 947;
                    this.menuParamC[this.menuSize] = child.id;
                    this.menuSize++;
                } else if (child.buttonType === ButtonType.BUTTON_TOGGLE && child.option) {
                    this.menuOption[this.menuSize] = child.option;
                    this.menuAction[this.menuSize] = 465;
                    this.menuParamC[this.menuSize] = child.id;
                    this.menuSize++;
                } else if (child.buttonType === ButtonType.BUTTON_SELECT && child.option) {
                    this.menuOption[this.menuSize] = child.option;
                    this.menuAction[this.menuSize] = 960;
                    this.menuParamC[this.menuSize] = child.id;
                    this.menuSize++;
                } else if (child.buttonType === ButtonType.BUTTON_CONTINUE && !this.pressedContinueOption && child.option) {
                    this.menuOption[this.menuSize] = child.option;
                    this.menuAction[this.menuSize] = 44;
                    this.menuParamC[this.menuSize] = child.id;
                    this.menuSize++;
                }
            }
        }
    }

    private handleSocialMenuOption(component: Component): boolean {
        let clientCode: number = component.clientCode;

        if ((clientCode >= ClientCode.CC_FRIENDS_START && clientCode <= ClientCode.CC_FRIENDS_UPDATE_END) || (clientCode >= 701 && clientCode <= 900)) {
            if (clientCode >= 801) {
                clientCode -= 701;
            } else if (clientCode >= 701) {
                clientCode -= 601;
            } else if (clientCode >= ClientCode.CC_FRIENDS_UPDATE_START) {
                clientCode -= ClientCode.CC_FRIENDS_UPDATE_START;
            } else {
                clientCode--;
            }

            this.menuOption[this.menuSize] = 'Remove @whi@' + this.friendName[clientCode];
            this.menuAction[this.menuSize] = 557;
            this.menuSize++;

            this.menuOption[this.menuSize] = 'Message @whi@' + this.friendName[clientCode];
            this.menuAction[this.menuSize] = 679;
            this.menuSize++;
            return true;
        } else if (clientCode >= ClientCode.CC_IGNORES_START && clientCode <= ClientCode.CC_IGNORES_END) {
            this.menuOption[this.menuSize] = 'Remove @whi@' + component.text;
            this.menuAction[this.menuSize] = 556;
            this.menuSize++;
            return true;
        }

        return false;
    }

    private resetInterfaceAnimation(id: number): void {
        const parent: Component = Component.types[id];
        if (!parent.children) {
            return;
        }

        for (let i: number = 0; i < parent.children.length && parent.children[i] !== -1; i++) {
            const child: Component = Component.types[parent.children[i]];

            if (child.type === 1) {
                this.resetInterfaceAnimation(child.id);
            }

            child.seqFrame = 0;
            child.seqCycle = 0;
        }
    }

    private updateInterfaceAnimation(id: number, delta: number): boolean {
        const parent: Component = Component.types[id];
        if (!parent.children) {
            return false;
        }

        let updated: boolean = false;

        for (let i: number = 0; i < parent.children.length && parent.children[i] !== -1; i++) {
            const child: Component = Component.types[parent.children[i]];
            if (child.type === 1) {
                updated ||= this.updateInterfaceAnimation(child.id, delta);
            }

            if (child.type === 6 && (child.anim !== -1 || child.activeAnim !== -1)) {
                const active: boolean = this.executeInterfaceScript(child);

                let seqId: number;
                if (active) {
                    seqId = child.activeAnim;
                } else {
                    seqId = child.anim;
                }

                if (seqId !== -1) {
                    const type: SeqType = SeqType.types[seqId];
                    child.seqCycle += delta;

                    while (child.seqCycle > type.getFrameDuration(child.seqFrame)) {
                        child.seqCycle -= type.getFrameDuration(child.seqFrame) + 1;
                        child.seqFrame++;

                        if (child.seqFrame >= type.frameCount) {
                            child.seqFrame -= type.loops;

                            if (child.seqFrame < 0 || child.seqFrame >= type.frameCount) {
                                child.seqFrame = 0;
                            }
                        }

                        updated = true;
                    }
                }
            }
        }

        return updated;
    }

    private updateVarp(id: number): void {
        const clientcode: number = VarpType.types[id].clientcode;
        if (clientcode === 0) {
            return;
        }

        const value: number = this.varps[id];
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

            ObjType.iconCache?.clear();
            this.redrawFrame = true;
        } else if (clientcode === 3) {
            const lastMidiActive: boolean = this.midiActive;

            if (value === 0) {
                this.midiVolume = 128;
                setMidiVolume(128);
                this.midiActive = true;
            } else if (value === 1) {
                this.midiVolume = 96;
                setMidiVolume(96);
                this.midiActive = true;
            } else if (value === 2) {
                this.midiVolume = 64;
                setMidiVolume(64);
                this.midiActive = true;
            } else if (value === 3) {
                this.midiVolume = 32;
                setMidiVolume(32);
                this.midiActive = true;
            } else if (value === 4) {
                this.midiActive = false;
            }

            if (this.midiActive !== lastMidiActive) {
                if (this.midiActive) {
                    this.midiSong = this.nextMidiSong;
                    this.midiFading = false;
                    this.onDemand?.request(2, this.midiSong);
                } else {
                    stopMidi(false);
                }

                this.nextMusicDelay = 0;
            }
        } else if (clientcode === 4) {
            if (value === 0) {
                this.waveVolume = 128;
                setWaveVolume(128);
                this.waveEnabled = true;
            } else if (value === 1) {
                this.waveVolume = 96;
                setWaveVolume(96);
                this.waveEnabled = true;
            } else if (value === 2) {
                this.waveVolume = 64;
                setWaveVolume(64);
                this.waveEnabled = true;
            } else if (value === 3) {
                this.waveVolume = 32;
                setWaveVolume(32);
                this.waveEnabled = true;
            } else if (value === 4) {
                this.waveEnabled = false;
            }
        } else if (clientcode === 5) {
            this.oneMouseButton = value;
        } else if (clientcode === 6) {
            this.chatEffects = value;
        } else if (clientcode === 8) {
            this.splitPrivateChat = value;
            this.redrawChatback = true;
        } else if (clientcode === 9) {
            this.bankArrangeMode = value;
        }
    }

    private updateInterfaceContent(com: Component): void {
        let clientCode: number = com.clientCode;

        if ((clientCode >= ClientCode.CC_FRIENDS_START && clientCode <= ClientCode.CC_FRIENDS_END) || (clientCode >= 701 && clientCode <= 800)) {
            if (clientCode > 700) {
                clientCode -= 601;
            } else {
                clientCode--;
            }

            if (clientCode >= this.friendCount) {
                com.text = '';
                com.buttonType = 0;
            } else {
                com.text = this.friendName[clientCode];
                com.buttonType = 1;
            }
        } else if ((clientCode >= ClientCode.CC_FRIENDS_UPDATE_START && clientCode <= ClientCode.CC_FRIENDS_UPDATE_END) || (clientCode >= 801 && clientCode <= 900)) {
            if (clientCode > 800) {
                clientCode -= 701;
            } else {
                clientCode -= 101;
            }

            if (clientCode >= this.friendCount) {
                com.text = '';
                com.buttonType = 0;
            } else {
                if (this.friendWorld[clientCode] === 0) {
                    com.text = '@red@Offline';
                } else if (this.friendWorld[clientCode] === Client.nodeId) {
                    com.text = '@gre@World-' + (this.friendWorld[clientCode] - 9);
                } else {
                    com.text = '@yel@World-' + (this.friendWorld[clientCode] - 9);
                }

                com.buttonType = 1;
            }
        } else if (clientCode === ClientCode.CC_FRIENDS_SIZE) {
            com.scroll = this.friendCount * 15 + 20;

            if (com.scroll <= com.height) {
                com.scroll = com.height + 1;
            }
        } else if (clientCode >= ClientCode.CC_IGNORES_START && clientCode <= ClientCode.CC_IGNORES_END) {
            clientCode -= ClientCode.CC_IGNORES_START;

            if (clientCode >= this.ignoreCount) {
                com.text = '';
                com.buttonType = 0;
            } else {
                com.text = JString.formatName(JString.fromBase37(this.ignoreName37[clientCode]));
                com.buttonType = 1;
            }
        } else if (clientCode === ClientCode.CC_IGNORES_SIZE) {
            com.scroll = this.ignoreCount * 15 + 20;

            if (com.scroll <= com.height) {
                com.scroll = com.height + 1;
            }
        } else if (clientCode === ClientCode.CC_DESIGN_PREVIEW) {
            com.xan = 150;
            com.yan = ((Math.sin(this.loopCycle / 40.0) * 256.0) | 0) & 0x7ff;

            if (this.updateDesignModel) {
                for (let i = 0; i < 7; i++) {
                    const kit = this.designKits[i];
                    if (kit >= 0 && !IdkType.types[kit].modelIsReady()) {
                        return;
                    }
                }

                this.updateDesignModel = false;

                const models: (Model | null)[] = new TypedArray1d(7, null);
                let modelCount: number = 0;
                for (let part: number = 0; part < 7; part++) {
                    const kit: number = this.designKits[part];
                    if (kit >= 0) {
                        models[modelCount++] = IdkType.types[kit].getModel();
                    }
                }

                const model: Model = Model.modelFromModels(models, modelCount);
                for (let part: number = 0; part < 5; part++) {
                    if (this.designColours[part] !== 0) {
                        model.recolour(ClientPlayer.DESIGN_IDK_COLORS[part][0], ClientPlayer.DESIGN_IDK_COLORS[part][this.designColours[part]]);

                        if (part === 1) {
                            model.recolour(ClientPlayer.TORSO_RECOLORS[0], ClientPlayer.TORSO_RECOLORS[this.designColours[part]]);
                        }
                    }
                }

                model.createLabelReferences();
                model.calculateNormals(64, 850, -30, -50, -30, true);

                if (this.localPlayer) {
                    const frames: Int16Array | null = SeqType.types[this.localPlayer.readyanim].frames;
                    if (frames) {
                        model.applyTransform(frames[0]);
                    }
                }

                com.modelType = 5;
                com.model = 0;
                Component.cacheModel(model, 5, 0);
            }
        } else if (clientCode === ClientCode.CC_SWITCH_TO_MALE) {
            if (!this.genderButtonImage0) {
                this.genderButtonImage0 = com.graphic;
                this.genderButtonImage1 = com.activeGraphic;
            }

            if (this.designGender) {
                com.graphic = this.genderButtonImage1;
            } else {
                com.graphic = this.genderButtonImage0;
            }
        } else if (clientCode === ClientCode.CC_SWITCH_TO_FEMALE) {
            if (!this.genderButtonImage0) {
                this.genderButtonImage0 = com.graphic;
                this.genderButtonImage1 = com.activeGraphic;
            }

            if (this.designGender) {
                com.graphic = this.genderButtonImage0;
            } else {
                com.graphic = this.genderButtonImage1;
            }
        } else if (clientCode === ClientCode.CC_REPORT_INPUT) {
            com.text = this.reportAbuseInput;

            if (this.loopCycle % 20 < 10) {
                com.text = com.text + '|';
            } else {
                com.text = com.text + ' ';
            }
        } else if (clientCode === ClientCode.CC_MOD_MUTE) {
            if (this.staffmodlevel < 1) {
                com.text = '';
            } else if (this.reportAbuseMuteOption) {
                com.colour = Colors.RED;
                com.text = 'Moderator option: Mute player for 48 hours: <ON>';
            } else {
                com.colour = Colors.WHITE;
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

                // Show IP only if not 127.0.0.1 (servers may opt into privacy, making it needless info)
                const ipStr = JString.formatIPv4(this.lastAddress); // would be a DNS lookup if we could...
                com.text = 'You last logged in ' + text + (ipStr === '127.0.0.1' ? '.' : ' from: ' + ipStr);
            }
        } else if (clientCode === ClientCode.CC_UNREAD_MESSAGES) {
            if (this.unreadMessages === 0) {
                com.text = '0 unread messages';
                com.colour = Colors.YELLOW;
            } else if (this.unreadMessages === 1) {
                com.text = '1 unread message';
                com.colour = Colors.GREEN;
            } else if (this.unreadMessages > 1) {
                com.text = this.unreadMessages + ' unread messages';
                com.colour = Colors.GREEN;
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

    private handleInterfaceAction(com: Component): boolean {
        const clientCode: number = com.clientCode;

        if (clientCode === ClientCode.CC_ADD_FRIEND) {
            this.redrawChatback = true;
            this.chatbackInputOpen = false;
            this.showSocialInput = true;
            this.socialInput = '';
            this.socialInputType = 1;
            this.socialMessage = 'Enter name of friend to add to list';
        } else if (clientCode === ClientCode.CC_DEL_FRIEND) {
            this.redrawChatback = true;
            this.chatbackInputOpen = false;
            this.showSocialInput = true;
            this.socialInput = '';
            this.socialInputType = 2;
            this.socialMessage = 'Enter name of friend to delete from list';
        } else if (clientCode === ClientCode.CC_LOGOUT) {
            console.warn('[LOGOUT DEBUG] User clicked logout button (CC_LOGOUT) - setting idleTimeout=250');
            this.idleTimeout = 250;
            return true;
        } else if (clientCode === ClientCode.CC_ADD_IGNORE) {
            this.redrawChatback = true;
            this.chatbackInputOpen = false;
            this.showSocialInput = true;
            this.socialInput = '';
            this.socialInputType = 4;
            this.socialMessage = 'Enter name of player to add to list';
        } else if (clientCode === ClientCode.CC_DEL_IGNORE) {
            this.redrawChatback = true;
            this.chatbackInputOpen = false;
            this.showSocialInput = true;
            this.socialInput = '';
            this.socialInputType = 5;
            this.socialMessage = 'Enter name of player to delete from list';
        } else if (clientCode >= ClientCode.CC_CHANGE_HEAD_L && clientCode <= ClientCode.CC_CHANGE_FEET_R) {
            const part: number = ((clientCode - 300) / 2) | 0;
            const direction: number = clientCode & 0x1;
            let kit: number = this.designKits[part];

            if (kit !== -1) {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    if (direction === 0) {
                        kit--;
                        if (kit < 0) {
                            kit = IdkType.count - 1;
                        }
                    }

                    if (direction === 1) {
                        kit++;
                        if (kit >= IdkType.count) {
                            kit = 0;
                        }
                    }

                    if (!IdkType.types[kit].disable && IdkType.types[kit].type === part + (this.designGender ? 0 : 7)) {
                        this.designKits[part] = kit;
                        this.updateDesignModel = true;
                        break;
                    }
                }
            }
        } else if (clientCode >= ClientCode.CC_RECOLOUR_HAIR_L && clientCode <= ClientCode.CC_RECOLOUR_SKIN_R) {
            const part: number = ((clientCode - 314) / 2) | 0;
            const direction: number = clientCode & 0x1;
            let color: number = this.designColours[part];

            if (direction === 0) {
                color--;
                if (color < 0) {
                    color = ClientPlayer.DESIGN_IDK_COLORS[part].length - 1;
                }
            }

            if (direction === 1) {
                color++;
                if (color >= ClientPlayer.DESIGN_IDK_COLORS[part].length) {
                    color = 0;
                }
            }

            this.designColours[part] = color;
            this.updateDesignModel = true;
        } else if (clientCode === ClientCode.CC_SWITCH_TO_MALE && !this.designGender) {
            this.designGender = true;
            this.validateCharacterDesign();
        } else if (clientCode === ClientCode.CC_SWITCH_TO_FEMALE && this.designGender) {
            this.designGender = false;
            this.validateCharacterDesign();
        } else if (clientCode === ClientCode.CC_ACCEPT_DESIGN) {
            this.out.p1isaac(ClientProt.IF_PLAYERDESIGN);
            this.out.p1(this.designGender ? 0 : 1);

            for (let i: number = 0; i < 7; i++) {
                this.out.p1(this.designKits[i]);
            }

            for (let i: number = 0; i < 5; i++) {
                this.out.p1(this.designColours[i]);
            }

            return true;
        } else if (clientCode === ClientCode.CC_MOD_MUTE) {
            this.reportAbuseMuteOption = !this.reportAbuseMuteOption;
        } else if (clientCode >= ClientCode.CC_REPORT_RULE1 && clientCode <= ClientCode.CC_REPORT_RULE12) {
            this.closeInterfaces();

            if (this.reportAbuseInput.length > 0) {
                this.out.p1isaac(ClientProt.REPORT_ABUSE);
                this.out.p8(JString.toBase37(this.reportAbuseInput));
                this.out.p1(clientCode - 601);
                this.out.p1(this.reportAbuseMuteOption ? 1 : 0);
            }
        }

        return false;
    }

    private validateCharacterDesign(): void {
        this.updateDesignModel = true;

        for (let i: number = 0; i < 7; i++) {
            this.designKits[i] = -1;

            for (let j: number = 0; j < IdkType.count; j++) {
                if (!IdkType.types[j].disable && IdkType.types[j].type === i + (this.designGender ? 0 : 7)) {
                    this.designKits[i] = j;
                    break;
                }
            }
        }
    }

    private drawSidebar(): void {
        this.areaSidebar?.bind();
        if (this.areaSidebarOffsets) {
            Pix3D.lineOffset = this.areaSidebarOffsets;
        }

        this.imageInvback?.draw(0, 0);

        if (this.sidebarInterfaceId !== -1) {
            this.drawInterface(Component.types[this.sidebarInterfaceId], 0, 0, 0);
        } else if (this.tabInterfaceId[this.selectedTab] !== -1) {
            this.drawInterface(Component.types[this.tabInterfaceId[this.selectedTab]], 0, 0, 0);
        }

        if (this.menuVisible && this.menuArea === 1) {
            this.drawMenu();
        }

        this.areaSidebar?.draw(553, 205);

        this.areaViewport?.bind();
        if (this.areaViewportOffsets) {
            Pix3D.lineOffset = this.areaViewportOffsets;
        }
    }

    private drawChat(): void {
        this.areaChatback?.bind();
        if (this.areaChatbackOffsets) {
            Pix3D.lineOffset = this.areaChatbackOffsets;
        }

        this.imageChatback?.draw(0, 0);

        if (this.showSocialInput) {
            this.fontBold12?.drawStringCenter(239, 40, this.socialMessage, Colors.BLACK);
            this.fontBold12?.drawStringCenter(239, 60, this.socialInput + '*', Colors.DARKBLUE);
        } else if (this.chatbackInputOpen) {
            this.fontBold12?.drawStringCenter(239, 40, 'Enter amount:', Colors.BLACK);
            this.fontBold12?.drawStringCenter(239, 60, this.chatbackInput + '*', Colors.DARKBLUE);
        } else if (this.modalMessage) {
            this.fontBold12?.drawStringCenter(239, 40, this.modalMessage, Colors.BLACK);
            this.fontBold12?.drawStringCenter(239, 60, 'Click to continue', Colors.DARKBLUE);
        } else if (this.chatInterfaceId !== -1) {
            this.drawInterface(Component.types[this.chatInterfaceId], 0, 0, 0);
        } else if (this.stickyChatInterfaceId !== -1) {
            this.drawInterface(Component.types[this.stickyChatInterfaceId], 0, 0, 0);
        } else {
            let font: PixFont | null = this.fontPlain12;
            let line: number = 0;

            Pix2D.setBounds(0, 0, 463, 77);

            for (let i: number = 0; i < 100; i++) {
                const message: string | null = this.messageText[i];
                if (!message) {
                    continue;
                }

                const type: number = this.messageType[i];
                const y: number = this.chatScrollOffset + 70 - line * 14;

                let sender = this.messageSender[i];
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
                        font?.drawString(4, y, message, Colors.BLACK);
                    }

                    line++;
                } else if ((type === 1 || type === 2) && (type === 1 || this.chatPublicMode === 0 || (this.chatPublicMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        let x = 4;
                        if (modlevel == 1) {
                            this.imageModIcons[0].draw(x, y - 12);
                            x += 14;
                        } else if (modlevel == 2) {
                            this.imageModIcons[1].draw(x, y - 12);
                            x += 14;
                        }

                        font?.drawString(x, y, sender + ':', Colors.BLACK);
                        x += (font?.stringWidth(sender) ?? 0) + 8;

                        font?.drawString(x, y, message, Colors.BLUE);
                    }

                    line++;
                } else if ((type === 3 || type === 7) && this.splitPrivateChat === 0 && (type === 7 || this.chatPrivateMode === 0 || (this.chatPrivateMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        let x = 4;

                        font?.drawString(x, y, 'From ', Colors.BLACK);
                        x += font?.stringWidth('From ') ?? 0;

                        if (modlevel == 1) {
                            this.imageModIcons[0].draw(x, y - 12);
                            x += 14;
                        } else if (modlevel == 2) {
                            this.imageModIcons[1].draw(x, y - 12);
                            x += 14;
                        }

                        font?.drawString(x, y, sender + ':', Colors.BLACK);
                        x += (font?.stringWidth(sender) ?? 0) + 8;

                        font?.drawString(x, y, message, Colors.DARKRED);
                    }

                    line++;
                } else if (type === 4 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        font?.drawString(4, y, sender + ' ' + this.messageText[i], Colors.TRADE_MESSAGE);
                    }

                    line++;
                } else if (type === 5 && this.splitPrivateChat === 0 && this.chatPrivateMode < 2) {
                    if (y > 0 && y < 110) {
                        font?.drawString(4, y, message, Colors.DARKRED);
                    }

                    line++;
                } else if (type === 6 && this.splitPrivateChat === 0 && this.chatPrivateMode < 2) {
                    if (y > 0 && y < 110) {
                        font?.drawString(4, y, 'To ' + sender + ':', Colors.BLACK);
                        font?.drawString(font.stringWidth('To ' + sender) + 12, y, message, Colors.DARKRED);
                    }

                    line++;
                } else if (type === 8 && (this.chatTradeMode === 0 || (this.chatTradeMode === 1 && this.isFriend(sender)))) {
                    if (y > 0 && y < 110) {
                        font?.drawString(4, y, sender + ' ' + this.messageText[i], Colors.DUEL_MESSAGE);
                    }

                    line++;
                }
            }

            Pix2D.resetBounds();

            this.chatScrollHeight = line * 14 + 7;
            if (this.chatScrollHeight < 78) {
                this.chatScrollHeight = 78;
            }

            this.drawScrollbar(463, 0, this.chatScrollHeight - this.chatScrollOffset - 77, this.chatScrollHeight, 77);

            let username;
            if (this.localPlayer == null || this.localPlayer.name == null) {
                username = JString.formatName(this.username);
            } else {
                username = this.localPlayer.name;
            }

            font?.drawString(4, 90, username + ':', Colors.BLACK);
            font?.drawString(font.stringWidth(username + ': ') + 6, 90, this.chatTyped + '*', Colors.BLUE);

            Pix2D.drawHorizontalLine(0, 77, Colors.BLACK, 479);
        }

        if (this.menuVisible && this.menuArea === 2) {
            this.drawMenu();
        }

        this.areaChatback?.draw(17, 357);

        this.areaViewport?.bind();
        if (this.areaViewportOffsets) {
            Pix3D.lineOffset = this.areaViewportOffsets;
        }
    }

    private drawMinimap(): void {
        if (!this.localPlayer) {
            return;
        }

        this.areaMapback?.bind();

        const angle: number = (this.orbitCameraYaw + this.macroMinimapAngle) & 0x7ff;
        let anchorX: number = ((this.localPlayer.x / 32) | 0) + 48;
        let anchorY: number = 464 - ((this.localPlayer.z / 32) | 0);

        this.imageMinimap?.drawRotatedMasked(25, 5, 146, 151, this.minimapMaskLineOffsets, this.minimapMaskLineLengths, anchorX, anchorY, angle, this.macroMinimapZoom + 256);
        this.imageCompass?.drawRotatedMasked(0, 0, 33, 33, this.compassMaskLineOffsets, this.compassMaskLineLengths, 25, 25, this.orbitCameraYaw, 256);

        for (let i: number = 0; i < this.activeMapFunctionCount; i++) {
            anchorX = this.activeMapFunctionX[i] * 4 + 2 - ((this.localPlayer.x / 32) | 0);
            anchorY = this.activeMapFunctionZ[i] * 4 + 2 - ((this.localPlayer.z / 32) | 0);
            this.drawOnMinimap(anchorY, this.activeMapFunctions[i], anchorX);
        }

        for (let ltx: number = 0; ltx < CollisionConstants.SIZE; ltx++) {
            for (let ltz: number = 0; ltz < CollisionConstants.SIZE; ltz++) {
                const stack: LinkList | null = this.objStacks[this.currentLevel][ltx][ltz];
                if (stack) {
                    anchorX = ltx * 4 + 2 - ((this.localPlayer.x / 32) | 0);
                    anchorY = ltz * 4 + 2 - ((this.localPlayer.z / 32) | 0);
                    this.drawOnMinimap(anchorY, this.imageMapdot0, anchorX);
                }
            }
        }

        for (let i: number = 0; i < this.npcCount; i++) {
            const npc: ClientNpc | null = this.npcs[this.npcIds[i]];
            if (npc && npc.isVisible() && npc.type && npc.type.minimap) {
                anchorX = ((npc.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                anchorY = ((npc.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);
                this.drawOnMinimap(anchorY, this.imageMapdot1, anchorX);
            }
        }

        for (let i: number = 0; i < this.playerCount; i++) {
            const player: ClientPlayer | null = this.players[this.playerIds[i]];
            if (player && player.isVisible() && player.name) {
                anchorX = ((player.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                anchorY = ((player.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);

                let friend: boolean = false;
                const name37: bigint = JString.toBase37(player.name);
                for (let j: number = 0; j < this.friendCount; j++) {
                    if (name37 === this.friendName37[j] && this.friendWorld[j] !== 0) {
                        friend = true;
                        break;
                    }
                }

                if (friend) {
                    this.drawOnMinimap(anchorY, this.imageMapdot3, anchorX);
                } else {
                    this.drawOnMinimap(anchorY, this.imageMapdot2, anchorX);
                }
            }
        }

        if (this.hintType != 0 && this.loopCycle % 20 < 10) {
            if (this.hintType == 1 && this.hintNpc >= 0 && this.hintNpc < this.npcs.length) {
                const npc = this.npcs[this.hintNpc];

                if (npc != null) {
                    let x = ((npc.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                    let y = ((npc.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);
                    this.drawMinimapHint(x, y, this.imageMapmarker1);
                }
            } else if (this.hintType == 2) {
                const x = (this.hintTileX - this.sceneBaseTileX) * 4 + 2 - ((this.localPlayer.x / 32) | 0);
                const y = (this.hintTileZ - this.sceneBaseTileZ) * 4 + 2 - ((this.localPlayer.z / 32) | 0);
                this.drawMinimapHint(x, y, this.imageMapmarker1);
            } else if (this.hintType == 10 && this.hintPlayer >= 0 && this.hintPlayer < this.players.length) {
                const player = this.players[this.hintPlayer];

                if (player != null) {
                    const x = ((player.x / 32) | 0) - ((this.localPlayer.x / 32) | 0);
                    const y = ((player.z / 32) | 0) - ((this.localPlayer.z / 32) | 0);
                    this.drawMinimapHint(x, y, this.imageMapmarker1);
                }
            }
        }

        if (this.flagSceneTileX !== 0) {
            anchorX = ((this.flagSceneTileX * 4) + 2) - ((this.localPlayer.x / 32) | 0);
            anchorY = ((this.flagSceneTileZ * 4) + 2) - ((this.localPlayer.z / 32) | 0);
            this.drawOnMinimap(anchorY, this.imageMapmarker0, anchorX);
        }

        // the white square local player position in the center of the minimap.
        Pix2D.fillRect2d(97, 78, 3, 3, Colors.WHITE);

        this.areaViewport?.bind();
    }

    drawMinimapHint(dx: number, dy: number, image: Pix32 | null) {
        if (!image) {
            return;
        }

        const distance = dx * dx + dy * dy;
        if (distance <= 4225 || distance >= 90000) {
            this.drawOnMinimap(dy, image, dx);
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

        this.imageMapedge?.drawRotated(83 - var16 - 20, var13, 256, 15, 15, 20, 20, var15 + 94 + 4 - 10);
    }

    private drawOnMinimap(dy: number, image: Pix32 | null, dx: number): void {
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

        if (distance > 2500 && this.imageMapback) {
            image.drawMasked(x + 94 - ((image.width / 2) | 0) + 4, 83 - y - ((image.height / 2) | 0) - 4, this.imageMapback);
        } else {
            image.draw(x + 94 - ((image.width / 2) | 0) + 4, 83 - y - ((image.height / 2) | 0) - 4);
        }
    }

    private addMessage(type: number, text: string, sender: string): void {
        if (type === 0 && this.stickyChatInterfaceId !== -1) {
            this.modalMessage = text;
            this.mouseClickButton = 0;
        }

        if (this.chatInterfaceId === -1) {
            this.redrawChatback = true;
        }

        for (let i: number = 99; i > 0; i--) {
            this.messageType[i] = this.messageType[i - 1];
            this.messageSender[i] = this.messageSender[i - 1];
            this.messageText[i] = this.messageText[i - 1];
            this.messageTick[i] = this.messageTick[i - 1];
        }

        this.messageType[0] = type;
        this.messageSender[0] = sender;
        this.messageText[0] = text;
        this.messageTick[0] = this.loopCycle;
    }

    private isFriend(username: string | null): boolean {
        if (!username) {
            return false;
        }

        for (let i: number = 0; i < this.friendCount; i++) {
            if (username.toLowerCase() === this.friendName[i]?.toLowerCase()) {
                return true;
            }
        }

        if (!this.localPlayer) {
            return false;
        }

        return username.toLowerCase() === this.localPlayer.name?.toLowerCase();
    }

    private addFriend(username: bigint): void {
        if (username === 0n) {
            return;
        }

        if (this.friendCount >= 100 && this.membersAccount != 1) {
            this.addMessage(0, 'Your friendlist is full. Max of 100 for free users, and 200 for members', '');
            return;
        } else if (this.friendCount >= 200) {
            this.addMessage(0, 'Your friendlist is full. Max of 100 for free users, and 200 for members', '');
            return;
        }

        const displayName: string = JString.formatName(JString.fromBase37(username));
        for (let i: number = 0; i < this.friendCount; i++) {
            if (this.friendName37[i] === username) {
                this.addMessage(0, displayName + ' is already on your friend list', '');
                return;
            }
        }

        for (let i: number = 0; i < this.ignoreCount; i++) {
            if (this.ignoreName37[i] === username) {
                this.addMessage(0, 'Please remove ' + displayName + ' from your ignore list first', '');
                return;
            }
        }

        if (!this.localPlayer || !this.localPlayer.name) {
            return;
        }

        if (displayName !== this.localPlayer.name) {
            this.friendName[this.friendCount] = displayName;
            this.friendName37[this.friendCount] = username;
            this.friendWorld[this.friendCount] = 0;
            this.friendCount++;

            this.redrawSidebar = true;

            this.out.p1isaac(ClientProt.FRIENDLIST_ADD);
            this.out.p8(username);
        }
    }

    private removeFriend(username: bigint): void {
        if (username === 0n) {
            return;
        }

        for (let i: number = 0; i < this.friendCount; i++) {
            if (this.friendName37[i] === username) {
                this.friendCount--;
                this.redrawSidebar = true;

                for (let j: number = i; j < this.friendCount; j++) {
                    this.friendName[j] = this.friendName[j + 1];
                    this.friendWorld[j] = this.friendWorld[j + 1];
                    this.friendName37[j] = this.friendName37[j + 1];
                }

                this.out.p1isaac(ClientProt.FRIENDLIST_DEL);
                this.out.p8(username);
                return;
            }
        }
    }

    private addIgnore(username: bigint): void {
        if (username === 0n) {
            return;
        }

        if (this.ignoreCount >= 100) {
            this.addMessage(0, 'Your ignore list is full. Max of 100 hit', '');
            return;
        }

        const displayName: string = JString.formatName(JString.fromBase37(username));
        for (let i: number = 0; i < this.ignoreCount; i++) {
            if (this.ignoreName37[i] === username) {
                this.addMessage(0, displayName + ' is already on your ignore list', '');
                return;
            }
        }

        for (let i: number = 0; i < this.friendCount; i++) {
            if (this.friendName37[i] === username) {
                this.addMessage(0, 'Please remove ' + displayName + ' from your friend list first', '');
                return;
            }
        }

        this.ignoreName37[this.ignoreCount++] = username;
        this.redrawSidebar = true;

        this.out.p1isaac(ClientProt.IGNORELIST_ADD);
        this.out.p8(username);
    }

    private removeIgnore(username: bigint): void {
        if (username === 0n) {
            return;
        }

        for (let i: number = 0; i < this.ignoreCount; i++) {
            if (this.ignoreName37[i] === username) {
                this.ignoreCount--;
                this.redrawSidebar = true;

                for (let j: number = i; j < this.ignoreCount; j++) {
                    this.ignoreName37[j] = this.ignoreName37[j + 1];
                }

                this.out.p1isaac(ClientProt.IGNORELIST_DEL);
                this.out.p8(username);
                return;
            }
        }
    }

    private unloadTitle(): void {
        this.flameActive = false;

        if (this.flamesInterval) {
            clearInterval(this.flamesInterval);
            this.flamesInterval = null;
        }

        this.imageTitlebox = null;
        this.imageTitlebutton = null;
        this.imageRunes = [];

        this.flameGradient = null;
        this.flameGradient0 = null;
        this.flameGradient1 = null;
        this.flameGradient2 = null;

        this.flameBuffer0 = null;
        this.flameBuffer1 = null;
        this.flameBuffer3 = null;
        this.flameBuffer2 = null;

        this.imageFlamesLeft = null;
        this.imageFlamesRight = null;
    }

    runFlames(): void {
        if (!this.flameActive) {
            return;
        }

        this.flameCycle++;

        this.updateFlames();
        this.updateFlames();
        this.drawFlames();
    }

    private updateFlames(): void {
        if (!this.flameBuffer3 || !this.flameBuffer2 || !this.flameBuffer0 || !this.flameLineOffset) {
            return;
        }

        const height: number = 256;

        for (let x: number = 10; x < 117; x++) {
            const rand: number = (Math.random() * 100.0) | 0;
            if (rand < 50) this.flameBuffer3[x + ((height - 2) << 7)] = 255;
        }

        for (let l: number = 0; l < 100; l++) {
            const x: number = ((Math.random() * 124.0) | 0) + 2;
            const y: number = ((Math.random() * 128.0) | 0) + 128;
            const index: number = x + (y << 7);
            this.flameBuffer3[index] = 192;
        }

        for (let y: number = 1; y < height - 1; y++) {
            for (let x: number = 1; x < 127; x++) {
                const index: number = x + (y << 7);
                this.flameBuffer2[index] = ((this.flameBuffer3[index - 1] + this.flameBuffer3[index + 1] + this.flameBuffer3[index - 128] + this.flameBuffer3[index + 128]) / 4) | 0;
            }
        }

        this.flameCycle0 += 128;
        if (this.flameCycle0 > this.flameBuffer0.length) {
            this.flameCycle0 -= this.flameBuffer0.length;
            this.updateFlameBuffer(this.imageRunes[(Math.random() * 12.0) | 0]);
        }

        for (let y: number = 1; y < height - 1; y++) {
            for (let x: number = 1; x < 127; x++) {
                const index: number = x + (y << 7);
                let intensity: number = this.flameBuffer2[index + 128] - ((this.flameBuffer0[(index + this.flameCycle0) & (this.flameBuffer0.length - 1)] / 5) | 0);
                if (intensity < 0) {
                    intensity = 0;
                }
                this.flameBuffer3[index] = intensity;
            }
        }

        for (let y: number = 0; y < height - 1; y++) {
            this.flameLineOffset[y] = this.flameLineOffset[y + 1];
        }

        this.flameLineOffset[height - 1] = (Math.sin(this.loopCycle / 14.0) * 16.0 + Math.sin(this.loopCycle / 15.0) * 14.0 + Math.sin(this.loopCycle / 16.0) * 12.0) | 0;

        if (this.flameGradientCycle0 > 0) {
            this.flameGradientCycle0 -= 4;
        }

        if (this.flameGradientCycle1 > 0) {
            this.flameGradientCycle1 -= 4;
        }

        if (this.flameGradientCycle0 === 0 && this.flameGradientCycle1 === 0) {
            const rand: number = (Math.random() * 2000.0) | 0;

            if (rand === 0) {
                this.flameGradientCycle0 = 1024;
            } else if (rand === 1) {
                this.flameGradientCycle1 = 1024;
            }
        }
    }

    private updateFlameBuffer(image: Pix8 | null): void {
        if (!this.flameBuffer0 || !this.flameBuffer1) {
            return;
        }

        const flameHeight: number = 256;

        // Clears the initial flame buffer
        this.flameBuffer0.fill(0);

        // Blends the fire at random
        for (let i: number = 0; i < 5000; i++) {
            const rand: number = (Math.random() * 128.0 * flameHeight) | 0;
            this.flameBuffer0[rand] = (Math.random() * 256.0) | 0;
        }

        // changes color between last few flames
        for (let i: number = 0; i < 20; i++) {
            for (let y: number = 1; y < flameHeight - 1; y++) {
                for (let x: number = 1; x < 127; x++) {
                    const index: number = x + (y << 7);
                    this.flameBuffer1[index] = ((this.flameBuffer0[index - 1] + this.flameBuffer0[index + 1] + this.flameBuffer0[index - 128] + this.flameBuffer0[index + 128]) / 4) | 0;
                }
            }

            const last: Int32Array = this.flameBuffer0;
            this.flameBuffer0 = this.flameBuffer1;
            this.flameBuffer1 = last;
        }

        // Renders the rune images
        if (image) {
            let off: number = 0;

            for (let y: number = 0; y < image.height2d; y++) {
                for (let x: number = 0; x < image.width2d; x++) {
                    if (image.pixels[off++] !== 0) {
                        const x0: number = x + image.cropX + 16;
                        const y0: number = y + image.cropY + 16;
                        const index: number = x0 + (y0 << 7);
                        this.flameBuffer0[index] = 0;
                    }
                }
            }
        }
    }

    private drawFlames(): void {
        if (!this.flameGradient || !this.flameGradient0 || !this.flameGradient1 || !this.flameGradient2 || !this.flameLineOffset || !this.flameBuffer3) {
            return;
        }

        const height: number = 256;

        // just colors
        if (this.flameGradientCycle0 > 0) {
            for (let i: number = 0; i < 256; i++) {
                if (this.flameGradientCycle0 > 768) {
                    this.flameGradient[i] = this.mix(this.flameGradient0[i], 1024 - this.flameGradientCycle0, this.flameGradient1[i]);
                } else if (this.flameGradientCycle0 > 256) {
                    this.flameGradient[i] = this.flameGradient1[i];
                } else {
                    this.flameGradient[i] = this.mix(this.flameGradient1[i], 256 - this.flameGradientCycle0, this.flameGradient0[i]);
                }
            }
        } else if (this.flameGradientCycle1 > 0) {
            for (let i: number = 0; i < 256; i++) {
                if (this.flameGradientCycle1 > 768) {
                    this.flameGradient[i] = this.mix(this.flameGradient0[i], 1024 - this.flameGradientCycle1, this.flameGradient2[i]);
                } else if (this.flameGradientCycle1 > 256) {
                    this.flameGradient[i] = this.flameGradient2[i];
                } else {
                    this.flameGradient[i] = this.mix(this.flameGradient2[i], 256 - this.flameGradientCycle1, this.flameGradient0[i]);
                }
            }
        } else {
            for (let i: number = 0; i < 256; i++) {
                this.flameGradient[i] = this.flameGradient0[i];
            }
        }

        for (let i: number = 0; i < 33920; i++) {
            if (this.imageTitle0 && this.imageFlamesLeft) this.imageTitle0.pixels[i] = this.imageFlamesLeft.pixels[i];
        }

        let srcOffset: number = 0;
        let dstOffset: number = 1152;

        for (let y: number = 1; y < height - 1; y++) {
            const offset: number = ((this.flameLineOffset[y] * (height - y)) / height) | 0;

            let step: number = offset + 22;
            if (step < 0) {
                step = 0;
            }

            srcOffset += step;

            for (let x: number = step; x < 128; x++) {
                let value: number = this.flameBuffer3[srcOffset++];
                if (value === 0) {
                    dstOffset++;
                } else {
                    const alpha: number = value;
                    const invAlpha: number = 256 - value;
                    value = this.flameGradient[value];

                    if (this.imageTitle0) {
                        const background: number = this.imageTitle0.pixels[dstOffset];
                        this.imageTitle0.pixels[dstOffset++] = ((((value & 0xff00ff) * alpha + (background & 0xff00ff) * invAlpha) & 0xff00ff00) + (((value & 0xff00) * alpha + (background & 0xff00) * invAlpha) & 0xff0000)) >> 8;
                    }
                }
            }
            dstOffset += step;
        }

        this.imageTitle0?.draw(0, 0);

        for (let i: number = 0; i < 33920; i++) {
            if (this.imageTitle1 && this.imageFlamesRight) {
                this.imageTitle1.pixels[i] = this.imageFlamesRight.pixels[i];
            }
        }

        srcOffset = 0;
        dstOffset = 1176;

        for (let y: number = 1; y < height - 1; y++) {
            const offset: number = ((this.flameLineOffset[y] * (height - y)) / height) | 0;

            const step: number = 103 - offset;
            dstOffset += offset;

            for (let x: number = 0; x < step; x++) {
                let value: number = this.flameBuffer3[srcOffset++];
                if (value === 0) {
                    dstOffset++;
                } else {
                    const alpha: number = value;
                    const invAlpha: number = 256 - value;
                    value = this.flameGradient[value];

                    if (this.imageTitle1) {
                        const background: number = this.imageTitle1.pixels[dstOffset];
                        this.imageTitle1.pixels[dstOffset++] = ((((value & 0xff00ff) * alpha + (background & 0xff00ff) * invAlpha) & 0xff00ff00) + (((value & 0xff00) * alpha + (background & 0xff00) * invAlpha) & 0xff0000)) >> 8;
                    }
                }
            }

            srcOffset += 128 - step;
            dstOffset += 128 - step - offset;
        }

        this.imageTitle1?.draw(637, 0);

        if (this.isMobile) {
            MobileKeyboard.draw();
        }
    }

    private mix(src: number, alpha: number, dst: number): number {
        const invAlpha: number = 256 - alpha;
        return ((((src & 0xff00ff) * invAlpha + (dst & 0xff00ff) * alpha) & 0xff00ff00) + (((src & 0xff00) * invAlpha + (dst & 0xff00) * alpha) & 0xff0000)) >> 8;
    }

    // ----

    getTitleScreenState(): number {
        return this.titleScreenState;
    }

    isChatBackInputOpen(): boolean {
        return this.chatbackInputOpen;
    }

    isShowSocialInput(): boolean {
        return this.showSocialInput;
    }

    getChatInterfaceId(): number {
        return this.chatInterfaceId;
    }

    getViewportInterfaceId(): number {
        return this.viewportInterfaceId;
    }

    getReportAbuseInterfaceId(): number {
        // custom: for report abuse input on mobile
        return this.reportAbuseInterfaceId;
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
