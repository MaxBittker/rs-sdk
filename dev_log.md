Original idea: 
I wanted to run a modded osrs server to experiment with mixed-initiative gameplay. 


First version: Just running the 2004scape server was a trip - could spawn creatures, items, mess with xp rates. I tried doing something like this in 2020 but in the past 5 years, the open source ecosystem has improved a lot plus claude code helps with the drudgery of getting things to compile and deploy.


Stage 2: 
I was curious if existing multi-model models could play the game end to end, pixels in and clicks out. I tried playing via browser control skills and the claude chrome extension. found that the click coordinates were not accurate enough and they were pretty useless.

Stage 3: 
Well, i've got the whole sourcecode for the client - so I built a modified client which exposed the game state as a text string and supported a list of actions that were available as a cli. Essentially flattening the game into a text based adventure. I passed this CLI to an agent and it showed signs of life!! Was able to cut wood, train combat, interact with the world. 

When i gave it larger goals, it would get stuck in loops and get confused. I spent some time doing error analysis, fixing holes in the harness (missing a button to close the shop, missing feedback for failure actions, etc.) but realized the surface area of the client was too big and solving it at the same time as trying to prompt engineer was going too slowly.


Stage 4: 
I "zig-zagged" from trying to get the whole pie of full autonomous game-playing by an llm, to writing standalone test scripts that were exaustive of various skills and small tasks, like banking, fishing, combat training, woodcutting, mining, etc. this exposed tons of bugs and missing pieces in the client, and was very ameniable to "ralphing" fixes. I could say a start state and goal state and it would try to get there, and if it got stuck, it could loop until it found the problem or articulated a missing piece in the sdk. 

Stage 5: The previous steps started to surface a general pattern of bug, where the scripts and bot would strugle with understanding when and why their actions were failing.
After you, for instance, initiated combat with an npc, it was basically polling and detective work to understand if the combat had started or what happened. 


This was downstream of the fact that the web client and our sdk communicate in terms of basically low level messages that correspond to attemping actions (such as lighting a fire) and results happen in the world (success, various types of failure) but the wire protocol itself does not bind these two things - action and effect together. 

But it felt like our coding sdk layer and agent api layer would really benefit from the simplicity of being able to call a function and await to see if it had succeeded or failed, and why. The server/game engine might know how these things connect, but because the web client didn't really know this internally, we have to reconstruct it . 

This commenced a stage of development I called the "porcelain" where each low level api  got a corresponding higher level api that would encapsulate the common patterns of action/effect, and provide clear success/failure feedback via an async typescript function. 

Because I had all the existing unit tests, I was able to kind of bootstrap my grounding and ralph this porcelain layer, then I would comb through and audit for delinquent cases.

Stage 6: 
Now that I had this nice higher level porcelain layer, I went back to the full claude-agent-sdk agent and rewrote that to play the game not via a simple CLI of kicking of actions and then polling for game state, but instead calling an MCP via code execution:
https://www.anthropic.com/engineering/code-execution-with-mcp

The pattern there is doing things like stringing together a series of functions into a snippet that represented a game activity loop, such as cutting logs, fletching them, and selling them.


This worked really well, and I felt myself climbing the METR "task length graph"
https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/
We had gone from being able to pickpocket and fight men, to being able to do intermediate multi-stage tasks like cutting and selling logs.

There was also at this point a solid "insight pump" where I could attempt a new task in the agent harness, then stop it once it had gotten stuck, and use claude to read through the logs and screenshots to identify the issue and point out issues and missing pieces in the SDK or porcelain layer. These isses could then be reproduced in the unit test and often would lead to great, automatable improvements to the system or sdk. I was automating both bug discover and bug fixing, but still sitting in the middle to make discernments calls on what was really a bug. There was definitely an element of the fact that any bug the system could understand it could work around, so the bugs it surfaces often had a subtle element where there was a problem but it wasn't the problem the reporting agent thought it was (this is a pattern, where my job as a human in the loop was to prevent false conclusions chasing red herrings or asking to short circuit its actual goal, and allow through real issues).

