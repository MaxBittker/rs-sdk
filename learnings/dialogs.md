# Dialogs & UI

Successful patterns for handling game dialogs and interfaces.

## Dismissing Level-Up Dialogs

Level-up dialogs block all actions. Dismiss them immediately:

```typescript
if (state.dialog.isOpen) {
  await ctx.sdk.sendClickDialog(0);
  continue; // Skip rest of loop iteration
}
```

## Dismiss at Arc Start

All BotActions methods automatically dismiss blocking UI before executing. Manual dismissal is only needed when using low-level sdk methods directly:

```typescript
await ctx.bot.dismissBlockingUI();
```

## Checking Dialog State

```typescript
const dialog = ctx.sdk.getState()?.dialog;

// Is any dialog open?
if (dialog.isOpen) { ... }

// Is dialog waiting for input?
if (dialog.isOpen && !dialog.isWaiting) { ... }

// Get available options
for (const opt of dialog.options) {
    console.log(`${opt.index}: ${opt.text}`);
}
```

## Navigating Multi-Step Dialogs

For NPC conversations with choices:

```typescript
// Click through until specific option appears
for (let i = 0; i < 20; i++) {
  const s = ctx.sdk.getState();
  if (!s?.dialog.isOpen) {
    await new Promise((r) => setTimeout(r, 150));
    continue;
  }

  // Look for target option
  const targetOpt = s.dialog.options.find((o) => /yes/i.test(o.text));
  if (targetOpt) {
    await ctx.sdk.sendClickDialog(targetOpt.index);
    break;
  }

  // Otherwise click to continue
  await ctx.sdk.sendClickDialog(0);
  await new Promise((r) => setTimeout(r, 200));
}
```

## Shop Interfaces

```typescript
// Check if shop is open
if (state.shop.isOpen) { ... }

// Check if any interface is open (bank, shop, etc.)
if (state.interface?.isOpen) { ... }
```

## sendClickDialog Index Behavior

- `sendClickDialog(0)` = special "continue" action (RESUME_PAUSEBUTTON)
- `sendClickDialog(1-5)` = click actual option buttons (1-based indices)

Always use `0` as fallback for "Click here to continue" screens.

## Al Kharid Toll Gate Pattern

Requires 10gp. Position west of gate: (3267, 3228).

```typescript
const gate = ctx.sdk.getState()?.nearbyLocs.find((l) => /gate/i.test(l.name));
await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, 1);
await sleep(1000);

// Click through dialog: 0 = continue, or pick "Yes" when available
for (let i = 0; i < 10; i++) {
  const yesOpt = ctx.sdk
    .getState()
    ?.dialog?.options.find((o) => /yes/i.test(o.text));
  await ctx.sdk.sendClickDialog(yesOpt?.index ?? 0);
  await sleep(300);
}

await ctx.bot.walkTo(3277, 3227); // Walk through to Al Kharid
```

## Buying Kebabs from the Kebab Seller (Al Kharid)

Sells kebabs via dialog (not a shop interface). Location: (3273, 3180), spawns at (3272, 3182).

```typescript
// Walk to kebab seller
await ctx.bot.walkTo(3273, 3180);

// Find the kebab seller
const seller = ctx.sdk
  .getState()
  ?.nearbyNpcs.find((n) => /kebab/i.test(n.name));
const talkOpt = seller.optionsWithIndex.find((o) => /talk/i.test(o.text));
await ctx.sdk.sendInteractNpc(seller.index, talkOpt.opIndex);
await new Promise((r) => setTimeout(r, 1000));

// Handle dialog to buy kebab (1gp each)
for (let i = 0; i < 15; i++) {
  const s = ctx.sdk.getState();
  if (!s?.dialog.isOpen) {
    await new Promise((r) => setTimeout(r, 200));
    continue;
  }
  const buyOpt = s.dialog.options.find((o) => /yes/i.test(o.text));
  if (buyOpt) {
    await ctx.sdk.sendClickDialog(buyOpt.index);
    break;
  }
  await ctx.sdk.sendClickDialog(0);
  await new Promise((r) => setTimeout(r, 300));
}
```

Kebabs cost 1gp and heal 1-19 HP (random). Good cheap food for training.

## Detecting Stuck in Dialog

If your script makes no progress, check for stuck dialogs:

```typescript
// In your main loop
if (state.dialog.isOpen) {
  console.log("Dialog open, dismissing...");
  await ctx.sdk.sendClickDialog(0);
  continue;
}
```
