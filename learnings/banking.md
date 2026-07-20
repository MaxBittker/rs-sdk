# Banking

Successful patterns for bank interactions.

## Opening the Bank


```typescript
// Open bank (finds banker NPC or booth automatically)
const openResult = await ctx.bot.openBank();
if (!openResult.success) {
    console.log(`Failed to open bank: ${openResult.message}`);
}

// Deposit item by name
const depositResult = await ctx.bot.depositItem(/coins/i);  // deposits all
const depositResult = await ctx.bot.depositItem(/sword/i, 1);  // deposits 1

// Withdraw item by bank slot
const withdrawResult = await ctx.bot.withdrawItem(0);  // withdraws 1 from slot 0
const withdrawResult = await ctx.bot.withdrawItem(0, -1);  // withdraws all from slot 0

// Close bank
await ctx.bot.closeBank();
```



## Depositing Items

```typescript
// Deposit specific item
const ore = ctx.sdk.getState()?.inventory.find(i => /ore$/i.test(i.name));
if (ore) {
    await ctx.sdk.sendBankDeposit(ore.slot, ore.count);
    await new Promise(r => setTimeout(r, 200));
}

// Deposit all of a type
const ores = ctx.sdk.getState()?.inventory.filter(i => /ore$/i.test(i.name)) ?? [];
for (const ore of ores) {
    await ctx.sdk.sendBankDeposit(ore.slot, ore.count);
    await new Promise(r => setTimeout(r, 200));
}
```

## Deposit All of an Item

Use `-1` as the quantity to deposit all of an item type. 

```typescript
// High-level (recommended)
await ctx.bot.depositItem(/bones/i, -1);  // Deposits ALL bones (even if in 5 separate slots)
await ctx.bot.depositItem(/coins/i, -1);  // Deposits ALL coins (stacked)

// Low-level
await ctx.sdk.sendBankDeposit(slot, -1);  // Deposits ALL items of that type from ANY slot
```


## Withdrawing Items

```typescript
// bankSlot is the position in the bank, not inventory
await ctx.sdk.sendBankWithdraw(bankSlot, count);
```

## Closing the Bank

```typescript
// High-level (recommended)
await ctx.bot.closeBank();

// Low-level (works for any modal interface)
await ctx.sdk.sendCloseModal();
await new Promise(r => setTimeout(r, 500));
```

## Bank Locations (THERE IS NOT BANK IN LUMBRIDGE in 2004scape)

| Bank | Coordinates | Notes |
|------|-------------|-------|
| Varrock West | (3185, 3436) | Close to GE |
| Draynor | (3092, 3243) | Ground floor |
| Al Kharid | (3269, 3167) | Requires toll or quest |
... others

## Full Banking Loop Pattern

```typescript
async function bankTrip(ctx, itemPattern, bankCoords, returnCoords) {
    // Walk to bank
    await ctx.bot.walkTo(bankCoords.x, bankCoords.z);

    // Open bank (automatically finds banker/booth)
    const openResult = await ctx.bot.openBank();
    if (!openResult.success) {
        console.log(`Failed to open bank: ${openResult.message}`);
        return;
    }

    // Deposit all items matching pattern (one call deposits ALL, even non-stackable)
    await ctx.bot.depositItem(itemPattern, -1);

    // Close bank and return
    await ctx.bot.closeBank();
    await ctx.bot.walkTo(returnCoords.x, returnCoords.z);
}
```


### Key Learnings from Cow hide Banking
1. **Gate exit threshold**: Use `z < 3268` not `z < 3265` for cow field
2. **Always open gate first**: `openDoor(/gate/i)` before walking through
3. **Use sendWalk for gate traversal**: More reliable than pathfinder
4. **Banking works at Varrock West**: (3185, 3436) confirmed working
