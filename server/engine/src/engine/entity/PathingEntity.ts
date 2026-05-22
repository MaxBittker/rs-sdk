import { CollisionFlag, CollisionType } from '#/engine/routefinder/index.js';

import LocType from '#/cache/config/LocType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { BlockWalk } from '#/engine/entity/BlockWalk.js';
import Entity from '#/engine/entity/Entity.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import Loc from '#/engine/entity/Loc.js';
import { AllowRepath } from './AllowRepath.js';
import { MoveRestrict } from '#/engine/entity/MoveRestrict.js';
import { MoveSpeed } from '#/engine/entity/MoveSpeed.js';
import { MoveStrategy } from '#/engine/entity/MoveStrategy.js';
import NonPathingEntity from '#/engine/entity/NonPathingEntity.js';
import Npc from '#/engine/entity/Npc.js';
import { NpcMode } from '#/engine/entity/NpcMode.js';
import Obj from '#/engine/entity/Obj.js';
import Player from '#/engine/entity/Player.js';
import { canTravel, changeNpcCollision, changePlayerCollision, findPath, findPathToEntity, findPathToLoc, isApproached, isZoneAllocated, reachedEntity, reachedLoc, reachedObj, findNaivePath } from '#/engine/GameMap.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import NpcType from '#/cache/config/NpcType.js';

type TargetSubject = {
    type: number;
    com: number;
};

export type TargetOp = ServerTriggerType | NpcMode;

export default abstract class PathingEntity extends Entity {
    // constructor properties
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
    allowRepath: AllowRepath = AllowRepath.BEFOREDEST;

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

    // sent on first add
    faceAngleX: number = -1;
    faceAngleZ: number = -1;

    // info updates
    masks: number = 0;
    exactStartX: number = -1;
    exactStartZ: number = -1;
    exactEndX: number = -1;
    exactEndZ: number = -1;
    exactMoveStart: number = -1;
    exactMoveEnd: number = -1;
    exactMoveFacing: number = -1;
    faceSquareX: number = -1;
    faceSquareZ: number = -1;
    faceEntity: number = -1;
    hitmarkSlot: number = 0;
    hitmarkDamage: number = -1;
    hitmarkType: number = -1;
    hitmark2Damage: number = -1;
    hitmark2Type: number = -1;
    animId: number = -1;
    animDelay: number = -1;
    sayMessage: string | null = null;
    spotanimId: number = -1;
    spotanimHeight: number = -1;
    spotanimTime: number = -1;

