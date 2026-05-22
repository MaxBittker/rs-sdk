import { Packet } from './packet.js';

export interface InfoMessage {
    encode(buf: Packet): void;
    test(): number;
    persists(): boolean;
}

export class PlayerInfoAppearance implements InfoMessage {
    constructor(private readonly bytes: Uint8Array) {}

    encode(buf: Packet): void {
        buf.p1(this.bytes.length);
        buf.pdata(this.bytes, 0, this.bytes.length);
    }

    test(): number {
        return 1 + this.bytes.length;
    }

    persists(): boolean {
        return true;
    }
}

export class PlayerInfoFaceEntity implements InfoMessage {
    constructor(private readonly entity: number) {}

    encode(buf: Packet): void {
        buf.p2(this.entity);
    }

    test(): number {
        return 2;
    }

    persists(): boolean {
        return false;
    }
}

export class PlayerInfoFaceCoord implements InfoMessage {
    constructor(
        private readonly x: number,
        private readonly z: number
    ) {}

    encode(buf: Packet): void {
        buf.p2(this.x);
        buf.p2(this.z);
    }

    test(): number {
        return 4;
    }

    persists(): boolean {
        return false;
    }
}

export class PlayerInfoAnim implements InfoMessage {
    constructor(
        private readonly anim: number,
        private readonly delay: number
    ) {}

    encode(buf: Packet): void {
        buf.p2(this.anim);
        buf.p1(this.delay);
    }

    test(): number {
        return 3;
    }

    persists(): boolean {
        return false;
    }
}

export class PlayerInfoSay implements InfoMessage {
    constructor(private readonly say: string) {}

    encode(buf: Packet): void {
        buf.pjstr(this.say, 10);
    }

    test(): number {
        return 1 + this.say.length;
    }

    persists(): boolean {
        return false;
    }
}

export class PlayerInfoDamage implements InfoMessage {
    constructor(
        private readonly damage: number,
        private readonly damageType: number,
        private readonly currentHitpoints: number,
        private readonly baseHitpoints: number
    ) {}

    encode(buf: Packet): void {
        buf.p1(this.damage);
        buf.p1(this.damageType);
        buf.p1(this.currentHitpoints);
        buf.p1(this.baseHitpoints);
    }

    test(): number {
        return 4;
    }

    persists(): boolean {
        return false;
    }
}

export class PlayerInfoChat implements InfoMessage {
    constructor(
        private readonly bytes: Uint8Array,
        private readonly color: number,
        private readonly effect: number,
        private readonly ignored: number
    ) {}

    encode(buf: Packet): void {
        buf.p1(this.color);
        buf.p1(this.effect);
        buf.p1(this.ignored);
        buf.p1(this.bytes.length);
        buf.pdata(this.bytes, 0, this.bytes.length);
    }

    test(): number {
        return 4 + this.bytes.length;
    }

    persists(): boolean {
        return false;
    }
}

export class PlayerInfoSpotanim implements InfoMessage {
    constructor(
        private readonly graphicId: number,
        private readonly graphicHeight: number,
        private readonly graphicDelay: number
    ) {}

    encode(buf: Packet): void {
        buf.p2(this.graphicId);
        buf.p4((this.graphicHeight << 16) | this.graphicDelay);
    }

    test(): number {
        return 6;
    }

    persists(): boolean {
        return false;
    }
}

export class PlayerInfoExactMove implements InfoMessage {
    constructor(
        private readonly startX: number,
        private readonly startZ: number,
        private readonly endX: number,
        private readonly endZ: number,
        private readonly begin: number,
        private readonly finish: number,
        private readonly dir: number
    ) {}

    encode(buf: Packet): void {
        buf.p1(this.startX);
        buf.p1(this.startZ);
        buf.p1(this.endX);
        buf.p1(this.endZ);
        buf.p2(this.begin);
        buf.p2(this.finish);
        buf.p1(this.dir);
    }

    test(): number {
        return 9;
    }

    persists(): boolean {
        return false;
    }
}

export class NpcInfoFaceEntity implements InfoMessage {
    constructor(private readonly entity: number) {}

    encode(buf: Packet): void {
        buf.p2(this.entity);
    }

    test(): number {
        return 2;
    }

    persists(): boolean {
        return false;
    }
}

export class NpcInfoFaceCoord implements InfoMessage {
    constructor(
        private readonly x: number,
        private readonly z: number
    ) {}

    encode(buf: Packet): void {
        buf.p2(this.x);
        buf.p2(this.z);
    }

    test(): number {
        return 4;
    }

    persists(): boolean {
        return false;
    }
}

export class NpcInfoAnim implements InfoMessage {
    constructor(
        private readonly anim: number,
        private readonly delay: number
    ) {}

    encode(buf: Packet): void {
        buf.p2(this.anim);
        buf.p1(this.delay);
    }

    test(): number {
        return 3;
    }

    persists(): boolean {
        return false;
    }
}

export class NpcInfoSay implements InfoMessage {
    constructor(private readonly say: string) {}

    encode(buf: Packet): void {
        buf.pjstr(this.say, 10);
    }

    test(): number {
        return 1 + this.say.length;
    }

    persists(): boolean {
        return false;
    }
}

export class NpcInfoDamage implements InfoMessage {
    constructor(
        private readonly damage: number,
        private readonly damageType: number,
        private readonly currentHitpoints: number,
        private readonly baseHitpoints: number
    ) {}

    encode(buf: Packet): void {
        buf.p1(this.damage);
        buf.p1(this.damageType);
        buf.p1(this.currentHitpoints);
        buf.p1(this.baseHitpoints);
    }

    test(): number {
        return 4;
    }

    persists(): boolean {
        return false;
    }
}

export class NpcInfoChangeType implements InfoMessage {
    constructor(private readonly changeType: number) {}

    encode(buf: Packet): void {
        buf.p2(this.changeType);
    }

    test(): number {
        return 2;
    }

    persists(): boolean {
        return false;
    }
}

export class NpcInfoSpotanim implements InfoMessage {
    constructor(
        private readonly graphicId: number,
        private readonly graphicHeight: number,
        private readonly graphicDelay: number
    ) {}

    encode(buf: Packet): void {
        buf.p2(this.graphicId);
        buf.p4((this.graphicHeight << 16) | this.graphicDelay);
    }

    test(): number {
        return 6;
    }

    persists(): boolean {
        return false;
    }
}
