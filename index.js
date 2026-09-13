const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    PermissionsBitField, 
    ChannelType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    AttachmentBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

let discordTranscripts;
try {
    discordTranscripts = require('discord-html-transcripts');
} catch (e) {
    discordTranscripts = null;
}

let initWorkingHours;
let sendShiftUpdate;
try {
    const wh = require('./working-hours');
    initWorkingHours = wh.initWorkingHours;
    sendShiftUpdate = wh.sendShiftUpdate;
} catch (e) {
    initWorkingHours = null;
    sendShiftUpdate = null;
}

// =============================================================
// BOT CONFIGURATION & PRESETS
// =============================================================
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN || process.env.DISCORD_TOKEN,
    PREFIX: '!',
    
    // Server Role IDs
    CUSTOMER_ROLE_ID: process.env.CUSTOMER_ROLE_ID || 'YOUR_CUSTOMER_ROLE_ID',
    STAFF_ROLE_ID: '1533093844822790225',
    TRIAL_STAFF_ROLE_ID: '1542980594408099901',
    ADMIN_ROLE_IDS: ['659477576422785025', '1533546090983588074', '1542980594408099904'],

    // Channel & Category Routing
    WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || 'YOUR_WELCOME_CHANNEL_ID',
    NEWS_CHANNEL_ID: '1537392374185992242',
    STAFF_DISPATCH_CHANNEL_ID: '1546088909702824067',
    TRANSCRIPT_LOG_CHANNEL_ID: '1546038594613813350',
    TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '1535740055623180388',
    APP_CATEGORY_ID: process.env.APP_CATEGORY_ID || '1535740055623180388',
    APP_LOG_CHANNEL_ID: process.env.APP_LOG_CHANNEL_ID || '1545741112868610068',

    // Auto-Nuke Configuration
    NUKE_CHANNEL_ID: '1533093897277014157',
    NUKE_INTERVAL_HOURS: 24,

    // Verified Links & Permanent Assets
    DEFAULT_STORE_URL: 'https://gmh-shop.com',
    TICKET_CHANNEL_LINK: 'https://discord.com/channels/1040987039270707231/1533093930730520689/1545784377123012621',
    VERIFY_LINK: 'https://verify.guildmergers.com/gmhub/1040987039270707231',
    PERMANENT_BANNER_URL: 'https://cdn.discordapp.com/attachments/1533856623108292811/1546231062743752714/Gemini_Generated_Image_2rln5o2rln5o2rln.jpg'
};

// Dynamic Welcome Message Settings
let WELCOME_CONFIG = {
    title: '🎉 Welcome to GameMarket Hub!',
    body: 
        "To welcome you aboard, we've issued two exclusive discount vouchers for our store:\n\n" +
        "🎟️ **Starter Voucher (One-Time Access)**\n" +
        "```text\nGMH\n```\n" +
        "• **25% OFF** your order\n" +
        "• Valid for **1 single purchase** (best value on larger baskets)\n\n" +
        "🎟️ **Standard Voucher (Multi-Use)**\n" +
        "```text\nNEW10\n```\n" +
        "• **10% OFF** your order\n" +
        "• Can be reused up to **10 times** per customer\n\n" +
        "💡 **How to Apply Your Discounts:**\n" +
        "1. Select your tools on [gmh-shop.com](https://gmh-shop.com)\n" +
        "2. Add your products to the cart\n" +
        "3. Enter 'GMH' (25% off once) or 'NEW10' (10% off recurring) at checkout\n" +
        "4. Enjoy instant automated key delivery directly after purchase\n\n" +
        "❓ **Need Help or Setup Support?**\n" +
        "If you have questions about prerequisites, compatibility, or alternative payments, click below to open a ticket directly.",
    bannerUrl: CONFIG.PERMANENT_BANNER_URL,
    storeUrl: CONFIG.DEFAULT_STORE_URL
};

const BANNED_KEYWORDS = [
    'cheat', 'cheats', 'cheater', 'cheating', 'hack', 'hacks', 'hacker', 'hacking',
    'spoof', 'spoofing', 'spoofer', 'hwid spoofer', 'aimbot', 'wallhack', 'esp',
    'triggerbot', 'spinbot', 'chams', 'softaim', 'silent aim', 'mac changer',
    'serial cleaner', 'hwid unban', 'hardware ban bypass'
];

const WARN_MESSAGES = [
    "Whoa there, gamer! We don't speak in forbidden dark magic here. Enjoy a 1-minute timeout to contemplate your dictionary choices. 🤫",
    "Did you really just type that? Discord's algorithms almost had a seizure. Sit in the corner for 1 minute. 🛑",
    "Language! We use refined corporate buzzwords like *'advanced system utilities'* here. Back in 1 minute! 🧼",
    "Caught red-handed trying to summon the ban hammer! 1-minute timeout applied. Wipe your keyboard. ⌨️"
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// Runtime Storage
const activeTickets = new Map();
const draftAnnouncements = new Map();
const afkUsers = new Map();
const afkCooldowns = new Map();
const pendingMultiAdd = new Map();

// =============================================================
// PRE-POPULATED STORE CATALOG
// =============================================================
const downloadCatalog = new Map([
    ['ARC', [
        { name: 'Ancient: ARC Raiders', description: 'ARC Raiders Internal Utility', url: 'https://gmh-shop.com' },
        { name: 'Yami: ARC Raiders External + Spoofer', description: 'External overlay + built-in spoofer', url: 'https://gmh-shop.com' },
        { name: 'BLITZ: ARC Raiders External', description: 'External visual assistance tool', url: 'https://gmh-shop.com' },
        { name: 'Skyra: ARC Raiders Cheat', description: 'High performance ARC Raiders loader', url: 'https://gmh-shop.com' },
        { name: 'AC-ARC Raiders', description: 'Clean external utility for ARC Raiders', url: 'https://gmh-shop.com' }
    ]],
    ['APEX', [
        { name: 'Raiko: Apex Legends Internal', description: 'Precision internal feature set', url: 'https://gmh-shop.com' },
        { name: 'Ancient: Apex Legends', description: 'Full featured loader for Apex', url: 'https://gmh-shop.com' },
        { name: 'Venom: Apex Legends', description: 'Optimized external suite', url: 'https://gmh-shop.com' },
        { name: 'Arcane: Apex Legends', description: 'Kernel-level Apex loader', url: 'https://gmh-shop.com' }
    ]],
    ['FN', [
        { name: 'Fortnite: Full Public', description: 'Public stable Fortnite loader', url: 'https://gmh-shop.com' },
        { name: 'Venom: Fortnite', description: 'External performance utility', url: 'https://gmh-shop.com' },
        { name: 'Ancient: Fortnite Cheat', description: 'Comprehensive Fortnite tool', url: 'https://gmh-shop.com' },
        { name: 'Arcane: Fortnite Cheat', description: 'Advanced security Fortnite loader', url: 'https://gmh-shop.com' },
        { name: 'EON Fortnite External', description: 'Smooth streaming-safe external', url: 'https://gmh-shop.com' }
    ]],
    ['DELTA FORCE', [
        { name: 'Ancient: Delta Force', description: 'Delta Force Warfare internal utility', url: 'https://gmh-shop.com' },
        { name: 'Delta Force: Grey Internal', description: 'Full memory internal tool', url: 'https://gmh-shop.com' }
    ]],
    ['PC PROTECTOR', [
        { name: 'AimBetter COD Spoofer - [TEMP]', description: 'Temporary boot spoofer for Call of Duty', url: 'https://gmh-shop.com' },
        { name: 'Rebooted HWID Spoofer', description: 'Universal hardware protection tool', url: 'https://gmh-shop.com' },
        { name: 'Ham Privacy Protector for FiveM [SPOOFER]', description: 'CitizenFX/FiveM hardware unbanner', url: 'https://gmh-shop.com' },
        { name: 'BO7 UNLOCKER + SPOOFER', description: 'Black Ops 6/7 camo unlocker & hardware mask', url: 'https://gmh-shop.com' },
        { name: 'Natural Permanent Spoofer', description: 'Permanent BIOS/Motherboard serial changer', url: 'https://gmh-shop.com' },
        { name: 'Ghost COD Spoofer - [TEMP]', description: 'Temporary memory spoofer for Warzone', url: 'https://gmh-shop.com' },
        { name: 'Multi Temp Spoofer', description: 'Multi-game temporary cleaner & spoofer', url: 'https://gmh-shop.com' },
        { name: 'Infinite Spoofer [RANKED READY] - [TEMP]', description: 'EAC/BattlEye/Ricochet Ranked spoofer', url: 'https://gmh-shop.com' }
    ]],
    ['VALORANT', [
        { name: 'Vanguard Emulator PRIVATE', description: 'Private Vanguard hypervisor bypass', url: 'https://gmh-shop.com' },
        { name: 'BTG: Valorant ESP', description: 'External visual assistance overlay', url: 'https://gmh-shop.com' },
        { name: 'Valorant: Public Full', description: 'Complete Valorant feature set', url: 'https://gmh-shop.com' }
    ]],
    ['COD', [
        { name: 'Ancient: COD External', description: 'Warzone / BO6 external tool', url: 'https://gmh-shop.com' },
        { name: 'Grey - Silver DMZ/MWII Internal', description: 'Legacy MW2 & DMZ internal suite', url: 'https://gmh-shop.com' },
        { name: '[BO7/WZ] Thunex External', description: 'BO6 / Warzone external feature set', url: 'https://gmh-shop.com' },
        { name: 'BO7: Royal External', description: 'Royal premium external overlay', url: 'https://gmh-shop.com' },
        { name: 'CA-Call of Duty: BO7 | Warzone', description: 'Complete Call of Duty assistance tool', url: 'https://gmh-shop.com' },
        { name: 'MW4 & BO7 - Kairos External', description: 'Kairos external engine', url: 'https://gmh-shop.com' },
        { name: '[MW4 BETA] Lyra External - Day ACESS', description: 'Lyra external loader suite', url: 'https://gmh-shop.com' },
        { name: 'DW COD-7 / MW-4 External', description: 'DW external memory loader', url: 'https://gmh-shop.com' }
    ]],
    ['CS2', [
        { name: 'CS2: Skin Changer', description: 'Instant weapon skin and knife switcher', url: 'https://gmh-shop.com' },
        { name: 'CS2: Predator Systems', description: 'Full CS2 combat & visual features', url: 'https://gmh-shop.com' },
        { name: 'CS2: Aim Internal', description: 'Internal kernel memory suite for CS2', url: 'https://gmh-shop.com' }
    ]],
    ['R6S', [
        { name: 'Sapphire: R6S Unlock All', description: 'All weapon skins, charms, and operators', url: 'https://gmh-shop.com' },
        { name: 'Vega - R6 External', description: 'Stream-proof external Siege overlay', url: 'https://gmh-shop.com' },
        { name: 'Ancient: Rainbow Six Siege', description: 'Full Siege internal assistance', url: 'https://gmh-shop.com' },
        { name: 'Crusader: Rainbow Six Siege', description: 'Crusader security-tested loader', url: 'https://gmh-shop.com' }
    ]],
    ['RUST', [
        { name: 'MEK - Rust External', description: 'Smooth recoil & visual external tool', url: 'https://gmh-shop.com' },
        { name: 'Ancient: Rust', description: 'Comprehensive Rust internal engine', url: 'https://gmh-shop.com' },
        { name: 'Arcane: Rust', description: 'Long-term undetected Rust utility', url: 'https://gmh-shop.com' }
    ]],
    ['ARENA BREAKOUT', [
        { name: 'Akuma - Arena Breakout', description: 'Internal memory suite for ABI', url: 'https://gmh-shop.com' },
        { name: 'Ancient: ABI Radar', description: '2D Web / Overlay radar assistance', url: 'https://gmh-shop.com' },
        { name: 'CA - Arena Breakout Infinite', description: 'Full feature loader for Infinite', url: 'https://gmh-shop.com' }
    ]],
    ['FIVE M', [
        { name: 'Arcane: GTA V Enhanced', description: 'Enhanced utility for Grand Theft Auto V', url: 'https://gmh-shop.com' },
        { name: 'Ham Exec + Vanity Menu Bundle', description: 'Complete Lua executor and menu bundle', url: 'https://gmh-shop.com' }
    ]],
    ['BATTLEFIELD 6', [
        { name: 'Ancient: Battlefield 6', description: 'Battlefield engine memory utility', url: 'https://gmh-shop.com' },
        { name: 'Arcane: Battlefield 6', description: 'External tactical overlay', url: 'https://gmh-shop.com' }
    ]],
    ['DEAD BY DAYLIGHT', [
        { name: 'Ancient: Dead By Daylight', description: 'Full survivor and killer ESP', url: 'https://gmh-shop.com' },
        { name: 'Arcane: Dead By Daylight', description: 'Skill check and entity highlighter', url: 'https://gmh-shop.com' }
    ]],
    ['ESCAPE FROM TARKOV', [
        { name: 'Ancient: Escape From Tarkov', description: 'Loot filter, PMC visual, and memory suite', url: 'https://gmh-shop.com' }
    ]],
    ['DAYZ', [
        { name: 'Arcane: DayZ', description: 'Inventory radar, player ESP & item tracker', url: 'https://gmh-shop.com' }
    ]],
    ['DEADLOCK', [
        { name: 'Deadlock: Predator', description: 'Tactical target locator and visuals', url: 'https://gmh-shop.com' }
    ]],
    ['ROBLOX', [
        { name: 'Roblox: Purple External', description: 'Universal game external utility', url: 'https://gmh-shop.com' }
    ]],
    ['FORZA 6', [
        { name: 'Forza Horizon 6: FH6Engine', description: 'Car credits, autosteer, and performance', url: 'https://gmh-shop.com' }
    ]],
    ['MECCHA', [
        { name: 'Mimicry: Meccha Chameleon Internal', description: 'Internal specialized assistance tool', url: 'https://gmh-shop.com' }
    ]],
    ['SCUM', [
        { name: 'CA - SCUM', description: 'Survival item tracker and precision tools', url: 'https://gmh-shop.com' }
    ]],
    ['PUBG', [
        { name: 'Ancient: PUBG', description: 'Recoil compensation & player ESP', url: 'https://gmh-shop.com' }
    ]],
    ['SUPPORT', [
        { name: 'GMH Support Tool', description: 'Diagnostic & prerequisite runtime installer', url: 'https://gmh-shop.com' }
    ]]
]);

function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)([smhd])$/i);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const mults = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    return val * mults[unit];
}

