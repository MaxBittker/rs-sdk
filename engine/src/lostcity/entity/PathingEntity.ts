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
import {CoordGrid} from '#lostcity/engine/CoordGrid.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';
import MoveStrategy from '#lostcity/entity/MoveStrategy.js';

import LocType from '#lostcity/cache/config/LocType.js';

import * as rsmod from '@2004scape/rsmod-pathfinder';
import {CollisionFlag, CollisionType} from '@2004scape/rsmod-pathfinder';
import Environment from '#lostcity/util/Environment.js';
import Obj from './Obj.js';

type TargetSubject = {
    type: number,
    com: number;
}

export type TargetOp = ServerTriggerType | NpcMode;

export default abstract class PathingEntity extends Entity {
    // constructor properties
    protected readonly moveRestrict: MoveRestrict;
    readonly blockWalk: BlockWalk;
    moveStrategy: MoveStrategy;
    private readonly coordmask: number;
    private readonly entitymask: number;

    // runtime properties
    moveSpeed: MoveSpeed = MoveSpeed.INSTANT;
    walkDir: number = -1;
    runDir: number = -1;
    waypointIndex: number = -1;
    waypoints: Int32Array = new Int32Array(25);
    lastTickX: number = -1;
    lastTickZ: number = -1;
    lastLevel: number = -1;
    tele: boolean = false;
    jump: boolean = false;
    lastStepX: number = -1;
    lastStepZ: number = -1;
    stepsTaken: number = 0;
    lastInt: number = -1; // resume_p_countdialog, ai_queue
    lastCrawl: boolean = false;
    lastMovement: number = 0;
    lastCoordX: number = -1;
    lastCoordZ: number = -1;
    lastCoordLevel: number = -1;

    walktrigger: number = -1;
    walktriggerArg: number = 0; // used for npcs

    delay: number = -1;
    interacted: boolean = false;
    repathed: boolean = false;
    target: Entity | null = null;
    targetOp: TargetOp = -1;
    targetSubject: TargetSubject = {type: -1, com: -1};
    targetX: number = -1;
    targetZ: number = -1;
    apRange: number = 10;
    apRangeCalled: boolean = false;
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
    orientationX: number = -1;
    orientationZ: number = -1;
    faceEntity: number = -1;
    damageTaken: number = -1;
    damageType: number = -1;
    animId: number = -1;
    animDelay: number = -1;
    chat: string | null = null;
    graphicId: number = -1;
    graphicHeight: number = -1;
    graphicDelay: number = -1;

