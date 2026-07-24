# Banking

Successful patterns for bank interactions.

## Opening the Bank


```typescript
// Open bank (finds banker NPC or booth automatically)
const openResult = await bot.openBank();
if (!openResult.success) {
    console.log(`Failed to open bank: ${openResult.message}`);
}

// Deposit item by name
const depositCoins = await bot.depositItem(/coins/i);  // deposits all
const depositSword = await bot.depositItem(/sword/i, 1);  // deposits 1

// Withdraw item by bank slot
const withdrawOne = await bot.withdrawItem(0);  // withdraws 1 from slot 0
const withdrawAll = await bot.withdrawItem(0, -1);  // withdraws all from slot 0

// Close bank
await bot.closeBank();
```

`success` on deposit/withdraw means the **full** requested amount moved. A short
fill returns `success: false` with `partial: true`, so check the amount instead
of assuming you got everything:

```typescript
const ore = await bot.withdrawItem(/iron ore/i, 28);
if (!ore.success) {
    console.log(`Only got ${ore.amountWithdrawn} of ${ore.requestedAmount} (${ore.reason})`);
}
```



## Depositing Items

```typescript
// Deposit specific item
const ore = sdk.getState()?.inventory.find(i => /ore$/i.test(i.name));
if (ore) {
    await sdk.sendBankDeposit(ore.slot, ore.count);
    await new Promise(r => setTimeout(r, 200));
}

// Deposit all of a type
const ores = sdk.getState()?.inventory.filter(i => /ore$/i.test(i.name)) ?? [];
for (const ore of ores) {
    await sdk.sendBankDeposit(ore.slot, ore.count);
    await new Promise(r => setTimeout(r, 200));
}
```

## Deposit All of an Item

Use `-1` as the quantity to deposit all of an item type. 

```typescript
// High-level (recommended)
await bot.depositItem(/bones/i, -1);  // Deposits ALL bones (even if in 5 separate slots)
await bot.depositItem(/coins/i, -1);  // Deposits ALL coins (stacked)

// Low-level
await sdk.sendBankDeposit(slot, -1);  // Deposits ALL items of that type from ANY slot
```


## Withdrawing Items

```typescript
// bankSlot is the position in the bank, not inventory
await sdk.sendBankWithdraw(bankSlot, count);
```

## Closing the Bank

```typescript
// High-level (recommended)
await bot.closeBank();

// Low-level (works for any modal interface)
await sdk.sendCloseModal();
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
async function bankTrip(itemPattern, bankCoords, returnCoords) {
    // Walk to bank
    await bot.walkTo(bankCoords.x, bankCoords.z);

    // Open bank (automatically finds banker/booth)
    const openResult = await bot.openBank();
    if (!openResult.success) {
        console.log(`Failed to open bank: ${openResult.message}`);
        return;
    }

    // Deposit all items matching pattern (one call deposits ALL, even non-stackable)
    await bot.depositItem(itemPattern, -1);

    // Close bank and return
    await bot.closeBank();
    await bot.walkTo(returnCoords.x, returnCoords.z);
}
```


### Key Learnings from Cow hide Banking
1. **Gate exit threshold**: Use `z < 3268` not `z < 3265` for cow field
2. **Let `walkTo` handle the gate first**: It attempts to open doors on its route
3. **Recover explicitly**: If movement fails at the south gate `(3253, 3266)`,
   inspect its current options, call `openDoor(gate)` when `Open` is present,
   then retry `walkTo`
4. **Banking works at Varrock West**: (3185, 3436) confirmed working
