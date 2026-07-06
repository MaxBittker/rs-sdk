# Chat: reading, sending, and bot↔bot coordination

## Reading chat — use the helpers, not raw state

Don't slice `getState().gameMessages` — that's a 50-message snapshot that churns
fast under system spam. The SDK accumulates chat across state syncs into a
**500-deep history** (per SDK instance, since connect), and all helpers read
from it:

```typescript
sdk.getChat()                        // last 20 player-chat lines (public + PMs), newest last
sdk.getChat({ limit: 0 })            // full retained history
sdk.getChat({ types: [0] })          // system/game messages instead
sdk.getChat({ includeSelf: true })   // include your own lines
sdk.getChatFrom('partner')           // lines from a specific sender (substring match)
sdk.getNewChat()                     // only lines since your last getNewChat() call
```

`getNewChat()` keeps an internal cursor — poll it in a loop and you'll see each
message exactly once, even if dozens of lines scrolled past between polls.

## Waiting for a message

For coordination, prefer `waitForChat` over polling:

```typescript
await sdk.say('meet me at the bank');
const reply = await sdk.waitForChat({ from: 'partner', timeout: 60_000 });
if (!reply) console.log('no reply within 60s');       // resolves null on timeout

// Filter by content too:
const go = await sdk.waitForChat({ matching: /ready|go/i, timeout: 30_000 });
```

It only matches messages arriving *after* the call, excludes your own messages
by default, and doesn't disturb the `getNewChat()` cursor.

## Sending

- `sdk.sendSay(text)` — one message. The server caps length (default 80 chars,
  see `sdk.maxMessageLength`); the result's `data` reports
  `{ truncated, filtered, finalText }` so you know if it was clipped/censored.
- `sdk.say(longText)` — auto-chunks onto word boundaries and sends in order.
  Use this for anything that might exceed the cap.

## Message anatomy

`GameMessage`: `{ type, text, sender, tick, fromSelf }`.
Type codes: 0 = system/game, 1/2 = public chat, 3/7 = PM received, 6 = PM sent.
Player chat = types 1/2/3/6/7 (the default filter). `sender` has colour/crown
codes already stripped.

## Gotchas

- History starts at connect: a fresh SDK/CLI process only backfills the ~50
  messages still in the client's snapshot window. For long-running coordination,
  keep one process alive rather than re-running short scripts.
- Each SDK instance has its own history and cursor — two scripts on the same
  bot don't share `getNewChat()` state.
- `showChat: false` in the SDK config strips player chat before it reaches the
  history, so `getChat()` will only ever return system lines.