    protected constructor(
        level: number,
        x: number,
        z: number,
        width: number,
        length: number,
        lifecycle: EntityLifeCycle,
        moveRestrict: MoveRestrict,
        blockWalk: BlockWalk,
        moveStrategy: MoveStrategy,
        coordmask: number,
        entitymask: number
    ) {
        super(level, x, z, width, length, lifecycle);
        this.moveRestrict = moveRestrict;
        this.blockWalk = blockWalk;
        this.moveStrategy = moveStrategy;
        this.coordmask = coordmask;
        this.entitymask = entitymask;
        this.lastStepX = x - 1;
        this.lastStepZ = z;
        this.lastCoordX = x;
        this.lastCoordZ = z;
        this.lastCoordLevel = level;
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
        if (!this.hasWaypoints() || this.moveSpeed === MoveSpeed.STATIONARY || this.moveSpeed === MoveSpeed.INSTANT) {
            return false;
        }
        const previousX = this.x;
        const previousZ = this.z;
        const previousLevel = this.level;

        if (this.moveSpeed === MoveSpeed.CRAWL) {
            this.lastCrawl = !this.lastCrawl;
            if (this.lastCrawl && this.walkDir === -1) {
                this.walkDir = this.validateAndAdvanceStep();
            }
        } else if (this.walkDir === -1) { // either walk or run speed here.
            this.walkDir = this.validateAndAdvanceStep();
            if (this.moveSpeed === MoveSpeed.RUN && this.walkDir !== -1 && this.runDir === -1) {
                this.runDir = this.validateAndAdvanceStep();
            }
        }
        if (previousX !== this.x || previousZ !== this.z || previousLevel !== this.level) {
            this.lastCoordX = previousX;
            this.lastCoordZ = previousZ;
            this.lastCoordLevel = previousLevel;
        }
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
                    World.gameMap.changeNpcCollision(this.width, previousX, previousZ, previousLevel, false);
                    World.gameMap.changeNpcCollision(this.width, this.x, this.z, this.level, true);
                    break;
                case BlockWalk.ALL:
                    World.gameMap.changeNpcCollision(this.width, previousX, previousZ, previousLevel, false);
                    World.gameMap.changeNpcCollision(this.width, this.x, this.z, this.level, true);
                    World.gameMap.changePlayerCollision(this.width, previousX, previousZ, previousLevel, false);
                    World.gameMap.changePlayerCollision(this.width, this.x, this.z, this.level, true);
                    break;
            }
            this.lastStepX = previousX;
            this.lastStepZ = previousZ;
        }

        if (CoordGrid.zone(previousX) !== CoordGrid.zone(this.x) || CoordGrid.zone(previousZ) !== CoordGrid.zone(this.z) || previousLevel != this.level) {
            World.gameMap.getZone(previousX, previousZ, previousLevel).leave(this);
            World.gameMap.getZone(this.x, this.z, this.level).enter(this);
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
        const previousX: number = this.x;
        const previousZ: number = this.z;
        this.x = CoordGrid.moveX(this.x, dir);
        this.z = CoordGrid.moveZ(this.z, dir);
        this.orientationX = CoordGrid.moveX(this.x, dir) * 2 + 1;
        this.orientationZ = CoordGrid.moveZ(this.z, dir) * 2 + 1;
        this.stepsTaken++;
        this.refreshZonePresence(previousX, previousZ, this.level);

        if (this.waypointIndex !== -1) {
            const coord: CoordGrid = CoordGrid.unpackCoord(this.waypoints[this.waypointIndex]);
            if (coord.x === this.x && coord.z === this.z) {
                this.waypointIndex--;
            }
        }

        return dir;
    }

    /**
     * Queue this PathingEntity to a single waypoint.
     * @param x The x position of the step.
     * @param z The z position of the step.
     */
    queueWaypoint(x: number, z: number): void {
        this.waypoints[0] = CoordGrid.packCoord(0, x, z); // level doesn't matter here
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
        this.moveSpeed = MoveSpeed.INSTANT;
        this.jump = true;
    }

    teleport(x: number, z: number, level: number): void {
        if (isNaN(level)) {
            level = 0;
        }
        level = Math.max(0, Math.min(level, 3));

        const previousX: number = this.x;
        const previousZ: number = this.z;
        const previousLevel: number = this.level;
        this.x = x;
        this.z = z;
        this.level = level;
        this.refreshZonePresence(previousX, previousZ, previousLevel);
        this.lastStepX = this.x - 1;
        this.lastStepZ = this.z;
        this.tele = true;

        if (previousX !== x || previousZ !== z || previousLevel !== level) {
            this.lastCoordX = previousX;
            this.lastCoordZ = previousZ;
            this.lastCoordLevel = previousLevel;
        }

        if (previousLevel != level) {
            this.moveSpeed = MoveSpeed.INSTANT;
            this.jump = true;
        }
    }

    /**
     * Check if the number of tiles moved is > 2, we use Teleport for this PathingEntity.
     */
    validateDistanceWalked() {
        const distanceCheck =
            CoordGrid.distanceTo(this, {
                x: this.lastTickX,
                z: this.lastTickZ,
                width: this.width,
                length: this.length
            }) > 2;
        if (distanceCheck) {
            this.jump = true;
        }
    }

    convertMovementDir() {
        // temp variables to convert movement operations
        let walkDir = this.walkDir;
        let runDir = this.runDir;
        let tele = this.tele;

        // convert p_teleport() into walk or run
        const distanceMoved = CoordGrid.distanceTo(this, {
            x: this.lastTickX,
            z: this.lastTickZ,
            width: this.width,
            length: this.length
        });
        if (tele && !this.jump && distanceMoved <= 2) {
            if (distanceMoved === 2) {
                // run
                const firstX = ((this.x + this.lastTickX) / 2) | 0;
                const firstZ = ((this.z + this.lastTickZ) / 2) | 0;
                walkDir = CoordGrid.face(this.lastTickX, this.lastTickZ, firstX, firstZ);
                runDir = CoordGrid.face(firstX, firstZ, this.x, this.z);
            } else {
                // walk
                walkDir = CoordGrid.face(this.lastTickX, this.lastTickZ, this.x, this.z);
                runDir = -1;
            }

            tele = false;
        }

        this.walkDir = walkDir;
        this.runDir = runDir;
        this.tele = tele;
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
            return rsmod.reached(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width, -1, -2);
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
        if (target instanceof PathingEntity && CoordGrid.intersects(this.x, this.z, this.width, this.length, target.x, target.z, target.width, target.length)) {
            // pathing entity has a -2 shape basically (not allow on same tile) for ap.
            // you are not within ap distance of pathing entity if you are underneath it.
            return false;
        }
        return CoordGrid.distanceTo(this, target) <= range && rsmod.hasLineOfSight(this.level, this.x, this.z, target.x, target.z, this.width, this.length, target.width, target.length, CollisionFlag.PLAYER);
    }

    pathToMoveClick(input: number[], needsfinding: boolean): void {
        if (this.moveStrategy === MoveStrategy.SMART) {
            if (needsfinding) {
                const { x, z } = CoordGrid.unpackCoord(input[0]);
                this.queueWaypoints(rsmod.findPath(this.level, this.x, this.z, x, z));
            } else {
                this.queueWaypoints(input);
            }
        } else {
            const { x, z } = CoordGrid.unpackCoord(input[input.length - 1]);
            this.queueWaypoint(x, z);
        }
    }

    pathToPathingTarget(): void {
        if (!this.target || !(this.target instanceof PathingEntity)) {
            return;
        }

        if (!this.isLastOrNoWaypoint()) {
            return;
        }

        if (this.targetOp === ServerTriggerType.APPLAYER3 || this.targetOp === ServerTriggerType.OPPLAYER3) {
            this.queueWaypoint(this.target.lastStepX, this.target.lastStepZ);
            return;
        }

        /*if (this.targetX === this.target.x && this.targetZ === this.target.z && !Position.intersects(this.x, this.z, this.width, this.length, this.target.x, this.target.z, this.target.width, this.target.length)) {
            return;
        }*/

        this.pathToTarget();
    }

    pathToTarget(): void {
        if (!this.target) {
            return;
        }

        this.targetX = this.target.x;
        this.targetZ = this.target.z;

        const faceX: number = this.target.x * 2 + this.target.width;
        const faceZ: number = this.target.z * 2 + this.target.length;
        this.orientationX = faceX;
        this.orientationZ = faceZ;

        if (this.moveStrategy === MoveStrategy.SMART) {
            if (this.target instanceof PathingEntity) {
                this.queueWaypoints(rsmod.findPath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length, 0, -2));
            } else if (this.target instanceof Loc) {
                const forceapproach = LocType.get(this.target.type).forceapproach;
                this.queueWaypoints(rsmod.findPath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length, this.target.angle, this.target.shape, true, forceapproach));
            } else if (this.target instanceof Obj && this.x === this.target.x && this.z === this.target.z) {
                this.queueWaypoint(this.target.x, this.target.z); // work around because our findpath() returns 0, 0 if coord and target coord are the same
            } else {
                this.queueWaypoints(rsmod.findPath(this.level, this.x, this.z, this.target.x, this.target.z));
            }
        } else if (this.moveStrategy === MoveStrategy.NAIVE) {
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
        } else {
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

        const faceX: number = target.x * 2 + target.width;
        const faceZ: number = target.z * 2 + target.length;

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
            // direction when the player is first observed (updates on movement)
            this.orientationX = faceX;
            this.orientationZ = faceZ;

            // direction update (only updates from facesquare or interactions)
            this.faceX = faceX;
            this.faceZ = faceZ;

            if (interaction === Interaction.ENGINE) {
                // mask updates will be sent every time from the packet handler
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
        this.tele = false;
        this.lastTickX = this.x;
        this.lastTickZ = this.z;
        this.lastLevel = this.level;
        this.stepsTaken = 0;
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

        if (this.alreadyFacedEntity && !this.target && this.faceEntity !== -1) {
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

        const {x, z} = CoordGrid.unpackCoord(this.waypoints[this.waypointIndex]);
        const dir: number = CoordGrid.face(srcX, srcZ, x, z);
        const dx: number = CoordGrid.deltaX(dir);
        const dz: number = CoordGrid.deltaZ(dir);

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

        if (this.moveStrategy === MoveStrategy.FLY) {
            return dir;
        }

        if (!Environment.NODE_MEMBERS && !World.gameMap.isFreeToPlay(this.x + dx, this.z + dz)) {
            return -1;
        }

        // check current direction if can travel to chosen dest.
        if (rsmod.canTravel(this.level, this.x, this.z, dx, dz, this.width, extraFlag, collisionStrategy)) {
            return dir;
        }

        // check another direction if can travel to chosen dest on current z-axis.
        if (dx != 0 && rsmod.canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy)) {
            return CoordGrid.face(srcX, srcZ, x, srcZ);
        }

        // check another direction if can travel to chosen dest on current x-axis.
        if (dz != 0 && rsmod.canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy)) {
            return CoordGrid.face(srcX, srcZ, srcX, z);
        }
        // https://x.com/JagexAsh/status/1727609489954664502
        return null;
    }
}
