import Entity from '#lostcity/entity/Entity.js';
import {Position} from '#lostcity/entity/Position.js';
import World from '#lostcity/engine/World.js';
import RouteCoordinates from '#rsmod/RouteCoordinates.js';
import Npc from '#lostcity/entity/Npc.js';
import { MoveRestrict } from '#lostcity/entity/MoveRestrict.js';
import CollisionFlag from '#rsmod/flag/CollisionFlag.js';

export default abstract class PathingEntity extends Entity {
    // constructor properties
    moveRestrict: MoveRestrict;

    // runtime properties
    walkDir = -1;
    walkStep = -1;
    walkQueue: { x: number, z: number }[] = [];
    forceMove = false;
    lastX = -1;
    lastZ = -1;

    protected constructor(level: number, x: number, z: number, width: number, length: number, moveRestrict: MoveRestrict) {
        super(level, x, z, width, length);
        this.moveRestrict = moveRestrict;
    }

    abstract updateMovement(): void;

    updateMovementStep(): number {
        const dst = this.walkQueue[this.walkStep];
        let dir = Position.face(this.x, this.z, dst.x, dst.z);

        if (this.validateStep(dir)) {
            this.x = Position.moveX(this.x, dir);
            this.z = Position.moveZ(this.z, dir);
        } else {
            dir = -1;
        }

        if (dir == -1) {
            this.walkStep--;

            if (this.walkStep < this.walkQueue.length - 1 && this.walkStep != -1) {
                dir = this.updateMovementStep();
            }
        }

        return dir;
    }

    queueWalkWaypoint(x: number, z: number): void {
        this.walkQueue = [];
        this.walkQueue.push({ x: x, z: z });
        this.walkQueue.reverse();
        this.walkStep = this.walkQueue.length - 1;
    }

    queueWalkWaypoints(waypoints: RouteCoordinates[]): void {
        this.walkQueue = [];
        for (const waypoint of waypoints) {
            this.walkQueue.push({ x: waypoint.x, z: waypoint.z });
        }
        this.walkQueue.reverse();
        this.walkStep = this.walkQueue.length - 1;
    }

    hasSteps() {
        return this.walkStep !== -1 && this.walkStep < this.walkQueue.length;
    }

    private validateStep(dir: number): boolean {
        // check if force moving.
        if (this.forceMove) {
            return false;
        }

        // check if moved off current pos.
        const dx = Position.deltaX(dir);
        const dz = Position.deltaZ(dir);
        if (dx == 0 && dz == 0) {
            return false;
        }

        // npc walking gets check for BLOCK_NPC flag.
        const extraFlag = this instanceof Npc ? CollisionFlag.BLOCK_NPC : CollisionFlag.OPEN;
        return World.collisionManager.canTravelWithStrategy(this.level, this.x, this.z, dx, dz, this.width, extraFlag, this.moveRestrict);
    }
}