function buildAdminCatalogEmbed() {
    let inventoryDesc = '';
    let totalItems = 0;

    for (const [cat, prods] of downloadCatalog.entries()) {
        totalItems += prods.length;
        const toolNames = prods.map(p => `\`${p.name}\``).join(', ');
        inventoryDesc += `📁 **${cat}** (${prods.length}):\n${toolNames || '*None*'}\n\n`;
    }

    if (inventoryDesc.length > 3900) {
        inventoryDesc = inventoryDesc.slice(0, 3900) + '...\n*(Inventory truncated due to Discord length limit)*';
    }

    return new EmbedBuilder()
        .setTitle('🛠️ GMH Download Catalog Inventory')
        .setDescription(`Current tools configured in the customer download system.\n\n${inventoryDesc}`)
        .setColor(0xFF0055)
        .setFooter({ text: `Total Loaders: ${totalItems} | Total Categories: ${downloadCatalog.size}` })
        .setTimestamp();
}

const APP_QUESTIONS = [
    { title: "Age & Hardware", question: "**Question 1/9:** How old are you, and do you own a Windows PC that you can use while providing support?" },
    { title: "Timezone & Active Hours", question: "**Question 2/9:** What is your timezone/country, and what specific hours of the day are you active?" },
    { title: "Past Experience", question: "**Question 3/9:** What past experience do you have moderating Discord servers or managing support tickets?" },
    { title: "Antivirus / Defender", question: "**Question 4/9:** A buyer downloads a file and says it instantly deletes itself or won't open. What exact steps or antivirus exclusions do you guide them through?" },
    { title: "PC Requirements", question: "**Question 5/9:** A tool fails to run due to missing PC prerequisites. Which common runtimes, DirectX components, or BIOS settings (e.g. Virtualization/TPM) do you check?" },
    { title: "Chat Triage", question: "**Question 6/9:** A user starts complaining in public chat calling the server a scam because their key or support is taking time. How do you handle this publicly, and how do you direct them into tickets?" },
    { title: "Escalation Policy", question: "**Question 7/9:** Lower staff do NOT dispense keys or process refunds. If a user demands a replacement key or refund, what exact order information do you gather before escalating to senior staff?" },
    { title: "Rules & Favoritism", question: "**Question 8/9:** If a friend of yours in the server breaks server rules or asks you for free access/leaks, how do you respond?" },
    { title: "Compensation", question: "**Question 9/9:** Are you looking to be compensated through free tool access keys, weekly payouts, or a mixture of both?" }
];

client.once('ready', async () => {
    console.log('=========================================');
    console.log(`[ONLINE] Logged in as: ${client.user.tag}`);
    console.log('=========================================');
    client.user.setActivity('gmh-shop.com', { type: 3 });

    if (CONFIG.NUKE_CHANNEL_ID) {
        const intervalMs = CONFIG.NUKE_INTERVAL_HOURS * 60 * 60 * 1000;
        setInterval(() => {
            nukeChannel(CONFIG.NUKE_CHANNEL_ID);
        }, intervalMs);
    }

    if (initWorkingHours) {
        try {
            initWorkingHours(client);
        } catch (err) {
            console.error('[WORKING HOURS ERROR]:', err.message);
        }
    }
});

// Member Leave Notification Logger
client.on('guildMemberRemove', async (member) => {
    try {
        const logChannel = member.guild.channels.cache.get(CONFIG.STAFF_DISPATCH_CHANNEL_ID) ||
                           await member.guild.channels.fetch(CONFIG.STAFF_DISPATCH_CHANNEL_ID).catch(() => null);
        if (!logChannel) return;

        const joinedTimestamp = member.joinedTimestamp 
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` 
            : 'Unknown';
        const createdTimestamp = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`;

        const roles = member.roles.cache
            .filter(r => r.id !== member.guild.id)
            .map(r => r.name)
            .join(', ') || 'None';

        const leaveEmbed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🚪 Member Left / Disconnected')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: false },
                { name: 'Joined Server', value: joinedTimestamp, inline: true },
                { name: 'Account Created', value: createdTimestamp, inline: true },
                { name: 'Assigned Roles', value: `\`\`\`text\n${roles}\n\`\`\``, inline: false }
            )
            .setFooter({ text: `Total Members: ${member.guild.memberCount}` })
            .setTimestamp();

        await logChannel.send({ embeds: [leaveEmbed] });
    } catch (err) {
        console.error('[LEAVE LOGGER ERROR]:', err);
    }
});

