export default class RotationUtils {
    static rotate(locRot, dimensionA, dimensionB) {
        return (locRot & 0x1) != 0 ? dimensionB : dimensionA;
    }

    static rotateFlags(locRot, blockAccessFlags) {
        return locRot == 0 ? blockAccessFlags : ((blockAccessFlags << locRot) & 0xF) | (blockAccessFlags >> (4 - locRot));
    }
}
