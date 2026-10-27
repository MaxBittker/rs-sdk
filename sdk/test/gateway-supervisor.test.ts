import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the production gateway supervisor retries a failed gateway under set -e', async () => {
    const dockerfile = readFileSync(join(import.meta.dir, '../../server/Dockerfile'), 'utf8');
    const loop = dockerfile.match(/    while true; do\n[\s\S]*?\n    done/)?.[0];
    expect(loop).toBeDefined();
    // The entrypoint enables errexit. Fail the first launch, then stop the
    // harness on the second launch; avoid the real gateway and retry delay.
    const proc = Bun.spawn(['bash', '-e', '-c', `
        attempts=0
        bun() {
            attempts=$((attempts + 1))
            echo "launch $attempts"
            if [ "$attempts" -eq 1 ]; then return 7; fi
            exit 0
        }
        sleep() { :; }
        ${loop}
    `], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stdout, stderr] = await Promise.all([
        proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain('launch 1');
    expect(stdout).toContain('launch 2');
    expect(stderr).toContain('Gateway exited (code 7), restarting in 2s');
});
