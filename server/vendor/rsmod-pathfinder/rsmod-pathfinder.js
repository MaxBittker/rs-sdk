
let imports = {};
imports['__wbindgen_placeholder__'] = module.exports;
let wasm;
const { TextDecoder } = require(`util`);

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} masks
 * @returns {boolean}
 */
module.exports.isFlagged = function(x, z, y, masks) {
    const ret = wasm.isFlagged(x, z, y, masks);
    return ret !== 0;
};

/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} extraFlag
 * @returns {boolean}
 */
module.exports.hasLineOfSight = function(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag) {
    const ret = wasm.hasLineOfSight(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    return ret !== 0;
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} size
 * @param {boolean} add
 */
module.exports.changePlayer = function(x, z, y, size, add) {
    wasm.changePlayer(x, z, y, size, add);
};

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} srcSize
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} angle
 * @param {number} shape
 * @param {boolean} moveNear
 * @param {number} blockAccessFlags
 * @param {number} maxWaypoints
 * @param {CollisionType} collision
 * @returns {Uint32Array}
 */
module.exports.findPath = function(y, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, shape, moveNear, blockAccessFlags, maxWaypoints, collision) {
    const ret = wasm.findPath(y, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, shape, moveNear, blockAccessFlags, maxWaypoints, collision);
    var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {boolean} add
 */
module.exports.changeFloor = function(x, z, y, add) {
    wasm.changeFloor(x, z, y, add);
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} width
 * @param {number} length
 * @param {boolean} blockrange
 * @param {boolean} breakroutefinding
 * @param {boolean} add
 */
module.exports.changeLoc = function(x, z, y, width, length, blockrange, breakroutefinding, add) {
    wasm.changeLoc(x, z, y, width, length, blockrange, breakroutefinding, add);
};

/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} extraFlag
 * @returns {boolean}
 */
