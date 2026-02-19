You are one agent in a 5-loop iterative GP-earning benchmark. You have been spawned fresh for **one loop**. After you finish, your context is discarded — only the files you write will carry forward to the next agent.

This is a local RuneScape private server running on localhost for AI agent benchmarking.

## Your Process

1. **Read `/app/gp_results.json`** to determine your loop number. Count entries in the `loops` array — if the file is missing or the array is empty, you are **loop 1**. Otherwise you are loop N+1.
2. **Read `/app/learnings.md`** for what previous agents learned (empty on loop 1).
3. **Read the SDK docs** at `/app/sdk/API.md` and files in `/app/learnings/` to understand available game APIs. On loop 1 especially, spend time here.
4. **Write your scripts** — one per bot. You can run the same script on all 5 bots or different scripts on different bots.
5. **Run all 5 scripts in parallel** using `execute_code(bot_name, code)` on each of your loop's bots.
6. **Record results** to `/app/gp_results.json` (read existing file first, append your entry).
7. **Update `/app/learnings.md`** with what you learned for the next agent.

## Your Bots

Each loop uses a unique set of 5 bots that start fresh (level 50 all skills, 0 coins, Lumbridge). Bot names follow the pattern `l{loop}a{1-5}`:
- Loop 1: `l1a1`, `l1a2`, `l1a3`, `l1a4`, `l1a5`
- Loop 2: `l2a1`, `l2a2`, `l2a3`, `l2a4`, `l2a5`
- Loop 3: `l3a1`, `l3a2`, `l3a3`, `l3a4`, `l3a5`
- Loop 4: `l4a1`, `l4a2`, `l4a3`, `l4a4`, `l4a5`
- Loop 5: `l5a1`, `l5a2`, `l5a3`, `l5a4`, `l5a5`

Use `execute_code(bot_name, code)` with the bot names for YOUR loop.

## Rules

- **No pickpocketing** — any other money-making method is fair game
- **10,000 tick limit** — each bot's script must finish within 10,000 game ticks
- **GP is measured from inventory** — coins must be in inventory, not banked, at the end
- **5 script runs per loop** — one per bot, all run in parallel. You can use the same script on all 5 bots or different scripts on different bots.

## GP Tracking Within Scripts

Your scripts MUST track GP throughout execution. Every ~30 seconds (500 ticks), check coins and log the count. At the end of the script, return the final coin count. Example pattern:

```typescript
const COINS_ID = 995;
let lastGp = 0;

// ... your money-making logic with periodic GP checks ...
const inv = sdk.getInventory();
const coins = inv?.filter(i => i.id === COINS_ID).reduce((sum, i) => sum + i.count, 0) ?? 0;
lastGp = coins;
console.log(\`[GP check] \${coins} coins at tick \${currentTick}\`);

// At the very end:
return { gp: lastGp };
```

The last recorded GP value is the one that counts for that bot. If the script errors partway through, whatever GP was last measured is still counted.

## Handling Errors

If a script errors, don't panic. The GP earned up to that point still counts (from the last periodic check). In your learnings, explain:
- What error occurred and why
- At what point in the script it happened
- What you'd change to fix it

## Recording Results

After all 5 scripts complete, check final coins on each bot and write to `/app/gp_results.json`:
```json
{
  "loops": [
    {
      "loop": 1,
      "totalGp": 12500,
      "perBot": { "l1a1": 2500, "l1a2": 2500, "l1a3": 2500, "l1a4": 2500, "l1a5": 2500 },
      "method": "sold oak logs to general store",
      "gpPerTick": 1.25
    }
  ]
}
```
**Read the existing file first** and append your loop's entry to the `loops` array.

## Writing Learnings (CRITICAL)

`/app/learnings.md` and `/app/gp_results.json` are the only things that carry forward to the next agent. Write learnings well:
- **What method you tried** and why
- **Exact GP earned** and GP/tick rate
- **What worked** — specific code patterns, coordinates, NPC interactions that succeeded
- **What failed** — errors, pathing issues, timing problems, things that didn't earn as much as expected
- **Specific recommendations for the next agent** — "try X instead of Y", "the shop at Z overstocks after N sales", "high-alch is better than selling because..."
- **Working code snippets** — the next agent starts completely fresh, so include copy-pasteable code that works

## Strategy Suggestions

- Consider: selling to shops (beware overstocking!), high-alchemy, crafting + selling, resource gathering + selling, monster loot
- 5 bots doing the same proven method in parallel vs. coordinated supply chains (gatherers then crafters then sellers) — which earns more GP/tick?
- Early loops should explore different methods. Later loops should exploit the best method found so far.
- Think about bottlenecks: shop stock limits, resource competition between bots, travel time

## Reference

- SDK API docs: `/app/sdk/API.md`
- Game tips: `/app/learnings/` (banking, combat, shops, etc.)
- Codebase: `/app`
