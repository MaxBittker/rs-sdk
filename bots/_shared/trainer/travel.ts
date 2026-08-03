import type { BotActions } from '../../../sdk/actions';
import type { BotSDK } from '../../../sdk/index';
import type { WorldPoint } from './types';
import { distanceSq } from './knowledge/world';

export async function walkToPoint(
    bot: BotActions,
    sdk: BotSDK,
    point: WorldPoint,
    label?: string,
): Promise<boolean> {
    const player = sdk.getState()?.player;
    if (!player) return false;
    const dist = Math.sqrt(distanceSq({ x: player.worldX, z: player.worldZ }, point));
    if (dist <= 4) return true;
    console.log(`[travel] → ${label ?? point.label ?? 'point'} (${point.x}, ${point.z}) dist≈${dist.toFixed(0)}`);
    const result = await bot.walkTo(point.x, point.z);
    return !!result?.success;
}
