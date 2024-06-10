import World from '#lostcity/engine/World.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

import BlockWalk from '#lostcity/entity/BlockWalk.js';
import Entity from '#lostcity/entity/Entity.js';
import Npc from '#lostcity/entity/Npc.js';
import Loc from '#lostcity/entity/Loc.js';
import Interaction from '#lostcity/entity/Interaction.js';
import Player from '#lostcity/entity/Player.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import MoveSpeed from '#lostcity/entity/MoveSpeed.js';
import { Direction, Position } from '#lostcity/entity/Position.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

import LocType from '#lostcity/cache/config/LocType.js';

import * as rsmod from '@2004scape/rsmod-pathfinder';
import {CollisionFlag, CollisionType} from '@2004scape/rsmod-pathfinder';

type TargetSubject = {
    type: number,
    com: number;
}

export type TargetOp = ServerTriggerType | NpcMode;

export default abstract class PathingEntity extends Entity {
    // constructor properties
    protected readonly moveRestrict: MoveRestrict;
    readonly blockWalk: BlockWalk;
    private readonly coordmask: number;
    private readonly entitymask: number;
    private readonly smart: boolean;

    // runtime properties
    moveSpeed: MoveSpeed = MoveSpeed.INSTANT;
    walkDir: number = -1;
    runDir: number = -1;
    waypointIndex: number = -1;
    waypoints: Int32Array = new Int32Array(25);
    lastX: number = -1;
    lastZ: number = -1;
    jump: boolean = false;

    walktrigger: number = -1;
    walktriggerArg: number = 0; // used for npcs

    orientation: number = Direction.SOUTH;

    interacted: boolean = false;
    repathed: boolean = false;
    target: Entity | null = null;
    targetOp: TargetOp = -1;
    targetSubject: TargetSubject = {type: -1, com: -1};
    targetX: number = -1;
    targetZ: number = -1;
    apRange: number = 10;
    apRangeCalled: boolean = false;
    alreadyFacedCoord: boolean = false;
    alreadyFacedEntity: boolean = false;

    mask: number = 0;
    exactStartX: number = -1;
    exactStartZ: number = -1;
    exactEndX: number = -1;
    exactEndZ: number = -1;
    exactMoveStart: number = -1;
    exactMoveEnd: number = -1;
    exactMoveDirection: number = -1;
    faceX: number = -1;
    faceZ: number = -1;
    faceEntity: number = -1;
    damageTaken: number = -1;
    damageType: number = -1;
    animId: number = -1;
    animDelay: number = -1;
    chat: string | null = null;
    graphicId: number = -1;
    graphicHeight: number = -1;
    graphicDelay: number = -1;