async function dispatchWelcomeMessage(member) {
    try {
        const welcomeEmbed = new EmbedBuilder()
            .setAuthor({ 
                name: 'GameMarket Hub', 
                iconURL: member.guild?.iconURL({ dynamic: true }) || WELCOME_CONFIG.bannerUrl 
            })
            .setTitle(WELCOME_CONFIG.title)
            .setDescription(`Hey ${member}, welcome to the server!\n\n${WELCOME_CONFIG.body}`)
            .setColor(0x00E5FF)
            .setFooter({ text: 'GameMarket Hub • Automated Welcome System' })
            .setTimestamp();

        if (WELCOME_CONFIG.bannerUrl && WELCOME_CONFIG.bannerUrl.startsWith('http')) {
            welcomeEmbed.setImage(WELCOME_CONFIG.bannerUrl);
        }

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Shop Catalog')
                .setStyle(ButtonStyle.Link)
                .setURL(WELCOME_CONFIG.storeUrl || CONFIG.DEFAULT_STORE_URL)
                .setEmoji('🛒'),
            new ButtonBuilder()
                .setLabel('Open Support Ticket')
                .setStyle(ButtonStyle.Link)
                .setURL(CONFIG.TICKET_CHANNEL_LINK)
                .setEmoji('🎟️')
        );

        await member.send({ embeds: [welcomeEmbed], components: [actionRow] });
        console.log(`[WELCOME DM SUCCESS] Sent DM directly to ${member.user?.tag || member.id}`);
        return true;
    } catch (err) {
        console.error(`[WELCOME DM BLOCKED] Could not DM user: ${err.message}`);
        return false;
    }
}

client.on('guildMemberAdd', async (member) => {
    console.log(`[MEMBER JOINED] ${member.user.tag} joined. Executing automated welcome...`);
    await dispatchWelcomeMessage(member);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (CONFIG.CUSTOMER_ROLE_ID === 'YOUR_CUSTOMER_ROLE_ID') return;
    const hadRole = oldMember.roles.cache.has(CONFIG.CUSTOMER_ROLE_ID);
    const hasRole = newMember.roles.cache.has(CONFIG.CUSTOMER_ROLE_ID);

    if (!hadRole && hasRole) {
        console.log(`[ROLE GAINED] ${newMember.user.tag} verified. Sending welcome DM...`);
        await dispatchWelcomeMessage(newMember);
    }
});

async function nukeChannel(channelId) {
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        const position = channel.position;
        const newChannel = await channel.clone({ reason: 'Auto nuke' });

        await newChannel.setPosition(position);
        await channel.delete('Auto nuke');

        const embed = new EmbedBuilder()
            .setColor(0x00E5FF)
            .setTitle('🧹 Chat Nuked')
            .setDescription('This channel has been cleared to keep things clean.\nPlease continue discussions here.')
            .setFooter({ text: `Auto-nuke runs every ${CONFIG.NUKE_INTERVAL_HOURS}h` })
            .setTimestamp();

        await newChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('[AUTO-NUKE ERROR]:', error);
    }
}

function buildTicketControlRow(isClaimed = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒'),
        new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🙋')
            .setDisabled(isClaimed),
        new ButtonBuilder()
            .setCustomId('unclaim_ticket')
            .setLabel('Unclaim')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
            .setDisabled(!isClaimed)
    );
}