module.exports.hasLineOfWalk = function(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag) {
    const ret = wasm.hasLineOfWalk(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    return ret !== 0;
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {boolean} add
 */
module.exports.changeRoof = function(x, z, y, add) {
    wasm.changeRoof(x, z, y, add);
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 */
module.exports.allocateIfAbsent = function(x, z, y) {
    wasm.allocateIfAbsent(x, z, y);
};

/**
 * @param {LocShape} shape
 * @returns {LocLayer}
 */
module.exports.locShapeLayer = function(shape) {
    const ret = wasm.locShapeLayer(shape);
    return ret;
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @returns {boolean}
 */
module.exports.isZoneAllocated = function(x, z, y) {
    const ret = wasm.isZoneAllocated(x, z, y);
    return ret !== 0;
};

/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} extraFlag
 * @returns {Uint32Array}
 */
module.exports.lineOfWalk = function(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag) {
    const ret = wasm.lineOfWalk(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
};

/**
 * @param {number} y
 * @param {number} x
 * @param {number} z
 * @param {number} offsetX
 * @param {number} offsetZ
 * @param {number} size
 * @param {number} extraFlag
 * @param {CollisionType} collision
 * @returns {boolean}
 */
module.exports.canTravel = function(y, x, z, offsetX, offsetZ, size, extraFlag, collision) {
    const ret = wasm.canTravel(y, x, z, offsetX, offsetZ, size, extraFlag, collision);
    return ret !== 0;
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 */
module.exports.deallocateIfPresent = function(x, z, y) {
    wasm.deallocateIfPresent(x, z, y);
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} mask
 */
module.exports.__set = function(x, z, y, mask) {
    wasm.__set(x, z, y, mask);
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} size
 * @param {boolean} add
 */
module.exports.changeNpc = function(x, z, y, size, add) {
    wasm.changeNpc(x, z, y, size, add);
};

/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} extraFlag
 * @param {CollisionType} collision
 * @returns {Uint32Array}
 */
module.exports.findNaivePath = function(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag, collision) {
    const ret = wasm.findNaivePath(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag, collision);
    var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
};

/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} srcSize
 * @param {number} angle
 * @param {number} shape
 * @param {number} blockAccessFlags
 * @returns {boolean}
 */
module.exports.reached = function(y, srcX, srcZ, destX, destZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags) {
    const ret = wasm.reached(y, srcX, srcZ, destX, destZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags);
    return ret !== 0;
};

/**
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} angle
 * @param {number} shape
 * @param {boolean} blockrange
 * @param {boolean} breakroutefinding
 * @param {boolean} add
 */
module.exports.changeWall = function(x, z, y, angle, shape, blockrange, breakroutefinding, add) {
    wasm.changeWall(x, z, y, angle, shape, blockrange, breakroutefinding, add);
};

/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} srcSize
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} angle
 * @param {number} shape
 * @param {boolean} moveNear
 * @param {number} blockAccessFlags
 * @param {number} maxWaypoints
 * @param {CollisionType} collision
 * @returns {Uint32Array}
 */
module.exports.findLongPath = function(y, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, shape, moveNear, blockAccessFlags, maxWaypoints, collision) {
    const ret = wasm.findLongPath(y, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, shape, moveNear, blockAccessFlags, maxWaypoints, collision);
    var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
};

/**
 * @param {number} y
 * @param {number} srcX
 * @param {number} srcZ
 * @param {number} destX
 * @param {number} destZ
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} extraFlag
 * @returns {Uint32Array}
 */
module.exports.lineOfSight = function(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag) {
    const ret = wasm.lineOfSight(y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
};

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_0.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

module.exports.BlockAccessFlag = Object.freeze({ BLOCK_NORTH:1,"1":"BLOCK_NORTH",BLOCK_EAST:2,"2":"BLOCK_EAST",BLOCK_SOUTH:4,"4":"BLOCK_SOUTH",BLOCK_WEST:8,"8":"BLOCK_WEST", });

module.exports.CollisionFlag = Object.freeze({ OPEN:0,"0":"OPEN",WALL_NORTH_WEST:1,"1":"WALL_NORTH_WEST",WALL_NORTH:2,"2":"WALL_NORTH",WALL_NORTH_EAST:4,"4":"WALL_NORTH_EAST",WALL_EAST:8,"8":"WALL_EAST",WALL_SOUTH_EAST:16,"16":"WALL_SOUTH_EAST",WALL_SOUTH:32,"32":"WALL_SOUTH",WALL_SOUTH_WEST:64,"64":"WALL_SOUTH_WEST",WALL_WEST:128,"128":"WALL_WEST",LOC:256,"256":"LOC",WALL_NORTH_WEST_PROJ_BLOCKER:512,"512":"WALL_NORTH_WEST_PROJ_BLOCKER",WALL_NORTH_PROJ_BLOCKER:1024,"1024":"WALL_NORTH_PROJ_BLOCKER",WALL_NORTH_EAST_PROJ_BLOCKER:2048,"2048":"WALL_NORTH_EAST_PROJ_BLOCKER",WALL_EAST_PROJ_BLOCKER:4096,"4096":"WALL_EAST_PROJ_BLOCKER",WALL_SOUTH_EAST_PROJ_BLOCKER:8192,"8192":"WALL_SOUTH_EAST_PROJ_BLOCKER",WALL_SOUTH_PROJ_BLOCKER:16384,"16384":"WALL_SOUTH_PROJ_BLOCKER",WALL_SOUTH_WEST_PROJ_BLOCKER:32768,"32768":"WALL_SOUTH_WEST_PROJ_BLOCKER",WALL_WEST_PROJ_BLOCKER:65536,"65536":"WALL_WEST_PROJ_BLOCKER",LOC_PROJ_BLOCKER:131072,"131072":"LOC_PROJ_BLOCKER",FLOOR_DECORATION:262144,"262144":"FLOOR_DECORATION",
/**
 *
 *     * Custom flag dedicated to blocking NPCs.
 *     * It should be noted that this is a custom flag, and you do not need to use this.
 *     * The pathfinder takes the flag as a custom option, so you may use any other flag, this just defines
 *     * a reliable constant to use
 *
 */
NPC:524288,"524288":"NPC",
/**
 *
 *     * Custom flag dedicated to blocking players, projectiles as well as NPCs.
 *     * An example of a monster to set this flag is Brawler. Note that it is unclear if this flag
 *     * prevents NPCs, as there is a separate flag option for it.
 *     * This flag is similar to the one above, except it's strictly for NPCs.
 *
 */
PLAYER:1048576,"1048576":"PLAYER",FLOOR:2097152,"2097152":"FLOOR",WALL_NORTH_WEST_ROUTE_BLOCKER:4194304,"4194304":"WALL_NORTH_WEST_ROUTE_BLOCKER",WALL_NORTH_ROUTE_BLOCKER:8388608,"8388608":"WALL_NORTH_ROUTE_BLOCKER",WALL_NORTH_EAST_ROUTE_BLOCKER:16777216,"16777216":"WALL_NORTH_EAST_ROUTE_BLOCKER",WALL_EAST_ROUTE_BLOCKER:33554432,"33554432":"WALL_EAST_ROUTE_BLOCKER",WALL_SOUTH_EAST_ROUTE_BLOCKER:67108864,"67108864":"WALL_SOUTH_EAST_ROUTE_BLOCKER",WALL_SOUTH_ROUTE_BLOCKER:134217728,"134217728":"WALL_SOUTH_ROUTE_BLOCKER",WALL_SOUTH_WEST_ROUTE_BLOCKER:268435456,"268435456":"WALL_SOUTH_WEST_ROUTE_BLOCKER",WALL_WEST_ROUTE_BLOCKER:536870912,"536870912":"WALL_WEST_ROUTE_BLOCKER",LOC_ROUTE_BLOCKER:1073741824,"1073741824":"LOC_ROUTE_BLOCKER",
/**
 *
 *     * Roof flag, used to bind NPCs to not leave the buildings they spawn in. This is a custom flag.
 *
 */
ROOF:2147483648,"2147483648":"ROOF",FLOOR_BLOCKED:2359296,"2359296":"FLOOR_BLOCKED",WALK_BLOCKED:2359552,"2359552":"WALK_BLOCKED",BLOCK_WEST:2359560,"2359560":"BLOCK_WEST",BLOCK_EAST:2359680,"2359680":"BLOCK_EAST",BLOCK_SOUTH:2359554,"2359554":"BLOCK_SOUTH",BLOCK_NORTH:2359584,"2359584":"BLOCK_NORTH",BLOCK_SOUTH_WEST:2359566,"2359566":"BLOCK_SOUTH_WEST",BLOCK_SOUTH_EAST:2359683,"2359683":"BLOCK_SOUTH_EAST",BLOCK_NORTH_WEST:2359608,"2359608":"BLOCK_NORTH_WEST",BLOCK_NORTH_EAST:2359776,"2359776":"BLOCK_NORTH_EAST",BLOCK_NORTH_AND_SOUTH_EAST:2359614,"2359614":"BLOCK_NORTH_AND_SOUTH_EAST",BLOCK_NORTH_AND_SOUTH_WEST:2359779,"2359779":"BLOCK_NORTH_AND_SOUTH_WEST",BLOCK_NORTH_EAST_AND_WEST:2359695,"2359695":"BLOCK_NORTH_EAST_AND_WEST",BLOCK_SOUTH_EAST_AND_WEST:2359800,"2359800":"BLOCK_SOUTH_EAST_AND_WEST",BLOCK_WEST_ROUTE_BLOCKER:36044800,"36044800":"BLOCK_WEST_ROUTE_BLOCKER",BLOCK_EAST_ROUTE_BLOCKER:539361280,"539361280":"BLOCK_EAST_ROUTE_BLOCKER",BLOCK_SOUTH_ROUTE_BLOCKER:277318006,"277318006":"BLOCK_SOUTH_ROUTE_BLOCKER",BLOCK_NORTH_ROUTE_BLOCKER:136708096,"136708096":"BLOCK_NORTH_ROUTE_BLOCKER",BLOCK_SOUTH_WEST_ROUTE_BLOCKER:1134821376,"1134821376":"BLOCK_SOUTH_WEST_ROUTE_BLOCKER",BLOCK_SOUTH_EAST_ROUTE_BLOCKER:1625554944,"1625554944":"BLOCK_SOUTH_EAST_ROUTE_BLOCKER",BLOCK_NORTH_WEST_ROUTE_BLOCKER:1310982144,"1310982144":"BLOCK_NORTH_WEST_ROUTE_BLOCKER",BLOCK_NORTH_EAST_ROUTE_BLOCKER:2015625216,"2015625216":"BLOCK_NORTH_EAST_ROUTE_BLOCKER",BLOCK_NORTH_AND_SOUTH_EAST_ROUTE_BLOCKER:1336147968,"1336147968":"BLOCK_NORTH_AND_SOUTH_EAST_ROUTE_BLOCKER",BLOCK_NORTH_AND_SOUTH_WEST_ROUTE_BLOCKER:2028208128,"2028208128":"BLOCK_NORTH_AND_SOUTH_WEST_ROUTE_BLOCKER",BLOCK_NORTH_EAST_AND_WEST_ROUTE_BLOCKER:1675886592,"1675886592":"BLOCK_NORTH_EAST_AND_WEST_ROUTE_BLOCKER",BLOCK_SOUTH_EAST_AND_WEST_ROUTE_BLOCKER:2116288512,"2116288512":"BLOCK_SOUTH_EAST_AND_WEST_ROUTE_BLOCKER",NULL:2147483647,"2147483647":"NULL", });

module.exports.CollisionType = Object.freeze({ NORMAL:0,"0":"NORMAL",BLOCKED:1,"1":"BLOCKED",INDOORS:2,"2":"INDOORS",OUTDOORS:3,"3":"OUTDOORS",LINE_OF_SIGHT:4,"4":"LINE_OF_SIGHT", });

module.exports.LocAngle = Object.freeze({ WEST:0,"0":"WEST",NORTH:1,"1":"NORTH",EAST:2,"2":"EAST",SOUTH:3,"3":"SOUTH", });

module.exports.LocLayer = Object.freeze({ WALL:0,"0":"WALL",WALL_DECOR:1,"1":"WALL_DECOR",GROUND:2,"2":"GROUND",GROUND_DECOR:3,"3":"GROUND_DECOR", });

module.exports.LocShape = Object.freeze({ WALL_STRAIGHT:0,"0":"WALL_STRAIGHT",WALL_DIAGONAL_CORNER:1,"1":"WALL_DIAGONAL_CORNER",WALL_L:2,"2":"WALL_L",WALL_SQUARE_CORNER:3,"3":"WALL_SQUARE_CORNER",WALLDECOR_STRAIGHT_NOOFFSET:4,"4":"WALLDECOR_STRAIGHT_NOOFFSET",WALLDECOR_STRAIGHT_OFFSET:5,"5":"WALLDECOR_STRAIGHT_OFFSET",WALLDECOR_DIAGONAL_OFFSET:6,"6":"WALLDECOR_DIAGONAL_OFFSET",WALLDECOR_DIAGONAL_NOOFFSET:7,"7":"WALLDECOR_DIAGONAL_NOOFFSET",WALLDECOR_DIAGONAL_BOTH:8,"8":"WALLDECOR_DIAGONAL_BOTH",WALL_DIAGONAL:9,"9":"WALL_DIAGONAL",CENTREPIECE_STRAIGHT:10,"10":"CENTREPIECE_STRAIGHT",CENTREPIECE_DIAGONAL:11,"11":"CENTREPIECE_DIAGONAL",ROOF_STRAIGHT:12,"12":"ROOF_STRAIGHT",ROOF_DIAGONAL_WITH_ROOFEDGE:13,"13":"ROOF_DIAGONAL_WITH_ROOFEDGE",ROOF_DIAGONAL:14,"14":"ROOF_DIAGONAL",ROOF_L_CONCAVE:15,"15":"ROOF_L_CONCAVE",ROOF_L_CONVEX:16,"16":"ROOF_L_CONVEX",ROOF_FLAT:17,"17":"ROOF_FLAT",ROOFEDGE_STRAIGHT:18,"18":"ROOFEDGE_STRAIGHT",ROOFEDGE_DIAGONAL_CORNER:19,"19":"ROOFEDGE_DIAGONAL_CORNER",ROOFEDGE_L:20,"20":"ROOFEDGE_L",ROOFEDGE_SQUARE_CORNER:21,"21":"ROOFEDGE_SQUARE_CORNER",GROUND_DECOR:22,"22":"GROUND_DECOR", });

module.exports.__wbg_crypto_1d1f22824a6a080c = function(arg0) {
    const ret = arg0.crypto;
    return ret;
};

module.exports.__wbindgen_is_object = function(arg0) {
    const val = arg0;
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
};

module.exports.__wbg_process_4a72847cc503995b = function(arg0) {
    const ret = arg0.process;
    return ret;
};

module.exports.__wbg_versions_f686565e586dd935 = function(arg0) {
    const ret = arg0.versions;
    return ret;
};

module.exports.__wbg_node_104a2ff8d6ea03a2 = function(arg0) {
    const ret = arg0.node;
    return ret;
};

module.exports.__wbindgen_is_string = function(arg0) {
    const ret = typeof(arg0) === 'string';
    return ret;
};

module.exports.__wbg_require_cca90b1a94a0255b = function() { return handleError(function () {
    const ret = module.require;
    return ret;
}, arguments) };

module.exports.__wbindgen_is_function = function(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
};

module.exports.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

module.exports.__wbg_msCrypto_eb05e62b530a1508 = function(arg0) {
    const ret = arg0.msCrypto;
    return ret;
};

module.exports.__wbg_randomFillSync_5c9c955aa56b6049 = function() { return handleError(function (arg0, arg1) {
    arg0.randomFillSync(arg1);
}, arguments) };

module.exports.__wbg_getRandomValues_3aa56aa6edec874c = function() { return handleError(function (arg0, arg1) {
    arg0.getRandomValues(arg1);
}, arguments) };

module.exports.__wbg_newnoargs_1ede4bf2ebbaaf43 = function(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return ret;
};

module.exports.__wbg_new_fec2611eb9180f95 = function(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
};

module.exports.__wbg_buffer_ccaed51a635d8a2d = function(arg0) {
    const ret = arg0.buffer;
    return ret;
};

module.exports.__wbg_newwithbyteoffsetandlength_7e3eb787208af730 = function(arg0, arg1, arg2) {
    const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
    return ret;
};

module.exports.__wbg_newwithlength_76462a666eca145f = function(arg0) {
    const ret = new Uint8Array(arg0 >>> 0);
    return ret;
};

module.exports.__wbg_set_ec2fcf81bc573fd9 = function(arg0, arg1, arg2) {
    arg0.set(arg1, arg2 >>> 0);
};

module.exports.__wbg_subarray_975a06f9dbd16995 = function(arg0, arg1, arg2) {
    const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
    return ret;
};

module.exports.__wbg_self_bf91bf94d9e04084 = function() { return handleError(function () {
    const ret = self.self;
    return ret;
}, arguments) };

module.exports.__wbg_window_52dd9f07d03fd5f8 = function() { return handleError(function () {
    const ret = window.window;
    return ret;
}, arguments) };

module.exports.__wbg_globalThis_05c129bf37fcf1be = function() { return handleError(function () {
    const ret = globalThis.globalThis;
    return ret;
}, arguments) };

module.exports.__wbg_global_3eca19bb09e9c484 = function() { return handleError(function () {
    const ret = global.global;
    return ret;
}, arguments) };

module.exports.__wbindgen_is_undefined = function(arg0) {
    const ret = arg0 === undefined;
    return ret;
};

module.exports.__wbg_call_a9ef466721e824f2 = function() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments) };

module.exports.__wbg_call_3bfa248576352471 = function() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments) };

module.exports.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return ret;
};

module.exports.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

module.exports.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_export_0;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

const path = require('path').join(__dirname, 'rsmod_bg.wasm');
const bytes = require('fs').readFileSync(path);

const wasmModule = new WebAssembly.Module(bytes);
const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
wasm = wasmInstance.exports;
module.exports.__wasm = wasm;

wasm.__wbindgen_start();

