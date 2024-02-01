import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';

const ScriptOpcodePointers: {
    [key: string]: {
        require?: string[];
        corrupt?: string[];
        set?: string[];
        conditional?: boolean;
        secondary?: boolean;
        secondaryRequire?: string[];
    };
} = {
    // Core language ops
    [ScriptOpcode.PUSH_VARP]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.POP_VARP]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.PUSH_VARN]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.POP_VARN]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },

    // Player ops
    [ScriptOpcode.ALLOWDESIGN]: {
        require: ['active_player']
    },
    [ScriptOpcode.ANIM]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.BAS_READYANIM]: {
        require: ['active_player']
    },
    [ScriptOpcode.BAS_RUNNING]: {
        require: ['active_player']
    },
    [ScriptOpcode.BAS_TURNONSPOT]: {
        require: ['active_player']
    },
    [ScriptOpcode.BAS_WALK_B]: {
        require: ['active_player']
    },
    [ScriptOpcode.BAS_WALK_F]: {
        require: ['active_player']
    },
    [ScriptOpcode.BAS_WALK_L]: {
        require: ['active_player']
    },
    [ScriptOpcode.BAS_WALK_R]: {
        require: ['active_player']
    },
    [ScriptOpcode.BUFFER_FULL]: {
        require: ['active_player']
    },
    [ScriptOpcode.BUSY]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.CAM_LOOKAT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.CAM_MOVETO]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.CAM_RESET]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.CAM_SHAKE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.CLEARQUEUE]: {
        require: ['active_player']
    },
    [ScriptOpcode.CLEARSOFTTIMER]: {
        require: ['active_player']
    },
    [ScriptOpcode.CLEARTIMER]: {
        require: ['active_player']
    },
    [ScriptOpcode.COORD]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.DAMAGE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.DISPLAYNAME]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.FACESQUARE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.FINDUID]: {
        set: ['active_player'],
        conditional: true,
        secondary: true
    },
    [ScriptOpcode.GENDER]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.GETQUEUE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.GIVEXP]: {
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
    [ScriptOpcode.HINT_PLAYER]: {
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
        set: ['active_player'],
        conditional: true,
        secondary: true
    },
    [ScriptOpcode.IF_CLOSE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.IF_CLOSESTICKY]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_MULTIZONE]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_OPENCHAT]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_OPENCHATSTICKY]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_OPENMAINMODAL]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.IF_OPENMAINMODALSIDEOVERLAY]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.IF_OPENSIDEOVERLAY]: {
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
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.IF_SETMODEL]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETRECOL]: {
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
    [ScriptOpcode.IF_SETRESUMEBUTTONS]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETTAB]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETTABACTIVE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.IF_SETTABFLASH]: {
        require: ['active_player']
    },
    [ScriptOpcode.IF_SETTEXT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.LAST_LOGIN_INFO]: {
        require: ['active_player']
    },
    [ScriptOpcode.LAST_COM]: {
        require: ['active_player', 'last_com']
    },
    [ScriptOpcode.LAST_INT]: {
        require: ['active_player', 'last_int']
    },
    [ScriptOpcode.LAST_ITEM]: {
        require: ['active_player', 'last_item']
    },
    [ScriptOpcode.LAST_SLOT]: {
        require: ['active_player', 'last_slot']
    },
    [ScriptOpcode.LAST_TARGETSLOT]: {
        require: ['active_player', 'last_targetslot']
    },
    [ScriptOpcode.LAST_USEITEM]: {
        require: ['active_player', 'last_useitem']
    },
    [ScriptOpcode.LAST_USESLOT]: {
        require: ['active_player', 'last_useslot']
    },
    [ScriptOpcode.LONGQUEUE]: {
        require: ['active_player']
    },
    [ScriptOpcode.MES]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.MIDI_JINGLE]: {
        require: ['active_player']
    },
    [ScriptOpcode.MIDI_SONG]: {
        require: ['active_player']
    },
    [ScriptOpcode.NAME]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.P_APRANGE]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_ARRIVEDELAY]: {
        require: ['p_active_player'],
        corrupt: [
            // everything except active is assumed corrupted
            'find_player',
            'find_npc',
            'find_loc',
            'find_obj',
            'find_db',
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
            'find_player',
            'find_npc',
            'find_loc',
            'find_obj',
            'find_db',
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
            'find_player',
            'find_npc',
            'find_loc',
            'find_obj',
            'find_db',
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
        set: ['p_active_player'],
        conditional: true,
        secondary: true
    },
    [ScriptOpcode.P_LOCMERGE]: {
        require: ['p_active_player']
    },
    [ScriptOpcode.P_LOGOUT]: {
        require: ['p_active_player']
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
    [ScriptOpcode.P_OPOBJ]: {
        require: ['p_active_player', 'active_obj']
    },
    [ScriptOpcode.P_OPPLAYER]: {
        require: ['p_active_player', 'active_player2'],
        secondary: true,
        secondaryRequire: ['p_active_player2', 'active_player']
    },
    [ScriptOpcode.P_PAUSEBUTTON]: {
        require: ['p_active_player'],
        corrupt: [
            // everything except active is assumed corrupted
            'find_player',
            'find_npc',
            'find_loc',
            'find_obj',
            'find_db',
            'last_com',
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
        secondary: true,
        secondaryRequire: ['p_active_player2']
    },
    [ScriptOpcode.P_TELEJUMP]: {
        require: ['p_active_player'],
        secondary: true,
        secondaryRequire: ['p_active_player2']
    },
    [ScriptOpcode.P_TELEPORT]: {
        require: ['p_active_player'],
        secondary: true,
        secondaryRequire: ['p_active_player2']
    },
    [ScriptOpcode.P_WALK]: {
        require: ['p_active_player'],
        secondary: true,
        secondaryRequire: ['p_active_player2']
    },
    [ScriptOpcode.PROJANIM_PL]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.QUEUE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.SAY]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.SETMOVECHECK]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.SETTIMER]: {
        require: ['active_player']
    },
    [ScriptOpcode.SOFTTIMER]: {
        require: ['active_player']
    },
    [ScriptOpcode.SOUND_SYNTH]: {
        require: ['active_player']
    },
    [ScriptOpcode.SPOTANIM_PL]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.STAFFMODLEVEL]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.STAT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.STAT_ADD]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.STAT_BASE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.STAT_HEAL]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.STAT_SUB]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.UID]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.WEAKQUEUE]: {
        require: ['active_player']
    },

    // Npc ops
    [ScriptOpcode.NPC_ADD]: {
        set: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_ANIM]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_BASESTAT]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_CATEGORY]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_CHANGETYPE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_COORD]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_DAMAGE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_DEL]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_DELAY]: {
        require: ['active_npc'],
        corrupt: [
            // everything except active is assumed corrupted
            'find_player',
            'find_npc',
            'find_loc',
            'find_obj',
            'find_db',
            'last_com',
            'last_int',
            'last_item',
            'last_slot',
            'last_targetslot',
            'last_useitem',
            'last_useslot'
        ],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_FACESQUARE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_FINDALLZONE]: {
        set: ['find_npc']
    },
    [ScriptOpcode.NPC_FINDNEXT]: {
        require: ['find_npc'],
        set: ['active_npc'],
        conditional: true,
        secondary: true
    },
    [ScriptOpcode.NPC_FINDHERO]: {
        require: ['active_npc'],
        set: ['active_player'],
        conditional: true,
        secondary: true
    },
    [ScriptOpcode.NPC_FINDUID]: {
        set: ['active_npc'],
        conditional: true,
        secondary: true
    },
    [ScriptOpcode.NPC_GETMODE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_HEROPOINTS]: {
        require: ['active_npc', 'active_player']
    },
    [ScriptOpcode.NPC_NAME]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_PARAM]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_QUEUE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_RANGE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_SAY]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETHUNT]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETHUNTMODE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETMODE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETMOVECHECK]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_SETTIMER]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_STAT]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_STATADD]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_STATHEAL]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_STATSUB]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_TELE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_TYPE]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_UID]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.PROJANIM_NPC]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.SPOTANIM_NPC]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },
    [ScriptOpcode.NPC_WALK]: {
        require: ['active_npc'],
        secondary: true,
        secondaryRequire: ['active_npc2']
    },

    // Loc ops
    [ScriptOpcode.LOC_ADD]: {
        set: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_ANGLE]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_ANIM]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_CATEGORY]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_CHANGE]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_COORD]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_DEL]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_FIND]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_FINDALLZONE]: {
        set: ['find_loc']
    },
    [ScriptOpcode.LOC_FINDNEXT]: {
        require: ['find_loc'],
        set: ['active_loc'],
        conditional: true,
        secondary: true
    },
    [ScriptOpcode.LOC_NAME]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_PARAM]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_SHAPE]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },
    [ScriptOpcode.LOC_TYPE]: {
        require: ['active_loc'],
        secondary: true,
        secondaryRequire: ['active_loc2']
    },

    // Obj ops
    [ScriptOpcode.OBJ_ADD]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },
    [ScriptOpcode.OBJ_ADDALL]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },
    [ScriptOpcode.OBJ_COORD]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },
    [ScriptOpcode.OBJ_COUNT]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },
    [ScriptOpcode.OBJ_DEL]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },
    [ScriptOpcode.OBJ_NAME]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },
    [ScriptOpcode.OBJ_PARAM]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },
    [ScriptOpcode.OBJ_TAKEITEM]: {
        require: ['active_obj', 'active_player'],
        secondary: true,
        secondaryRequire: ['active_obj', 'active_player2']
    },
    [ScriptOpcode.OBJ_TYPE]: {
        require: ['active_obj'],
        secondary: true,
        secondaryRequire: ['active_obj2']
    },

    // Inventory ops
    [ScriptOpcode.INV_ADD]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_CHANGESLOT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_CLEAR]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_DEL]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_DELSLOT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_DROPITEM]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_DROPSLOT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_FREESPACE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_GETNUM]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_GETOBJ]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_ITEMSPACE]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_ITEMSPACE2]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_MOVEFROMSLOT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_MOVETOSLOT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.BOTH_MOVEINV]: {
        require: ['active_player', 'active_player2'],
        secondary: true,
        secondaryRequire: ['active_player2', 'active_player']
    },
    [ScriptOpcode.INV_MOVEITEM]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_MOVEITEM_CERT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_MOVEITEM_UNCERT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_SETSLOT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_TOTAL]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_TOTALCAT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INV_TRANSMIT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },
    [ScriptOpcode.INVOTHER_TRANSMIT]: {
        require: ['active_player', 'active_player2'],
        secondary: true,
        secondaryRequire: ['active_player2', 'active_player']
    },
    [ScriptOpcode.INV_STOPTRANSMIT]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
    },

    // String ops
    [ScriptOpcode.TEXT_GENDER]: {
        require: ['active_player'],
        secondary: true,
        secondaryRequire: ['active_player2']
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
    }
};

export default ScriptOpcodePointers;