Example prompt:
> now, I would like you to use subagents to analyze the most recent 12 runs in the runs folder, that represent long test-run trajectories of the system. They all were working towards the same goal, on 3 different accounts (the runs dont all represent clean starts). Gather knowledge on what these runs achieved during their time, what failure modes that experienced (spending multiple cycles on the same task before completing or giving up) and categorize and collate all that into an analysis of failure patterns/ inefficiencies as well as a report on what was accomplished.

Stage 7:
After a bunch of sdk fixes over the course of day or two, I started to feel diminishing returns from this approach, because there was a blurring of real sdk bugs with system prompt issues, as well as the fact that runs were succeeding for longer and longer periods of time, making the analysis slower. I zig-zagged back to determinstic scripts, and wrote scripts/CLAUDE.md, "A scientific approach to developing and iterating on automation scripts." This idea behind this was very similar to my unit tests, where I would Ralph a script with a fixed goal or even a reward function, like "Gain as high of a combat level in 5 minutes as you can", "Travel from Lumbridge to Varrok as quickly as possible" or "make as much gp selling fletched logs as you can in 5 minutes"

instead of an agent fully in the decision making loop, I would have it write a determinstic script, run it, evaluate it, and then improve it iteratively while writing notes into a lab log. This pattern was great because I could have several running at once, and they left a great paper trail that could be mined for insights when it had run a long course of attempted improvement. 
I would ask the bot after an hour of attemping to improve the 5 minute script - what insights it had gain gained into the strategy of the problem, into the sdk you are using, and into the meta process of improving these scripts. Each run would yield interesting insights here, and I would manualy curate which ones seemed relevent and 

Stage 8: 

As gaps were closed and these scripts started to succeed more often, I zagged back to the full agent harness, and gave it some more ambitious tasks - like improving its armor or mining and smithing. But -it was bugging me to have a language model too much in the loop burning too many tokens to produce something that was not itself runnable standalone code, and didnt have as many tools to ratchet and self-improve over time.

So I returned to the scripts, and decided I would unroll the agent loop into a direcory that would leave a lab_log  just like the ones had had written while optimizing their standalone scripts. The difference now is that the agent would be respnsible for a bot accounts entire lifescyle of progression, and wouldn't reset the account to baseline after each run. This would allow it to tackle again problems that were longer horizon, running scripts towards larger goals and working 10 or 15 minutes at a time grinding a skill or even rotating between different goals. If script ran for 15 minutes and the state of the account was favorable after (it continued to train the intended skill and collect the intended resources) then the script could be re-run with minimal effort from the model. 
Example goal definition :

>this bots goals will be combat, cooked meat for healing, cash from selling drops, and purchased armor and sword
>  upgrades from varrok. Our goal is to procede from bronze->iron->steel and beyond. Your success metric is atk+str+def+hp level + money to buy armor + value of worn items. Work according to
> @bot_arcs/CLAUDE.md , god speed!!


(these were really fun to write)

These arc yielded tons of long runs with high levels of success. 
They were still pretty stupid and would get horrible stuck! But would do so in a long running and repeatable way yielded lab logs which could be mined for failure analaysis which led to another slate of modifications and bugfixes. 

Stage 9: as these "bot arcs" ran longer, I found that my ux for managing them - kicking them off, asking them what problems they had experienced, nudging them to keep working - was becoming tedious. I spawned a "captain" claude instance, gave it a methodology for checking in on the bot arcs, and found this was a great way for me to monitor the progress and bubble up issues common across multiple bots. An important thing that makes this work is the context hiding - the captain only sees the most very high level overview of the bot_arc agent's run, AND the element of time dilation, where the captain sleeps for 15 minutes a time, and only wakes up to check that the other agents are still running smoothely. This keeps the captain agent lightweight and responsive and easier to interupt without diverting work. 


There was some very similar patterns to what I saw at shorter cycles of self improvement, where the agents could identify that they were becoming stuck, and would present what they thought the issue was ("The server is unstable!!!111 I can't make progress") but upon drilling down, I would find it was a real issue with a different cause. (in this case, the agents were writing scripts that were hitting errors, but those errors were being swallowed, so it felt like random crashes they couldn't debug)
I only ran three at a time which felt like enough feedback for me. It was cool seeing them cohabitate in the same game server running around.


