export default abstract class Entity {
    // position
    level: number;
    x: number;
    z: number;

    // size
    width: number;
    length: number;

    // runtime variables
    despawn: number = -1;
    respawn: number = -1;

    protected constructor(level: number, x: number, z: number, width: number, length: number) {
        this.level = level;
        this.x = x;
        this.z = z;
        this.width = width;
        this.length = length;
    }

    abstract resetEntity(respawn: boolean): void;
}