    protected constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, blockWalk: BlockWalk, moveStrategy: MoveStrategy, coordmask: number, entitymask: number) {
        super(level, x, z, width, length, lifecycle);
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
    abstract updateMovement(): boolean;
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
        const collisionStrategy: CollisionType | null = this.getCollisionStrategy();
        const extraFlag: CollisionFlag = this.blockWalkFlag();

        // Clear waypoints if no movement is allowed
        if (collisionStrategy === null || extraFlag === CollisionFlag.NULL) {
            this.waypointIndex = -1;
        }

        // If no waypoints, return
        if (this.waypointIndex === -1) {
            return -1;
        }

        // If we have a valid collision strategy and extra flag, attempt to take step.
        const delta: [number, number] = this.takeStep();

        const srcX = this.x;
        const srcZ = this.z;

        // Move entity
        this.x = this.x + delta[0];
        this.z = this.z + delta[1];

        // Refresh zone presence if we had a waypoint, even if we didn't move
        this.refreshZonePresence(srcX, srcZ, this.level);

        // Update waypoint index if we reached the current waypoint
        if (this.waypointIndex !== -1) {
            const coord: CoordGrid = CoordGrid.unpackCoord(this.waypoints[this.waypointIndex]);
            if (coord.x === this.x && coord.z === this.z) {
                this.waypointIndex--;
            }
        }

        // If we actually moved, update orientation and steps taken.
        if (this.x !== srcX || this.z !== srcZ) {
            // Focus the tile in front
            const focusX: number = this.x + delta[0];
            const focusZ: number = this.z + delta[1];
            this.focus(CoordGrid.fine(focusX, this.width), CoordGrid.fine(focusZ, this.length), false);
            this.stepsTaken++;
            return CoordGrid.face(srcX, srcZ, this.x, this.z);
        }

        return -1;
    }

    /**
     * Queue this PathingEntity to a single waypoint.
     * @param x The x position of the step.
     * @param z The z position of the step.
     */
    queueWaypoint(x: number, z: number): void {
        this.waypoints[0] = CoordGrid.packCoord(0, x, z); // level doesn't matter here
        this.waypointIndex = 0;
        this.setAllowRepath(AllowRepath.BEFOREDEST);
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
        this.setAllowRepath(AllowRepath.BEFOREDEST);
    }

    setAllowRepath(value: AllowRepath) {
        this.allowRepath = value;
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

        if (!isZoneAllocated(level, x, z) && (!(this instanceof Player) || this.staffModLevel < 3)) {
            if (this instanceof Player) {
                this.messageGame('Invalid teleport!');
            }
            return;
        }

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

    /**
     * Face and orient to a specified fine coord.
     * Enable `client` to update connected clients about the new focus, enabling the face_coord mask.
     */
    focus(fineX: number, fineZ: number, client: boolean): void {
        // set the direction of the player/npc every time an interaction is set.
        // does not necessarily require the coord mask to be sent.
        // direction when the player/npc is first observed (updates on movement)
        this.faceAngleX = fineX;
        this.faceAngleZ = fineZ;
        if (client) {
            // direction update (only updates from facesquare or interactions)
            this.faceSquareX = fineX;
            this.faceSquareZ = fineZ;
            this.masks |= this.coordmask;
        }
    }

    /**
     * Face and orient back to the default south.
     */
    unfocus(): void {
        this.faceAngleX = CoordGrid.fine(this.x, this.width);
        this.faceAngleZ = CoordGrid.fine(this.z - 1, this.length);
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
    isLastWaypoint(): boolean {
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
        // Los for Npcs is always calculated backwards for all Entity types (tested Player and Npc)
        if (this instanceof Npc) {
            return CoordGrid.distanceTo(this, target) <= range && isApproached(this.level, target.x, target.z, this.x, this.z, target.width, target.length, this.width, this.length);
        }
        return CoordGrid.distanceTo(this, target) <= range && isApproached(this.level, this.x, this.z, target.x, target.z, this.width, this.length, target.width, target.length);
    }

    randomWalk(): void {
        let x = this.x,
            z = this.z;
        if (Math.random() < 0.5) {
            x += Math.random() < 0.5 ? -1 : 1;
        } else {
            z += Math.random() < 0.5 ? -1 : 1;
        }
        this.queueWaypoint(x, z);
    }

    naivePathToTarget() {
        if (!this.target) {
            return;
        }
        let angle = 0;
        if (this.target instanceof Loc) {
            angle = this.target.angle;
        }
        const waypoints = findNaivePath(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.length, this.target.width, this.target.length, angle, CollisionType.NORMAL);

        const { x, z } = CoordGrid.unpackCoord(waypoints[0]);
        if (x !== this.x || z !== this.z) {
            this.queueWaypoints(waypoints);
        }
    }

    pathToTarget(): void {
        if (!this.target) {
            return;
        }

        if (this.moveStrategy === MoveStrategy.SMART) {
            if (this.target instanceof PathingEntity) {
                this.queueWaypoints(findPathToEntity(this.level, this.x, this.z, this.target.x, this.target.z, this.width, this.target.width, this.target.length));
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
                this.naivePathToTarget();
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

    setFaceEntity(): void {
        const oldEntity = this.faceEntity;
        if (this.target instanceof Player) {
            const playerSlot: number = this.target.slot + 32768;
            if (this.faceEntity !== playerSlot) {
                this.faceEntity = playerSlot;
            }
        } else if (this.target instanceof Npc) {
            const nid: number = this.target.nid;
            if (this.faceEntity !== nid) {
                this.faceEntity = nid;
            }
        } else {
            this.faceEntity = -1;
        }
        if (this.faceEntity !== oldEntity) {
            this.masks |= this.entitymask;
        }
    }

    setInteraction(interaction: Interaction, target: Entity, op: TargetOp, com?: number): boolean {
        if (!target.isValid(this instanceof Player ? this.hash64 : undefined)) {
            return false;
        }

        this.target = target;
        this.targetOp = op;
        this.apRange = 10;
        this.apRangeCalled = false;

        this.targetSubject.com = com ? com : -1;
        // Remember initial target type for validation
        if (target instanceof Npc || target instanceof Loc || target instanceof Obj) {
            this.targetSubject.type = target.type;
        } else {
            this.targetSubject.type = -1;
        }

        if (interaction === Interaction.SCRIPT) {
            // Allow repath
            this.allowRepath = AllowRepath.BEFOREDEST;
        }

        this.focus(CoordGrid.fine(target.x, target.width), CoordGrid.fine(target.z, target.length), target instanceof NonPathingEntity && interaction === Interaction.ENGINE);

        if (target instanceof NonPathingEntity) {
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
        if (this instanceof Npc) {
            const type: NpcType = NpcType.get(this.type);
            if (type.moverestrict === MoveRestrict.NORMAL) {
                return CollisionType.NORMAL;
            } else if (type.moverestrict === MoveRestrict.BLOCKED) {
                return CollisionType.BLOCKED;
            } else if (type.moverestrict === MoveRestrict.BLOCKED_NORMAL) {
                return CollisionType.LINE_OF_SIGHT;
            } else if (type.moverestrict === MoveRestrict.INDOORS) {
                return CollisionType.INDOORS;
            } else if (type.moverestrict === MoveRestrict.OUTDOORS) {
                return CollisionType.OUTDOORS;
            } else if (type.moverestrict === MoveRestrict.NOMOVE) {
                return null;
            } else if (type.moverestrict === MoveRestrict.PASSTHRU) {
                return CollisionType.NORMAL;
            }
        }
        return CollisionType.NORMAL;
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
        this.exactMoveFacing = -1;
        this.animId = -1;
        this.animDelay = -1;
        this.animId = -1;
        this.animDelay = -1;
        this.sayMessage = null;
        this.hitmarkDamage = -1;
        this.hitmarkType = -1;
        this.hitmark2Damage = -1;
        this.hitmark2Type = -1;
        this.hitmarkSlot = 0;
        this.spotanimId = -1;
        this.spotanimHeight = -1;
        this.spotanimTime = -1;
        this.faceSquareX = -1;
        this.faceSquareZ = -1;

        this.setFaceEntity();
    }

    private takeStep(): [number, number] {
        // dir -1 means we reached the destination.
        // dir null means nothing happened
        if (this.waypointIndex === -1) {
            // failsafe check
            return [0, 0];
        }

        const collisionStrategy: CollisionType | null = this.getCollisionStrategy();
        const extraFlag: CollisionFlag = this.blockWalkFlag();

        if (collisionStrategy === null) {
            // failsafe check
            return [0, 0];
        }

        const srcX: number = this.x;
        const srcZ: number = this.z;

        const { x, z } = CoordGrid.unpackCoord(this.waypoints[this.waypointIndex]);

        const dir: number = CoordGrid.face(srcX, srcZ, x, z);
        const dx: number = CoordGrid.deltaX(dir);
        const dz: number = CoordGrid.deltaZ(dir);

        // Noclip stuff, I guess. God mode
        if (this.moveStrategy === MoveStrategy.FLY) {
            return [dx, dz];
        }

        // Move diagonal
        if (this.width === 1 && canTravel(this.level, this.x, this.z, dx, dz, this.width, extraFlag, collisionStrategy)) {
            return [dx, dz];
        }

        // Move E/W
        if (dx != 0 && canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy)) {
            return [dx, 0];
        }

        // Move N/S
        if (dz != 0 && canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy)) {
            return [0, dz];
        }
        // https://x.com/JagexAsh/status/1727609489954664502
        return [0, 0];
    }
}
