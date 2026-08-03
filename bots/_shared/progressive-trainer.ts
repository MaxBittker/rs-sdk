/**
 * Compat entry — bots import this single module.
 * Outer reconnect loop keeps the progressive bot alive across client drops.
 */
import { runTrainer } from './trainer/runtime';

const RESTART_DELAY_MS = 5000;

while (true) {
    try {
        await runTrainer();
        console.log('[progressive] trainer exited cleanly');
        break;
    } catch (err) {
        console.error(
            '[progressive] trainer crashed, restarting in 5s:',
            err instanceof Error ? err.message : err,
        );
        await Bun.sleep(RESTART_DELAY_MS);
    }
}