// =============================================================
// MESSAGE HANDLER: AUTOMOD, AFK ROUTING & COMMANDS
// =============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // 1. AUTOMOD FILTER
    if (message.author.id !== '659477576422785025' && message.member) {
        const contentLower = message.content.toLowerCase();
        const matchedWord = BANNED_KEYWORDS.find(keyword => contentLower.includes(keyword.toLowerCase()));

        if (matchedWord) {
            await message.delete().catch(() => {});

            if (message.member.moderatable) {
                await message.member.timeout(60 * 1000, `Automod: Forbidden word "${matchedWord}"`).catch(() => {});
            }

            const randomWarning = WARN_MESSAGES[Math.floor(Math.random() * WARN_MESSAGES.length)];
            const warnEmbed = new EmbedBuilder()
                .setTitle('🚨 Dictionary Violation!')
                .setDescription(`${message.author}, ${randomWarning}\n\n*Triggered keyword:* \`||${matchedWord}||\``)
                .setColor(0xFF0055);

            // Warning embed stays in chat permanently
            await message.channel.send({ embeds: [warnEmbed] }).catch(() => null);
            return;
        }
    }

    // 2. AFK SYSTEM
    if (afkUsers.has(message.author.id) && !message.content.startsWith(`${CONFIG.PREFIX}afk`)) {
        afkUsers.delete(message.author.id);
        const welcomeBackMsg = await message.reply({ content: `👋 Welcome back ${message.author}! Your AFK status has been removed.` }).catch(() => null);
        if (welcomeBackMsg) {
            setTimeout(() => welcomeBackMsg.delete().catch(() => {}), 5000);
        }
    }

    if (message.mentions.users.size > 0) {
        for (const [targetId, targetUser] of message.mentions.users) {
            if (targetUser.bot || targetId === message.author.id) continue;

            if (afkUsers.has(targetId)) {
                const cooldownKey = `${message.author.id}_${targetId}`;
                const lastSent = afkCooldowns.get(cooldownKey) || 0;
                const now = Date.now();

                if (now - lastSent > 60 * 1000) {
                    afkCooldowns.set(cooldownKey, now);

                    const afkData = afkUsers.get(targetId);
                    const afkEmbed = new EmbedBuilder()
                        .setTitle('⏳ Member Currently Unavailable')
                        .setDescription(
                            `**${targetUser.username}** is currently AFK or drowning in work right now and will get back to you as soon as possible!\n\n` +
                            `• **Status:** \`${afkData.reason}\`\n` +
                            `• **Away since:** <t:${Math.floor(afkData.timestamp / 1000)}:R>\n\n` +
                            `If you need urgent assistance, key setups, or order support, please click below to open a ticket directly.`
                        )
                        .setColor(0x00E5FF);

                    const ticketActionRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Open Support Ticket')
                            .setStyle(ButtonStyle.Link)
                            .setURL(CONFIG.TICKET_CHANNEL_LINK)
                            .setEmoji('🎟️')
                    );

                    const afkReply = await message.channel.send({
                        content: `${message.author}`,
                        embeds: [afkEmbed],
                        components: [ticketActionRow]
                    }).catch(() => null);

                    if (afkReply) {
                        setTimeout(() => afkReply.delete().catch(() => {}), 20 * 1000);
                    }
                }
            }
        }
    }

    // 3. COMMAND DISPATCHER
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const isStaff = message.member?.roles.cache.has(CONFIG.STAFF_ROLE_ID);
    const isAdmin = CONFIG.ADMIN_ROLE_IDS.some(id => message.member?.roles.cache.has(id) || message.author.id === id) ||
                    message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

    if (command === 'afk') {
        const reason = args.join(' ').trim() || 'Busy handling orders & updates';
        afkUsers.set(message.author.id, {
            reason: reason,
            timestamp: Date.now()
        });

        const confirmMsg = await message.reply(`💤 ${message.author}, your AFK status is active: \`${reason}\`.\nI'll notify anyone who mentions you and direct them to tickets.`);
        setTimeout(() => {
            message.delete().catch(() => {});
            confirmMsg.delete().catch(() => {});
        }, 5000);
        return;
    }

    if (command === 'shift-off' || command === 'shift-close') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        try {
            if (sendShiftUpdate) {
                await sendShiftUpdate(client, 'closed');
            }
            const confirmMsg = await message.channel.send('✅ Manual **Shift Closed (Off Hours)** announcement published to announcements.');
            return setTimeout(() => confirmMsg.delete().catch(() => {}), 5000);
        } catch (err) {
            return message.reply(`❌ Failed to send shift announcement: ${err.message}`);
        }
    }

    if (command === 'shift-on' || command === 'shift-open') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        try {
            if (sendShiftUpdate) {
                await sendShiftUpdate(client, 'open');
            }
            const confirmMsg = await message.channel.send('✅ Manual **Shift Open (Online)** announcement published to announcements.');
            return setTimeout(() => confirmMsg.delete().catch(() => {}), 5000);
        } catch (err) {
            return message.reply(`❌ Failed to send shift announcement: ${err.message}`);
        }
    }

    if (command === 'ping') {
        return message.reply(`🏓 Pong! Bot latency: \`${client.ws.ping}ms\``);
    }

    if (command === 'sendwelcome') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        const targetMember = message.mentions.members.first() || message.member;

        const sent = await dispatchWelcomeMessage(targetMember);
        if (sent) {
            return message.reply(`✅ Welcome DM successfully dispatched to ${targetMember}! Check your inbox.`);
        } else {
            return message.reply(`❌ Failed to send welcome DM to ${targetMember}. Ensure your Direct Messages are allowed from server members in privacy settings.`);
        }
    }

    if (command === 'setup-welcome') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const bannerStatus = (WELCOME_CONFIG.bannerUrl && WELCOME_CONFIG.bannerUrl.startsWith('http'))
            ? `[View Attached Image](${WELCOME_CONFIG.bannerUrl})`
            : '`None`';

        const welcomePanelEmbed = new EmbedBuilder()
            .setTitle('⚙️ Welcome Message Configuration Panel')
            .setDescription(
                'Configure the automated welcome DM received by members when joining GameMarket Hub.\n\n' +
                `• **Current Title:** \`${WELCOME_CONFIG.title}\`\n` +
                `• **Target Store:** \`${WELCOME_CONFIG.storeUrl}\`\n` +
                `• **Banner URL:** ${bannerStatus}\n\n` +
                'Click **Edit Welcome Message** below to modify copy, discounts, and visual media.'
            )
            .setColor(0x00E5FF);

        const welcomePanelRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_open_welcome_editor')
                .setLabel('Edit Welcome Message')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId('btn_preview_welcome')
                .setLabel('Test DM to Me')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📨')
        );

        return await message.channel.send({ embeds: [welcomePanelEmbed], components: [welcomePanelRow] });
    }

    if (command === 'deliver') {
        if (!isAdmin && !isStaff) return message.reply('❌ Unauthorized.');

        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('❌ Syntax: `!deliver @user <product/license key>`');

        const deliveryPayload = message.content
            .replace(/^![a-zA-Z0-9_-]+/, '')
            .replace(/<@!?[0-9]+>/g, '')
            .trim();

        if (!deliveryPayload) return message.reply('❌ Please provide the credentials or license key to deliver.');

        try {
            const deliveryEmbed = new EmbedBuilder()
                .setTitle('📦 Order Delivered • GameMarket Hub')
                .setDescription('Thank you for purchasing with **GameMarket Hub**!\nYour credentials and instructions are provided below.')
                .addFields(
                    { name: 'Product / License Key', value: `\`\`\`text\n${deliveryPayload}\n\`\`\`` },
                    { name: 'Storefront', value: `[gmh-shop.com](${CONFIG.DEFAULT_STORE_URL})`, inline: true },
                    { name: 'Support', value: `[Open Support Ticket](${CONFIG.TICKET_CHANNEL_LINK})`, inline: true }
                )
                .setColor(0x00E5FF)
                .setImage(CONFIG.PERMANENT_BANNER_URL)
                .setFooter({ text: 'GameMarket Hub • Automated Delivery System' })
                .setTimestamp();

            await targetMember.send({ embeds: [deliveryEmbed] });
            return await message.reply(`✅ Successfully delivered credentials to **${targetMember.user.tag}** via DM.`);
        } catch (err) {
            return await message.reply(`⚠️ Could not send DM to **${targetMember.user.tag}**. Their Direct Messages are closed.`);
        }
    }

    if (command === 'timeout' || command === 'mute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !isAdmin) {
            return message.reply('❌ Unauthorized.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!target) return message.reply('❌ Syntax: `!timeout @user 10m [reason]`');
        if (!target.moderatable) return message.reply('❌ Cannot moderate user due to role hierarchy.');

        const durationMs = parseDuration(args[1]);
        if (!durationMs || durationMs > 28 * 24 * 60 * 60 * 1000) {
            return message.reply('❌ Provide a valid duration up to 28 days (e.g. `60s`, `10m`, `2h`, `1d`).');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';
        try {
            await target.timeout(durationMs, `${reason} | By: ${message.author.tag}`);
            return message.channel.send(`🤐 **${target.user.tag}** timed out for **${args[1]}**.\n**Reason:** ${reason}`);
        } catch (err) {
            return message.reply(`❌ Failed to timeout user: ${err.message}`);
        }
    }

    if (command === 'untimeout' || command === 'unmute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !isAdmin) {
            return message.reply('❌ Unauthorized.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!target) return message.reply('❌ Syntax: `!untimeout @user`');
        if (!target.moderatable) return message.reply('❌ Cannot modify user.');

        try {
            await target.timeout(null, `Untimeout by ${message.author.tag}`);
            return message.channel.send(`🔊 Removed timeout from **${target.user.tag}**.`);
        } catch (err) {
            return message.reply(`❌ Failed to remove timeout: ${err.message}`);
        }
    }

    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers) && !isAdmin) {
            return message.reply('❌ Unauthorized.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!target) return message.reply('❌ Syntax: `!kick @user [reason]`');
        if (!target.kickable) return message.reply('❌ Cannot kick user.');

        const reason = args.slice(1).join(' ') || 'No reason provided';
        try {
            await target.kick(`${reason} | By: ${message.author.tag}`);
            return message.channel.send(`👢 Kicked **${target.user.tag}**.\n**Reason:** ${reason}`);
        } catch (err) {
            return message.reply(`❌ Failed to kick user: ${err.message}`);
        }
    }

    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !isAdmin) {
            return message.reply('❌ Unauthorized.');
        }

        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!target) return message.reply('❌ Syntax: `!ban @user [reason]`');
        if (!target.bannable) return message.reply('❌ Cannot ban user.');

        const reason = args.slice(1).join(' ') || 'No reason provided';
        try {
            await target.ban({ reason: `${reason} | By: ${message.author.tag}` });
            return message.channel.send(`🔨 Permanently banned **${target.user.tag}**.\n**Reason:** ${reason}`);
        } catch (err) {
            return message.reply(`❌ Failed to ban user: ${err.message}`);
        }
    }

    if (command === 'setup-news') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const controlEmbed = new EmbedBuilder()
            .setTitle('📢 News & Announcement Dispatcher')
            .setDescription(
                `Click below to generate an announcement for <#${CONFIG.NEWS_CHANNEL_ID}>.\n\n` +
                "**Features:**\n" +
                "• Custom banner image URL support\n" +
                "• Auto-attaches Store & Support Ticket buttons\n" +
                "• Supports direct Product links & pings"
            )
            .setColor(0x00E5FF);

        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('news_start_draft')
                .setLabel('Create Announcement')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📢')
        );

        return await message.channel.send({ embeds: [controlEmbed], components: [controlRow] });
    }

    if (command === 'send-verify') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('🛡️ GMH • Verification Required')
            .setDescription(
                "Welcome to **GameMarket Hub**!\n\n" +
                "To access our community channels, ticket support, and shop updates, verify your account below.\n\n" +
                "• Protects against spam bots & server raids\n" +
                "• Unlocks all member channels instantly\n" +
                "• Keeps your account connected to GMH backup systems\n\n" +
                "Click the button below to authorize and gain access."
            )
            .setColor(0x00E5FF)
            .setImage(CONFIG.PERMANENT_BANNER_URL)
            .setFooter({ text: 'GameMarket Hub • Automated Security' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify Account')
                .setStyle(ButtonStyle.Link)
                .setURL(CONFIG.VERIFY_LINK)
                .setEmoji('✅')
        );

        return await message.channel.send({ embeds: [embed], components: [row] });
    }

    if (command === 'send-apply') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const applyEmbed = new EmbedBuilder()
            .setTitle('💼 GMH • Staff Recruitment')
            .setDescription(
                "Interested in joining the **GameMarket Hub** support and moderation team?\n\n" +
                "**Requirements:**\n" +
                "• Active daily availability\n" +
                "• Functional Windows PC for technical assistance\n" +
                "• Clean conduct and strong communication\n\n" +
                "Click below to open your private recruitment channel."
            )
            .setColor(0x00E5FF)
            .setImage(CONFIG.PERMANENT_BANNER_URL)
            .setFooter({ text: 'GameMarket Hub • Staff Applications' });

        const applyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_open_app')
                .setLabel('Apply for Staff')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

        return await message.channel.send({ embeds: [applyEmbed], components: [applyRow] });
    }

    if (command === 'spawn-tickets') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const ticketEmbed = new EmbedBuilder()
            .setTitle('🛡️ GMH-SHOP • Customer Support Hub')
            .setDescription(
                "Need technical support, custom orders, or reseller access? Select the appropriate category below to open a direct channel with our staff team.\n\n" +
                "**⚡ Support Guidelines**\n" +
                "• **One Ticket per Issue:** Avoid opening duplicate tickets.\n" +
                "• **No Passive Pings:** Submit your problem details immediately upon opening.\n" +
                "• **Logs & Proof:** If reporting errors, attach full-screen screenshots and loader logs.\n\n" +
                "**💳 Accepted Payment Options**\n" +
                "• **Crypto:** BTC • LTC • USDT • ETH *(Instant auto-delivery on site)*\n" +
                "• **Credit / Debit Cards:** Supported via site checkout\n" +
                "• **Alternative:** PayPal F&F and Rewarble Gift Cards *(Supported through tickets)*\n\n" +
                "Click a button below to launch your private ticket form."
            )
            .setColor(0x00E5FF)
            .setImage(CONFIG.PERMANENT_BANNER_URL)
            .setFooter({ text: 'GameMarket Hub • Automated Support System' })
            .setTimestamp();

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_general').setLabel('Tech Support').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('ticket_purchase').setLabel('Buy / Payment').setStyle(ButtonStyle.Success).setEmoji('🛒'),
            new ButtonBuilder().setCustomId('ticket_resell').setLabel('Reseller Access').setStyle(ButtonStyle.Secondary).setEmoji('🤝'),
            new ButtonBuilder().setCustomId('ticket_hwid').setLabel('HWID Reset').setStyle(ButtonStyle.Danger).setEmoji('🔄')
        );

        return await message.channel.send({ embeds: [ticketEmbed], components: [buttonRow] });
    }

    // ==========================================
    // DOWNLOAD PANEL COMMANDS
    // ==========================================
    if (command === 'spawn-downloads') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const panelEmbed = new EmbedBuilder()
            .setTitle('📥 GameMarket Hub • Download Panel')
            .setDescription('Use the drop-down menu below to select your category and download loaders/files directly.')
            .setImage(CONFIG.PERMANENT_BANNER_URL)
            .setColor(0x00E5FF)
            .setFooter({ text: `${Array.from(downloadCatalog.values()).flat().length} loaders active | ${downloadCatalog.size} categories` });

        const categories = Array.from(downloadCatalog.keys());
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('download_select_category')
            .setPlaceholder('Choose a game or tool category')
            .addOptions(
                categories.slice(0, 25).map(cat => ({
                    label: cat,
                    description: `${downloadCatalog.get(cat).length} product(s) available`,
                    value: cat,
                    emoji: '📁'
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return await message.channel.send({ embeds: [panelEmbed], components: [row] });
    }

    if (command === 'spawn-download-admin') {
        if (!isAdmin) return message.reply('❌ Admin permission required.');
        await message.delete().catch(() => {});

        const adminEmbed = buildAdminCatalogEmbed();

        const adminRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('dl_admin_open_add')
                .setLabel('Add Product')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('dl_admin_open_edit')
                .setLabel('Edit Product Link')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId('dl_admin_open_remove')
                .setLabel('Remove Product/Group')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('dl_admin_refresh_view')
                .setLabel('Refresh List')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄')
        );

        return await message.channel.send({ embeds: [adminEmbed], components: [adminRow] });
    }
});

