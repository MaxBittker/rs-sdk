# Shops & Selling

Successful patterns for shop interactions and selling items.

## CRITICAL: General Store Pricing (Major Discovery!)

**General stores pay 0 GP when overstocked!**

This was discovered the hard way after selling 40+ cowhides for 0 GP total. General stores have dynamic pricing based on stock levels:

| Stock Level | Price You Get |
|-------------|---------------|
| 0 (depleted) | Best price |
| Normal | Fair price |
| Overstocked | ~0 GP! |

### Implication for Money-Making

Cowhides are worth ~100 GP each normally, but the Lumbridge general store pays **0 GP** because it's completely overstocked (likely from other bots selling there).

**Solutions:**
1. Find specialized shops (tanner, leather worker)
2. Sell items the store actually needs (depleted stock)
3. Use different money-making methods (mining, fishing sell for more)

## Shop Locations

| Shop | Location | Coordinates | What They Sell |
|------|----------|-------------|----------------|
| Lumbridge General Store | Lumbridge | (3212, 3247) | Basic supplies, tools |
| Varrock Sword Shop | Varrock | (3204, 3417) | Bronze to steel swords |
| Bob's Axes | Lumbridge | (3230, 3203) | Axes (bronze 16gp), Pickaxes (bronze 1gp) |
| Gerrant's Fishy Business | Port Sarim | (3014, 3224) | Small fishing net (5gp), fishing gear |

## Opening a Shop

```typescript
// Find shopkeeper
const shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shopkeeper/i.test(n.name));
if (!shopkeeper) return;

// Find Trade option
const tradeOpt = shopkeeper.optionsWithIndex.find(o => /trade/i.test(o.text));
if (tradeOpt) {
    await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);
}

// Wait for shop interface
for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (ctx.state()?.shop?.isOpen) {
        ctx.log('Shop opened!');
        break;
    }
}
```

## Selling Items

```typescript
// Shop must be open first
if (!ctx.state()?.shop?.isOpen) {
    ctx.log('Shop not open!');
    return;
}

// Find item to sell in inventory
const item = ctx.state()?.inventory.find(i => /cowhide/i.test(i.name));
if (item) {
    // Sell item (slot, quantity)
    await ctx.sdk.sendShopSell(item.slot, item.count);
    await new Promise(r => setTimeout(r, 200));
}
```

## Buying Items

```typescript
// Find item in shop stock
const shopItem = ctx.state()?.shop?.shopItems?.find(i => /sword/i.test(i.name));
if (shopItem && shopItem.count > 0) {
    await ctx.sdk.sendShopBuy(shopItem.slot, 1);
    await new Promise(r => setTimeout(r, 200));
}
```

## Money-Making Alternatives

Since general stores are unreliable for selling, consider:

| Method | GP/Hour (approx) | Requirements |
|--------|------------------|--------------|
| Pickpocketing men | ~50-100 GP | Thieving 1+ |
| Mining copper/tin | Variable | Mining 1+, pickaxe |
| Fishing shrimp | Variable | Fishing 1+, net |

Combat drops (bones, hides) are only valuable if you can find a specialized buyer or player to trade with.
