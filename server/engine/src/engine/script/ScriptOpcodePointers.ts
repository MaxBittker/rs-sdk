import { ScriptOpcode } from '#/engine/script/ScriptOpcode.js';

const POINTER_GROUP_FIND = ['find_player', 'find_npc', 'find_loc', 'find_obj', 'find_db'];

const ScriptOpcodePointers: {
    [key: number]: {
        require?: string[];
        set?: string[];
        corrupt?: string[];
        require2?: string[];
        set2?: string[];
        corrupt2?: string[];
        conditional?: boolean;
    };
} = {
    // Player ops
    [ScriptOpcode.ALLOWDESIGN]: {
        require: ['active_player']
    },
    [ScriptOpcode.ANIM]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.READYANIM]: {
        require: ['active_player']
    },
    [ScriptOpcode.RUNANIM]: {
        require: ['active_player']
    },
    [ScriptOpcode.TURNANIM]: {
        require: ['active_player']
    },
    [ScriptOpcode.WALKANIM_B]: {
        require: ['active_player']
    },
    [ScriptOpcode.WALKANIM]: {
        require: ['active_player']
    },
    [ScriptOpcode.WALKANIM_L]: {
        require: ['active_player']
    },
    [ScriptOpcode.WALKANIM_R]: {
        require: ['active_player']
    },
    [ScriptOpcode.BUILDAPPEARANCE]: {
        require: ['active_player']
    },
    [ScriptOpcode.BUSY]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.BUSY2]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.CAM_LOOKAT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.CAM_MOVETO]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.CAM_RESET]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.CAM_SHAKE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.CLEARQUEUE]: {
        require: ['active_player']
    },
    [ScriptOpcode.CLEARSOFTTIMER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.CLEARTIMER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.GETTIMER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.COORD]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.DAMAGE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.DISPLAYNAME]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.FACESQUARE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.FINDUID]: {
        set: ['active_player'],
        set2: ['active_player2'],
        corrupt: ['p_active_player'],
        corrupt2: ['p_active_player2'],
        conditional: true
    },
    [ScriptOpcode.GENDER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.GETQUEUE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_ADVANCE]: {
        require: ['active_player']
    },
    [ScriptOpcode.HEADICONS_GET]: {
        require: ['active_player']
    },
    [ScriptOpcode.HEADICONS_SET]: {
        require: ['active_player']
    },
    [ScriptOpcode.HEALENERGY]: {
        require: ['active_player']
    },
    [ScriptOpcode.HINT_COORD]: {
        require: ['active_player']
    },
    [ScriptOpcode.HINT_NPC]: {
        require: ['active_player', 'active_npc']
    },
    [ScriptOpcode.HINT_PL]: {
        require: ['active_player', 'active_player2']
    },
    [ScriptOpcode.HINT_STOP]: {
        require: ['active_player']
    },
    [ScriptOpcode.HUNTALL]: {
        set: ['find_player']
    },
    [ScriptOpcode.HUNTNEXT]: {
        require: ['find_player'],
        require2: ['find_player'],
        set: ['active_player'],
        set2: ['active_player2'],
        conditional: true
    },
    [ScriptOpcode.NPC_HUNT]: {
        set: ['active_npc'],
        set2: ['active_npc2']
    },
    [ScriptOpcode.NPC_HUNTALL]: {
        set: ['find_npc']
    },
    [ScriptOpcode.NPC_HASOP]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.IF_CLOSE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.TUT_CLOSE]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_OPENCHAT]: {
        require: ['active_player']
    },
    [ScriptOpcode.TUT_OPEN]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_OPENMAIN]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.IF_OPENMAIN_SIDE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.IF_OPENOVERLAY]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.IF_OPENSIDE]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETANIM]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETCOLOUR]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETHIDE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.IF_SETMODEL]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETNPCHEAD]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETOBJECT]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETPLAYERHEAD]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETPOSITION]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_ADDRESUMEBUTTON]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETTAB]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETTABACTIVE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.TUT_FLASH]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETTEXT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.LAST_LOGIN_INFO]: {
        require: ['active_player']
    },
    [ScriptOpcode.LAST_COM]: {
        require: ['last_com']
    },
    [ScriptOpcode.LAST_INT]: {
        require: ['last_int']
    },
    [ScriptOpcode.LAST_ITEM]: {
        require: ['last_item']
    },
    [ScriptOpcode.LAST_SLOT]: {
        require: ['last_slot']
    },
    [ScriptOpcode.LAST_TARGETSLOT]: {
        require: ['last_targetslot']
    },
    [ScriptOpcode.LAST_USEITEM]: {
        require: ['last_useitem']
    },
    [ScriptOpcode.LAST_USESLOT]: {
        require: ['last_useslot']
    },
    [ScriptOpcode.LONGQUEUE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.LONGQUEUEVARARG]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.LOWMEM]: {
        require: ['active_player']
    },
    [ScriptOpcode.MES]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.MIDI_JINGLE]: {
        require: ['active_player']
    },
    [ScriptOpcode.MIDI_SONG]: {
        require: ['active_player']
    },
    [ScriptOpcode.MINIMAP_TOGGLE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.NAME]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.P_APRANGE]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_ARRIVEDELAY]: {
        require: ['p_active_player'],
        corrupt: [
            // everything except active is assumed corrupted
            ...POINTER_GROUP_FIND,
            'last_com',
            'last_int',
            'last_item',
            'last_slot',
            'last_targetslot',
            'last_useitem',
            'last_useslot'
        ]
    },
    [ScriptOpcode.P_COUNTDIALOG]: {
        require: ['p_active_player'],
        set: ['last_int'],
        corrupt: [
            // everything except active is assumed corrupted
            ...POINTER_GROUP_FIND,
            'last_com',
            'last_item',
            'last_slot',
            'last_targetslot',
            'last_useitem',
            'last_useslot'
        ]
    },
    [ScriptOpcode.P_DELAY]: {
        require: ['p_active_player'],
        corrupt: [
            // everything except active is assumed corrupted
            ...POINTER_GROUP_FIND,
            'last_com',
            'last_int',
            'last_item',
            'last_slot',
            'last_targetslot',
            'last_useitem',
            'last_useslot'
        ]
    },
    [ScriptOpcode.P_EXACTMOVE]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_FINDUID]: {
        set: ['p_active_player', 'active_player'],
        set2: ['p_active_player2', 'active_player2'],
        conditional: true
    },
    [ScriptOpcode.P_LOCMERGE]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_LOGOUT]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_PREVENTLOGOUT]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.P_OPHELD]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_OPLOC]: {
        require: ['p_active_player', 'active_loc']
    },
    [ScriptOpcode.P_OPNPC]: {
        require: ['p_active_player', 'active_npc']
    },
    [ScriptOpcode.P_OPNPCT]: {
        require: ['p_active_player', 'active_npc']
    },
    [ScriptOpcode.P_OPOBJ]: {
        require: ['p_active_player', 'active_obj']
    },
    [ScriptOpcode.P_OPPLAYER]: {
        require: ['p_active_player', 'active_player2'],
        require2: ['p_active_player2', 'active_player']
    },
    [ScriptOpcode.P_OPPLAYERT]: {
        require: ['p_active_player', 'active_player2'],
        require2: ['p_active_player2', 'active_player']
    },
    [ScriptOpcode.P_PAUSEBUTTON]: {
        require: ['p_active_player'],
        set: ['last_com'],
        corrupt: [
            // everything except active is assumed corrupted
            ...POINTER_GROUP_FIND,
            'last_int',
            'last_item',
            'last_slot',
            'last_targetslot',
            'last_useitem',
            'last_useslot'
        ]
    },
    [ScriptOpcode.P_STOPACTION]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.P_CLEARPENDINGACTION]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.P_TELEJUMP]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.P_TELEPORT]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.P_WALK]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.PROJANIM_PL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.QUEUE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.QUEUEVARARG]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.SAY]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.SETIDKIT]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.WALKTRIGGER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.GETWALKTRIGGER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.SETTIMER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.SOFTTIMER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.SOUND_SYNTH]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.SPOTANIM_PL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAFFMODLEVEL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_ADD]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_BASE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_HEAL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_SUB]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_BOOST]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_DRAIN]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STAT_RANDOM]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.UID]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.WEAKQUEUE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.WEAKQUEUEVARARG]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.FINDHERO]: {
        set: ['active_player2'],
        set2: ['active_player'],
        conditional: true
    },
    [ScriptOpcode.BOTH_HEROPOINTS]: {
        require: ['active_player', 'active_player2'],
        require2: ['active_player2', 'active_player']
    },
    [ScriptOpcode.SETGENDER]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.SETIDKCOLOUR]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_ANIMPROTECT]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.RUNENERGY]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.WEIGHT]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.P_RUN]: {
        require: ['p_active_player'],
        require2: ['p_active_player2']
    },
    [ScriptOpcode.IF_SETSCROLLPOS]: {
        require: ['active_player']
    },
    [ScriptOpcode.SET_PLAYER_OP]: {
        require: ['active_player']
    },
    [ScriptOpcode.SET_SKILL_LEVEL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STRONGQUEUE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.STRONGQUEUEVARARG]: {
        require: ['active_player'],
        require2: ['active_player2']
    },

    // Npc ops
    [ScriptOpcode.NPC_ADD]: {
        set: ['active_npc'],
        set2: ['active_npc2']
    },
    [ScriptOpcode.NPC_ANIM]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_BASESTAT]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_CATEGORY]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_CHANGETYPE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_CHANGETYPE_KEEPALL]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_COORD]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_DAMAGE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_DEL]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_DELAY]: {
        require: ['active_npc'],
        corrupt: ['p_active_player', 'p_active_player2', ...POINTER_GROUP_FIND, 'last_com', 'last_int', 'last_item', 'last_slot', 'last_targetslot', 'last_useitem', 'last_useslot'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_FACESQUARE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_FIND]: {
        set: ['active_npc'],
        set2: ['active_npc2'],
        conditional: true
    },
    [ScriptOpcode.NPC_FINDCAT]: {
        set: ['active_npc'],
        set2: ['active_npc2'],
        conditional: true
    },
    [ScriptOpcode.NPC_FINDALLANY]: {
        set: ['find_npc']
    },
    [ScriptOpcode.NPC_FINDALL]: {
        set: ['find_npc']
    },
    [ScriptOpcode.NPC_FINDALLZONE]: {
        set: ['find_npc']
    },
    [ScriptOpcode.NPC_FINDNEXT]: {
        require: ['find_npc'],
        set: ['active_npc'],
        set2: ['active_npc2'],
        conditional: true
    },
    [ScriptOpcode.NPC_FINDEXACT]: {
        set: ['active_npc'],
        set2: ['active_npc2'],
        conditional: true
    },
    [ScriptOpcode.NPC_FINDHERO]: {
        require: ['active_npc'],
        require2: ['active_npc2'],
        set: ['active_player'],
        set2: ['active_player2'],
        conditional: true
    },
    [ScriptOpcode.NPC_FINDUID]: {
        set: ['active_npc'],
        set2: ['active_npc2'],
        conditional: true
    },
    [ScriptOpcode.NPC_GETMODE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_HEROPOINTS]: {
        require: ['active_npc', 'active_player']
    },
    [ScriptOpcode.NPC_NAME]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_PARAM]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_QUEUE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_RANGE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_SAY]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETHUNT]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETHUNTMODE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETMODE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_WALKTRIGGER]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETTIMER]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_STAT]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_STATADD]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_STATHEAL]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_STATSUB]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_TELE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_TYPE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_UID]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.PROJANIM_NPC]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.SPOTANIM_NPC]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_WALK]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_ATTACKRANGE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_ARRIVEDELAY]: {
        require: ['active_npc'],
        corrupt: ['p_active_player', 'p_active_player2', ...POINTER_GROUP_FIND, 'last_com', 'last_int', 'last_item', 'last_slot', 'last_targetslot', 'last_useitem', 'last_useslot'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_INRANGE]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },
    [ScriptOpcode.NPC_DESTINATION]: {
        require: ['active_npc'],
        require2: ['active_npc2']
    },

    // Loc ops
    [ScriptOpcode.LOC_ADD]: {
        set: ['active_loc'],
        set2: ['active_loc2']
    },
    [ScriptOpcode.LOC_ANGLE]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_ANIM]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_CATEGORY]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_CHANGE]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_COORD]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_DEL]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_FIND]: {
        set: ['active_loc'],
        set2: ['active_loc2'],
        conditional: true
    },
    [ScriptOpcode.LOC_FINDALLZONE]: {
        set: ['find_loc'],
        set2: ['find_loc']
    },
    [ScriptOpcode.LOC_FINDNEXT]: {
        require: ['find_loc'],
        set: ['active_loc'],
        require2: ['find_loc'],
        set2: ['active_loc2'],
        conditional: true
    },
    [ScriptOpcode.LOC_NAME]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_PARAM]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_SHAPE]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },
    [ScriptOpcode.LOC_TYPE]: {
        require: ['active_loc'],
        require2: ['active_loc2']
    },

    // Obj ops
    [ScriptOpcode.OBJ_ADD]: {
        require: ['active_player'],
        set: ['active_obj'],
        require2: ['active_player2'],
        set2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_ADDALL]: {
        set: ['active_obj'],
        set2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_COORD]: {
        require: ['active_obj'],
        require2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_COUNT]: {
        require: ['active_obj'],
        require2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_DEL]: {
        require: ['active_obj'],
        require2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_NAME]: {
        require: ['active_obj'],
        require2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_PARAM]: {
        require: ['active_obj'],
        require2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_TAKEITEM]: {
        require: ['active_obj', 'active_player'],
        require2: ['active_obj2', 'active_player2']
    },
    [ScriptOpcode.OBJ_TYPE]: {
        require: ['active_obj'],
        require2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_FIND]: {
        set: ['active_obj'],
        set2: ['active_obj2']
    },
    [ScriptOpcode.OBJ_FINDALLZONE]: {
        set: ['find_obj'],
        set2: ['find_obj']
    },
    [ScriptOpcode.OBJ_FINDNEXT]: {
        require: ['find_obj'],
        set: ['active_obj'],
        require2: ['find_obj'],
        set2: ['active_obj2'],
        conditional: true
    },

    // Inventory ops
    [ScriptOpcode.INV_ADD]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_CHANGESLOT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_CLEAR]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_DEL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_DELSLOT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_DROPITEM]: {
        require: ['active_player'],
        set: ['active_obj'],
        require2: ['active_player2'],
        set2: ['active_obj2']
    },
    [ScriptOpcode.INV_DROPITEM_DELAYED]: {
        require: ['active_player'],
        set: ['active_obj'],
        require2: ['active_player2'],
        set2: ['active_obj2']
    },
    [ScriptOpcode.INV_DROPSLOT]: {
        require: ['active_player'],
        set: ['active_obj'],
        require2: ['active_player2'],
        set2: ['active_obj2']
    },
    [ScriptOpcode.INV_FREESPACE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_GETNUM]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_GETOBJ]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_ITEMSPACE]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_ITEMSPACE2]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_MOVEFROMSLOT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_MOVETOSLOT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.BOTH_MOVEINV]: {
        require: ['active_player', 'active_player2'],
        require2: ['active_player2', 'active_player']
    },
    [ScriptOpcode.INV_MOVEITEM]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_MOVEITEM_CERT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_MOVEITEM_UNCERT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_SETSLOT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_TOTAL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_TOTALCAT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_TRANSMIT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INVOTHER_TRANSMIT]: {
        require: ['active_player', 'active_player2'],
        require2: ['active_player2', 'active_player']
    },
    [ScriptOpcode.INV_STOPTRANSMIT]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.BOTH_DROPSLOT]: {
        require: ['active_player', 'active_player2'],
        require2: ['active_player2', 'active_player']
    },
    [ScriptOpcode.INV_DROPALL]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_TOTALPARAM]: {
        require: ['active_player'],
        require2: ['active_player2']
    },
    [ScriptOpcode.INV_TOTALPARAM_STACK]: {
        require: ['active_player'],
        require2: ['active_player2']
    },

    // String ops
    [ScriptOpcode.TEXT_GENDER]: {
        require: ['active_player'],
        require2: ['active_player2']
    },

    // DB ops
    [ScriptOpcode.DB_FINDNEXT]: {
        require: ['find_db']
    },
    [ScriptOpcode.DB_FIND]: {
        set: ['find_db']
    },
    [ScriptOpcode.DB_FIND_REFINE]: {
        require: ['find_db']
    },
    [ScriptOpcode.DB_LISTALL]: {
        set: ['find_db']
    },
    [ScriptOpcode.DB_LISTALL_WITH_COUNT]: {
        set: ['find_db']
    }
};

export default ScriptOpcodePointers;
