import World from '#/engine/World.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';

import BlockWalk from '#/engine/entity/BlockWalk.js';
import Entity from '#/engine/entity/Entity.js';
import Npc from '#/engine/entity/Npc.js';
import Loc from '#/engine/entity/Loc.js';
import Interaction from '#/engine/entity/Interaction.js';
import Player from '#/engine/entity/Player.js';
import NpcMode from '#/engine/entity/NpcMode.js';
import MoveRestrict from '#/engine/entity/MoveRestrict.js';
import MoveSpeed from '#/engine/entity/MoveSpeed.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';
import MoveStrategy from '#/engine/entity/MoveStrategy.js';
import Obj from '#/engine/entity/Obj.js';
import NonPathingEntity from '#/engine/entity/NonPathingEntity.js';

import LocType from '#/cache/config/LocType.js';

import Environment from '#/util/Environment.js';

import { CollisionFlag, CollisionType } from '@2004scape/rsmod-pathfinder';

import { canTravel, changeNpcCollision, changePlayerCollision, findNaivePath, findPath, findPathToEntity, findPathToLoc, isApproached, reachedEntity, reachedLoc, reachedObj } from '#/engine/GameMap.js';

type TargetSubject = {
    type: number;
    com: number;
};

export type TargetOp = ServerTriggerType | NpcMode;

export default abstract class PathingEntity extends Entity {
    // constructor properties
    protected readonly moveRestrict: MoveRestrict;
    blockWalk: BlockWalk;
    moveStrategy: MoveStrategy;
    private readonly coordmask: number;
    readonly entitymask: number;

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
    followX: number = -1;
    followZ: number = -1;
    stepsTaken: number = 0;
    lastInt: number = -1; // resume_p_countdialog, ai_queue
    lastCrawl: boolean = false;
    lastMovement: number = 0;

    walktrigger: number = -1;
    walktriggerArg: number = 0; // used for npcs

    delayed: boolean = false;
    delayedUntil: number = -1;
    interacted: boolean = false;
    repathed: boolean = false;
    target: Entity | null = null;
    targetOp: TargetOp = -1;
    targetSubject: TargetSubject = { type: -1, com: -1 };
    apRange: number = 10;
    apRangeCalled: boolean = false;

    // this is only used to hack in the turning after walking on non pathing entity.
    // do not use this for anything else.
    targetX: number = -1;
    targetZ: number = -1;

    // info update masks. resets at the end of every tick.
    masks: number = 0;
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

