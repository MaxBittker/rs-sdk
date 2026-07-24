#!/usr/bin/env bun
/**
 * Logic tests for the SDK chat system — no bot required.
 *
 * Covers the accumulated ChatHistory buffer (merge/dedup across state-sync
 * snapshots, publication-split edge case, page-reload cursor reset, retention cap) and
 * the SDK surface built on it (getChat, getNewChat cursor, getChatFrom,
 * waitForChat), driving the SDK through its real handleMessage path.
 */

import { BotSDK } from '../index';
import { ChatHistory } from '../chat-history';
import type { GameMessage } from '../types';

let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
    if (ok) {
        console.log(`  ok  ${label}`);
    } else {
        failures++;
        console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

let nextId = 0;
function msg(tick: number, text: string, opts: Partial<GameMessage> = {}): GameMessage {
    nextId++;
    return {
        type: opts.type ?? 2,
        text,
        sender: opts.sender ?? 'partner',
        tick,
        observationId: opts.observationId,
        fromSelf: opts.fromSelf ?? false,
    };
}

function texts(messages: GameMessage[]): string {
    return messages.map(m => m.text).join(',');
}

function pushState(sdk: BotSDK, gameMessages: GameMessage[]): void {
    (sdk as any).handleMessage(JSON.stringify({
        type: 'sdk_state',
        state: { gameMessages },
    }));
}

async function run(): Promise<void> {
    console.log('ChatHistory.record():');

    // 1. First snapshot is recorded verbatim
    {
        const h = new ChatHistory();
        const fresh = h.record([msg(10, 'a'), msg(11, 'b')]);
        check('first snapshot recorded verbatim',
            fresh.length === 2 && texts(h.all()) === 'a,b');
    }

    // 2. Overlapping snapshots are deduplicated
    {
        const h = new ChatHistory();
        h.record([msg(10, 'a'), msg(11, 'b')]);
        const fresh = h.record([msg(10, 'a'), msg(11, 'b'), msg(12, 'c')]);
        check('overlapping snapshot only appends the new tail',
            texts(fresh) === 'c' && texts(h.all()) === 'a,b,c',
            `fresh=${texts(fresh)} all=${texts(h.all())}`);
    }

    // 3. Identical snapshot (idle tick resync) appends nothing
    {
        const h = new ChatHistory();
        h.record([msg(10, 'a'), msg(11, 'b')]);
        const fresh = h.record([msg(10, 'a'), msg(11, 'b')]);
        check('identical snapshot appends nothing',
            fresh.length === 0 && h.all().length === 2);
    }

    // 4. Same-tick split across snapshots: a chat packet processed after the
    //    PLAYER_INFO that triggered the previous sync shares its loopCycle.
    //    The surplus same-tick message must still be picked up.
    {
        const h = new ChatHistory();
        h.record([msg(10, 'a'), msg(11, 'b1')]);
        const fresh = h.record([msg(10, 'a'), msg(11, 'b1'), msg(11, 'b2'), msg(12, 'c')]);
        check('picks up surplus messages sharing the last-held tick',
            texts(fresh) === 'b2,c' && texts(h.all()) === 'a,b1,b2,c',
            `fresh=${texts(fresh)}`);
    }

    // A duplicate identical message at the same raw game tick remains distinct
    // when it first becomes visible in a later publication.
    {
        const h = new ChatHistory();
        h.record([msg(11, 'same', { observationId: 2 })]);
        const fresh = h.record([
            msg(11, 'same', { observationId: 2 }),
            msg(11, 'same', { observationId: 3 })
        ]);
        check('keeps identical same-tick messages from later publications',
            fresh.length === 1 && fresh[0]!.observationId === 3 && h.all().length === 2);
    }

    // 5. Snapshot window slid past history (heavy spam): older-than-held
    //    messages in the snapshot are new... they can't be — the window only
    //    slides forward. All-newer snapshot appends everything.
    {
        const h = new ChatHistory();
        h.record([msg(10, 'a'), msg(11, 'b')]);
        const fresh = h.record([msg(20, 'x'), msg(21, 'y')]);
        check('disjoint newer snapshot appends everything',
            texts(fresh) === 'x,y' && texts(h.all()) === 'a,b,x,y');
    }

    // 6. Tick reset (page reload → loopCycle restarts, fresh ring): everything
    //    in the snapshot is treated as new instead of being dropped forever.
    {
        const h = new ChatHistory();
        h.record([msg(30000, 'old1'), msg(30001, 'old2')]);
        const fresh = h.record([msg(5, 'new1'), msg(6, 'new2')]);
        check('tick reset re-baselines instead of dropping messages',
            texts(fresh) === 'new1,new2' && texts(h.all()) === 'old1,old2,new1,new2',
            `fresh=${texts(fresh)}`);
    }

    // 7. Retention cap trims oldest, and since() cursors survive trimming
    {
        const h = new ChatHistory(3);
        h.record([msg(1, 'a'), msg(2, 'b')]);
        const cursor = h.seen; // 2
        h.record([msg(3, 'c'), msg(4, 'd'), msg(5, 'e')]);
        check('cap trims oldest messages',
            h.all().length === 3 && texts(h.all()) === 'c,d,e');
        check('since() returns post-cursor messages after trimming',
            texts(h.since(cursor)) === 'c,d,e');
        check('since() clamps when cursor predates retained buffer',
            h.since(0).length === 3);
    }

    // 8. Empty snapshot is a no-op
    {
        const h = new ChatHistory();
        h.record([msg(1, 'a')]);
        const fresh = h.record([]);
        check('empty snapshot is a no-op', fresh.length === 0 && h.all().length === 1);
    }

    console.log('');
    console.log('BotSDK chat surface (via handleMessage):');

    // 9. getChat accumulates beyond a single snapshot window
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, [msg(10, 'first')]);
        pushState(sdk, [msg(10, 'first'), msg(11, 'second')]);
        pushState(sdk, [msg(20, 'third')]); // window slid past 'first'/'second'
        const chat = sdk.getChat({ limit: 0 });
        check('getChat retains messages evicted from the snapshot window',
            texts(chat) === 'first,second,third',
            texts(chat));
    }

    // 10. getChat default filters: player chat only, no self
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, [
            msg(10, 'sys', { type: 0, sender: '' }),
            msg(11, 'hello'),
            msg(12, 'me', { fromSelf: true, sender: 'test' }),
        ]);
        check('getChat defaults exclude system and self',
            texts(sdk.getChat()) === 'hello');
        check('getChat types:[0] returns system messages',
            texts(sdk.getChat({ types: [0] })) === 'sys');
        check('getChat includeSelf returns own messages',
            texts(sdk.getChat({ includeSelf: true })) === 'hello,me');
    }

    // 11. getNewChat cursor: no re-shows, catches messages evicted between polls
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, [msg(10, 'a')]);
        check('getNewChat first call returns backlog', texts(sdk.getNewChat()) === 'a');
        check('getNewChat repeat call returns nothing', sdk.getNewChat().length === 0);
        pushState(sdk, [msg(10, 'a'), msg(11, 'b')]);
        pushState(sdk, [msg(20, 'c'), msg(21, 'd')]); // 'b' already out of window
        check('getNewChat returns everything since last call, even if evicted from window',
            texts(sdk.getNewChat()) === 'b,c,d');
    }

    // 12. getNewChat with same-tick arrival after cursor read (old tick-cursor bug)
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, [msg(10, 'a')]);
        sdk.getNewChat();
        pushState(sdk, [msg(10, 'a'), msg(10, 'a2')]); // same tick, arrived later
        check('getNewChat does not drop later same-tick messages',
            texts(sdk.getNewChat()) === 'a2');
    }

    // 13. getChatFrom matches sender substring, ignores system messages
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, [
            msg(10, 'sys', { type: 0, sender: '' }),
            msg(11, 'hi', { sender: 'HelperBot' }),
            msg(12, 'yo', { sender: 'stranger' }),
        ]);
        check('getChatFrom matches case-insensitive substring',
            texts(sdk.getChatFrom('helper')) === 'hi');
        check('getChatFrom("") never matches system messages',
            sdk.getChatFrom('').every(m => m.sender !== ''));
    }

    // 14. showChat:false keeps player chat out of the history
    {
        const sdk = new BotSDK({ botUsername: 'test', showChat: false });
        pushState(sdk, [msg(10, 'hello'), msg(11, 'sys', { type: 0, sender: '' })]);
        check('showChat:false excludes player chat from history',
            sdk.getChat({ limit: 0, types: [0, 1, 2, 3, 6, 7] }).every(m => m.type === 0));
    }

    // 15. waitForChat resolves on a matching message arriving later
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, [msg(10, 'before')]);
        const promise = sdk.waitForChat({ from: 'partner', matching: /ready/i, timeout: 2000 });
        pushState(sdk, [msg(10, 'before'), msg(11, 'noise', { sender: 'stranger' })]);
        pushState(sdk, [msg(11, 'noise', { sender: 'stranger' }), msg(12, 'READY to go', { sender: 'Partner' })]);
        const got = await promise;
        check('waitForChat resolves with the first matching message',
            got !== null && got.text === 'READY to go',
            JSON.stringify(got));
    }

    // 16. waitForChat ignores pre-existing messages and returns null on timeout
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, [msg(10, 'ready')]); // already there before the wait
        const got = await sdk.waitForChat({ matching: /ready/, timeout: 100 });
        check('waitForChat ignores messages that arrived before the call (null on timeout)',
            got === null, JSON.stringify(got));
    }

    // 17. waitForChat excludes own messages by default
    {
        const sdk = new BotSDK({ botUsername: 'test' });
        pushState(sdk, []);
        const promise = sdk.waitForChat({ matching: /ping/, timeout: 100 });
        pushState(sdk, [msg(11, 'ping', { fromSelf: true, sender: 'test' })]);
        const got = await promise;
        check('waitForChat excludes own messages by default', got === null);
    }

    console.log('');
    if (failures === 0) {
        console.log('PASSED — all cases');
        process.exit(0);
    } else {
        console.log(`FAILED — ${failures} case(s) failed`);
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
