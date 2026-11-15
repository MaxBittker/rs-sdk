#!/usr/bin/env bun
// Bug reports - file SDK papercuts to the drop box on the server.
//
// One text field, no auth, no setup. The git commit is stamped automatically so
// a report can be traced back to the SDK that produced it.
//
//   bun sdk/bug-report.ts "walkTo lies about success at closed gates"
//   bun sdk/bug-report.ts --version
//
// Submission is write-only: filed reports are read off the server directly
// (fly ssh console -C 'cat /opt/server/data/bug-reports.jsonl'), not over HTTP.
//
// Opt out with TELEMETRY=false (in bot.env or the environment).

import { execFileSync } from 'node:child_process';

/**
 * Where reports go. Always the shared server, never whatever SERVER a bot happens
 * to be pointed at - a bug found while testing against localhost is still a bug in
 * the SDK, and a report that lands on a throwaway local server helps nobody.
 */
const ENDPOINT = 'https://rs-sdk.maxbittker.com/bug-report';

/** The git commit this SDK is running from, or 'unknown' outside a git checkout. */
function sdkCommit(): string {
    try {
        return execFileSync('git', ['-C', import.meta.dir, 'rev-parse', '--short', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch {
        return 'unknown';
    }
}

/**
 * Telemetry (i.e. bug reports leaving this machine) is on by default.
 * Set TELEMETRY to false/0/no/off to disable it.
 */
function telemetryEnabled(): boolean {
    const value = process.env.TELEMETRY?.trim().toLowerCase();
    if (!value) return true;
    return !['false', '0', 'no', 'off'].includes(value);
}

async function main() {
    const argv = process.argv.slice(2);

    if (!argv.length || argv[0] === '--help') {
        console.log(`Usage:
  bun sdk/bug-report.ts "<what went wrong>"
  bun sdk/bug-report.ts --version

Reports always go to ${ENDPOINT} (no auth, write-only),
regardless of which server the bot plays on.
Telemetry is ${telemetryEnabled() ? 'on' : 'off'}; set TELEMETRY=false to disable it.`);
        return;
    }

    if (argv[0] === '--version') {
        console.log(sdkCommit());
        return;
    }

    const text = argv.join(' ').trim();
    if (!text) {
        console.error('Nothing to report: describe what went wrong');
        process.exit(1);
    }

    if (!telemetryEnabled()) {
        console.log('Telemetry is off (TELEMETRY=false), report not sent');
        return;
    }

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sdkVersion: sdkCommit() }),
        signal: AbortSignal.timeout(15000)
    });

    const body = await response.text();
    let parsed: any = null;
    try { parsed = JSON.parse(body); } catch { /* non-JSON error page */ }

    if (!response.ok || !parsed?.ok) {
        console.error(`Bug report failed: ${parsed?.error ?? `${response.status} ${response.statusText}: ${body.slice(0, 200)}`}`);
        process.exit(1);
    }

    console.log(`Filed ${parsed.id} (sdk ${sdkCommit()})`);
}

main().catch(err => {
    console.error(`Bug report failed: ${err.message}`);
    process.exit(1);
});