// =============================================================
// INTERACTION HANDLERS (MODALS, BUTTONS, WORKFLOWS)
// =============================================================
client.on('interactionCreate', async (interaction) => {
    try {
        const isAdmin = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator) ||
                        CONFIG.ADMIN_ROLE_IDS.some(id => interaction.member?.roles?.cache?.has(id) || interaction.member?.id === id);

        // 1. WELCOME MESSAGE EDITOR MODAL & TEST TRIGGER
        if (interaction.isButton() && interaction.customId === 'btn_open_welcome_editor') {
            if (!isAdmin) return interaction.reply({ content: '❌ Administrator access required.', ephemeral: true });

            const modal = new ModalBuilder()
                .setCustomId('modal_welcome_edit')
                .setTitle('Edit Automated Welcome DM');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('w_title')
                        .setLabel('Header Title')
                        .setValue(WELCOME_CONFIG.title)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('w_body')
                        .setLabel('Message Copy & Codes')
                        .setValue(WELCOME_CONFIG.body)
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('w_banner')
                        .setLabel('Hero Image Banner URL')
                        .setValue(WELCOME_CONFIG.bannerUrl)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('w_store')
                        .setLabel('Store Button URL')
                        .setValue(WELCOME_CONFIG.storeUrl)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );

            return await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_welcome_edit') {
            WELCOME_CONFIG.title = interaction.fields.getTextInputValue('w_title').trim();
            WELCOME_CONFIG.body = interaction.fields.getTextInputValue('w_body').trim();
            WELCOME_CONFIG.bannerUrl = interaction.fields.getTextInputValue('w_banner')?.trim() || CONFIG.PERMANENT_BANNER_URL;
            WELCOME_CONFIG.storeUrl = interaction.fields.getTextInputValue('w_store')?.trim() || CONFIG.DEFAULT_STORE_URL;

            return await interaction.reply({ 
                content: '✅ Automated Welcome DM successfully updated! Any new members joining will immediately receive this updated copy.', 
                ephemeral: true 
            });
        }

        if (interaction.isButton() && interaction.customId === 'btn_preview_welcome') {
            const sent = await dispatchWelcomeMessage(interaction.member);
            if (sent) {
                return await interaction.reply({ content: '✅ Dispatched test DM to your inbox!', ephemeral: true });
            } else {
                return await interaction.reply({ content: '❌ Failed to DM you. Ensure your Discord privacy settings allow direct messages from server members.', ephemeral: true });
            }
        }

        // 2. ANNOUNCEMENT DISPATCHER
        if (interaction.isButton() && interaction.customId === 'news_start_draft') {
            const modal = new ModalBuilder()
                .setCustomId('modal_news_draft')
                .setTitle('Create Server Announcement');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_title')
                        .setLabel('Title / Headline')
                        .setPlaceholder('e.g. ⚡ COD: WARZONE / BO6 RESTOCK')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_body')
                        .setLabel('Announcement Text')
                        .setPlaceholder('Enter description, changelog, discount codes...')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_image_url')
                        .setLabel('Custom Image / Banner URL (Optional)')
                        .setPlaceholder('Paste uploaded image link (CDN URL) or leave empty')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_product_url')
                        .setLabel('Direct Product URL (Optional)')
                        .setPlaceholder('https://gmh-shop.com/... (Leaves out button if blank)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('news_ping')
                        .setLabel('Ping (@everyone / @here / none)')
                        .setPlaceholder('everyone, here, or leave empty')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );

            return await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_news_draft') {
            await interaction.deferReply({ ephemeral: true });

            const title = interaction.fields.getTextInputValue('news_title');
            const body = interaction.fields.getTextInputValue('news_body');
            const imageUrl = interaction.fields.getTextInputValue('news_image_url')?.trim();
            const productUrl = interaction.fields.getTextInputValue('news_product_url')?.trim();
            const rawPing = interaction.fields.getTextInputValue('news_ping')?.toLowerCase().trim();

            let pingText = '';
            if (rawPing === 'everyone' || rawPing === '@everyone') pingText = '@everyone';
            else if (rawPing === 'here' || rawPing === '@here') pingText = '@here';

            const previewEmbed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(body)
                .setColor(0x00E5FF);

            if (imageUrl && imageUrl.startsWith('http')) {
                previewEmbed.setImage(imageUrl);
            }

            const linkRow = new ActionRowBuilder();
            if (productUrl && productUrl.startsWith('http')) {
                linkRow.addComponents(
                    new ButtonBuilder().setLabel('View Product').setStyle(ButtonStyle.Link).setURL(productUrl).setEmoji('🔥')
                );
            }
            linkRow.addComponents(
                new ButtonBuilder().setLabel('Store').setStyle(ButtonStyle.Link).setURL(CONFIG.DEFAULT_STORE_URL).setEmoji('🛒'),
                new ButtonBuilder().setLabel('Open Ticket').setStyle(ButtonStyle.Link).setURL(CONFIG.TICKET_CHANNEL_LINK).setEmoji('🎟️')
            );

            const controlRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('news_dispatch').setLabel('🚀 Post to Announcements').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('news_cancel').setLabel('Discard').setStyle(ButtonStyle.Danger)
            );

            const previewMsg = await interaction.channel.send({
                content: `**[PREVIEW]** ${pingText ? `(Ping: \`${pingText}\`)` : '(No ping)'}`,
                embeds: [previewEmbed],
                components: [linkRow, controlRow]
            });

            draftAnnouncements.set(previewMsg.id, {
                title,
                body,
                pingText,
                imageUrl: (imageUrl && imageUrl.startsWith('http')) ? imageUrl : null,
                productUrl: (productUrl && productUrl.startsWith('http')) ? productUrl : null
            });

            return await interaction.editReply({ content: '✅ Preview generated below. Confirm and click **Post to Announcements**.' });
        }

        if (interaction.isButton() && interaction.customId === 'news_dispatch') {
            const draft = draftAnnouncements.get(interaction.message.id);
            if (!draft) return await interaction.reply({ content: '❌ Draft session expired.', ephemeral: true });

            const newsChannel = interaction.guild.channels.cache.get(CONFIG.NEWS_CHANNEL_ID) || 
                                await interaction.guild.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);

            if (!newsChannel) {
                return await interaction.reply({ content: '❌ Announcements channel not found.', ephemeral: true });
            }

            const finalEmbed = new EmbedBuilder()
                .setTitle(draft.title)
                .setDescription(draft.body)
                .setColor(0x00E5FF)
                .setTimestamp();

            if (draft.imageUrl) {
                finalEmbed.setImage(draft.imageUrl);
            }

            const linkRow = new ActionRowBuilder();
            if (draft.productUrl) {
                linkRow.addComponents(
                    new ButtonBuilder().setLabel('View Product').setStyle(ButtonStyle.Link).setURL(draft.productUrl).setEmoji('🔥')
                );
            }
            linkRow.addComponents(
                new ButtonBuilder().setLabel('Store').setStyle(ButtonStyle.Link).setURL(CONFIG.DEFAULT_STORE_URL).setEmoji('🛒'),
                new ButtonBuilder().setLabel('Open Ticket').setStyle(ButtonStyle.Link).setURL(CONFIG.TICKET_CHANNEL_LINK).setEmoji('🎟️')
            );

            await newsChannel.send({
                content: draft.pingText ? draft.pingText : undefined,
                embeds: [finalEmbed],
                components: [linkRow]
            });

            draftAnnouncements.delete(interaction.message.id);
            await interaction.message.delete().catch(() => {});

            return await interaction.reply({ content: `🚀 Dispatched directly to ${newsChannel}!`, ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId === 'news_cancel') {
            draftAnnouncements.delete(interaction.message.id);
            await interaction.message.delete().catch(() => {});
            return await interaction.reply({ content: '🗑️ Draft discarded.', ephemeral: true });
        }

        // 3. STAFF RECRUITMENT CREATION & CONTROLS
        if (interaction.isButton() && interaction.customId === 'btn_open_app') {
            await interaction.deferReply({ ephemeral: true });

            const guild = interaction.guild;
            const user = interaction.user;
            const channelName = `apply-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;

            const appChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: CONFIG.APP_CATEGORY_ID || null,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
                ]
            });

            if (guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                await appChannel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
            }
            for (const adminId of CONFIG.ADMIN_ROLE_IDS) {
                if (guild.roles.cache.has(adminId)) {
                    await appChannel.permissionOverwrites.edit(adminId, { ViewChannel: true, SendMessages: true });
                }
            }

            const questionsText = APP_QUESTIONS.map(q => `${q.question}`).join('\n\n');
            const appEmbed = new EmbedBuilder()
                .setTitle(`Staff Application • ${user.tag}`)
                .setDescription(`Welcome ${user}! Please answer all questions below in this channel.\n\n${questionsText}`)
                .setColor(0x00E5FF)
                .setImage(CONFIG.PERMANENT_BANNER_URL)
                .setFooter({ text: 'Answer each question thoroughly.' });

            const reviewRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`app_accept_${user.id}`).setLabel('Accept (Trial Staff)').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId(`app_deny_${user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('❌'),
                new ButtonBuilder().setCustomId('app_delete').setLabel('Delete Channel').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
            );

            await appChannel.send({ embeds: [appEmbed], components: [reviewRow] });
            return await interaction.editReply({ content: `✅ Application channel opened: ${appChannel}` });
        }

        if (interaction.isButton() && interaction.customId.startsWith('app_')) {
            if (!isAdmin) {
                return await interaction.reply({ content: '❌ Only Administrators can review applications.', ephemeral: true });
            }

            if (interaction.customId.startsWith('app_accept_')) {
                const targetUserId = interaction.customId.replace('app_accept_', '');
                const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

                if (member && interaction.guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                    await member.roles.add(CONFIG.TRIAL_STAFF_ROLE_ID);
                    await member.send(`🎉 Your staff application for **${interaction.guild.name}** was approved! You received the **Trial Staff** role.`).catch(() => {});
                }

                await interaction.reply({ content: `✅ **Accepted.** Assigned Trial Staff to <@${targetUserId}>. Closing channel in 10s...` });
                return setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
            }

            if (interaction.customId.startsWith('app_deny_')) {
                const targetUserId = interaction.customId.replace('app_deny_', '');
                const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

                if (member) {
                    await member.send(`Hello. We appreciate your application for **${interaction.guild.name}**, but management has decided not to proceed at this time.`).catch(() => {});
                }

                await interaction.reply({ content: `❌ **Denied.** Candidate notified. Closing channel in 5s...` });
                return setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }

            if (interaction.customId === 'app_delete') {
                await interaction.reply({ content: '🗑️ Deleting channel...' });
                return setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
            }
        }

        // 4. DOWNLOAD PANEL & ADMIN MANAGEMENT CONTROLS
        if (interaction.isButton()) {
            if (interaction.customId === 'dl_admin_refresh_view') {
                if (!isAdmin) return await interaction.reply({ content: '❌ Admin required.', ephemeral: true });
                return await interaction.update({ embeds: [buildAdminCatalogEmbed()] });
            }

            // MULTI-CATEGORY ADD TRIGGER
            if (interaction.customId === 'dl_admin_open_add') {
                if (!isAdmin) {
                    return await interaction.reply({ content: '❌ Access Denied: Admin permission required.', ephemeral: true });
                }

                const existingCategories = Array.from(downloadCatalog.keys());
                const selectOptions = [
                    {
                        label: '➕ Create Brand New Category',
                        description: 'Add an entirely new category to the catalog',
                        value: '__NEW_CATEGORY__',
                        emoji: '✨'
                    },
                    ...existingCategories.slice(0, 24).map(cat => ({
                        label: `Add inside: ${cat}`.slice(0, 100),
                        description: `Currently has ${downloadCatalog.get(cat).length} product(s)`.slice(0, 100),
                        value: cat,
                        emoji: '📁'
                    }))
                ];

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('dl_admin_choose_add_category')
                    .setPlaceholder('Select one or more categories for this tool')
                    .setMinValues(1)
                    .setMaxValues(Math.min(selectOptions.length, 10))
                    .addOptions(selectOptions);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                return await interaction.reply({
                    content: 'Select the categories you want to link this tool to (select multiple to assign at once):',
                    components: [row],
                    ephemeral: true
                });
            }

            if (interaction.customId === 'dl_admin_open_edit') {
                if (!isAdmin) {
                    return await interaction.reply({ content: '❌ Access Denied: Admin permission required.', ephemeral: true });
                }

                const categories = Array.from(downloadCatalog.keys());
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('dl_admin_edit_choose_category')
                    .setPlaceholder('Step 1: Choose category of tool to edit')
                    .addOptions(
                        categories.slice(0, 25).map(cat => ({
                            label: cat,
                            description: `${downloadCatalog.get(cat).length} product(s)`,
                            value: cat,
                            emoji: '📁'
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);

                return await interaction.reply({
                    content: 'Select the category containing the tool you want to edit:',
                    components: [row],
                    ephemeral: true
                });
            }

            if (interaction.customId === 'dl_admin_open_remove') {
                if (!isAdmin) {
                    return await interaction.reply({ content: '❌ Access Denied: Admin permission required.', ephemeral: true });
                }

                const categories = Array.from(downloadCatalog.keys());
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('dl_admin_remove_choose_category')
                    .setPlaceholder('Select category to manage deletion')
                    .addOptions(
                        categories.slice(0, 25).map(cat => ({
                            label: cat,
                            description: `${downloadCatalog.get(cat).length} product(s) inside`,
                            value: cat,
                            emoji: '📁'
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);

                return await interaction.reply({
                    content: 'Choose a category to remove entirely or pick a tool from:',
                    components: [row],
                    ephemeral: true
                });
            }
        }

        if (interaction.isStringSelectMenu()) {
            // MULTI-CATEGORY ADD MODAL LAUNCHER
            if (interaction.customId === 'dl_admin_choose_add_category') {
                if (!isAdmin) return await interaction.reply({ content: '❌ Admin required.', ephemeral: true });

                const selected = interaction.values;
                const isNew = selected.includes('__NEW_CATEGORY__');

                if (isNew && selected.length > 1) {
                    return await interaction.reply({
                        content: '⚠️ When creating a brand new category, please select only the `Create Brand New Category` option.',
                        ephemeral: true
                    });
                }

                pendingMultiAdd.set(interaction.user.id, selected);

                const modal = new ModalBuilder()
                    .setCustomId('modal_dl_add_product_MULTI')
                    .setTitle(isNew ? 'Create New Category & Tool' : `Add Tool (${selected.length} Categories)`.slice(0, 45));

                if (isNew) {
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('dl_new_cat_name')
                                .setLabel('New Category Name (e.g. THE FINALS)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );
                }

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('dl_name')
                            .setLabel('Tool Name (e.g. Ancient Loader)')
                            .setPlaceholder('e.g. Ancient Multi-Game Suite')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('dl_desc')
                            .setLabel('Short Description')
                            .setPlaceholder('Universal loader for selected games')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('dl_url')
                            .setLabel('Download URL / Message Link')
                            .setPlaceholder('https://...')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );

                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'dl_admin_remove_choose_category') {
                if (!isAdmin) return await interaction.reply({ content: '❌ Admin required.', ephemeral: true });

                const category = interaction.values[0];
                const prods = downloadCatalog.get(category) || [];

                const options = [
                    {
                        label: `📁 Remove Entire Group: ${category}`.slice(0, 100),
                        description: `Deletes all ${prods.length} product(s) in this category`,
                        value: `DEL_GROUP:::${category}`,
                        emoji: '🗂️'
                    },
                    ...prods.slice(0, 24).map(p => ({
                        label: p.name.slice(0, 100),
                        description: `Delete single item`.slice(0, 100),
                        value: `DEL_TOOL:::${category}:::${p.name}`,
                        emoji: '🗑️'
                    }))
                ];

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('dl_admin_select_delete')
                    .setPlaceholder(`Delete options for ${category}`)
                    .addOptions(options);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                return await interaction.update({
                    content: `Manage removals inside **${category}**:`,
                    components: [row]
                });
            }

            if (interaction.customId === 'dl_admin_select_delete') {
                if (!isAdmin) {
                    return await interaction.reply({ content: '❌ Access Denied: Admin permission required.', ephemeral: true });
                }

                const payload = interaction.values[0];

                if (payload.startsWith('DEL_GROUP:::')) {
                    const category = payload.replace('DEL_GROUP:::', '');

                    if (!downloadCatalog.has(category)) {
                        return await interaction.update({ content: `❌ Group **${category}** does not exist.`, components: [] });
                    }

                    downloadCatalog.delete(category);
                    return await interaction.update({
                        content: `🗑️ Successfully deleted entire group **${category}** and all its products!`,
                        components: []
                    });
                }

                if (payload.startsWith('DEL_TOOL:::')) {
                    const [, category, productName] = payload.split(':::');

                    if (!downloadCatalog.has(category)) {
                        return await interaction.update({ content: `❌ Group **${category}** no longer exists.`, components: [] });
                    }

                    const products = downloadCatalog.get(category);
                    const index = products.findIndex(p => p.name === productName);

                    if (index === -1) {
                        return await interaction.update({ content: `❌ Tool **${productName}** not found in group **${category}**.`, components: [] });
                    }

                    products.splice(index, 1);
                    if (products.length === 0) {
                        downloadCatalog.delete(category);
                    }

                    return await interaction.update({
                        content: `🗑️ Successfully removed **${productName}** from **${category}**!`,
                        components: []
                    });
                }
            }

            if (interaction.customId === 'dl_admin_edit_choose_category') {
                if (!isAdmin) return await interaction.reply({ content: '❌ Admin required.', ephemeral: true });

                const category = interaction.values[0];
                const prods = downloadCatalog.get(category) || [];

                if (prods.length === 0) {
                    return await interaction.update({ content: `⚠️ No products found in ${category}.`, components: [] });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`dl_admin_edit_choose_tool_${encodeURIComponent(category)}`)
                    .setPlaceholder('Step 2: Choose exact tool to edit')
                    .addOptions(
                        prods.slice(0, 25).map(p => ({
                            label: p.name.slice(0, 100),
                            description: p.description.slice(0, 50),
                            value: p.name,
                            emoji: '✏️'
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);
                return await interaction.update({
                    content: `Category **${category}** selected. Choose tool to update:`,
                    components: [row]
                });
            }

            if (interaction.customId.startsWith('dl_admin_edit_choose_tool_')) {
                if (!isAdmin) return await interaction.reply({ content: '❌ Admin required.', ephemeral: true });

                const category = decodeURIComponent(interaction.customId.replace('dl_admin_edit_choose_tool_', ''));
                const productName = interaction.values[0];
                const products = downloadCatalog.get(category) || [];
                const product = products.find(p => p.name === productName);

                if (!product) {
                    return await interaction.reply({ content: '❌ Product not found.', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`modal_dl_edit_save_${encodeURIComponent(category)}:::${encodeURIComponent(product.name)}`)
                    .setTitle(`Edit ${product.name.slice(0, 25)}`);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('edit_name')
                            .setLabel('Product Name')
                            .setValue(product.name)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('edit_desc')
                            .setLabel('Short Description')
                            .setValue(product.description)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('edit_url')
                            .setLabel('Download URL / Discord Message Link')
                            .setValue(product.url)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );

                return await interaction.showModal(modal);
            }

            // Customer Download Interaction
            if (interaction.customId === 'download_select_category') {
                const selectedCategory = interaction.values[0];
                const products = downloadCatalog.get(selectedCategory) || [];

                const productMenu = new StringSelectMenuBuilder()
                    .setCustomId(`download_select_product_${selectedCategory}`)
                    .setPlaceholder(`Choose a product in ${selectedCategory}`)
                    .addOptions(
                        products.slice(0, 25).map(prod => ({
                            label: prod.name.slice(0, 100),
                            description: prod.description.slice(0, 50),
                            value: prod.name,
                            emoji: '🚀'
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(productMenu);
                return await interaction.update({ components: [interaction.message.components[0], row] });
            }

            if (interaction.customId.startsWith('download_select_product_')) {
                const category = interaction.customId.replace('download_select_product_', '');
                const productName = interaction.values[0];
                const products = downloadCatalog.get(category) || [];
                const product = products.find(p => p.name === productName);

                if (!product) {
                    return await interaction.reply({ content: '❌ Product not found.', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                const productEmbed = new EmbedBuilder()
                    .setTitle(product.name)
                    .setDescription(`Your download is ready below.\n\n📂 **File:** \`${product.name}\`\n📁 **Category:** \`${category}\`\n👤 **User:** ${interaction.user}`)
                    .setColor(0x00E5FF)
                    .setTimestamp();

                const discordMsgMatch = product.url.match(/channels\/(\d+)\/(\d+)\/(\d+)/);

                if (discordMsgMatch) {
                    const [, , channelId, messageId] = discordMsgMatch;
                    try {
                        const targetChan = await interaction.client.channels.fetch(channelId).catch(() => null);
                        const targetMsg = targetChan ? await targetChan.messages.fetch(messageId).catch(() => null) : null;
                        const attachment = targetMsg?.attachments?.first();

                        if (attachment) {
                            return await interaction.editReply({
                                embeds: [productEmbed],
                                files: [attachment.url]
                            });
                        }
                    } catch (err) {
                        console.error('Failed to resolve attachment message link:', err);
                    }
                }

                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Download')
                        .setStyle(ButtonStyle.Link)
                        .setURL(product.url)
                        .setEmoji('📥')
                );

                return await interaction.editReply({ embeds: [productEmbed], components: [actionRow] });
            }
        }

        // 5. TICKET MODALS & CONTROLS
        if (interaction.isButton()) {
            if (interaction.customId === 'ticket_general') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_general').setTitle('🛠️ Technical Assistance');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('general_tool').setLabel('Which software/game is having issues?').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('general_sys').setLabel('Windows Build & Antivirus Status').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('general_reason').setLabel('Explain the issue or error code').setStyle(TextInputStyle.Paragraph).setRequired(true)
                    )
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'ticket_purchase') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_purchase').setTitle('🛒 Purchase & Invoicing');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('purchase_item').setLabel('Product & Duration').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('purchase_method').setLabel('Payment Method').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('purchase_orderid').setLabel('Order/TX ID (If already paid)').setStyle(TextInputStyle.Short).setRequired(false)
                    )
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'ticket_resell') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_resell').setTitle('🤝 Reseller Application');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('resell_products').setLabel('Which tools are you looking to stock?').setStyle(TextInputStyle.Paragraph).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('resell_platform').setLabel('Storefront or Server Link').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('resell_volume').setLabel('Estimated Weekly Sales Volume').setStyle(TextInputStyle.Short).setRequired(false)
                    )
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'ticket_hwid') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_hwid').setTitle('🔄 HWID Reset Request');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('hwid_product').setLabel('Tool Name').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('hwid_key').setLabel('Active License Key').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('hwid_reason').setLabel('Reason for Hardware Change').setStyle(TextInputStyle.Paragraph).setRequired(true)
                    )
                );
                return await interaction.showModal(modal);
            }

            // Controls
            const channel = interaction.channel;
            const member = interaction.member;

            const isFullStaff = member?.roles?.cache?.has(CONFIG.STAFF_ROLE_ID);
            const isTrialStaff = member?.roles?.cache?.has(CONFIG.TRIAL_STAFF_ROLE_ID);

            if (interaction.customId === 'claim_ticket') {
                if (!isFullStaff && !isTrialStaff && !isAdmin) {
                    return await interaction.reply({ content: '❌ Only staff can claim tickets.', ephemeral: true });
                }

                const ticketData = activeTickets.get(channel.id);
                if (ticketData?.claimedBy) {
                    return await interaction.reply({ content: `⚠️ Already claimed by <@${ticketData.claimedBy}>.`, ephemeral: true });
                }

                if (isTrialStaff && !isFullStaff && !isAdmin) {
                    await channel.permissionOverwrites.edit(member.id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AttachFiles: true
                    });
                    activeTickets.set(channel.id, { ...ticketData, claimedBy: member.id, isTrial: true });

                    const claimEmbed = new EmbedBuilder()
                        .setDescription(`🙋 **${member.user.tag}** (Trial Staff) has claimed this ticket.\nSenior staff can still view and participate.`)
                        .setColor(0x5865F2);

                    await interaction.update({ components: [buildTicketControlRow(true)] });
                    return await channel.send({ embeds: [claimEmbed] });
                }

                await channel.permissionOverwrites.edit(member.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });

                if (interaction.guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: false });
                }
                if (interaction.guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.TRIAL_STAFF_ROLE_ID, { ViewChannel: false });
                }

                for (const adminId of CONFIG.ADMIN_ROLE_IDS) {
                    if (interaction.guild.roles.cache.has(adminId)) {
                        await channel.permissionOverwrites.edit(adminId, { ViewChannel: true, SendMessages: true });
                    }
                }

                activeTickets.set(channel.id, { ...ticketData, claimedBy: member.id, isTrial: false });

                const claimEmbed = new EmbedBuilder()
                    .setDescription(`🔒 **${member.user.tag}** has claimed this ticket.\nChannel visibility has been locked exclusively to this staff member and admins.`)
                    .setColor(0x2ECC71);

                await interaction.update({ components: [buildTicketControlRow(true)] });
                return await channel.send({ embeds: [claimEmbed] });
            }

            if (interaction.customId === 'unclaim_ticket') {
                const ticketData = activeTickets.get(channel.id);
                if (!ticketData?.claimedBy) return await interaction.reply({ content: '⚠️ Ticket is not claimed.', ephemeral: true });

                if (ticketData.claimedBy !== member.id && !isAdmin) {
                    return await interaction.reply({ content: '❌ Only the assigned staff member or an Admin can unclaim.', ephemeral: true });
                }

                if (interaction.guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
                }
                if (interaction.guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                    await channel.permissionOverwrites.edit(CONFIG.TRIAL_STAFF_ROLE_ID, { ViewChannel: true, SendMessages: true });
                }

                await channel.permissionOverwrites.delete(ticketData.claimedBy).catch(() => {});
                activeTickets.set(channel.id, { ...ticketData, claimedBy: null, isTrial: false });

                const unclaimEmbed = new EmbedBuilder()
                    .setDescription(`🔄 Ticket unclaimed by **${member.user.tag}**.\nTicket is re-opened for all staff members.`)
                    .setColor(0xF1C40F);

                await interaction.update({ components: [buildTicketControlRow(false)] });
                return await channel.send({ embeds: [unclaimEmbed] });
            }

            if (interaction.customId === 'close_ticket') {
                await interaction.reply('📁 Generating transcript and closing ticket...');

                const ticketData = activeTickets.get(channel.id);
                let ownerId = ticketData?.ticketOwnerId;
                if (!ownerId && channel.topic) {
                    const match = channel.topic.match(/^([0-9]+)\|Support/);
                    if (match) ownerId = match[1];
                }

                try {
                    let transcriptFile;
                    if (discordTranscripts) {
                        transcriptFile = await discordTranscripts.createTranscript(channel, {
                            limit: -1,
                            fileName: `transcript-${channel.name}.html`,
                            saveImages: true,
                            poweredBy: false
                        });
                    } else {
                        const fetchedMessages = await channel.messages.fetch({ limit: 100 });
                        const logLines = fetchedMessages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.cleanContent}`).join('\n');
                        transcriptFile = new AttachmentBuilder(Buffer.from(logLines, 'utf-8'), { name: `transcript-${channel.name}.txt` });
                    }

                    const closeSummaryEmbed = new EmbedBuilder()
                        .setTitle('🔒 Ticket Closed')
                        .addFields(
                            { name: 'Channel', value: `\`#${channel.name}\``, inline: true },
                            { name: 'Closed By', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                            { name: 'Ticket Owner', value: ownerId ? `<@${ownerId}>` : 'Unknown', inline: true }
                        )
                        .setColor(0xE74C3C)
                        .setTimestamp();

                    const logChannel = interaction.guild.channels.cache.get(CONFIG.TRANSCRIPT_LOG_CHANNEL_ID) || 
                                       await interaction.guild.channels.fetch(CONFIG.TRANSCRIPT_LOG_CHANNEL_ID).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({ embeds: [closeSummaryEmbed], files: [transcriptFile] });
                    }

                    if (ownerId) {
                        const owner = await client.users.fetch(ownerId).catch(() => null);
                        if (owner) {
                            const dmEmbed = new EmbedBuilder()
                                .setTitle(`📄 Support Transcript • ${interaction.guild.name}`)
                                .setDescription(`Your ticket \`#${channel.name}\` has been closed.\nAn archival copy of your chat history is attached.`)
                                .setColor(0x00E5FF)
                                .setTimestamp();

                            await owner.send({ embeds: [dmEmbed], files: [transcriptFile] }).catch(() => {});
                        }
                    }

                    await channel.send('✅ Transcript saved. Deleting channel in 5 seconds...');
                    activeTickets.delete(channel.id);
                    return setTimeout(() => channel.delete().catch(() => {}), 5000);
                } catch (err) {
                    console.error('Transcript error:', err);
                    await channel.send('❌ Error creating transcript. Deleting channel in 5s...');
                    return setTimeout(() => channel.delete().catch(() => {}), 5000);
                }
            }
        }

        // 6. MODAL SUBMISSIONS (DOWNLOADS & TICKETS)
        if (interaction.isModalSubmit()) {
            const guild = interaction.guild;
            const user = interaction.user;

            // SAVE EDITED PRODUCT
            if (interaction.customId.startsWith('modal_dl_edit_save_')) {
                if (!isAdmin) return await interaction.reply({ content: '❌ Admin required.', ephemeral: true });

                const raw = interaction.customId.replace('modal_dl_edit_save_', '');
                const [encCat, encOldName] = raw.split(':::');
                const category = decodeURIComponent(encCat);
                const oldName = decodeURIComponent(encOldName);

                const newName = interaction.fields.getTextInputValue('edit_name').trim();
                const newDesc = interaction.fields.getTextInputValue('edit_desc').trim();
                const newUrl = interaction.fields.getTextInputValue('edit_url').trim();

                const products = downloadCatalog.get(category);
                if (!products) {
                    return await interaction.reply({ content: `❌ Category **${category}** no longer exists.`, ephemeral: true });
                }

                const product = products.find(p => p.name === oldName);
                if (!product) {
                    return await interaction.reply({ content: `❌ Product **${oldName}** not found.`, ephemeral: true });
                }

                product.name = newName;
                product.description = newDesc;
                product.url = newUrl;

                return await interaction.reply({
                    content: `✅ Successfully updated **${newName}** under **${category}**!`,
                    ephemeral: true
                });
            }

            // MULTI-CATEGORY PRODUCT ADDITION HANDLER
            if (interaction.customId === 'modal_dl_add_product_MULTI') {
                if (!isAdmin) {
                    return await interaction.reply({ content: '❌ Access Denied: Admin permission required.', ephemeral: true });
                }

                let targetCategories = pendingMultiAdd.get(interaction.user.id) || [];
                pendingMultiAdd.delete(interaction.user.id);

                if (targetCategories.includes('__NEW_CATEGORY__')) {
                    const newCat = interaction.fields.getTextInputValue('dl_new_cat_name').toUpperCase().trim();
                    if (!newCat) {
                        return await interaction.reply({ content: '❌ Category name cannot be empty.', ephemeral: true });
                    }
                    targetCategories = [newCat];
                }

                if (targetCategories.length === 0) {
                    return await interaction.reply({ content: '❌ Session expired. Please try selecting categories again.', ephemeral: true });
                }

                const name = interaction.fields.getTextInputValue('dl_name').trim();
                const description = interaction.fields.getTextInputValue('dl_desc').trim();
                const url = interaction.fields.getTextInputValue('dl_url').trim();

                for (const cat of targetCategories) {
                    if (!downloadCatalog.has(cat)) {
                        downloadCatalog.set(cat, []);
                    }

                    const categoryProducts = downloadCatalog.get(cat);
                    const existingIndex = categoryProducts.findIndex(p => p.name.toLowerCase() === name.toLowerCase());

                    if (existingIndex !== -1) {
                        categoryProducts[existingIndex] = { name, description, url };
                    } else {
                        categoryProducts.push({ name, description, url });
                    }
                }

                return await interaction.reply({ 
                    content: `✅ Successfully linked **${name}** to **${targetCategories.length}** category/categories:\n\`${targetCategories.join(', ')}\``, 
                    ephemeral: true 
                });
            }

            let ticketType = 'Support';
            let channelPrefix = 'ticket';
            let embedColor = 0x00E5FF;
            const fields = [];

            if (interaction.customId === 'modal_ticket_general') {
                ticketType = 'Technical Support';
                channelPrefix = 'tech';
                embedColor = 0x5865F2;
                fields.push(
                    { name: 'Software', value: interaction.fields.getTextInputValue('general_tool') || 'N/A', inline: true },
                    { name: 'OS & Defender', value: interaction.fields.getTextInputValue('general_sys') || 'N/A', inline: true },
                    { name: 'Issue Details', value: interaction.fields.getTextInputValue('general_reason') || 'N/A' }
                );
            } else if (interaction.customId === 'modal_ticket_purchase') {
                ticketType = 'Purchase Order';
                channelPrefix = 'buy';
                embedColor = 0x2ECC71;
                fields.push(
                    { name: 'Product', value: interaction.fields.getTextInputValue('purchase_item') || 'N/A', inline: true },
                    { name: 'Payment Method', value: interaction.fields.getTextInputValue('purchase_method') || 'N/A', inline: true },
                    { name: 'Order/TX ID', value: interaction.fields.getTextInputValue('purchase_orderid') || 'Not Provided' }
                );
            } else if (interaction.customId === 'modal_ticket_resell') {
                ticketType = 'Reseller Inquiry';
                channelPrefix = 'resell';
                embedColor = 0x95A5A6;
                fields.push(
                    { name: 'Products', value: interaction.fields.getTextInputValue('resell_products') || 'N/A' },
                    { name: 'Store Link', value: interaction.fields.getTextInputValue('resell_platform') || 'N/A', inline: true },
                    { name: 'Est. Volume', value: interaction.fields.getTextInputValue('resell_volume') || 'N/A', inline: true }
                );
            } else if (interaction.customId === 'modal_ticket_hwid') {
                ticketType = 'HWID Reset';
                channelPrefix = 'hwid';
                embedColor = 0xE74C3C;
                fields.push(
                    { name: 'Software', value: interaction.fields.getTextInputValue('hwid_product') || 'N/A', inline: true },
                    { name: 'License Key', value: `\`\`\`${interaction.fields.getTextInputValue('hwid_key') || 'N/A'}\`\`\`` },
                    { name: 'Reason', value: interaction.fields.getTextInputValue('hwid_reason') || 'N/A' }
                );
            }

            if (['modal_ticket_general', 'modal_ticket_purchase', 'modal_ticket_resell', 'modal_ticket_hwid'].includes(interaction.customId)) {
                await interaction.deferReply({ ephemeral: true });

                const sanitizedName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
                const channelName = `${channelPrefix}-${sanitizedName}`;

                let targetCategory = null;
                if (CONFIG.TICKET_CATEGORY_ID) {
                    targetCategory = guild.channels.cache.get(CONFIG.TICKET_CATEGORY_ID) || await guild.channels.fetch(CONFIG.TICKET_CATEGORY_ID).catch(() => null);
                }

                const permissionOverwrites = [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
                ];

                if (guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                    permissionOverwrites.push({ id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
                }
                if (guild.roles.cache.has(CONFIG.TRIAL_STAFF_ROLE_ID)) {
                    permissionOverwrites.push({ id: CONFIG.TRIAL_STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
                }
                for (const adminId of CONFIG.ADMIN_ROLE_IDS) {
                    if (guild.roles.cache.has(adminId)) {
                        permissionOverwrites.push({ id: adminId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
                    }
                }

                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: targetCategory && targetCategory.type === ChannelType.GuildCategory ? targetCategory.id : null,
                    topic: `${user.id}|Support`,
                    permissionOverwrites
                });

                activeTickets.set(ticketChannel.id, { claimedBy: null, ticketOwnerId: user.id, type: ticketType });

                const supportHeaderEmbed = new EmbedBuilder()
                    .setTitle('Ticket Support')
                    .setDescription(`Welcome to your ticket, ${user}!\nHow can we help you today?\n\n\`Channel ID: ${ticketChannel.id}\``)
                    .setColor(0x5865F2);

                const infoEmbed = new EmbedBuilder()
                    .setTitle('📝 Additional Information')
                    .setDescription(`Form answers submitted by **${user.tag}**.`)
                    .setColor(embedColor)
                    .addFields(fields)
                    .setFooter({ text: 'GameMarket Hub • Ticket System' })
                    .setTimestamp();

                await ticketChannel.send({
                    content: `${user} <@&${CONFIG.STAFF_ROLE_ID}>`,
                    embeds: [supportHeaderEmbed],
                    components: [buildTicketControlRow(false)]
                });

                await ticketChannel.send({ embeds: [infoEmbed] });

                return await interaction.editReply({ content: `✅ Your ticket has been opened: ${ticketChannel}` });
            }
        }
    } catch (err) {
        console.error('Interaction error caught:', err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred processing this action.', ephemeral: true }).catch(() => {});
        }
    }
});

client.login(CONFIG.TOKEN);