    protected constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, moveRestrict: MoveRestrict, blockWalk: BlockWalk, moveStrategy: MoveStrategy, coordmask: number, entitymask: number) {
        super(level, x, z, width, length, lifecycle);
        this.moveRestrict = moveRestrict;
        this.blockWalk = blockWalk;
        this.moveStrategy = moveStrategy;
        this.coordmask = coordmask;
        this.entitymask = entitymask;
        this.lastStepX = x - 1;
        this.lastStepZ = z;
    }

    get coord() {
        return CoordGrid.packCoord(this.level, this.x, this.z);
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
        if (this.moveSpeed === MoveSpeed.CRAWL) {
            this.lastCrawl = !this.lastCrawl;
            if (this.lastCrawl && this.walkDir === -1) {
                this.walkDir = this.validateAndAdvanceStep();
            }
        } else if (this.walkDir === -1) {
            // either walk or run speed here.
            this.walkDir = this.validateAndAdvanceStep();
            if (this.moveSpeed === MoveSpeed.RUN && this.walkDir !== -1 && this.runDir === -1) {
                this.runDir = this.validateAndAdvanceStep();
            }
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
                    changeNpcCollision(this.width, previousX, previousZ, previousLevel, false);
                    changeNpcCollision(this.width, this.x, this.z, this.level, true);
                    break;
                case BlockWalk.ALL:
                    changeNpcCollision(this.width, previousX, previousZ, previousLevel, false);
                    changeNpcCollision(this.width, this.x, this.z, this.level, true);
                    changePlayerCollision(this.width, previousX, previousZ, previousLevel, false);
                    changePlayerCollision(this.width, this.x, this.z, this.level, true);
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
        const moveX: number = CoordGrid.moveX(this.x, dir);
        const moveZ: number = CoordGrid.moveZ(this.z, dir);
        this.focus(CoordGrid.fine(moveX, this.width), CoordGrid.fine(moveZ, this.length), false);
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
        const dir: number = CoordGrid.face(previousX, previousZ, x, z);
        const moveX: number = CoordGrid.moveX(this.x, dir);
        const moveZ: number = CoordGrid.moveZ(this.z, dir);
        this.focus(CoordGrid.fine(moveX, this.width), CoordGrid.fine(moveZ, this.length), false);
        this.refreshZonePresence(previousX, previousZ, previousLevel);
        this.lastStepX = this.x - 1;
        this.lastStepZ = this.z;
        this.tele = true;

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
                walkDir = CoordGrid.face(this.lastTickX, this.lastTickZ, this.x, this.z);
                const walkX = CoordGrid.moveX(this.lastTickX, walkDir);
                const walkZ = CoordGrid.moveZ(this.lastTickZ, walkDir);
                runDir = CoordGrid.face(walkX, walkZ, this.x, this.z);
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
     * Face and orient to a specified fine coord.
     * Enable `client` to update connected clients about the new focus, enabling the face_coord mask.
     */
    focus(fineX: number, fineZ: number, client: boolean): void {
        // set the direction of the player/npc every time an interaction is set.
        // does not necessarily require the coord mask to be sent.
        // direction when the player/npc is first observed (updates on movement)
        this.orientationX = fineX;
        this.orientationZ = fineZ;
        if (client) {
            // direction update (only updates from facesquare or interactions)
            this.faceX = fineX;
            this.faceZ = fineZ;
            this.masks |= this.coordmask;
        }
    }

    /**
     * Face and orient back to the default south.
     */
    unfocus(): void {
        this.orientationX = CoordGrid.fine(this.x, this.width);
        this.orientationZ = CoordGrid.fine(this.z - 1, this.length);
    }

    /**
     * Try to focus back on a possible target.
     * This is needed because the target can move.
     * This should be done after all pathing entities have moved.
     * If the entity targeted then moved off, then we try to refocus after running out of steps.
     */
    reorient(): void {
        const target: Entity | null = this.target;
        if (target instanceof PathingEntity) {
            // Try to focus back on a possible target because they move.
            this.focus(CoordGrid.fine(target.x, target.width), CoordGrid.fine(target.z, target.length), false);
        } else if (this.targetX !== -1 && this.stepsTaken === 0) {
            // If the entity targeted then moved off, then we try to refocus after running out of steps.
            // this is only set when clicking non pathing entities.
            // we do not update the client, the client was already notified of the update.
            this.focus(this.targetX, this.targetZ, false);
            this.targetX = -1;
            this.targetZ = -1;
        }
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

    inOperableDistance(target: Entity): boolean {
        if (target.level !== this.level) {
            return false;
        }
        if (target instanceof PathingEntity) {
            return reachedEntity(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width);
        } else if (target instanceof Loc) {
            const forceapproach = LocType.get(target.type).forceapproach;
            return reachedLoc(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width, target.angle, target.shape, forceapproach);
        }
        // instanceof Obj
        return reachedObj(this.level, this.x, this.z, target.x, target.z, target.width, target.length, this.width);
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
        return CoordGrid.distanceTo(this, target) <= range && isApproached(this.level, this.x, this.z, target.x, target.z, this.width, this.length, target.width, target.length);
    }

    pathToMoveClick(input: number[], needsfinding: boolean): void {
        if (this.moveStrategy === MoveStrategy.SMART) {
            if (needsfinding) {
                const { x, z } = CoordGrid.unpackCoord(input[0]);
                this.queueWaypoints(findPath(this.level, this.x, this.z, x, z));
            } else {
                this.queueWaypoints(input);
            }
        } else {
            const { x, z } = CoordGrid.unpackCoord(input[input.length - 1]);
            this.queueWaypoint(x, z);
        }
    }

    pathToPathingTarget(): void {
        if (!this.target) {
            return;
        }

        if (!(this.target instanceof PathingEntity)) {
            this.pathToTarget();
            return;
        }

        if (
            !(this.targetOp === ServerTriggerType.APPLAYER3 || this.targetOp === ServerTriggerType.OPPLAYER3) &&
            Environment.NODE_CLIENT_ROUTEFINDER &&
            CoordGrid.intersects(this.x, this.z, this.width, this.length, this.target.x, this.target.z, this.target.width, this.target.length)
        ) {
            this.queueWaypoints(findNaivePath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.length, this.target.width, this.target.length, 0, CollisionType.NORMAL));
            return;
        }

        if (!this.isLastOrNoWaypoint()) {
            return;
        }

        if (this.targetOp === ServerTriggerType.APPLAYER3 || this.targetOp === ServerTriggerType.OPPLAYER3) {
            this.queueWaypoint(this.target.followX, this.target.followZ);
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

        if (this.moveStrategy === MoveStrategy.SMART) {
            if (this.target instanceof PathingEntity) {
                if (Environment.NODE_CLIENT_ROUTEFINDER && CoordGrid.intersects(this.x, this.z, this.width, this.length, this.target.x, this.target.z, this.target.width, this.target.length)) {
                    this.queueWaypoints(findNaivePath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.length, this.target.width, this.target.length, 0, CollisionType.NORMAL));
                } else {
                    this.queueWaypoints(findPathToEntity(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length));
                }
            } else if (this.target instanceof Loc) {
                const forceapproach = LocType.get(this.target.type).forceapproach;
                this.queueWaypoints(findPathToLoc(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length, this.target.angle, this.target.shape, forceapproach));
            } else if (this.target instanceof Obj && this.x === this.target.x && this.z === this.target.z) {
                this.queueWaypoint(this.target.x, this.target.z); // work around because our findpath() returns 0, 0 if coord and target coord are the same
            } else {
                this.queueWaypoints(findPath(this.level, this.x, this.z, this.target.x, this.target.z));
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
                if (this.width > 1 && !CoordGrid.intersects(this.x, this.z, this.width, this.length, this.target.x, this.target.z, this.target.width, this.target.length)) {
                    // west/east
                    let dir = CoordGrid.face(this.x, 0, this.target.x, 0);
                    const distanceToTarget = CoordGrid.distanceTo({ x: this.x, z: this.z, width: this.width, length: this.length }, { x: this.target.x, z: this.target.z, width: this.target.width, length: this.target.length });
                    if (canTravel(this.level, this.x, this.z, CoordGrid.deltaX(dir), 0, this.width, extraFlag, collisionStrategy) || distanceToTarget <= 1) {
                        this.queueWaypoint(CoordGrid.moveX(this.x, dir), this.z);
                        return;
                    }
                    // north/south
                    dir = CoordGrid.face(0, this.z, 0, this.target.z);
                    if (canTravel(this.level, this.x, this.z, 0, CoordGrid.deltaZ(dir), this.width, extraFlag, collisionStrategy)) {
                        this.queueWaypoint(this.x, CoordGrid.moveZ(this.z, dir));
                        return;
                    }
                }
                this.queueWaypoints(findNaivePath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.length, this.target.width, this.target.length, extraFlag, collisionStrategy));
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

    setInteraction(interaction: Interaction, target: Entity, op: TargetOp, subject?: TargetSubject): boolean {
        if (!target.isValid(this instanceof Player ? this.hash64 : undefined)) {
            return false;
        }

        this.target = target;
        this.targetOp = op;
        this.targetSubject = subject ?? { type: -1, com: -1 };
        this.apRange = 10;
        this.apRangeCalled = false;

        this.focus(CoordGrid.fine(target.x, target.width), CoordGrid.fine(target.z, target.length), target instanceof NonPathingEntity && interaction === Interaction.ENGINE);

        if (target instanceof Player) {
            const pid: number = target.pid + 32768;
            if (this.faceEntity !== pid) {
                this.faceEntity = pid;
                this.masks |= this.entitymask;
            }
        } else if (target instanceof Npc) {
            const nid: number = target.nid;
            if (this.faceEntity !== nid) {
                this.faceEntity = nid;
                this.masks |= this.entitymask;
            }
        } else {
            this.targetX = CoordGrid.fine(target.x, target.width);
            this.targetZ = CoordGrid.fine(target.z, target.length);
        }

        return true;
    }

    clearInteraction(): void {
        this.target = null;
        this.targetOp = -1;
        this.targetSubject = { type: -1, com: -1 };
        this.apRange = 10;
        this.apRangeCalled = false;
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

        this.masks = 0;
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
        this.faceX = -1;
        this.faceZ = -1;

        if (!this.target && this.faceEntity !== -1) {
            this.masks |= this.entitymask;
            this.faceEntity = -1;
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

        const { x, z } = CoordGrid.unpackCoord(this.waypoints[this.waypointIndex]);
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
        if (canTravel(this.level, this.x, this.z, dx, dz, this.width, extraFlag, collisionStrategy)) {
            return dir;
        }

        // check another direction if can travel to chosen dest on current z-axis.
        if (dx != 0 && canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy)) {
            return CoordGrid.face(srcX, srcZ, x, srcZ);
        }

        // check another direction if can travel to chosen dest on current x-axis.
        if (dz != 0 && canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy)) {
            return CoordGrid.face(srcX, srcZ, srcX, z);
        }
        // https://x.com/JagexAsh/status/1727609489954664502
        return null;
    }
}
