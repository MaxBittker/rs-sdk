import { db } from '#lostcity/db/query.js';

await db
    .insertInto('newspost_category')
    .values([
        { id: 1, name: 'Game Updates', style: 'red' },
        { id: 2, name: 'Website', style: 'lblue' },
        { id: 3, name: 'Customer Support', style: 'yellow' },
        { id: 4, name: 'Technical', style: 'dblue' },
        { id: 5, name: 'Community', style: 'green' },
        { id: 6, name: 'Behind the Scenes', style: 'purple' },
        { id: 7, name: 'Archived', style: 'white' }
    ])
    .ignore()
    .execute();

await db
    .insertInto('newspost')
    .values([
        // ---- rip history
        // https://web.archive.org/web/20001110100100/http://www.jagex.com/runescape.html
        {
            category_id: 7,
            title: 'Fixed trading mode bug, walking around now exits the trade.',
            content: '',
            date: '2000-10-25'
        },
        {
            category_id: 7,
            title: 'Big AI improvements. Npcs now have 5 different behaviour modes',
            content: '',
            date: '2000-10-25'
        },
        {
            category_id: 7,
            title: 'Aggressive monsters now attack when you approach',
            content: '',
            date: '2000-10-25'
        },
        {
            category_id: 7,
            title: 'Injured monsters will now run away',
            content: '',
            date: '2000-10-25'
        },
        {
            category_id: 7,
            title: 'Improved combat, can now choose from 4 fighting modes',
            content: '',
            date: '2000-10-26'
        },
        {
            category_id: 7,
            title: 'Added in skill advancement',
            content: '',
            date: '2000-10-26'
        },
        {
            category_id: 7,
            title: 'Added new rat monster',
            content: '',
            date: '2000-10-27'
        },
        {
            category_id: 7,
            title: 'Added cupboards, gates, signposts, sacks, bookcases etc...',
            content: '',
            date: '2000-10-27'
        },
        {
            category_id: 7,
            title: 'Projectile combat now works.',
            content: '',
            date: '2000-10-31'
        },
        {
            category_id: 7,
            title: 'Adjusted mouse button assignments',
            content: '',
            date: '2000-10-31'
        },
        {
            category_id: 7,
            title: 'Improved camera motion',
            content: '',
            date: '2000-11-01'
        },
        {
            category_id: 7,
            title: 'Non-square locations can now be rotated in the editor.',
            content: '',
            date: '2000-11-02'
        },
        {
            category_id: 7,
            title: 'Gates now work properly',
            content: '',
            date: '2000-11-02'
        },
        {
            category_id: 7,
            title: 'Diagonal doors now work properly',
            content: '',
            date: '2000-11-02'
        },
        {
            category_id: 7,
            title: 'Fixed some obscure route finding problems',
            content: '',
            date: '2000-11-02'
        },
        {
            category_id: 7,
            title: 'Added range check to projectile combat',
            content: '',
            date: '2000-11-03'
        },
        // ---- rip history
        // https://web.archive.org/web/20001202004800/http://www.jagex.com:80/runescape.html
        {
            category_id: 7,
            title: 'Game now loads more quickly and reliably',
            content: '',
            date: '2000-11-28'
        },
        {
            category_id: 7,
            title: 'Client now adjusts move speed to stay better synced with server',
            content: '',
            date: '2000-11-28'
        },
        {
            category_id: 7,
            title: 'Fixed occasional misread mouse clicks problem',
            content: '',
            date: '2000-11-28'
        },
        {
            category_id: 7,
            title: 'Actions now give instant colour coded feedback :-)',
            content: '',
            date: '2000-11-28'
        },
        {
            category_id: 7,
            title: 'Fixed several minor bugs',
            content: '',
            date: '2000-11-28'
        },
        {
            category_id: 7,
            title: 'Added support for recoloured objects',
            content: '',
            date: '2000-11-28'
        },
        {
            category_id: 7,
            title: 'Added new location: Ruined village',
            content: '',
            date: '2000-11-28'
        },
        {
            category_id: 7,
            title: 'Added 5 new script commands for controlling player stats',
            content: '',
            date: '2000-11-29'
        },
        {
            category_id: 7,
            title: 'Added new spell: Thick skin',
            content: '',
            date: '2000-11-29'
        },
        {
            category_id: 7,
            title: 'Added new spell: Confuse',
            content: '',
            date: '2000-11-30'
        },
        {
            category_id: 7,
            title: 'Modified stats now slowly regenerate towards normal levels',
            content: '',
            date: '2000-11-30'
        },
        {
            category_id: 7,
            title: 'Added new spell: Chill bolt',
            content: '',
            date: '2000-11-30'
        },
        {
            category_id: 7,
            title: 'Added new spell: Burst of strength',
            content: '',
            date: '2000-11-30'
        },
        {
            category_id: 7,
            title: 'Added new spell: Shock bolt',
            content: '',
            date: '2000-11-30'
        },
        {
            category_id: 7,
            title: 'Added new spell: Camoflauge',
            content: '',
            date: '2000-11-30'
        },
        {
            category_id: 7,
            title: 'Fixed vanishing doors bug',
            content: '',
            date: '2000-12-01'
        },
        {
            category_id: 7,
            title: 'Fixed bug in quest compiling code',
            content: '',
            date: '2000-12-01'
        },
        {
            category_id: 7,
            title: 'Wrote improved quest verifier and fixed a few mistakes',
            content: '',
            date: '2000-12-01'
        },
        {
            category_id: 7,
            title: 'New Quest: Romeo+Juliet Quest (thanks rab!)',
            content: '',
            date: '2000-12-01'
        },
        // --- rip history
        // https://web.archive.org/web/20010301085507/http://www.runescape.com/
        {
            category_id: 7,
            title: "'Super strength Beer cheat' fixed.",
            content:
                'Today it came to my attention that by drinking huges amount of beer players were able to make themselves super strong, and then go killing everyone! This has now been fixed so Beer can only increase your strength slightly. Many thanks to the person who told me about this one. If you know of any more cheats/tricks let me know so I can fix them and make RuneScape a fair place for everyone.',
            date: '2001-01-25'
        },
        {
            category_id: 7,
            title: 'Lots of improvements to the game',
            content: `Ranged combat - You now gain experience for each successful hit, so it's easier to advance a level. Arrows also now fire 25% faster, and I've fixed the cheat/bug which some people were using to shoot super rapidly.
<p>
Magic - 4 new spells have been added which are: Fear, Wind-bolt, Rock-skin, and Elemental-bolt. The bolt spells have also been made much more powerful, and they are no longer dependant on your ranged-combat skill. This means each type of bolt now does a fixed maximum-damage, and to shoot more powerful bolts you need to use high level spells. Finally the staffs have been improved such that if you are wielding a fire-staff, water-staff, air-staff or earth-staff it acts as unlimited runes of that type!
<p>
Player killing - Due to a large number of requests I've changed the way this works. Firstly you can no longer log-out during combat! Closing the webpage or disconnecting your modem will NOT work either! However to compensate I've made it so if you retreat in the game, the person attacking you is stunned for 2 seconds to give you a better chance of getting away. Also when you die you now get to keep your 3 most valuable items! You will still probably lose any ore, food, money, spare weapons, etc... but at least you will no longer lose an item you'd just spent days saving up for! This means if you keep your spare money in the bank you should now be relatively safe.`,
            date: '2001-01-27'
        },
        {
            category_id: 7,
            title: 'New Quest: Vampire Slayer',
            content:
                'The vampire sleeping in the coffin under Draynor Manor has been terrorising the inhabitants of the small village to the south and must be stopped! If you think you are up to the task of slaying a vampire, go and talk to the people in the village to find out how you can destroy this evil monster!',
            date: '2001-01-27'
        },
        {
            category_id: 7,
            title: 'Further combat improvements',
            content: `Following saturdays update the combat system has been tweaked further. The retreating was still too difficult (particularly when being attacked by multiple players/monsters at once) so this has been improved and made easier.
<p>
The "keep 3 best items" rule has also been modified. If you attack another player then you now lose the item-protection for 20 minutes of game time! This makes the player killing aspect of the game more dangerous and exciting, but it also increases your potential reward, as if you kill someone else without item-protection you can now get the best loot! People without item-protection have a small skull drawn above them.
<p>
After many requests the guards in Varrock city now attempt to stop people fighting. There are large number of guards at the bank, so assuming they haven't all been killed you can now withdraw your money more safely.`,
            date: '2001-01-30'
        },
        {
            category_id: 7,
            title: 'New section of sewer opened',
            content:
                'A new area at the end of the sewer is now open. Watch out because it contains deadly red spiders! Fight them to get the rare red spider eggs, which when taken with other ingrediants to the Apothecary in varrock can be used to make a 4-dose strength potion!',
            date: '2001-02-05'
        },
        {
            category_id: 7,
            title: 'RuneScape now works on NetScape 6',
            content: "I finally worked out why netscape-6 wouldn't run RuneScape, and have now fixed the problem! The game will probably also now work properly on a few other browsers.",
            date: '2001-02-07'
        },
        {
            category_id: 7,
            title: 'More RuneScape updates',
            content: `Firstly I have fixed the error which enabled you to make double doors vanish by lighting a fire next to them. So hopefully no more trapped people.
<p>
I've also modified the trading window, so that you can point at an object someone is offering you to find out the objects name and description. This will help make trading fairer and safer.
<p>
Some new locations have been added to the map, there is a new shop in Al-kharid where you can buy plate-mail skirts.
<p>
The 'champions guild' has been added south-west of Varrock. Only Adventurers who have proven themselves worthy by gaining influence from quests are allowed in.`,
            date: '2001-02-13'
        },
        {
            category_id: 7,
            title: 'New quest, and more fixes',
            content: `Little imps have invaded RuneScape and have been stealing anything which isn't nailed down! It's mostly nothing important, but they have also stolen 4 magic beads from Wizard Mizgog, and he wants them back. Go and talk to him in the wizards tower to get started on this quest.
<p>
The trading feature has been improved further. You can no longer accept an offer at the same time as the other player is changing it. This will hopefully stop the cheating and make trading with other players safer.
<p>
A few other minor fixes have been made, for instance you can no longer walk through one of the walls in the ghost town.`,
            date: '2001-02-16'
        },
        {
            category_id: 7,
            title: 'Yet another new quest, and new options menu',
            content: `Prince Ali of Al Kharid is being held captive by the Lady Keli. If you think you're up to a daring rescue mission then go to Al Kharid and talk to Chancellor Hassan. This is a long quest with many parts! Many thanks to Rab for the many hours he spent creating it, and to Paul for configuring it for use in the game.
<p>
I've been working on a new options menu, to allow you to configure the game to your liking. So far there are only 2 options. The 1st option allows you to choose the behaviour of the camera, the new camera mode is the first step in a new system I am developing, which will ultimately make RuneScape run MUCH faster for people with slow computers. The 2nd option is to switch your character between PK and non-PK. (you can only switch twice, so choose carefully). I will be adding more options to the menu as required.
<p>
I've also been working on a system to support clans/friend-lists. This isn't ready yet, but work is progressing well and I expect it to be available soon.`,
            date: '2001-02-28'
        },
        // https://web.archive.org/web/20010331064710/http://www.runescape.com/main.html
        {
            category_id: 7,
            title: 'Problems fixed',
            content: `I've fixed a few minor problems with the new quest. In case you don't already know getting the skin paste now works, and I've just solved the clay shortage problem.
<p>
I'd also like to apologise for the slow speed of this site on the 28th-Feb. This problem has now been resolved and we're back to full speed again. I've also ordered a 2nd dedicated server to increase the reliability and speed of RuneScape in the future.`,
            date: '2001-03-02'
        },
        {
            category_id: 7,
            title: 'Second server online',
            content:
                "I've been busy this last week setting up a new server, and modifying RuneScape to use it. I'm pleased to announce that RuneScape is now running using two dedicated servers. This should allow more simultaneous players, and make the game more reliable at peak times.",
            date: '2001-03-10'
        },
        {
            category_id: 7,
            title: 'This weeks update',
            content: `I've just uploaded this weeks update. I didn't get as many features added as I hoped, because I instead had to spend time modifing the system to stop a few players intent on spoiling the game for everyone else. Players who try to break the rules are just slowing down the improvements to the game, so please don't do it! Luckily Paul has also made lots of improvements this week, so between us we've still done quite a lot of new stuff.
<p>
This weeks updates are:

<ul>
  <li>Added a button to email forgotten/stolen passwords back to their owner</li>
  <li>Made changing your password eaiser (there is a new option in the options menu)</li>
  <li>Added timeout to conversations - to prevent people blocking shops</li>
  <li>Added code to detect which players are attempting to break the rules</li>
  <li>Fixed a problem with the popup game window on netscape-6</li>
  <li>Added a cook's guild which you can only enter if your cooking skill is 32 or better.</li>
  <li>More stuff to cook - You can now make a variety of different pies, and also wine!</li>
  <li>The sewer has been extended further.</li>
  <li>You can now smith plated skirts</li>
</ul>`,
            date: '2001-03-17'
        },
        {
            category_id: 7,
            title: 'Massive update!',
            content: `Asgarnia is online! and includes:
<ul>
  <li>Ice mountain</li>
  <li>monastery with healing monks</li>
  <li>dwarven mine</li>
  <li>goblin village</li>
  <li>evil red monks</li>
  <li>black knight castle</li>
  <li>City of Falador</li>
  <li>White knights castle</li>
  <li>chainmail shop</li>
  <li>mace shop</li>
  <li>port Sarim</li>
  <li>food shop</li>
  <li>battle axe shop</li>
  <li>ice giants dungeon</li>
</ul>

We also have 4 new quests!

<ul>
  <li>dorics quest - fetch Doric some materials for making amulets</li>
  <li>spy quest - go on a spying mission for the white knights</li>
  <li>witches potion quest - fetch the ingredients for an evil witches brew</li>
  <li>sword quest - help a squire recover his knights lost sword</li>
</ul>

In addition to this there is a new friends system, and new privacy features! Have fun!`,
            date: '2001-04-06'
        },
        {
            category_id: 7,
            title: 'Server problems',
            content: `We seem to be having a few server problems at the moment. This is due to the large amount of new code we added to the game yesterday. I'm working on fixing it though, so please be patient, and I'll get everything running smoothly as soon as possible.
<p>
The good news is that I think I have just resolved the server down-time issues, so hopefully the server won't go offline completely anymore. There is still an issue with certain players having problems when more than 1024 people play at once, this is only a problem at peak times and I expect to fix it on Sunday evening.
<p>
Also I expect to get the message boards, current-players, and password-emailing features working again on Monday. These have just been temporarily disabled whilst I get the new server code working properly.`,
            date: '2001-04-07'
        },
        {
            category_id: 7,
            title: 'Server fixed + message boards online',
            content: `I have now fixed the majority of the problems with the new server. All the major problems are now sorted, and I'm now working on a few less critical issues. I'm also going to update the world-map as soon as possible so you can find your way around Asgarnia.
<p>
More good news is that I have just put the message boards back-online. I have taken the chance to redesign and improve them, so I hope you like the new design!`,
            date: '2001-04-10'
        },
        {
            category_id: 7,
            title: 'Asgarnia map online',
            content: "The updated world map is now online, and I've labelled all the key locations in Asgarnia, so you can now find your way around without getting lost!",
            date: '2001-04-11'
        },
        {
            category_id: 7,
            title: 'Server status page, my-friends, and password recovery pages',
            content: `The 'current players' page was getting too long so it's been replaced with a new 'server status' page which tells you the number of people currently playing, and lists the top players who are logged in. So you can still tell which of your friends are playing I've also added a new 'my-friends' page which tells you if the people on your friends list are online or not.
<p>
I've also got the lost password recovery feature working again. It's now available by clicking 'lost password' on the menu to the left and entering your account details.`,
            date: '2001-04-13'
        },
        // https://web.archive.org/web/20010516223917/http://www.runescape.com/
        {
            category_id: 7,
            title: 'Bugs fixed',
            content: `I've been busy fixing problems with Runescape, I'm pleased to announce that all the following issues are now fixed:

<ul>
  <li>Players were sometimes seen appearing in random places, (e.g on top of your own character, or in the sea etc...)</li>
  <li>Your own player would sometimes appear in the wrong location, (e.g you temporarily found yourself in the player houses area)</li>
  <li>Certain people were unable to use private messaging.</li>
  <li>Ore shop and shield shop didn't accept all stock all of the time.</li>
  <li>Left hand column of inventory had mouse focus problem.</li>
</ul>`,
            date: '2001-04-19'
        },
        {
            category_id: 7,
            title: 'New RuneScape windows client!',
            content: `Get into Runescape more quickly without having to wait for it to load every time, with our new windows version!
<p>
When run, the program automatically checks our main server for the latest updates then starts the game from your harddisk. It's only 116k so download it now!`,
            date: '2001-04-25'
        },
        {
            category_id: 7,
            title: 'Improved windows client',
            content: `It seems the new windows client didn't work for everyone, so I've been worked hard to fix it and make it more compatible. Version 2 is now available for download, and fixes the following problems:

<ul>
  <li>IE-5.5 users were hearing "beep" noises whenever they pressed a key!</li>
  <li>IE-6 users got a "page could not be displayed" message</li>
</ul>`,
            date: '2001-04-26'
        },
        // https://web.archive.org/web/20010516223917/http://www.runescape.com/
        // todo: poll on 2001-04-27
        {
            category_id: 7,
            title: 'Item stealing fixed',
            content: `Due to popular request I have now modified the game so that other players can't steal the items you get when you kill another player or monster.
<p>
After killing a monster/player you now have 1 minute to choose the items you want. After 1 minute any remaining items will become available to other players too.`,
            date: '2001-05-01'
        },
        {
            category_id: 7,
            title: 'Improved user interface',
            content: `I've changed the way the controls work, to make controlling your character in crowded areas much easier. After putting the original improvement online it became apparent that further alterations were necessary so I've ended up making minor alterations repeatedly over the past few days.
<p>
<b>The final resulting interface now works as follows:</b>
<p>
Most common actions in the game are now performed using the LEFT mouse button. For instance you can walk around, take objects, open doors, fight monsters, wear armour, etc... All just be left clicking on the item of interest. The new system is much better at working out what you are most likely wanting to do, even when you point at a large number of things at once.
<p>
The RIGHT mouse button now brings up a multiple choice menu, which displays ALL the possible actions that apply to the items you are pointing at. This means even when pointing in a crowded area, or at a large stack of objects you can still use the menu to choose the action you want.
<p>
If you are used to the old interface it may take a bit of getting used to. Just give the new system a chance, and I think you'll prefer it in the long run.
Just remember: left-button=action, right-button=menu
<p>
<b>Advantages of the new system:</b>
<ul>
  <li>You can select items out of large stacks of objects much more easily</li>
  <li>You are less likely to die by accidentally attacking a strong monster</li>
  <li>It is easier to walk around crowded areas of the map</li>
  <li>It is much easier to use crowded locations like furnaces and anvils</li>
  <li>You are much less likely to accidentally drop your pickaxe whilst mining</li>
  <li>No need to remember which button to use. Most actions are now on the left button.</li>
  <li>Dropping items is now easier as you no longer need to click on the ground</li>
  <li>New optional 'one-button-mouse' mode</li>
</ul>`,
            date: '2001-05-03'
        },
        // todo: poll on 2001-05-03
        {
            category_id: 7,
            title: '3rd Runescape server on the way',
            content: `Runescape is still growing massively in popularity. There are now so many players at peak times that I've just ordered a 3rd dedicated server to cope, and I hope to receive it within a few days time.
<p>
The new server will be used to run a 2nd copy of the runescape world to reduce the overcrowding. The 2nd world will be exactly the same as the current one, and so will effectively allow twice as many people to play Runescape at once.
<p>
When logging in you will be able to choose which server to play on, and will still be able to private message your friends even if they are playing on the other server. The existing saved games will work on either world.`,
            date: '2001-05-05'
        },
        {
            category_id: 7,
            title: 'RuneScape updated',
            content: `I've just updated runescape to add the following features:
<ul>
  <li>Better smithing tables, with more even spacing of items</li>
  <li>New goblin quest - help the goblins find a new look for their armour!</li>
  <li>New crafting skills - make jewellery and pottery</li>
</ul>
I have also just received the 3rd server I promised, I am now configuring it, and hope to have it online shortly.`,
            date: '2001-05-08'
        },
        {
            category_id: 7,
            title: '3rd runescape server online',
            content:
                "The new runescape server is online! I was planning on testing it a bit more and launching it tommorow, but so many people are trying to play tonight that the system couldn't cope so I've been forced to launch it early. Hopefully everyone who wants to play will be able to now.",
            date: '2001-05-09 01:30:00'
        },
        {
            category_id: 7,
            title: 'Lots of small improvements',
            content: `I've been busy making lots of minor alterations and bugfixes to the game. The main changes are:
<ul>
  <li>My-friends webpage now works properly, and also shows which server they are on</li>
  <li>You can now private message friends even if they are playing on the other server</li>
  <li>Windows client now lets you select which server to use</li>
  <li>Reorganised the stats list to prepare for coming updates</li>
  <li>Improved speed and reliability of the servers</li>
  <li>Introduced new quest-point system to replace the old 'influence' system</li>
  <li>Fixed 'using ranged combat advances other skills too' bug</li>
  <li>Fixed 'impossible to mine gems' bug</li>
  <li>Fixed 'pottery menu wrong way around' bug</li>
  <li>Fixed 'server sometimes sends wrong wrong error message on login' bug</li>
  <li>Fixed 'friends list gets blanked on lost connection' bug</li>
</ul>`,
            date: '2001-05-10 22:00:00'
        },
        // https://web.archive.org/web/20010805001506/http://www.runescape.com/main.html
        {
            category_id: 7,
            title: 'Updated FAQ',
            content: `I've updated the frequently-asked-questions page to answer some more common queries. Click here to view it.
<p>
If you think there are further questions missing from the FAQ then let me know what you think I should add.`,
            date: '2001-05-21'
        },
        {
            category_id: 7,
            title: '4th RuneScape server ordered',
            content:
                "Last night saw over 2000 simultaneous RuneScape players for the first time ever. Hurrah! To keep up with the increasing number of players I've just ordered yet another server to help keep the game running smoothly. I hope to have it within a few days.",
            date: '2001-05-24'
        },
        {
            category_id: 7,
            title: 'Pop up windows removed',
            content:
                "I've removed the pop up windows because there were just too annoying. Hopefully the remaining adverts will make enough money that I don't have to put them back (E.g the revenue from banner-advert clicks doesn't fall any further)",
            date: '2001-05-24'
        },
        {
            category_id: 7,
            title: 'Runescape updated',
            content: `Due to popular request, female players can now go and talk to one of the characters in the game, and get their armour modified to look more feminine.
<p>
The ice dungeon has been expanded and improved. It also now includes a new ice-warrior monster.
<p>
The server status page now shows the top crafter, top magician, and top cleric.`,
            date: '2001-05-24'
        },
        {
            category_id: 7,
            title: 'New magic system online!',
            content: `The RuneScape magic system has been massively improved with the additon of lots of new spells. Magic can also now be used during combat! In addition to this there is also a new prayer system which lets you temporarily cast various effects on your character. This means there is now a total of 42 spells and prayers to choose from.
<p>
For more information on the new systems click below:
Guide to magic
Guide to prayers`,
            date: '2001-05-24'
        },
        {
            category_id: 7,
            title: '4th Runescape server online',
            content: `The 4th runescape server is now online! (this means we now have 3 game servers, and 1 web server). It has now been fully connected so you can use it with both the windows and online versions of the game
<p>
I have also modifed the game to prevent people from logging in multiple players at once from the same machine, because doing so is against the rules! If you have problems with the system seeing your home-network as a single machine, then try using the window client which is better at detecting your network configuration.<br>
<b>Update</b>: Even if you can't use the windows client then up to 3 people on the same home-network can still play at once, as long as each player uses a different server.`,
            date: '2001-05-25'
        },
        {
            category_id: 7,
            title: 'Prayers last 50% longer',
            content: "It seems most people thought they prayers weren't quite powerful enough. I've therefore now changed the game so that all the prayers last 50% longer, before you need to recharge.",
            date: '2001-05-26'
        },
        {
            category_id: 7,
            title: 'Sorry for recent server problems',
            content:
                'Any regular runescape players will have noticed that the servers have been experiencing problems over the weekend. I have been working extremely hard to try and resolve this problem, and hopefully everything will be back to normal now. I believe it was caused by a memory leak in the new magic system which I added on friday. I have now fixed the memory leak so hopefully the server will now be stable. I apologise for any inconveniance caused. - Andrew',
            date: '2001-05-27'
        },
        {
            category_id: 7,
            title: 'Completed quests list',
            content: 'I have added a new button to the stats menu which shows you which of the 15 quests you have completed. I hope this proves useful to people who are trying to work out which ones they have missed, so they can complete them all!',
            date: '2001-05-28'
        },
        {
            category_id: 7,
            title: 'Sorry for recent server problems',
            content: `I've added a whole new skill for you to try in RuneScape! There are various fishing points scattered around the rivers and ocean. Go to the fishing-shop in Port Sarim to get the equipment you need and then try your hand at fishing. There are 10 different fish to catch, and 5 different fishing techniques to try!
<p>
As well as the fish, there are now even more things to cook and eat in RuneScape. If you have a sufficiently high cooking level you can now make pizzas, stew and cakes! Finally I've changed some of the level requirements and the healing properties of some of the foods to be more evenly balanced.
<p>
For more information on fishing and cooking Click here`,
            date: '2001-06-11'
        },
        {
            category_id: 7,
            title: 'The island of Karamja is open',
            content:
                'Paul has now finished the island of Karamja! Go and talk to Captain Tobias at Port Sarim if you want a boat trip to the new island. Karamja also features a brand new quest in which you must hunt for hidden treasure! To start the new quest go and talk to Redbeard Frank at Port Sarim.',
            date: '2001-06-11'
        },
        {
            category_id: 7,
            title: 'Lots of minor fixes and tweaks',
            content: `Just made a quick update to fix and tweak various small problems. This update fixes the following:
<ul>
  <li>There are now even more customs officers on karamja</li>
  <li>There is more fishing bait available in the shop and as monster drops</li>
  <li>Burying bones now gives 50% more experiance</li>
  <li>The pirates quest is now added to the quest list</li>
  <li>Added button to deposit 1000 coins at a time in the bank</li>
  <li>Fixed making cake takes flour pot away bug</li>
  <li>Fixed catching tuna doesn't give XP bug</li>
  <li>Fixed food shop doesn't work after completing pirate quest bug</li>
</ul>`,
            date: '2001-06-12'
        },
        {
            category_id: 7,
            title: 'Updated world map',
            content: "I've updated the world-map. It now shows the location of the jewellery shop, gem shop, crafting shop, armour conversion shop, fishing shop, and the places where you can catch fish.",
            date: '2001-06-12'
        },
        {
            category_id: 7,
            title: 'New password recovery system',
            content: `I've changed the system for retrieving a lost password. The new system doesn't use email because not everyone has a secure email account they can use, and people's email address often changes.
<p>
Next time you login you will be asked for the answers to 5 security questions. Then if you should lose your password you can use these answers to set a new password on your account. You will only be allowed to set the questions once, after which they are permanently fixed. Therefore you should be careful to choose questions+answers which other people won't be able to guess, but which you will easily remember.`,
            date: '2001-06-20'
        },
        {
            category_id: 7,
            title: 'More runescape bugs fixed',
            content: `I have now fixed the following bugs with runescape:
<ul>
  <li>improved password box to allow up to 20 characters</li>
  <li>fixed it so you can still stack extra runes/arrows even when your inventory is full.</li>
  <li>fixed a bug which could cause stack of 0 coins to be created</li>
  <li>fixed a bug with arrows of different types not stacking on the ground properly</li>
  <li>fixed it so that leaving the bank displays your balance properly</li>
  <li>improved runescape auto-update code</li>
  <li>logging out now works properly when you log out at the exact moment of attack</li>
  <li>fixed it so people no longer randomly get added to your friends list</li>
  <li>fixed it so lumbridge and karamja shops don't share the same stock!</li>
</ul>`,
            date: '2001-06-23'
        },
        {
            category_id: 7,
            title: 'New tailoring ability',
            content:
                'Paul has extended the crafting skill so you can now also use it make items out of leather. Take a cow hide to the tannery to get some leather. You can then use the leather with some thread to make gloves, boots and leather armour.',
            date: '2001-06-23'
        },
        {
            category_id: 7,
            title: 'Updated world map',
            content: 'The world map page now shows where all the quests start. It also shows the locations of altars where you can recharge your prayer points, and the new tannery shop.',
            date: '2001-06-24'
        },
        {
            category_id: 7,
            title: 'Improved prayer system and more!',
            content: `<ul>
  <li>New monastery area which you can enter if you are a high level cleric. Includes monks robes and a special new altar to pray at.</li>
  <li>Silver rocks to mine (requires level 20 mining)</li>
  <li>Holy symbol of Saradomin, made by crafting from silver. Take it to the new monastery area to get it blessed to make your prayers last longer</li>
  <li>The black hole experience in the dwarven mines!</li>
  <li>A few minor bug fixes</li>
</ul>`,
            date: '2001-07-12'
        },
        {
            category_id: 7,
            title: "Andrew's guide to not losing your password",
            content: `An increasing number of people are trying to trick other players into giving away their password. Please use a bit of common sense to avoid getting tricked in this way. Some common tricks to avoid are below:
<ul>
  <li>Do NOT enter your password into ANY website other than runescape.com! If you go somewhere else and see a chat room or survey or cheat site which claims it needs your password then that site is a trick and will steal your pass. Don't be a fool. Be very suspicious of anything or anyone that asks you for your password.</li>
  <li>Rememeber that real Jagex staff will NEVER EVER ask you for your password! If anyone talks to you, or emails you claiming to be me, and asks for your password, then they are lieing and are trying to steal your account. Jagex staff will NEVER ask you for your password for any reason!</li>
  <li>Be very careful downloading programs from other websites. I have seen programs which claim to give you money, or make you stronger, or cheat in some other way. However this is IMPOSSIBLE! These programs actually contain a VIRUS, which will record your keypresses and steal your password. Get a decent virus checker, and don't run anything not downloaded from an official website.</li>
</ul>
I'm not trying to scare you, all the points above are just common sense! If someone in real-life said "give me your credit card number and I'll credit you £1000!" would you? I sure hope not! Just because runescape is a game doesn't mean you should be any less careful.`,
            date: '2001-07-13'
        },
        {
            category_id: 7,
            title: '5th RuneScape server online',
            content: `I just finished setting up another server help run RuneScape. The new server isn't being used to run another parallel world, but is instead working behind the scenes to help manage the save-games.
<p>
This gives a total of 3 world servers, and 2 support servers. This should hopefully increase the total system capacity to 4000 players at once.`,
            date: '2001-07-17'
        },
        {
            category_id: 7,
            title: 'Runescape updated',
            content: `The bank has been upgraded so you can now store any item in the bank not just gold. Useful for keeping your spare weapons, gems, and anything else you might want to store. You can store up to 48 different items, with a maximum limit of 16 million items per stack.
<p>
Runite items have been added to the game! Runite is the most powerful metal in the game, better than even adamantite. Both rune weapons and rune armour are now available to purchase from the champions guild. (hint - there is an extra item only available as a rare monster drop from a particularly strong monster!)
<p>
The player owned houses have been removed. This is because since they were original planned runescape has become much more popular and there is nowhere near enough to go around. Instead the 2 updates above have been included to compensate. The item bank lets anyone store the items they want to, and the runite items are an alternative for people to spend the money they have been saving on.`,
            date: '2001-07-26'
        },
        // https://web.archive.org/web/20011007072658/http://www.runescape.com/main.html
        {
            category_id: 7,
            title: 'Wilderness system online',
            // this one has 2 pictures embedded
            content: `The new wilderness area of runescape is online! This is a huge new area which is part of an improved player-combat system which was first proposed a few months ago. A poll on the website at the time showed the vast majority of players in favour of the new system, so we have now written it.
<p>
In the improved system player fighting is only allowed in the new wilderness area. The ability to switch between PK and Non-PK will be removed and instead you just go into the dangerous wilderness area if you want to fight other players, or stay within the current map area if you don't.	
<p>
The further you go into the wilderness the more dangerous it becomes, but the more treasure you could find! How much of a risk you want to take is entirely up to you. Some preview screenshots of a couple of wilderness locations are shown to the right.`,
            date: '2001-08-13'
        },
        {
            category_id: 7,
            title: 'Stats menu now shows XP',
            content:
                'Due to a huge number of requests, the stats menu now shows you the exact number of experiance points you have in each skill, and the number you need to reach to advance a level. For the more detailed information about a particular stat just point your mouse over it, and the numbers will be shown at the bottom of the menu.',
            date: '2001-08-13'
        },
        {
            category_id: 7,
            title: 'A few bugs fixed',
            content: `I just fixed a couple of bugs with the new systems. I've fixed a problem with the wilderness, whereby low level archers were able to attack high level players in the wilderness without being attackable back! And I've fixed a problem with the new stats menu where the XP indicator didn't update properly.
<p>
Also bear in mind that we might tweak the wilderness a bit over the next few days if it proves to be unbalanced, although everything seem ok so far. We are also planning on adding a dualing system which will allow combat outside the wilderness if both players agree to it.`,
            date: '2001-08-13'
        },
        {
            category_id: 7,
            title: 'Website updated',
            content:
                "I have just updated the worldmap. It now shows the mining guild and the very south edge of the wilderness. The whole wilderness isn't shown however, so you'll have to explore it for yourselves! I've also added 4 new message boards, to give a total of 8, because the old boards were getting extremely crowded. Enjoy!",
            date: '2001-08-15'
        },
        {
            category_id: 7,
            title: 'Lots of small improvements',
            content: `<ul>
  <li>I've fixed the kill stealing problem, the treasure now goes to whoever damaged the monster most overall rather than the person who got the last hit. XP is split proportionally between all people who helped kill the monster..</li>
  <li>Teleport spells no longer work once you reach level-20 wilderness or beyond. This makes the deep part of the wilderness dangerous even for high level players..</li>
  <li>People who are green on your friends list also appear as green dots on the mini-map, making it easier to find them in the game, and easier to go adventuring with a group of friends..</li>
  <li>Your players overall combat level is now shown on the stats menu..</li>
  <li>2 more items banks have been added to reduce the crowding problems. One is in east Varrock, and the other is in Draynor Village..</li>
  <li>Fixed seven minor bugs.</li>
</ul>`,
            date: '2001-08-18'
        },
        {
            category_id: 7,
            title: 'Kill stealing bug fixed',
            content: 'It seems that in certain circumstances the game was still not giving giving the treasure to the correct player. I have now fixed this problem. Many thanks to the people who reported this.',
            date: '2001-08-18'
        },
        {
            category_id: 7,
            title: 'Dragon quest online!',
            // this one has 1 picture embedded
            content: `Think you've got what it takes to slay a dragon? If so try our new quest! This quest has been designed with the more experienced runescape players in mind so it's fairly tricky.
<p>
To start the quest go and talk to the guildmaster in the champions guild. From there you will have to solve a series of puzzles before travelling to slay the dragon itself. Only heros who have proven themselves worthy by completing this quest can purchase and wear the best armour in the game. The new rune platemail body!`,
            date: '2001-09-23'
        },
        {
            category_id: 7,
            title: 'Optional RuneScape members service coming soon!',
            content: `Due to much demand we are planning on launching an optional new premium RuneScape service soon. This will bring a whole load of great benefits such as: frequent updates, NO-adverts, good customer support, no scammers/cheaters (we'll kick 'em out), and much more! We're hoping to make it available for just $5 (us-dollars) a month and this tiny amount of money will pay for many great RuneScape updates to come, and will ensure we can keep running RuneScape for YOU.
<p>
This is great news, because it will enable us to offer you more frequent RuneScape updates. Some of the first updates we have planned include: A duelling system, more monsters (wolf, giant-bat, lizard-man etc..), lots of new items, sound effects, more quests, and there will be loads more stuff after this.
<p>
We hope that many people will be able to afford the very small amount we are asking, if you really can't afford to pay then don't worry, because the current FREE RuneScape service will still be available as well! In actual fact running the free service will cost us a lot of money but we want to thank all the people who have helped us beta-test the game so far, and so will keep it going as long as possible.
<p>
Thanks for all your support.<br>
Andrew Gower`,
            date: '2001-08-05'
        },
        // ---- rip history
        // https://web.archive.org/web/20011121091154/http://runescape.com/runescape.html
        {
            category_id: 7,
            title: '20th November',
            content: 'Due to a change in the way this website works (to increase reliability) I have had to update the RuneScape windows client. Therefore if you use the windows client to play you will need to download the latest version. Thank-you',
            date: '2001-11-20'
        },
        // ---- rip history
        // https://web.archive.org/web/20011201025055/http://www.runescape.com/runescape.html
        {
            category_id: 7,
            title: '27th November',
            content: `I've added a confirm-box to the trade window to make scamming much more difficult. After both players have selected objects, an extra confirm-box showing the details of the trade is displayed. This allows you to check all the details are correct before parting with your items.
<p>
If a player on your friends list is shown in yellow (i.e they are on a different server), you can now find out which server they are on, by moving your mouse pointer over their name.
<p>
I've fixed another bug with the chat filter which was making it over sensitive in certain circumstances`,
            date: '2001-11-27'
        },
        // ---- rip history
        // https://web.archive.org/web/20020603122625/http://www.runescape.com/runescape.html
        {
            category_id: 7,
            title: '30th April',
            content: `New members update online! Many RPGs have a thieving/rogue skill and this is something which until now has been missing from RuneScape.
<p>
We've now added this popular skill to the members version and it includes abilities such as pick-pocketing, picking locks, disarming traps, and stealing from market stalls. For more information about the new thieiving skill please refer to the online manual.
<p>
In addition we have added a quest which uses the new skill. Can you help the rightful owner steal back the lost tribal totem? The quest starts in Brimhaven, and after that is set entirely in the brand new city of Ardougne. You will need a thieving level of at least 21 to complete this quest, so practice your thieving before you start.`,
            date: '2002-04-30'
        },
        {
            category_id: 7,
            title: '8th May',
            content: `Both members and free-edition runescape have been updated with new content.
<p>
First up the members wilderness has been expanded to include: a new level-56 wilderness area, scorpion ravine, pirate hall, rogues to pickpocket, doors to lockpick, high level wilderness dungeon, shadow-spider monster, fire-giant monster.
<p>
Members also can now trade wood certificates for those valuable logs, and purchase/steal spice from the spice stall which when added to stew before cooking can be used to make curry (heals 19hp)
<p>
With all these new wilderness areas for members we've decided to make some of the older wilderness areas available to free-edition users. Explore the bandit camp, dark warrior castle, and overgrown village. Free users also now have access to the crafting guild
<p>
Both members and free versions have been updated with a new 'make-over mage' character, who can change your character appearance... for a price!`,
            date: '2002-05-08'
        },
        {
            category_id: 7,
            title: '28th May',
            content: `Two new members quests are now online.
<p>
In the first quest you must help the dwarves win a fishing competition. To start the quest look for the passage way at east kandarin.
<p>
In the second quest you must carry out a number of tasks for the monks south of Ardougne.`,
            date: '2002-05-28'
        },
        {
            category_id: 7,
            title: '29th May',
            content: `Massive crackdown on cheating players.
<p>
As part of our promised commitment to stamping down and stopping cheats in RuneScape we have developed a new system to automatically detect people using macro/bot software to gain stats unfairly.
<p>
It clearly says in our rules that using software to automatically play the game for you and raise your stats for you is cheating!. This will not be tolerated. It is just not fair on the players who play the game honestly and get their levels fairly.
<p>
Our new system is extremely efficient and accurate, and in the last 24 hours we have already identified nearly 2000 players who have been cheating in this way. We also believe that we will be able to identify all future offenders and will continue modifing and improving our detection software to do so. From this point on if you use a macro or use a modified version of the RuneScape client, it is almost 100% certain that you WILL be banned or erased.
<p>
Since these people gained their stats/items unfairly we have unfortunately had no choice but to completely wipe the stats and inventory of the aprox 2000 people who we have caught using macro/bot software. It seems obvious that these players should not be allowed to keep what they did not gain honestly in the first place.
<p>
If you are one of the people who we stat-wiped then whining and making excuses to us won't help. Our new system is designed to have a 0% rate of false positives, and we KNOW you were cheating. The stat-wipe is irreversable, so if you want to get your stats back then the only way to do it is to start playing the game fairly, and EARN your way to greatness like everyone else has to.
<p>
Click here For a complete list of all the people who have already been stat-wiped. We expect to catch more people at it over the next few days. I hope this proves we are deadly serious about stopping this cheating in runescape.`,
            date: '2002-05-29'
        },
        // ---- rip history
        // https://web.archive.org/web/20021004222730/http://www.runescape.com/runescape.html
        {
            category_id: 7,
            title: '10th July',
            content: `Today Runescape update fixes a large number of outstanding bugs in the game.
<p>
The following issues have been fixed:
<ul>
  <li>Bug where you could teleport from the high level wilderness dungeon is fixed</li>
  <li>Bug where iron arrows were usable on the free servers is fixed</li>
  <li>Bug where you could get a skull for retaliating to a ranged attack is fixed</li>
  <li>Bug where shadow spiders prevented potions from running out is fixed</li>
  <li>Bug where arrows did not stack correctly, if multiple players shot the same target is fixed</li>
  <li>Bug where recovery questions were occasionally reported as 'not set' is fixed</li>
  <li>Bug where attacking another player immediately after a retreat caused a glitch is fixed</li>
  <li>Bug where player occasionally ran in random direction after ranged kill is fixed</li>
</ul>`,
            date: '2002-07-10'
        },
        {
            category_id: 7,
            title: '12th July',
            content: `More ways of becoming a RuneScape member are now available!
In addition to the usual credit/debit-card we've teamed up with paybycash.com to offer the following additional payment options:
<p>
<ul>
  <li>Virtual Check</li>
  <li>Check-by-FAX</li>
  <li>direct debit (ACH)</li>
  <li>Western Union®</li>
  <li>PayPal</li>
  <li>Citibank's "C2it" service</li>
  <li>Cash</li>
  <li>Wire transfer</li>
  <li>Money order!</li>
</ul>
Click here to sign up for RuneScape members now!`,
            date: '2002-07-12'
        },
        {
            category_id: 7,
            title: '18th July',
            content: `I went away for a short holiday on saturday, and it seems Runescape promptly broke in my absence. It seems I can't even take 1 week a year away from running this game! I'd like to apologise for the people who have experienced connections problems over the last few days. I've decided to abort the remainder of my holiday and have come back to the office to fix RuneScape instead.
<p>
I'm currently transfering the database to a new server which is 6 times faster than the old one which should hopefully get things running smoothly again. Once again sorry things weren't working 100%. Now I'm back at work I should be able to get it working smoothly fairly quickly.
<p>
Andrew`,
            date: '2002-07-18'
        },
        {
            category_id: 7,
            title: '19th July',
            content:
                'The RuneScape database is now running from a faster server so everything should be a lot more reliable now. I have also adjusted the network settings of the New-York servers so hopefully they are a lot less laggy now. If you live in the US then you should try them out again.',
            date: '2002-07-19'
        },
        {
            category_id: 7,
            title: '20th July',
            content:
                "Our new improved customer support system is finally online. I've completely rewritten the system to be easier and quicker to use. (and a lot more reliable!) If you've been having trouble submitting support queries recently the new system should work properly for you.",
            date: '2002-07-20'
        },
        {
            category_id: 7,
            title: '23rd July',
            content: `We've updated RuneScape with 3 new members quests!
<p>
King arthur is sending out his knights on a quest for the famous holy grail. If you are a knight of the round table go to king arthur for further orders
<p>
Find the secret gnome village, and help them retrieve the orbs of protection which constantly protect their village from the dangers outside.
<p>
Help Lady Servil save her family from general Kazar who has enslaved them in his fight-arena. Quest starts south-east of Ardougne beyond the monastry.
<p>
We've also added a variety of other features including lots of new areas for the above quests, and a coal-truck track to rapidly transport coal.`,
            date: '2002-07-23'
        },
        {
            category_id: 7,
            title: '26th July',
            content: `The hiscore tables are back online, and we've increased them to show the top 100,000 players!! We've also added a search facility so you can quickly find your name and see where you rank
<p>
An unrelated warning to free edition users - we've discovered that the members 'gnome amulet' is accidently usable on the free server. However we will obviously be fixing this oversight in the next update, so we'd like to warn you NOT to waste your money buying an object which will become useless to you in the next update!`,
            date: '2002-07-26'
        },
        {
            category_id: 7,
            title: '15th August',
            content: `We've just got another 2 members quests online. Sorry it took a bit longer than expected. We've been trying a new testing method to make sure there are less bugs than the last update.
<p>
The 1st quest is the hazeel cult quest. Thieves have stolen the carnillean family armour, and you are asked to recover it. This quest is a bit different because there are two very different ways of completing it! Will you side with the Hazeel Cult or with Ceril Carnillean?
<p>
The 2nd quest is the sheep herder quest in which you must safely herd four plagued sheep away from the city of Ardougne before the citizens become infected! Speak to Councillor Halgrive to start this quest.`,
            date: '2002-08-15'
        },
        {
            category_id: 7,
            title: '26th August',
            content: `RuneScape progress update.
<p>
It's been a while since I last revealed what we're currently working on, so here goes!
<p>
Lots of people said it would be really great if RuneScape had more of an overall story-line and if there was some sort of ongoing plot. Therefore we're pleased to say that we've designed a massive twisting plot which we're going to release over multiple episodes. The next update (hopefully tuesday or wednesday), will contain a new quest which is epsiode #1 of this story. We've also been working on a 'RuneScape history' page, which gives some background story for the RuneScape world, which we hope to put online soon.
<p>
Whilst the rest of the dev-team have been focussing on that, myself and Tony have been working very hard on the promised new 3d-graphics system. This is a mammoth task since we are replacing a vast chunk of the graphics and code. The new engine is coming together extremely well, although there's still a lot of work to do. I hope to get another preview online with the next couple of weeks so you can see how we are doing. We're now nearly ready to show a preview demo of our new landscape engine, our new character animation system, and our new improved user interface.
<p>
As I mentioned before this new graphics engine will also allow us much more flexible maps, and so we will finally be able to put the player owned houses and carpentry in. However since that update is still quite a long way off, the rest of the dev-team is going to work on a new 'agility' skill next. This will give the members something else new to enjoy meanwhile whilst we finish off our big graphics update.
<p>
Note: A few people have been tricked by fake previews of our upcoming updates. Any previews we put online will always be on this website only, and will not require your RuneScape password to view. NEVER enter your password anywhere but runescape.com or it will be stolen! Click here for security tips.
<p>
Andrew`,
            date: '2002-08-26'
        },
        {
            category_id: 7,
            title: '27th August',
            content: `Epsiode 1 of our new multipart quest is now online. Edmond's daugher Elena has gone missing in West Ardougne whilst trying to help the plague victims there. See if you can find out whats going on. The story started in this quest will be continued in future updates.
<p>
We have also added a new Ardougne teleport spell for high level magicians, and a new bank in East Ardougne.`,
            date: '2002-08-27'
        },
        {
            category_id: 7,
            title: '9th September',
            content: `New members quest online - The sea slug quest
<p>
Something mysterious is happening on the new offshore fishing platform. People who've gone on their regular fishing trip just haven't returned! Can you rescue the missing father and son from the unknown horrors out at sea?
<p>
We've also added the ablitity to catch oysters whilst fishing with a bignet. The pearls from these can be used to make powerful crossbow bolt tips. Plus we've added two new certificate traders in Zanaris`,
            date: '2002-09-09'
        },
        {
            category_id: 7,
            title: '11th September',
            content: `New abuse reporting system online!
<p>
We've added a new 'abuse report' button to the RuneScape game which sends an untamperable snapshot of recent chat/trade events directly to customer support.
<p>
This means there is now a VERY easy way for us to catch all the people misusing our game and ban them once and for all! If you continue to be abusive or break the rules now the new 'report abuse' system is online then you WILL be caught almost immediately!
<p>
Please do NOT misuse the 'report abuse' feature. This is feature will allow us to catch and remove the trouble makers from our game. Help us clean up RuneScape by only using this report for serious cases.
<p>
Thanks Andrew`,
            date: '2002-09-11'
        },
        {
            category_id: 7,
            title: '19th September',
            content: `We're still working on the big graphical update. It sure is a lot of work! It's still a way off, so meanwhile we're going to show occasional previews of how things are progressing.
<p>
As well as improving all the graphics, we're also reworking all the animation to use a lot more frames so everything moves more smoothly. Here is a preview of how some of the monsters/people look using our new animation system.
<p>
Remember: Don't be fooled by fake websites, offering to let you test the new version. It's not ready yet, and we are not running any tests of this sort. NEVER enter your password ANYWHERE except runescape.com, or you will lose your account!`,
            date: '2002-09-19'
        },
        {
            category_id: 7,
            title: '24th September',
            content: `RuneScape was updated today with changes big and small. As well as fixing lots of small issues, we've also added the following features:
<p>
Tutorial Island - All newcomers can now take heart! First-time players will now start their adventures on tutorial island, where the good people of Runescape are busy preparing people for the challenges that await them. Learn the way of the rune, and pick up some handy culinary tips.
<p>
Waterfall Quest (Members quest) - Walk along the river that flows through Kandarin, where the locals speak of hidden treasure, and the legend of the Elven King. Search for a place untouched by human hand, and for treasures whose value cannot be counted.
<p>
King Black Dragon (Members monster) - The most fearsome monster ever to venture into Runescape has now... err... ventured into Runescape. So for all you plucky young upstarts, take a break from emailing customer support and pit your wits against the deadliest beast to date! More prudent types might just want to gaze at him from afar. Of course you'll have to find him first.`,
            date: '2002-09-24'
        },
        {
            category_id: 7,
            title: '25th September',
            content:
                "We've updated the RuneScape world-map to show all the latests areas and additions to the map. Newly mapped areas include West Ardougne, and the Gnome Tree Village. The map is pretty huge now so use the scrollbars to scroll around and view the entire area.",
            date: '2002-09-25'
        },
        // https://web.archive.org/web/20021204035847/http://www.runescape.com/Runescape.html
        {
            category_id: 7,
            title: '23rd October',
            content: `The mother of all updates has just landed!
<p>
<b>New Quests:</b>
<p>
Biohazard (Members' Quest) This is the second part of our large ongoing quest. Elena has been rescued, but now she needs your help to find a cure for the plague - so the fate of hundreds could rest in your hands! Find out if you're a thinker or a do-er ... because you'll need to be both.
<p>
Jungle Potion (Members' Quest) Trufitus Shakaya of the Taie Bwo Wannai Village requires that you collect five special jungle herbs for a potion so he can commune with his Gods. The jungle area has been greatly expanded for this quest.
<p>
<b>New members town - The town of Yanille:</b>
<p>
Explore this border town in the far south of Kandarin. Experienced Wizards will want to make use of the Wizards' Guild (magic level 66 to enter). Yanille also contains, a bank, a cookery shop, an inn and various other features.
<p>
<b>New members spells - Enfeeble, stun, vulnerability:</b>
<p>
You can now use more powerful high level versions of the the weaken, confuse and curse spells. They are cast using the new "soul rune", bought from the wizards' guild.
<p>
<b>New features:</b>
<p>
Dragon bones - Do you feel like you're praying in vain? Dragon bones can now be buried for a bigger prayer xp bonus than big bones.
<p>
Improved monster A.I. Monsters who are far weaker than you no longer auto attack. We thought it a bit strange that weak monsters were so stupid as to regularly commit suicide on a far stronger opponent, so they won't anymore. This also helps stop cheats who use programs to unfairly keep their character logged in at a respawn point, and gain combat xp unfairly.`,
            date: '2002-10-23'
        },
        {
            category_id: 7,
            title: '6th November',
            content: `There is a small bug in varrock, so please be careful. It is possible to get stuck behind a fence in the south-east corner near the 'dancing donkey' inn. Please do NOT go there or you may become trapped.
<p>
If you are already trapped then it is possible to escape by clicking 'attack' on an npc on the opposite side of the fence, or by clicking 'follow' on a player on the opposite side of the fence. If you still can't get out then wait until monday when the builders are coming in to remove that fence.
<p>
We apologise for this bug, it will be fixed on monday. Anyone trying to get other players trapped in that space will be BANNED for bug abuse.`,
            date: '2002-11-06'
        },
        {
            category_id: 7,
            title: '11th November',
            content: `Server upgrades. This morning we upgraded our philadelphia servers. We've made the following improvements:
<ul>
  <li>All philadelphia servers moved to a new power circuit</ul>
  <li>Our main database server has twice as much memory (it now has 2gig)</ul>
  <li>We've replaced our webserver with a new one which is four times more powerful</ul>
</ul>
We apologise for not fixing the bug mentioned below today. Unforseen problems with todays upgrade slowed us down slightly. We are waiting for one of our servers to be repaired (hopefully tommorow).`,
            date: '2002-11-11'
        },
        {
            category_id: 7,
            title: '13th November',
            content: `Mining improved! We have changed mining and fishing so that they no longer consist of hours of tedious repetative clicking. The rocks are now easier to mine so you don't have to click anything like as much, and prospecting always works.
<p>
Instead of the repetative clicking we have introduced a new 'fatigue' system which means as you do tasks such as mining your character slowly becomes tired. After a certain point (which depends on your level, and on the rock), you will become too tired to mine. When this happens simply rest at a bed or eat some food, and you'll feel much more lively again. The upshot of this is that the honest miners should be able to get their ore slightly quicker, whilst the cheats will just have to go somewhere else.
<p>
Also due to popular request we have modified the wilderness monsters so they are always agressive regardless of your level. It was pointed out by many players that the wilderness is supposed to be dangerous place, so the new monster attacking rule has been removed in this zone.`,
            date: '2002-11-13'
        },
        {
            category_id: 7,
            title: 'Fatigue - version #2 now online',
            content: `We've worked extremely hard today to update the mining/fishing system with respect to your comments and feedback. The old system was considered rather too much of a change by many, so we've made a new one is more like the original mining. Here is how the new system works.
<p>
<ul>
  <li>You can now actually see ore in the rock on the screen, so you can see when it spawns</li>
  <li>Ore now appears in the rocks TWICE as fast as it did pre-fatigue</li>
  <li>When ore is available you will always manage to get it now, you very very rarely miss</li>
  <li>To compensate for the faster spawns you get slightly tired as you mine</li>
  <li>The higher level you have, the more you can mine before you become tired</li>
</ul>
We've put a LOT of effort into balancing this system, I even wrote a little test program to compare the overall times of mining and fishing before and after, (this takes into account the extra time taken to go and get some rest), the time it takes to get ore / level should new be pretty much EXACTLY the same it was before, but mining is now much more varied and fun. We've also moved an awful lots of bed, and a few rocks/fish to make certain all the sites always have a bed within a carefully calculated distance,
<p>
Please give the system a good chance before sending any feedback. We've really put a lot of effort into making sure the version#2 system doesn't disadvantage anyone (except cheats!)
<p>
We might need to make a few more tweaks yet, but hopefully we're getting close to a really good system now.
<p>
Thanks Andrew`,
            date: '2002-11-14'
        },
        {
            category_id: 7,
            title: 'Small tweaks to mining',
            content: `Today we've made the following small changes to mining:

<ul>
  <li>You can now mine twice as much silver before getting tired. This is because it was pointed out that it shouldn't really by harder to get silver than gold. This actually now means silver is easier to get than it has ever been in the past</li>
  <li>We've made it 2-3 times easier to get gems under the new mining system, since that wasn't quite balanced correctly</li>
  <li>We've added a new mine in the swamp south of Lumbridge with 4 mithril rocks, and 1 adamantite rock, this is to replace the rocks removed from elsewhere. The rocks were moved to make sure everything is the correct distance from a bed for the new system to work properly.</li>
  <li>We made bread, pies, and pizza restore TWICE as much fatigue as they did before, which should make these foods much more worthwhile. We predict enterprising pizza sellers will turn up at the mining sites shortly :-)</li>
</ul>

A few confused players seem to think the new fatigue system actually makes mining take longer, but this is not the case. After testing every single mining site at every single level, we can conclusivly say that it takes no longer to get ore, or level-up than before. But it's a heck of a lot less tedious and repetitive.
<p>
Remember we've added lots of new beds so you might not have to walk as far as you think, we're hoping to add all bed locations to our worldmap soon to help you find them.`,
            date: '2002-11-15'
        },
        {
            category_id: 1,
            title: 'Fatigue reduced',
            content: `Due to popular demand, it is now possible to mine and fish for longer without getting tired!
<p>
There are now two sort of rocks you can mine:
<p>
Soft rocks - These rocks spawn quite slowly, but they are easy to mine so you get very little fatigue from them. Mining these rocks is much like mining was originally before we changed it. You can easily get a full load of ore before you become too tired to mine.
<p>
Hard rocks - These use our new mining system for less repeat clicking. You can get the ore out of the rocks very quickly, and you can see it spawn so you aren't clicking blindly. However you will need to rest quite often when mining these rocks. For people who don't like clicking the same spot on the screen over and over you may find this way more fun.
<p>
We've also adjusted the fishing system. We considered introducing deep and shallow fish, but it doesn't work too well so instead we've just made the fish give a lot less fatigue than before, and spawn close to the original rate. This was what most players indicated they wanted.
<p>
One final note: We are aware that the numbers of soft and hard rocks may need balancing slightly. We will be keeping a close eye on this to make sure there are enough rocks of each type available. Depending on which rock type is most popular we may need to adjust the numbers slightly, so there is no need to ask us about this.`,
            date: '2002-11-25'
        },
        {
            category_id: 7,
            title: 'Important note about RuneScape Windows client',
            content: `We've recently had a few queries from RuneScape users who say the RuneScape Windows client is crashing. (Even though it worked fine previously). We haven't changed our windows client recently, and from what we've been told it seems it's actually a recent windows update which is causing this problem.
<p>
We believe this problem has now been fixed in another windows update. Therefore if you are having problems with the RuneScape client failing we recommend you visit windowsupdate.com to get the latest patches. This should fix it.`,
            date: '2002-11-28'
        },
        // ---- was there any history between 11-28 and 12-11? if so rip
        // https://web.archive.org/web/20030228001731/http://www.runescape.com/Runescape.html
        {
            category_id: 2,
            title: 'New website online!',
            content: `After many weeks of hard work our new website is finally online - think of it as an early Christmas Present! We hope that you will find the site easier to use and to find your way around.
<p>
Although we have tested the site as best we can, if you do find any problems, please let us know through the 'Feedback' section in our 'Customer Support' area accessible via the main page.
<p>
Cheers,
<p>
<b>The Jagex Team</b>`,
            date: '2002-12-11'
        },
        {
            category_id: 1,
            title: 'Agility skill online',
            content: `We've just added another massive members update. The long awaited agility skill is finally available. You can practice on two different training courses, or try the agility dungeon.
<p>
We've also added a new quest which uses the agility skill - called the "Grand tree quest". This is set in an enormous new area called the Gnome stronghold which also includes loads more besides the quest. Even more agility quests will of course be added in future updates.`,
            date: '2002-12-12'
        },
        {
            category_id: 3,
            title: 'Cheating scum banned',
            content: `If you cheat at RuneScape you will be banned. We have very advanced detection routines, and we can tell if you use programs to control your character for you. We've just banned over 400 players for cheating in this way. Many of whom were high level members.
<p>
We'd like to remind our players that using macros to play for you is NOT allowed and we WILL permanantly ban you for it, no exceptions!`,
            date: '2002-12-12'
        },
        // ---- was there any history from 12-12 to 12-23? if so rip
        // https://web.archive.org/web/20030101091726if_/http://www.runescape.com/news.cgi
        {
            category_id: 7,
            title: 'San-Franciso servers online',
            content: "The RuneScape worlds were getting rather full again so we've put some more online. As previously promised the servers are on the west coast of the US this time. We've added 3 free servers, and 1 new members server",
            date: '2002-12-23'
        },
        {
            category_id: 1,
            title: 'Merry Christmas',
            content:
                "Merry christmas from the Jagex team. We're dropping some santa hat's today at random intervals in random places. They're just a bit of fun though, so please don't be too upset if you can't find one. If you manage to get more than one then please consider giving them to your friends as christmas presents. Of course you can sell them but's not really the spirit of christmas :-)",
            date: '2002-12-25'
        },
        // after this RS starts keeping newsposts around
        {
            category_id: 5,
            title: 'Siw Midtrud',
            content: `It was with great sadness that we learned of the death of Siw Midtrud, SIW39, a long time player of Runescape. Siw passed away last month after a long time fighting against disease.
<p>
Siw was an avid player of the game, currently ranked at 512 on the all-time list, with atttack of 81/81, strength of 91/91 and herblaw of 73/73.
<p>
Siw was popular and well-loved by a great number of the Runescape community. Our thoughts go out to her family and friends.`,
            date: '2003-01-14'
        },
        {
            category_id: 2,
            title: 'New News Section',
            content: `As you will no doubt have noticed, the Runescape news section has had a makeover. This is part of our effort to communicate to you more often, and we will be regularly posting news in the appropriate sections that you can see above.
<p>
Clicking any of the category names will show only news of that type, most recent first. Clicking &#039;All Categories&#039; will show you all news items.
<p>
We hope that you will find the new news section easy to use, and more importantly, up to date with current Runescape affairs.`,
            date: '2003-01-21'
        },
        {
            category_id: 3,
            title: 'Credit card fraud warning',
            content: `Don&#039;t accept membership from other players - doing so is dangerous!
<p>
We would like to remind everyone that you must <b>NOT</b> allow another player to pay for your runescape account membership.
<p>
If someone offers you either a low level members account or offers to upgrade your own account to a members account (usually in return for runescape items), the chances are that the way they are paying will be fraudulent. When we discover this, we will cancel the payment, and then ban your account permanently. So please do not fall for this trick. 
<p>
The general rule is, if its too good to be true, it normally is!
<p>
Fraudulent payments will be unearthed and result in automatic and permanent bans for all concerned. All transactions are logged. We can track and prosecute anybody attempting to make fraudulent payments. It is not allowed to pay for the membership of someone outside your family. `,
            date: '2003-01-21'
        },
        {
            category_id: 5,
            title: 'Wedding bells at Jagex!',
            content: `<p align= justify>
Simon  Brace,  Jagex&#039;s  most  eligible  batchelor is no longer eligible. That&#039;s right, someone&#039;s actually agreed to marry him! Runescape players will know our husband to be
 as &quot;modsimon&quot;. The scourge of hackers everywhere, Simon
    frequently appears on-line, valiantly fighting customer
    support related crime. 

<p align= justify>              
    A certain girl by the name of Becky is the 
    lucky lady in question, and  Simon assures us that  
    her decision was not made under duress. As the man 
    himself says:

<p align= justify>  
    &quot;There&#039;s this  little lake  in Birmingham  that we walked
    down by after I  took her for a  meal. I got down on one 
    knee, whipped my ring out and proposed to her under the stars 
    with swans  watching us on the  lake. The diamond sparkled 
    in the  moonlight 
    but it could never compare  to the sparkle of her  eyes, 
    the way they light up whenever we&#039;re together :-)&quot; 

<p align= justify>
    With his fiance preparing to become Mrs Becky Brace, Simon 
    has set a date for 14th February, 2005, in what promises to 
    be the mother of all updates in this 
    young man&#039;s life. On behalf of Jagex and Runescape may I take 
    this opportunity 
    to wish you both the very best of luck! 

<p align= justify>
    (Now we&#039;d like to say that they fell in love over Runescape,
    but that could never really happen... could it?)`,
            date: '2003-01-23'
        },
        {
            category_id: 2,
            title: 'Last chance to move items',
            content: `We are planning on removing the RS-Classic to RuneScape item-transferal page tomorrow (on Friday 23rd-Apr) As we&#039;ve said previously we don&#039;t want to keep the two games permanently linked, because doing so limits the potential of our new game engine.
<p>
We are instead going to run them as two separate games, which don&#039;t affect each other. In particular we want to increase the amount of bank space RuneScape players have, but can&#039;t do this whilst the bank system is still attached to the old RS-Classic bank system.
<p>
Therefore this is just a quick warning that today is your last chance to move items from RS-Classic to RuneScape.
<p>
Thanks<br>
The Jagex Team`,
            date: '2004-04-22'
        },
        {
            category_id: 2,
            title: 'Guthix returns...',
            content: `...to speak his mind once more in <a href=/varrock/letters/19 class=c>Letters 19</a>.<p>
Fans of the deity who can&#039;t make up his mind as to which side he&#039;s on, should make their way to the <a href=/varrock class=c>Library of Varrock</a> and see what secrets the RuneScape gods have revealed in this edition.`,
            date: '2004-04-23'
        },
        {
            category_id: 1,
            title: 'Bigger Banks & Treasure Trails',
            content: `<b>Bigger bank space</b><br>
As promised we have now increased the size of your bank accounts. We have increased the size of both free and members banks by 25%. So free users get another 12 slots and members get another 48.
<p>
<b>Treasure trails</b><br>
Today we have released treasure trails into RuneScape. Various npcs on members servers will now ocassionaly drop random clues.
<p>
Each clue points to the location of another random clue. Solve enough clues (and maybe face one or two other challenges) and you will eventually find treasure, which could be anything from food or weapons to various rare items which can only be found on treasure trails.
<p>
Stronger monsters will tend to drop harder clues which will tend to lead towards more valuable treasure. Be warned the hardest clues are very tricky indeed.
<p>
You can&#039;t be on more than one treasure trail at once. If you have a clue, npcs won&#039;t drop more clues until you solve the trail you are on, or you abandon the trail  by dropping your current clue.
<p>
Treasure clue are a fairly rare drop. A similar sort of rarity to low level gems, although not necessarily on the same monsters. If you just keep playing normally you will get them as a pleasant suprise from time to time.
<p>
Good luck and happy treasure hunting!
<p>
<b>Faster herblaw secondary ingredients respawns.</b><br>
Various players have pointed out to us the spawn rate of certain herblaw ingredients had slowed down. So we have sped them up. You should be able to get your snape grass, white berries and jangerberries nice and quickly.`,
            date: '2004-05-05'
        },
        {
            category_id: 1,
            title: 'Dueling changes',
            content: `Rangers now get arrows back from duels. Previously when a duel ended a ranger would be teleported out, leaving all the arrows they had fired on the ground.<br> Now they get the arrows put back in their inventory at the end instead. 
<p> 
<b>New duel options</b>
<p>
Flower power - Duelists must fight each other wielding flowers.<br>
No Jewellery - Have a duel where you can&#039;t use amulets or rings.<br> 
This option was put in as these objects can still be used if you select no weapons and no armour.
<p>
People were commenting that the fire giants under the waterfall were getting overcrowded; they will be happy to know the giants have now increased in numbers there.`,
            date: '2004-05-10'
        },
        {
            category_id: 4,
            title: 'World 17 under repair',
            content: `The server which runs world 17 in Toronto seems to have suffered a hardware failure.
<p>
We are currently looking into getting the machine fixed, but the world may be offline for a few days if we have to ship it back to the manufacturer for repairs.
<p>
Please use a different world in the meantime. Thanks for your patience, we&#039;re working to get it repaired as quickly as possible.`,
            date: '2004-05-14'
        },
        {
            category_id: 1,
            title: 'Big Chompy Bird Hunting',
            content: `City life doesn&#039;t suit everyone, which is why Rantz and the rest of his ogre family have set up residence on the east coast in a cosy little cave with a nice view of the sea.<br> 
However, independence comes at a cost. There&#039;s no more easy meals for the family and they currently have a hankering for Chompy Bird, a favourite delicacy of ogres.
<p>
Rantz is keen to start the Chompy Bird hunting season, but can&#039;t get started. He&#039;s all fingers and thumbs when it comes to making ogre arrows for his huge ogre bow.<br>
Is there someone kind and experienced enough with fletching to go help him and his starving family?<br>
Find out if you have what it takes in our new <a href=/rs2/quests/chompy class=c>Big Chompy Bird Hunting Quest</a>!`,
            date: '2004-05-18'
        },
        {
            category_id: 3,
            title: 'UK SMS Telebilling Change',
            content: `We have recently upgraded our UK PayBySMS Telebilling service.
<p>
Please note that when sending an SMS to subscribe using PayBySMS in the UK, you should now send to the new shortcode <b>89118</b>.
<p>
Thanks,
<p>
RuneScape Billing Support`,
            date: '2004-05-21'
        },
        {
            category_id: 2,
            title: 'Hiscores Improved',
            content: `Players will be glad to hear that today we have expanded our RuneScape hiscores list to show the <b>top 500,000</b> players in every skill.<p>
We have made this change as the competition was getting extremely fierce for a place in the hiscores in certain stats. You now have a greater chance of being able to see how you rank against your friends and enemies in your favourite skill!
<p>
Please note that you still need at least level 30 in a skill to appear in the relevant table. Also players who have not yet played since the change will not appear in the table until they login, so it will take a few days to fill up.`,
            date: '2004-05-24'
        },
        {
            category_id: 2,
            title: 'World Map Updated',
            content: `We are pleased to announce that we have once again updated our World Map of the RuneScape world!
<p>
You can see the new version of the World Map, complete with all the latest map areas in the &#039;How To Play&#039; section of our front page, or by clicking <a href=worldmap class=c>here</a>.`,
            date: '2004-05-25'
        }
    ])
    .ignore()
    .execute();

process.exit(0);