    protected constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, moveRestrict: MoveRestrict, blockWalk: BlockWalk, coordmask: number, entitymask: number, smart: boolean) {
        super(level, x, z, width, length, lifecycle);
        this.moveRestrict = moveRestrict;
        this.blockWalk = blockWalk;
        this.coordmask = coordmask;
        this.entitymask = entitymask;
        this.smart = smart;
    }

    /**
     * Attempts to update movement for a PathingEntity.
     */
    abstract updateMovement(repathAllowed: boolean): boolean;
    abstract blockWalkFlag(): CollisionFlag;
    abstract defaultMoveSpeed(): MoveSpeed;

    /**
     * Process movement function for a PathingEntity to use.
     * Checks for if this PathingEntity has any waypoints to move towards.
     * Handles force movement. Validates and moves depending on if this
     * PathingEntity is walking or running only.
     * Applies an orientation update to this PathingEntity if a step
     * direction was taken.
     * Updates this PathingEntity zone presence if moved.
     * Returns false is this PathingEntity has no waypoints.
     * Returns true if a step was taken and movement processed.
     */
    processMovement(): boolean {
        if (!this.hasWaypoints()) {
            return false;
        }

        const previousX = this.x;
        const previousZ = this.z;
        const previousLevel = this.level;

        if (this.moveSpeed !== MoveSpeed.STATIONARY && this.walkDir === -1) {
            this.walkDir = this.validateAndAdvanceStep();
            if (this.moveSpeed !== MoveSpeed.WALK && this.walkDir !== -1 && this.runDir === -1) {
                this.runDir = this.validateAndAdvanceStep();
            }
        }

        // keeps this pathing entity orientation updated as they move around the map.
        // important for like when you login you see all entities correct dir.
        if (this.runDir !== -1) {
            this.orientation = this.runDir;
        } else if (this.walkDir !== -1) {
            this.orientation = this.walkDir;
        }

        this.refreshZonePresence(previousX, previousZ, previousLevel);
        return true;
    }

    /**
     * Zone presence implementation for a PathingEntity.
     * Can allow updating collision map, removing a PathingEntity from a zone, etc.
     * @param previousX Their previous recorded x position before movement.
     * @param previousZ Their previous recorded z position before movement.
     * @param previousLevel Their previous recorded level position before movement. This one is important for teleport.
     */
    private refreshZonePresence(previousX: number, previousZ: number, previousLevel: number): void {
        // only update collision map when the entity moves.
        if (this.x != previousX || this.z !== previousZ || this.level !== previousLevel) {
            // update collision map
            // players and npcs both can change this collision
            switch (this.blockWalk) {
                case BlockWalk.NPC:
                    World.collisionManager.changeNpcCollision(this.width, previousX, previousZ, previousLevel, false);
                    World.collisionManager.changeNpcCollision(this.width, this.x, this.z, this.level, true);
                    break;
                case BlockWalk.ALL:
                    World.collisionManager.changeNpcCollision(this.width, previousX, previousZ, previousLevel, false);
                    World.collisionManager.changeNpcCollision(this.width, this.x, this.z, this.level, true);
                    World.collisionManager.changePlayerCollision(this.width, previousX, previousZ, previousLevel, false);
                    World.collisionManager.changePlayerCollision(this.width, this.x, this.z, this.level, true);
                    break;
            }
        }

        if (Position.zone(previousX) !== Position.zone(this.x) || Position.zone(previousZ) !== Position.zone(this.z) || previousLevel != this.level) {
            World.getZone(previousX, previousZ, previousLevel).leave(this);
            World.getZone(this.x, this.z, this.level).enter(this);
        }
    }

    /**
     * Validates the next step in our current waypoint.
     *
     * Deques to the next step if reached the end of current step,
     * then attempts to look for a possible second next step,
     * validates and repeats.
     *
     * Moves this PathingEntity each time a step is validated.
     *
     * A PathingEntity can persist their current step for example if
     * blocked by another PathingEntity. Unless a PathingEntity does
     * a random walk again while still persisting their current step.
     *
     * Returns the final validated step direction.
     */
    private validateAndAdvanceStep(): number {
        const dir: number | null = this.takeStep();
        if (dir === null) {
            return -1;
        }
        if (dir === -1) {
            this.waypointIndex--;
            if (this.waypointIndex != -1) {
                return this.validateAndAdvanceStep();
            }
            return -1;
        }
        this.x = Position.moveX(this.x, dir);
        this.z = Position.moveZ(this.z, dir);
        return dir;
    }

    /**
     * Queue this PathingEntity to a single waypoint.
     * @param x The x position of the step.
     * @param z The z position of the step.
     */
    queueWaypoint(x: number, z: number): void {
        this.waypoints[0] = Position.packCoord(0, x, z); // level doesn't matter here
        this.waypointIndex = 0;
    }

    /**
     * Queue waypoints to this PathingEntity.
     * @param waypoints The waypoints to queue.
     */
    queueWaypoints(waypoints: ArrayLike<number>): void {
        let index: number = -1;
        for (let input: number = waypoints.length - 1, output: number = 0; input >= 0 && output < this.waypoints.length; input--, output++) {
            this.waypoints[output] = waypoints[input];
            index++;
        }
        this.waypointIndex = index;
    }

    clearWaypoints(): void {
        this.waypointIndex = -1;
    }

    teleJump(x: number, z: number, level: number): void {
        this.teleport(x, z, level);
        this.jump = true;
    }

    teleport(x: number, z: number, level: number): void {
        if (isNaN(level)) {
            level = 0;
        }
        level = Math.max(0, Math.min(level, 3));

        const previousX = this.x;
        const previousZ = this.z;
        const previousLevel = this.level;

        this.x = x;
        this.z = z;
        this.level = level;
        this.refreshZonePresence(previousX, previousZ, previousLevel);

        this.moveSpeed = MoveSpeed.INSTANT;
        if (previousLevel != level) {
            this.jump = true;
        }
    }

    /**
     * Check if the number of tiles moved is > 2, we use Teleport for this PathingEntity.
     */
    validateDistanceWalked() {
        const distanceCheck =
            Position.distanceTo(this, {
                x: this.lastX,
                z: this.lastZ,
                width: this.width,
                length: this.length
            }) > 2;
        if (distanceCheck) {
            this.jump = true;
        }
    }

    getMovementDir() {
        // temp variables to convert movement operations
        let walkDir = this.walkDir;
        let runDir = this.runDir;
        let tele = this.moveSpeed === MoveSpeed.INSTANT;

        // convert p_teleport() into walk or run
        const distanceMoved = Position.distanceTo(this, {
            x: this.lastX,
            z: this.lastZ,
            width: this.width,
            length: this.length
        });
        if (tele && !this.jump && distanceMoved <= 2) {
            if (distanceMoved === 2) {
                // run
                const firstX = ((this.x + this.lastX) / 2) | 0;
                const firstZ = ((this.z + this.lastZ) / 2) | 0;
                walkDir = Position.face(this.lastX, this.lastZ, firstX, firstZ);
                runDir = Position.face(firstX, firstZ, this.x, this.z);
            } else {
                // walk
                walkDir = Position.face(this.lastX, this.lastZ, this.x, this.z);
                runDir = -1;
            }

            tele = false;
        }

        return { walkDir, runDir, tele };
    }

    /**
     * Returns if this PathingEntity has any queued waypoints.
     */
    hasWaypoints(): boolean {
        return this.waypointIndex !== -1;
    }

    /*
     * Returns if this PathingEntity is at the last waypoint or has no waypoint.
     */
    isLastOrNoWaypoint(): boolean {
        return this.waypointIndex <= 0;
    }

    protected inOperableDistance(target: Entity): boolean {
        if (target.level !== this.level) {
            return false;
        }
        if (target instanceof PathingEntity) {
            return rsmod.reached(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width, target.orientation, -2);
        } else if (target instanceof Loc) {
            const forceapproach = LocType.get(target.type).forceapproach;
            return rsmod.reached(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width, target.angle, target.shape, forceapproach);
        }
        // instanceof Obj
        const reachedAdjacent: boolean = rsmod.reached(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width, 0, -2);
        if (rsmod.isFlagged(target.x, target.z, target.level, CollisionFlag.WALK_BLOCKED)) {
            // picking up off of tables
            return reachedAdjacent;
        }
        if (!this.hasWaypoints() && reachedAdjacent) {
            // picking up while walktrigger prevents movement
            return true;
        }
        return rsmod.reached(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width, 0, -1);
    }

    protected inApproachDistance(range: number, target: Entity): boolean {
        if (target.level !== this.level) {
            return false;
        }
        if (target instanceof PathingEntity && Position.intersects(this.x, this.z, this.width, this.length, target.x, target.z, target.width, target.length)) {
            // pathing entity has a -2 shape basically (not allow on same tile) for ap.
            // you are not within ap distance of pathing entity if you are underneath it.
            return false;
        }
        return Position.distanceTo(this, target) <= range && rsmod.hasLineOfSight(this.level, this.x, this.z, target.x, target.z, this.width, this.length, target.width, target.length, CollisionFlag.PLAYER);
    }

    pathToPathingTarget(): void {
        if (!this.target) {
            return;
        }

        if (!this.isLastOrNoWaypoint()) {
            return;
        }

        if (this.targetX === this.target.x && this.targetZ === this.target.z && !Position.intersects(this.x, this.z, this.width, this.length, this.target.x, this.target.z, this.target.width, this.target.length)) {
            return;
        }

        this.pathToTarget();
    }

    protected pathToTarget(): void {
        if (!this.target) {
            return;
        }

        this.targetX = this.target.x;
        this.targetZ = this.target.z;

        if (this.smart) {
            if (this.target instanceof PathingEntity) {
                this.queueWaypoints(rsmod.findPath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length, this.target.orientation, -2));
            } else if (this.target instanceof Loc) {
                const forceapproach = LocType.get(this.target.type).forceapproach;
                this.queueWaypoints(rsmod.findPath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length, this.target.angle, this.target.shape, true, forceapproach));
            } else {
                this.queueWaypoints(rsmod.findPath(this.level, this.x, this.z, this.target.x, this.target.z));
            }
            return;
        }

        const collisionStrategy: CollisionType | null = this.getCollisionStrategy();
        if (collisionStrategy === null) {
            // nomove moverestrict returns as null = no walking allowed.
            return;
        }

        const extraFlag: CollisionFlag = this.blockWalkFlag();
        if (extraFlag === CollisionFlag.NULL) {
            // nomove moverestrict returns as null = no walking allowed.
            return;
        }
        if (this.target instanceof PathingEntity) {
            this.queueWaypoints(rsmod.findNaivePath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.length, this.target.width, this.target.length, extraFlag, collisionStrategy));
        } else {
            this.queueWaypoint(this.target.x, this.target.z);
        }
    }

    setInteraction(interaction: Interaction, target: Entity, op: TargetOp, subject?: TargetSubject): void {
        this.target = target;
        this.targetOp = op;
        this.targetSubject = subject ?? {type: -1, com: -1};
        this.targetX = target.x;
        this.targetZ = target.z;
        this.apRange = 10;
        this.apRangeCalled = false;

        // less packets out thanks to me :-)
        if (target instanceof Player) {
            const pid: number = target.pid + 32768;
            if (this.faceEntity !== pid) {
                this.faceEntity = pid;
                this.mask |= this.entitymask;
            }
        } else if (target instanceof Npc) {
            const nid: number = target.nid;
            if (this.faceEntity !== nid) {
                this.faceEntity = nid;
                this.mask |= this.entitymask;
            }
        } else {
            const faceX: number = target.x * 2 + target.width;
            const faceZ: number = target.z * 2 + target.length;
            if (this.faceX !== faceX || this.faceZ !== faceZ) {
                this.faceX = faceX;
                this.faceZ = faceZ;
                this.mask |= this.coordmask;
            }
        }

        if (interaction === Interaction.SCRIPT) {
            this.pathToTarget();
        }
    }

    clearInteraction(): void {
        this.target = null;
        this.targetOp = -1;
        this.targetSubject = {type: -1, com: -1};
        this.targetX = -1;
        this.targetZ = -1;
        this.apRange = 10;
        this.apRangeCalled = false;
        this.alreadyFacedCoord = true;
        this.alreadyFacedEntity = true;
    }

    protected getCollisionStrategy(): CollisionType | null {
        if (this.moveRestrict === MoveRestrict.NORMAL) {
            return CollisionType.NORMAL;
        } else if (this.moveRestrict === MoveRestrict.BLOCKED) {
            return CollisionType.BLOCKED;
        } else if (this.moveRestrict === MoveRestrict.BLOCKED_NORMAL) {
            return CollisionType.LINE_OF_SIGHT;
        } else if (this.moveRestrict === MoveRestrict.INDOORS) {
            return CollisionType.INDOORS;
        } else if (this.moveRestrict === MoveRestrict.OUTDOORS) {
            return CollisionType.OUTDOORS;
        } else if (this.moveRestrict === MoveRestrict.NOMOVE) {
            return null;
        } else if (this.moveRestrict === MoveRestrict.PASSTHRU) {
            return CollisionType.NORMAL;
        }
        return null;
    }

    protected resetPathingEntity(): void {
        this.moveSpeed = this.defaultMoveSpeed();
        this.walkDir = -1;
        this.runDir = -1;
        this.jump = false;
        this.lastX = this.x;
        this.lastZ = this.z;
        this.interacted = false;
        this.apRangeCalled = false;

        this.mask = 0;
        this.exactStartX = -1;
        this.exactStartZ = -1;
        this.exactEndX = -1;
        this.exactEndZ = -1;
        this.exactMoveStart = -1;
        this.exactMoveEnd = -1;
        this.exactMoveDirection = -1;
        this.animId = -1;
        this.animDelay = -1;
        this.animId = -1;
        this.animDelay = -1;
        this.chat = null;
        this.damageTaken = -1;
        this.damageType = -1;
        this.graphicId = -1;
        this.graphicHeight = -1;
        this.graphicDelay = -1;

        if (this.alreadyFacedCoord && this.faceX !== -1 && !this.hasWaypoints()) {
            this.faceX = -1;
            this.faceZ = -1;
            this.alreadyFacedCoord = false;
        } else if (this.alreadyFacedEntity && !this.target && this.faceEntity !== -1) {
            this.mask |= this.entitymask;
            this.faceEntity = -1;
            this.alreadyFacedEntity = false;
        }
    }

    private takeStep(): number | null {
        // dir -1 means we reached the destination.
        // dir null means nothing happened
        if (this.waypointIndex === -1) {
            // failsafe check
            return null;
        }

        const srcX: number = this.x;
        const srcZ: number = this.z;

        const {x, z} = Position.unpackCoord(this.waypoints[this.waypointIndex]);
        const dir: number = Position.face(srcX, srcZ, x, z);
        const dx: number = Position.deltaX(dir);
        const dz: number = Position.deltaZ(dir);

        // check if moved off current pos.
        if (dx == 0 && dz == 0) {
            return -1;
        }

        const collisionStrategy: CollisionType | null = this.getCollisionStrategy();
        if (collisionStrategy === null) {
            // nomove moverestrict returns as null = no walking allowed.
            return -1;
        }

        const extraFlag: CollisionFlag = this.blockWalkFlag();
        if (extraFlag === CollisionFlag.NULL) {
            // nomove moverestrict returns as null = no walking allowed.
            return -1;
        }

        // check current direction if can travel to chosen dest.
        if (rsmod.canTravel(this.level, this.x, this.z, dx, dz, this.width, extraFlag, collisionStrategy)) {
            return dir;
        }

        // check another direction if can travel to chosen dest on current z-axis.
        if (dx != 0 && rsmod.canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy)) {
            return Position.face(srcX, srcZ, x, srcZ);
        }

        // check another direction if can travel to chosen dest on current x-axis.
        if (dz != 0 && rsmod.canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy)) {
            return Position.face(srcX, srcZ, srcX, z);
        }
        return null;
    }
}
